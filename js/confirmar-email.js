
        import { supabase } from './supabaseClient.js'

        // Gerar confetes
        function criarConfetes() {
            const container = document.getElementById('confetti')
            const cores = ['#2c4dfc', '#1a3ab0', '#fbbf24', '#34d399', '#f472b6', '#60a5fa', '#a78bfa']

            for (let i = 0; i < 30; i++) {
                const span = document.createElement('span')
                span.style.left = Math.random() * 100 + '%'
                span.style.background = cores[Math.floor(Math.random() * cores.length)]
                span.style.animationDuration = (2 + Math.random() * 2) + 's'
                span.style.animationDelay = Math.random() * 1.5 + 's'
                span.style.width = (5 + Math.random() * 8) + 'px'
                span.style.height = (5 + Math.random() * 8) + 'px'
                container.appendChild(span)
            }
        }

        // Processar confirmação do Supabase
        async function processarConfirmacao() {
            const hash = window.location.hash
            const params = new URLSearchParams(hash.replace('#', ''))
            const accessToken = params.get('access_token')
            const refreshToken = params.get('refresh_token')
            const type = params.get('type')

            try {
                if (accessToken && refreshToken) {
                    // Estabelecer a sessão com os tokens do email
                    const { data, error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    })
                    console.log('[Confirmar Email] Sessão estabelecida:', data?.session ? 'sim' : 'não', error || '')
                } else {
                    // Tentar pegar sessão existente (caso o Supabase já tenha processado o hash)
                    await supabase.auth.getSession()
                }
            } catch (err) {
                console.error('[Confirmar Email] Erro ao processar sessão:', err)
            }

            // Mostrar tela de sucesso
            setTimeout(() => {
                document.getElementById('verifying').classList.remove('active')
                document.getElementById('verified').classList.add('active')
                criarConfetes()
            }, 1200)
        }

        // Guard para garantir que o DOM está pronto antes de executar
        function whenDomReady(callback) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => callback(), { once: true })
            } else {
                callback()
            }
        }

        whenDomReady(() => processarConfirmacao())
    