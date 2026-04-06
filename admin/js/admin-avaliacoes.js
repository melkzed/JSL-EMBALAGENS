import { supabase, state, toast, esc, openModal, closeModal } from './admin-state.js'

export async function carregarAvaliacoes() {
    const filtro = document.getElementById('filtroAvaliacaoStatus')?.value ?? ''
    const tbody = document.getElementById('tbodyAvaliacoes')

    try {
        
        let query = supabase
            .from('reviews')
            .select('*')
            .order('created_at', { ascending: false })

        if (filtro !== '') query = query.eq('approved', filtro === 'true')

        const { data: reviews, error } = await query

        if (error) {
            console.error('Erro RLS/query avaliações:', error)
            tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Erro: ${error.message || 'Sem permissão. Execute fix_reviews_rls.sql no Supabase.'}</td></tr>`
            return
        }

        if (!reviews || reviews.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Nenhuma avaliação</td></tr>'
            return
        }

        
        const productIds = [...new Set(reviews.map(r => r.product_id).filter(Boolean))]
        const userIds = [...new Set(reviews.map(r => r.user_id).filter(Boolean))]

        const [prodRes, userRes] = await Promise.all([
            productIds.length ? supabase.from('products').select('id, name').in('id', productIds) : { data: [] },
            userIds.length ? supabase.from('profiles').select('id, full_name').in('id', userIds) : { data: [] }
        ])

        const prodMap = {}
        ;(prodRes.data || []).forEach(p => prodMap[p.id] = p.name)
        const userMap = {}
        ;(userRes.data || []).forEach(u => userMap[u.id] = u.full_name)

        tbody.innerHTML = reviews.map(r => {
        const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)
        const imgThumbs = (r.images && r.images.length > 0)
            ? `<div style="display:flex;gap:4px;margin-top:4px">${r.images.map(url => `<img src="${esc(url)}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb;cursor:pointer" onclick="window.open('${esc(url)}','_blank')">`).join('')}</div>`
            : ''
        return `<tr>
            <td>${esc(prodMap[r.product_id] || '—')}</td>
            <td>${esc(userMap[r.user_id] || '—')}</td>
            <td style="color:#f59e0b">${stars}</td>
            <td style="max-width:250px">${esc(r.comment || '—')}${imgThumbs}</td>
            <td>${r.admin_reply ? '<span class="admin-badge active">Respondida</span>' : '<span class="admin-badge pending">Sem resposta</span>'}</td>
            <td>
                <span class="admin-badge ${r.approved ? 'approved' : 'pending'}">${r.approved ? 'Aprovada' : 'Pendente'}</span>
                ${r.deleted_by_user ? '<span class="admin-badge" style="background:#ef4444;color:#fff;margin-left:4px">Apagada pelo usuário</span>' : ''}
            </td>
            <td>
                ${!r.approved ? `<button class="admin-btn small success" onclick="window.adminAprovarReview('${r.id}', true)"><i class="fa-solid fa-check"></i></button>` : `<button class="admin-btn small danger" onclick="window.adminAprovarReview('${r.id}', false)"><i class="fa-solid fa-xmark"></i></button>`}
                <button class="admin-btn small secondary" onclick="window.adminResponderReview('${r.id}')"><i class="fa-solid fa-reply"></i></button>
            </td>
        </tr>`
    }).join('')
    } catch (err) {
        console.error('Erro ao carregar avaliações (catch):', err)
        tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Erro: ${err.message}</td></tr>`
    }
}

export async function aprovarReview(reviewId, aprovar) {
    const { error } = await supabase.from('reviews').update({ approved: aprovar }).eq('id', reviewId)
    if (error) { toast('Erro: ' + error.message, 'erro'); return }
    toast(aprovar ? 'Avaliação aprovada!' : 'Avaliação desprovada!')
    carregarAvaliacoes()
}

export async function abrirResponderReview(reviewId) {
    const { data: review } = await supabase
        .from('reviews')
        .select('*')
        .eq('id', reviewId)
        .single()

    if (!review) return

    
    const [prodRes, userRes] = await Promise.all([
        review.product_id ? supabase.from('products').select('name').eq('id', review.product_id).single() : { data: null },
        review.user_id ? supabase.from('profiles').select('full_name').eq('id', review.user_id).single() : { data: null }
    ])

    document.getElementById('respostaReviewId').value = reviewId
    const reviewImgsHtml = (review.images && review.images.length > 0)
        ? `<div style="display:flex;gap:6px;margin-top:0.5rem">${review.images.map(url => `<img src="${esc(url)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;cursor:pointer" onclick="window.open('${esc(url)}','_blank')">`).join('')}</div>`
        : ''
    document.getElementById('respostaPreview').innerHTML = `
        <strong>${esc(userRes.data?.full_name || 'Anônimo')}</strong> sobre <strong>${esc(prodRes.data?.name || '')}</strong><br>
        <span style="color:#f59e0b">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span><br>
        <p style="margin-top:0.5rem">${esc(review.comment || 'Sem comentário')}</p>
        ${reviewImgsHtml}
    `
    document.getElementById('respostaTexto').value = review.admin_reply || ''

    openModal('modalResposta')
}

export async function enviarResposta(e) {
    e.preventDefault()
    const reviewId = document.getElementById('respostaReviewId').value
    const texto = document.getElementById('respostaTexto').value.trim()

    if (!texto) { toast('Digite uma resposta', 'erro'); return }

    const { error } = await supabase.from('reviews').update({
        admin_reply: texto,
        admin_reply_at: new Date().toISOString(),
        admin_reply_by: state.currentAdmin.userId
    }).eq('id', reviewId)

    if (error) { toast('Erro: ' + error.message, 'erro'); return }

    toast('Resposta enviada!')
    closeModal('modalResposta')
    carregarAvaliacoes()
}
