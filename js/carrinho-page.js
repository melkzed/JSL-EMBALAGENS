import { carregarItensCarrinho, atualizarQuantidade, removerDoCarrinho, limparCarrinho, getPaginaInternaHref } from "./cart.js"
import { escapeHtml, formatarPreco } from "./utils.js"

async function renderizarPaginaCarrinho() {
    const conteudo = document.getElementById('carrinhoConteudo')
    const subtitulo = document.getElementById('carrinhoSubtitulo')
    if (!conteudo) return

    conteudo.setAttribute('aria-busy', 'true')

    let itens
    try {
        itens = await carregarItensCarrinho()
    } catch (err) {
        console.error('Erro ao carregar carrinho:', err)
        conteudo.setAttribute('aria-busy', 'false')
        if (subtitulo) subtitulo.textContent = ''
        conteudo.innerHTML = `
            <div class="carrinho-vazio-page">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                <h2>Não foi possível carregar seu carrinho</h2>
                <p>Verifique sua conexão com a internet e tente novamente.</p>
                <button type="button" class="btn-ver-produtos" id="btnRecarregarPagina">
                    <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Tentar novamente
                </button>
            </div>
        `
        document.getElementById('btnRecarregarPagina')?.addEventListener('click', renderizarPaginaCarrinho)
        return
    }

    conteudo.setAttribute('aria-busy', 'false')

    if (itens.length === 0) {
        if (subtitulo) subtitulo.textContent = ''
        conteudo.innerHTML = `
            <div class="carrinho-vazio-page">
                <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
                <h2>Seu carrinho está vazio</h2>
                <p>Navegue pelo nosso catálogo e encontre os produtos ideais para você</p>
                <a href="${getPaginaInternaHref('produtos')}" class="btn-ver-produtos">
                    <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Ver produtos
                </a>
            </div>
        `
        return
    }

    if (subtitulo) subtitulo.textContent = `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} no carrinho`

    let totalGeral = 0

    const listaHTML = itens.map(item => {
        const variant = item.product_variants
        const product = variant?.products
        const nome = escapeHtml(product?.name || 'Produto')
        const label = escapeHtml(variant?.size_label || '')
        const preco = variant?.price || 0
        const subtotal = preco * item.quantity
        totalGeral += subtotal

        const imgs = product?.product_images || []
        const img = imgs.length > 0 ? imgs[0].url : '../img/imagemExemplo.jpg'
        const nomeCompleto = label ? `${nome} (${label})` : nome

        return `
            <div class="carrinho-lista-item" data-item-id="${item.id}">
                <div class="carrinho-lista-produto">
                    <img src="${img}" alt="${nome}" loading="lazy" width="72" height="72">
                    <div class="carrinho-lista-produto-info">
                        <h4>${nome}</h4>
                        ${label ? `<span>${label}</span>` : ''}
                    </div>
                </div>
                <div class="carrinho-lista-preco" data-label="Preço">R$ ${formatarPreco(preco)}</div>
                <div class="carrinho-lista-qtd" role="group" aria-label="Quantidade de ${nomeCompleto}">
                    <button data-acao="diminuir" data-id="${item.id}" data-qtd="${item.quantity}" aria-label="Diminuir quantidade de ${nomeCompleto}">−</button>
                    <span aria-live="polite">${item.quantity}</span>
                    <button data-acao="aumentar" data-id="${item.id}" data-qtd="${item.quantity}" aria-label="Aumentar quantidade de ${nomeCompleto}">+</button>
                </div>
                <div class="carrinho-lista-subtotal" data-label="Subtotal">R$ ${formatarPreco(subtotal)}</div>
                <button class="carrinho-lista-remover" data-id="${item.id}" aria-label="Remover ${nomeCompleto} do carrinho">
                    <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
            </div>
        `
    }).join('')

    conteudo.innerHTML = `
        <div class="carrinho-layout">
            <div class="carrinho-lista">
                <div class="carrinho-lista-header">
                    <span>Produto</span>
                    <span>Preço</span>
                    <span>Qtd</span>
                    <span>Subtotal</span>
                    <span></span>
                </div>
                ${listaHTML}
            </div>

            <div class="carrinho-resumo">
                <h3>Resumo do pedido</h3>
                <div class="carrinho-resumo-linha">
                    <span>Subtotal (${itens.length} ${itens.length === 1 ? 'item' : 'itens'})</span>
                    <span>R$ ${formatarPreco(totalGeral)}</span>
                </div>
                <div class="carrinho-resumo-linha">
                    <span>Frete</span>
                    <span style="color: var(--text-gray-lighter);">A calcular</span>
                </div>
                <div class="carrinho-resumo-linha total">
                    <span>Total</span>
                    <span>R$ ${formatarPreco(totalGeral)}</span>
                </div>
                <a href="${getPaginaInternaHref('checkout')}" class="btn-finalizar" id="btnFinalizarPedido">
                    Finalizar pedido <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </a>
                <a href="${getPaginaInternaHref('produtos')}" class="btn-continuar">
                    <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Continuar comprando
                </a>
            </div>
        </div>
    `

    
    conteudo.querySelectorAll('.carrinho-lista-qtd button').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id
            const qtdAtual = parseInt(btn.dataset.qtd)
            const acao = btn.dataset.acao
            const novaQtd = acao === 'aumentar' ? qtdAtual + 1 : qtdAtual - 1
            await atualizarQuantidade(id, novaQtd)
            await renderizarPaginaCarrinho()
        })
    })


    conteudo.querySelectorAll('.carrinho-lista-remover').forEach(btn => {
        btn.addEventListener('click', async () => {
            await removerDoCarrinho(btn.dataset.id)
            await renderizarPaginaCarrinho()
        })
    })
}

// Guard para garantir que o DOM está pronto antes de executar
function whenDomReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => callback(), { once: true })
    } else {
        callback()
    }
}



whenDomReady(() => {
    renderizarPaginaCarrinho()
})
