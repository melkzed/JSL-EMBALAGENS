

import { supabase } from './supabaseClient.js'
import { formatarPreco } from './utils.js'

export const CONFIG_PAGAMENTO = {
    
    pix: {
        chave: '44900167000184',            
        nome: 'JSL SOLUCOES EMBALAGENS',    
        cidade: 'ITAPORANGA',               
        banco: 'Banco do Brasil',
        agencia: '21768',
        conta: '411019',
        titular: 'JEFFERSON SOARES LUSTOSA',
    },

    pagSeguro: {
        
    },

    descontoPix: 5,

    pixExpiracaoMinutos: 30,

    maxParcelas: 12,
    parcelasSemJuros: 3,
    taxaJurosMensal: 0.0199,
    valorMinimoParcela: 5,
}

function pixTLV(id, value) {
    const len = value.length.toString().padStart(2, '0')
    return id + len + value
}

function pixCRC16(str) {
    let crc = 0xFFFF
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021
            } else {
                crc = crc << 1
            }
            crc &= 0xFFFF
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function gerarPixBRCode(valor, txid) {
    const { chave, nome, cidade } = CONFIG_PAGAMENTO.pix

    const valorFloat = parseFloat(valor)
    if (isNaN(valorFloat) || valorFloat <= 0 || valorFloat > 999999.99) {
        console.error('[PIX] Valor invalido:', valor)
        return null
    }

    const txidSanitizado = (txid || '***').replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || '***'

    let payload = ''

    payload += pixTLV('00', '01')

    payload += pixTLV('01', '12')

    const gui = pixTLV('00', 'br.gov.bcb.pix')
    const chavePix = pixTLV('01', chave)
    payload += pixTLV('26', gui + chavePix)

    payload += pixTLV('52', '0000')

    payload += pixTLV('53', '986')

    payload += pixTLV('54', valorFloat.toFixed(2))

    payload += pixTLV('58', 'BR')

    payload += pixTLV('59', nome.substring(0, 25))

    payload += pixTLV('60', cidade.substring(0, 15))

    const refLabel = pixTLV('05', txidSanitizado)
    payload += pixTLV('62', refLabel)

    payload += '6304'

    payload += pixCRC16(payload)

    return payload
}

export async function renderizarPixQRCode(container, valor, txid, pedidoId = null) {
    const desconto = CONFIG_PAGAMENTO.descontoPix
    const valorOriginal = parseFloat(valor)
    const valorComDesconto = desconto > 0 ? valorOriginal * (1 - desconto / 100) : valorOriginal
    const economizado = valorOriginal - valorComDesconto

    const brcode = gerarPixBRCode(valorComDesconto, txid)

    if (!brcode) {
        container.innerHTML = `
            <div class="pix-payment-box">
                <div class="pix-header">
                    <i class="fa-brands fa-pix"></i>
                    <h3>Erro ao gerar PIX</h3>
                </div>
                <p style="color:var(--error-red);text-align:center;">Nao foi possivel gerar o codigo PIX. Entre em contato pelo WhatsApp.</p>
            </div>
        `
        return null
    }

    container.innerHTML = `
        <div class="pix-payment-box">
            <div class="pix-header">
                <i class="fa-brands fa-pix"></i>
                <h3>Pagamento via PIX</h3>
            </div>

            ${desconto > 0 ? `
            <div class="pix-desconto-banner">
                <i class="fa-solid fa-tag"></i>
                <span><strong>${desconto}% de desconto</strong> no PIX! Voce economiza <strong>R$ ${formatarPreco(economizado)}</strong></span>
            </div>
            ` : ''}

            <div class="pix-valor">
                ${desconto > 0 ? `<span class="pix-valor-original">De R$ ${formatarPreco(valorOriginal)}</span>` : ''}
                <span>Valor a pagar:</span>
                <strong>R$ ${formatarPreco(valorComDesconto)}</strong>
            </div>

            <div class="pix-qr-wrapper">
                <div id="pixQRCode" class="pix-qr"></div>
                <p class="pix-instrucao">Escaneie o QR Code com o app do seu banco</p>
            </div>

            <div class="pix-copiaecola">
                <label>Ou copie o codigo PIX:</label>
                <div class="pix-code-wrapper">
                    <input type="text" value="${brcode}" readonly id="pixCopiaCola" class="pix-code-input">
                    <button type="button" class="pix-btn-copiar" id="btnCopiarPix">
                        <i class="fa-solid fa-copy"></i> Copiar
                    </button>
                </div>
            </div>

            <div class="pix-dados-recebedor">
                <h4><i class="fa-solid fa-building-columns"></i> Dados do Recebedor</h4>
                <p><strong>Empresa:</strong> JSL Solucoes em Embalagens</p>
                <p><strong>CNPJ:</strong> 44.900.167/0001-84</p>
                <p><strong>Banco:</strong> ${CONFIG_PAGAMENTO.pix.banco}</p>
                <p><strong>Titular:</strong> ${CONFIG_PAGAMENTO.pix.titular}</p>
            </div>

            <div class="pix-status" id="pixStatus">
                <div class="pix-status-waiting">
                    <div class="pix-spinner"></div>
                    <p>Aguardando pagamento...</p>
                    <span class="pix-timer" id="pixTimer">${CONFIG_PAGAMENTO.pixExpiracaoMinutos}:00</span>
                </div>
            </div>

            <p class="pix-aviso">
                <i class="fa-solid fa-info-circle"></i>
                Apos o pagamento, o pedido sera confirmado manualmente. Caso precise de ajuda, entre em contato pelo WhatsApp.
            </p>
        </div>
    `

    try {
        if (typeof QRCode !== 'undefined') {
            new QRCode(document.getElementById('pixQRCode'), {
                text: brcode,
                width: 230,
                height: 230,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            })
        }
    } catch (e) {
        console.warn('Erro ao gerar QR Code:', e)
        const qrEl = document.getElementById('pixQRCode')
        if (qrEl) qrEl.innerHTML = '<p style="color:#999;font-size:0.8rem;">Nao foi possivel gerar o QR Code. Use o codigo abaixo.</p>'
    }

    document.getElementById('btnCopiarPix')?.addEventListener('click', () => {
        const input = document.getElementById('pixCopiaCola')
        if (!input) return
        const copiarTexto = input.value

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(copiarTexto).then(() => {
                mostrarCopiado()
            }).catch(() => {
                fallbackCopiar(input)
            })
        } else {
            fallbackCopiar(input)
        }
    })

    function mostrarCopiado() {
        const btn = document.getElementById('btnCopiarPix')
        if (!btn) return
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!'
        btn.classList.add('copiado')
        setTimeout(() => {
            btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar'
            btn.classList.remove('copiado')
        }, 3000)
    }

    function fallbackCopiar(input) {
        input.select()
        input.setSelectionRange(0, input.value.length)
        try {
            document.execCommand('copy')
            mostrarCopiado()
        } catch (e) {
            console.warn('Falha ao copiar:', e)
        }
    }

    iniciarTimerPix()

    if (pedidoId) {
        iniciarPollingPixStatus(pedidoId)
    }

    return brcode
}

function iniciarTimerPix() {
    if (window._pixTimerInterval) clearInterval(window._pixTimerInterval)

    let tempoRestante = CONFIG_PAGAMENTO.pixExpiracaoMinutos * 60
    const timerEl = document.getElementById('pixTimer')
    if (!timerEl) return

    window._pixTimerInterval = setInterval(() => {
        tempoRestante--
        if (tempoRestante <= 0) {
            clearInterval(window._pixTimerInterval)
            if (window._pixPollingInterval) clearInterval(window._pixPollingInterval)
            timerEl.textContent = 'Expirado'
            const statusEl = document.getElementById('pixStatus')
            if (statusEl) {
                statusEl.innerHTML = `
                    <div class="pix-status-expired">
                        <i class="fa-solid fa-clock" style="font-size:2rem;color:var(--error-red,#e74c3c);"></i>
                        <p style="color:var(--error-red,#e74c3c);font-weight:600;">PIX expirado</p>
                        <p style="font-size:0.85rem;color:#999;">Faca um novo pedido para gerar outro codigo.</p>
                    </div>
                `
            }
            return
        }
        const min = Math.floor(tempoRestante / 60).toString().padStart(2, '0')
        const sec = (tempoRestante % 60).toString().padStart(2, '0')
        timerEl.textContent = `${min}:${sec}`
    }, 1000)
}

function iniciarPollingPixStatus(pedidoId) {
    if (window._pixPollingInterval) clearInterval(window._pixPollingInterval)

    let tentativas = 0
    const maxTentativas = CONFIG_PAGAMENTO.pixExpiracaoMinutos * 12

    window._pixPollingInterval = setInterval(async () => {
        tentativas++
        if (tentativas > maxTentativas) {
            clearInterval(window._pixPollingInterval)
            return
        }

        try {
            const { data: pagamento } = await supabase
                .from('payments')
                .select('status')
                .eq('order_id', pedidoId)
                .maybeSingle()

            if (pagamento?.status === 'approved') {
                clearInterval(window._pixPollingInterval)
                clearInterval(window._pixTimerInterval)

                const statusEl = document.getElementById('pixStatus')
                if (statusEl) {
                    statusEl.innerHTML = `
                        <div class="pix-status-confirmed">
                            <i class="fa-solid fa-circle-check" style="font-size:2.5rem;color:var(--success-green,#25D366);"></i>
                            <h3 style="color:var(--success-green,#25D366);margin:0.5rem 0;">Pagamento confirmado!</h3>
                            <p>Seu PIX foi recebido com sucesso.</p>
                            <div style="margin-top:1rem;">
                                <a href="./perfil.html?tab=pedidos" class="checkout-btn-primary" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.75rem 1.5rem;background:var(--primary-blue);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">
                                    <i class="fa-solid fa-box"></i> Ver meus pedidos
                                </a>
                            </div>
                        </div>
                    `
                }
            }
        } catch (err) {
            
        }
    }, 5000)
}

export function renderizarFormCartao(container, tipo = 'credit_card') {
    const ehCredito = tipo === 'credit_card'

    container.innerHTML = `
        <div class="card-payment-box">
            <div class="card-header">
                <i class="fa-solid fa-${ehCredito ? 'credit-card' : 'money-check-dollar'}"></i>
                <h3>Cartao de ${ehCredito ? 'Credito' : 'Debito'}</h3>
                <span class="card-gateway-badge" style="font-size:0.7rem;background:#25D366;color:#fff;padding:2px 8px;border-radius:20px;margin-left:auto;"><i class="fa-solid fa-shield-halved"></i> PagSeguro</span>
            </div>

            <div class="card-visual" id="cardVisual">
                <div class="card-visual-front">
                    <div class="card-visual-top">
                        <div class="card-chip"></div>
                        <div class="card-brand-icon" id="cardBrandIcon">
                            <i class="fa-solid fa-credit-card"></i>
                        </div>
                    </div>
                    <div class="card-visual-number" id="cardVisualNumber">&bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull;</div>
                    <div class="card-visual-bottom">
                        <div>
                            <span class="card-visual-label">TITULAR</span>
                            <div class="card-visual-name" id="cardVisualName">NOME DO TITULAR</div>
                        </div>
                        <div>
                            <span class="card-visual-label">VALIDADE</span>
                            <div class="card-visual-expiry" id="cardVisualExpiry">MM/AA</div>
                        </div>
                    </div>
                </div>
            </div>

            <form id="cardForm" class="card-form" autocomplete="off" novalidate>
                <div class="card-form-group full">
                    <label><i class="fa-solid fa-credit-card"></i> Numero do Cartao</label>
                    <div class="card-input-wrapper">
                        <input type="text" id="cardNumber" placeholder="0000 0000 0000 0000"
                               maxlength="19" inputmode="numeric" required autocomplete="cc-number">
                        <span class="card-brand-badge" id="cardBrand"></span>
                    </div>
                </div>

                <div class="card-form-row">
                    <div class="card-form-group">
                        <label><i class="fa-regular fa-calendar"></i> Validade</label>
                        <input type="text" id="cardExpiry" placeholder="MM/AA"
                               maxlength="5" inputmode="numeric" required autocomplete="cc-exp">
                    </div>
                    <div class="card-form-group">
                        <label><i class="fa-solid fa-lock"></i> CVV</label>
                        <input type="text" id="cardCVV" placeholder="&bull;&bull;&bull;"
                               maxlength="4" inputmode="numeric" required autocomplete="cc-csc">
                    </div>
                </div>

                <div class="card-form-group full">
                    <label><i class="fa-solid fa-user"></i> Nome do Titular</label>
                    <input type="text" id="cardName" placeholder="Como impresso no cartao"
                           required autocomplete="cc-name" style="text-transform:uppercase;">
                </div>

                <div class="card-form-group full">
                    <label><i class="fa-solid fa-id-card"></i> CPF do Titular</label>
                    <input type="text" id="cardCPF" placeholder="000.000.000-00"
                           maxlength="14" inputmode="numeric" required>
                </div>

                ${ehCredito ? `
                <div class="card-form-group full">
                    <label><i class="fa-solid fa-money-bill-wave"></i> Parcelas</label>
                    <select id="cardInstallments" class="card-select">
                        <option value="1">1x sem juros</option>
                    </select>
                </div>
                ` : ''}

                <div class="card-form-errors" id="cardFormErrors" style="display:none;"></div>
            </form>

            <div class="card-seguranca">
                <i class="fa-solid fa-shield-halved"></i>
                <span>Pagamento seguro processado via PagSeguro. Seus dados sao criptografados.</span>
            </div>
        </div>
    `

    initCardMasks()
    initCardVisualUpdater()
}

function initCardMasks() {
    const numInput = document.getElementById('cardNumber')
    numInput?.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '')
        val = val.replace(/(\d{4})(?=\d)/g, '$1 ')
        e.target.value = val.substring(0, 19)
        detectarBandeira(val.replace(/\s/g, ''))
    })

    const expInput = document.getElementById('cardExpiry')
    expInput?.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '')
        if (val.length >= 2) {
            let mes = parseInt(val.substring(0, 2))
            if (mes > 12) val = '12' + val.substring(2)
            if (mes === 0 && val.length >= 2) val = '01' + val.substring(2)
            val = val.substring(0, 2) + '/' + val.substring(2, 4)
        }
        e.target.value = val
    })

    document.getElementById('cardCVV')?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').substring(0, 4)
    })

    document.getElementById('cardName')?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z\u00C0-\u024F\s]/g, '').toUpperCase()
    })

    const cpfInput = document.getElementById('cardCPF')
    cpfInput?.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '').substring(0, 11)
        if (val.length > 9) {
            val = val.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
        } else if (val.length > 6) {
            val = val.replace(/^(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
        } else if (val.length > 3) {
            val = val.replace(/^(\d{3})(\d{1,3})/, '$1.$2')
        }
        e.target.value = val
    })
}

function initCardVisualUpdater() {
    const campos = ['cardNumber', 'cardName', 'cardExpiry']
    campos.forEach(id => {
        document.getElementById(id)?.addEventListener('input', atualizarCartaoVisual)
    })
}

function atualizarCartaoVisual() {
    const num = document.getElementById('cardNumber')?.value || ''
    const name = document.getElementById('cardName')?.value || ''
    const exp = document.getElementById('cardExpiry')?.value || ''

    const numDisplay = document.getElementById('cardVisualNumber')
    const nameDisplay = document.getElementById('cardVisualName')
    const expDisplay = document.getElementById('cardVisualExpiry')

    if (numDisplay) numDisplay.textContent = num || '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022'
    if (nameDisplay) nameDisplay.textContent = (name || 'NOME DO TITULAR').toUpperCase()
    if (expDisplay) expDisplay.textContent = exp || 'MM/AA'
}

function detectarBandeira(number) {
    const bandeiras = {
        visa: /^4/,
        mastercard: /^(5[1-5]|2[2-7])/,
        amex: /^3[47]/,
        elo: /^(636368|636297|504175|438935|451416|636369|4576|5067|4011|509)/,
        hipercard: /^(606282|3841|637)/,
    }

    const badgeEl = document.getElementById('cardBrand')
    const iconEl = document.getElementById('cardBrandIcon')
    let detected = ''

    for (const [brand, regex] of Object.entries(bandeiras)) {
        if (regex.test(number)) {
            detected = brand
            break
        }
    }

    if (badgeEl) {
        const labels = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', elo: 'Elo', hipercard: 'Hipercard' }
        badgeEl.textContent = labels[detected] || ''
        badgeEl.className = `card-brand-badge ${detected}`
    }

    if (iconEl) {
        const icons = {
            visa: 'fa-brands fa-cc-visa',
            mastercard: 'fa-brands fa-cc-mastercard',
            amex: 'fa-brands fa-cc-amex',
            '': 'fa-solid fa-credit-card'
        }
        iconEl.innerHTML = `<i class="${icons[detected] || icons['']}"></i>`
    }

    return detected
}

const BIN_RANGES = [
    { brand: 'visa', prefixes: [/^4/], lengths: [13, 16, 19] },
    { brand: 'mastercard', prefixes: [/^5[1-5]/, /^2[2-7]/], lengths: [16] },
    { brand: 'amex', prefixes: [/^3[47]/], lengths: [15] },
    { brand: 'elo', prefixes: [/^636368/, /^636297/, /^504175/, /^438935/, /^451416/, /^636369/, /^4576/, /^5067/, /^4011/, /^509/], lengths: [16] },
    { brand: 'hipercard', prefixes: [/^606282/, /^3841/, /^637/], lengths: [16] },
]

function validarBIN(num) {
    for (const range of BIN_RANGES) {
        for (const prefix of range.prefixes) {
            if (prefix.test(num)) {
                if (range.lengths.includes(num.length)) {
                    return { valid: true, brand: range.brand }
                }
                return { valid: false, brand: range.brand, reason: 'length' }
            }
        }
    }
    return { valid: false, brand: null, reason: 'unknown' }
}

const CARD_FIELD_MAP = {
    cardNumber: 'cardNumber',
    cardExpiry: 'cardExpiry',
    cardCVV: 'cardCVV',
    cardName: 'cardName',
    cardCPF: 'cardCPF',
}

function marcarErroInput(fieldId) {
    const input = document.getElementById(fieldId)
    if (input) {
        input.classList.add('card-input-error')
        const handler = () => {
            input.classList.remove('card-input-error')
            input.removeEventListener('input', handler)
        }
        input.addEventListener('input', handler)
    }
}

function limparErrosCartao() {
    Object.values(CARD_FIELD_MAP).forEach(id => {
        document.getElementById(id)?.classList.remove('card-input-error')
    })
    const errorsEl = document.getElementById('cardFormErrors')
    if (errorsEl) errorsEl.style.display = 'none'
    const supportEl = document.getElementById('cardSupportBtn')
    if (supportEl) supportEl.remove()
}

export function validarCartao() {
    limparErrosCartao()
    const erros = []

    const num = document.getElementById('cardNumber')?.value.replace(/\s/g, '') || ''
    const exp = document.getElementById('cardExpiry')?.value || ''
    const cvv = document.getElementById('cardCVV')?.value || ''
    const name = document.getElementById('cardName')?.value.trim() || ''
    const cpf = document.getElementById('cardCPF')?.value.replace(/\D/g, '') || ''

    if (num.length < 13 || num.length > 19) {
        erros.push({ campo: 'cardNumber', msg: 'Numero do cartao deve ter entre 13 e 19 digitos' })
    } else if (!luhnCheck(num)) {
        erros.push({ campo: 'cardNumber', msg: 'Numero do cartao invalido. Verifique os digitos' })
    } else {
        const bin = validarBIN(num)
        if (!bin.valid) {
            if (bin.reason === 'unknown') {
                erros.push({ campo: 'cardNumber', msg: 'Bandeira do cartao nao reconhecida. Aceitamos Visa, Mastercard, Elo, Amex e Hipercard' })
            } else if (bin.reason === 'length') {
                erros.push({ campo: 'cardNumber', msg: `Numero incompleto para cartao ${bin.brand}. Verifique os digitos` })
            }
        }
    }

    const partes = exp.split('/')
    if (partes.length !== 2 || partes[0].length !== 2 || partes[1].length !== 2) {
        erros.push({ campo: 'cardExpiry', msg: 'Data de validade invalida. Use o formato MM/AA' })
    } else {
        const mes = parseInt(partes[0])
        const ano = parseInt('20' + partes[1])
        if (mes < 1 || mes > 12) {
            erros.push({ campo: 'cardExpiry', msg: 'Mes de validade invalido' })
        } else {
            const agora = new Date()
            const expDate = new Date(ano, mes)
            if (expDate <= agora) erros.push({ campo: 'cardExpiry', msg: 'Cartao vencido. Verifique a data de validade' })
        }
    }

    if (cvv.length < 3) erros.push({ campo: 'cardCVV', msg: 'CVV deve ter pelo menos 3 digitos' })
    if (name.length < 3) erros.push({ campo: 'cardName', msg: 'Informe o nome completo como impresso no cartao' })
    if (cpf.length !== 11 || !validarCPF(cpf)) erros.push({ campo: 'cardCPF', msg: 'CPF do titular invalido' })

    const errorsEl = document.getElementById('cardFormErrors')
    if (errorsEl) {
        if (erros.length > 0) {
            erros.forEach(e => marcarErroInput(e.campo))
            errorsEl.style.display = ''
            errorsEl.innerHTML = erros.map(e =>
                `<p data-field="${e.campo}"><i class="fa-solid fa-exclamation-circle"></i> ${e.msg}</p>`
            ).join('')

            const existingBtn = document.getElementById('cardSupportBtn')
            if (!existingBtn) {
                const supportBtn = document.createElement('a')
                supportBtn.id = 'cardSupportBtn'
                supportBtn.className = 'card-support-btn'
                supportBtn.href = 'https://wa.me/5583996389725?text=Ol%C3%A1!%20Estou%20com%20dificuldade%20no%20pagamento%20com%20cart%C3%A3o%20no%20site.'
                supportBtn.target = '_blank'
                supportBtn.rel = 'noopener noreferrer'
                supportBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> Precisa de ajuda? Fale com o suporte'
                errorsEl.insertAdjacentElement('afterend', supportBtn)
            }

            const firstErrorInput = document.getElementById(erros[0].campo)
            if (firstErrorInput) {
                firstErrorInput.focus()
                firstErrorInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
        } else {
            errorsEl.style.display = 'none'
        }
    }

    return erros.map(e => e.msg)
}

function luhnCheck(num) {
    let sum = 0
    let alternate = false
    for (let i = num.length - 1; i >= 0; i--) {
        let n = parseInt(num.charAt(i))
        if (alternate) {
            n *= 2
            if (n > 9) n -= 9
        }
        sum += n
        alternate = !alternate
    }
    return sum % 10 === 0
}

function validarCPF(cpf) {
    if (/^(\d)\1{10}$/.test(cpf)) return false

    let soma = 0
    for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i)) * (10 - i)
    let resto = 11 - (soma % 11)
    if (resto >= 10) resto = 0
    if (resto !== parseInt(cpf.charAt(9))) return false

    soma = 0
    for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i)) * (11 - i)
    resto = 11 - (soma % 11)
    if (resto >= 10) resto = 0
    return resto === parseInt(cpf.charAt(10))
}

function mostrarErrosGateway(mensagens) {
    const errorsEl = document.getElementById('cardFormErrors')
    if (!errorsEl) return

    errorsEl.style.display = ''
    errorsEl.innerHTML = mensagens.map(m =>
        `<p><i class="fa-solid fa-exclamation-circle"></i> ${m}</p>`
    ).join('')

    const existingBtn = document.getElementById('cardSupportBtn')
    if (!existingBtn) {
        const supportBtn = document.createElement('a')
        supportBtn.id = 'cardSupportBtn'
        supportBtn.className = 'card-support-btn'
        supportBtn.href = 'https://wa.me/5583996389725?text=Ol%C3%A1!%20Estou%20com%20dificuldade%20no%20pagamento%20com%20cart%C3%A3o%20no%20site.'
        supportBtn.target = '_blank'
        supportBtn.rel = 'noopener noreferrer'
        supportBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> Precisa de ajuda? Fale com o suporte'
        errorsEl.insertAdjacentElement('afterend', supportBtn)
    }
}

export function getCardData() {
    return {
        number: document.getElementById('cardNumber')?.value.replace(/\s/g, '') || '',
        expMonth: (document.getElementById('cardExpiry')?.value || '').split('/')[0] || '',
        expYear: '20' + ((document.getElementById('cardExpiry')?.value || '').split('/')[1] || ''),
        cvv: document.getElementById('cardCVV')?.value || '',
        holderName: document.getElementById('cardName')?.value.trim().toUpperCase() || '',
        holderCPF: document.getElementById('cardCPF')?.value.replace(/\D/g, '') || '',
        installments: parseInt(document.getElementById('cardInstallments')?.value || '1'),
    }
}

export async function processarPagamentoCartao(pedidoId, valor, tipo, userEmail) {
    const erros = validarCartao()
    if (erros.length > 0) {
        return { success: false, errors: erros }
    }

    const cardData = getCardData()

    let authenticationId = null
    if (tipo === 'debit_card') {
        const auth3ds = await autenticar3DS(cardData, valor, userEmail)
        if (!auth3ds.success) {
            mostrarErrosGateway(auth3ds.errors || ['Falha na autenticacao 3D Secure. Tente novamente.'])
            return { success: false, errors: auth3ds.errors || ['Falha na autenticacao 3D Secure.'] }
        }
        authenticationId = auth3ds.authenticationId
    }

    const resultado = await processarViaPagSeguro(cardData, pedidoId, valor, tipo, userEmail, authenticationId)

    if (resultado.success) {
        return resultado
    }

    if (resultado.errors?.length > 0) {
        mostrarErrosGateway(resultado.errors)
        return resultado
    }

    return {
        success: true,
        status: 'processing',
        gateway: 'manual',
        message: 'Pagamento registrado! Estamos processando seu pagamento com cartao. Voce recebera a confirmacao em breve.'
    }
}

async function autenticar3DS(cardData, valor, email) {
    try {
        
        const { data: sessionData, error: sessionError } = await supabase.functions.invoke('processar-pagamento-pagseguro', {
            body: { action: 'create-3ds-session' }
        })

        if (sessionError || !sessionData?.session) {
            console.error('[3DS] Erro ao criar sessao:', sessionError)
            return { success: false, errors: ['Nao foi possivel iniciar autenticacao 3D Secure.'] }
        }

        if (typeof PagSeguro === 'undefined') {
            console.error('[3DS] SDK PagSeguro nao carregado')
            return { success: false, errors: ['Erro ao carregar modulo de seguranca. Recarregue a pagina.'] }
        }

        PagSeguro.setUp({
            session: sessionData.session,
            env: 'PROD',
        })

        const valorCentavos = Math.round(parseFloat(valor) * 100)

        const result = await PagSeguro.authenticate3DS({
            data: {
                customer: {
                    name: cardData.holderName || 'CLIENTE',
                    email: email || 'cliente@jslembalagens.com.br',
                },
                paymentMethod: {
                    type: 'DEBIT_CARD',
                    card: {
                        number: cardData.number,
                        expMonth: cardData.expMonth,
                        expYear: cardData.expYear,
                        holder: {
                            name: cardData.holderName || 'CLIENTE',
                        },
                    },
                },
                amount: {
                    value: valorCentavos,
                    currency: 'BRL',
                },
            },
        })

        console.log('[3DS] Resultado autenticacao:', result)

        if (result.status === 'AUTH_FLOW_COMPLETED' || result.status === 'AUTHENTICATED') {
            return { success: true, authenticationId: result.id }
        }

        if (result.status === 'AUTH_NOT_SUPPORTED') {
            
            console.warn('[3DS] Banco nao suporta 3DS, seguindo sem autenticacao')
            return { success: true, authenticationId: null }
        }

        if (result.status === 'CHANGE_PAYMENT_METHOD') {
            return { success: false, errors: ['Seu banco nao autoriza debito online com este cartao. Tente outro cartao ou use credito.'] }
        }

        return { success: false, errors: ['Autenticacao 3D Secure nao foi completada. Tente novamente ou use cartao de credito.'] }

    } catch (err) {
        console.error('[3DS] Erro:', err)
        return { success: false, errors: ['Erro durante autenticacao de seguranca. Tente novamente.'] }
    }
}

async function processarViaPagSeguro(cardData, pedidoId, valor, tipo, userEmail, authenticationId = null) {
    try {
        const { data, error } = await supabase.functions.invoke('processar-pagamento-pagseguro', {
            body: {
                pedidoId,
                valor,
                tipo,
                parcelas: cardData.installments,
                email: userEmail,
                cartao: {
                    numero: cardData.number,
                    titular: cardData.holderName,
                    mesExpiracao: parseInt(cardData.expMonth),
                    anoExpiracao: parseInt(cardData.expYear),
                    cvv: cardData.cvv,
                },
                cpf: cardData.holderCPF,
                authenticationId,
            }
        })

        if (error) {
            console.error('[PagSeguro] Erro na Edge Function:', error)
            return { success: false, errors: ['Erro ao processar pagamento. Tente novamente ou escolha outro metodo.'] }
        }

        return data || { success: false, errors: ['Resposta vazia do servidor.'] }

    } catch (err) {
        console.error('[PagSeguro] Erro de conexao:', err)
        return { success: false, errors: ['Erro de conexao com processador de pagamento.'] }
    }
}

export function calcularParcelas(valor, maxParcelas = CONFIG_PAGAMENTO.maxParcelas) {
    const parcelas = []
    const { parcelasSemJuros, taxaJurosMensal, valorMinimoParcela } = CONFIG_PAGAMENTO

    for (let i = 1; i <= maxParcelas; i++) {
        const valorParcela = valor / i
        if (valorParcela < valorMinimoParcela) break

        if (i <= parcelasSemJuros) {
            parcelas.push({
                qtd: i,
                valor: valorParcela,
                total: valor,
                juros: false,
                label: `${i}x de R$ ${formatarPreco(valorParcela)} sem juros`
            })
        } else {
            const taxa = 1 + (taxaJurosMensal * (i - parcelasSemJuros))
            const totalComJuros = valor * taxa
            const valorComJuros = totalComJuros / i
            parcelas.push({
                qtd: i,
                valor: valorComJuros,
                total: totalComJuros,
                juros: true,
                label: `${i}x de R$ ${formatarPreco(valorComJuros)} (total R$ ${formatarPreco(totalComJuros)})`
            })
        }
    }

    return parcelas
}

export function atualizarSelectParcelas(valor) {
    const select = document.getElementById('cardInstallments')
    if (!select) return

    const parcelas = calcularParcelas(valor)
    select.innerHTML = parcelas.map(p =>
        `<option value="${p.qtd}">${p.label}</option>`
    ).join('')
}

window.addEventListener('beforeunload', () => {
    if (window._pixTimerInterval) clearInterval(window._pixTimerInterval)
    if (window._pixPollingInterval) clearInterval(window._pixPollingInterval)
})
