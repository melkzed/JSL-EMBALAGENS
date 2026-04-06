import { supabase, state, toast, esc, formatPrice, formatDateTime, statusLabel, metodoLabel, confirmar } from './admin-state.js'

export async function carregarPagamentos() {
    const statusFiltro = document.getElementById('filtroPagamentoStatus').value
    const metodoFiltro = document.getElementById('filtroPagamentoMetodo').value

    let query = supabase
        .from('payments')
        .select('*, orders(order_number, status)')
        .order('created_at', { ascending: false })
        .limit(100)

    if (statusFiltro) query = query.eq('status', statusFiltro)
    if (metodoFiltro) query = query.eq('method', metodoFiltro)

    const { data: pagamentos } = await query

    const tbody = document.getElementById('tbodyPagamentos')
    if (!pagamentos || pagamentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Nenhum pagamento</td></tr>'
        return
    }

    const cancelarIds = pagamentos
        .filter(p => p.orders?.status === 'cancelled' && p.status === 'pending')
        .map(p => p.id)

    if (cancelarIds.length > 0) {
        supabase.from('payments').update({ status: 'cancelled' }).in('id', cancelarIds).then(() => {})
    }

    tbody.innerHTML = pagamentos.map(p => {
        let pagStatus = p.status
        if (p.orders?.status === 'cancelled' && pagStatus === 'pending') {
            pagStatus = 'cancelled'
        }

        let acoes = ''
        if (pagStatus === 'pending') {
            acoes += `<button class="admin-btn small success" onclick="window.adminAprovarPagamento('${p.id}', '${p.order_id}')"><i class="fa-solid fa-check"></i></button> `
            acoes += `<button class="admin-btn small danger" onclick="window.adminRecusarPagamento('${p.id}', '${p.order_id}')"><i class="fa-solid fa-xmark"></i></button>`
        } else if (pagStatus === 'approved') {
            acoes = `<button class="admin-btn small danger" onclick="window.adminReembolsar('${p.id}', '${p.order_id}')"><i class="fa-solid fa-rotate-left"></i> Reembolso</button>`
        }

        return `<tr>
            <td><strong>${esc(p.orders?.order_number || '—')}</strong></td>
            <td>${metodoLabel(p.method)}</td>
            <td>${formatPrice(p.amount)}</td>
            <td><span class="admin-badge ${pagStatus}">${statusLabel(pagStatus)}</span></td>
            <td>${formatDateTime(p.created_at)}</td>
            <td>${acoes}</td>
        </tr>`
    }).join('')
}

export async function aprovarPagamento(pagId, orderId) {
    if (!await confirmar('Confirmar aprovação deste pagamento?')) return

    const { error: e1 } = await supabase.from('payments')
        .update({ status: 'approved', paid_at: new Date().toISOString() })
        .eq('id', pagId)
    if (e1) { toast('Erro: ' + e1.message, 'erro'); return }

    await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId)
    await supabase.from('order_status_history').insert({
        order_id: orderId,
        status: 'paid',
        notes: 'Pagamento aprovado pelo admin via painel de pagamentos',
        changed_by: state.currentAdmin.userId
    })

    toast('Pagamento aprovado!')
    carregarPagamentos()
}

export async function recusarPagamento(pagId, orderId) {
    if (!await confirmar('Recusar este pagamento?')) return

    const { error: e1 } = await supabase.from('payments')
        .update({ status: 'refused' })
        .eq('id', pagId)
    if (e1) { toast('Erro: ' + e1.message, 'erro'); return }

    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    await supabase.from('order_status_history').insert({
        order_id: orderId,
        status: 'cancelled',
        notes: 'Pagamento recusado pelo admin',
        changed_by: state.currentAdmin.userId
    })

    toast('Pagamento recusado!')
    carregarPagamentos()
}

export async function reembolsar(pagId, orderId) {
    if (!await confirmar('Confirmar reembolso deste pagamento?')) return

    const { error: e1 } = await supabase.from('payments')
        .update({ status: 'refunded', refunded_at: new Date().toISOString() })
        .eq('id', pagId)
    if (e1) { toast('Erro: ' + e1.message, 'erro'); return }

    await supabase.from('orders').update({ status: 'refunded' }).eq('id', orderId)
    await supabase.from('order_status_history').insert({
        order_id: orderId,
        status: 'refunded',
        notes: 'Reembolso processado pelo admin',
        changed_by: state.currentAdmin.userId
    })

    toast('Reembolso processado!')
    carregarPagamentos()
}
