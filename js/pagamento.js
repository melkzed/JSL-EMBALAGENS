import { supabase } from './supabaseClient.js'
import { formatarPreco } from './utils.js'

const SUPABASE_FUNCTIONS_URL = 'https://otwmjdiqjhumqvyztnbl.supabase.co/functions/v1'
const SUPABASE_PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90d21qZGlxamh1bXF2eXp0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTU3NTUsImV4cCI6MjA5MDA3MTc1NX0.1syGgZJNqoax0z-E5dWcTtm5g47xDUdFa3U7lttxZz4'

export const MP_PUBLIC_KEY = 'APP_USR-d2e431d7-64ef-4f3a-8bc5-e1d15a12ff3c'

async function invokeFunctionPublic(functionName, body) {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${functionName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_PUBLIC_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}`,
        },
        body: JSON.stringify(body || {}),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
        return { data, error: new Error(data?.error || data?.message || `Erro HTTP ${response.status}`) }
    }
    return { data, error: null }
}

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
    descontoPix: 5,
    pixExpiracaoMinutos: 30,
    maxParcelas: 12,
    parcelasSemJuros: 3,
    taxaJurosMensal: 0.0199,
    valorMinimoParcela: 5,
}

export async function criarCheckoutMercadoPago(pedidoId) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData?.session) {
        const { error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError) {
            return { success: false, errors: ['Sua sessao expirou. Faca login novamente para continuar.'] }
        }
    }
    console.log('[MP] Criando preferencia para pedido:', pedidoId)
    const { data, error } = await invokeFunctionPublic('create-preference', { order_id: pedidoId })
    if (error || !data?.init_point) {
        const msgErro = data?.error || error?.message || 'Erro ao criar link de pagamento Mercado Pago.'
        console.error('[MP] Erro:', msgErro, data)
        return { success: false, errors: [msgErro] }
    }
    console.log('[MP] Preferencia criada:', data.preference_id)
    return {
        success: true,
        preferenceId: data.preference_id,
        checkoutUrl: data.init_point,
        sandboxUrl: data.sandbox_init_point,
    }
}

export async function criarCheckoutPagBank(pedidoId) {
    return criarCheckoutMercadoPago(pedidoId)
}

export async function verificarRecaptcha() { return true }
export async function consultarCheckoutPagBank() { return { success: false, errors: ['Nao disponivel com Mercado Pago'] } }
export async function inativarCheckoutPagBank() { return { success: false, errors: ['Nao disponivel com Mercado Pago'] } }

function pixTLV(id, value) {
    const len = value.length.toString().padStart(2, '0')
    return id + len + value
}

function pixCRC16(str) {
    let crc = 0xFFFF
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) { crc = (crc << 1) ^ 0x1021 } else { crc = crc << 1 }
            crc &= 0xFFFF
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function gerarPixBRCode(valor, txid) {
    const { chave, nome, cidade } = CONFIG_PAGAMENTO.pix
    const valorFloat = parseFloat(valor)
    if (isNaN(valorFloat) || valorFloat <= 0 || valorFloat > 999999.99) { console.error('[PIX] Valor invalido:', valor); return null }
    const txidSanitizado = (txid || '***').replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || '***'
    let payload = ''
    payload += pixTLV('00', '01')
    payload += pixTLV('01', '12')
    payload += pixTLV('26', pixTLV('00', 'br.gov.bcb.pix') + pixTLV('01', chave))
    payload += pixTLV('52', '0000')
    payload += pixTLV('53', '986')
    payload += pixTLV('54', valorFloat.toFixed(2))
    payload += pixTLV('58', 'BR')
    payload += pixTLV('59', nome.substring(0, 25))
    payload += pixTLV('60', cidade.substring(0, 15))
    payload += pixTLV('62', pixTLV('05', txidSanitizado))
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
        container.innerHTML = `<div class="pix-payment-box"><div class="pix-header"><i class="fa-brands fa-pix"></i><h3>Erro ao gerar PIX</h3></div><p style="color:var(--error-red);text-align:center;">Nao foi possivel gerar o codigo PIX. Entre em contato pelo WhatsApp.</p></div>`
        return null
    }

    container.innerHTML = `
        <div class="pix-payment-box">
            <div class="pix-header"><i class="fa-brands fa-pix"></i><h3>Pagamento via PIX</h3></div>
            ${desconto > 0 ? `<div class="pix-desconto-banner"><i class="fa-solid fa-tag"></i><span><strong>${desconto}% de desconto</strong> no PIX! Voce economiza <strong>R$ ${formatarPreco(economizado)}</strong></span></div>` : ''}
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
                    <button type="button" class="pix-btn-copiar" id="btnCopiarPix"><i class="fa-solid fa-copy"></i> Copiar</button>
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
            <p class="pix-aviso"><i class="fa-solid fa-info-circle"></i> Apos o pagamento, o pedido sera confirmado automaticamente.</p>
        </div>
    `

    try {
        if (typeof QRCode !== 'undefined') {
            new QRCode(document.getElementById('pixQRCode'), { text: brcode, width: 230, height: 230, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M })
        }
    } catch (e) {
        const qrEl = document.getElementById('pixQRCode')
        if (qrEl) qrEl.innerHTML = '<p style="color:#999;font-size:0.8rem;">Use o codigo abaixo.</p>'
    }

    document.getElementById('btnCopiarPix')?.addEventListener('click', () => {
        const input = document.getElementById('pixCopiaCola')
        if (!input) return
        const copiarTexto = input.value
        const mostrarCopiado = () => {
            const btn = document.getElementById('btnCopiarPix')
            if (!btn) return
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!'
            btn.classList.add('copiado')
            setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar'; btn.classList.remove('copiado') }, 3000)
        }
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(copiarTexto).then(mostrarCopiado).catch(() => { input.select(); document.execCommand('copy'); mostrarCopiado() })
        } else {
            input.select(); document.execCommand('copy'); mostrarCopiado()
        }
    })

    iniciarTimerPix()
    if (pedidoId) iniciarPollingPixStatus(pedidoId)
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
            if (statusEl) statusEl.innerHTML = `<div class="pix-status-expired"><i class="fa-solid fa-clock" style="font-size:2rem;color:var(--error-red,#e74c3c);"></i><p style="color:var(--error-red,#e74c3c);font-weight:600;">PIX expirado</p><p style="font-size:0.85rem;color:#999;">Faca um novo pedido para gerar outro codigo.</p></div>`
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
        if (tentativas > maxTentativas) { clearInterval(window._pixPollingInterval); return }
        try {
            const { data: pagamento } = await supabase.from('payments').select('status').eq('order_id', pedidoId).maybeSingle()
            if (pagamento?.status === 'approved') {
                clearInterval(window._pixPollingInterval)
                clearInterval(window._pixTimerInterval)
                const statusEl = document.getElementById('pixStatus')
                if (statusEl) statusEl.innerHTML = `<div class="pix-status-confirmed"><i class="fa-solid fa-circle-check" style="font-size:2.5rem;color:var(--success-green,#25D366);"></i><h3 style="color:var(--success-green,#25D366);margin:0.5rem 0;">Pagamento confirmado!</h3><p>Seu pagamento foi recebido com sucesso.</p><div style="margin-top:1rem;"><a href="./perfil.html?tab=pedidos" class="checkout-btn-primary" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.75rem 1.5rem;background:var(--primary-blue);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;"><i class="fa-solid fa-box"></i> Ver meus pedidos</a></div></div>`
            }
        } catch (err) { /* silencia */ }
    }, 5000)
}

export function calcularParcelas(valor, maxParcelas = CONFIG_PAGAMENTO.maxParcelas) {
    const parcelas = []
    const { parcelasSemJuros, taxaJurosMensal, valorMinimoParcela } = CONFIG_PAGAMENTO
    for (let i = 1; i <= maxParcelas; i++) {
        let valorParcela, totalComJuros, label, juros = false
        if (i === 1) { valorParcela = valor; totalComJuros = valor; label = `1x de R$ ${formatarPreco(valor)} sem juros` }
        else if (i <= parcelasSemJuros) { valorParcela = valor / i; totalComJuros = valor; label = `${i}x de R$ ${formatarPreco(valorParcela)} sem juros` }
        else {
            const r = taxaJurosMensal; const n = i
            valorParcela = valor * (Math.pow(1 + r, n) * r) / (Math.pow(1 + r, n) - 1)
            totalComJuros = valorParcela * n; juros = true
            label = `${i}x de R$ ${formatarPreco(valorParcela)} (total R$ ${formatarPreco(totalComJuros)})`
        }
        if (valorParcela < valorMinimoParcela && i > 1) break
        parcelas.push({ qtd: i, valor: valorParcela, total: totalComJuros, juros, label })
    }
    if (parcelas.length === 0) parcelas.push({ qtd: 1, valor, total: valor, juros: false, label: `1x de R$ ${formatarPreco(valor)} sem juros` })
    return parcelas
}

export function atualizarSelectParcelas(valor) {
    const select = document.getElementById('cardInstallments')
    if (!select) return
    const parcelas = calcularParcelas(valor)
    select.innerHTML = parcelas.map(p => `<option value="${p.qtd}">${p.label}</option>`).join('')
}

window.addEventListener('beforeunload', () => {
    if (window._pixTimerInterval) clearInterval(window._pixTimerInterval)
    if (window._pixPollingInterval) clearInterval(window._pixPollingInterval)
})