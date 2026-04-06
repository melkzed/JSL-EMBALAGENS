import { supabase, state, toast, esc, formatPrice, formatDateTime, statusLabel, metodoLabel, openModal, closeModal, pedirSenha } from './admin-state.js'

export async function carregarPedidos() {
    const busca = document.getElementById('filtroPedidoBusca').value.trim()
    const status = document.getElementById('filtroPedidoStatus').value

    let query = supabase
        .from('orders')
        .select('*, profiles(full_name, phone), payments(method, status)')
        .order('created_at', { ascending: false })
        .limit(100)

    if (status) query = query.eq('status', status)
    if (busca) query = query.or(`order_number.ilike.%${busca}%`)

    const { data: pedidos, error } = await query
    if (error) { toast('Erro: ' + error.message, 'erro'); return }

    const tbody = document.getElementById('tbodyPedidos')
    if (!pedidos || pedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Nenhum pedido</td></tr>'
        return
    }

    tbody.innerHTML = pedidos.map(p => {
        const pag = (p.payments || [])[0]
        return `<tr>
            <td><strong>${esc(p.order_number)}</strong></td>
            <td>${esc(p.profiles?.full_name || 'Sem nome')}</td>
            <td>${formatDateTime(p.created_at)}</td>
            <td>${formatPrice(p.total)}</td>
            <td><span class="admin-badge ${p.status}">${statusLabel(p.status)}</span></td>
            <td>${pag ? `<span class="admin-badge ${pag.status}">${metodoLabel(pag.method)}</span>` : '—'}</td>
            <td>
                <button class="admin-btn small secondary" onclick="window.adminVerPedido('${p.id}')"><i class="fa-solid fa-eye"></i></button>
            </td>
        </tr>`
    }).join('')
}

export async function verPedido(pedidoId) {
    const { data: pedido } = await supabase
        .from('orders')
        .select('*, profiles(full_name, phone), order_items(*), payments(*), shipments(*, carriers(name)), order_status_history(*)')
        .eq('id', pedidoId)
        .single()

    if (!pedido) { toast('Pedido não encontrado', 'erro'); return }

    document.getElementById('modalPedidoTitulo').textContent = `Pedido ${pedido.order_number}`

    const itensHtml = (pedido.order_items || []).map(i =>
        `<tr><td>${esc(i.product_name)} ${i.variant_label ? `(${esc(i.variant_label)})` : ''}</td><td>${i.quantity}</td><td>${formatPrice(i.unit_price)}</td><td>${formatPrice(i.total_price)}</td></tr>`
    ).join('')

    const historicoHtml = (pedido.order_status_history || [])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(h => `<tr><td>${formatDateTime(h.created_at)}</td><td><span class="admin-badge ${h.status}">${statusLabel(h.status)}</span></td><td>${esc(h.notes || '—')}</td></tr>`)
        .join('')

    const pag = (pedido.payments || [])[0]
    const ship = (pedido.shipments || [])[0]

    const acoes = []
    if (pedido.status === 'pending') {
        acoes.push(`<button class="admin-btn small success" onclick="window.adminConfirmarPagamento('${pedido.id}')"><i class="fa-solid fa-check"></i> Confirmar Pgto</button>`)
        acoes.push(`<button class="admin-btn small danger" onclick="window.adminCancelarPedido('${pedido.id}')"><i class="fa-solid fa-xmark"></i> Cancelar</button>`)
    }
    if (pedido.status === 'paid') {
        acoes.push(`<button class="admin-btn small primary" onclick="window.adminMudarStatus('${pedido.id}','preparing')"><i class="fa-solid fa-box"></i> Em Preparação</button>`)
    }
    if (pedido.status === 'preparing') {
        acoes.push(`<button class="admin-btn small primary" onclick="window.adminMudarStatus('${pedido.id}','shipped')"><i class="fa-solid fa-truck"></i> Enviado</button>`)
    }
    if (pedido.status === 'shipped') {
        acoes.push(`<button class="admin-btn small success" onclick="window.adminMudarStatus('${pedido.id}','delivered')"><i class="fa-solid fa-check-double"></i> Entregue</button>`)
    }

    document.getElementById('modalPedidoConteudo').innerHTML = `
        <div class="admin-pedido-info-grid">
            <div>
                <p><strong>Cliente:</strong> ${esc(pedido.profiles?.full_name || '—')}</p>
                <p><strong>Telefone:</strong> ${esc(pedido.profiles?.phone || '—')}</p>
                <p><strong>Data:</strong> ${formatDateTime(pedido.created_at)}</p>
                <p><strong>Status:</strong> <span class="admin-badge ${pedido.status}">${statusLabel(pedido.status)}</span></p>
            </div>
            <div>
                <p><strong>Endereço:</strong></p>
                <p style="font-size:0.82rem;color:#6b7280">${esc(pedido.shipping_street || '')}, ${esc(pedido.shipping_number || '')} ${esc(pedido.shipping_complement || '')}<br>
                ${esc(pedido.shipping_neighborhood || '')} - ${esc(pedido.shipping_city || '')}/${esc(pedido.shipping_state || '')}<br>
                CEP: ${esc(pedido.shipping_zip_code || '')}</p>
            </div>
        </div>

        <h4 style="margin-bottom:0.5rem">Itens do Pedido</h4>
        <table class="admin-table" style="margin-bottom:1rem">
            <thead><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr></thead>
            <tbody>${itensHtml}</tbody>
            <tfoot>
                <tr><td colspan="3" style="text-align:right"><strong>Subtotal:</strong></td><td>${formatPrice(pedido.subtotal)}</td></tr>
                ${pedido.discount > 0 ? `<tr><td colspan="3" style="text-align:right"><strong>Desconto:</strong></td><td>-${formatPrice(pedido.discount)}</td></tr>` : ''}
                <tr><td colspan="3" style="text-align:right"><strong>Frete:</strong></td><td>${formatPrice(pedido.shipping_cost)}</td></tr>
                <tr><td colspan="3" style="text-align:right"><strong style="font-size:1.1rem">Total:</strong></td><td><strong style="font-size:1.1rem">${formatPrice(pedido.total)}</strong></td></tr>
            </tfoot>
        </table>

        ${pag ? `<h4 style="margin-bottom:0.5rem">Pagamento</h4>
        <p><strong>Método:</strong> ${metodoLabel(pag.method)} | <strong>Status:</strong> <span class="admin-badge ${pag.status}">${statusLabel(pag.status)}</span> | <strong>Valor:</strong> ${formatPrice(pag.amount)} ${pag.paid_at ? `| <strong>Pago em:</strong> ${formatDateTime(pag.paid_at)}` : ''}</p>` : ''}

        ${ship ? `<h4 style="margin:1rem 0 0.5rem">Entrega</h4>
        <p><strong>Transportadora:</strong> ${esc(ship.carriers?.name || '—')} | <strong>Rastreio:</strong> ${esc(ship.tracking_code || '—')} | <strong>Status:</strong> <span class="admin-badge ${ship.status}">${statusLabel(ship.status)}</span></p>` : ''}

        ${historicoHtml ? `<h4 style="margin:1rem 0 0.5rem">Histórico</h4>
        <table class="admin-table"><thead><tr><th>Data</th><th>Status</th><th>Obs</th></tr></thead><tbody>${historicoHtml}</tbody></table>` : ''}

        ${acoes.length > 0 ? `<div style="display:flex;gap:0.5rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e5e7eb">${acoes.join('')}</div>` : ''}
    `

    openModal('modalPedido')
}

export async function confirmarPagamento(pedidoId) {
    pedirSenha('Confirmar Pagamento', 'Digite a senha "123" para confirmar o pagamento:', async (senha) => {
        if (senha !== '123') {
            document.getElementById('senhaErro').textContent = 'Senha incorreta!'
            document.getElementById('senhaErro').style.display = 'block'
            return
        }
        closeModal('modalSenha')

        const { error: e1 } = await supabase.from('orders').update({ status: 'paid' }).eq('id', pedidoId)
        if (e1) { toast('Erro: ' + e1.message, 'erro'); return }

        await supabase.from('payments').update({ status: 'approved', paid_at: new Date().toISOString() }).eq('order_id', pedidoId)

        await supabase.from('order_status_history').insert({
            order_id: pedidoId,
            status: 'paid',
            notes: 'Pagamento confirmado pelo admin',
            changed_by: state.currentAdmin.userId
        })

        toast('Pagamento confirmado!')
        closeModal('modalPedido')
        carregarPedidos()
    })
}

export async function cancelarPedido(pedidoId) {
    pedirSenha('Cancelar Pedido', 'Digite "cancelar" para confirmar o cancelamento:', async (senha) => {
        if (senha !== 'cancelar') {
            document.getElementById('senhaErro').textContent = 'Senha incorreta!'
            document.getElementById('senhaErro').style.display = 'block'
            return
        }
        closeModal('modalSenha')

        const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', pedidoId)
        if (error) { toast('Erro: ' + error.message, 'erro'); return }

        
        await supabase.from('payments').update({ status: 'cancelled' }).eq('order_id', pedidoId).neq('status', 'refunded')

        await supabase.from('order_status_history').insert({
            order_id: pedidoId,
            status: 'cancelled',
            notes: 'Cancelado pelo admin',
            changed_by: state.currentAdmin.userId
        })

        toast('Pedido cancelado!')
        closeModal('modalPedido')
        carregarPedidos()
    })
}

export async function mudarStatus(pedidoId, novoStatus) {
    
    const statusEntrega = ['preparing', 'shipped', 'delivered']
    if (statusEntrega.includes(novoStatus)) {
        const { data: pedidoAtual } = await supabase.from('orders').select('status').eq('id', pedidoId).single()
        const { data: pagamento } = await supabase.from('payments').select('status').eq('order_id', pedidoId).order('created_at', { ascending: false }).limit(1).maybeSingle()

        if (!pagamento || pagamento.status !== 'approved') {
            toast('Pagamento não confirmado! Confirme o pagamento antes de alterar o status de entrega.', 'erro')
            return
        }
    }

    const { error } = await supabase.from('orders').update({ status: novoStatus }).eq('id', pedidoId)
    if (error) { toast('Erro: ' + error.message, 'erro'); return }

    await supabase.from('order_status_history').insert({
        order_id: pedidoId,
        status: novoStatus,
        notes: `Status alterado para ${statusLabel(novoStatus)} pelo admin`,
        changed_by: state.currentAdmin.userId
    })

    
    if (novoStatus === 'preparing') {
        const { data: existente } = await supabase.from('shipments').select('id').eq('order_id', pedidoId).maybeSingle()
        if (!existente) {
            const { data: pedido } = await supabase.from('orders').select('shipping_cost').eq('id', pedidoId).single()
            const estimativa = new Date()
            estimativa.setDate(estimativa.getDate() + 15)
            await supabase.from('shipments').insert({
                order_id: pedidoId,
                status: 'preparing',
                shipping_cost: pedido?.shipping_cost || 0,
                estimated_delivery: estimativa.toISOString().split('T')[0]
            })
        }
    }

    
    if (novoStatus === 'shipped') {
        await supabase.from('shipments').update({ status: 'shipped', shipped_at: new Date().toISOString() }).eq('order_id', pedidoId)
    }
    if (novoStatus === 'delivered') {
        await supabase.from('shipments').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('order_id', pedidoId)
    }

    toast(`Status atualizado para ${statusLabel(novoStatus)}!`)
    closeModal('modalPedido')
    carregarPedidos()
}
