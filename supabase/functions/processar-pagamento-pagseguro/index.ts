// @ts-nocheck — Deno runtime (Supabase Edge Functions)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CORS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALLOWED_ORIGINS = [
    'https://jslembalagens.com.br',
    'https://www.jslembalagens.com.br',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:8099',
    'http://127.0.0.1:8099',
]

function getCorsHeaders(req) {
    const origin = req.headers.get('Origin') || ''
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CONSTANTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PAGBANK_ENV = (Deno.env.get('PAGBANK_ENV') || 'production').toLowerCase()
const SITE_URL = 'https://www.jslembalagens.com.br'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getSupabaseAdmin() {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return null
    return createClient(url, key)
}

const STATUS_MAP = {
    'AUTHORIZED': 'approved',
    'PAID': 'approved',
    'AVAILABLE': 'approved',
    'IN_ANALYSIS': 'processing',
    'WAITING': 'pending',
    'DECLINED': 'refused',
    'CANCELED': 'cancelled',
}

async function persistirPagamento(supabase, pedidoId, gatewayId, status, gatewayResponse) {
    if (!supabase || !pedidoId) return

    const { data: pagamentoAtual } = await supabase
        .from('payments')
        .select('gateway_transaction_id')
        .eq('order_id', pedidoId)
        .maybeSingle()

    const gatewayAtual = pagamentoAtual?.gateway_transaction_id || ''
    const manterCheckoutId = String(gatewayAtual).startsWith('CHEC_') && !String(gatewayId || '').startsWith('CHEC_')
    const updateData = {
        gateway: 'pagbank',
        gateway_transaction_id: manterCheckoutId ? gatewayAtual : gatewayId,
        gateway_response: gatewayResponse,
        status,
        updated_at: new Date().toISOString(),
    }

    if (status === 'approved') {
        updateData.paid_at = new Date().toISOString()
    }

    const { error: payErr } = await supabase
        .from('payments')
        .update(updateData)
        .eq('order_id', pedidoId)

    if (payErr) console.error('[PagBank] Erro ao atualizar payments:', payErr)

    if (status === 'approved') {
        const { data: pedidoAtual } = await supabase
            .from('orders')
            .select('status')
            .eq('id', pedidoId)
            .maybeSingle()

        if (pedidoAtual?.status === 'paid') return

        const { error: orderErr } = await supabase
            .from('orders')
            .update({ status: 'paid', updated_at: new Date().toISOString() })
            .eq('id', pedidoId)
        if (orderErr) console.error('[PagBank] Erro ao atualizar orders:', orderErr)

        const { error: historyErr } = await supabase
            .from('order_status_history')
            .insert({
                order_id: pedidoId,
                status: 'paid',
                notes: `Pagamento aprovado via PagBank (ID: ${gatewayId})`,
            })
        if (historyErr) console.error('[PagBank] Erro ao inserir order_status_history:', historyErr)
    }
}

function traduzirErro(code, descricao) {
    const t = {
        '40001': 'Parâmetro obrigatório não informado.',
        '40002': 'Parâmetro inválido.',
        '40003': 'Parâmetro inválido (header).',
        '11013': 'Número do cartão inválido.',
        '11014': 'CVV inválido.',
        '11015': 'Mês de validade inválido.',
        '11016': 'Ano de validade inválido.',
        '11017': 'Cartão vencido.',
        '20000': 'Pagamento recusado pelo banco emissor.',
        '20001': 'Pagamento recusado — cartão vencido.',
        '20002': 'Pagamento recusado — cartão bloqueado.',
        '20003': 'Pagamento recusado pelo banco.',
        '20004': 'Pagamento recusado — saldo insuficiente.',
        '20005': 'Pagamento recusado — cartão não aceito.',
        '20006': 'Pagamento recusado — suspeita de fraude.',
    }
    return t[code] || descricao || 'Erro ao processar pagamento.'
}

function normalizarTelefone(telefone) {
    const telLimpo = String(telefone || '').replace(/\D/g, '')
    if (telLimpo.length < 10) return null
    return {
        country: '55',
        area: telLimpo.substring(0, 2),
        number: telLimpo.substring(2),
        type: 'MOBILE',
    }
}

function normalizarEmailPagBank(email, pedidoId = '') {
    const candidate = String(email || '').trim().toLowerCase()
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    if (isValid && candidate.length <= 60) return candidate
    const safeId = String(pedidoId || Date.now()).replace(/[^a-zA-Z0-9]/g, '').slice(-24) || 'pedido'
    return `pedido-${safeId}@jslembalagens.com.br`
}

function formatarItensPagBank(itens = [], pedidoId = '') {
    return itens
        .map((item, idx) => {
            const unitAmount = Math.round(parseFloat(item?.preco || item?.price || item?.unit_price || 0) * 100)
            const quantity = Math.max(1, parseInt(item?.quantidade || item?.quantity, 10) || 1)
            if (!Number.isFinite(unitAmount) || unitAmount <= 0) return null
            return {
                reference_id: String(
                    item?.reference_id
                    || item?.sku
                    || item?.product_variant_id
                    || `${pedidoId}-${idx + 1}`
                ).substring(0, 64),
                name: String(
                    item?.nome
                    || item?.name
                    || item?.product_name
                    || 'Produto'
                ).substring(0, 100),
                quantity,
                unit_amount: unitAmount,
            }
        })
        .filter(Boolean)
}

function valorCentavos(valor, fallback = 0) {
    if (valor === null || valor === undefined || valor === '') return fallback
    const num = Number(valor)
    if (!Number.isFinite(num)) return fallback
    return Math.max(0, Math.round(num * 100))
}

function normalizarEnderecoPagBank(endereco = {}) {
    const postalCode = String(endereco.postal_code || endereco.zip_code || endereco.cep || '').replace(/\D/g, '')
    const street = String(endereco.street || endereco.rua || '').trim()
    const number = String(endereco.number || endereco.numero || '').trim()
    const locality = String(endereco.locality || endereco.neighborhood || endereco.bairro || '').trim()
    const city = String(endereco.city || endereco.cidade || '').trim()
    const regionCode = String(endereco.region_code || endereco.state || endereco.estado || '').trim().toUpperCase()

    if (!street || !number || !locality || !city || !regionCode || postalCode.length !== 8) return null

    return {
        street: street.substring(0, 160),
        number: number.substring(0, 20),
        ...(endereco.complement ? { complement: String(endereco.complement).substring(0, 40) } : {}),
        locality: locality.substring(0, 60),
        city: city.substring(0, 90),
        region_code: regionCode.substring(0, 2),
        country: 'BRA',
        postal_code: postalCode,
    }
}

function normalizarShippingPagBank(shipping = null) {
    if (!shipping || typeof shipping !== 'object') return null

    const amount = Number.isFinite(Number(shipping.amount_cents))
        ? Math.max(0, Math.round(Number(shipping.amount_cents)))
        : valorCentavos(shipping.amount ?? shipping.valor ?? shipping.cost ?? shipping.preco, 0)
    const type = amount > 0 ? 'FIXED' : 'FREE'
    const address = normalizarEnderecoPagBank(shipping.address || shipping.endereco || shipping)

    return {
        type,
        ...(type === 'FIXED' ? { amount } : {}),
        ...(address ? { address, address_modifiable: false } : {}),
    }
}

function coletarChargesPagBank(payload = {}) {
    const charges = []
    if (Array.isArray(payload.charges)) charges.push(...payload.charges)
    if (Array.isArray(payload.payments)) charges.push(...payload.payments)
    if (Array.isArray(payload.orders)) {
        for (const order of payload.orders) {
            if (Array.isArray(order?.charges)) charges.push(...order.charges)
        }
    }
    if (String(payload.id || '').startsWith('CHAR_')) charges.push(payload)
    return charges
}

function resolverStatusConsultaCheckout(payload = {}) {
    const charges = coletarChargesPagBank(payload)
    const statuses = charges.map(charge => String(charge?.status || '').toUpperCase()).filter(Boolean)

    if (statuses.some(status => ['PAID', 'AUTHORIZED', 'AVAILABLE'].includes(status))) return 'approved'
    if (statuses.some(status => status === 'IN_ANALYSIS')) return 'processing'
    if (statuses.some(status => status === 'WAITING')) return 'pending'
    if (statuses.some(status => status === 'DECLINED')) return 'refused'
    if (statuses.some(status => status === 'CANCELED')) return 'cancelled'

    const checkoutStatus = String(payload.status || '').toUpperCase()
    if (checkoutStatus === 'EXPIRED' || checkoutStatus === 'INACTIVE') return 'cancelled'
    return 'pending'
}

function resolverGatewayIdConsultaCheckout(payload = {}, checkoutId = '') {
    const charges = coletarChargesPagBank(payload)
    const pago = charges.find(charge => ['PAID', 'AUTHORIZED', 'AVAILABLE'].includes(String(charge?.status || '').toUpperCase()))
    return pago?.id || charges[0]?.id || payload.id || checkoutId
}

function extrairCheckoutIdSalvo(pagamento = {}) {
    const direto = String(pagamento?.gateway_transaction_id || '')
    if (direto.startsWith('CHEC_')) return direto

    const response = pagamento?.gateway_response || {}
    const candidatos = [
        response.id,
        response.checkout_id,
        response.checkoutId,
    ].map(value => String(value || ''))

    return candidatos.find(value => value.startsWith('CHEC_')) || ''
}

function extrairMensagemErroPagBank(data, fallbackMessage) {
    if (Array.isArray(data?.error_messages) && data.error_messages.length) {
        return data.error_messages.map(e => traduzirErro(e.code, e.description)).filter(Boolean)
    }
    if (Array.isArray(data?.errors) && data.errors.length) {
        return data.errors.map(err => String(err))
    }
    if (data?.message && typeof data.message === 'string') {
        return [data.message]
    }
    if (data?.error && typeof data.error === 'string') {
        return [data.error]
    }
    return [fallbackMessage]
}

function getClientSafeErrorStatus(status) {
    return status >= 500 ? status : 200
}

function resolverMetodosPagamentoCheckout(metodoPagamento) {
    const metodo = String(metodoPagamento || '').toLowerCase()
    const map = {
        credit_card: 'CREDIT_CARD',
        debit_card: 'DEBIT_CARD',
        pix: 'PIX',
        boleto: 'BOLETO',
    }
    if (map[metodo]) return [{ type: map[metodo] }]
    return [
        { type: 'CREDIT_CARD' },
        { type: 'DEBIT_CARD' },
        { type: 'PIX' },
        { type: 'BOLETO' },
    ]
}

function resolverAmbientePagBank(requestedEnv) {
    const env = String(requestedEnv || PAGBANK_ENV || 'production').toLowerCase()
    return env === 'sandbox' ? 'sandbox' : 'production'
}

function resolverApiUrlPagBank(env) {
    const explicitUrl = env === 'sandbox'
        ? Deno.env.get('PAGBANK_API_URL_SANDBOX')
        : Deno.env.get('PAGBANK_API_URL')
    if (explicitUrl) return explicitUrl
    return env === 'sandbox'
        ? 'https://sandbox.api.pagseguro.com'
        : 'https://api.pagseguro.com'
}

function resolverSdkUrlPagBank(env) {
    const explicitUrl = env === 'sandbox'
        ? Deno.env.get('PAGBANK_SDK_URL_SANDBOX')
        : Deno.env.get('PAGBANK_SDK_URL')
    if (explicitUrl) return explicitUrl
    return env === 'sandbox'
        ? 'https://sandbox.sdk.pagseguro.com'
        : 'https://sdk.pagseguro.com'
}

function resolverTokenPagBank(env) {
    if (env === 'sandbox') {
        return Deno.env.get('PAGSEGURO_TOKEN_SANDBOX') || Deno.env.get('PAGSEGURO_TOKEN')
    }
    return Deno.env.get('PAGSEGURO_TOKEN')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ACTION: get-public-key
//  Obtém a chave pública do PagBank para criptografar
//  dados do cartão no frontend (necessária para homologação INF-01)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function handleGetPublicKey({ pagbankApiUrl, pagbankToken }) {
    console.log('[PagBank] Obtendo chave pública. URL:', pagbankApiUrl)

    let res, data
    try {
        res = await fetch(`${pagbankApiUrl}/public-keys/card`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${pagbankToken}`,
                'Content-Type': 'application/json',
            },
        })
        data = await res.json().catch(() => ({}))
    } catch (err) {
        console.error('[PagBank] Erro de rede ao obter chave pública:', err)
        return {
            success: false,
            status: 502,
            errors: ['Não foi possível conectar ao PagBank para obter chave pública.'],
        }
    }

    console.log('[PagBank] get-public-key HTTP:', res.status, '| Resposta:', JSON.stringify(data).substring(0, 300))

    if (!res.ok) {
        const erros = extrairMensagemErroPagBank(data, 'Não foi possível obter a chave pública.')
        return { success: false, status: getClientSafeErrorStatus(res.status), errors: erros }
    }

    return {
        success: true,
        status: 200,
        publicKey: data.public_key || data.publicKey || null,
        createdAt: data.created_at || null,
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ACTION: create-3ds-session
//  Cria sessão de autenticação 3DS
//  (necessária para homologação INF-02)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function handleCreate3dsSession({ pagbankSdkUrl, pagbankToken }) {
    console.log('[PagBank] Criando sessao 3DS. URL:', pagbankSdkUrl)

    let res, data
    try {
        res = await fetch(`${pagbankSdkUrl}/checkout-sdk/sessions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pagbankToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        })
        data = await res.json().catch(() => ({}))
    } catch (err) {
        console.error('[PagBank] Erro de rede ao criar sessão 3DS:', err)
        return {
            success: false,
            status: 502,
            errors: ['Não foi possível conectar ao PagBank para criar sessão 3DS.'],
        }
    }

    console.log('[PagBank] create-3ds-session HTTP:', res.status, '| Resposta:', JSON.stringify(data).substring(0, 300))

    if (!res.ok) {
        const erros = extrairMensagemErroPagBank(data, 'Não foi possível criar sessão 3DS.')
        return { success: false, status: getClientSafeErrorStatus(res.status), errors: erros }
    }

    return {
        success: true,
        status: 200,
        session: data.session || data.session_id || data.id || null,
        sessionId: data.session_id || data.session || data.id || null,
        expiresAt: data.expires_at || null,
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CRIAR CHECKOUT HOSPEDADO PAGBANK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function sha256Hex(value) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(hash))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
}

function compararSeguro(a = '', b = '') {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    return diff === 0
}

function getTokensWebhookPagBank() {
    return [...new Set([
        Deno.env.get('PAGSEGURO_TOKEN'),
        Deno.env.get('PAGSEGURO_TOKEN_SANDBOX'),
    ].filter(Boolean))]
}

async function validarAssinaturaWebhookPagBank(req, rawBody) {
    const assinaturaRecebida = String(req.headers.get('x-authenticity-token') || '').trim().toLowerCase()
    if (!assinaturaRecebida) return false

    const tokens = getTokensWebhookPagBank()
    if (tokens.length === 0) return false

    for (const token of tokens) {
        const assinaturaCalculada = await sha256Hex(`${token}-${rawBody}`)
        if (compararSeguro(assinaturaCalculada, assinaturaRecebida)) return true
    }

    return false
}

async function handleConsultarCheckout({ pagbankApiUrl, pagbankToken, supabase, pedidoId, checkoutId }) {
    let checkoutIdFinal = String(checkoutId || '')
    let pagamentoLocal = null

    if (!checkoutIdFinal && supabase && pedidoId) {
        const { data } = await supabase
            .from('payments')
            .select('status, gateway_transaction_id, gateway_response')
            .eq('order_id', pedidoId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        pagamentoLocal = data || null
        checkoutIdFinal = extrairCheckoutIdSalvo(pagamentoLocal)
    }

    if (!checkoutIdFinal) {
        if (pagamentoLocal?.status && pagamentoLocal.status !== 'pending') {
            return {
                success: true,
                status: 200,
                paymentStatus: pagamentoLocal.status,
                source: 'local',
            }
        }

        return {
            success: false,
            status: 404,
            errorCode: 'PAGBANK_CHECKOUT_NOT_FOUND',
            errors: ['Checkout PagBank nao encontrado para este pedido.'],
        }
    }

    let res, data
    try {
        res = await fetch(`${pagbankApiUrl}/checkouts/${encodeURIComponent(checkoutIdFinal)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${pagbankToken}`,
                'Content-Type': 'application/json',
            },
        })
        data = await res.json().catch(() => ({}))
    } catch (err) {
        console.error('[PagBank] Erro ao consultar checkout:', err)
        return {
            success: false,
            status: 502,
            errorCode: 'PAGBANK_NETWORK_ERROR',
            errors: ['Nao foi possivel consultar o checkout no PagBank.'],
        }
    }

    if (!res.ok) {
        return {
            success: false,
            status: getClientSafeErrorStatus(res.status || 400),
            errorCode: 'PAGBANK_CHECKOUT_QUERY_ERROR',
            errors: extrairMensagemErroPagBank(data, 'Nao foi possivel consultar o checkout.'),
            gatewayResponse: data,
        }
    }

    const paymentStatus = resolverStatusConsultaCheckout(data)
    const gatewayId = resolverGatewayIdConsultaCheckout(data, checkoutIdFinal)
    await persistirPagamento(supabase, pedidoId || data.reference_id, gatewayId, paymentStatus, data)

    return {
        success: true,
        status: 200,
        checkoutId: checkoutIdFinal,
        checkoutStatus: data.status || null,
        paymentStatus,
        gatewayId,
    }
}

async function criarCheckoutHospedadoPagBank({
    pagbankApiUrl,
    pagbankToken,
    supabase,
    pedidoId,
    itens,
    nomeCliente,
    email,
    cpfLimpo,
    telefone,
    redirectUrl,
    webhookUrl,
    metodoPagamento,
    shipping,
    valor,
}) {
    if (!Array.isArray(itens) || itens.length === 0) {
        return { success: false, status: 400, errors: ['Itens do pedido são obrigatórios.'] }
    }

    const itensFormatados = formatarItensPagBank(itens, pedidoId)
    if (itensFormatados.length === 0) {
        return { success: false, status: 400, errors: ['Nenhum item válido encontrado no pedido.'] }
    }

    const returnUrl = redirectUrl || `${SITE_URL}/checkout-retorno.html?pedido=${encodeURIComponent(pedidoId)}`
    const customerPhone = normalizarTelefone(telefone) || undefined
    const shippingPagBank = normalizarShippingPagBank(shipping)
    const itensTotal = itensFormatados.reduce((total, item) => total + (item.unit_amount * item.quantity), 0)
    const shippingAmount = shippingPagBank?.amount || 0
    const totalPedido = valorCentavos(valor, itensTotal + shippingAmount)
    const additionalAmount = Math.max(0, totalPedido - itensTotal - shippingAmount)
    const payload = {
        reference_id: pedidoId,
        customer: {
            name: (nomeCliente || 'CLIENTE').substring(0, 80),
            email: normalizarEmailPagBank(email, pedidoId),
            tax_id: cpfLimpo,
            ...(customerPhone ? { phones: [customerPhone] } : {}),
        },
        items: itensFormatados,
        ...(shippingPagBank ? { shipping: shippingPagBank } : {}),
        ...(additionalAmount > 0 ? { additional_amount: additionalAmount } : {}),
        payment_methods: resolverMetodosPagamentoCheckout(metodoPagamento),
        redirect_url: returnUrl,
        return_url: returnUrl,
        notification_urls: [webhookUrl],
        payment_notification_urls: [webhookUrl],
        soft_descriptor: 'JSL EMBALAGENS',
    }

    console.log('[PagBank] Criando checkout hospedado para pedido:', pedidoId)

    let res, data
    try {
        res = await fetch(`${pagbankApiUrl}/checkouts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${pagbankToken}`,
                'x-idempotency-key': `chk_${pedidoId}`,
            },
            body: JSON.stringify(payload),
        })
        data = await res.json().catch(() => ({}))
    } catch (fetchErr) {
        console.error('[PagBank] Erro de rede ao chamar PagBank:', fetchErr)
        return {
            success: false,
            status: 502,
            errorCode: 'PAGBANK_NETWORK_ERROR',
            errors: ['Não foi possível conectar ao PagBank. Tente novamente.'],
        }
    }

    console.log('[PagBank] HTTP status:', res.status)
    console.log('[PagBank] Resposta completa:', JSON.stringify(data).substring(0, 800))

    if (!res.ok) {
        const erros = extrairMensagemErroPagBank(data, 'Não foi possível criar o checkout.')
        let code = 'PAGBANK_CHECKOUT_ERROR'
        if (res.status === 401 || res.status === 403) code = 'PAGBANK_TOKEN_INVALID'
        const isAllowlist = erros.some(e =>
            String(e).toLowerCase().includes('allowlist') ||
            String(e).toLowerCase().includes('whitelist')
        )
        if (isAllowlist) {
            code = 'PAGBANK_ALLOWLIST'
            console.error('[PagBank] ALLOWLIST ERROR')
        }
        return {
            success: false,
            status: getClientSafeErrorStatus(res.status || 400),
            errorCode: code,
            errors: erros,
            gatewayResponse: data,
        }
    }

    const checkoutUrl = data?.links?.find(l => l?.rel === 'PAY')?.href || null
    if (!checkoutUrl) {
        return {
            success: false,
            status: 502,
            errorCode: 'PAGBANK_NO_LINK',
            errors: ['Link de checkout não retornado pelo PagBank.'],
            gatewayResponse: data,
        }
    }

    if (supabase && data.id) {
        await supabase.from('payments').update({
            gateway: 'pagbank',
            gateway_transaction_id: data.id,
            gateway_response: data,
            updated_at: new Date().toISOString(),
        }).eq('order_id', pedidoId)
    }

    return {
        success: true,
        status: 200,
        checkoutUrl,
        checkoutId: data.id,
        gatewayResponse: data,
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SERVE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req)
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // WEBHOOK
    if (url.searchParams.get('webhook') === 'true') {
        try {
            const rawBody = await req.text().catch(() => '')
            if (!rawBody) return new Response('OK', { status: 200 })

            const assinaturaValida = await validarAssinaturaWebhookPagBank(req, rawBody)
            if (!assinaturaValida) {
                console.warn('[PagBank Webhook] Assinatura invalida ou ausente. Evento descartado.')
                return new Response('OK', { status: 200 })
            }

            const payload = JSON.parse(rawBody)
            if (!payload) return new Response('OK', { status: 200 })
            console.log('[PagBank Webhook] Recebido:', JSON.stringify(payload).substring(0, 600))
            const supabase = getSupabaseAdmin()
            if (payload.id?.startsWith('CHEC_') && Array.isArray(payload.charges)) {
                for (const charge of payload.charges) {
                    await persistirPagamento(supabase, payload.reference_id, charge.id, STATUS_MAP[charge.status] || 'pending', charge)
                }
                return new Response('OK', { status: 200 })
            }
            if ((payload.id?.startsWith('ORDE_') || payload.charges) && payload.reference_id) {
                for (const charge of (payload.charges || [])) {
                    await persistirPagamento(supabase, payload.reference_id, charge.id, STATUS_MAP[charge.status] || 'pending', charge)
                }
                return new Response('OK', { status: 200 })
            }
            if (payload.id?.startsWith('CHAR_') && payload.reference_id) {
                await persistirPagamento(supabase, payload.reference_id, payload.id, STATUS_MAP[payload.status] || 'pending', payload)
                return new Response('OK', { status: 200 })
            }
            return new Response('OK', { status: 200 })
        } catch (err) {
            console.error('[PagBank Webhook] Erro:', err)
            return new Response('OK', { status: 200 })
        }
    }

    // DIAGNÓSTICO
    if (req.method === 'GET' && url.searchParams.get('diagnostico') === 'true') {
        const envAtual = resolverAmbientePagBank(url.searchParams.get('environment'))
        const token = resolverTokenPagBank(envAtual)
        return new Response(
            JSON.stringify({
                pagbank_env: envAtual,
                token_configurado: !!token,
                token_preview: token ? `${token.substring(0, 8)}...${token.slice(-4)}` : 'NÃO CONFIGURADO',
                api_url: resolverApiUrlPagBank(envAtual),
                supabase_url: Deno.env.get('SUPABASE_URL') || 'NÃO CONFIGURADO',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // ROTAS POST
    try {
        let body = {}
        try { body = await req.json() } catch {
            return new Response(
                JSON.stringify({ success: false, errors: ['Requisição inválida.'] }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const pagbankEnv = resolverAmbientePagBank(body.environment)
        const pagbankApiUrl = resolverApiUrlPagBank(pagbankEnv)
        const pagbankSdkUrl = resolverSdkUrlPagBank(pagbankEnv)
        const PAGBANK_TOKEN = resolverTokenPagBank(pagbankEnv)

        if (!PAGBANK_TOKEN) {
            return new Response(
                JSON.stringify({
                    success: false,
                    errorCode: 'PAGBANK_TOKEN_MISSING',
                    errors: [pagbankEnv === 'sandbox'
                        ? 'Token sandbox não configurado. Configure PAGSEGURO_TOKEN_SANDBOX nos Secrets do Supabase.'
                        : 'Token de produção não configurado. Configure PAGSEGURO_TOKEN nos Secrets do Supabase.'],
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── ACTION: get-public-key (INF-01 homologação)
        if (body.action === 'get-public-key') {
            const result = await handleGetPublicKey({ pagbankApiUrl, pagbankToken: PAGBANK_TOKEN })
            return new Response(
                JSON.stringify(result.success
                    ? { success: true, publicKey: result.publicKey, createdAt: result.createdAt }
                    : { success: false, errors: result.errors }),
                { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── ACTION: create-3ds-session (INF-02 homologação)
        if (body.action === 'create-3ds-session') {
            const result = await handleCreate3dsSession({ pagbankSdkUrl, pagbankToken: PAGBANK_TOKEN })
            return new Response(
                JSON.stringify(result.success
                    ? { success: true, session: result.session, sessionId: result.sessionId, expiresAt: result.expiresAt }
                    : { success: false, errors: result.errors }),
                { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ACTION: consult-checkout
        if (body.action === 'consult-checkout') {
            const supabase = getSupabaseAdmin()
            const result = await handleConsultarCheckout({
                pagbankApiUrl,
                pagbankToken: PAGBANK_TOKEN,
                supabase,
                pedidoId: body.pedidoId,
                checkoutId: body.checkoutId,
            })

            return new Response(
                JSON.stringify(result.success
                    ? {
                        success: true,
                        status: result.paymentStatus,
                        checkoutStatus: result.checkoutStatus,
                        checkoutId: result.checkoutId,
                        gatewayId: result.gatewayId,
                        source: result.source || 'pagbank',
                    }
                    : { success: false, errorCode: result.errorCode, errors: result.errors }),
                { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // CRIAR CHECKOUT (credito / debito / pix)
        const supabase = getSupabaseAdmin()
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/processar-pagamento-pagseguro?webhook=true`

        const { pedidoId, valor, itens, nomeCliente, email, cpf, telefone, redirectUrl, metodoPagamento, shipping } = body

        if (!pedidoId) {
            return new Response(
                JSON.stringify({ success: false, errors: ['pedidoId é obrigatório.'] }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const valorNum = parseFloat(valor)
        const valorCentavos = Math.round(valorNum * 100)
        if (!Number.isFinite(valorNum) || valorCentavos <= 0 || valorCentavos > 99999999) {
            return new Response(
                JSON.stringify({ success: false, errors: ['Valor inválido.'] }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const cpfLimpo = (cpf || '').replace(/\D/g, '')
        if (cpfLimpo.length !== 11) {
            return new Response(
                JSON.stringify({ success: false, errors: ['CPF inválido.'] }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log(`[PagBank] Processando pedido ${pedidoId} | Ambiente: ${pagbankEnv} | Método: ${metodoPagamento || 'todos'}`)

        const checkout = await criarCheckoutHospedadoPagBank({
            pagbankApiUrl,
            pagbankToken: PAGBANK_TOKEN,
            supabase,
            pedidoId,
            itens,
            nomeCliente,
            email,
            cpfLimpo,
            telefone,
            redirectUrl,
            webhookUrl: WEBHOOK_URL,
            metodoPagamento,
            shipping,
            valor,
        })

        return new Response(
            JSON.stringify(checkout.success
                ? { success: true, checkoutUrl: checkout.checkoutUrl, checkoutId: checkout.checkoutId }
                : { success: false, errorCode: checkout.errorCode, errors: checkout.errors }),
            { status: checkout.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('[PagBank] Erro interno não tratado:', err)
        return new Response(
            JSON.stringify({ success: false, errors: ['Erro interno ao processar pagamento.'] }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
