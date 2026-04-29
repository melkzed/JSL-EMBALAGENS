import { supabase, state, openModal, slugify, debounce } from './admin-state.js'
import { verificarAuth } from './admin-auth.js'
import { initNavegacao } from './admin-nav.js'
import { carregarDashboard, carregarPedidosPorPeriodo } from './admin-dashboard.js'
import { carregarProdutos, abrirModalProduto, addVarianteRow, salvarProduto, excluirProduto, excluirImagem, carregarSpecsProduto } from './admin-produtos.js'
import { carregarCategorias, abrirModalCategoria, addCategoriaSpecRow, salvarCategoria, excluirCategoria, atualizarPreviewImagemCategoria } from './admin-categorias.js'
import { carregarPedidos, verPedido, confirmarPagamento, cancelarPedido, mudarStatus } from './admin-pedidos.js'
import { carregarUsuarios, verUsuario, verPedidoDeUsuario } from './admin-usuarios.js'
import { carregarEstoque, registrarMovimentacao } from './admin-estoque.js'
import { carregarEntregas, abrirModalEntrega, salvarEntrega } from './admin-entregas.js'
import { carregarPagamentos, aprovarPagamento, recusarPagamento, reembolsar } from './admin-pagamentos.js'
import { carregarAvaliacoes, aprovarReview, abrirResponderReview, enviarResposta } from './admin-avaliacoes.js'
import { carregarFiscal } from './admin-fiscal.js'
import { carregarAdmins, criarAdmin, desativarAdmin, ativarAdmin, mudarCargoAdmin } from './admin-administracao.js'
import { gerarPreviewProduto } from './admin-preview.js'
import { initHeroHomeAdmin } from './admin-hero.js'


function initEventListeners() {
    
    document.getElementById('btnNovoProduto').addEventListener('click', () => abrirModalProduto())
    document.getElementById('formProduto').addEventListener('submit', salvarProduto)
    document.getElementById('btnAddVariante').addEventListener('click', () => addVarianteRow())
    document.getElementById('filtroProdutoBusca').addEventListener('input', debounce(carregarProdutos, 400))
    document.getElementById('filtroProdutoCategoria').addEventListener('change', carregarProdutos)
    document.getElementById('filtroProdutoStatus').addEventListener('change', carregarProdutos)

    
    document.getElementById('produtoNome').addEventListener('input', (e) => {
        const slugInput = document.getElementById('produtoSlug')
        if (!document.getElementById('produtoId').value) {
            slugInput.value = slugify(e.target.value)
        }
    })

    
    document.getElementById('btnNovaCategoria').addEventListener('click', () => abrirModalCategoria())
    document.getElementById('formCategoria').addEventListener('submit', salvarCategoria)
    document.getElementById('categoriaNome').addEventListener('input', (e) => {
        const slugInput = document.getElementById('categoriaSlug')
        if (!document.getElementById('categoriaId').value) {
            slugInput.value = slugify(e.target.value)
        }
    })

    
    document.getElementById('filtroPedidoBusca').addEventListener('input', debounce(carregarPedidos, 400))
    document.getElementById('filtroPedidoStatus').addEventListener('change', carregarPedidos)

    
    document.getElementById('filtroUsuarioBusca').addEventListener('input', debounce(carregarUsuarios, 400))

    
    document.getElementById('btnMovimentarEstoque').addEventListener('click', () => openModal('modalEstoque'))
    document.getElementById('formEstoque').addEventListener('submit', registrarMovimentacao)
    document.getElementById('filtroEstoqueBusca').addEventListener('input', debounce(carregarEstoque, 400))
    document.getElementById('filtroEstoqueStatus').addEventListener('change', carregarEstoque)

    
    document.getElementById('filtroEntregaStatus').addEventListener('change', carregarEntregas)
    document.getElementById('formEntrega').addEventListener('submit', salvarEntrega)

    
    document.getElementById('filtroPagamentoStatus').addEventListener('change', carregarPagamentos)
    document.getElementById('filtroPagamentoMetodo').addEventListener('change', carregarPagamentos)

    
    document.getElementById('filtroAvaliacaoStatus').addEventListener('change', carregarAvaliacoes)
    document.getElementById('formResposta').addEventListener('submit', enviarResposta)

    
    document.getElementById('filtroFiscalStatus').addEventListener('change', carregarFiscal)

    
    const btnNovoAdmin = document.getElementById('btnNovoAdmin')
    if (state.currentAdmin.role !== 'super_admin') {
        btnNovoAdmin.style.display = 'none'
    }
    btnNovoAdmin.addEventListener('click', () => openModal('modalAdmin'))
    document.getElementById('formAdmin').addEventListener('submit', criarAdmin)

    
    document.getElementById('dashPeriodo').addEventListener('change', carregarPedidosPorPeriodo)
    initHeroHomeAdmin()

    
    document.getElementById('btnAddCategoriaSpec').addEventListener('click', () => addCategoriaSpecRow())

    
    document.getElementById('categoriaIcone').addEventListener('input', (e) => {
        const val = e.target.value.trim()
        document.getElementById('categoriaIconePreview').innerHTML = val ? `<i class="${val}"></i>` : ''
    })

    document.getElementById('categoriaImagemUrl').addEventListener('input', (e) => {
        atualizarPreviewImagemCategoria(e.target.value.trim())
    })

    document.getElementById('inputImagemCategoria').addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (!file) {
            atualizarPreviewImagemCategoria(document.getElementById('categoriaImagemUrl').value.trim())
            return
        }

        const reader = new FileReader()
        reader.onload = (ev) => atualizarPreviewImagemCategoria(ev.target.result)
        reader.readAsDataURL(file)
    })

    document.getElementById('btnRemoverImagemCategoria').addEventListener('click', () => {
        document.getElementById('categoriaImagemUrl').value = ''
        document.getElementById('inputImagemCategoria').value = ''
        atualizarPreviewImagemCategoria('')
    })

    
    document.getElementById('btnPreviewProduto').addEventListener('click', () => gerarPreviewProduto())

    
    document.getElementById('inputImagemProduto').addEventListener('change', (e) => {
        const preview = document.getElementById('imagensPreview')
        preview.innerHTML = ''
        const files = e.target.files
        for (const file of files) {
            const reader = new FileReader()
            reader.onload = (ev) => {
                const img = document.createElement('img')
                img.src = ev.target.result
                img.className = 'admin-img-preview'
                preview.appendChild(img)
            }
            reader.readAsDataURL(file)
        }
    })

    
    document.getElementById('produtoCategoria').addEventListener('change', async (e) => {
        const catId = e.target.value
        const specsContainer = document.getElementById('specsContainer')
        specsContainer.innerHTML = ''
        if (!catId) return

        const { data: specs } = await supabase
            .from('category_specs')
            .select('*')
            .eq('category_id', catId)
            .order('sort_order')

        if (specs && specs.length) {
            specs.forEach(spec => {
                const row = document.createElement('div')
                row.className = 'admin-spec-row'
                row.innerHTML = `
                    <label>${spec.spec_name}${spec.spec_unit ? ' (' + spec.spec_unit + ')' : ''}</label>
                    <input type="text" class="spec-value" data-spec-id="${spec.id}" value="" placeholder="Valor">
                `
                specsContainer.appendChild(row)
            })
        }
    })
}


window.adminEditProduto = abrirModalProduto
window.adminDeleteProduto = excluirProduto
window.adminDeleteImagem = excluirImagem
window.adminEditCategoria = abrirModalCategoria
window.adminDeleteCategoria = excluirCategoria
window.adminVerPedido = verPedido
window.adminConfirmarPagamento = confirmarPagamento
window.adminCancelarPedido = cancelarPedido
window.adminMudarStatus = mudarStatus
window.adminMovEstoque = (varId) => {
    document.getElementById('estoqueVariante').value = varId
    openModal('modalEstoque')
}
window.adminEditEntrega = abrirModalEntrega
window.adminReembolsar = reembolsar
window.adminAprovarPagamento = aprovarPagamento
window.adminRecusarPagamento = recusarPagamento
window.adminAprovarReview = aprovarReview
window.adminResponderReview = abrirResponderReview
window.adminDesativar = desativarAdmin
window.adminAtivar = ativarAdmin
window.adminVerUsuario = verUsuario
window.adminVerPedidoDeUsuario = verPedidoDeUsuario
window.adminMudarCargoAdmin = mudarCargoAdmin


async function init() {
    await verificarAuth()

    
    const loaders = {
        dashboard: carregarDashboard,
        produtos: carregarProdutos,
        categorias: carregarCategorias,
        pedidos: carregarPedidos,
        usuarios: carregarUsuarios,
        estoque: carregarEstoque,
        entregas: carregarEntregas,
        pagamentos: carregarPagamentos,
        avaliacoes: carregarAvaliacoes,
        fiscal: carregarFiscal,
        administracao: carregarAdmins
    }

    initNavegacao(loaders)
    initEventListeners()
    carregarDashboard()
}

init()
