import { supabase, state } from './admin-state.js'

export async function verificarAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '../index.html'; return }

    const { data: admin } = await supabase
        .from('admin_users')
        .select('*, admin_roles(*)')
        .eq('user_id', session.user.id)
        .eq('active', true)
        .maybeSingle()

    if (!admin) {
        window.location.href = '../index.html'
        return
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .maybeSingle()

    state.currentAdmin = {
        userId: session.user.id,
        email: session.user.email,
        nome: profile?.full_name || session.user.email.split('@')[0],
        role: admin.admin_roles?.name || 'admin',
        roleLabel: admin.admin_roles?.description || admin.admin_roles?.name || 'Admin',
        permissions: admin.admin_roles?.permissions || {}
    }

    document.getElementById('adminNome').textContent = state.currentAdmin.nome
    document.getElementById('adminRole').textContent = state.currentAdmin.roleLabel
    document.getElementById('adminAvatar').textContent = state.currentAdmin.nome.charAt(0).toUpperCase()
    document.getElementById('adminDate').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}
