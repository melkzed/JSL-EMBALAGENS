import { supabase, toast, esc, formatPrice, formatDate, formatDateTime, statusLabel, openModal, closeModal } from './admin-state.js'

export async function carregarUsuarios() {
    const busca = document.getElementById('filtroUsuarioBusca').value.trim().toLowerCase()

    
    const { data: users, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url, status, created_at')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao carregar usuários:', error)
        toast('Erro ao carregar usuários: ' + error.message, 'erro')
    }

    let lista = users || []

    
    if (busca) {
        lista = lista.filter(u =>
            (u.full_name || '').toLowerCase().includes(busca) ||
            (u.email || '').toLowerCase().includes(busca) ||
            (u.phone || '').toLowerCase().includes(busca)
        )
    }

    
    const { data: orderCounts } = await supabase
        .from('orders')
        .select('user_id')

    const contagem = {}
    ;(orderCounts || []).forEach(o => {
        contagem[o.user_id] = (contagem[o.user_id] || 0) + 1
    })

    const tbody = document.getElementById('tbodyUsuarios')
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Nenhum usuário</td></tr>'
        return
    }

    tbody.innerHTML = lista.map(u => `<tr>
        <td>${u.avatar_url ? `<img src="${esc(u.avatar_url)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : '<div style="width:36px;height:36px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-user" style="color:#9ca3af"></i></div>'}</td>
        <td>${esc(u.full_name || 'Sem nome')}</td>
        <td><small style="color:#6b7280">${esc(u.email || '—')}</small></td>
        <td>${esc(u.phone || '—')}</td>
        <td>${formatDate(u.created_at)}</td>
        <td>${contagem[u.id] || 0}</td>
        <td><button class="admin-btn small secondary" onclick="window.adminVerUsuario('${u.id}')"><i class="fa-solid fa-eye"></i> Ver</button></td>
    </tr>`).join('')
}

export async function verUsuario(userId) {
    
    const { data: user } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

    
    const { data: enderecos } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })

    
    const { data: pedidos } = await supabase
        .from('orders')
        .select('id, order_number, status, total, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)

    const nome = user?.full_name || 'Usuário'
    document.getElementById('modalUsuarioTitulo').textContent = `Detalhes de ${nome}`

    let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">`
    html += `<div>
        <p><strong>Nome:</strong> ${esc(user?.full_name || '—')}</p>
        <p><strong>E-mail:</strong> ${esc(user?.email || '—')}</p>
        <p><strong>Telefone:</strong> ${esc(user?.phone || '—')}</p>
        <p><strong>CPF:</strong> ${esc(user?.cpf || '—')}</p>
    </div><div>
        <p><strong>Data nasc.:</strong> ${user?.birth_date ? formatDate(user.birth_date) : '—'}</p>
        <p><strong>Cadastro:</strong> ${formatDateTime(user?.created_at)}</p>
        <p><strong>Status:</strong> <span class="admin-badge ${user?.status === 'active' ? 'active' : 'inactive'}">${user?.status || '—'}</span></p>
    </div></div>`

    
    html += `<h4 style="margin-bottom:0.5rem"><i class="fa-solid fa-location-dot"></i> Endereços</h4>`
    if (enderecos && enderecos.length > 0) {
        html += enderecos.map(e => `
            <div style="background:#f9fafb;padding:0.75rem;border-radius:8px;margin-bottom:0.5rem;font-size:0.82rem;border:1px solid #e5e7eb">
                <strong>${esc(e.label)}${e.is_default ? ' <span class="admin-badge active" style="font-size:0.6rem">Padrão</span>' : ''}</strong><br>
                ${esc(e.street)}, ${esc(e.number)} ${e.complement ? esc(e.complement) : ''}<br>
                ${esc(e.neighborhood)} - ${esc(e.city)}/${esc(e.state)} - CEP: ${esc(e.zip_code)}
            </div>
        `).join('')
    } else {
        html += '<p style="color:#9ca3af;font-size:0.82rem">Nenhum endereço cadastrado</p>'
    }

    
    html += `<h4 style="margin:1rem 0 0.5rem"><i class="fa-solid fa-bag-shopping"></i> Últimos Pedidos</h4>`
    if (pedidos && pedidos.length > 0) {
        html += `<table class="admin-table"><thead><tr><th>Pedido</th><th>Data</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>`
        html += pedidos.map(p => `
            <tr style="cursor:pointer" onclick="window.adminVerPedidoDeUsuario('${p.id}')">
                <td><strong style="color:#2c4dfc">${esc(p.order_number)}</strong></td>
                <td>${formatDate(p.created_at)}</td>
                <td>${formatPrice(p.total)}</td>
                <td><span class="admin-badge ${p.status}">${statusLabel(p.status)}</span></td>
                <td><button class="admin-btn small secondary" onclick="event.stopPropagation();window.adminVerPedidoDeUsuario('${p.id}')"><i class="fa-solid fa-eye"></i></button></td>
            </tr>
        `).join('')
        html += `</tbody></table>`
    } else {
        html += '<p style="color:#9ca3af;font-size:0.82rem">Nenhum pedido realizado</p>'
    }

    document.getElementById('modalUsuarioConteudo').innerHTML = html
    openModal('modalUsuario')
}

export function verPedidoDeUsuario(pedidoId) {
    closeModal('modalUsuario')
    setTimeout(() => window.adminVerPedido(pedidoId), 200)
}
