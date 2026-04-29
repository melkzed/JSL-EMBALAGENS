// Pagina de retorno do Mercado Pago.
// O MP redireciona para checkout-retorno.html com parametros como:
// status, collection_status, payment_id e external_reference.

function usarRotasAmigaveis() {
    return ['www.jslembalagens.com.br', 'jslembalagens.com.br'].includes(window.location.hostname)
}

function montarUrlPerfil(pedidoId, status = '') {
    const pedidoSeguro = encodeURIComponent(pedidoId)
    const base = usarRotasAmigaveis()
        ? `/perfil?tab=pedidos&pedido=${pedidoSeguro}`
        : `./html/perfil.html?tab=pedidos&pedido=${pedidoSeguro}`

    if (!status) return base
    const separador = base.includes('?') ? '&' : '?'
    return `${base}${separador}pagamento=${encodeURIComponent(status)}`
}

function redirecionar(pedidoId, status = '') {
    window.location.href = montarUrlPerfil(pedidoId, status)
}

function atualizarStatus(mensagem) {
    const el = document.getElementById('checkoutRetornoStatus')
    if (el) el.textContent = mensagem
}

;(function initRetornoCheckout() {
    const params = new URLSearchParams(window.location.search)

    const mpStatus = params.get('status')
    const collectionStatus = params.get('collection_status')
    const externalReference = params.get('external_reference')
    const paymentId = params.get('payment_id')
    const pedidoId = params.get('pedido') || params.get('order') || externalReference

    console.log('[Retorno MP] Parametros:', {
        mpStatus,
        collectionStatus,
        externalReference,
        paymentId,
        pedidoId,
    })

    if (!pedidoId) {
        window.location.href = usarRotasAmigaveis() ? '/' : './index.html'
        return
    }

    const statusFinal = collectionStatus || mpStatus || 'pending'

    if (statusFinal === 'approved') {
        atualizarStatus('Pagamento confirmado! Redirecionando para seus pedidos...')
        setTimeout(() => redirecionar(pedidoId, 'approved'), 700)
    } else if (statusFinal === 'pending' || statusFinal === 'in_process') {
        atualizarStatus('Pagamento em analise. Redirecionando para seus pedidos...')
        setTimeout(() => redirecionar(pedidoId, 'pending'), 900)
    } else {
        atualizarStatus('Pagamento nao concluido. Redirecionando para seus pedidos...')
        setTimeout(() => redirecionar(pedidoId, 'failure'), 900)
    }
})()
