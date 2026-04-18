
        import { supabase } from '../js/supabaseClient.js'

        // Se já está logado como admin, redirecionar direto ao painel
        // Se não, redirecionar para a home (login unificado)
        async function verificarSessaoAdmin() {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                const { data: admin } = await supabase
                    .from('admin_users')
                    .select('id, active')
                    .eq('user_id', session.user.id)
                    .eq('active', true)
                    .maybeSingle()
                if (admin) {
                    window.location.href = 'painel.html'
                    return
                }
            }
            // Não é admin ou não está logado → ir para home
            window.location.href = '../index.html'
        }
        verificarSessaoAdmin()
    