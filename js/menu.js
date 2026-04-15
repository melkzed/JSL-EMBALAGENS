export function initMenu() {
    const links = document.querySelectorAll(".menu a")
    const currentPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/').replace(/\/+$/, '') || '/'

    function getCurrentPageKey() {
        if (currentPath === '/' || currentPath === '/index.html') return 'index'
        if (currentPath === '/produtos' || currentPath === '/html/produtos.html' || currentPath === '/produtos.html') return 'produtos'
        if (currentPath === '/sobre' || currentPath === '/html/sobre.html' || currentPath === '/sobre.html') return 'sobre'
        if (currentPath === '/contato' || currentPath === '/html/contato.html' || currentPath === '/contato.html') return 'contato'
        if (currentPath === '/politicas' || currentPath === '/html/politicas.html' || currentPath === '/politicas.html') return 'politicas'
        if (currentPath === '/carrinho' || currentPath === '/html/carrinho.html' || currentPath === '/carrinho.html') return 'carrinho'
        if (currentPath === '/checkout' || currentPath === '/html/checkout.html' || currentPath === '/checkout.html') return 'checkout'
        if (currentPath === '/perfil' || currentPath === '/html/perfil.html' || currentPath === '/perfil.html') return 'perfil'
        if (currentPath === '/confirmar-email' || currentPath === '/html/confirmar-email.html' || currentPath === '/confirmar-email.html') return 'confirmar-email'
        if (currentPath === '/html/produto.html' || currentPath === '/produto.html' || currentPath.startsWith('/produtos/')) return 'produtos'
        return ''
    }

    const currentPageKey = getCurrentPageKey()

    links.forEach(link => {
        const href = link.getAttribute("href")
        const route = link.dataset.route || link.dataset.page

        if (!href) return

        if (route && route === currentPageKey) {
            link.classList.add("ativo")
        }

        link.addEventListener("click", function () {
            links.forEach(l => l.classList.remove("ativo"))
            this.classList.add("ativo")
            
            const menu = document.getElementById('navMenu')
            const btn = document.getElementById('hamburgerBtn')
            if (menu) menu.classList.remove('open')
            if (btn) btn.classList.remove('active')
        })
    })

    
    const hamburgerBtn = document.getElementById('hamburgerBtn')
    const navMenu = document.getElementById('navMenu')

    if (hamburgerBtn && navMenu) {
        hamburgerBtn.addEventListener('click', () => {
            navMenu.classList.toggle('open')
            hamburgerBtn.classList.toggle('active')
        })

        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.navbar')) {
                navMenu.classList.remove('open')
                hamburgerBtn.classList.remove('active')
            }
        })
    }
}
