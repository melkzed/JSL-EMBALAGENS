import { supabase } from "./supabaseClient.js"
import { adicionarAoCarrinho } from "./cart.js"
import { escapeHtml, formatarPreco } from "./utils.js"



function showNotificacao(msg, tipo = 'sucesso') {
    
    const antiga = document.querySelector('.pd-notificacao-flutuante')
    if (antiga) antiga.remove()

    const card = document.createElement('div')
    card.className = `pd-notificacao-flutuante pd-notif-${tipo}`
    const icone = tipo === 'sucesso'
        ? '<i class="fa-solid fa-circle-check"></i>'
        : '<i class="fa-solid fa-circle-exclamation"></i>'
    card.innerHTML = `${icone}<span>${msg}</span><button class="pd-notif-fechar"><i class="fa-solid fa-xmark"></i></button>`
    document.body.appendChild(card)

    
    requestAnimationFrame(() => card.classList.add('visivel'))

    
    card.querySelector('.pd-notif-fechar').addEventListener('click', () => {
        card.classList.remove('visivel')
        setTimeout(() => card.remove(), 300)
    })

    
    setTimeout(() => {
        card.classList.remove('visivel')
        setTimeout(() => card.remove(), 300)
    }, 4500)
}



async function carregarProduto(id) {
    const { data, error } = await supabase
        .from("products")
        .select(`
            *,
            product_variants (*),
            product_images (*),
            categories (*)
        `)
        .eq("id", id)
        .single()

    if (error) {
        console.error("Erro ao buscar produto:", error)
        return null
    }

    
    if (data && data.category_id) {
        const { data: specs } = await supabase
            .from("category_specs")
            .select("*")
            .eq("category_id", data.category_id)
            .order("sort_order")

        data._categorySpecs = specs || []

        if (data.product_variants?.length) {
            const variantIds = data.product_variants.map(v => v.id)
            const { data: specValues } = await supabase
                .from("variant_spec_values")
                .select("*")
                .in("variant_id", variantIds)

            data._specValues = specValues || []
        }
    }

    return data
}

async function carregarProdutoPorSlug(slug) {
    const { data, error } = await supabase
        .from("products")
        .select(`
            *,
            product_variants (*),
            product_images (*),
            categories (*)
        `)
        .eq("slug", slug)
        .single()

    if (error) {
        console.error("Erro ao buscar produto por slug:", error)
        return null
    }

    if (data && data.category_id) {
        const { data: specs } = await supabase
            .from("category_specs")
            .select("*")
            .eq("category_id", data.category_id)
            .order("sort_order")

        data._categorySpecs = specs || []

        if (data.product_variants?.length) {
            const variantIds = data.product_variants.map(v => v.id)
            const { data: specValues } = await supabase
                .from("variant_spec_values")
                .select("*")
                .in("variant_id", variantIds)

            data._specValues = specValues || []
        }
    }

    return data
}



async function carregarAvaliacoes(productId) {
    
    let query = supabase
        .from("reviews")
        .select("*")
        .eq("product_id", productId)
        .eq("approved", true)
        .order("created_at", { ascending: false })

    
    let { data: aprovadas, error } = await query.eq("deleted_by_user", false)

    
    if (error) {
        const retry = await supabase
            .from("reviews")
            .select("*")
            .eq("product_id", productId)
            .eq("approved", true)
            .order("created_at", { ascending: false })
        aprovadas = retry.data
        error = retry.error
    }

    if (error) {
        console.error("Erro ao buscar avaliações:", error)
        return []
    }

    let resultado = aprovadas || []

    
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
        let minhaQuery = supabase
            .from("reviews")
            .select("*")
            .eq("product_id", productId)
            .eq("user_id", user.id)
            .eq("approved", false)

        let { data: minhaReview } = await minhaQuery.eq("deleted_by_user", false).maybeSingle()

        
        if (minhaReview === undefined) {
            const retry2 = await supabase
                .from("reviews")
                .select("*")
                .eq("product_id", productId)
                .eq("user_id", user.id)
                .eq("approved", false)
                .maybeSingle()
            minhaReview = retry2.data
        }

        if (minhaReview) {
            minhaReview._pendente = true
            resultado = [minhaReview, ...resultado]
        }

        
        resultado.forEach(r => {
            if (r.user_id === user.id) r._minha = true
        })
    }

    
    const userIds = [...new Set(resultado.map(r => r.user_id).filter(Boolean))]
    if (userIds.length > 0) {
        const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", userIds)

        const profileMap = {}
        ;(profiles || []).forEach(p => profileMap[p.id] = p)
        resultado.forEach(r => {
            r._profile = profileMap[r.user_id] || null
        })
    }

    return resultado
}

async function enviarAvaliacao(productId, nota, comentario, arquivosImagens) {
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { ok: false, msg: 'Você precisa estar logado para avaliar.' }
    }

    
    const { data: existente, error: checkErr } = await supabase
        .from("reviews")
        .select("id")
        .eq("product_id", productId)
        .eq("user_id", user.id)
        .maybeSingle()

    if (checkErr) {
        console.error("Erro ao verificar avaliação existente:", checkErr)
    }

    if (existente) {
        return { ok: false, msg: 'Você já avaliou este produto.' }
    }

    
    let imageUrls = []
    if (arquivosImagens && arquivosImagens.length > 0) {
        for (const file of arquivosImagens) {
            const ext = file.name.split('.').pop().toLowerCase()
            const fileName = `${user.id}/${productId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

            const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('review-images')
                .upload(fileName, file, { contentType: file.type, upsert: false })

            if (uploadErr) {
                console.error("Erro ao fazer upload:", uploadErr)
                continue
            }

            const { data: urlData } = supabase.storage
                .from('review-images')
                .getPublicUrl(uploadData.path)

            if (urlData?.publicUrl) {
                imageUrls.push(urlData.publicUrl)
            }
        }
    }

    const insertObj = {
        product_id: productId,
        user_id: user.id,
        rating: nota,
        comment: comentario || null
    }

    if (imageUrls.length > 0) {
        insertObj.images = imageUrls
    }

    const { data: inserted, error } = await supabase
        .from("reviews")
        .insert([insertObj])
        .select()

    if (error) {
        console.error("Erro ao enviar avaliação:", error, "Code:", error.code, "Details:", error.details)
        if (error.code === '23505') {
            return { ok: false, msg: 'Você já avaliou este produto.' }
        }
        if (error.code === '23503') {
            return { ok: false, msg: 'Erro de perfil. Faça logout e login novamente.' }
        }
        if (error.code === '42501') {
            return { ok: false, msg: 'Sem permissão para avaliar. Tente fazer logout e login.' }
        }
        return { ok: false, msg: 'Erro ao enviar avaliação: ' + (error.message || 'Tente novamente.') }
    }

    console.log("Avaliação inserida com sucesso:", inserted)
    return { ok: true, msg: 'Avaliação enviada! Ela será exibida após aprovação.' }
}



async function carregarSemelhantes(categoriaId, produtoAtualId) {
    const { data, error } = await supabase
        .from("products")
        .select(`
            *,
            product_variants (*),
            product_images (*)
        `)
        .eq("category_id", categoriaId)
        .neq("id", produtoAtualId)
        .limit(4)

    if (error) {
        console.error("Erro ao buscar semelhantes:", error)
        return []
    }

    return data || []
}



function getImagemUrl(produto) {
    if (produto.product_images && produto.product_images.length > 0) {
        return produto.product_images[0].url || produto.product_images[0].image_url || '../img/imagemExemplo.jpg'
    }
    return '../img/imagemExemplo.jpg'
}

function getTodasImagens(produto) {
    if (produto.product_images && produto.product_images.length > 0) {
        return produto.product_images.map(img => img.url || img.image_url || '../img/imagemExemplo.jpg')
    }
    return ['../img/imagemExemplo.jpg']
}

function gerarEstrelas(nota) {
    let html = ''
    for (let i = 1; i <= 5; i++) {
        html += i <= nota
            ? '<i class="fa-solid fa-star"></i>'
            : '<i class="fa-regular fa-star"></i>'
    }
    return html
}

function formatarData(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pt-BR')
}



function renderizarProduto(produto) {
    
    const breadcrumbNome = document.getElementById('breadcrumbNome')
    if (breadcrumbNome) breadcrumbNome.textContent = produto.name || produto.nome || ''

    
    atualizarSeoProduto(produto)

    
    const imgPrincipal = document.getElementById('imgPrincipal')
    const imagens = getTodasImagens(produto)
    if (imgPrincipal) {
        imgPrincipal.src = imagens[0]
        imgPrincipal.alt = produto.name || produto.nome || 'Produto'
    }

    
    const miniaturas = document.getElementById('miniaturas')
    if (miniaturas && imagens.length > 1) {
        imagens.forEach((src, i) => {
            const div = document.createElement('div')
            div.className = `pd-miniatura ${i === 0 ? 'ativa' : ''}`
            div.innerHTML = `<img src="${src}" alt="Imagem ${i + 1}">`
            div.addEventListener('click', () => {
                imgPrincipal.src = src
                document.querySelectorAll('.pd-miniatura').forEach(m => m.classList.remove('ativa'))
                div.classList.add('ativa')
            })
            miniaturas.appendChild(div)
        })
    }

    
    const pdCategoria = document.getElementById('pdCategoria')
    if (pdCategoria) {
        const catNome = produto.categories?.name || produto.categories?.nome || produto.category || ''
        pdCategoria.textContent = catNome
    }

    
    const pdNome = document.getElementById('pdNome')
    if (pdNome) pdNome.textContent = produto.name || produto.nome || ''

    
    const pdDescricao = document.getElementById('pdDescricao')
    if (pdDescricao) pdDescricao.textContent = produto.description || produto.descricao || ''

    
    const pdPreco = document.getElementById('pdPreco')
    const variants = produto.product_variants || []
    const precoInicial = variants.length > 0 ? variants[0].price || 0 : 0
    if (pdPreco) pdPreco.textContent = `R$ ${formatarPreco(precoInicial)}`

    
    const pdEstoque = document.getElementById('pdEstoque')
    const btnAddCart = document.querySelector('.btn-adicionar-carrinho')

    function atualizarEstoque(variant) {
        if (!pdEstoque) return
        const stock = variant?.stock ?? null
        if (stock === null || stock === undefined) {
            pdEstoque.innerHTML = ''
            pdEstoque.className = 'pd-estoque'
            if (btnAddCart) { btnAddCart.disabled = false; btnAddCart.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> Adicionar ao carrinho' }
        } else if (stock <= 0) {
            pdEstoque.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Produto indisponível'
            pdEstoque.className = 'pd-estoque sem-estoque'
            if (btnAddCart) { btnAddCart.disabled = true; btnAddCart.innerHTML = '<i class="fa-solid fa-ban"></i> Indisponível' }
        } else if (stock <= 5) {
            pdEstoque.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Apenas ${stock} em estoque`
            pdEstoque.className = 'pd-estoque estoque-baixo'
            if (btnAddCart) { btnAddCart.disabled = false; btnAddCart.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> Adicionar ao carrinho' }
        } else {
            pdEstoque.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${stock} em estoque`
            pdEstoque.className = 'pd-estoque em-estoque'
            if (btnAddCart) { btnAddCart.disabled = false; btnAddCart.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> Adicionar ao carrinho' }
        }
    }

    
    const categorySpecs = produto._categorySpecs || []
    const specValues = produto._specValues || []

    function atualizarSpecs(variant) {
        const pdTabela = document.getElementById('pdTabela')
        if (!pdTabela) return

        const specs = []

        
        if (categorySpecs.length > 0 && variant) {
            categorySpecs.forEach(cs => {
                const sv = specValues.find(v => v.spec_id === cs.id && v.variant_id === variant.id)
                if (sv && sv.value) {
                    specs.push([cs.spec_name + (cs.spec_unit ? ` (${cs.spec_unit})` : ''), sv.value])
                }
            })
        }

        const catNome = produto.categories?.name
        if (catNome) specs.push(['Categoria', catNome])

        if (specs.length === 0) {
            specs.push(['Informações', 'Consultar vendedor'])
        }

        pdTabela.innerHTML = specs.map(([label, valor]) =>
            `<div class="pd-tabela-row">
                <div class="pd-tabela-label">${escapeHtml(label)}</div>
                <div class="pd-tabela-valor">${escapeHtml(valor)}</div>
            </div>`
        ).join('')
    }

    
    if (variants.length > 0) {
        atualizarEstoque(variants[0])
        atualizarSpecs(variants[0])
    } else {
        atualizarSpecs(null)
    }

    
    const pdVariantes = document.getElementById('pdVariantes')
    const pdVariantesLista = document.getElementById('pdVariantesLista')
    if (variants.length > 0 && pdVariantes && pdVariantesLista) {
        pdVariantes.style.display = ''
        variants.forEach((v, i) => {
            const btn = document.createElement('button')
            btn.className = `pd-variante-btn ${i === 0 ? 'ativa' : ''}`
            btn.textContent = v.size_label || `Variante ${i + 1}`
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pd-variante-btn').forEach(b => b.classList.remove('ativa'))
                btn.classList.add('ativa')
                if (v.price) {
                    pdPreco.textContent = `R$ ${formatarPreco(v.price)}`
                }
                atualizarEstoque(v)
                atualizarSpecs(v)
            })
            pdVariantesLista.appendChild(btn)
        })
    }
}



function renderizarAvaliacoes(avaliacoes) {
    const container = document.getElementById('pdAvaliacoes')
    if (!container) return

    if (avaliacoes.length === 0) {
        container.innerHTML = '<p class="pd-sem-avaliacoes">Nenhuma avaliação ainda. Seja o primeiro!</p>'
        return
    }

    container.innerHTML = avaliacoes.map(av => {
        const nome = av._profile?.full_name || 'Anônimo'
        const avatarUrl = av._profile?.avatar_url
        const inicial = nome.charAt(0).toUpperCase()
        const avatarHtml = avatarUrl
            ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(nome)}" class="pd-avaliacao-avatar">`
            : `<div class="pd-avaliacao-avatar pd-avaliacao-avatar-inicial">${inicial}</div>`

        const respostaHtml = av.admin_reply
            ? `<div class="pd-avaliacao-resposta">
                <span class="pd-resposta-label"><i class="fa-solid fa-store"></i> Resposta da loja</span>
                <p class="pd-resposta-texto">${escapeHtml(av.admin_reply)}</p>
              </div>`
            : ''

        
        let imagensHtml = ''
        if (av.images && av.images.length > 0) {
            imagensHtml = `<div class="pd-avaliacao-imagens">
                ${av.images.map((url, idx) => `<img src="${escapeHtml(url)}" alt="Foto da avaliação ${idx + 1}" class="pd-avaliacao-img" data-fullsrc="${escapeHtml(url)}">`).join('')}
            </div>`
        }

        return `
        <div class="pd-avaliacao-item${av._pendente ? ' pd-avaliacao-pendente' : ''}">
            <div class="pd-avaliacao-header">
                ${avatarHtml}
                <div class="pd-avaliacao-info">
                    <span class="pd-avaliacao-nome">${escapeHtml(nome)}</span>
                    <div class="pd-avaliacao-meta">
                        <span class="pd-avaliacao-estrelas">${gerarEstrelas(av.rating || av.nota || 0)}</span>
                        <span class="pd-avaliacao-data">${formatarData(av.created_at)}</span>
                    </div>
                </div>
                ${av._pendente ? '<span class="pd-badge-pendente">Aguardando aprovação</span>' : ''}
                ${av._minha ? `<button class="pd-btn-excluir-avaliacao" data-review-id="${av.id}" title="Excluir avaliação"><i class="fa-solid fa-trash-can"></i></button>` : ''}
            </div>
            ${(av.comment || av.comentario) ? `<p class="pd-avaliacao-texto">${escapeHtml(av.comment || av.comentario)}</p>` : ''}
            ${imagensHtml}
            ${respostaHtml}
        </div>`
    }).join('')

    
    container.querySelectorAll('.pd-avaliacao-img').forEach(img => {
        img.addEventListener('click', () => abrirLightbox(img.dataset.fullsrc))
    })

    
    container.querySelectorAll('.pd-btn-excluir-avaliacao').forEach(btn => {
        btn.addEventListener('click', async () => {
            const reviewId = btn.dataset.reviewId
            if (!await confirmarAcaoProduto('Tem certeza que deseja excluir sua avaliação?')) return
            btn.disabled = true
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'
            const ok = await excluirAvaliacao(reviewId)
            if (ok) {
                showNotificacao('Avaliação excluída com sucesso.', 'sucesso')
                const produtoId = new URLSearchParams(window.location.search).get('id')
                const novasAv = await carregarAvaliacoes(produtoId)
                renderizarAvaliacoes(novasAv)
            } else {
                showNotificacao('Erro ao excluir avaliação.', 'erro')
                btn.disabled = false
                btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>'
            }
        })
    })
}



let _confirmarProdutoCb = null
function confirmarAcaoProduto(msg) {
    return new Promise(resolve => {
        const overlay = document.getElementById('modalConfirmarProduto')
        document.getElementById('modalConfirmarProdutoMsg').textContent = msg
        _confirmarProdutoCb = resolve
        overlay.style.display = 'flex'
    })
}
function _fecharConfirmarProduto(val) {
    document.getElementById('modalConfirmarProduto').style.display = 'none'
    if (_confirmarProdutoCb) { _confirmarProdutoCb(val); _confirmarProdutoCb = null }
}
document.getElementById('btnConfirmarProdutoSim')?.addEventListener('click', () => _fecharConfirmarProduto(true))
document.getElementById('btnConfirmarProdutoNao')?.addEventListener('click', () => _fecharConfirmarProduto(false))



async function excluirAvaliacao(reviewId) {
    const { error } = await supabase
        .from('reviews')
        .update({ deleted_by_user: true, deleted_at: new Date().toISOString() })
        .eq('id', reviewId)

    if (error) {
        console.error('Erro ao excluir avaliação:', error)
        return false
    }
    return true
}

function abrirLightbox(src) {
    const existente = document.getElementById('pdLightbox')
    if (existente) existente.remove()

    const overlay = document.createElement('div')
    overlay.id = 'pdLightbox'
    overlay.className = 'pd-lightbox'
    overlay.innerHTML = `
        <div class="pd-lightbox-content">
            <button class="pd-lightbox-fechar"><i class="fa-solid fa-xmark"></i></button>
            <img src="${src}" alt="Foto da avaliação">
        </div>
    `
    document.body.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('visivel'))

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.pd-lightbox-fechar')) {
            overlay.classList.remove('visivel')
            setTimeout(() => overlay.remove(), 300)
        }
    })
}



function renderizarSemelhantes(produtos) {
    const container = document.getElementById('pdSemelhantes')
    if (!container) return

    if (produtos.length === 0) {
        container.innerHTML = '<p style="color: var(--text-gray-lighter); font-style: italic;">Nenhum produto semelhante encontrado.</p>'
        return
    }

    container.innerHTML = produtos.map(p => {
        const nome = p.name || 'Produto'
        const variantes = p.product_variants || []
        const preco = variantes.length > 0 ? variantes[0].price || 0 : 0
        const img = getImagemUrl(p)

        const slug = encodeURIComponent(p.slug || p.id)

        return `
            <a href="../produtos/${slug}" class="produto-card" style="text-decoration:none; color: inherit; margin-bottom: 0;">
                <img src="${img}" alt="${escapeHtml(nome)}">
                <h3>${escapeHtml(nome)}</h3>
                <span class="preco">R$ ${formatarPreco(preco)} <small>/und</small></span>
            </a>
        `
    }).join('')
}

function atualizarMetaTag(nome, conteudo, atributo = 'name') {
    let tag = document.head.querySelector(`meta[${atributo}="${nome}"]`)
    if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute(atributo, nome)
        document.head.appendChild(tag)
    }
    tag.setAttribute('content', conteudo)
}

function atualizarCanonical(url) {
    let tag = document.head.querySelector('link[rel="canonical"]')
    if (!tag) {
        tag = document.createElement('link')
        tag.setAttribute('rel', 'canonical')
        document.head.appendChild(tag)
    }
    tag.setAttribute('href', url)
}

function atualizarJsonLdProduto(produto, canonicalUrl, imageUrl, preco, stock) {
    let tag = document.getElementById('produtoJsonLd')
    if (!tag) {
        tag = document.createElement('script')
        tag.type = 'application/ld+json'
        tag.id = 'produtoJsonLd'
        document.head.appendChild(tag)
    }

    const data = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": produto.name || 'Produto',
        "description": produto.description || 'Produto disponível na JSL Embalagens.',
        "image": [imageUrl],
        "sku": produto.slug || produto.id || undefined,
        "category": produto.categories?.name || undefined,
        "brand": {
            "@type": "Brand",
            "name": "JSL Embalagens"
        },
        "offers": {
            "@type": "Offer",
            "url": canonicalUrl,
            "priceCurrency": "BRL",
            "price": Number(preco || 0).toFixed(2),
            "availability": stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "seller": {
                "@type": "Organization",
                "name": "JSL Embalagens"
            }
        }
    }

    tag.textContent = JSON.stringify(data)
}

function atualizarSeoProduto(produto) {
    const nome = produto.name || produto.nome || 'Produto'
    const categoria = produto.categories?.name || 'Embalagens'
    const descricaoBase = produto.description || produto.descricao || `${nome} disponível na JSL Embalagens. Solicite orçamento e confira especificações, variantes e condições de compra.`
    const descricao = descricaoBase.slice(0, 155)
    const imagePath = getImagemUrl(produto)
    const imagem = imagePath.startsWith('http')
        ? imagePath
        : `https://www.jslembalagens.com.br${imagePath.replace('..', '')}`
    const canonicalUrl = `https://www.jslembalagens.com.br/produtos/${encodeURIComponent(produto.slug || produto.id || '')}`
    const variants = produto.product_variants || []
    const preco = variants.length > 0 ? variants[0].price || 0 : 0
    const stock = variants.length > 0 ? (variants[0].stock ?? 0) : 0

    document.title = `${nome} | ${categoria} | JSL Embalagens`
    atualizarMetaTag('description', descricao)
    atualizarMetaTag('robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1')
    atualizarMetaTag('og:locale', 'pt_BR', 'property')
    atualizarMetaTag('og:type', 'product', 'property')
    atualizarMetaTag('og:title', `${nome} | JSL Embalagens`, 'property')
    atualizarMetaTag('og:description', descricao, 'property')
    atualizarMetaTag('og:url', canonicalUrl, 'property')
    atualizarMetaTag('og:site_name', 'JSL Embalagens', 'property')
    atualizarMetaTag('og:image', imagem, 'property')
    atualizarMetaTag('twitter:card', 'summary_large_image')
    atualizarMetaTag('twitter:title', `${nome} | JSL Embalagens`)
    atualizarMetaTag('twitter:description', descricao)
    atualizarMetaTag('twitter:image', imagem)
    atualizarCanonical(canonicalUrl)
    atualizarJsonLdProduto(produto, canonicalUrl, imagem, preco, stock)
}



function initQuantidadeDetalhe() {
    const box = document.querySelector('.pd-acao .quantidade')
    if (!box) return

    const btnMais = box.querySelector('.mais')
    const btnMenos = box.querySelector('.menos')
    const numero = box.querySelector('.numero')

    btnMais?.addEventListener('click', () => {
        let val = parseInt(numero.textContent) || 1
        numero.textContent = val + 1
    })

    btnMenos?.addEventListener('click', () => {
        let val = parseInt(numero.textContent) || 1
        if (val > 1) numero.textContent = val - 1
    })
}



function initEstrelas() {
    const container = document.getElementById('estrelasInput')
    const notaInput = document.getElementById('notaInput')
    if (!container || !notaInput) return

    const estrelas = container.querySelectorAll('i')

    estrelas.forEach(star => {
        star.addEventListener('click', () => {
            const nota = parseInt(star.dataset.nota)
            notaInput.value = nota

            estrelas.forEach(s => {
                const n = parseInt(s.dataset.nota)
                s.className = n <= nota ? 'fa-solid fa-star ativa' : 'fa-regular fa-star'
            })
        })

        star.addEventListener('mouseenter', () => {
            const nota = parseInt(star.dataset.nota)
            estrelas.forEach(s => {
                const n = parseInt(s.dataset.nota)
                s.className = n <= nota ? 'fa-solid fa-star ativa' : 'fa-regular fa-star'
            })
        })
    })

    container.addEventListener('mouseleave', () => {
        const atual = parseInt(notaInput.value) || 0
        estrelas.forEach(s => {
            const n = parseInt(s.dataset.nota)
            s.className = n <= atual ? 'fa-solid fa-star ativa' : 'fa-regular fa-star'
        })
    })
}



function initFrete() {
    const btnCalcular = document.getElementById('btnCalcularFrete')
    const cepInput = document.getElementById('cepInput')
    const resultado = document.getElementById('freteResultado')
    if (!btnCalcular || !cepInput || !resultado) return

    
    cepInput.addEventListener('input', () => {
        let val = cepInput.value.replace(/\D/g, '')
        if (val.length > 5) val = val.slice(0, 5) + '-' + val.slice(5, 8)
        cepInput.value = val
    })

    btnCalcular.addEventListener('click', () => {
        const cep = cepInput.value.replace(/\D/g, '')
        const prefixo = parseInt(cep.substring(0, 5))
        if (cep.length !== 8 || prefixo < 1000 || prefixo > 99999) {
            resultado.style.display = 'block'
            resultado.innerHTML = '<span style="color: var(--error-red);">CEP inválido. Verifique o número digitado.</span>'
            return
        }

        resultado.style.display = 'block'
        resultado.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Entrega padrão</strong>
                        <div style="font-size: 0.8rem; color: var(--text-gray-lighter);">7 a 12 dias úteis</div>
                    </div>
                    <span style="font-weight: 700; color: var(--text-dark);">A combinar</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Entrega expressa</strong>
                        <div style="font-size: 0.8rem; color: var(--text-gray-lighter);">3 a 5 dias úteis</div>
                    </div>
                    <span style="font-weight: 700; color: var(--text-dark);">A combinar</span>
                </div>
                <p style="font-size: 0.75rem; color: var(--text-gray-lighter); margin-top: 0.25rem;">
                    * Valores de frete calculados sob consulta. Entre em contato para orçamento.
                </p>
            </div>
        `
    })
}



window._reviewImageFiles = []
const MAX_REVIEW_IMAGES = 3
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 

function initUploadImagens() {
    const area = document.getElementById('uploadArea')
    const input = document.getElementById('imagensInput')
    const placeholder = document.getElementById('uploadPlaceholder')
    if (!area || !input) return

    
    placeholder?.addEventListener('click', () => input.click())

    
    area.addEventListener('dragover', (e) => {
        e.preventDefault()
        area.classList.add('pd-upload-dragover')
    })
    area.addEventListener('dragleave', () => {
        area.classList.remove('pd-upload-dragover')
    })
    area.addEventListener('drop', (e) => {
        e.preventDefault()
        area.classList.remove('pd-upload-dragover')
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
        adicionarImagens(files)
    })

    
    input.addEventListener('change', () => {
        adicionarImagens(Array.from(input.files))
        input.value = '' 
    })
}

function adicionarImagens(files) {
    const remaining = MAX_REVIEW_IMAGES - window._reviewImageFiles.length
    if (remaining <= 0) {
        showNotificacao(`Máximo de ${MAX_REVIEW_IMAGES} imagens permitidas.`, 'erro')
        return
    }

    const validFiles = files.slice(0, remaining).filter(f => {
        if (f.size > MAX_IMAGE_SIZE) {
            showNotificacao(`"${f.name}" é muito grande. Máximo 5MB.`, 'erro')
            return false
        }
        return true
    })

    window._reviewImageFiles.push(...validFiles)
    atualizarPreviewImagens()
}

function atualizarPreviewImagens() {
    const preview = document.getElementById('uploadPreview')
    const placeholder = document.getElementById('uploadPlaceholder')
    if (!preview) return

    preview.innerHTML = ''

    window._reviewImageFiles.forEach((file, idx) => {
        const div = document.createElement('div')
        div.className = 'pd-upload-thumb'
        const img = document.createElement('img')
        img.alt = file.name
        const reader = new FileReader()
        reader.onload = (e) => { img.src = e.target.result }
        reader.readAsDataURL(file)
        const btnRemove = document.createElement('button')
        btnRemove.type = 'button'
        btnRemove.className = 'pd-upload-remove'
        btnRemove.innerHTML = '<i class="fa-solid fa-xmark"></i>'
        btnRemove.addEventListener('click', () => {
            window._reviewImageFiles.splice(idx, 1)
            atualizarPreviewImagens()
        })
        div.appendChild(img)
        div.appendChild(btnRemove)
        preview.appendChild(div)
    })

    
    if (window._reviewImageFiles.length < MAX_REVIEW_IMAGES) {
        const addBtn = document.createElement('button')
        addBtn.type = 'button'
        addBtn.className = 'pd-upload-add-more'
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>'
        addBtn.addEventListener('click', () => {
            document.getElementById('imagensInput')?.click()
        })
        preview.appendChild(addBtn)
    }

    
    if (placeholder) {
        placeholder.style.display = window._reviewImageFiles.length > 0 ? 'none' : ''
    }
}

function limparUploadImagens() {
    window._reviewImageFiles = []
    atualizarPreviewImagens()
}



document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search)
    const produtoId = params.get('id')
    const produtoSlug = params.get('produto')

    const loading = document.getElementById('produtoLoading')
    const erro = document.getElementById('produtoErro')
    const detalhe = document.getElementById('produtoDetalhe')

    if (!produtoId && !produtoSlug) {
        if (loading) loading.style.display = 'none'
        if (erro) erro.style.display = 'flex'
        return
    }

    const produto = produtoSlug
        ? await carregarProdutoPorSlug(produtoSlug)
        : await carregarProduto(produtoId)

    if (!produto) {
        if (loading) loading.style.display = 'none'
        if (erro) erro.style.display = 'flex'
        return
    }

    
    renderizarProduto(produto)

    
    if (loading) loading.style.display = 'none'
    if (detalhe) detalhe.style.display = 'block'

    
    initQuantidadeDetalhe()
    initEstrelas()
    initFrete()

    
    const btnCompartilhar = document.getElementById('btnCompartilhar')
    if (btnCompartilhar) {
        btnCompartilhar.addEventListener('click', async () => {
            const url = window.location.href
            const nome = produto.name || 'Produto'

            if (navigator.share) {
                try {
                    await navigator.share({ title: nome + ' - JSL Embalagens', url })
                } catch (e) {  }
            } else {
                try {
                    await navigator.clipboard.writeText(url)
                    showNotificacao('Link copiado para a área de transferência!', 'sucesso')
                } catch {
                    
                    const input = document.createElement('input')
                    input.value = url
                    document.body.appendChild(input)
                    input.select()
                    document.execCommand('copy')
                    input.remove()
                    showNotificacao('Link copiado!', 'sucesso')
                }
            }
        })
    }

    
    const btnAddCart = document.querySelector('.btn-adicionar-carrinho')
    if (btnAddCart && produto.product_variants?.length > 0) {
        btnAddCart.addEventListener('click', async () => {
            
            const btnAtiva = document.querySelector('.pd-variante-btn.ativa')
            const variants = produto.product_variants
            let variantIndex = 0
            if (btnAtiva) {
                const allBtns = Array.from(document.querySelectorAll('.pd-variante-btn'))
                variantIndex = allBtns.indexOf(btnAtiva)
            }
            const variant = variants[variantIndex] || variants[0]
            const variantId = variant.id

            
            if (variant.stock !== null && variant.stock !== undefined && variant.stock <= 0) {
                return
            }

            
            const qtdEl = document.querySelector('.pd-acao .quantidade .numero')
            const quantidade = qtdEl ? parseInt(qtdEl.textContent) || 1 : 1

            btnAddCart.disabled = true
            btnAddCart.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adicionando...'

            await adicionarAoCarrinho(variantId, quantidade)

            
            if (variant.stock !== null && variant.stock !== undefined && variant.stock <= 0) {
                btnAddCart.disabled = true
                btnAddCart.innerHTML = '<i class="fa-solid fa-ban"></i> Indisponível'
            } else {
                btnAddCart.disabled = false
                btnAddCart.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> Adicionar ao carrinho'
            }
        })
    }

    
    const avaliacoes = await carregarAvaliacoes(produtoId)
    renderizarAvaliacoes(avaliacoes)

    
    const form = document.getElementById('formAvaliacao')
    initUploadImagens()
    form?.addEventListener('submit', async (e) => {
        e.preventDefault()
        const nota = parseInt(document.getElementById('notaInput')?.value) || 0
        const comentario = document.getElementById('comentarioInput')?.value?.trim() || ''

        if (nota === 0) {
            showNotificacao('Selecione uma nota de 1 a 5 estrelas.', 'erro')
            return
        }

        
        const arquivos = window._reviewImageFiles || []

        
        const btnSubmit = form.querySelector('.btn-enviar-avaliacao')
        if (btnSubmit) {
            btnSubmit.disabled = true
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'
        }

        const resultado = await enviarAvaliacao(produtoId, nota, comentario, arquivos)
        if (resultado.ok) {
            showNotificacao(resultado.msg, 'sucesso')
            document.getElementById('comentarioInput').value = ''
            document.getElementById('notaInput').value = '0'
            document.querySelectorAll('#estrelasInput i').forEach(s => s.className = 'fa-regular fa-star')
            limparUploadImagens()
            const novasAv = await carregarAvaliacoes(produtoId)
            renderizarAvaliacoes(novasAv)
        } else {
            showNotificacao(resultado.msg, 'erro')
        }

        if (btnSubmit) {
            btnSubmit.disabled = false
            btnSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar avaliação'
        }
    })

    
    const catId = produto.category_id || produto.categoria_id
    if (catId) {
        const semelhantes = await carregarSemelhantes(catId, produtoId)
        renderizarSemelhantes(semelhantes)
    }
})
