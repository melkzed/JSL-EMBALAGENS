import { supabase, state, toast, esc, formatDateTime, tipoMovLabel, openModal, closeModal } from './admin-state.js'

export async function carregarEstoque() {
    const busca = document.getElementById('filtroEstoqueBusca').value.trim()
    const filtro = document.getElementById('filtroEstoqueStatus').value

    let query = supabase
        .from('product_variants')
        .select('id, size_label, sku, stock, low_stock_threshold, products(id, name)')
        .order('stock', { ascending: true })

    const { data: variantes } = await query

    let lista = variantes || []

    if (busca) {
        const b = busca.toLowerCase()
        lista = lista.filter(v => v.products?.name?.toLowerCase().includes(b) || v.sku?.toLowerCase().includes(b))
    }
    if (filtro === 'low') lista = lista.filter(v => v.stock > 0 && v.stock <= v.low_stock_threshold)
    if (filtro === 'zero') lista = lista.filter(v => v.stock <= 0)

    const tbody = document.getElementById('tbodyEstoque')
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Nenhum item</td></tr>'
    } else {
        tbody.innerHTML = lista.map(v => {
            const statusClass = v.stock <= 0 ? 'cancelled' : v.stock <= v.low_stock_threshold ? 'pending' : 'active'
            const statusText = v.stock <= 0 ? 'Sem Estoque' : v.stock <= v.low_stock_threshold ? 'Baixo' : 'OK'
            return `<tr>
                <td>${esc(v.products?.name || '—')}</td>
                <td>${esc(v.size_label || '—')}</td>
                <td><code>${esc(v.sku || '—')}</code></td>
                <td><strong>${v.stock}</strong></td>
                <td>${v.low_stock_threshold}</td>
                <td><span class="admin-badge ${statusClass}">${statusText}</span></td>
                <td><button class="admin-btn small secondary" onclick="window.adminMovEstoque('${v.id}')"><i class="fa-solid fa-arrows-rotate"></i></button></td>
            </tr>`
        }).join('')
    }

    
    state.variantesCache = variantes || []
    const sel = document.getElementById('estoqueVariante')
    sel.innerHTML = '<option value="">Selecione...</option>' +
        (variantes || []).map(v => `<option value="${v.id}">${esc(v.products?.name || '')} - ${esc(v.size_label || 'Padrão')} (Estoque: ${v.stock})</option>`).join('')

    
    carregarMovimentacoes()
}

async function carregarMovimentacoes() {
    const { data: movs } = await supabase
        .from('stock_movements')
        .select('*, product_variants(size_label, sku, products(name))')
        .order('created_at', { ascending: false })
        .limit(50)

    const tbody = document.getElementById('tbodyMovimentacoes')
    if (!movs || movs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Nenhuma movimentação</td></tr>'
        return
    }

    tbody.innerHTML = movs.map(m => {
        const refLabel = m.reference_type === 'order' ? `Pedido` : m.reference_type === 'manual' ? 'Manual' : (m.reference_type || '—')
        return `<tr>
            <td>${formatDateTime(m.created_at)}</td>
            <td>${esc(m.product_variants?.products?.name || '—')} (${esc(m.product_variants?.size_label || '—')})</td>
            <td><span class="admin-badge ${m.type === 'entry' || m.type === 'return' ? 'active' : m.type === 'exit' ? 'cancelled' : 'pending'}">${tipoMovLabel(m.type)}</span></td>
            <td>${m.quantity > 0 ? '+' : ''}${m.quantity}</td>
            <td>${refLabel}</td>
            <td>${esc(m.notes || '—')}</td>
        </tr>`
    }).join('')
}

export async function registrarMovimentacao(e) {
    e.preventDefault()
    const varianteId = document.getElementById('estoqueVariante').value
    const tipo = document.getElementById('estoqueTipo').value
    const qtd = parseInt(document.getElementById('estoqueQtd').value)
    const obs = document.getElementById('estoqueObs').value.trim()

    if (!varianteId || isNaN(qtd) || qtd === 0) { toast('Preencha todos os campos com valores válidos', 'erro'); return }

    const tiposValidos = ['entry', 'exit', 'adjustment', 'reservation', 'return']
    if (!tiposValidos.includes(tipo)) { toast('Tipo de movimentação inválido', 'erro'); return }

    const quantity = tipo === 'exit' ? -Math.abs(qtd) : (tipo === 'adjustment' ? qtd : Math.abs(qtd))

    
    const { error: e1 } = await supabase.from('stock_movements').insert({
        variant_id: varianteId,
        type: tipo,
        quantity: quantity,
        reference_type: 'manual',
        notes: obs || null,
        created_by: state.currentAdmin.userId
    })
    if (e1) { toast('Erro: ' + e1.message, 'erro'); return }

    
    const variante = state.variantesCache.find(v => v.id === varianteId)
    if (variante) {
        const novoEstoque = (variante.stock || 0) + quantity
        await supabase.from('product_variants').update({ stock: novoEstoque }).eq('id', varianteId)
    }

    toast('Movimentação registrada!')
    closeModal('modalEstoque')
    document.getElementById('formEstoque').reset()
    carregarEstoque()
}
