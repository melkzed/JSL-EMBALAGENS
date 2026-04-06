import { supabase, state, toast, esc, formatDate, formatDateTime, formatPrice, statusLabel, openModal, closeModal } from './admin-state.js'

const STATUS_STEPS = [
    { key: 'preparing', icon: 'fa-box', label: 'Preparação' },
    { key: 'shipped', icon: 'fa-truck-loading', label: 'Enviado' },
    { key: 'in_transit', icon: 'fa-truck', label: 'Em Trânsito' },
    { key: 'out_for_delivery', icon: 'fa-truck-fast', label: 'Saiu p/ Entrega' },
    { key: 'delivered', icon: 'fa-check-double', label: 'Entregue' }
]

async function carregarCarriers() {
    const { data } = await supabase.from('carriers').select('*').eq('active', true)
    state.carriersCache = data || []
    const sel = document.getElementById('entregaTransportadora')
    sel.innerHTML = '<option value="">Selecione...</option>' +
        state.carriersCache.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
}

async function gerarCodigoInterno() {
    const { count } = await supabase.from('shipments').select('id', { count: 'exact', head: true })
    const num = String((count || 0) + 1).padStart(5, '0')
    return `JSL-ENT-${num}`
}

export async function carregarEntregas() {
    await carregarCarriers()
    const statusFiltro = document.getElementById('filtroEntregaStatus').value

    let query = supabase
        .from('shipments')
        .select('*, orders(order_number, user_id, shipping_city, shipping_state, shipping_cost, profiles:user_id(full_name), payments(status)), carriers(name, tracking_url_template)')
        .order('created_at', { ascending: false })

    if (statusFiltro) query = query.eq('status', statusFiltro)

    const { data: entregas } = await query

    const tbody = document.getElementById('tbodyEntregas')
    if (!entregas || entregas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="admin-empty">Nenhuma entrega</td></tr>'
        return
    }

    tbody.innerHTML = entregas.map(e => {
        const pagAprovado = (e.orders?.payments || []).some(p => p.status === 'approved')
        const aguardando = e.status === 'preparing' && !pagAprovado
        const labelStatus = aguardando ? 'Aguardando Aprovação' : statusLabel(e.status)
        const classeStatus = aguardando ? 'pending' : e.status
        const pagBadge = pagAprovado
            ? '<span class="admin-badge approved" style="font-size:0.7rem"><i class="fa-solid fa-circle-check"></i> Confirmado</span>'
            : '<span class="admin-badge refused" style="font-size:0.7rem"><i class="fa-solid fa-clock"></i> Pendente</span>'

        return `<tr style="cursor:pointer" onclick="window.adminEditEntrega('${e.id}')">
            <td><strong>${esc(e.orders?.order_number || '—')}</strong></td>
            <td>${esc(e.orders?.profiles?.full_name || '—')}</td>
            <td><small>${esc(e.orders?.shipping_city || '—')}/${esc(e.orders?.shipping_state || '—')}</small></td>
            <td>${esc(e.carriers?.name || '—')}</td>
            <td>${e.tracking_code ? `<code>${esc(e.tracking_code)}</code>` : '<span style="color:#9ca3af">—</span>'}</td>
            <td>${pagBadge}</td>
            <td><span class="admin-badge ${classeStatus}">${labelStatus}</span></td>
            <td>${formatDate(e.estimated_delivery)}</td>
            <td><button class="admin-btn small secondary" onclick="event.stopPropagation();window.adminEditEntrega('${e.id}')"><i class="fa-solid fa-pen"></i></button></td>
        </tr>`
    }).join('')
}

function renderTimeline(currentStatus) {
    const idx = STATUS_STEPS.findIndex(s => s.key === currentStatus)
    return STATUS_STEPS.map((step, i) => {
        let classe = ''
        if (i < idx) classe = 'completed'
        else if (i === idx) classe = 'active'
        else classe = 'pending'

        const color = classe === 'completed' ? '#16a34a' : classe === 'active' ? '#2c4dfc' : '#d1d5db'
        const bg = classe === 'completed' ? '#dcfce7' : classe === 'active' ? '#e0e7ff' : '#f3f4f6'
        const textColor = classe === 'pending' ? '#9ca3af' : classe === 'active' ? '#2c4dfc' : '#166534'

        return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative">
            <div style="width:32px;height:32px;border-radius:50%;background:${bg};border:2px solid ${color};display:flex;align-items:center;justify-content:center">
                <i class="fa-solid ${step.icon}" style="font-size:0.75rem;color:${color}"></i>
            </div>
            <span style="font-size:0.65rem;margin-top:0.25rem;color:${textColor};font-weight:${classe === 'active' ? '700' : '400'};text-align:center">${step.label}</span>
        </div>`
    }).join('')
}

function atualizarLinkRastreio() {
    const rastreio = document.getElementById('entregaRastreio').value.trim()
    const carrierId = document.getElementById('entregaTransportadora').value
    const linkDiv = document.getElementById('entregaLinkRastreio')
    const linkUrl = document.getElementById('entregaLinkRastreioUrl')

    if (rastreio && carrierId) {
        const carrier = (state.carriersCache || []).find(c => c.id === carrierId)
        if (carrier && carrier.tracking_url_template) {
            const url = carrier.tracking_url_template.replace('{code}', encodeURIComponent(rastreio))
            linkUrl.href = url
            linkDiv.style.display = 'block'
            return
        }
    }
    linkDiv.style.display = 'none'
}

function toggleConfirmacao() {
    const status = document.getElementById('entregaStatus').value
    const div = document.getElementById('entregaConfirmacao')
    div.style.display = status === 'delivered' ? 'block' : 'none'

    if (status === 'delivered' && !document.getElementById('entregaDataHoraEntrega').value) {
        const now = new Date()
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
        document.getElementById('entregaDataHoraEntrega').value = now.toISOString().slice(0, 16)
    }
}

export async function abrirModalEntrega(entregaId = null) {
    document.getElementById('entregaId').value = ''
    document.getElementById('entregaOrderId').value = ''
    document.getElementById('formEntrega').reset()
    document.getElementById('entregaInfoPedido').innerHTML = ''
    document.getElementById('entregaTimeline').innerHTML = ''
    document.getElementById('entregaLinkRastreio').style.display = 'none'
    document.getElementById('entregaConfirmacao').style.display = 'none'
    document.getElementById('modalEntregaTitulo').textContent = 'Gerenciar Entrega'

    if (entregaId) {
        const { data: ent } = await supabase
            .from('shipments')
            .select('*, orders(order_number, total, shipping_cost, shipping_street, shipping_number, shipping_complement, shipping_neighborhood, shipping_city, shipping_state, shipping_zip_code, profiles:user_id(full_name, phone), payments(status, method)), carriers(name, tracking_url_template)')
            .eq('id', entregaId)
            .single()

        if (ent) {
            document.getElementById('entregaId').value = ent.id
            document.getElementById('entregaOrderId').value = ent.order_id
            document.getElementById('entregaTransportadora').value = ent.carrier_id || ''
            document.getElementById('entregaRastreio').value = ent.tracking_code || ''
            document.getElementById('entregaStatus').value = ent.status
            document.getElementById('entregaPrevisao').value = ent.estimated_delivery || ''
            document.getElementById('entregaObs').value = ent.notes || ''
            document.getElementById('entregaRecebidoPor').value = ent.received_by || ''

            if (ent.delivered_at) {
                const dt = new Date(ent.delivered_at)
                dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset())
                document.getElementById('entregaDataHoraEntrega').value = dt.toISOString().slice(0, 16)
            }

            document.getElementById('modalEntregaTitulo').textContent = `Entrega - Pedido ${esc(ent.orders?.order_number || '')}`

            
            const o = ent.orders || {}
            const p = o.profiles || {}
            const pagAprovado = (o.payments || []).some(pg => pg.status === 'approved')
            const pagBannerColor = pagAprovado ? '#16a34a' : '#dc2626'
            const pagBannerBg = pagAprovado ? '#dcfce7' : '#fef2f2'
            const pagBannerIcon = pagAprovado ? 'fa-circle-check' : 'fa-triangle-exclamation'
            const pagBannerText = pagAprovado ? 'Pagamento confirmado' : 'Pagamento NÃO confirmado — aguardando aprovação'

            document.getElementById('entregaInfoPedido').innerHTML = `
                <div style="padding:0.6rem 1rem;border-radius:8px;background:${pagBannerBg};border:1px solid ${pagBannerColor}20;margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem">
                    <i class="fa-solid ${pagBannerIcon}" style="color:${pagBannerColor};font-size:1rem"></i>
                    <span style="color:${pagBannerColor};font-weight:600;font-size:0.85rem">${pagBannerText}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                    <div>
                        <p style="margin-bottom:0.25rem"><strong><i class="fa-solid fa-user"></i> ${esc(p.full_name || '—')}</strong></p>
                        <p style="font-size:0.82rem;color:#6b7280"><i class="fa-solid fa-phone"></i> ${esc(p.phone || '—')}</p>
                        <p style="font-size:0.82rem;color:#6b7280;margin-top:0.25rem"><strong>Frete:</strong> ${formatPrice(o.shipping_cost)} | <strong>Total:</strong> ${formatPrice(o.total)}</p>
                    </div>
                    <div>
                        <p style="margin-bottom:0.25rem"><strong><i class="fa-solid fa-location-dot"></i> Endereço de Entrega</strong></p>
                        <p style="font-size:0.82rem;color:#374151">
                            ${esc(o.shipping_street || '')}, ${esc(o.shipping_number || '')} ${o.shipping_complement ? esc(o.shipping_complement) : ''}<br>
                            ${esc(o.shipping_neighborhood || '')} - ${esc(o.shipping_city || '')}/${esc(o.shipping_state || '')}<br>
                            <strong>CEP:</strong> ${esc(o.shipping_zip_code || '')}
                        </p>
                    </div>
                </div>
                ${ent.shipped_at ? `<p style="font-size:0.78rem;color:#6b7280;margin-top:0.5rem"><i class="fa-solid fa-clock"></i> Enviado em: ${formatDateTime(ent.shipped_at)}</p>` : ''}
                ${ent.delivered_at ? `<p style="font-size:0.78rem;color:#16a34a;margin-top:0.25rem"><i class="fa-solid fa-check-circle"></i> Entregue em: ${formatDateTime(ent.delivered_at)}${ent.received_by ? ` — Recebido por: <strong>${esc(ent.received_by)}</strong>` : ''}</p>` : ''}
            `

            
            document.getElementById('entregaTimeline').innerHTML = renderTimeline(ent.status)

            
            atualizarLinkRastreio()
            toggleConfirmacao()
        }
    }

    
    document.getElementById('entregaRastreio').oninput = atualizarLinkRastreio
    document.getElementById('entregaTransportadora').onchange = atualizarLinkRastreio
    document.getElementById('entregaStatus').onchange = () => {
        toggleConfirmacao()
        document.getElementById('entregaTimeline').innerHTML = renderTimeline(document.getElementById('entregaStatus').value)
    }

    openModal('modalEntrega')
}

export async function salvarEntrega(e) {
    e.preventDefault()
    const entregaId = document.getElementById('entregaId').value || null
    const statusAtual = document.getElementById('entregaStatus').value

    const dados = {
        carrier_id: document.getElementById('entregaTransportadora').value || null,
        tracking_code: document.getElementById('entregaRastreio').value.trim() || null,
        status: statusAtual,
        estimated_delivery: document.getElementById('entregaPrevisao').value || null,
        notes: document.getElementById('entregaObs').value.trim() || null
    }

    
    if (!dados.tracking_code && dados.carrier_id) {
        const carrier = (state.carriersCache || []).find(c => c.id === dados.carrier_id)
        if (carrier && !carrier.tracking_url_template) {
            dados.tracking_code = await gerarCodigoInterno()
        }
    }

    if (statusAtual === 'shipped' && !dados.shipped_at) dados.shipped_at = new Date().toISOString()

    if (statusAtual === 'delivered') {
        const dataHora = document.getElementById('entregaDataHoraEntrega').value
        dados.delivered_at = dataHora ? new Date(dataHora).toISOString() : new Date().toISOString()
        dados.received_by = document.getElementById('entregaRecebidoPor').value.trim() || null
    }

    if (entregaId) {
        
        const orderId = document.getElementById('entregaOrderId').value
        if (orderId) {
            const { data: pagamento } = await supabase.from('payments').select('status').eq('order_id', orderId).order('created_at', { ascending: false }).limit(1).maybeSingle()
            if (!pagamento || pagamento.status !== 'approved') {
                toast('Pagamento não confirmado! Confirme o pagamento antes de editar a entrega.', 'erro')
                return
            }
        }

        const { error } = await supabase.from('shipments').update(dados).eq('id', entregaId)
        if (error) { toast('Erro: ' + error.message, 'erro'); return }

        
        if (orderId) {
            if (statusAtual === 'shipped' || statusAtual === 'in_transit' || statusAtual === 'out_for_delivery') {
                await supabase.from('orders').update({ status: 'shipped' }).eq('id', orderId)
            } else if (statusAtual === 'delivered') {
                await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)
            }
        }
    }

    toast('Entrega atualizada!')
    closeModal('modalEntrega')
    carregarEntregas()
}
