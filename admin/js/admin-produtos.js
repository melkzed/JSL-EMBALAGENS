import { supabase, state, toast, esc, formatPrice, openModal, closeModal, confirmar, slugify, toTitleCase } from './admin-state.js'

export async function carregarCategoriasCacheESelect() {
    const { data } = await supabase
        .from('categories')
        .select('id, name')
        .eq('active', true)
        .order('sort_order')

    state.categoriasCache = data || []

    
    const opcoes = '<option value="">Selecione...</option>' +
        state.categoriasCache.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')

    const ids = ['filtroProdutoCategoria', 'produtoCategoria']
    ids.forEach(id => {
        const el = document.getElementById(id)
        if (el) {
            const val = el.value
            el.innerHTML = id.includes('filtro')
                ? '<option value="">Todas categorias</option>' + state.categoriasCache.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
                : opcoes
            el.value = val
        }
    })
}

export async function carregarProdutos() {
    await carregarCategoriasCacheESelect()

    const busca = document.getElementById('filtroProdutoBusca').value.trim()
    const catFiltro = document.getElementById('filtroProdutoCategoria').value
    const statusFiltro = document.getElementById('filtroProdutoStatus').value

    let query = supabase
        .from('products')
        .select(`
            id, name, slug, active, featured, category_id,
            categories(name),
            product_variants(id, price, stock, size_label),
            product_images(url, is_primary, sort_order)
        `)
        .order('created_at', { ascending: false })

    if (busca) query = query.ilike('name', `%${busca}%`)
    if (catFiltro) query = query.eq('category_id', catFiltro)
    if (statusFiltro !== '') query = query.eq('active', statusFiltro === 'true')

    const { data: produtos, error } = await query
    if (error) { toast('Erro ao carregar produtos: ' + error.message, 'erro'); return }

    const tbody = document.getElementById('tbodyProdutos')
    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Nenhum produto encontrado</td></tr>'
        return
    }

    tbody.innerHTML = produtos.map(p => {
        const img = (p.product_images || []).sort((a, b) => {
            if (a.is_primary && !b.is_primary) return -1
            if (!a.is_primary && b.is_primary) return 1
            return a.sort_order - b.sort_order
        })[0]
        const variants = p.product_variants || []
        const precoMin = variants.length > 0 ? Math.min(...variants.map(v => v.price)) : 0
        const precoMax = variants.length > 0 ? Math.max(...variants.map(v => v.price)) : 0
        const estoqueTotal = variants.reduce((s, v) => s + (v.stock || 0), 0)
        const preco = precoMin === precoMax ? formatPrice(precoMin) : `${formatPrice(precoMin)} - ${formatPrice(precoMax)}`

        return `<tr>
            <td>${img ? `<img src="${esc(img.url)}" class="product-thumb" alt="">` : '<div class="product-thumb" style="background:#eee;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-image" style="color:#ccc"></i></div>'}</td>
            <td><strong>${esc(p.name)}</strong><br><small style="color:#9ca3af">${variants.length} variante(s)</small></td>
            <td>${esc(p.categories?.name || '—')}</td>
            <td>${preco}</td>
            <td>${estoqueTotal}</td>
            <td><span class="admin-badge ${p.active ? 'active' : 'inactive'}">${p.active ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="admin-btn small secondary" onclick="window.adminEditProduto('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="admin-btn small danger" onclick="window.adminDeleteProduto('${p.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`
    }).join('')
}

export async function abrirModalProduto(produtoId = null) {
    await carregarCategoriasCacheESelect()

    document.getElementById('produtoId').value = ''
    document.getElementById('produtoNome').value = ''
    document.getElementById('produtoSlug').value = ''
    document.getElementById('produtoDescricao').value = ''
    document.getElementById('produtoCategoria').value = ''
    document.getElementById('produtoFeatured').value = 'false'
    document.getElementById('produtoAtivo').value = 'true'
    document.getElementById('variantesContainer').innerHTML = ''
    document.getElementById('imagensContainer').innerHTML = ''
    document.getElementById('imagensPreview').innerHTML = ''
    document.getElementById('specsContainer').innerHTML = ''
    document.getElementById('modalProdutoTitulo').textContent = 'Novo Produto'

    if (produtoId) {
        document.getElementById('modalProdutoTitulo').textContent = 'Editar Produto'
        document.getElementById('produtoId').value = produtoId

        const { data: prod } = await supabase
            .from('products')
            .select('*, product_variants(*), product_images(*)')
            .eq('id', produtoId)
            .single()

        if (prod) {
            document.getElementById('produtoNome').value = prod.name || ''
            document.getElementById('produtoSlug').value = prod.slug || ''
            document.getElementById('produtoDescricao').value = prod.description || ''
            document.getElementById('produtoCategoria').value = prod.category_id || ''
            document.getElementById('produtoFeatured').value = String(prod.featured)
            document.getElementById('produtoAtivo').value = String(prod.active)

            
            const container = document.getElementById('variantesContainer')
            ;(prod.product_variants || []).sort((a, b) => a.sort_order - b.sort_order).forEach(v => {
                addVarianteRow(v)
            })

            
            const imgContainer = document.getElementById('imagensContainer')
            imgContainer.innerHTML = (prod.product_images || []).sort((a, b) => a.sort_order - b.sort_order).map(img => `
                <div style="position:relative;display:inline-block">
                    <img src="${esc(img.url)}" class="admin-img-thumb">
                    <button type="button" class="admin-btn small danger" style="position:absolute;top:-6px;right:-6px;padding:2px 6px;font-size:0.65rem;border-radius:50%"
                        onclick="window.adminDeleteImagem('${img.id}', this)"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `).join('')

            
            if (prod.category_id) {
                await carregarSpecsProduto(prod.category_id, produtoId, prod.product_variants || [])
            }
        }
    }

    openModal('modalProduto')
}

export async function carregarSpecsProduto(categoryId, produtoId, variants) {
    const { data: specs } = await supabase
        .from('category_specs')
        .select('*')
        .eq('category_id', categoryId)
        .order('sort_order')

    if (!specs || specs.length === 0) {
        document.getElementById('specsContainer').innerHTML = '<p style="font-size:0.82rem;color:#9ca3af">Nenhuma informação técnica definida para esta categoria.</p>'
        return
    }

    
    const variantIds = variants.map(v => v.id).filter(Boolean)
    let existingValues = []
    if (variantIds.length > 0) {
        const { data } = await supabase
            .from('variant_spec_values')
            .select('*')
            .in('variant_id', variantIds)
        existingValues = data || []
    }

    const container = document.getElementById('specsContainer')
    container.innerHTML = '<p style="font-size:0.78rem;color:#6b7280;margin-bottom:0.5rem">Preencha as informações técnicas para cada variante:</p>'

    
    const variantRows = document.querySelectorAll('#variantesContainer .admin-variant-row')
    variantRows.forEach((row, idx) => {
        const vId = row.querySelector('.v-id').value
        const vLabel = row.querySelector('.v-size').value || `Variante ${idx + 1}`

        const specDiv = document.createElement('div')
        specDiv.className = 'admin-spec-variant-group'
        specDiv.style.cssText = 'margin-bottom:1rem;padding:0.75rem;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb'
        specDiv.innerHTML = `<strong style="font-size:0.8rem;color:#374151;display:block;margin-bottom:0.5rem">${esc(vLabel)}</strong>`

        specs.forEach(spec => {
            const existing = existingValues.find(ev => ev.variant_id === vId && ev.spec_id === spec.id)
            const specRow = document.createElement('div')
            specRow.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-bottom:0.35rem'
            specRow.innerHTML = `
                <label style="min-width:120px;font-size:0.78rem;font-weight:600;color:#6b7280">${esc(spec.spec_name)}${spec.spec_unit ? ' (' + esc(spec.spec_unit) + ')' : ''}</label>
                <input type="text" class="admin-input spec-value" data-spec-id="${spec.id}" data-variant-idx="${idx}" value="${esc(existing?.value || '')}" style="padding:6px 10px;font-size:0.8rem;max-width:200px">
            `
            specDiv.appendChild(specRow)
        })
        container.appendChild(specDiv)
    })
}

export function addVarianteRow(data = {}) {
    const container = document.getElementById('variantesContainer')
    const row = document.createElement('div')
    row.className = 'admin-variant-row'
    row.innerHTML = `
        <div><label>Tamanho</label><input type="text" value="${esc(data.size_label || '')}" class="admin-input v-size" placeholder="Ex: P, M, G"></div>
        <div><label>SKU</label><input type="text" value="${esc(data.sku || '')}" class="admin-input v-sku"></div>
        <div><label>Preço (R$)</label><input type="number" step="0.01" value="${data.price || ''}" class="admin-input v-price" required></div>
        <div><label>Preço Ant.</label><input type="number" step="0.01" value="${data.compare_at_price || ''}" class="admin-input v-compare"></div>
        <div><label>Estoque</label><input type="number" value="${data.stock ?? 0}" class="admin-input v-stock"></div>
        <div style="align-self:end">
            <input type="hidden" class="v-id" value="${data.id || ''}">
            <button type="button" class="admin-btn small danger" onclick="this.closest('.admin-variant-row').remove()"><i class="fa-solid fa-trash"></i></button>
        </div>
    `
    container.appendChild(row)
}

export async function salvarProduto(e) {
    e.preventDefault()
    const btnSalvar = document.getElementById('btnSalvarProduto')
    const btnTextoOriginal = btnSalvar.innerHTML
    btnSalvar.disabled = true
    btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'

    try {
    await _salvarProdutoInterno()
    } catch (err) {
        toast('Erro inesperado: ' + err.message, 'erro')
    } finally {
        btnSalvar.disabled = false
        btnSalvar.innerHTML = btnTextoOriginal
    }
}

async function _salvarProdutoInterno() {
    const produtoId = document.getElementById('produtoId').value || null
    const nomeRaw = document.getElementById('produtoNome').value.trim()

    
    const rows = document.querySelectorAll('#variantesContainer .admin-variant-row')
    if (rows.length === 0) {
        toast('Adicione pelo menos uma variante com preço para o produto.', 'erro')
        return
    }
    let temPrecoValido = false
    for (const row of rows) {
        const p = parseFloat(row.querySelector('.v-price').value)
        if (p && p >= 0.01) { temPrecoValido = true; break }
    }
    if (!temPrecoValido) {
        toast('Pelo menos uma variante deve ter um preço válido (mínimo R$ 0,01).', 'erro')
        return
    }

    const dados = {
        name: toTitleCase(nomeRaw),
        slug: document.getElementById('produtoSlug').value.trim() || slugify(document.getElementById('produtoNome').value),
        description: document.getElementById('produtoDescricao').value.trim(),
        category_id: document.getElementById('produtoCategoria').value || null,
        featured: document.getElementById('produtoFeatured').value === 'true',
        active: document.getElementById('produtoAtivo').value === 'true'
    }

    let finalId = produtoId
    if (produtoId) {
        const { error } = await supabase.from('products').update(dados).eq('id', produtoId)
        if (error) { toast('Erro ao atualizar produto: ' + error.message, 'erro'); return }
    } else {
        const { data, error } = await supabase.from('products').insert(dados).select().single()
        if (error) { toast('Erro ao criar produto: ' + error.message, 'erro'); return }
        finalId = data.id
    }

    
    const variantesIds = []
    for (const row of rows) {
        const vId = row.querySelector('.v-id').value
        const priceVal = parseFloat(row.querySelector('.v-price').value)
        if (!priceVal || priceVal < 0.01) {
            toast('O preço de cada variante deve ser no mínimo R$ 0,01', 'erro')
            return
        }
        const compareVal = parseFloat(row.querySelector('.v-compare').value)
        if (compareVal && compareVal < 0.01) {
            toast('O preço anterior deve ser no mínimo R$ 0,01 ou vazio', 'erro')
            return
        }
        const vData = {
            product_id: finalId,
            size_label: row.querySelector('.v-size').value.trim(),
            sku: row.querySelector('.v-sku').value.trim() || null,
            price: priceVal,
            compare_at_price: compareVal || null,
            stock: parseInt(row.querySelector('.v-stock').value) || 0
        }

        if (vId) {
            await supabase.from('product_variants').update(vData).eq('id', vId)
            variantesIds.push(vId)
        } else {
            const { data } = await supabase.from('product_variants').insert(vData).select('id').single()
            if (data) variantesIds.push(data.id)
        }
    }

    
    if (produtoId) {
        const { data: existentes } = await supabase
            .from('product_variants')
            .select('id')
            .eq('product_id', finalId)

        for (const ex of (existentes || [])) {
            if (!variantesIds.includes(ex.id)) {
                await supabase.from('product_variants').delete().eq('id', ex.id)
            }
        }
    }

    
    const files = document.getElementById('inputImagemProduto').files
    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileName = `${finalId}/${Date.now()}_${i}.${file.name.split('.').pop()}`
        const { error: upErr } = await supabase.storage.from('products').upload(fileName, file)
        if (!upErr) {
            const { data: urlData } = supabase.storage.from('products').getPublicUrl(fileName)
            await supabase.from('product_images').insert({
                product_id: finalId,
                url: urlData.publicUrl,
                sort_order: i,
                is_primary: i === 0 && document.getElementById('imagensContainer').children.length === 0
            })
        }
    }

    
    const specInputs = document.querySelectorAll('#specsContainer .spec-value')
    const variantRowsList = document.querySelectorAll('#variantesContainer .admin-variant-row')
    for (const input of specInputs) {
        const specId = input.dataset.specId
        const varIdx = parseInt(input.dataset.variantIdx)
        const valor = input.value.trim()
        const variantRow = variantRowsList[varIdx]
        if (!variantRow) continue
        const vId = variantRow.querySelector('.v-id').value
        if (!vId) continue

        if (valor) {
            await supabase.from('variant_spec_values').upsert({
                variant_id: vId,
                spec_id: specId,
                value: valor
            }, { onConflict: 'variant_id,spec_id' })
        } else {
            await supabase.from('variant_spec_values').delete()
                .eq('variant_id', vId)
                .eq('spec_id', specId)
        }
    }

    toast('Produto salvo com sucesso!')
    closeModal('modalProduto')
    carregarProdutos()
}

export async function excluirProduto(id) {
    if (!await confirmar('Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.')) return
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'erro'); return }
    toast('Produto excluído!')
    carregarProdutos()
}

export async function excluirImagem(imgId, btn) {
    const { error } = await supabase.from('product_images').delete().eq('id', imgId)
    if (!error) btn.closest('div').remove()
}
