import { supabase, state, toast, esc, formatDate, openModal, closeModal, pedirSenha } from './admin-state.js'

export async function carregarRoles() {
    const { data } = await supabase.from('admin_roles').select('*').order('name')
    state.rolesCache = data || []
    const sel = document.getElementById('adminNovoRole')
    sel.innerHTML = state.rolesCache.map(r => `<option value="${r.id}">${esc(r.description || r.name)}</option>`).join('')
}

export async function carregarAdmins() {
    await carregarRoles()

    
    const { data: admins, error } = await supabase
        .from('admin_users')
        .select('*, profiles(full_name, email), admin_roles(name, description)')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao carregar admins:', error)
        toast('Erro ao carregar administradores: ' + error.message, 'erro')
    }

    const isSuperAdmin = state.currentAdmin.role === 'super_admin'

    const tbody = document.getElementById('tbodyAdmins')
    if (!admins || admins.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Nenhum administrador encontrado</td></tr>'
        return
    }

    tbody.innerHTML = admins.map(a => {
        let acoes = ''
        if (a.active) {
            acoes += `<button class="admin-btn small danger" onclick="window.adminDesativar('${a.id}')"><i class="fa-solid fa-ban"></i> Desativar</button> `
        } else {
            acoes += `<button class="admin-btn small success" onclick="window.adminAtivar('${a.id}')"><i class="fa-solid fa-check"></i> Ativar</button> `
        }
        
        if (isSuperAdmin && a.user_id !== state.currentAdmin.userId) {
            acoes += `<select class="admin-select" style="display:inline;width:auto;font-size:0.72rem;padding:4px 6px" onchange="window.adminMudarCargoAdmin('${a.id}', this.value)">
                ${state.rolesCache.map(r => `<option value="${r.id}" ${r.id === a.role_id ? 'selected' : ''}>${esc(r.description || r.name)}</option>`).join('')}
            </select>`
        }

        return `<tr>
            <td>${esc(a.profiles?.full_name || 'Sem nome')}</td>
            <td><small style="color:#6b7280">${esc(a.profiles?.email || '—')}</small></td>
            <td>${esc(a.admin_roles?.description || a.admin_roles?.name || '—')}</td>
            <td><span class="admin-badge ${a.active ? 'active' : 'inactive'}">${a.active ? 'Ativo' : 'Inativo'}</span></td>
            <td>${formatDate(a.created_at)}</td>
            <td>${acoes}</td>
        </tr>`
    }).join('')
}

export async function mudarCargoAdmin(adminId, novoRoleId) {
    if (!novoRoleId) return
    const { error } = await supabase.from('admin_users').update({ role_id: novoRoleId }).eq('id', adminId)
    if (error) { toast('Erro ao mudar cargo: ' + error.message, 'erro'); return }
    toast('Cargo atualizado!')
}

export async function criarAdmin(e) {
    e.preventDefault()

    
    if (state.currentAdmin.role !== 'super_admin') {
        toast('Apenas administradores com acesso total podem adicionar novos admins', 'erro')
        return
    }

    const email = document.getElementById('adminNovoEmail').value.trim()
    const roleId = document.getElementById('adminNovoRole').value

    if (!email || !roleId) { toast('Preencha todos os campos', 'erro'); return }

    
    const { data: profile, error: emailErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()

    if (emailErr || !profile) {
        toast('Usuário com este email não encontrado. Ele precisa estar cadastrado no site primeiro.', 'erro')
        return
    }

    const userId = profile.id

    
    const { data: existe } = await supabase.from('admin_users').select('id').eq('user_id', userId).maybeSingle()
    if (existe) {
        toast('Este usuário já é administrador', 'erro')
        return
    }

    const { error } = await supabase.from('admin_users').insert({ user_id: userId, role_id: roleId, active: true })
    if (error) { toast('Erro ao criar admin: ' + error.message, 'erro'); return }

    toast('Administrador adicionado com sucesso!')
    closeModal('modalAdmin')
    carregarAdmins()
}

export async function desativarAdmin(adminId) {
    pedirSenha('Desativar Administrador', 'Digite "desativar" para confirmar:', async (senha) => {
        if (senha.trim().toLowerCase() !== 'desativar') {
            document.getElementById('senhaErro').textContent = 'Senha incorreta!'
            document.getElementById('senhaErro').style.display = 'block'
            return
        }
        closeModal('modalSenha')

        
        const btn = document.querySelector(`[onclick*="adminDesativar('${adminId}')"]`)
        const btnTextoOriginal = btn ? btn.innerHTML : ''
        if (btn) {
            btn.disabled = true
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Desativando...'
        }

        const { data, error } = await supabase.from('admin_users').update({ active: false }).eq('id', adminId).select()

        if (btn) { btn.disabled = false; btn.innerHTML = btnTextoOriginal }

        if (error) {
            console.error('Erro ao desativar admin:', error)
            toast('Erro ao desativar: ' + error.message, 'erro')
            return
        }
        if (!data || data.length === 0) {
            toast('Não foi possível desativar. Verifique as permissões.', 'erro')
            return
        }
        toast('Administrador desativado!')
        carregarAdmins()
    })
}

export async function ativarAdmin(adminId) {
    const { error } = await supabase.from('admin_users').update({ active: true }).eq('id', adminId)
    if (error) { toast('Erro: ' + error.message, 'erro'); return }
    toast('Administrador ativado!')
    carregarAdmins()
}
