import { supabase } from "./supabaseClient.js"
import { animarAuthContainer } from "./animacoes.js"
import { isUrlSegura } from "./utils.js"

function isInHtmlFolder() {
    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/')
    return path.includes('/html/')
}

function isFriendlyUrlHost() {
    const explicitFriendly = window.__JSL_ENABLE_FRIENDLY_ROUTES__ === true
    if (!explicitFriendly) return false

    const host = window.location.hostname
    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/')
    const isKnownHost = host === 'www.jslembalagens.com.br' || host === 'jslembalagens.com.br'
    const isHtmlBasedUrl = path.endsWith('.html') || path.includes('/html/')
    return isKnownHost && !isHtmlBasedUrl
}

function getPageHref(page) {
    const inHtmlFolder = isInHtmlFolder()
    const useFriendlyUrls = isFriendlyUrlHost()

    const routes = {
        index: useFriendlyUrls ? '/' : (inHtmlFolder ? '../index.html' : './index.html'),
        perfil: useFriendlyUrls ? '/perfil' : (inHtmlFolder ? './perfil.html' : './html/perfil.html'),
        'confirmar-email': useFriendlyUrls ? '/confirmar-email' : (inHtmlFolder ? './confirmar-email.html' : './html/confirmar-email.html')
    }

    return routes[page] || '#'
}

function getAbsolutePageUrl(page) {
    const href = getPageHref(page)
    return new URL(href, window.location.origin + '/').toString()
}

let currentUser = null
let currentProfile = null
let isAdmin = false

export function getUser() { return currentUser }
export function getProfile() { return currentProfile }
export function getIsAdmin() { return isAdmin }

export async function verificarSessao() {
    if (!supabase) return false
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
            currentUser = session.user
            currentProfile = await carregarPerfil(session.user.id)
            await verificarAdmin(session.user.id)
            atualizarUIUsuario()
            return true
        }
    } catch (err) {
        console.error('Erro ao verificar sessão:', err)
    }
    currentUser = null
    currentProfile = null
    isAdmin = false
    atualizarUIUsuario()
    return false
}

export function initAuthListener() {
    if (!supabase) return
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
            currentUser = session.user
            currentProfile = await carregarPerfil(session.user.id)
            await verificarAdmin(session.user.id)
            atualizarUIUsuario()
            window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: currentUser, profile: currentProfile } }))
        } else if (event === 'SIGNED_OUT') {
            currentUser = null
            currentProfile = null
            isAdmin = false
            atualizarUIUsuario()
            window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null, profile: null } }))
        }
    })
}


async function carregarPerfil(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

    if (error) {
        console.error('Erro ao carregar perfil:', error)
        return null
    }
    return data
}

async function verificarAdmin(userId) {
    try {
        const { data } = await supabase
            .from('admin_users')
            .select('id, active')
            .eq('user_id', userId)
            .eq('active', true)
            .maybeSingle()
        isAdmin = !!data
    } catch {
        isAdmin = false
    }
}


export async function cadastrar(email, senha, nome) {
    if (!supabase) return { sucesso: false, erro: 'Erro de conexão. Recarregue a página.' }
    const confirmUrl = getAbsolutePageUrl('confirmar-email')

    const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
            data: {
                full_name: nome || ''
            },
            emailRedirectTo: confirmUrl
        }
    })

    if (error) {
        return { sucesso: false, erro: traduzirErro(error.message) }
    }

    if (nome && data.user) {
        await supabase
            .from('profiles')
            .update({ full_name: nome })
            .eq('id', data.user.id)
    }

    return { sucesso: true, user: data.user, session: data.session }
}


export async function login(email, senha) {
    if (!supabase) return { sucesso: false, erro: 'Erro de conexão. Recarregue a página.' }
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: senha
    })

    if (error) {
        return { sucesso: false, erro: traduzirErro(error.message) }
    }

    return { sucesso: true, user: data.user, session: data.session }
}


export async function loginComGoogle() {
    if (!supabase) return { sucesso: false, erro: 'Erro de conexão. Recarregue a página.' }
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname + window.location.search
        }
    })

    if (error) {
        return { sucesso: false, erro: traduzirErro(error.message) }
    }

    return { sucesso: true }
}


export async function logout() {
    const { error } = await supabase.auth.signOut()
    if (error) {
        console.error('Erro ao fazer logout:', error)
        return false
    }
    currentUser = null
    currentProfile = null
    isAdmin = false
    atualizarUIUsuario()
    return true
}


export async function recuperarSenha(email) {
    if (!supabase) return { sucesso: false, erro: 'Erro de conexão. Recarregue a página.' }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAbsolutePageUrl('perfil')
    })

    if (error) {
        return { sucesso: false, erro: traduzirErro(error.message) }
    }

    return { sucesso: true }
}


function atualizarUIUsuario() {
    const profileEls = document.querySelectorAll('.profile')
    const adminLinks = document.querySelectorAll('.admin-link')

    
    const adminUrl = '/admin/painel.html'
    const perfilUrl = getPageHref('perfil')
    const homeUrl = getPageHref('index')

    adminLinks.forEach(el => {
        if (isAdmin) {
            el.style.display = 'flex'
            el.onclick = () => window.location.href = adminUrl
        } else {
            el.style.display = 'none'
            el.onclick = null
        }
    })

    profileEls.forEach(el => {
        if (currentUser) {
            const nome = currentProfile?.full_name || currentUser.user_metadata?.full_name || currentUser.email || ''
            const inicial = nome.charAt(0).toUpperCase() || 'U'

            if (currentProfile?.avatar_url && isUrlSegura(currentProfile.avatar_url)) {
                el.innerHTML = `<img src="${currentProfile.avatar_url}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
            } else {
                el.textContent = inicial
            }
            el.title = nome
            el.dataset.logado = 'true'
        } else {
            el.innerHTML = '<i class="fa-solid fa-user" style="font-size: 14px;"></i>'
            el.title = 'Entrar / Cadastrar'
            el.dataset.logado = 'false'
        }
    })

    const navMenu = document.getElementById('navMenu')
    if (navMenu) {
        navMenu.querySelectorAll('.nav-auth-link').forEach(el => el.remove())

        if (currentUser) {
            const nome = currentProfile?.full_name || currentUser.user_metadata?.full_name || 'Minha conta'
            const divider = document.createElement('div')
            divider.className = 'nav-auth-divider nav-auth-link'

            const contaLink = document.createElement('a')
            contaLink.href = perfilUrl
            contaLink.className = 'nav-auth-link nav-auth-conta'
            contaLink.innerHTML = `<i class="fa-solid fa-user-circle"></i> ${nome.split(' ')[0]}`

            const sairLink = document.createElement('a')
            sairLink.href = '#'
            sairLink.className = 'nav-auth-link nav-auth-sair'
            sairLink.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Sair da conta'
            sairLink.addEventListener('click', async (e) => {
                e.preventDefault()
                await logout()
                window.location.href = homeUrl
            })

            navMenu.appendChild(divider)
            navMenu.appendChild(contaLink)
            navMenu.appendChild(sairLink)
        }
    }
}


export function initAuthModal() {
    const modal = document.createElement('div')
    modal.id = 'authModal'
    modal.className = 'auth-modal'
    modal.innerHTML = `
        <div class="auth-overlay" id="authOverlay"></div>
        <div class="auth-container" id="authContainer">
            <!-- TAB: LOGIN -->
            <div class="auth-panel" id="authLoginPanel">
                <div class="auth-header">
                    <h2>Bem-vindo de volta</h2>
                    <p>Entre na sua conta para continuar</p>
                    <button class="auth-fechar" id="authFecharLogin"><i class="fa-solid fa-xmark"></i></button>
                </div>

                <button class="auth-google-btn" id="btnGoogleLogin">
                    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    Continuar com Google
                </button>

                <div class="auth-divider"><span>ou</span></div>

                <form id="formLogin" class="auth-form">
                    <div class="auth-campo">
                        <label for="loginEmail">E-mail</label>
                        <input type="email" id="loginEmail" placeholder="seu@email.com" required>
                    </div>
                    <div class="auth-campo">
                        <label for="loginSenha">Senha</label>
                        <div class="auth-senha-wrapper">
                            <input type="password" id="loginSenha" placeholder="Sua senha" required minlength="6">
                            <button type="button" class="auth-toggle-senha" data-target="loginSenha">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <button type="button" class="auth-link-esqueci" id="btnEsqueciSenha">Esqueci minha senha</button>
                    <div class="auth-erro" id="loginErro" style="display:none"></div>
                    <button type="submit" class="auth-submit-btn" id="btnSubmitLogin">
                        Entrar
                    </button>
                </form>

                <p class="auth-switch">
                    Não tem uma conta? <button type="button" id="btnIrCadastro">Criar conta</button>
                </p>
            </div>

            <!-- TAB: CADASTRO -->
            <div class="auth-panel" id="authCadastroPanel" style="display:none">
                <div class="auth-header">
                    <h2>Criar conta</h2>
                    <p>Cadastre-se para começar a comprar</p>
                    <button class="auth-fechar" id="authFecharCadastro"><i class="fa-solid fa-xmark"></i></button>
                </div>

                <button class="auth-google-btn" id="btnGoogleCadastro">
                    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    Continuar com Google
                </button>

                <div class="auth-divider"><span>ou</span></div>

                <form id="formCadastro" class="auth-form">
                    <div class="auth-campo">
                        <label for="cadastroNome">Nome <small>(opcional)</small></label>
                        <input type="text" id="cadastroNome" placeholder="Seu nome">
                    </div>
                    <div class="auth-campo">
                        <label for="cadastroEmail">E-mail</label>
                        <input type="email" id="cadastroEmail" placeholder="seu@email.com" required>
                    </div>
                    <div class="auth-campo">
                        <label for="cadastroSenha">Senha</label>
                        <div class="auth-senha-wrapper">
                            <input type="password" id="cadastroSenha" placeholder="Mínimo 6 caracteres" required minlength="6">
                            <button type="button" class="auth-toggle-senha" data-target="cadastroSenha">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <div class="auth-campo">
                        <label for="cadastroSenhaConfirm">Confirmar senha</label>
                        <div class="auth-senha-wrapper">
                            <input type="password" id="cadastroSenhaConfirm" placeholder="Repita a senha" required minlength="6">
                            <button type="button" class="auth-toggle-senha" data-target="cadastroSenhaConfirm">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <div class="auth-erro" id="cadastroErro" style="display:none"></div>
                    <button type="submit" class="auth-submit-btn" id="btnSubmitCadastro">
                        Criar conta
                    </button>
                </form>

                <p class="auth-switch">
                    Já tem uma conta? <button type="button" id="btnIrLogin">Entrar</button>
                </p>
            </div>

            <!-- TAB: RECUPERAR SENHA -->
            <div class="auth-panel" id="authRecuperarPanel" style="display:none">
                <div class="auth-header">
                    <h2>Recuperar senha</h2>
                    <p>Enviaremos um link de redefinição para seu e-mail</p>
                    <button class="auth-fechar" id="authFecharRecuperar"><i class="fa-solid fa-xmark"></i></button>
                </div>

                <form id="formRecuperar" class="auth-form">
                    <div class="auth-campo">
                        <label for="recuperarEmail">E-mail</label>
                        <input type="email" id="recuperarEmail" placeholder="seu@email.com" required>
                    </div>
                    <div class="auth-erro" id="recuperarErro" style="display:none"></div>
                    <div class="auth-sucesso" id="recuperarSucesso" style="display:none"></div>
                    <button type="submit" class="auth-submit-btn" id="btnSubmitRecuperar">
                        Enviar link
                    </button>
                </form>

                <p class="auth-switch">
                    <button type="button" id="btnVoltarLogin">Voltar ao login</button>
                </p>
            </div>

            <!-- TAB: MENU LOGADO -->
            <div class="auth-panel" id="authMenuLogado" style="display:none">
                <div class="auth-header">
                    <h2 id="authMenuNome">Minha conta</h2>
                    <p id="authMenuEmail">email@email.com</p>
                    <button class="auth-fechar" id="authFecharMenu"><i class="fa-solid fa-xmark"></i></button>
                </div>

                <div class="auth-menu-avatar" id="authMenuAvatar">
                    <div class="auth-avatar-circle" id="authAvatarCircle">U</div>
                </div>

                <nav class="auth-menu-links">
                    <a href="#" id="authLinkPerfil">
                        <i class="fa-solid fa-user"></i> Meu Perfil
                    </a>
                    <a href="#" id="authLinkEnderecos">
                        <i class="fa-solid fa-location-dot"></i> Meus Endereços
                    </a>
                    <a href="#" id="authLinkPedidos">
                        <i class="fa-solid fa-box"></i> Meus Pedidos
                    </a>
                    <a href="#" id="authLinkFavoritos">
                        <i class="fa-solid fa-heart"></i> Favoritos
                    </a>
                    <a href="#" id="authLinkPreferencias">
                        <i class="fa-solid fa-gear"></i> Preferências
                    </a>
                </nav>

                <button class="auth-logout-btn" id="btnLogout">
                    <i class="fa-solid fa-right-from-bracket"></i> Sair
                </button>
            </div>
        </div>
    `
    document.body.appendChild(modal)

    const perfilUrl = getPageHref('perfil')

    document.getElementById('authLinkPerfil').href = perfilUrl
    document.getElementById('authLinkEnderecos').href = perfilUrl + '?tab=enderecos'
    document.getElementById('authLinkPedidos').href = perfilUrl + '?tab=pedidos'
    document.getElementById('authLinkFavoritos').href = perfilUrl + '?tab=favoritos'
    document.getElementById('authLinkPreferencias').href = perfilUrl + '?tab=preferencias'

    

    const fecharModal = () => {
        modal.classList.remove('aberto')
        document.body.style.overflow = ''
    }

    document.getElementById('authOverlay').addEventListener('click', fecharModal)
    document.getElementById('authFecharLogin').addEventListener('click', fecharModal)
    document.getElementById('authFecharCadastro').addEventListener('click', fecharModal)
    document.getElementById('authFecharRecuperar').addEventListener('click', fecharModal)
    document.getElementById('authFecharMenu').addEventListener('click', fecharModal)

    const mostrarPainel = (id) => {
        document.querySelectorAll('#authModal .auth-panel').forEach(p => p.style.display = 'none')
        document.getElementById(id).style.display = ''
    }

    document.getElementById('btnIrCadastro').addEventListener('click', () => mostrarPainel('authCadastroPanel'))
    document.getElementById('btnIrLogin').addEventListener('click', () => mostrarPainel('authLoginPanel'))
    document.getElementById('btnEsqueciSenha').addEventListener('click', () => mostrarPainel('authRecuperarPanel'))
    document.getElementById('btnVoltarLogin').addEventListener('click', () => mostrarPainel('authLoginPanel'))

    document.querySelectorAll('.auth-toggle-senha').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target)
            const icon = btn.querySelector('i')
            if (input.type === 'password') {
                input.type = 'text'
                icon.className = 'fa-solid fa-eye-slash'
            } else {
                input.type = 'password'
                icon.className = 'fa-solid fa-eye'
            }
        })
    })

    document.getElementById('btnGoogleLogin').addEventListener('click', async () => {
        const res = await loginComGoogle()
        if (!res.sucesso) mostrarErro('loginErro', res.erro)
    })
    document.getElementById('btnGoogleCadastro').addEventListener('click', async () => {
        const res = await loginComGoogle()
        if (!res.sucesso) mostrarErro('cadastroErro', res.erro)
    })

    document.getElementById('formLogin').addEventListener('submit', async (e) => {
        e.preventDefault()
        const email = document.getElementById('loginEmail').value.trim()
        const senha = document.getElementById('loginSenha').value
        const btn = document.getElementById('btnSubmitLogin')

        esconderErro('loginErro')
        btn.disabled = true
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...'

        try {
            const res = await login(email, senha)

            if (res.sucesso) {
                fecharModal()
                document.getElementById('formLogin').reset()
            } else {
                mostrarErro('loginErro', res.erro)
            }
        } catch (err) {
            console.error('Erro no login:', err)
            mostrarErro('loginErro', 'Erro de conexão. Verifique sua internet e tente novamente.')
        }

        btn.disabled = false
        btn.textContent = 'Entrar'
    })

    document.getElementById('formCadastro').addEventListener('submit', async (e) => {
        e.preventDefault()
        const nome = document.getElementById('cadastroNome').value.trim()
        const email = document.getElementById('cadastroEmail').value.trim()
        const senha = document.getElementById('cadastroSenha').value
        const confirmar = document.getElementById('cadastroSenhaConfirm').value
        const btn = document.getElementById('btnSubmitCadastro')

        esconderErro('cadastroErro')

        if (senha !== confirmar) {
            mostrarErro('cadastroErro', 'As senhas não coincidem.')
            return
        }

        btn.disabled = true
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando conta...'

        try {
            const res = await cadastrar(email, senha, nome)

            if (res.sucesso) {
                document.getElementById('formCadastro').reset()
                if (res.session) {
                    
                    fecharModal()
                } else {
                    
                    if (res.user && res.user.identities && res.user.identities.length === 0) {
                        mostrarErro('cadastroErro', 'Este e-mail já está cadastrado. Tente fazer login com Google ou use outra conta.')
                    } else {
                        
                        esconderErro('cadastroErro')
                        mostrarSucesso('cadastroErro', 'Conta criada com sucesso! Verifique seu e-mail para confirmar.')
                    }
                }
            } else {
                mostrarErro('cadastroErro', res.erro)
            }
        } catch (err) {
            console.error('Erro no cadastro:', err)
            mostrarErro('cadastroErro', 'Erro de conexão. Verifique sua internet e tente novamente.')
        }

        btn.disabled = false
        btn.textContent = 'Criar conta'
    })

    document.getElementById('formRecuperar').addEventListener('submit', async (e) => {
        e.preventDefault()
        const email = document.getElementById('recuperarEmail').value.trim()
        const btn = document.getElementById('btnSubmitRecuperar')

        esconderErro('recuperarErro')
        document.getElementById('recuperarSucesso').style.display = 'none'

        btn.disabled = true
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'

        const res = await recuperarSenha(email)

        if (res.sucesso) {
            document.getElementById('recuperarSucesso').textContent = 'Link enviado! Verifique sua caixa de entrada.'
            document.getElementById('recuperarSucesso').style.display = ''
        } else {
            mostrarErro('recuperarErro', res.erro)
        }

        btn.disabled = false
        btn.textContent = 'Enviar link'
    })

    document.getElementById('btnLogout').addEventListener('click', async () => {
        await logout()
        fecharModal()
        window.location.href = '/'
    })

    
    document.querySelectorAll('.profile').forEach(el => {
        el.style.cursor = 'pointer'
        el.addEventListener('click', () => {
            if (currentUser) {
                
                const menuNome = document.getElementById('authMenuNome')
                const menuEmail = document.getElementById('authMenuEmail')
                const avatarCircle = document.getElementById('authAvatarCircle')

                const nome = currentProfile?.full_name || currentUser.user_metadata?.full_name || 'Minha conta'
                menuNome.textContent = nome
                menuEmail.textContent = currentUser.email

                const inicial = nome.charAt(0).toUpperCase() || 'U'
                if (currentProfile?.avatar_url && isUrlSegura(currentProfile.avatar_url)) {
                    avatarCircle.innerHTML = `<img src="${currentProfile.avatar_url}" alt="Avatar">`
                } else {
                    avatarCircle.textContent = inicial
                }

                mostrarPainel('authMenuLogado')
            } else {
                
                mostrarPainel('authLoginPanel')
            }
            modal.classList.add('aberto')
            document.body.style.overflow = 'hidden'
            animarAuthContainer(document.getElementById('authContainer'))
        })
    })
}


export function abrirAuthModal(painel = 'authLoginPanel') {
    const modal = document.getElementById('authModal')
    if (!modal) return
    modal.querySelectorAll('.auth-panel').forEach(p => p.style.display = 'none')
    const target = document.getElementById(painel)
    if (target) target.style.display = ''
    modal.classList.add('aberto')
    document.body.style.overflow = 'hidden'
    animarAuthContainer(document.getElementById('authContainer'))
}


function mostrarErro(elementId, msg) {
    const el = document.getElementById(elementId)
    if (!el) return
    el.textContent = msg
    el.style.display = ''
    el.className = 'auth-erro'
}

function mostrarSucesso(elementId, msg) {
    const el = document.getElementById(elementId)
    if (!el) return
    el.textContent = msg
    el.style.display = ''
    el.className = 'auth-sucesso'
}

function esconderErro(elementId) {
    const el = document.getElementById(elementId)
    if (el) el.style.display = 'none'
}

function traduzirErro(msg) {
    const map = {
        'Invalid login credentials': 'E-mail ou senha incorretos.',
        'Email not confirmed': 'E-mail ainda não confirmado. Verifique sua caixa de entrada.',
        'User already registered': 'Este e-mail já está cadastrado.',
        'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
        'Unable to validate email address: invalid format': 'Formato de e-mail inválido.',
        'Email rate limit exceeded': 'Muitas tentativas. Aguarde alguns minutos.',
        'For security purposes, you can only request this after': 'Aguarde um momento antes de tentar novamente.',
        'Signup requires a valid password': 'Informe uma senha válida.'
    }

    for (const [key, val] of Object.entries(map)) {
        if (msg.includes(key)) return val
    }
    return msg
}
