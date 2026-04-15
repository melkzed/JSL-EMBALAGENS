import { supabase } from "./supabaseClient.js"
import { getUser } from "./auth.js"
import { animarFavPulse } from "./animacoes.js"
import { escapeHtml, formatarPreco } from "./utils.js"

export async function carregarCategorias() {
    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order')

    if (error) {
        console.error('Erro ao buscar categorias:', error)
        return []
    }

    
    const ativas = (data || []).filter(c => c.active)
    return ativas
}

export async function carregarProdutos() {
  const { data, error } = await supabase
    .from("products")
    .select(`
      *,
      categories (*),
      product_variants (*),
      product_images (*)
    `)
    .eq("active", true)

  if (error) {
    console.error("Erro ao buscar produtos:", error)
    return []
  }

  return data || []
}

function isFriendlyUrlHost() {
    const explicitFriendly = window.__JSL_ENABLE_FRIENDLY_ROUTES__ === true
    if (!explicitFriendly) return false

    const host = window.location.hostname
    return host === 'www.jslembalagens.com.br' || host === 'jslembalagens.com.br'
}

function getProdutoHref(produto, inHtmlFolder) {
    const slug = encodeURIComponent(produto.slug || produto.id || '')
    if (isFriendlyUrlHost()) {
        return `/produtos/${slug}`
    }

    return inHtmlFolder
        ? `./produto.html?produto=${slug}`
        : `./html/produto.html?produto=${slug}`
}

export function getImagemUrl(produto) {
    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/')
    const inHtml = path.includes('/html/')
    const fallback = inHtml ? '../img/imagemExemplo.jpg' : './img/imagemExemplo.jpg'

    if (produto.product_images && produto.product_images.length > 0) {
        const url = produto.product_images[0].url || produto.product_images[0].image_url
        if (url) {
            
            if (url.startsWith('http')) return url
            
            if (inHtml && url.startsWith('./img/')) return '../' + url.slice(2)
            return url
        }
    }
    return fallback
}

export { formatarPreco }

export async function renderizarCardsProdutos(produtos, container, basePath = './') {
    if (!container || !produtos || produtos.length === 0) return

    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/')
    const inHtmlFolder = path.includes('/html/')

    
    const user = getUser()
    let favoritosSet = new Set()
    if (user) {
        const { data: favs } = await supabase
            .from('wishlists')
            .select('product_id')
            .eq('user_id', user.id)
        if (favs) favs.forEach(f => favoritosSet.add(f.product_id))
    }



    container.innerHTML = produtos.map(p => {
        const nome = escapeHtml(p.name || 'Produto')
        let variantes = p.product_variants || []
        // Ordena variantes do menor para o maior preço
        variantes = variantes.slice().sort((a, b) => (a.price || 0) - (b.price || 0))
        const preco = variantes.length > 0 ? variantes[0].price || 0 : 0
        const estoque = variantes.length > 0 ? (variantes[0].stock ?? 0) : 0
        const img = getImagemUrl(p)
        const cat = escapeHtml(p.categories?.name || '')
        const catSlug = encodeURIComponent(p.categories?.slug || '')
        const linkProduto = getProdutoHref(p, inHtmlFolder)
        const isFav = favoritosSet.has(p.id)
        const btnCarrinhoDisabled = '' // Nunca usa disabled, bloqueia via JS
        const estoqueAviso = estoque <= 0 ? '<span class="estoque-zerado" style="color:#e53935;font-weight:600;">(sem estoque)</span>' : ''

        return `
            <div class="produto-card${estoque <= 0 ? ' indisponivel' : ''}" data-categoria="${catSlug}" data-preco="${preco}" data-id="${p.id}">
                <span class="badge-categoria">${cat}</span>
                <button class="btn-favorito ${isFav ? 'ativo' : ''}" data-product-id="${p.id}" title="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                    <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
                </button>
                <a href="${linkProduto}" class="produto-card-link">
                    <img src="${img}" alt="${nome}">
                    <h3>${nome}</h3>
                </a>
                <span class="preco">R$ ${formatarPreco(preco)} <small>/und</small></span>
                ${estoqueAviso}
                <div class="quantidade">
                    <button class="menos">-</button>
                    <span class="numero">1</span>
                    <button class="mais">+</button>
                </div>
                <button class="btn-carrinho" ${btnCarrinhoDisabled}>🛒 Adicionar ao carrinho</button>
            </div>
        `
    }).join('')

    
    container.querySelectorAll('.btn-favorito').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault()
            e.stopPropagation()
            await toggleFavorito(btn)
        })
    })
}

async function toggleFavorito(btn) {
    const user = getUser()
    if (!user) {
        
        const profileEl = document.querySelector('.profile')
        if (profileEl) profileEl.click()
        return
    }

    const productId = btn.dataset.productId
    const ativo = btn.classList.contains('ativo')

    btn.style.pointerEvents = 'none'

    if (ativo) {
        
        const { error } = await supabase
            .from('wishlists')
            .delete()
            .eq('user_id', user.id)
            .eq('product_id', productId)

        if (!error) {
            btn.classList.remove('ativo')
            btn.querySelector('i').className = 'fa-regular fa-heart'
            btn.title = 'Adicionar aos favoritos'
        }
    } else {
        
        const { error } = await supabase
            .from('wishlists')
            .insert([{ user_id: user.id, product_id: productId }])

        if (!error) {
            btn.classList.add('ativo')
            btn.querySelector('i').className = 'fa-solid fa-heart'
            btn.title = 'Remover dos favoritos'
            
            animarFavPulse(btn)
        }
    }

    btn.style.pointerEvents = ''
}
