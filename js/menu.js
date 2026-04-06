export function initMenu() {
    const links = document.querySelectorAll(".menu a")
    const currentPath = window.location.pathname

    links.forEach(link => {
        const href = link.getAttribute("href")

        if (!href) return

        
        if (currentPath.includes(href.replace('/', ''))) {
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