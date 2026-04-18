;(function () {
    const params = new URLSearchParams(window.location.search)
    const pedidoId = params.get('pedido')
    const useFriendly = window.__JSL_ENABLE_FRIENDLY_ROUTES__ === true
    if (pedidoId) {
        const pedidoSeguro = encodeURIComponent(pedidoId)
        window.location.href = useFriendly
            ? `/perfil?tab=pedidos&pedido=${pedidoSeguro}`
            : `./html/perfil.html?tab=pedidos&pedido=${pedidoSeguro}`
    } else {
        window.location.href = useFriendly ? '/' : './index.html'
    }
})()
