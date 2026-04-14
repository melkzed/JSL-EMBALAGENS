import { supabase } from "./supabaseClient.js"
import { getUser, getProfile, verificarSessao, recuperarSenha, logout } from "./auth.js"
import { animarSlideDown } from "./animacoes.js"
import { escapeHtml, isUrlSegura, formatarPreco, mostrarToast } from "./utils.js"

function isFriendlyUrlHost() {
    const host = window.location.hostname
    return host === 'www.jslembalagens.com.br' || host === 'jslembalagens.com.br'
}

function getPageHref(page) {
    if (isFriendlyUrlHost()) {
        if (page === 'index') return '/'
        if (page === 'produtos') return '/produtos'
        if (page === 'checkout') return '/checkout'
    }

    if (page === 'index') return '../index.html'
    if (page === 'produtos') return './produtos.html'
    if (page === 'checkout') return './checkout.html'
    return '#'
}

function getProdutoHref(slugOrId) {
    const slug = encodeURIComponent(slugOrId || '')
    if (isFriendlyUrlHost()) {
        return `/produtos/${slug}`
    }

    return `./produto.html?produto=${slug}`
}


let _confirmarCb = null
function confirmarAcao(msg) {
    return new Promise(resolve => {
        const overlay = document.getElementById('modalConfirmarPerfil')
        document.getElementById('modalConfirmarPerfilMsg').textContent = msg
        _confirmarCb = resolve
        overlay.style.display = 'flex'
    })
}
function _fecharConfirmar(val) {
    document.getElementById('modalConfirmarPerfil').style.display = 'none'
    if (_confirmarCb) { _confirmarCb(val); _confirmarCb = null }
}
document.getElementById('btnConfirmarPerfilSim')?.addEventListener('click', () => _fecharConfirmar(true))
document.getElementById('btnConfirmarPerfilNao')?.addEventListener('click', () => _fecharConfirmar(false))



async function verificarLogin() {
    const logado = await verificarSessao()
    if (!logado) {
        window.location.href = getPageHref('produtos')
        return false
    }
    return true
}



function preencherDadosPerfil() {
    const user = getUser()
    const profile = getProfile()
    if (!user) return

    
    const nomeUsuario = document.getElementById('perfilNomeUsuario')
    const emailUsuario = document.getElementById('perfilEmailUsuario')
    const avatarCircle = document.getElementById('perfilAvatarCircle')

    const nome = profile?.full_name || user.user_metadata?.full_name || 'Usuário'
    if (nomeUsuario) nomeUsuario.textContent = nome
    if (emailUsuario) emailUsuario.textContent = user.email

    if (avatarCircle) {
        const overlayHTML = `<div class="perfil-avatar-overlay"><i class="fa-solid fa-camera"></i></div>`
        if (profile?.avatar_url && isUrlSegura(profile.avatar_url)) {
            avatarCircle.innerHTML = `<img src="${profile.avatar_url}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` + overlayHTML
            document.getElementById('btnRemoverAvatar')?.classList.add('visivel')
        } else {
            avatarCircle.innerHTML = (nome.charAt(0).toUpperCase() || 'U') + overlayHTML
            document.getElementById('btnRemoverAvatar')?.classList.remove('visivel')
        }
    }

    
    const elNome = document.getElementById('perfilNome')
    const elEmail = document.getElementById('perfilEmail')
    const elCPF = document.getElementById('perfilCPF')
    const elTelefone = document.getElementById('perfilTelefone')
    const elNascimento = document.getElementById('perfilNascimento')

    if (elNome) elNome.value = profile?.full_name || ''
    if (elEmail) elEmail.value = user.email || ''
    if (elCPF) elCPF.value = formatarCPF(profile?.cpf || '')
    if (elTelefone) elTelefone.value = formatarTelefone(profile?.phone || '')
    if (elNascimento) elNascimento.value = profile?.birth_date || ''
}



async function salvarDadosPessoais(e) {
    e.preventDefault()
    const user = getUser()
    if (!user) return

    const btn = document.getElementById('btnSalvarDados')
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'

    const nome = document.getElementById('perfilNome').value.trim()
    const cpf = document.getElementById('perfilCPF').value.replace(/\D/g, '')
    const telefone = document.getElementById('perfilTelefone').value.replace(/\D/g, '')
    const nascimento = document.getElementById('perfilNascimento').value || null

    
    if (cpf && !validarCPF(cpf)) {
        mostrarToast('CPF inválido', 'erro')
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar alterações'
        return
    }

    const { error } = await supabase
        .from('profiles')
        .update({
            full_name: nome,
            cpf: cpf || null,
            phone: telefone || null,
            birth_date: nascimento
        })
        .eq('id', user.id)

    if (error) {
        console.error('Erro ao salvar perfil:', error)
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
            mostrarToast('Este CPF já está cadastrado em outra conta', 'erro')
        } else {
            mostrarToast('Erro ao salvar dados', 'erro')
        }
    } else {
        mostrarToast('Dados salvos com sucesso!', 'sucesso')
        await verificarSessao()
        preencherDadosPerfil()
    }

    btn.disabled = false
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar alterações'
}



async function carregarEnderecos() {
    const user = getUser()
    if (!user) return

    const container = document.getElementById('listaEnderecos')
    if (!container) return

    container.innerHTML = '<div class="perfil-loading"><div class="spinner-sm"></div><p>Carregando...</p></div>'

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
            <div class="perfil-vazio">
                <i class="fa-solid fa-location-dot"></i>
                <h3>Nenhum endereço cadastrado</h3>
                <p>Adicione um endereço para facilitar suas compras</p>
            </div>
        `
        return
    }

    container.innerHTML = data.map(end => `
        <div class="perfil-endereco-card ${end.is_default ? 'padrao' : ''}" data-id="${end.id}">
            <div class="perfil-endereco-header">
                <div class="perfil-endereco-label">
                    <i class="fa-solid ${end.label === 'Trabalho' ? 'fa-briefcase' : 'fa-house'}"></i>
                    <strong>${escapeHtml(end.label || 'Endereço')}</strong>
                    ${end.is_default ? '<span class="perfil-badge-padrao">Padrão</span>' : ''}
                </div>
                <div class="perfil-endereco-acoes">
                    ${!end.is_default ? `<button class="perfil-btn-icon" data-acao="padrao" data-id="${end.id}" title="Definir como padrão"><i class="fa-solid fa-star"></i></button>` : ''}
                    <button class="perfil-btn-icon" data-acao="editar" data-id="${end.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="perfil-btn-icon danger" data-acao="excluir" data-id="${end.id}" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
            <div class="perfil-endereco-body">
                ${end.recipient ? `<p><strong>${escapeHtml(end.recipient)}</strong></p>` : ''}
                <p>${escapeHtml(end.street)}, ${escapeHtml(end.number)}${end.complement ? ' - ' + escapeHtml(end.complement) : ''}</p>
                <p>${escapeHtml(end.neighborhood)} - ${escapeHtml(end.city)}/${escapeHtml(end.state)}</p>
                <p>CEP: ${escapeHtml(end.zip_code)}</p>
            </div>
        </div>
    `).join('')

    
    container.querySelectorAll('[data-acao="editar"]').forEach(btn => {
        btn.addEventListener('click', () => editarEndereco(btn.dataset.id, data))
    })

    container.querySelectorAll('[data-acao="excluir"]').forEach(btn => {
        btn.addEventListener('click', () => excluirEndereco(btn.dataset.id))
    })

    container.querySelectorAll('[data-acao="padrao"]').forEach(btn => {
        btn.addEventListener('click', () => definirPadrao(btn.dataset.id))
    })
}

function abrirFormEndereco(dados = null) {
    const wrapper = document.getElementById('formEnderecoWrapper')
    const titulo = document.getElementById('formEnderecoTitulo')
    if (!wrapper) return

    wrapper.style.display = ''
    titulo.textContent = dados ? 'Editar endereço' : 'Novo endereço'

    
    document.getElementById('enderecoId').value = dados?.id || ''
    document.getElementById('enderecoApelido').value = dados?.label || 'Casa'
    document.getElementById('enderecoDestinatario').value = dados?.recipient || ''
    document.getElementById('enderecoCEP').value = dados?.zip_code || ''
    document.getElementById('enderecoRua').value = dados?.street || ''
    document.getElementById('enderecoNumero').value = dados?.number || ''
    document.getElementById('enderecoComplemento').value = dados?.complement || ''
    document.getElementById('enderecoBairro').value = dados?.neighborhood || ''
    document.getElementById('enderecoCidade').value = dados?.city || ''
    document.getElementById('enderecoEstado').value = dados?.state || ''
    document.getElementById('enderecoPadrao').checked = dados?.is_default || false

    wrapper.scrollIntoView({ behavior: 'smooth' })
}

function fecharFormEndereco() {
    const wrapper = document.getElementById('formEnderecoWrapper')
    if (wrapper) wrapper.style.display = 'none'
    document.getElementById('formEndereco').reset()
    document.getElementById('enderecoId').value = ''
    const cepInput = document.getElementById('enderecoCEP')
    if (cepInput) cepInput.classList.remove('input-erro', 'input-sucesso')
    _cepValidado = false
}

function editarEndereco(id, enderecos) {
    const end = enderecos.find(e => e.id === id)
    if (end) abrirFormEndereco(end)
}

async function excluirEndereco(id) {
    if (!await confirmarAcao('Tem certeza que deseja excluir este endereço?')) return

    const { error } = await supabase
        .from('addresses')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Erro ao excluir endereço:', error)
        mostrarToast('Erro ao excluir endereço', 'erro')
        return
    }

    mostrarToast('Endereço excluído', 'sucesso')
    await carregarEnderecos()
}

async function definirPadrao(id) {
    const user = getUser()
    if (!user) return

    
    await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', user.id)

    
    const { error } = await supabase
        .from('addresses')
        .update({ is_default: true })
        .eq('id', id)

    if (error) {
        console.error('Erro ao definir padrão:', error)
        mostrarToast('Erro ao definir endereço padrão', 'erro')
        return
    }

    mostrarToast('Endereço padrão atualizado', 'sucesso')
    await carregarEnderecos()
}

async function salvarEndereco(e) {
    e.preventDefault()
    const user = getUser()
    if (!user) return

    const btn = document.getElementById('btnSalvarEndereco')

    
    const cep = document.getElementById('enderecoCEP').value.trim()
    const rua = document.getElementById('enderecoRua').value.trim()
    const numero = document.getElementById('enderecoNumero').value.trim()
    const bairro = document.getElementById('enderecoBairro').value.trim()
    const cidade = document.getElementById('enderecoCidade').value.trim()
    const estado = document.getElementById('enderecoEstado').value

    if (!cep || cep.replace(/\D/g, '').length !== 8) {
        mostrarToast('Preencha o CEP corretamente (8 dígitos)', 'erro')
        return
    }
    if (!rua) { mostrarToast('Preencha o nome da rua', 'erro'); return }
    if (!numero) { mostrarToast('Preencha o número do endereço', 'erro'); return }
    if (!bairro) { mostrarToast('Preencha o bairro', 'erro'); return }
    if (!cidade) { mostrarToast('Preencha a cidade', 'erro'); return }
    if (!estado) { mostrarToast('Selecione o estado', 'erro'); return }

    
    if (!_cepValidado) {
        btn.disabled = true
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando CEP...'
        const cepValido = await buscarCEP(false)
        if (!cepValido) {
            btn.disabled = false
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar endereço'
            return
        }
    }

    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'

    try {
        
        const { data: perfil } = await supabase
            .from('profiles')
            .select('id, cpf')
            .eq('id', user.id)
            .maybeSingle()

        if (!perfil) {
            
            const { error: erroPerfil } = await supabase
                .from('profiles')
                .insert([{
                    id: user.id,
                    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário'
                }])

            if (erroPerfil) {
                console.error('Erro ao criar perfil:', erroPerfil)
                mostrarToast('Erro ao preparar conta. Tente novamente.', 'erro')
                return
            }
        }

        const id = document.getElementById('enderecoId').value
        const dados = {
            user_id: user.id,
            label: document.getElementById('enderecoApelido').value.trim() || 'Casa',
            recipient: document.getElementById('enderecoDestinatario').value.trim() || null,
            zip_code: cep,
            street: rua,
            number: numero,
            complement: document.getElementById('enderecoComplemento').value.trim() || null,
            neighborhood: bairro,
            city: cidade,
            state: estado,
            is_default: document.getElementById('enderecoPadrao').checked
        }

        
        if (dados.is_default) {
            const { error: erroDefault } = await supabase
                .from('addresses')
                .update({ is_default: false })
                .eq('user_id', user.id)

            if (erroDefault) {
                console.error('Erro ao atualizar padrão:', erroDefault)
            }
        }

        let error
        if (id) {
            const res = await supabase.from('addresses').update(dados).eq('id', id)
            error = res.error
        } else {
            const res = await supabase.from('addresses').insert([dados])
            error = res.error
        }

        if (error) {
            console.error('Erro ao salvar endereço:', error)
            
            let msgErro = 'Erro ao salvar endereço.'
            if (error.message?.includes('violates foreign key') || error.message?.includes('foreign key')) {
                msgErro = 'Erro: seu perfil precisa estar completo antes de salvar endereços. Vá em Dados Pessoais e preencha suas informações.'
            } else if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
                msgErro = 'Este endereço já está cadastrado.'
            } else if (error.message?.includes('permission') || error.message?.includes('policy') || error.code === '42501') {
                msgErro = 'Sem permissão para salvar endereço. Faça login novamente.'
            } else if (error.message) {
                msgErro = 'Erro ao salvar endereço: ' + error.message
            }
            mostrarToast(msgErro, 'erro')
        } else {
            mostrarToast('Endereço salvo com sucesso!', 'sucesso')
            fecharFormEndereco()
            await carregarEnderecos()
        }
    } catch (err) {
        console.error('Exceção ao salvar endereço:', err)
        mostrarToast('Erro inesperado ao salvar endereço. Verifique sua conexão e tente novamente.', 'erro')
    } finally {
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar endereço'
        _cepValidado = false
    }
}



let _cepValidado = false

async function buscarCEP(autoTriggered = false) {
    const cepInput = document.getElementById('enderecoCEP')
    const cep = cepInput.value.replace(/\D/g, '')
    if (cep.length !== 8) {
        if (!autoTriggered) mostrarToast('Digite um CEP válido com 8 dígitos', 'erro')
        _cepValidado = false
        return false
    }

    
    const prefixo = parseInt(cep.substring(0, 5))
    if (prefixo < 1000 || prefixo > 99999) {
        mostrarToast('CEP inválido. Verifique o número digitado.', 'erro')
        _cepValidado = false
        return false
    }

    const btn = document.getElementById('btnBuscarCEP')
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'
    cepInput.classList.remove('input-erro', 'input-sucesso')

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
        const data = await resp.json()

        if (data.erro) {
            mostrarToast('CEP não encontrado. Verifique se digitou corretamente.', 'erro')
            cepInput.classList.add('input-erro')
            _cepValidado = false
            return false
        } else {
            document.getElementById('enderecoRua').value = data.logradouro || ''
            document.getElementById('enderecoBairro').value = data.bairro || ''
            document.getElementById('enderecoCidade').value = data.localidade || ''
            document.getElementById('enderecoEstado').value = data.uf || ''
            cepInput.classList.add('input-sucesso')
            _cepValidado = true
            
            document.getElementById('enderecoNumero').focus()
            return true
        }
    } catch (err) {
        console.error('Erro ao buscar CEP:', err)
        mostrarToast('Erro de conexão ao buscar CEP. Tente novamente.', 'erro')
        _cepValidado = false
        return false
    } finally {
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-search"></i>'
    }
}



function detectarBandeira(numero) {
    const n = numero.replace(/\D/g, '')
    if (/^4/.test(n)) return 'visa'
    if (/^5[1-5]/.test(n) || /^2(2[2-9]|[3-6]|7[0-1]|720)/.test(n)) return 'mastercard'
    if (/^3[47]/.test(n)) return 'amex'
    if (/^(636368|438935|504175|451416|636297|5067|4576|4011|506699)/.test(n)) return 'elo'
    if (/^(6011|65|64[4-9])/.test(n)) return 'discover'
    if (/^(301|305|36|38)/.test(n)) return 'diners'
    if (/^(2131|1800|35)/.test(n)) return 'jcb'
    if (/^(606282|3841)/.test(n)) return 'hipercard'
    return ''
}

function getBandeiraIcone(bandeira) {
    const icones = {
        visa: 'fa-brands fa-cc-visa',
        mastercard: 'fa-brands fa-cc-mastercard',
        amex: 'fa-brands fa-cc-amex',
        discover: 'fa-brands fa-cc-discover',
        diners: 'fa-brands fa-cc-diners-club',
        jcb: 'fa-brands fa-cc-jcb',
        elo: 'fa-solid fa-credit-card',
        hipercard: 'fa-solid fa-credit-card'
    }
    return icones[bandeira] || 'fa-solid fa-credit-card'
}

function getBandeiraNome(bandeira) {
    const nomes = {
        visa: 'Visa',
        mastercard: 'Mastercard',
        amex: 'American Express',
        discover: 'Discover',
        diners: 'Diners Club',
        jcb: 'JCB',
        elo: 'Elo',
        hipercard: 'Hipercard'
    }
    return nomes[bandeira] || 'Cartão'
}

async function carregarCartoes() {
    const user = getUser()
    if (!user) return

    const container = document.getElementById('listaCartoes')
    if (!container) return

    container.innerHTML = '<div class="perfil-loading"><div class="spinner-sm"></div><p>Carregando...</p></div>'

    const { data, error } = await supabase
        .from('user_cards')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao carregar cartões:', error)
        container.innerHTML = '<p style="color: var(--error-red);">Erro ao carregar cartões</p>'
        return
    }

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="perfil-vazio">
                <i class="fa-solid fa-credit-card"></i>
                <h3>Nenhum cartão cadastrado</h3>
                <p>Adicione um cartão para agilizar suas compras</p>
            </div>
        `
        return
    }

    container.innerHTML = data.map(cartao => `
        <div class="perfil-cartao-card ${cartao.is_default ? 'padrao' : ''}" data-id="${cartao.id}">
            <div class="perfil-cartao-header">
                <div class="perfil-cartao-info">
                    <i class="${getBandeiraIcone(cartao.card_brand)} perfil-cartao-icone"></i>
                    <div>
                        <strong>${getBandeiraNome(cartao.card_brand)}</strong>
                        <span class="perfil-cartao-tipo">${cartao.card_type === 'debit' ? 'Débito' : 'Crédito'}</span>
                    </div>
                    ${cartao.is_default ? '<span class="perfil-badge-padrao">Padrão</span>' : ''}
                </div>
                <div class="perfil-cartao-acoes">
                    ${!cartao.is_default ? `<button class="perfil-btn-icon" data-acao="padrao-cartao" data-id="${cartao.id}" title="Definir como padrão"><i class="fa-solid fa-star"></i></button>` : ''}
                    <button class="perfil-btn-icon danger" data-acao="excluir-cartao" data-id="${cartao.id}" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
            <div class="perfil-cartao-body">
                <p class="perfil-cartao-numero">•••• •••• •••• ${escapeHtml(cartao.last_four)}</p>
                <div class="perfil-cartao-detalhes">
                    <span>${escapeHtml(cartao.holder_name)}</span>
                    <span>${String(cartao.expiry_month).padStart(2, '0')}/${String(cartao.expiry_year).slice(-2)}</span>
                </div>
            </div>
        </div>
    `).join('')

    container.querySelectorAll('[data-acao="excluir-cartao"]').forEach(btn => {
        btn.addEventListener('click', () => excluirCartao(btn.dataset.id))
    })

    container.querySelectorAll('[data-acao="padrao-cartao"]').forEach(btn => {
        btn.addEventListener('click', () => definirCartaoPadrao(btn.dataset.id))
    })
}

function abrirFormCartao() {
    const wrapper = document.getElementById('formCartaoWrapper')
    if (!wrapper) return
    wrapper.style.display = ''
    document.getElementById('formCartao')?.reset()
    document.getElementById('cartaoBandeiraPreview').innerHTML = ''
    wrapper.scrollIntoView({ behavior: 'smooth' })
}

function fecharFormCartao() {
    const wrapper = document.getElementById('formCartaoWrapper')
    if (wrapper) wrapper.style.display = 'none'
    document.getElementById('formCartao')?.reset()
    document.getElementById('cartaoBandeiraPreview').innerHTML = ''
}

async function salvarCartao(e) {
    e.preventDefault()
    const user = getUser()
    if (!user) return

    const btn = document.getElementById('btnSalvarCartao')
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'

    try {
        const numero = document.getElementById('cartaoNumero').value.replace(/\D/g, '')
        const nome = document.getElementById('cartaoNome').value.trim()
        const validade = document.getElementById('cartaoValidade').value.trim()
        const tipo = document.getElementById('cartaoTipo').value
        const padrao = document.getElementById('cartaoPadrao').checked

        if (numero.length < 13 || numero.length > 19) {
            mostrarToast('Número do cartão inválido', 'erro')
            btn.disabled = false
            btn.innerHTML = '<i class="fa-solid fa-lock"></i> Salvar cartão'
            return
        }

        const [mes, ano] = validade.split('/')
        const expiryMonth = parseInt(mes, 10)
        const expiryYear = parseInt('20' + ano, 10)

        if (!expiryMonth || expiryMonth < 1 || expiryMonth > 12 || !expiryYear) {
            mostrarToast('Data de validade inválida', 'erro')
            btn.disabled = false
            btn.innerHTML = '<i class="fa-solid fa-lock"></i> Salvar cartão'
            return
        }

        const agora = new Date()
        if (expiryYear < agora.getFullYear() || (expiryYear === agora.getFullYear() && expiryMonth < agora.getMonth() + 1)) {
            mostrarToast('Cartão vencido', 'erro')
            btn.disabled = false
            btn.innerHTML = '<i class="fa-solid fa-lock"></i> Salvar cartão'
            return
        }

        const bandeira = detectarBandeira(numero)
        const lastFour = numero.slice(-4)

        if (padrao) {
            await supabase
                .from('user_cards')
                .update({ is_default: false })
                .eq('user_id', user.id)
        }

        const { error } = await supabase
            .from('user_cards')
            .insert([{
                user_id: user.id,
                card_brand: bandeira || 'outro',
                last_four: lastFour,
                card_type: tipo,
                holder_name: nome,
                expiry_month: expiryMonth,
                expiry_year: expiryYear,
                is_default: padrao
            }])

        if (error) {
            console.error('Erro ao salvar cartão:', error)
            mostrarToast('Erro ao salvar cartão', 'erro')
        } else {
            mostrarToast('Cartão salvo com sucesso!', 'sucesso')
            fecharFormCartao()
            await carregarCartoes()
        }
    } catch (err) {
        console.error('Exceção ao salvar cartão:', err)
        mostrarToast('Erro inesperado ao salvar cartão', 'erro')
    } finally {
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> Salvar cartão'
    }
}

async function excluirCartao(id) {
    if (!await confirmarAcao('Tem certeza que deseja excluir este cartão?')) return

    const { error } = await supabase
        .from('user_cards')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Erro ao excluir cartão:', error)
        mostrarToast('Erro ao excluir cartão', 'erro')
        return
    }

    mostrarToast('Cartão excluído', 'sucesso')
    await carregarCartoes()
}

async function definirCartaoPadrao(id) {
    const user = getUser()
    if (!user) return

    await supabase
        .from('user_cards')
        .update({ is_default: false })
        .eq('user_id', user.id)

    const { error } = await supabase
        .from('user_cards')
        .update({ is_default: true })
        .eq('id', id)

    if (error) {
        console.error('Erro ao definir padrão:', error)
        mostrarToast('Erro ao definir cartão padrão', 'erro')
        return
    }

    mostrarToast('Cartão padrão atualizado', 'sucesso')
    await carregarCartoes()
}

function initMascarasCartao() {
    const numInput = document.getElementById('cartaoNumero')
    numInput?.addEventListener('input', () => {
        let val = numInput.value.replace(/\D/g, '').slice(0, 16)
        val = val.replace(/(\d{4})(?=\d)/g, '$1 ')
        numInput.value = val

        const bandeira = detectarBandeira(val)
        const preview = document.getElementById('cartaoBandeiraPreview')
        if (preview) {
            preview.innerHTML = bandeira ? `<i class="${getBandeiraIcone(bandeira)}"></i> ${getBandeiraNome(bandeira)}` : ''
        }
    })

    const valInput = document.getElementById('cartaoValidade')
    valInput?.addEventListener('input', () => {
        let val = valInput.value.replace(/\D/g, '').slice(0, 4)
        if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2)
        valInput.value = val
    })

    const nomeInput = document.getElementById('cartaoNome')
    nomeInput?.addEventListener('input', () => {
        nomeInput.value = nomeInput.value.toUpperCase()
    })
}



async function carregarPreferencias() {
    const user = getUser()
    if (!user) return

    const { data } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

    if (data) {
        document.getElementById('prefNotifEmail').checked = data.notifications_email ?? true
        document.getElementById('prefNotifWhatsapp').checked = data.notifications_whatsapp ?? true
        document.getElementById('prefNewsletter').checked = data.newsletter ?? false
    }
}

async function salvarPreferencias(e) {
    e.preventDefault()
    const user = getUser()
    if (!user) return

    const btn = document.getElementById('btnSalvarPreferencias')
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'

    const dados = {
        user_id: user.id,
        notifications_email: document.getElementById('prefNotifEmail').checked,
        notifications_whatsapp: document.getElementById('prefNotifWhatsapp').checked,
        newsletter: document.getElementById('prefNewsletter').checked
    }

    
    const { error } = await supabase
        .from('user_preferences')
        .upsert(dados, { onConflict: 'user_id' })

    if (error) {
        console.error('Erro ao salvar preferências:', error)
        mostrarToast('Erro ao salvar preferências', 'erro')
    } else {
        mostrarToast('Preferências salvas!', 'sucesso')
    }

    btn.disabled = false
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar preferências'
}



async function carregarPedidos() {
    const user = getUser()
    if (!user) return

    const container = document.getElementById('listaPedidos')
    if (!container) return

    const { data, error } = await supabase
        .from('orders')
        .select(`
            *,
            order_items (
                *,
                product_variants (
                    size_label,
                    products (id, name)
                )
            ),
            payments (method, status)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao carregar pedidos:', error)
        return
    }

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="perfil-vazio">
                <i class="fa-solid fa-box-open"></i>
                <h3>Nenhum pedido ainda</h3>
                <p>Quando você fizer uma compra, seus pedidos aparecerão aqui</p>
                <a href="${getPageHref('produtos')}" class="perfil-btn-outline">Ver produtos</a>
            </div>
        `
        return
    }

    const statusLabel = {
        'pending': 'Pendente',
        'paid': 'Pago',
        'confirmed': 'Confirmado',
        'preparing': 'Em preparo',
        'processing': 'Em preparo',
        'shipped': 'Enviado',
        'delivered': 'Entregue',
        'cancelled': 'Cancelado'
    }

    const statusColor = {
        'pending': '#ffaa00',
        'paid': '#2c4dfc',
        'confirmed': '#2c4dfc',
        'preparing': '#2c4dfc',
        'processing': '#2c4dfc',
        'shipped': '#25D366',
        'delivered': '#25D366',
        'cancelled': '#ff4444'
    }

    const metodoLabel = {
        'pix': 'PIX',
        'boleto': 'Boleto',
        'credit_card': 'Cartão de Crédito',
        'debit_card': 'Cartão de Débito',
        'transfer': 'Transferência'
    }

    container.innerHTML = data.map(pedido => {
        const pagamento = pedido.payments?.[0]
        const metodoPag = pagamento ? (metodoLabel[pagamento.method] || pagamento.method) : 'Não informado'
        const podeCancelar = pedido.status === 'pending'
        const pagamentoPendente = pedido.status === 'pending' && (!pagamento || pagamento.status === 'pending')

        
        const pagAprovado = pagamento && pagamento.status === 'approved'
        const aguardandoAprov = (pedido.status === 'preparing' || pedido.status === 'processing') && !pagAprovado
        const exibirStatus = aguardandoAprov ? 'Aguardando Aprovação' : (statusLabel[pedido.status] || pedido.status)
        const exibirCor = aguardandoAprov ? '#ffaa00' : (statusColor[pedido.status] || '#777')

        
        const pagStatusHtml = pagAprovado
            ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;color:#16a34a;font-weight:600"><i class="fa-solid fa-circle-check"></i> Pagamento confirmado</span>'
            : (pagamento && pagamento.status === 'refused')
                ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;color:#dc2626;font-weight:600"><i class="fa-solid fa-circle-xmark"></i> Pagamento recusado</span>'
                : '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;color:#f59e0b;font-weight:600"><i class="fa-solid fa-clock"></i> Aguardando confirmação</span>'

        return `
        <div class="perfil-pedido-card" data-pedido-id="${pedido.id}">
            <div class="perfil-pedido-header" style="cursor:pointer" data-toggle-pedido="${pedido.id}">
                <div>
                    <strong>Pedido #${pedido.order_number || pedido.id.slice(0, 8)}</strong>
                    <span class="perfil-pedido-data">${new Date(pedido.created_at).toLocaleDateString('pt-BR')} às ${new Date(pedido.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                    <span class="perfil-pedido-status" style="background: ${exibirCor}20; color: ${exibirCor}">
                        ${exibirStatus}
                    </span>
                    <i class="fa-solid fa-chevron-down perfil-pedido-seta" data-seta="${pedido.id}"></i>
                </div>
            </div>
            <div class="perfil-pedido-itens">
                ${(pedido.order_items || []).map(item => {
                    const prodName = item.product_variants?.products?.name || 'Produto'
                    const prodId = item.product_variants?.products?.id
                    const sizeLabel = item.product_variants?.size_label ? ' (' + item.product_variants.size_label + ')' : ''
                    const nameHtml = prodId
                        ? `<a href="${getProdutoHref(prodId)}" style="color:var(--primary-blue);text-decoration:none;font-weight:600">${escapeHtml(prodName)}</a>`
                        : escapeHtml(prodName)
                    return `<span>${nameHtml}${sizeLabel} × ${item.quantity}</span>`
                }).join('')}
            </div>
            <div class="perfil-pedido-detalhes" id="detalhes-${pedido.id}" style="display:none">
                <div class="perfil-pedido-detalhe-grid">
                    <div class="perfil-pedido-detalhe-item">
                        <h4><i class="fa-solid fa-box"></i> Itens do Pedido</h4>
                        <table class="perfil-pedido-tabela">
                            <thead><tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
                            <tbody>
                                ${(pedido.order_items || []).map(item => {
                                    const prodName = escapeHtml(item.product_variants?.products?.name || item.product_name || 'Produto')
                                    const prodId = item.product_variants?.products?.id
                                    const sizeLabel = item.product_variants?.size_label ? ' <small>(' + escapeHtml(item.product_variants.size_label) + ')</small>' : ''
                                    const nameHtml = prodId
                                        ? `<a href="${getProdutoHref(prodId)}" style="color:var(--primary-blue);text-decoration:none">${prodName}</a>${sizeLabel}`
                                        : `${prodName}${sizeLabel}`
                                    return `
                                    <tr>
                                        <td>${nameHtml}</td>
                                        <td>${item.quantity}</td>
                                        <td>R$ ${formatarPreco(item.unit_price)}</td>
                                        <td>R$ ${formatarPreco(item.total_price)}</td>
                                    </tr>`
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="perfil-pedido-detalhe-item">
                        <h4><i class="fa-solid fa-credit-card"></i> Pagamento</h4>
                        <p>${metodoPag}</p>
                        <div style="margin-top:0.35rem">${pagStatusHtml}</div>
                    </div>
                    ${pedido.shipping_street ? `
                    <div class="perfil-pedido-detalhe-item">
                        <h4><i class="fa-solid fa-truck"></i> Endereço de Entrega</h4>
                        <p>${escapeHtml(pedido.shipping_street)}, ${escapeHtml(pedido.shipping_number)}${pedido.shipping_complement ? ' - ' + escapeHtml(pedido.shipping_complement) : ''}</p>
                        <p>${escapeHtml(pedido.shipping_neighborhood)} - ${escapeHtml(pedido.shipping_city)}/${escapeHtml(pedido.shipping_state)}</p>
                        <p>CEP: ${escapeHtml(pedido.shipping_zip_code)}</p>
                    </div>` : ''}
                    ${pedido.notes ? `<div class="perfil-pedido-detalhe-item"><h4><i class="fa-solid fa-comment"></i> Observações</h4><p>${escapeHtml(pedido.notes)}</p></div>` : ''}
                </div>
                ${podeCancelar ? `<button class="perfil-btn-cancelar-pedido" data-cancelar-id="${pedido.id}"><i class="fa-solid fa-ban"></i> Cancelar pedido</button>` : ''}
                ${pagamentoPendente ? `<a href="${getPageHref('checkout')}?retomar=${pedido.id}" class="perfil-btn-retomar-pagamento"><i class="fa-solid fa-credit-card"></i> Continuar pagamento</a>` : ''}
            </div>
            <div class="perfil-pedido-footer">
                <span>Total: <strong>R$ ${formatarPreco(pedido.total)}</strong></span>
                <span class="perfil-pedido-ver-mais" data-toggle-pedido="${pedido.id}">Ver detalhes <i class="fa-solid fa-chevron-down"></i></span>
            </div>
        </div>
        `
    }).join('')

    
    container.querySelectorAll('[data-toggle-pedido]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.togglePedido
            const detalhes = document.getElementById(`detalhes-${id}`)
            const seta = container.querySelector(`[data-seta="${id}"]`)
            if (detalhes) {
                const aberto = detalhes.style.display !== 'none'
                detalhes.style.display = aberto ? 'none' : ''
                if (!aberto) animarSlideDown(detalhes)
                if (seta) seta.style.transform = aberto ? '' : 'rotate(180deg)'
            }
        })
    })

    
    container.querySelectorAll('[data-cancelar-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!await confirmarAcao('Tem certeza que deseja cancelar este pedido?')) return
            btn.disabled = true
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cancelando...'

            const orderId = btn.dataset.cancelarId
            console.log('[Cancelar] Tentando cancelar pedido:', orderId, 'user:', user.id)

            const { data, error } = await supabase
                .from('orders')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', orderId)
                .eq('user_id', user.id)
                .select()

            console.log('[Cancelar] Resultado:', { data, error })

            if (error) {
                console.error('Erro ao cancelar:', error)
                mostrarToast('Erro ao cancelar: ' + (error.message || 'verifique o console'), 'erro')
                btn.disabled = false
                btn.innerHTML = '<i class="fa-solid fa-ban"></i> Cancelar pedido'
            } else if (!data || data.length === 0) {
                console.error('Nenhum pedido atualizado - possível falta de permissão RLS')
                mostrarToast('Erro: sem permissão para cancelar. Execute o fix_completo.sql no Supabase.', 'erro')
                btn.disabled = false
                btn.innerHTML = '<i class="fa-solid fa-ban"></i> Cancelar pedido'
            } else {
                mostrarToast('Pedido cancelado com sucesso', 'sucesso')
                await carregarPedidos()
            }
        })
    })
}



async function carregarFavoritos() {
    const user = getUser()
    if (!user) return

    const container = document.getElementById('listaFavoritos')
    if (!container) return

    const { data, error } = await supabase
        .from('wishlists')
        .select(`
            *,
            products (
                id, name,
                product_variants (price),
                product_images (url, is_primary)
            )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao carregar favoritos:', error)
        return
    }

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="perfil-vazio">
                <i class="fa-solid fa-heart"></i>
                <h3>Nenhum favorito ainda</h3>
                <p>Adicione produtos aos seus favoritos para vê-los aqui</p>
                <a href="${getPageHref('produtos')}" class="perfil-btn-outline">Explorar produtos</a>
            </div>
        `
        return
    }

    container.innerHTML = '<div class="perfil-favoritos-grid">' + data.map(fav => {
        const product = fav.products
        if (!product) return ''
        const imgs = product.product_images || []
        const img = imgs.length > 0 ? imgs[0].url : '../img/imagemExemplo.jpg'
        const variantes = product.product_variants || []
        const preco = variantes.length > 0 ? variantes[0].price : 0

        return `
            <a href="${getProdutoHref(product.slug || product.id)}" class="perfil-favorito-card">
                <img src="${img}" alt="${escapeHtml(product.name)}">
                <h4>${escapeHtml(product.name)}</h4>
                <span class="perfil-favorito-preco">R$ ${formatarPreco(preco)}</span>
                <button class="perfil-favorito-remover" data-id="${fav.id}" title="Remover dos favoritos">
                    <i class="fa-solid fa-heart-crack"></i>
                </button>
            </a>
        `
    }).join('') + '</div>'

    
    container.querySelectorAll('.perfil-favorito-remover').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault()
            e.stopPropagation()
            await supabase.from('wishlists').delete().eq('id', btn.dataset.id)
            mostrarToast('Removido dos favoritos', 'sucesso')
            await carregarFavoritos()
        })
    })
}



function formatarCPF(cpf) {
    const digitos = cpf.replace(/\D/g, '')
    if (digitos.length <= 3) return digitos
    if (digitos.length <= 6) return digitos.slice(0, 3) + '.' + digitos.slice(3)
    if (digitos.length <= 9) return digitos.slice(0, 3) + '.' + digitos.slice(3, 6) + '.' + digitos.slice(6)
    return digitos.slice(0, 3) + '.' + digitos.slice(3, 6) + '.' + digitos.slice(6, 9) + '-' + digitos.slice(9, 11)
}

function formatarTelefone(tel) {
    const digitos = tel.replace(/\D/g, '')
    if (digitos.length <= 2) return digitos
    if (digitos.length <= 7) return '(' + digitos.slice(0, 2) + ') ' + digitos.slice(2)
    return '(' + digitos.slice(0, 2) + ') ' + digitos.slice(2, 7) + '-' + digitos.slice(7, 11)
}

function validarCPF(cpf) {
    cpf = cpf.replace(/\D/g, '')
    if (cpf.length !== 11) return false
    if (/^(\d)\1{10}$/.test(cpf)) return false

    let soma = 0
    for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i)) * (10 - i)
    let resto = 11 - (soma % 11)
    if (resto === 10 || resto === 11) resto = 0
    if (resto !== parseInt(cpf.charAt(9))) return false

    soma = 0
    for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i)) * (11 - i)
    resto = 11 - (soma % 11)
    if (resto === 10 || resto === 11) resto = 0
    if (resto !== parseInt(cpf.charAt(10))) return false

    return true
}



async function uploadAvatar(file) {
    const user = getUser()
    if (!user) return

    
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!tiposPermitidos.includes(file.type)) {
        mostrarToast('Formato não suportado. Use JPG, PNG, WebP ou GIF.', 'erro')
        return
    }

    
    if (file.size > 5 * 1024 * 1024) {
        mostrarToast('A imagem deve ter no máximo 5MB.', 'erro')
        return
    }

    const avatarCircle = document.getElementById('perfilAvatarCircle')
    const originalContent = avatarCircle.innerHTML
    avatarCircle.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:#2c4dfc"></i>'

    try {
        const ext = file.name.split('.').pop().toLowerCase()
        const filePath = `${user.id}/avatar.${ext}`

        
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true
            })

        if (uploadError) {
            console.error('Erro ao fazer upload:', uploadError)
            mostrarToast('Erro ao enviar imagem: ' + (uploadError.message || 'tente novamente'), 'erro')
            avatarCircle.innerHTML = originalContent
            return
        }

        
        const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath)

        const avatarUrl = urlData.publicUrl + '?t=' + Date.now()

        
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: avatarUrl })
            .eq('id', user.id)

        if (updateError) {
            console.error('Erro ao salvar avatar:', updateError)
            mostrarToast('Erro ao salvar foto de perfil', 'erro')
            avatarCircle.innerHTML = originalContent
            return
        }

        
        const overlayHTML = `<div class="perfil-avatar-overlay"><i class="fa-solid fa-camera"></i></div>`
        avatarCircle.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` + overlayHTML

        
        document.getElementById('btnRemoverAvatar')?.classList.add('visivel')

        
        document.querySelectorAll('.profile').forEach(el => {
            el.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
        })

        
        const authAvatar = document.getElementById('authAvatarCircle')
        if (authAvatar) {
            authAvatar.innerHTML = `<img src="${avatarUrl}" alt="Avatar">`
        }

        
        await verificarSessao()

        mostrarToast('Foto de perfil atualizada!', 'sucesso')
    } catch (err) {
        console.error('Exceção no upload:', err)
        mostrarToast('Erro inesperado ao enviar imagem', 'erro')
        avatarCircle.innerHTML = originalContent
    }
}



async function removerAvatar() {
    const user = getUser()
    const profile = getProfile()
    if (!user || !profile?.avatar_url) return

    if (!await confirmarAcao('Deseja remover sua foto de perfil?')) return

    const avatarCircle = document.getElementById('perfilAvatarCircle')
    const btnRemover = document.getElementById('btnRemoverAvatar')

    try {
        
        const urlParts = profile.avatar_url.split('/avatars/')
        if (urlParts[1]) {
            const filePath = urlParts[1].split('?')[0] 
            await supabase.storage.from('avatars').remove([filePath])
        }

        
        const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: null })
            .eq('id', user.id)

        if (error) {
            mostrarToast('Erro ao remover foto', 'erro')
            return
        }

        
        const nome = profile?.full_name || user.user_metadata?.full_name || 'U'
        const overlayHTML = `<div class="perfil-avatar-overlay"><i class="fa-solid fa-camera"></i></div>`
        avatarCircle.innerHTML = (nome.charAt(0).toUpperCase() || 'U') + overlayHTML
        btnRemover?.classList.remove('visivel')

        
        document.querySelectorAll('.profile').forEach(el => {
            el.innerHTML = nome.charAt(0).toUpperCase() || 'U'
        })

        await verificarSessao()
        mostrarToast('Foto de perfil removida!', 'sucesso')
    } catch (err) {
        console.error('Erro ao remover avatar:', err)
        mostrarToast('Erro inesperado ao remover foto', 'erro')
    }
}



function initMascaras() {
    const cpfInput = document.getElementById('perfilCPF')
    cpfInput?.addEventListener('input', () => {
        cpfInput.value = formatarCPF(cpfInput.value)
    })

    const telInput = document.getElementById('perfilTelefone')
    telInput?.addEventListener('input', () => {
        telInput.value = formatarTelefone(telInput.value)
    })

    const cepInput = document.getElementById('enderecoCEP')
    if (cepInput) {
        cepInput.addEventListener('input', () => {
            let val = cepInput.value.replace(/\D/g, '')
            if (val.length > 5) val = val.slice(0, 5) + '-' + val.slice(5, 8)
            cepInput.value = val
            cepInput.classList.remove('input-erro', 'input-sucesso')
            _cepValidado = false

            
            if (val.length === 8) {
                buscarCEP(true)
            }
        })
    }
}



function initTabs() {
    const btns = document.querySelectorAll('.perfil-tab-btn')
    const tabs = {
        dados: document.getElementById('tabDados'),
        enderecos: document.getElementById('tabEnderecos'),
        pedidos: document.getElementById('tabPedidos'),
        favoritos: document.getElementById('tabFavoritos'),
        cartoes: document.getElementById('tabCartoes'),
        preferencias: document.getElementById('tabPreferencias')
    }

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('ativo'))
            btn.classList.add('ativo')

            Object.values(tabs).forEach(tab => { if (tab) tab.style.display = 'none' })
            const tab = tabs[btn.dataset.tab]
            if (tab) tab.style.display = ''

            
            if (btn.dataset.tab === 'enderecos') carregarEnderecos()
            if (btn.dataset.tab === 'pedidos') carregarPedidos()
            if (btn.dataset.tab === 'favoritos') carregarFavoritos()
            if (btn.dataset.tab === 'cartoes') carregarCartoes()
            if (btn.dataset.tab === 'preferencias') carregarPreferencias()
        })
    })

    
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    if (tab) {
        const btn = document.querySelector(`.perfil-tab-btn[data-tab="${tab}"]`)
        if (btn) btn.click()
    }
}



document.addEventListener('DOMContentLoaded', async () => {
    
    await new Promise(resolve => setTimeout(resolve, 300))

    const logado = await verificarLogin()
    if (!logado) return

    preencherDadosPerfil()
    initTabs()
    initMascaras()

    
    document.getElementById('formDadosPessoais')?.addEventListener('submit', salvarDadosPessoais)
    document.getElementById('formEndereco')?.addEventListener('submit', salvarEndereco)
    document.getElementById('formPreferencias')?.addEventListener('submit', salvarPreferencias)

    
    document.getElementById('btnNovoEndereco')?.addEventListener('click', () => abrirFormEndereco())
    document.getElementById('btnCancelarEndereco')?.addEventListener('click', fecharFormEndereco)
    document.getElementById('btnBuscarCEP')?.addEventListener('click', buscarCEP)

    
    document.getElementById('btnNovoCartao')?.addEventListener('click', abrirFormCartao)
    document.getElementById('btnCancelarCartao')?.addEventListener('click', fecharFormCartao)
    document.getElementById('formCartao')?.addEventListener('submit', salvarCartao)
    initMascarasCartao()

    
    document.getElementById('btnAlterarSenha')?.addEventListener('click', async () => {
        const user = getUser()
        if (!user?.email) return
        const res = await recuperarSenha(user.email)
        if (res.sucesso) {
            mostrarToast('Link enviado para seu e-mail!', 'sucesso')
        } else {
            mostrarToast(res.erro, 'erro')
        }
    })

    
    const avatarCircle = document.getElementById('perfilAvatarCircle')
    const inputAvatar = document.getElementById('inputAvatarFile')

    avatarCircle?.addEventListener('click', () => {
        inputAvatar?.click()
    })

    inputAvatar?.addEventListener('change', async (e) => {
        const file = e.target.files[0]
        if (!file) return
        await uploadAvatar(file)
        inputAvatar.value = ''
    })

    
    document.getElementById('btnRemoverAvatar')?.addEventListener('click', removerAvatar)

    
    document.getElementById('btnSairConta')?.addEventListener('click', async () => {
        const confirmou = await confirmarAcao('Tem certeza que deseja sair da sua conta?')
        if (!confirmou) return
        await logout()
        window.location.href = '../index.html'
    })
})
