import { supabase } from "./supabaseClient.js"
import { getUser, getProfile, verificarSessao, abrirAuthModal } from "./auth.js"
import { carregarItensCarrinho, limparCarrinho } from "./cart.js"
import { animarCheckBounce } from "./animacoes.js"
import { escapeHtml, formatarPreco, mostrarToast } from "./utils.js"
import {
    renderizarPixQRCode,
    renderizarFormCartao,
    processarPagamentoCartao,
    atualizarSelectParcelas,
    CONFIG_PAGAMENTO
} from "./pagamento.js?v=20260418c"
import {
    calcularFrete,
    renderizarOpcoesFrete,
    mostrarFreteLoading,
    getOpcaoFreteSelecionada,
    limparFreteSelecionado
} from "./frete.js"



let enderecoSelecionado = null
let itensCarrinho = []
let freteSelecionado = null
let tipoEntrega = 'entrega'
let _checkCepValidado = false
let _enderecosData = []

const LOJA_RETIRADA = {
    street: 'R. Francisco Guimarães',
    number: 'S/N',
    complement: null,
    neighborhood: 'Centro',
    city: 'Itaporanga',
    state: 'PB',
    zip_code: '58780-000',
    label: 'Loja JSL Embalagens',
    recipient: 'JSL Soluções em Embalagens',
    prazo: '3 dias úteis'
}
const WHATSAPP_NUMERO = '5583996389725'



document.addEventListener('DOMContentLoaded', async () => {
    await new Promise(resolve => setTimeout(resolve, 400))

    const logado = await verificarSessao()

    if (!logado) {
        mostrarBannerLogin()
        return
    }

    await iniciarCheckout()
})



function mostrarBannerLogin() {
    const checkPage = document.getElementById('checkoutPage')
    if (!checkPage) return

    checkPage.innerHTML = `
        <div class="checkout-auth-aviso">
            <div class="checkout-auth-aviso-icon">
                <i class="fa-solid fa-lock"></i>
            </div>
            <h2>Entre para finalizar seu pedido</h2>
            <p>Para concluir a compra, é necessário estar logado na sua conta.</p>
            <p>Seus itens do carrinho estão salvos e esperando por você!</p>
            <div class="checkout-auth-aviso-acoes">
                <button class="checkout-btn-primary" id="checkoutBtnLogin">
                    <i class="fa-solid fa-right-to-bracket"></i> Entrar na minha conta
                </button>
                <button class="checkout-btn-cadastro" id="checkoutBtnCadastro">
                    <i class="fa-solid fa-user-plus"></i> Criar uma conta
                </button>
            </div>
            <a href="./carrinho.html" class="checkout-auth-voltar">
                <i class="fa-solid fa-arrow-left"></i> Voltar ao carrinho
            </a>
        </div>
    `

    document.getElementById('checkoutBtnLogin')?.addEventListener('click', () => {
        abrirAuthModal('authLoginPanel')
    })

    document.getElementById('checkoutBtnCadastro')?.addEventListener('click', () => {
        abrirAuthModal('authCadastroPanel')
    })

    window.addEventListener('auth-changed', async (e) => {
        if (e.detail?.user) {
            window.location.reload()
        }
    }, { once: true })
}



async function iniciarCheckout() {

    const params = new URLSearchParams(window.location.search)
    const retomarId = params.get('retomar')

    if (retomarId) {
        await retomarPagamento(retomarId)
        return
    }

    const profile = getProfile()
    if (!profile?.cpf) {
        const checkPage = document.getElementById('checkoutPage')
        if (checkPage) {
            checkPage.innerHTML = `
                <div class="checkout-cpf-aviso">
                    <div class="checkout-cpf-aviso-icon">
                        <i class="fa-solid fa-id-card"></i>
                    </div>
                    <h2>CPF necessário para continuar</h2>
                    <p>Para finalizar sua compra, é obrigatório ter o <strong>CPF cadastrado</strong> no seu perfil.</p>
                    <p>O CPF é exigido para emissão de nota fiscal e para o envio do pedido.</p>
                    <div class="checkout-cpf-aviso-acoes">
                        <a href="./perfil.html?tab=dados" class="checkout-btn-primary">
                            <i class="fa-solid fa-user-pen"></i> Ir para meu perfil
                        </a>
                        <a href="./carrinho.html" class="checkout-btn-outline">
                            <i class="fa-solid fa-arrow-left"></i> Voltar ao carrinho
                        </a>
                    </div>
                </div>
            `
        }
        return
    }

    itensCarrinho = await carregarItensCarrinho()
    if (itensCarrinho.length === 0) {
        window.location.href = './carrinho.html'
        return
    }

    await carregarEnderecos()
    initEventListeners()
    initMascaraCEP()
}



async function retomarPagamento(orderId) {
    const user = getUser()
    if (!user) return

    const { data: pedido, error } = await supabase
        .from('orders')
        .select(`
            *,
            order_items (
                *,
                product_variants (
                    size_label,
                    price,
                    products (id, name)
                )
            ),
            payments (id, method, status, amount)
        `)
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single()

    if (error || !pedido) {
        mostrarToast('Pedido não encontrado.', 'erro')
        window.location.href = './perfil.html?tab=pedidos'
        return
    }

    if (pedido.status !== 'pending') {
        mostrarToast('Este pedido já foi processado.', 'erro')
        window.location.href = './perfil.html?tab=pedidos'
        return
    }

    const pagamento = pedido.payments?.[0]
    const metodo = pagamento?.method || 'pix'
    const totalPedido = parseFloat(pedido.total)
    const numero = pedido.order_number || pedido.id.slice(0, 8).toUpperCase()

    const itensResumo = (pedido.order_items || []).map(item => ({
        product_name: item.product_variants?.products?.name || item.product_name || 'Produto',
        variant_label: item.product_variants?.size_label || item.variant_label || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price
    }))

    const endPedido = {
        street: pedido.shipping_street,
        number: pedido.shipping_number,
        complement: pedido.shipping_complement,
        neighborhood: pedido.shipping_neighborhood,
        city: pedido.shipping_city,
        state: pedido.shipping_state,
        zip_code: pedido.shipping_zip_code,
        recipient: pedido.shipping_recipient
    }

    irParaStep(3)

    const pixArea = document.getElementById('pixPaymentArea')
    const cardArea = document.getElementById('cardPaymentResult')
    const sucessoArea = document.getElementById('checkoutSucesso')
    if (pixArea) pixArea.style.display = 'none'
    if (cardArea) cardArea.style.display = 'none'
    if (sucessoArea) sucessoArea.style.display = 'none'

    if (metodo === 'pix') {
        if (pixArea) {
            pixArea.style.display = ''
            pixArea.innerHTML = ''
            renderizarPixQRCode(pixArea, totalPedido, numero, pedido.id)

            const infoExtra = document.createElement('div')
            infoExtra.className = 'pix-pedido-info'
            infoExtra.innerHTML = `
                <div class="checkout-info-grupo" style="margin-top: 1.5rem;">
                    <h4><i class="fa-solid fa-box"></i> Pedido ${escapeHtml(numero)}</h4>
                    <p>${itensResumo.length} ${itensResumo.length === 1 ? 'item' : 'itens'} - Total: <strong>R$ ${formatarPreco(totalPedido)}</strong></p>
                </div>
                <div class="checkout-info-grupo">
                    <h4><i class="fa-solid fa-truck"></i> Entrega</h4>
                    <p>${escapeHtml(endPedido.street)}, ${escapeHtml(endPedido.number)} - ${escapeHtml(endPedido.neighborhood)}</p>
                    <p>${escapeHtml(endPedido.city)}/${escapeHtml(endPedido.state)} - CEP: ${escapeHtml(endPedido.zip_code)}</p>
                </div>
                <div class="checkout-sucesso-acoes" style="margin-top:1.5rem;">
                    <a href="./perfil.html?tab=pedidos" class="checkout-btn-primary">
                        <i class="fa-solid fa-box"></i> Ver meus pedidos
                    </a>
                    <a href="./produtos.html" class="checkout-btn-outline">
                        <i class="fa-solid fa-arrow-left"></i> Continuar comprando
                    </a>
                </div>
            `
            pixArea.appendChild(infoExtra)
        }
    } else if (metodo === 'credit_card' || metodo === 'debit_card') {
        if (cardArea) {
            cardArea.style.display = ''
            cardArea.innerHTML = `
                <div class="card-result processing">
                    <div class="card-result-icon">
                        <i class="fa-solid fa-credit-card"></i>
                    </div>
                    <h2>Pagamento pendente</h2>
                    <p class="checkout-pedido-numero">Pedido ${escapeHtml(numero)}</p>
                    <p class="card-result-msg">
                        O pagamento deste pedido ainda está pendente. 
                        Entre em contato pelo WhatsApp para concluir.
                    </p>
                    <div class="checkout-sucesso-info">
                        <div class="checkout-info-grupo">
                            <h4><i class="fa-solid fa-box"></i> Resumo</h4>
                            <p>${itensResumo.length} ${itensResumo.length === 1 ? 'item' : 'itens'} - Total: <strong>R$ ${formatarPreco(totalPedido)}</strong></p>
                        </div>
                        <div class="checkout-info-grupo">
                            <h4><i class="fa-solid fa-truck"></i> Entrega</h4>
                            <p>${escapeHtml(endPedido.street)}, ${escapeHtml(endPedido.number)} - ${escapeHtml(endPedido.neighborhood)}</p>
                            <p>${escapeHtml(endPedido.city)}/${escapeHtml(endPedido.state)} - CEP: ${escapeHtml(endPedido.zip_code)}</p>
                        </div>
                    </div>
                    <div class="checkout-sucesso-acoes">
                        <a href="https://wa.me/5583996389725?text=${encodeURIComponent('Olá! Preciso concluir o pagamento do pedido ' + numero + ' no valor de R$ ' + formatarPreco(totalPedido))}" 
                           target="_blank" rel="noopener noreferrer" class="checkout-btn-whatsapp">
                            <i class="fa-brands fa-whatsapp"></i> Falar com suporte
                        </a>
                        <a href="./perfil.html?tab=pedidos" class="checkout-btn-outline">
                            <i class="fa-solid fa-box"></i> Ver meus pedidos
                        </a>
                    </div>
                </div>
            `
        }
    } else {
        if (sucessoArea) {
            sucessoArea.style.display = ''
            const iconeSucesso = document.querySelector('.checkout-sucesso-icon')
            if (iconeSucesso) {
                iconeSucesso.innerHTML = '<i class="fa-solid fa-clock"></i>'
                iconeSucesso.style.color = '#f59e0b'
            }
            document.getElementById('pedidoNumero').textContent = `Pedido ${numero}`
            document.querySelector('.checkout-pedido-msg').textContent = 'Seu pedido está aguardando confirmação de pagamento.'

            const msg = `Olá! Gostaria de concluir o pagamento do pedido ${numero} no valor de R$ ${formatarPreco(totalPedido)}`
            document.getElementById('pedidoInfo').innerHTML = `
                <div class="checkout-info-grupo">
                    <h4><i class="fa-solid fa-box"></i> Resumo</h4>
                    <p>${itensResumo.length} ${itensResumo.length === 1 ? 'item' : 'itens'} - Total: <strong>R$ ${formatarPreco(totalPedido)}</strong></p>
                </div>
                <div class="checkout-info-grupo">
                    <h4><i class="fa-solid fa-truck"></i> Entrega</h4>
                    <p>${escapeHtml(endPedido.street)}, ${escapeHtml(endPedido.number)} - ${escapeHtml(endPedido.neighborhood)}</p>
                    <p>${escapeHtml(endPedido.city)}/${escapeHtml(endPedido.state)} - CEP: ${escapeHtml(endPedido.zip_code)}</p>
                </div>
                <a href="https://wa.me/5583996389725?text=${encodeURIComponent(msg)}" 
                   target="_blank" rel="noopener noreferrer" class="checkout-btn-whatsapp">
                    <i class="fa-brands fa-whatsapp"></i> Enviar pedido pelo WhatsApp
                </a>
            `
        }
    }
}



async function carregarEnderecos() {
    const user = getUser()
    if (!user) return

    const container = document.getElementById('checkoutEnderecos')
    if (!container) return

    const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao carregar endereços:', error)
        container.innerHTML = '<p style="color: var(--error-red);">Erro ao carregar endereços</p>'
        return
    }

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="checkout-sem-endereco">
                <i class="fa-solid fa-map-marker-alt"></i>
                <p>Nenhum endereço cadastrado. Adicione um abaixo.</p>
            </div>
        `
        return
    }

    _enderecosData = data

    container.innerHTML = data.map(end => `
        <label class="checkout-endereco-card ${end.is_default ? 'recomendado' : ''}" data-id="${end.id}">
            <input type="radio" name="enderecoEntrega" value="${end.id}" ${end.is_default ? 'checked' : ''}>
            <div class="checkout-endereco-info">
                <div class="checkout-endereco-top">
                    <strong><i class="fa-solid ${end.label === 'Trabalho' ? 'fa-briefcase' : 'fa-house'}"></i> ${escapeHtml(end.label || 'Endereço')}</strong>
                    ${end.is_default ? '<span class="checkout-badge-padrao">Padrão</span>' : ''}
                </div>
                ${end.recipient ? `<p><strong>${escapeHtml(end.recipient)}</strong></p>` : ''}
                <p>${escapeHtml(end.street)}, ${escapeHtml(end.number)}${end.complement ? ' - ' + escapeHtml(end.complement) : ''}</p>
                <p>${escapeHtml(end.neighborhood)} - ${escapeHtml(end.city)}/${escapeHtml(end.state)}</p>
                <p>CEP: ${escapeHtml(end.zip_code)}</p>
            </div>
            <div class="checkout-endereco-acoes">
                <button type="button" class="checkout-endereco-btn-editar" data-editar-id="${end.id}" title="Editar endereço">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button type="button" class="checkout-endereco-btn-excluir" data-excluir-id="${end.id}" title="Excluir endereço">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </label>
    `).join('')

    const padrao = data.find(e => e.is_default) || data[0]
    selecionarEndereco(padrao, data)

    container.querySelectorAll('input[name="enderecoEntrega"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const end = data.find(e => e.id === radio.value)
            selecionarEndereco(end, data)
        })
    })

    container.querySelectorAll('[data-editar-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const end = data.find(ed => ed.id === btn.dataset.editarId)
            if (end) abrirEdicaoEnderecoCheckout(end)
        })
    })

    container.querySelectorAll('[data-excluir-id]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault()
            e.stopPropagation()
            await excluirEnderecoCheckout(btn.dataset.excluirId)
        })
    })
}



function abrirEdicaoEnderecoCheckout(end) {
    const wrapper = document.getElementById('checkoutNovoEndereco')
    if (!wrapper) return

    wrapper.style.display = ''
    wrapper.querySelector('h3').textContent = 'Editar endereço'

    document.getElementById('checkCEP').value = end.zip_code || ''
    document.getElementById('checkApelido').value = end.label || 'Casa'
    document.getElementById('checkRua').value = end.street || ''
    document.getElementById('checkNumero').value = end.number || ''
    document.getElementById('checkComplemento').value = end.complement || ''
    document.getElementById('checkBairro').value = end.neighborhood || ''
    document.getElementById('checkCidade').value = end.city || ''
    document.getElementById('checkEstado').value = end.state || ''
    document.getElementById('checkDestinatario').value = end.recipient || ''

    wrapper.dataset.editandoId = end.id
    _checkCepValidado = true

    wrapper.scrollIntoView({ behavior: 'smooth' })
}



async function excluirEnderecoCheckout(id) {
    if (!confirm('Tem certeza que deseja excluir este endereço?')) return

    const { error } = await supabase
        .from('addresses')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Erro ao excluir endereço:', error)
        mostrarToast('Erro ao excluir endereço', 'erro')
        return
    }

    if (enderecoSelecionado?.id === id) {
        enderecoSelecionado = null
        freteSelecionado = null
        const freteSection = document.getElementById('checkoutFreteSection')
        if (freteSection) freteSection.style.display = 'none'
        const btn = document.getElementById('btnIrRevisao')
        if (btn) btn.disabled = true
    }

    mostrarToast('Endereço excluído!', 'sucesso')
    await carregarEnderecos()
}

function selecionarEndereco(end, lista) {
    enderecoSelecionado = end

    document.querySelectorAll('.checkout-endereco-card').forEach(card => {
        card.classList.remove('selecionado')
    })
    const card = document.querySelector(`.checkout-endereco-card[data-id="${end.id}"]`)
    if (card) {
        card.classList.add('selecionado')
        card.querySelector('input').checked = true
    }

    calcularFreteParaEndereco(end)

    const btn = document.getElementById('btnIrRevisao')
    if (btn) btn.disabled = true
}



async function calcularFreteParaEndereco(end) {
    const freteSection = document.getElementById('checkoutFreteSection')
    const freteContainer = document.getElementById('freteOpcoes')
    if (!freteSection || !freteContainer) return

    const cep = end.zip_code?.replace(/\D/g, '')
    if (!cep || cep.length !== 8) return

    freteSection.style.display = ''
    mostrarFreteLoading(freteContainer)
    freteSelecionado = null
    limparFreteSelecionado()

    const resultado = await calcularFrete(cep, itensCarrinho)

    if (resultado.erro || !resultado.opcoes || resultado.opcoes.length === 0) {
        freteContainer.innerHTML = `
            <div class="frete-erro">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <p>${resultado.erro || 'Não foi possível calcular o frete para este CEP.'}</p>
            </div>
        `
        return
    }

    renderizarOpcoesFrete(freteContainer, resultado.opcoes, (opcao) => {
        freteSelecionado = opcao
        const btn = document.getElementById('btnIrRevisao')
        if (btn) btn.disabled = false

        if (document.getElementById('resumoFinal')) montarRevisao()
        const metodo = document.querySelector('input[name="metodoPagamento"]:checked')?.value
        if (metodo === 'credit_card') {
            const total = calcularTotalCarrinho()
            atualizarSelectParcelas(total)
        }
    })
}



async function salvarNovoEndereco(e) {
    e.preventDefault()
    const user = getUser()
    if (!user) return

    const btn = e.target.querySelector('button[type="submit"]')

    const cep = document.getElementById('checkCEP').value.trim()
    const rua = document.getElementById('checkRua').value.trim()
    const numero = document.getElementById('checkNumero').value.trim()
    const bairro = document.getElementById('checkBairro').value.trim()
    const cidade = document.getElementById('checkCidade').value.trim()
    const estado = document.getElementById('checkEstado').value

    if (!cep || cep.replace(/\D/g, '').length !== 8) {
        mostrarToast('Preencha o CEP corretamente (8 dígitos)', 'erro')
        return
    }
    if (!rua) { mostrarToast('Preencha o nome da rua', 'erro'); return }
    if (!numero) { mostrarToast('Preencha o número do endereço', 'erro'); return }
    if (!bairro) { mostrarToast('Preencha o bairro', 'erro'); return }
    if (!cidade) { mostrarToast('Preencha a cidade', 'erro'); return }
    if (!estado) { mostrarToast('Selecione o estado (UF)', 'erro'); return }

    if (!_checkCepValidado) {
        btn.disabled = true
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando CEP...'
        const cepValido = await buscarCEPCheckout(true)
        if (!cepValido) {
            btn.disabled = false
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar e usar'
            return
        }
    }

    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'

    const wrapper = document.getElementById('checkoutNovoEndereco')
    const editandoId = wrapper?.dataset.editandoId || null

    try {
        const { data: perfil } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle()

        if (!perfil) {
            await supabase.from('profiles').insert([{
                id: user.id,
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário'
            }])
        }

        const dados = {
            user_id: user.id,
            label: document.getElementById('checkApelido').value,
            recipient: document.getElementById('checkDestinatario').value.trim() || null,
            zip_code: cep,
            street: rua,
            number: numero,
            complement: document.getElementById('checkComplemento').value.trim() || null,
            neighborhood: bairro,
            city: cidade,
            state: estado,
            is_default: false
        }

        let error
        if (editandoId) {
            const res = await supabase.from('addresses').update(dados).eq('id', editandoId)
            error = res.error
        } else {
            const res = await supabase.from('addresses').insert([dados])
            error = res.error
        }

        if (error) {
            console.error('Erro ao salvar endereço:', error)
            let msgErro = 'Erro ao salvar endereço.'
            if (error.message?.includes('violates foreign key') || error.message?.includes('foreign key')) {
                msgErro = 'Erro: seu perfil precisa estar completo. Vá em Dados Pessoais e preencha CPF e nome.'
            } else if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
                msgErro = 'Este endereço já está cadastrado.'
            } else if (error.message?.includes('permission') || error.message?.includes('policy') || error.code === '42501') {
                msgErro = 'Sem permissão para salvar endereço. Faça login novamente.'
            } else if (error.message) {
                msgErro = 'Erro ao salvar endereço: ' + error.message
            }
            mostrarToast(msgErro, 'erro')
            return
        }

        if (wrapper) delete wrapper.dataset.editandoId
        wrapper.style.display = 'none'
        document.getElementById('checkoutFormEndereco')?.reset()
        _checkCepValidado = false

        await carregarEnderecos()
        mostrarToast(editandoId ? 'Endereço atualizado!' : 'Endereço salvo!', 'sucesso')
    } catch (err) {
        console.error('Exceção:', err)
        mostrarToast('Erro inesperado ao salvar endereço. Verifique sua conexão.', 'erro')
    } finally {
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar e usar'
    }
}

async function buscarCEPCheckout(silencioso = false) {
    const cepInput = document.getElementById('checkCEP')
    const cep = cepInput.value.replace(/\D/g, '')
    if (cep.length !== 8) {
        if (!silencioso) mostrarToast('Digite um CEP válido com 8 dígitos', 'erro')
        _checkCepValidado = false
        return false
    }

    const prefixo = parseInt(cep.substring(0, 5))
    if (prefixo < 1000 || prefixo > 99999) {
        mostrarToast('CEP inválido. Verifique o número digitado.', 'erro')
        _checkCepValidado = false
        return false
    }

    const btn = document.getElementById('checkBtnCEP')
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'
    cepInput.classList.remove('input-erro', 'input-sucesso')

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
        const data = await resp.json()

        if (data.erro) {
            mostrarToast('CEP não encontrado. Verifique se digitou corretamente.', 'erro')
            cepInput.classList.add('input-erro')
            _checkCepValidado = false
            return false
        } else {
            document.getElementById('checkRua').value = data.logradouro || ''
            document.getElementById('checkBairro').value = data.bairro || ''
            document.getElementById('checkCidade').value = data.localidade || ''
            document.getElementById('checkEstado').value = data.uf || ''
            cepInput.classList.add('input-sucesso')
            _checkCepValidado = true
            document.getElementById('checkNumero').focus()
            return true
        }
    } catch {
        mostrarToast('Erro de conexão ao buscar CEP. Tente novamente.', 'erro')
        _checkCepValidado = false
        return false
    } finally {
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-search"></i>'
    }
}



function montarRevisao() {
    const endDiv = document.getElementById('revisaoEndereco')
    if (tipoEntrega === 'retirada') {
        endDiv.innerHTML = `
            <h3><i class="fa-solid fa-store"></i> Retirar na loja</h3>
            <div class="checkout-revisao-end-card checkout-revisao-retirada">
                <div class="checkout-retirada-badge-revisao"><i class="fa-solid fa-store"></i> Retirada na loja - Frete Grátis</div>
                <strong>${escapeHtml(LOJA_RETIRADA.label)}</strong>
                <p>${escapeHtml(LOJA_RETIRADA.street)}, ${escapeHtml(LOJA_RETIRADA.number)} - ${escapeHtml(LOJA_RETIRADA.neighborhood)}</p>
                <p>${escapeHtml(LOJA_RETIRADA.city)}/${escapeHtml(LOJA_RETIRADA.state)} - CEP: ${escapeHtml(LOJA_RETIRADA.zip_code)}</p>
                <p style="margin-top:0.5rem;"><i class="fa-solid fa-clock" style="color:var(--primary-blue);"></i> Prazo estimado: <strong>${LOJA_RETIRADA.prazo}</strong> após confirmação do pagamento</p>
            </div>
        `
    } else if (enderecoSelecionado) {
        const e = enderecoSelecionado
        endDiv.innerHTML = `
            <h3><i class="fa-solid fa-truck"></i> Entregar em</h3>
            <div class="checkout-revisao-end-card">
                <strong>${escapeHtml(e.label)}</strong>
                ${e.recipient ? `<p>${escapeHtml(e.recipient)}</p>` : ''}
                <p>${escapeHtml(e.street)}, ${escapeHtml(e.number)}${e.complement ? ' - ' + escapeHtml(e.complement) : ''}</p>
                <p>${escapeHtml(e.neighborhood)} - ${escapeHtml(e.city)}/${escapeHtml(e.state)}</p>
                <p>CEP: ${escapeHtml(e.zip_code)}</p>
            </div>
        `
    }

    const itensDiv = document.getElementById('revisaoItens')
    let totalGeral = 0

    itensDiv.innerHTML = '<h3><i class="fa-solid fa-box"></i> Itens do pedido</h3>' +
        itensCarrinho.map(item => {
            const variant = item.product_variants
            const product = variant?.products
            const nome = product?.name || 'Produto'
            const label = variant?.size_label || ''
            const preco = parseFloat(variant?.price || 0)
            const subtotal = preco * item.quantity
            totalGeral += subtotal

            const imgs = product?.product_images || []
            const img = imgs.length > 0 ? imgs[0].url : '../img/imagemExemplo.jpg'

            return `
                <div class="checkout-revisao-item">
                    <img src="${img}" alt="${escapeHtml(nome)}">
                    <div class="checkout-revisao-item-info">
                        <strong>${escapeHtml(nome)}</strong>
                        ${label ? `<span>${escapeHtml(label)}</span>` : ''}
                        <span>Qtd: ${item.quantity}</span>
                    </div>
                    <div class="checkout-revisao-item-preco">
                        R$ ${formatarPreco(subtotal)}
                    </div>
                </div>
            `
        }).join('')

    const resumoDiv = document.getElementById('resumoFinal')
    const observacoes = document.getElementById('checkoutObservacoes')?.value.trim()
    const isRetirada = tipoEntrega === 'retirada'
    const custoFreteRevisao = isRetirada ? 0 : (freteSelecionado?.preco || 0)

    resumoDiv.innerHTML = `
        <div class="checkout-resumo-linha">
            <span>Subtotal (${itensCarrinho.length} ${itensCarrinho.length === 1 ? 'item' : 'itens'})</span>
            <span>R$ ${formatarPreco(totalGeral)}</span>
        </div>
        <div class="checkout-resumo-linha">
            ${isRetirada
                ? `<span><i class="fa-solid fa-store"></i> Retirada na loja</span>
                   <span style="color:var(--success-green, #25D366);font-weight:600;">Grátis</span>`
                : `<span>Frete${freteSelecionado ? ` (${freteSelecionado.transportadora} ${freteSelecionado.servico})` : ''}</span>
                   <span>${freteSelecionado ? `R$ ${formatarPreco(freteSelecionado.preco)}` : '<span style="color: var(--text-gray-lighter);">A combinar</span>'}</span>`
            }
        </div>
        ${!isRetirada && freteSelecionado ? `
        <div class="checkout-resumo-linha prazo">
            <span><i class="fa-regular fa-clock"></i> Prazo estimado</span>
            <span>${freteSelecionado.prazoMin}-${freteSelecionado.prazoMax} dias úteis</span>
        </div>
        ` : ''}
        ${isRetirada ? `
        <div class="checkout-resumo-linha prazo">
            <span><i class="fa-regular fa-clock"></i> Prazo para retirada</span>
            <span>${LOJA_RETIRADA.prazo}</span>
        </div>
        ` : ''}
        ${observacoes ? `
        <div class="checkout-resumo-linha obs">
            <span>Observações:</span>
            <span>${escapeHtml(observacoes)}</span>
        </div>
        ` : ''}
        <div class="checkout-resumo-linha total">
            <span>Total</span>
            <span>R$ ${formatarPreco(totalGeral + custoFreteRevisao)}</span>
        </div>
    `
}



async function confirmarPedido() {
    const user = getUser()
    if (!user || !enderecoSelecionado) {
        mostrarToast('Erro: usuário não logado ou endereço não selecionado.', 'erro')
        return
    }

    const profile = getProfile()
    if (!profile?.cpf) {
        mostrarToast('Você precisa cadastrar seu CPF no perfil antes de finalizar a compra.', 'erro')
        return
    }

    const btn = document.getElementById('btnConfirmarPedido')
    if (btn.disabled) return
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...'

    const metodoPagamento = document.querySelector('input[name="metodoPagamento"]:checked')?.value || 'pix'

    try {
        // ── Criar perfil se não existir ──
        const { data: perfil } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle()

        if (!perfil) {
            const { error: erroPerfil } = await supabase.from('profiles').insert([{
                id: user.id,
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário'
            }])
            if (erroPerfil) {
                console.error('Erro ao criar perfil:', erroPerfil)
                mostrarToast('Erro ao preparar conta. Tente novamente.', 'erro')
                btn.disabled = false
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar pedido'
                return
            }
        }

        const isRetirada = tipoEntrega === 'retirada'
        const end = isRetirada ? LOJA_RETIRADA : enderecoSelecionado
        const observacoes = document.getElementById('checkoutObservacoes')?.value.trim() || null

        // ── Calcular totais ──
        let subtotal = 0
        const itensParaInserir = itensCarrinho.map(item => {
            const variant = item.product_variants
            const product = variant?.products
            const preco = parseFloat(variant?.price || 0)
            const totalItem = preco * item.quantity
            subtotal += totalItem
            return {
                variant_id: variant.id,
                product_name: product?.name || 'Produto',
                variant_label: variant?.size_label || null,
                sku: variant?.sku || null,
                quantity: item.quantity,
                unit_price: preco,
                total_price: totalItem
            }
        })

        const custoFrete = isRetirada ? 0 : (freteSelecionado?.preco || 0)
        const totalPedido = subtotal + custoFrete
        const freteDescricao = isRetirada
            ? 'Retirada na loja'
            : (freteSelecionado ? `${freteSelecionado.transportadora} ${freteSelecionado.servico}` : null)

        let metodoParaBanco = metodoPagamento
        if (metodoPagamento === 'whatsapp') metodoParaBanco = 'transfer'
        if (metodoPagamento === 'credit_card' || metodoPagamento === 'debit_card') metodoParaBanco = 'credit_card'

        // ── Criar pedido ──
        console.log('[Checkout] Criando pedido...')
        const { data: pedido, error: erroPedido } = await supabase
            .from('orders')
            .insert([{
                user_id: user.id,
                status: 'pending',
                subtotal: subtotal,
                discount: 0,
                shipping_cost: custoFrete,
                total: totalPedido,
                shipping_street: end.street,
                shipping_number: end.number,
                shipping_complement: end.complement,
                shipping_neighborhood: end.neighborhood,
                shipping_city: end.city,
                shipping_state: end.state,
                shipping_zip_code: end.zip_code,
                shipping_recipient: end.recipient,
                notes: observacoes
                    ? (freteDescricao ? `[${freteDescricao}] ${observacoes}` : observacoes)
                    : (freteDescricao ? `[${freteDescricao}]` : null)
            }])
            .select()
            .single()

        if (erroPedido) {
            console.error('[Checkout] Erro ao criar pedido:', erroPedido)
            mostrarToast('Erro ao criar pedido: ' + (erroPedido.message || 'tente novamente'), 'erro')
            btn.disabled = false
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar pedido'
            return
        }

        console.log('[Checkout] Pedido criado:', pedido.id, pedido.order_number)

        // ── Inserir itens ──
        const itensComOrderId = itensParaInserir.map(item => ({ ...item, order_id: pedido.id }))
        console.log('[Checkout] Inserindo', itensComOrderId.length, 'itens...')

        const { error: erroItens } = await supabase
            .from('order_items')
            .insert(itensComOrderId)

        if (erroItens) {
            console.error('[Checkout] Erro ao inserir itens:', erroItens)
            await supabase.from('orders').delete().eq('id', pedido.id).catch(() => {})
            mostrarToast('Erro ao processar itens: ' + (erroItens.message || 'verifique as permissões'), 'erro')
            btn.disabled = false
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar pedido'
            return
        }

        console.log('[Checkout] Itens inseridos com sucesso')

        // ── Criar registro de pagamento ──
        const { error: erroPag } = await supabase.from('payments').insert([{
            order_id: pedido.id,
            method: metodoParaBanco,
            status: 'pending',
            amount: totalPedido
        }])
        if (erroPag) console.warn('[Checkout] Aviso pagamento:', erroPag.message)

        // ── Criar shipment ──
        if (isRetirada) {
            try {
                const { error: erroShip } = await supabase.from('shipments').insert([{
                    order_id: pedido.id,
                    carrier_id: null,
                    status: 'preparing',
                    shipping_cost: 0,
                    notes: `Retirada na loja — ${LOJA_RETIRADA.street}, ${LOJA_RETIRADA.neighborhood}, ${LOJA_RETIRADA.city}/${LOJA_RETIRADA.state} — Prazo: ${LOJA_RETIRADA.prazo}`
                }])
                if (erroShip) console.warn('[Checkout] Aviso shipment retirada:', erroShip.message)
                else console.log('[Checkout] Shipment retirada criado')
            } catch (e) {
                console.warn('[Checkout] Erro ao criar shipment retirada:', e)
            }
        } else if (freteSelecionado) {
            try {
                const nomeTransp = freteSelecionado.transportadora
                let carrierId = null

                const { data: carrier } = await supabase
                    .from('carriers')
                    .select('id')
                    .ilike('name', `%${nomeTransp}%`)
                    .eq('active', true)
                    .maybeSingle()

                if (carrier) {
                    carrierId = carrier.id
                } else {
                    const trackingUrls = {
                        'Correios': 'https://rastreio.correios.com.br/?objetos={code}',
                        'Jadlog': 'https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte={code}',
                        'Braspress': 'https://www.braspress.com/rastrear/?code={code}',
                    }
                    const { data: novoCarrier } = await supabase
                        .from('carriers')
                        .insert([{
                            name: nomeTransp,
                            tracking_url_template: trackingUrls[nomeTransp] || null,
                            active: true
                        }])
                        .select('id')
                        .single()

                    if (novoCarrier) carrierId = novoCarrier.id
                }

                const hoje = new Date()
                const diasUteis = freteSelecionado.prazoMax || 15
                const estimativa = new Date(hoje)
                estimativa.setDate(estimativa.getDate() + Math.ceil(diasUteis * 1.4))

                const { error: erroShip } = await supabase.from('shipments').insert([{
                    order_id: pedido.id,
                    carrier_id: carrierId,
                    status: 'preparing',
                    shipping_cost: freteSelecionado.preco || 0,
                    estimated_delivery: estimativa.toISOString().split('T')[0],
                    notes: `${freteSelecionado.transportadora} ${freteSelecionado.servico} — Prazo: ${freteSelecionado.prazoMin}-${freteSelecionado.prazoMax} dias úteis`
                }])

                if (erroShip) console.warn('[Checkout] Aviso shipment:', erroShip.message)
                else console.log('[Checkout] Shipment criado para', nomeTransp)
            } catch (shipErr) {
                console.warn('[Checkout] Erro ao criar shipment:', shipErr)
            }
        }

        // ── Pagamento via PagBank (cartão crédito/débito) ──
        if (metodoPagamento === 'credit_card' || metodoPagamento === 'debit_card') {
            console.log('[Checkout] Processando pagamento com cartao...')
            const resultado = await processarPagamentoCartao({
                pedidoId: pedido.id,
                valor: totalPedido,
                tipo: metodoPagamento,
                userEmail: user.email
            })

            if (!resultado.success) {
                mostrarToast(resultado.errors?.[0] || 'Erro ao processar pagamento. Tente novamente.', 'erro')
                btn.disabled = false
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar pedido'
                return
            }

            await limparCarrinho()
            mostrarResultadoCartao(pedido, itensParaInserir, metodoPagamento, resultado)
            return
        }

        // ── PIX ou WhatsApp ──
        console.log('[Checkout] Limpando carrinho...')
        await limparCarrinho()

        if (metodoPagamento === 'pix') {
            mostrarPagamentoPix(pedido, itensParaInserir, totalPedido)
        } else {
            mostrarConfirmacao(pedido, itensParaInserir, metodoPagamento)
        }

    } catch (err) {
        console.error('[Checkout] Exceção:', err)
        mostrarToast('Erro inesperado: ' + (err.message || 'tente novamente'), 'erro')
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar pedido'
    }
}



function mostrarConfirmacao(pedido, itens, metodo) {
    irParaStep(3)

    const pixArea = document.getElementById('pixPaymentArea')
    const cardArea = document.getElementById('cardPaymentResult')
    const sucessoArea = document.getElementById('checkoutSucesso')
    if (pixArea) pixArea.style.display = 'none'
    if (cardArea) cardArea.style.display = 'none'
    if (sucessoArea) sucessoArea.style.display = ''

    const iconeSucesso = document.querySelector('.checkout-sucesso-icon')
    if (iconeSucesso) animarCheckBounce(iconeSucesso)

    const numero = pedido.order_number || `#${pedido.id.slice(0, 8).toUpperCase()}`
    document.getElementById('pedidoNumero').textContent = `Pedido ${numero}`

    const metodoLabels = {
        pix: 'PIX',
        credit_card: 'Cartão de Crédito',
        debit_card: 'Cartão de Débito',
        transfer: 'Transferência Bancária',
        whatsapp: 'Pagamento via WhatsApp'
    }

    const infoDiv = document.getElementById('pedidoInfo')
    const end = enderecoSelecionado

    let infoHTML = `
        <div class="checkout-info-grupo">
            <h4><i class="fa-solid fa-credit-card"></i> Pagamento</h4>
            <p>${metodoLabels[metodo] || metodo}</p>
        </div>
        <div class="checkout-info-grupo">
            <h4><i class="fa-solid fa-truck"></i> Entrega</h4>
            <p>${escapeHtml(end.street)}, ${escapeHtml(end.number)} - ${escapeHtml(end.neighborhood)}</p>
            <p>${escapeHtml(end.city)}/${escapeHtml(end.state)} - CEP: ${escapeHtml(end.zip_code)}</p>
        </div>
        <div class="checkout-info-grupo">
            <h4><i class="fa-solid fa-box"></i> Resumo</h4>
            <p>${itens.length} ${itens.length === 1 ? 'item' : 'itens'} - Total: <strong>R$ ${formatarPreco(pedido.total)}</strong></p>
        </div>
    `

    if (metodo === 'whatsapp') {
        const msg = montarMensagemWhatsApp(pedido, itens, end)
        infoHTML += `
            <a href="https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msg)}" 
               target="_blank" rel="noopener noreferrer" class="checkout-btn-whatsapp">
                <i class="fa-brands fa-whatsapp"></i> Enviar pedido pelo WhatsApp
            </a>
        `
    }

    infoDiv.innerHTML = infoHTML
}



function mostrarPagamentoPix(pedido, itens, valor) {
    irParaStep(3)

    const cardArea = document.getElementById('cardPaymentResult')
    const sucessoArea = document.getElementById('checkoutSucesso')
    if (cardArea) cardArea.style.display = 'none'
    if (sucessoArea) sucessoArea.style.display = 'none'

    const pixArea = document.getElementById('pixPaymentArea')
    pixArea.style.display = ''

    const numero = pedido.order_number || pedido.id.slice(0, 8).toUpperCase()

    renderizarPixQRCode(pixArea, valor, numero, pedido.id)

    const infoExtra = document.createElement('div')
    infoExtra.className = 'pix-pedido-info'
    infoExtra.innerHTML = `
        <div class="checkout-info-grupo" style="margin-top: 1.5rem;">
            <h4><i class="fa-solid fa-box"></i> Pedido ${escapeHtml(numero)}</h4>
            <p>${itens.length} ${itens.length === 1 ? 'item' : 'itens'} - Total: <strong>R$ ${formatarPreco(valor)}</strong></p>
        </div>
        <div class="checkout-sucesso-acoes" style="margin-top:1.5rem;">
            <a href="./perfil.html?tab=pedidos" class="checkout-btn-primary">
                <i class="fa-solid fa-box"></i> Ver meus pedidos
            </a>
            <a href="./produtos.html" class="checkout-btn-outline">
                <i class="fa-solid fa-arrow-left"></i> Continuar comprando
            </a>
        </div>
    `
    pixArea.appendChild(infoExtra)
}

function mostrarResultadoCartao(pedido, itens, metodo, resultado) {
    irParaStep(3)

    const pixArea = document.getElementById('pixPaymentArea')
    const cardArea = document.getElementById('cardPaymentResult')
    const sucessoArea = document.getElementById('checkoutSucesso')
    if (pixArea) pixArea.style.display = 'none'
    if (sucessoArea) sucessoArea.style.display = 'none'
    if (!cardArea) return

    cardArea.style.display = ''

    const status = resultado?.status || 'approved'
    const numero = pedido.order_number || pedido.id.slice(0, 8).toUpperCase()
    const icone = status === 'approved'
        ? 'fa-circle-check'
        : (status === 'processing' ? 'fa-hourglass-half' : 'fa-circle-xmark')
    const titulo = status === 'approved'
        ? 'Pagamento aprovado!'
        : (status === 'processing' ? 'Pagamento em analise' : 'Pagamento nao aprovado')
    const mensagem = resultado?.message || (
        status === 'approved'
            ? 'Seu pagamento foi confirmado com sucesso.'
            : (status === 'processing'
                ? 'Recebemos sua solicitacao e o PagBank esta analisando o pagamento.'
                : 'Nao foi possivel concluir o pagamento.')
    )

    cardArea.innerHTML = `
        <div class="card-result ${status}">
            <div class="card-result-icon">
                <i class="fa-solid ${icone}"></i>
            </div>
            <h2>${titulo}</h2>
            <p class="card-result-msg">${mensagem}</p>
            <div class="checkout-info-grupo" style="max-width:420px;margin:1.5rem auto 0;text-align:left;">
                <h4><i class="fa-solid fa-box"></i> Pedido ${escapeHtml(numero)}</h4>
                <p>${itens.length} ${itens.length === 1 ? 'item' : 'itens'} - Total: <strong>R$ ${formatarPreco(pedido.total)}</strong></p>
                <p>Metodo: <strong>${metodo === 'debit_card' ? 'Cartao de Debito' : 'Cartao de Credito'}</strong></p>
            </div>
            <div class="checkout-sucesso-acoes" style="margin-top:1.5rem;">
                <a href="./perfil.html?tab=pedidos" class="checkout-btn-primary">
                    <i class="fa-solid fa-box"></i> Ver meus pedidos
                </a>
                <a href="./produtos.html" class="checkout-btn-outline">
                    <i class="fa-solid fa-arrow-left"></i> Continuar comprando
                </a>
            </div>
        </div>
    `

    if (status === 'approved') {
        const iconeSucesso = cardArea.querySelector('.card-result-icon')
        if (iconeSucesso) animarCheckBounce(iconeSucesso)
    }
}



function montarMensagemWhatsApp(pedido, itens, end) {
    const numero = pedido.order_number || pedido.id.slice(0, 8).toUpperCase()
    let msg = `🛒 *PEDIDO ${numero}*\n\n`

    msg += `📦 *Itens:*\n`
    itens.forEach(item => {
        msg += `• ${item.product_name}`
        if (item.variant_label) msg += ` (${item.variant_label})`
        msg += ` × ${item.quantity} = R$ ${formatarPreco(item.total_price)}\n`
    })

    const subtotalItens = itens.reduce((s, i) => s + i.total_price, 0)
    msg += `\n💰 *Subtotal: R$ ${formatarPreco(subtotalItens)}*\n`

    if (freteSelecionado) {
        msg += `🚚 *Frete (${freteSelecionado.transportadora} ${freteSelecionado.servico}): R$ ${formatarPreco(freteSelecionado.preco)}*\n`
        msg += `⏱ *Prazo: ${freteSelecionado.prazoMin}-${freteSelecionado.prazoMax} dias úteis*\n`
    }

    msg += `\n💰 *TOTAL: R$ ${formatarPreco(pedido.total)}*\n`

    msg += `\n📍 *Endereço:*\n`
    if (end.recipient) msg += `${end.recipient}\n`
    msg += `${end.street}, ${end.number}`
    if (end.complement) msg += ` - ${end.complement}`
    msg += `\n${end.neighborhood} - ${end.city}/${end.state}\n`
    msg += `CEP: ${end.zip_code}\n`

    if (pedido.notes) {
        msg += `\n📝 *Obs:* ${pedido.notes}\n`
    }

    msg += `\nGostaria de combinar o pagamento!`

    return msg
}



function irParaStep(step) {
    document.getElementById('checkoutStep1').style.display = step === 1 ? '' : 'none'
    document.getElementById('checkoutStep2').style.display = step === 2 ? '' : 'none'
    document.getElementById('checkoutStep3').style.display = step === 3 ? '' : 'none'

    document.querySelectorAll('.checkout-step').forEach(el => {
        const s = parseInt(el.dataset.step)
        el.classList.remove('ativo', 'completo')
        if (s === step) el.classList.add('ativo')
        if (s < step) el.classList.add('completo')
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
}



function initEventListeners() {
    document.getElementById('btnNovoEnderecoCheckout')?.addEventListener('click', () => {
        const wrapper = document.getElementById('checkoutNovoEndereco')
        if (wrapper) {
            wrapper.style.display = ''
            wrapper.querySelector('h3').textContent = 'Novo endereço'
            document.getElementById('checkoutFormEndereco')?.reset()
            delete wrapper.dataset.editandoId
            _checkCepValidado = false
        }
    })

    document.getElementById('checkCancelarEndereco')?.addEventListener('click', () => {
        const wrapper = document.getElementById('checkoutNovoEndereco')
        if (wrapper) {
            wrapper.style.display = 'none'
            delete wrapper.dataset.editandoId
            document.getElementById('checkoutFormEndereco')?.reset()
            _checkCepValidado = false
        }
    })

    document.getElementById('checkoutFormEndereco')?.addEventListener('submit', salvarNovoEndereco)
    document.getElementById('checkBtnCEP')?.addEventListener('click', () => buscarCEPCheckout(false))

    document.querySelectorAll('input[name="tipoEntrega"]').forEach(radio => {
        radio.addEventListener('change', () => {
            tipoEntrega = radio.value
            const entregaWrapper = document.getElementById('checkoutEntregaWrapper')
            const retiradaLoja = document.getElementById('checkoutRetiradaLoja')
            const btnRevisao = document.getElementById('btnIrRevisao')

            document.querySelectorAll('.checkout-tipo-entrega-option').forEach(opt => {
                opt.classList.remove('selecionado')
            })
            radio.closest('.checkout-tipo-entrega-option').classList.add('selecionado')

            if (tipoEntrega === 'retirada') {
                if (entregaWrapper) entregaWrapper.style.display = 'none'
                if (retiradaLoja) retiradaLoja.style.display = ''
                if (btnRevisao) btnRevisao.disabled = false
                if (document.getElementById('resumoFinal')) montarRevisao()
                const metodo = document.querySelector('input[name="metodoPagamento"]:checked')?.value
                if (metodo === 'credit_card') {
                    const total = calcularTotalCarrinho()
                    atualizarSelectParcelas(total)
                }
            } else {
                if (entregaWrapper) entregaWrapper.style.display = ''
                if (retiradaLoja) retiradaLoja.style.display = 'none'
                if (btnRevisao) btnRevisao.disabled = !(enderecoSelecionado && freteSelecionado)
            }
        })
    })

    document.getElementById('btnIrRevisao')?.addEventListener('click', () => {
        if (tipoEntrega === 'entrega') {
            if (!enderecoSelecionado) {
                mostrarToast('Selecione um endereço de entrega', 'erro')
                return
            }
            if (!freteSelecionado) {
                mostrarToast('Selecione uma opção de frete', 'erro')
                return
            }
        }
        montarRevisao()
        irParaStep(2)
    })

    document.getElementById('btnVoltarEndereco')?.addEventListener('click', () => {
        irParaStep(1)
    })

    document.getElementById('btnConfirmarPedido')?.addEventListener('click', confirmarPedido)

    document.querySelectorAll('.checkout-pagamento-opcao input').forEach(radio => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.checkout-pagamento-opcao').forEach(opt => {
                opt.classList.remove('selecionada')
            })
            radio.closest('.checkout-pagamento-opcao').classList.add('selecionada')

            const cardContainer = document.getElementById('cardFormContainer')
            const metodo = radio.value

            // Cartao usa formulario local e processamento direto via API /orders
            if (cardContainer) {
                if (metodo === 'credit_card' || metodo === 'debit_card') {
                    cardContainer.style.display = ''
                    renderizarFormCartao(cardContainer, metodo)
                    if (metodo === 'credit_card') {
                        const total = calcularTotalCarrinho()
                        atualizarSelectParcelas(total)
                    }
                } else {
                    cardContainer.style.display = 'none'
                    cardContainer.innerHTML = ''
                }
            }
        })
    })
}

function initMascaraCEP() {
    const cepInput = document.getElementById('checkCEP')
    if (cepInput) {
        cepInput.addEventListener('input', () => {
            let val = cepInput.value.replace(/\D/g, '')
            if (val.length > 5) val = val.slice(0, 5) + '-' + val.slice(5, 8)
            cepInput.value = val
            cepInput.classList.remove('input-erro', 'input-sucesso')
            _checkCepValidado = false

            if (val.length === 8) {
                buscarCEPCheckout(true)
            }
        })
    }
}



function calcularTotalCarrinho() {
    let total = 0
    itensCarrinho.forEach(item => {
        const preco = parseFloat(item.product_variants?.price || 0)
        total += preco * item.quantity
    })

    if (freteSelecionado?.preco && tipoEntrega !== 'retirada') {
        total += freteSelecionado.preco
    }
    return total
}
