import { initMenu } from "./menu.js"
import { initQuantidade } from "./quantidade.js"
import { initAnimacoes } from "./animacoes.js"
import { initWhatsapp } from "./whatsapp.js"
import { carregarProdutos, renderizarCardsProdutos, carregarCategorias } from "./products.js"
import { initCarrinhoSidebar, initBotoesAdicionarCarrinho, atualizarBadgeCarrinho } from "./cart.js"
import { initAuthModal, verificarSessao, initAuthListener } from "./auth.js"




function isInHtmlFolder() {
    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/')
    return path.includes('/html/')
}

function isFriendlyUrlHost() {
    const host = window.location.hostname
    return host === 'www.jslembalagens.com.br' || host === 'jslembalagens.com.br'
}

function getBasePath() {
    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/')
    return (path === '/' || path === '/index.html') ? './' : '../'
}

function getPageHref(page) {
    const inHtmlFolder = isInHtmlFolder()
    const useFriendlyUrls = isFriendlyUrlHost()

    const routes = {
        index: useFriendlyUrls ? '/' : (inHtmlFolder ? '../index.html' : './index.html'),
        produtos: useFriendlyUrls ? '/produtos' : (inHtmlFolder ? './produtos.html' : './html/produtos.html'),
        sobre: useFriendlyUrls ? '/sobre' : (inHtmlFolder ? './sobre.html' : './html/sobre.html'),
        contato: useFriendlyUrls ? '/contato' : (inHtmlFolder ? './contato.html' : './html/contato.html'),
        politicas: useFriendlyUrls ? '/politicas' : (inHtmlFolder ? './politicas.html' : './html/politicas.html'),
        carrinho: useFriendlyUrls ? '/carrinho' : (inHtmlFolder ? './carrinho.html' : './html/carrinho.html'),
        checkout: useFriendlyUrls ? '/checkout' : (inHtmlFolder ? './checkout.html' : './html/checkout.html'),
        perfil: useFriendlyUrls ? '/perfil' : (inHtmlFolder ? './perfil.html' : './html/perfil.html'),
        'confirmar-email': useFriendlyUrls ? '/confirmar-email' : (inHtmlFolder ? './confirmar-email.html' : './html/confirmar-email.html')
    }

    return routes[page] || '#'
}

function getCurrentPageKey() {
    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/').replace(/\/+$/, '') || '/'

    if (path === '/' || path === '/index.html') return 'index'
    if (path === '/produtos' || path === '/html/produtos.html') return 'produtos'
    if (path === '/sobre' || path === '/html/sobre.html') return 'sobre'
    if (path === '/contato' || path === '/html/contato.html') return 'contato'
    if (path === '/politicas' || path === '/html/politicas.html') return 'politicas'
    if (path === '/carrinho' || path === '/html/carrinho.html') return 'carrinho'
    if (path === '/checkout' || path === '/html/checkout.html') return 'checkout'
    if (path === '/perfil' || path === '/html/perfil.html') return 'perfil'
    if (path === '/confirmar-email' || path === '/html/confirmar-email.html') return 'confirmar-email'
    if (path === '/html/produto.html' || path.startsWith('/produtos/')) return 'produtos'

    return ''
}


async function carregarComponentes() {
    const basePath = getBasePath()

    const navbar = await fetch(basePath + "components/navbar.html")
    document.getElementById("navbar-placeholder").innerHTML = await navbar.text()

    const footer = await fetch(basePath + "components/footer.html")
    document.getElementById("footer-placeholder").innerHTML = await footer.text()

    const logoImg = document.querySelector('.logo-img[data-logo]')
    if (logoImg) {
        logoImg.src = basePath + 'img/' + logoImg.getAttribute('data-logo')
    }

    
    ajustarLinksNavegacao()
}

function ajustarLinksNavegacao() {
    const links = document.querySelectorAll('a[data-page]');
    const currentPageKey = getCurrentPageKey()

    links.forEach(link => {
        const page = link.getAttribute('data-page');
        link.href = getPageHref(page)
        link.dataset.route = page

        if (page === currentPageKey) {
            link.classList.add('ativo')
        }
    });
}



function initSuporteModal() {
    const btnAbrir = document.getElementById('btnSuporteFooter')
    const modal = document.getElementById('suporteModal')
    const btnFechar = document.getElementById('btnFecharSuporte')
    const btnEnviar = document.getElementById('btnEnviarSuporte')
    const opcoes = document.querySelectorAll('.suporte-opcao')
    const descricao = document.getElementById('suporteDescricao')

    if (!btnAbrir || !modal) return

    let categoriaSelecionada = ''

    btnAbrir.addEventListener('click', () => {
        modal.style.display = 'flex'
        document.body.style.overflow = 'hidden'
    })

    const fechar = () => {
        modal.style.display = 'none'
        document.body.style.overflow = ''
    }

    btnFechar?.addEventListener('click', fechar)
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar() })

    opcoes.forEach(btn => {
        btn.addEventListener('click', () => {
            opcoes.forEach(b => b.classList.remove('ativo'))
            btn.classList.add('ativo')
            categoriaSelecionada = btn.dataset.valor
            verificarBtnEnviar()
        })
    })

    descricao?.addEventListener('input', verificarBtnEnviar)

    function verificarBtnEnviar() {
        if (btnEnviar) btnEnviar.disabled = !categoriaSelecionada
    }

    btnEnviar?.addEventListener('click', () => {
        const desc = descricao?.value.trim() || ''
        const texto = `Olá! Preciso de ajuda.\n\n📋 Área: ${categoriaSelecionada}${desc ? '\n📝 Descrição: ' + desc : ''}`
        const url = `https://wa.me/5583996389725?text=${encodeURIComponent(texto)}`
        window.open(url, '_blank')
        fechar()
    })
}


function initFiltros() {
    const grid = document.querySelector('.produtos-grid')
    if (!grid) return

    const cards = Array.from(grid.querySelectorAll('.produto-card'))
    const ordemOriginal = [...cards]
    const busca = document.getElementById('busca')
    const ordenar = document.getElementById('ordenar')
    const precoMin = document.getElementById('precoMin')
    const precoMax = document.getElementById('precoMax')
    const apenasDisponiveis = document.getElementById('apenasDisponiveis')
    const resultadoInfo = document.getElementById('resultadoInfo')
    const filtrosTagsWrapper = document.getElementById('filtrosTagsWrapper')

    
    if (!busca || !ordenar || !precoMin || !precoMax || !apenasDisponiveis || !resultadoInfo || !filtrosTagsWrapper) return
    const filtrosAtivosBadge = document.getElementById('filtrosAtivosBadge')

    
    const btnAbrir = document.getElementById('btnAbrirFiltros')
    const btnFechar = document.getElementById('btnFecharFiltros')
    const btnAplicar = document.getElementById('btnAplicarFiltros')
    const btnLimpar = document.getElementById('btnLimparFiltros')
    const painel = document.getElementById('filtrosPainel')
    const overlay = document.getElementById('filtrosOverlay')

    const abrirPainel = () => {
        painel?.classList.add('aberto')
        overlay?.classList.add('ativo')
        document.body.style.overflow = 'hidden'
    }

    const fecharPainel = () => {
        painel?.classList.remove('aberto')
        overlay?.classList.remove('ativo')
        document.body.style.overflow = ''
    }

    btnAbrir?.addEventListener('click', abrirPainel)
    btnFechar?.addEventListener('click', fecharPainel)
    overlay?.addEventListener('click', fecharPainel)
    btnAplicar?.addEventListener('click', () => {
        fecharPainel()
        aplicarFiltros()
    })

    
    document.querySelectorAll('.preco-atalhos button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.preco-atalhos button').forEach(b => b.classList.remove('ativo'))
            btn.classList.add('ativo')
            if (precoMin) precoMin.value = btn.dataset.min
            if (precoMax) precoMax.value = btn.dataset.max
        })
    })

        ;[precoMin, precoMax].forEach(input => {
            input?.addEventListener('input', () => {
                document.querySelectorAll('.preco-atalhos button').forEach(b => b.classList.remove('ativo'))
            })
        })

    
    const botoesCat = document.querySelectorAll('.categorias-filtro button')
    botoesCat.forEach(btn => {
        btn.addEventListener('click', () => {
            botoesCat.forEach(b => b.classList.remove('ativo'))
            btn.classList.add('ativo')
            aplicarFiltros()
        })
    })

    
    btnLimpar?.addEventListener('click', limparFiltros)

    function limparFiltros() {
        botoesCat.forEach(b => b.classList.remove('ativo'))
        document.querySelector('.categorias-filtro button[data-categoria="todas"]')?.classList.add('ativo')
        document.querySelectorAll('.preco-atalhos button').forEach(b => b.classList.remove('ativo'))
        if (precoMin) precoMin.value = ''
        if (precoMax) precoMax.value = ''
        if (apenasDisponiveis) apenasDisponiveis.checked = false
        if (busca) busca.value = ''
        if (ordenar) ordenar.value = ''
        aplicarFiltros()
    }

    
    busca?.addEventListener('input', aplicarFiltros)

    
    ordenar?.addEventListener('change', aplicarFiltros)

    
    function aplicarFiltros() {
        const categoria = document.querySelector('.categorias-filtro button.ativo')?.dataset.categoria || 'todas'
        const termo = busca?.value.trim().toLowerCase() || ''
        const min = precoMin && precoMin.value !== '' ? parseFloat(precoMin.value) : null
        const max = precoMax && precoMax.value !== '' ? parseFloat(precoMax.value) : null
        const soDisponiveis = apenasDisponiveis?.checked || false

        let visiveis = []

        cards.forEach(card => {
            const cardCategoria = card.dataset.categoria || ''
            const nome = card.querySelector('h3')?.textContent.toLowerCase() || ''
            const preco = parseFloat(card.dataset.preco) || 0
            const disponivel = !card.classList.contains('indisponivel')

            const okCategoria = categoria === 'todas' || cardCategoria === categoria
            const okTexto = termo === '' || nome.includes(termo)
            const okMin = min === null || preco >= min
            const okMax = max === null || max === 0 || preco <= max
            const okDisponivel = !soDisponiveis || disponivel

            const visivel = okCategoria && okTexto && okMin && okMax && okDisponivel
            card.style.display = visivel ? '' : 'none'
            if (visivel) visiveis.push(card)
        })

        const ordem = ordenar?.value
        if (visiveis.length > 0) {
            const parent = visiveis[0].parentElement
            if (ordem === 'padrao' || !ordem) {
                
                ordemOriginal.forEach(card => {
                    if (visiveis.includes(card)) {
                        parent.appendChild(card)
                    }
                })
            } else {
                const ordenados = [...visiveis].sort((a, b) => {
                    const pa = parseFloat(a.dataset.preco) || 0
                    const pb = parseFloat(b.dataset.preco) || 0
                    const na = a.querySelector('h3')?.textContent || ''
                    const nb = b.querySelector('h3')?.textContent || ''
                    if (ordem === 'menor-preco') return pa - pb
                    if (ordem === 'maior-preco') return pb - pa
                    if (ordem === 'az') return na.localeCompare(nb)
                    if (ordem === 'za') return nb.localeCompare(na)
                    return 0
                })
                ordenados.forEach(card => parent.appendChild(card))
            }
        }

        if (resultadoInfo) {
            resultadoInfo.textContent = visiveis.length === 0
                ? 'Nenhum produto encontrado.'
                : `${visiveis.length} produto${visiveis.length > 1 ? 's' : ''} encontrado${visiveis.length > 1 ? 's' : ''}`
        }

        atualizarTags(categoria, min, max, termo, soDisponiveis)
    }

    function atualizarTags(categoria, min, max, termo, soDisponiveis) {
        if (!filtrosTagsWrapper) return
        filtrosTagsWrapper.innerHTML = ''

        const tags = []

        if (categoria !== 'todas') {
            const label = document.querySelector(`.categorias-filtro button[data-categoria="${categoria}"]`)?.textContent.trim() || categoria
            tags.push({
                texto: `Categoria: ${label}`, limpar: () => {
                    document.querySelector('.categorias-filtro button[data-categoria="todas"]')?.click()
                }
            })
        }

        if (min !== null && max !== null && max > 0) {
            tags.push({
                texto: `R$ ${min.toFixed(2).replace('.', ',')} – R$ ${max.toFixed(2).replace('.', ',')}`, limpar: () => {
                    if (precoMin) precoMin.value = ''
                    if (precoMax) precoMax.value = ''
                    document.querySelectorAll('.preco-atalhos button').forEach(b => b.classList.remove('ativo'))
                    aplicarFiltros()
                }
            })
        } else if (min !== null && (max === null || max === 0)) {
            tags.push({
                texto: `A partir de R$ ${min.toFixed(2).replace('.', ',')}`, limpar: () => {
                    if (precoMin) precoMin.value = ''
                    document.querySelectorAll('.preco-atalhos button').forEach(b => b.classList.remove('ativo'))
                    aplicarFiltros()
                }
            })
        }

        if (termo) {
            tags.push({
                texto: `Busca: "${termo}"`, limpar: () => {
                    if (busca) busca.value = ''
                    aplicarFiltros()
                }
            })
        }

        if (soDisponiveis) {
            tags.push({
                texto: 'Apenas disponíveis', limpar: () => {
                    if (apenasDisponiveis) apenasDisponiveis.checked = false
                    aplicarFiltros()
                }
            })
        }

        
        if (filtrosAtivosBadge) {
            const qtd = tags.length
            filtrosAtivosBadge.style.display = qtd > 0 ? 'inline-flex' : 'none'
            filtrosAtivosBadge.textContent = qtd
        }

        tags.forEach(tag => {
            const el = document.createElement('span')
            el.className = 'filtro-tag'
            const tagText = document.createTextNode(tag.texto + ' ')
            const btn = document.createElement('button')
            btn.title = 'Remover filtro'
            btn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
            btn.addEventListener('click', tag.limpar)
            el.appendChild(tagText)
            el.appendChild(btn)
            filtrosTagsWrapper.appendChild(el)
        })

        if (tags.length > 1) {
            const limparTodos = document.createElement('button')
            limparTodos.className = 'filtro-tag-limpar-todos'
            limparTodos.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Limpar todos'
            limparTodos.addEventListener('click', limparFiltros)
            filtrosTagsWrapper.appendChild(limparTodos)
        }
    }

    aplicarFiltros()
}


document.addEventListener("DOMContentLoaded", async () => {
    await carregarComponentes()

    
    initMenu()
    initAnimacoes()
    initWhatsapp()
    initQuantidade()
    initSuporteModal()

    
    initAuthModal()
    initAuthListener()
    await verificarSessao()

    
    initCarrinhoSidebar()
    initBotoesAdicionarCarrinho()
    atualizarBadgeCarrinho()

    
    let categorias = []
    try {
        categorias = await carregarCategorias()
    } catch (err) {
        console.error('Erro ao carregar categorias:', err)
    }

    const categoriasGrid = document.getElementById('categoriasGrid')
    if (categoriasGrid && categorias.length > 0) {
        const inHtml = isInHtmlFolder()
        const basePath = inHtml ? '../' : './'
        const produtosPath = getPageHref('produtos')
        const fallbackImg = basePath + 'img/imagemExemplo.jpg'

        const categoriasDestaque = categorias.filter(c => c.featured)
        const listaExibir = categoriasDestaque.length > 0 ? categoriasDestaque : categorias

        categoriasGrid.innerHTML = listaExibir.map(cat => {
            const safeName = cat.name ? cat.name.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''
            const safeSlug = encodeURIComponent(cat.slug || '')
            const safeImg = (cat.image_url || fallbackImg)
            return `
            <a href="${produtosPath}?categoria=${safeSlug}" class="categoria-card">
                <img src="${safeImg}" alt="${safeName}" loading="lazy">
                <div class="categoria-info">
                    ${safeName}
                </div>
            </a>
        `}).join('')
    }

    
    const categoriasFiltro = document.getElementById('categoriasFiltro')
    if (categoriasFiltro && categorias.length > 0) {
        const botoesHtml = categorias.map(cat => {
            const icone = cat.icon ? `<i class="${cat.icon.replace(/"/g, '')}"></i> ` : ''
            const safeName = cat.name ? cat.name.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''
            const safeSlug = encodeURIComponent(cat.slug || '')
            return `<button data-categoria="${safeSlug}">${icone}${safeName}</button>`
        }).join('')
        categoriasFiltro.insertAdjacentHTML('beforeend', botoesHtml)
    }

    // Carregar produtos do Supabase (apenas se houver grid na página)
    const grid = document.querySelector('.produtos-grid')
    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, '/')
    const isPaginaProdutoDetalhe = path.includes('produto.html') && !path.includes('produtos.html')

    if (grid && !isPaginaProdutoDetalhe) {
        try {
            const produtos = await carregarProdutos()
            if (produtos && produtos.length > 0) {
                await renderizarCardsProdutos(produtos, grid)
                initQuantidade()
                initBotoesAdicionarCarrinho()
            }
        } catch (err) {
            console.error('Erro ao carregar produtos:', err)
        }
    }

    // Inicializa filtros DEPOIS do carregamento dinâmico dos cards e categorias
    initFiltros()

    // Auto-selecionar categoria se vier por URL (?categoria=slug)
    const urlParams = new URLSearchParams(window.location.search)
    const catParam = urlParams.get('categoria')
    if (catParam && catParam !== 'todas') {
        const btnCat = document.querySelector(`.categorias-filtro button[data-categoria="${CSS.escape(catParam)}"]`)
        if (btnCat) btnCat.click()
    }
})
