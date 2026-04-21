import { supabase } from '../../js/supabaseClient.js'

// Se ja esta logado como admin, redireciona direto ao painel.
// Caso contrario, volta para a home, onde fica o login unificado.
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

    window.location.href = '../index.html'
}

verificarSessaoAdmin()
