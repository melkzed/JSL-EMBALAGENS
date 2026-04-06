import { supabase, state, closeModal, openModal } from './admin-state.js'

export function initNavegacao(loaders) {
    const navItems = document.querySelectorAll('.admin-nav-item')
    const sections = document.querySelectorAll('.admin-section')

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sec = item.dataset.section
            navItems.forEach(n => n.classList.remove('active'))
            item.classList.add('active')
            sections.forEach(s => s.classList.remove('active'))
            document.getElementById('sec' + sec.charAt(0).toUpperCase() + sec.slice(1)).classList.add('active')

            const titles = {
                dashboard: 'Dashboard', produtos: 'Produtos', categorias: 'Categorias',
                pedidos: 'Pedidos', usuarios: 'Usuários', estoque: 'Estoque',
                entregas: 'Entregas', pagamentos: 'Pagamentos', avaliacoes: 'Avaliações',
                fiscal: 'Fiscal', administracao: 'Administração'
            }
            document.getElementById('adminPageTitle').textContent = titles[sec] || sec

            
            document.getElementById('adminSidebar').classList.remove('mobile-open')

            if (loaders[sec]) loaders[sec]()
        })
    })

    
    document.getElementById('btnToggleSidebar').addEventListener('click', () => {
        document.getElementById('adminSidebar').classList.toggle('collapsed')
    })

    
    document.getElementById('btnMobileMenu').addEventListener('click', () => {
        document.getElementById('adminSidebar').classList.toggle('mobile-open')
    })

    
    document.getElementById('btnAdminLogout').addEventListener('click', async () => {
        await supabase.auth.signOut()
        window.location.href = 'index.html'
    })

    
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close))
    })

    
    document.getElementById('btnConfirmarSenha').addEventListener('click', () => {
        const senha = document.getElementById('inputSenhaConfirmacao').value
        if (state.senhaCallback) state.senhaCallback(senha)
    })

    
    function fecharConfirmar(resultado) {
        document.getElementById('modalConfirmar').style.display = 'none'
        if (state.confirmarCallback) { state.confirmarCallback(resultado); state.confirmarCallback = null }
    }
    document.getElementById('btnConfirmarSim').addEventListener('click', () => fecharConfirmar(true))
    document.getElementById('btnConfirmarNao').addEventListener('click', () => fecharConfirmar(false))
    document.getElementById('btnConfirmarNao2').addEventListener('click', () => fecharConfirmar(false))
}
