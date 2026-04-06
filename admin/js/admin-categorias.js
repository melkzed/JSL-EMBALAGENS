import { supabase, toast, esc, slugify, confirmar, openModal, closeModal } from './admin-state.js'

export async function carregarCategorias() {
    const { data: categorias, error } = await supabase
        .from('categories')
        .select('*, products(id)')
        .order('sort_order')

    const tbody = document.getElementById('tbodyCategorias')
    if (error) {
        console.error('Erro ao carregar categorias:', error)
        toast('Erro ao carregar categorias: ' + error.message, 'erro')
        tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Erro ao carregar categorias</td></tr>'
        return
    }
    if (!categorias || categorias.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Nenhuma categoria</td></tr>'
        return
    }

    tbody.innerHTML = categorias.map(c => `<tr>
        <td>${c.sort_order}</td>
        <td><strong>${esc(c.name)}</strong></td>
        <td><code>${esc(c.slug)}</code></td>
        <td>${(c.products || []).length}</td>
        <td><span class="admin-badge ${c.featured ? 'active' : 'inactive'}">${c.featured ? 'Sim' : 'Não'}</span></td>
        <td><span class="admin-badge ${c.active ? 'active' : 'inactive'}">${c.active ? 'Ativa' : 'Inativa'}</span></td>
        <td>
            <button class="admin-btn small secondary" onclick="window.adminEditCategoria('${c.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="admin-btn small danger" onclick="window.adminDeleteCategoria('${c.id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
    </tr>`).join('')
}

export async function abrirModalCategoria(catId = null) {
    try {
    document.getElementById('categoriaId').value = ''
    document.getElementById('categoriaNome').value = ''
    document.getElementById('categoriaSlug').value = ''
    document.getElementById('categoriaDescricao').value = ''
    document.getElementById('categoriaIcone').value = ''
    document.getElementById('categoriaIconePreview').innerHTML = ''
    document.getElementById('categoriaOrdem').value = '0'
    document.getElementById('categoriaAtiva').value = 'true'
    document.getElementById('categoriaFeatured').value = 'false'
    document.getElementById('categoriaSpecsContainer').innerHTML = ''
    document.getElementById('modalCategoriaTitulo').textContent = 'Nova Categoria'

    if (catId) {
        document.getElementById('modalCategoriaTitulo').textContent = 'Editar Categoria'
        const { data: cat, error: catError } = await supabase.from('categories').select('*').eq('id', catId).single()
        if (catError) {
            toast('Erro ao carregar categoria: ' + catError.message, 'erro')
            return
        }
        if (cat) {
            document.getElementById('categoriaId').value = cat.id
            document.getElementById('categoriaNome').value = cat.name
            document.getElementById('categoriaSlug').value = cat.slug
            document.getElementById('categoriaDescricao').value = cat.description || ''
            document.getElementById('categoriaIcone').value = cat.icon || ''
            document.getElementById('categoriaIconePreview').innerHTML = cat.icon ? `<i class="${cat.icon}"></i>` : ''
            document.getElementById('categoriaOrdem').value = cat.sort_order
            document.getElementById('categoriaAtiva').value = String(cat.active)
            document.getElementById('categoriaFeatured').value = String(!!cat.featured)

            
            const { data: specs } = await supabase
                .from('category_specs')
                .select('*')
                .eq('category_id', catId)
                .order('sort_order')

            ;(specs || []).forEach(spec => addCategoriaSpecRow(spec))
        }
    }

    openModal('modalCategoria')
    } catch (err) {
        console.error('Erro ao abrir modal de categoria:', err)
        toast('Erro ao abrir categoria: ' + err.message, 'erro')
    }
}

export function addCategoriaSpecRow(data = {}) {
    const container = document.getElementById('categoriaSpecsContainer')
    const row = document.createElement('div')
    row.className = 'admin-spec-row'
    row.innerHTML = `
        <div><label>Nome</label><input type="text" value="${esc(data.spec_name || '')}" class="admin-input cs-name" placeholder="Ex: Altura, Espessura"></div>
        <div><label>Unidade</label><input type="text" value="${esc(data.spec_unit || '')}" class="admin-input cs-unit" placeholder="mm, cm"></div>
        <div style="align-self:end">
            <input type="hidden" class="cs-id" value="${data.id || ''}">
            <button type="button" class="admin-btn small danger" onclick="this.closest('.admin-spec-row').remove()"><i class="fa-solid fa-trash"></i></button>
        </div>
    `
    container.appendChild(row)
}

export async function salvarCategoria(e) {
    e.preventDefault()
    const btnSalvar = document.getElementById('btnSalvarCategoria')
    const btnTextoOriginal = btnSalvar.innerHTML
    btnSalvar.disabled = true
    btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'

    try {
    const catId = document.getElementById('categoriaId').value || null
    const dados = {
        name: document.getElementById('categoriaNome').value.trim(),
        slug: document.getElementById('categoriaSlug').value.trim() || slugify(document.getElementById('categoriaNome').value),
        description: document.getElementById('categoriaDescricao').value.trim() || null,
        icon: document.getElementById('categoriaIcone').value.trim() || null,
        sort_order: parseInt(document.getElementById('categoriaOrdem').value) || 0,
        active: document.getElementById('categoriaAtiva').value === 'true',
        featured: document.getElementById('categoriaFeatured').value === 'true'
    }

    let finalCatId = catId
    if (catId) {
        const { error } = await supabase.from('categories').update(dados).eq('id', catId)
        if (error) { toast('Erro: ' + error.message, 'erro'); return }
    } else {
        const { data, error } = await supabase.from('categories').insert(dados).select().single()
        if (error) { toast('Erro: ' + error.message, 'erro'); return }
        finalCatId = data.id
    }

    
    const specRows = document.querySelectorAll('#categoriaSpecsContainer .admin-spec-row')
    const specIds = []

    for (let i = 0; i < specRows.length; i++) {
        const row = specRows[i]
        const specId = row.querySelector('.cs-id').value
        const specName = row.querySelector('.cs-name').value.trim()
        const specUnit = row.querySelector('.cs-unit').value.trim()

        if (!specName) continue

        const specData = {
            category_id: finalCatId,
            spec_name: specName,
            spec_unit: specUnit || null,
            sort_order: i
        }

        if (specId) {
            await supabase.from('category_specs').update(specData).eq('id', specId)
            specIds.push(specId)
        } else {
            const { data } = await supabase.from('category_specs').insert(specData).select('id').single()
            if (data) specIds.push(data.id)
        }
    }

    
    if (catId) {
        const { data: existentes } = await supabase
            .from('category_specs')
            .select('id')
            .eq('category_id', finalCatId)

        for (const ex of (existentes || [])) {
            if (!specIds.includes(ex.id)) {
                await supabase.from('category_specs').delete().eq('id', ex.id)
            }
        }
    }

    toast('Categoria salva!')
    closeModal('modalCategoria')
    carregarCategorias()
    } finally {
        btnSalvar.disabled = false
        btnSalvar.innerHTML = btnTextoOriginal
    }
}

export async function excluirCategoria(id) {
    if (!await confirmar('Excluir esta categoria?')) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) { toast('Erro: ' + error.message, 'erro'); return }
    toast('Categoria excluída!')
    carregarCategorias()
}
