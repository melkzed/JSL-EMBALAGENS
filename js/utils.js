

export function escapeHtml(text) {
    if (!text) return ''
    const d = document.createElement('div')
    d.textContent = text
    return d.innerHTML
}


export function isUrlSegura(url) {
    if (!url) return false
    try {
        const u = new URL(url)
        return u.protocol === 'https:' || u.protocol === 'http:'
    } catch { return false }
}


export function formatarPreco(valor) {
    return parseFloat(valor || 0).toFixed(2).replace('.', ',')
}


export function mostrarToast(mensagem, tipo = 'sucesso') {
    const anterior = document.querySelector('.cart-toast')
    if (anterior) anterior.remove()

    const toast = document.createElement('div')
    toast.className = `cart-toast cart-toast-${tipo}`
    toast.innerHTML = `
        <i class="fa-solid ${tipo === 'sucesso' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${escapeHtml(mensagem)}</span>
    `
    document.body.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add('visivel'))
    setTimeout(() => {
        toast.classList.remove('visivel')
        setTimeout(() => toast.remove(), 300)
    }, 2500)
}
