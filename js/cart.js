import { supabase } from "./supabaseClient.js"
import { animarCarrinhoOverlay, animarCarrinhoPainel } from "./animacoes.js"
import { escapeHtml, formatarPreco, isUrlSegura, mostrarToast } from "./utils.js"

function getPaginaInternaHref(page) {
    const linkMenu = document.querySelector(`a[data-page="${page}"]`)
    const hrefMenu = linkMenu?.getAttribute('href')

    if (hrefMenu && hrefMenu !== '#') {
        return hrefMenu
    }

    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/')
    const inHtmlFolder = path.includes('/html/')
    const isRootPage = path === '/' || path === '/index.html' || path === '/checkout-retorno.html'

    if (inHtmlFolder) {
        return `./${page}.html`
    }

    if (isRootPage) {
        return `./html/${page}.html`
    }

    return `../html/${page}.html`
}


function getSessionId() {
    let sessionId = localStorage.getItem('jsl_session_id')
    if (!sessionId) {
        sessionId = 'sess_' + crypto.randomUUID()
        localStorage.setItem('jsl_session_id', sessionId)
    }
    return sessionId
}

async function getUserId() {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
}


async function obterCarrinho() {
    const userId = await getUserId()
    const sessionId = getSessionId()

    let query = supabase.from('carts').select('*')

    if (userId) {
        query = query.eq('user_id', userId)
    } else {
        query = query.eq('session_id', sessionId)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
        console.error('Erro ao buscar carrinho:', error)
        return null
    }

    if (data) return data

    const insertData = userId
        ? { user_id: userId, session_id: sessionId }
        : { session_id: sessionId }

    const { data: novo, error: erroCriar } = await supabase
        .from('carts')
        .insert([insertData])
        .select()
        .single()

    if (erroCriar) {
        console.error('Erro ao criar carrinho:', erroCriar)
        return null
    }

    return novo
}


export async function carregarItensCarrinho() {
    const carrinho = await obterCarrinho()
    if (!carrinho) return []

    const { data, error } = await supabase
        .from('cart_items')
        .select(`
            *,
            product_variants (
                *,
                products (
                    name,
                    slug,
                    product_images (url, is_primary, sort_order)
                )
            )
        `)
        .eq('cart_id', carrinho.id)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('Erro ao carregar itens:', error)
        return []
    }

    return data || []
}


export async function adicionarAoCarrinho(variantId, quantidade = 1) {
    const carrinho = await obterCarrinho()
    if (!carrinho) {
        mostrarToast('Erro ao acessar carrinho', 'erro')
        return false
    }

    
    const { data: existente } = await supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('cart_id', carrinho.id)
        .eq('variant_id', variantId)
        .maybeSingle()

    if (existente) {
        const { error } = await supabase
            .from('cart_items')
            .update({ quantity: existente.quantity + quantidade })
            .eq('id', existente.id)

        if (error) {
            console.error('Erro ao atualizar quantidade:', error)
            mostrarToast('Erro ao atualizar carrinho', 'erro')
            return false
        }
    } else {
        const { error } = await supabase
            .from('cart_items')
            .insert([{
                cart_id: carrinho.id,
                variant_id: variantId,
                quantity: quantidade
            }])

        if (error) {
            console.error('Erro ao adicionar item:', error)
            mostrarToast('Erro ao adicionar ao carrinho', 'erro')
            return false
        }
    }

    mostrarToast('Produto adicionado ao carrinho!', 'sucesso')
    await atualizarBadgeCarrinho()
    return true
}


export async function atualizarQuantidade(itemId, novaQuantidade) {
    if (novaQuantidade < 1) {
        return removerDoCarrinho(itemId)
    }

    const { error } = await supabase
        .from('cart_items')
        .update({ quantity: novaQuantidade })
        .eq('id', itemId)

    if (error) {
        console.error('Erro ao atualizar quantidade:', error)
        return false
    }

    await atualizarBadgeCarrinho()
    return true
}


export async function removerDoCarrinho(itemId) {
    const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId)

    if (error) {
        console.error('Erro ao remover item:', error)
        return false
    }

    await atualizarBadgeCarrinho()
    return true
}


export async function limparCarrinho() {
    const carrinho = await obterCarrinho()
    if (!carrinho) return false

    const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('cart_id', carrinho.id)

    if (error) {
        console.error('Erro ao limpar carrinho:', error)
        return false
    }

    await atualizarBadgeCarrinho()
    return true
}


export async function atualizarBadgeCarrinho() {
    const itens = await carregarItensCarrinho()
    const totalItens = itens.reduce((acc, item) => acc + item.quantity, 0)

    document.querySelectorAll('.cart .badge').forEach(badge => {
        badge.textContent = totalItens
        badge.style.display = totalItens > 0 ? 'flex' : 'none'
    })

    window.dispatchEvent(new CustomEvent('carrinho-atualizado', { detail: { itens, totalItens } }))
}


export function initCarrinhoSidebar() {
    const sidebar = document.createElement('div')
    sidebar.id = 'carrinhoSidebar'
    sidebar.className = 'carrinho-sidebar'
    sidebar.innerHTML = `
        <div class="carrinho-overlay" id="carrinhoOverlay"></div>
        <aside class="carrinho-painel" id="carrinhoPainel">
            <div class="carrinho-header">
                <h2><i class="fa-solid fa-cart-shopping"></i> Meu Carrinho</h2>
                <button class="carrinho-fechar" id="carrinhoFechar">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="carrinho-body" id="carrinhoBody">
                <div class="carrinho-loading">
                    <div class="spinner-sm"></div>
                    <p>Carregando...</p>
                </div>
            </div>
            <div class="carrinho-footer" id="carrinhoFooter" style="display:none">
                <div class="carrinho-total">
                    <span>Total</span>
                    <strong id="carrinhoTotal">R$ 0,00</strong>
                </div>
                <a href="#" class="btn-ver-carrinho" id="btnVerCarrinho">
                    <i class="fa-solid fa-bag-shopping"></i> Ver carrinho completo
                </a>
                <a href="#" class="btn-finalizar" id="btnFinalizar">
                    Finalizar pedido <i class="fa-solid fa-arrow-right"></i>
                </a>
            </div>
        </aside>
    `
    document.body.appendChild(sidebar)

    const btnVer = document.getElementById('btnVerCarrinho')
    btnVer.href = getPaginaInternaHref('carrinho')

    const btnFinalizar = document.getElementById('btnFinalizar')
    btnFinalizar.href = getPaginaInternaHref('checkout')

    const overlay = document.getElementById('carrinhoOverlay')
    const fechar = document.getElementById('carrinhoFechar')

    overlay.addEventListener('click', fecharCarrinhoSidebar)
    fechar.addEventListener('click', fecharCarrinhoSidebar)

    
    document.querySelectorAll('.cart').forEach(el => {
        el.style.cursor = 'pointer'
        el.addEventListener('click', (e) => {
            e.preventDefault()
            abrirCarrinhoSidebar()
        })
    })

    
    window.addEventListener('carrinho-atualizado', () => {
        if (sidebar.classList.contains('aberto')) {
            renderizarSidebar()
        }
    })
}

export async function abrirCarrinhoSidebar() {
    const sidebar = document.getElementById('carrinhoSidebar')
    if (!sidebar) return
    sidebar.classList.add('aberto')
    document.body.style.overflow = 'hidden'
    animarCarrinhoOverlay(sidebar.querySelector('.carrinho-overlay'))
    animarCarrinhoPainel(sidebar.querySelector('.carrinho-painel'))
    await renderizarSidebar()
}

export function fecharCarrinhoSidebar() {
    const sidebar = document.getElementById('carrinhoSidebar')
    if (!sidebar) return
    sidebar.classList.remove('aberto')
    document.body.style.overflow = ''
}

async function renderizarSidebar() {
    const body = document.getElementById('carrinhoBody')
    const footer = document.getElementById('carrinhoFooter')
    const totalEl = document.getElementById('carrinhoTotal')
    if (!body) return

    body.innerHTML = '<div class="carrinho-loading"><div class="spinner-sm"></div><p>Carregando...</p></div>'

    const itens = await carregarItensCarrinho()

    if (itens.length === 0) {
        body.innerHTML = `
            <div class="carrinho-vazio">
                <i class="fa-solid fa-cart-shopping"></i>
                <h3>Seu carrinho está vazio</h3>
                <p>Adicione produtos para continuar</p>
            </div>
        `
        if (footer) footer.style.display = 'none'
        return
    }

    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/')
    const inHtml = path.includes('/html/')

    let total = 0
    body.innerHTML = itens.map(item => {
        const variant = item.product_variants
        const product = variant?.products
        const nome = escapeHtml(product?.name || 'Produto')
        const label = escapeHtml(variant?.size_label || '')
        const preco = variant?.price || 0
        const subtotal = preco * item.quantity
        total += subtotal

        const imgs = product?.product_images || []
        const defaultImg = inHtml ? '../img/imagemExemplo.jpg' : './img/imagemExemplo.jpg'
        const imgPrincipal = imgs.length > 0 ? imgs[0].url : ''
        const img = isUrlSegura(imgPrincipal) ? imgPrincipal : defaultImg

        return `
            <div class="carrinho-item" data-item-id="${item.id}">
                <img src="${img}" alt="${nome}">
                <div class="carrinho-item-info">
                    <h4>${nome}</h4>
                    ${label ? `<span class="carrinho-item-variante">${label}</span>` : ''}
                    <span class="carrinho-item-preco">R$ ${formatarPreco(preco)}</span>
                    <div class="carrinho-item-qtd">
                        <button class="carrinho-qtd-btn" data-acao="diminuir" data-id="${item.id}" data-qtd="${item.quantity}">−</button>
                        <span>${item.quantity}</span>
                        <button class="carrinho-qtd-btn" data-acao="aumentar" data-id="${item.id}" data-qtd="${item.quantity}">+</button>
                    </div>
                </div>
                <div class="carrinho-item-acoes">
                    <span class="carrinho-item-subtotal">R$ ${formatarPreco(subtotal)}</span>
                    <button class="carrinho-remover" data-id="${item.id}" title="Remover">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `
    }).join('')

    if (totalEl) totalEl.textContent = `R$ ${formatarPreco(total)}`
    if (footer) footer.style.display = ''

    
    body.querySelectorAll('.carrinho-qtd-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id
            const qtdAtual = parseInt(btn.dataset.qtd)
            const acao = btn.dataset.acao
            const novaQtd = acao === 'aumentar' ? qtdAtual + 1 : qtdAtual - 1
            await atualizarQuantidade(id, novaQtd)
            await renderizarSidebar()
        })
    })

    
    body.querySelectorAll('.carrinho-remover').forEach(btn => {
        btn.addEventListener('click', async () => {
            await removerDoCarrinho(btn.dataset.id)
            await renderizarSidebar()
        })
    })
}

export function initBotoesAdicionarCarrinho() {
    let carrinhoEmCooldown = false

    // Listener para exibir mensagem mesmo se o botão estiver desabilitado
    // Bloqueia ação e exibe mensagem se estoque zerado, mesmo sem disabled
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('.btn-carrinho')
        if (!btn) return
        const card = btn.closest('.produto-card')
        const estoqueEl = card?.querySelector('.estoque-zerado')
        if (estoqueEl) {
            mostrarToast('Produto sem estoque disponível', 'erro')
            e.preventDefault()
            e.stopPropagation()
        }
    }, true)

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-carrinho')
        if (!btn) return

        if (btn.disabled || carrinhoEmCooldown) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        btn.disabled = true;
        carrinhoEmCooldown = true

        const card = btn.closest('.produto-card')
        if (!card) { btn.disabled = false; carrinhoEmCooldown = false; return }

        const estoqueEl = card.querySelector('.estoque-zerado')
        if (estoqueEl) {
            btn.disabled = false;
            carrinhoEmCooldown = false
            e.preventDefault()
            e.stopPropagation()
            return
        }

        const produtoId = card.dataset.id
        if (!produtoId) { btn.disabled = false; carrinhoEmCooldown = false; return }

        const qtdEl = card.querySelector('.quantidade .numero')
        const quantidade = qtdEl ? parseInt(qtdEl.textContent) || 1 : 1

        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adicionando...'

        const { data: variants } = await supabase
            .from('product_variants')
            .select('id, stock, price')
            .eq('product_id', produtoId)
            .eq('active', true)
            .order('price', { ascending: true })
            .limit(1)

        if (variants && variants.length > 0) {
            if (variants[0].stock !== undefined && variants[0].stock <= 0) {
                mostrarToast('Produto sem estoque disponível', 'erro')
            } else {
                await adicionarAoCarrinho(variants[0].id, quantidade)
            }
        } else {
            mostrarToast('Produto sem variante disponível', 'erro')
        }

        btn.innerHTML = textoOriginal;
        btn.disabled = false;
        setTimeout(() => {
            carrinhoEmCooldown = false
        }, 500)
    })
}
