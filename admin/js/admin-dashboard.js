import { supabase, esc, formatPrice, formatDate, formatDateTime, statusLabel } from './admin-state.js'

export async function carregarDashboard() {
    
    const { count: totalVendas } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['paid', 'preparing', 'shipped', 'delivered'])

    document.getElementById('statTotalVendas').textContent = totalVendas || 0

    
    const { data: ordensP } = await supabase
        .from('orders')
        .select('total')
        .in('status', ['paid', 'preparing', 'shipped', 'delivered'])

    const faturamento = (ordensP || []).reduce((s, o) => s + parseFloat(o.total || 0), 0)
    document.getElementById('statFaturamento').textContent = formatPrice(faturamento)

    
    const { count: pendentes } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')

    document.getElementById('statPendentes').textContent = pendentes || 0

    
    const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })

    document.getElementById('statUsuarios').textContent = totalUsers || 0

    
    carregarPedidosPorPeriodo()

    
    carregarTopProdutos()
}

export async function carregarPedidosPorPeriodo() {
    const dias = parseInt(document.getElementById('dashPeriodo').value) || 30
    const desde = new Date()
    desde.setDate(desde.getDate() - dias)

    const { data: pedidos } = await supabase
        .from('orders')
        .select('created_at, total, status')
        .gte('created_at', desde.toISOString())
        .order('created_at', { ascending: false })

    
    const grupo = {}
    ;(pedidos || []).forEach(p => {
        const data = new Date(p.created_at).toLocaleDateString('pt-BR')
        if (!grupo[data]) grupo[data] = { pedidos: 0, valor: 0, aguardando: 0, confirmado: 0, cancelado: 0 }
        grupo[data].pedidos++

        if (p.status === 'pending') {
            grupo[data].aguardando++
        } else if (['paid', 'preparing', 'shipped', 'delivered'].includes(p.status)) {
            grupo[data].confirmado++
            grupo[data].valor += parseFloat(p.total || 0)
        } else if (['cancelled', 'refunded'].includes(p.status)) {
            grupo[data].cancelado++
        }
    })

    const tbody = document.querySelector('#dashPedidosTabela tbody')
    tbody.innerHTML = Object.entries(grupo).map(([data, d]) => `
        <tr>
            <td>${data}</td>
            <td>${d.pedidos}</td>
            <td>
                ${d.aguardando ? `<span class="admin-badge pending" style="font-size:0.65rem">Aguardando: ${d.aguardando}</span> ` : ''}
                ${d.confirmado ? `<span class="admin-badge approved" style="font-size:0.65rem">Confirmado: ${d.confirmado}</span> ` : ''}
                ${d.cancelado ? `<span class="admin-badge cancelled" style="font-size:0.65rem">Cancelado: ${d.cancelado}</span> ` : ''}
            </td>
            <td>${formatPrice(d.valor)}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="admin-empty">Nenhum pedido no período</td></tr>'
}

async function carregarTopProdutos() {
    
    const { data: ordensConfirmadas } = await supabase
        .from('orders')
        .select('id')
        .in('status', ['paid', 'preparing', 'shipped', 'delivered'])

    const orderIds = (ordensConfirmadas || []).map(o => o.id)
    if (orderIds.length === 0) {
        document.getElementById('dashTopProdutos').innerHTML = '<p class="admin-empty">Nenhuma venda confirmada</p>'
        return
    }

    const { data: items } = await supabase
        .from('order_items')
        .select('product_name, quantity, total_price')
        .in('order_id', orderIds)

    const produtos = {}
    ;(items || []).forEach(i => {
        if (!produtos[i.product_name]) produtos[i.product_name] = { qty: 0, total: 0 }
        produtos[i.product_name].qty += i.quantity
        produtos[i.product_name].total += parseFloat(i.total_price || 0)
    })

    const top = Object.entries(produtos)
        .sort((a, b) => b[1].qty - a[1].qty)
        .slice(0, 10)

    const container = document.getElementById('dashTopProdutos')
    if (top.length === 0) {
        container.innerHTML = '<p class="admin-empty">Nenhuma venda registrada</p>'
        return
    }
    container.innerHTML = top.map(([nome, d], i) => `
        <div class="admin-top-product">
            <div class="rank">${i + 1}</div>
            <div class="info"><strong>${esc(nome)}</strong><small>${d.qty} vendidos</small></div>
            <div class="valor">${formatPrice(d.total)}</div>
        </div>
    `).join('')
}
