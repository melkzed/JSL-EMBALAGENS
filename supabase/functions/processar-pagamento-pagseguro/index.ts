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

// Produção: https://api.pagseguro.com
// Sandbox:  https://sandbox.api.pagseguro.com
const PAGBANK_ENV = (Deno.env.get('PAGBANK_ENV') || 'production').toLowerCase()
const PAGBANK_API_URL = Deno.env.get('PAGBANK_API_URL')
    || (PAGBANK_ENV === 'sandbox'
        ? 'https://sandbox.api.pagseguro.com'
        : 'https://api.pagseguro.com')
const SITE_URL = 'https://jslembalagens.com.br'

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

    const updateData = {
        gateway: 'pagbank',
        gateway_transaction_id: gatewayId,
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

function getMensagem(status) {
    const m = {
        'approved': 'Pagamento aprovado com sucesso!',
        'processing': 'Pagamento em análise. Você será notificado em breve.',
        'pending': 'Pagamento pendente de confirmação.',
        'refused': 'Pagamento recusado. Verifique os dados do cartão.',
        'cancelled': 'Pagamento cancelado.',
    }
    return m[status] || 'Pagamento em análise.'
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
                ).substring(0, 120),
                quantity,
                unit_amount: unitAmount,
            }
        })
        .filter(Boolean)
}

function formatarEnderecoPagBank(orderData) {
    if (!orderData?.shipping_street || !orderData?.shipping_number || !orderData?.shipping_city || !orderData?.shipping_state || !orderData?.shipping_zip_code) {
        return null
    }

    const postalCode = String(orderData.shipping_zip_code).replace(/\D/g, '')
    if (postalCode.length !== 8) return null

    return {
        street: String(orderData.shipping_street).substring(0, 160),
        number: String(orderData.shipping_number).substring(0, 20),
        ...(orderData.shipping_complement ? { complement: String(orderData.shipping_complement).substring(0, 40) } : {}),
        locality: String(orderData.shipping_neighborhood || orderData.shipping_city).substring(0, 60),
        city: String(orderData.shipping_city).substring(0, 90),
        region_code: String(orderData.shipping_state).substring(0, 2).toUpperCase(),
        country: 'BRA',
        postal_code: postalCode,
    }
}

function extrairMensagemErroPagBank(data, fallbackMessage) {
    const errorMessages = data?.error_messages?.map(e => traduzirErro(e.code, e.description)).filter(Boolean)
    if (errorMessages?.length) return errorMessages

    if (Array.isArray(data?.errors) && data.errors.length) {
        return data.errors.map(err => String(err))
    }

    if (data?.message) return [String(data.message)]
    return [fallbackMessage]
}

function getClientSafeErrorStatus(status) {
    return status >= 500 ? status : 200
}

async function obterPedidoCompleto(supabase, pedidoId) {
    if (!supabase || !pedidoId) return null

    const { data, error } = await supabase
        .from('orders')
        .select(`
            *,
            order_items (*)
        `)
        .eq('id', pedidoId)
        .maybeSingle()

    if (error) {
        console.error('[PagBank] Erro ao buscar pedido:', error)
        return null
    }

    return data || null
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

function resolverTokenPagBank(env) {
    if (env === 'sandbox') {
        return Deno.env.get('PAGSEGURO_TOKEN_SANDBOX') || Deno.env.get('PAGSEGURO_TOKEN')
    }

    return Deno.env.get('PAGSEGURO_TOKEN')
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

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  WEBHOOK DO PAGBANK
    //  O PagBank faz POST aqui quando o status do pagamento muda.
    //  Esta URL é configurada no campo notification_urls ao criar o checkout.
    //  IMPORTANTE: sempre responder 200 para o PagBank não retentar.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (url.searchParams.get('webhook') === 'true') {
        try {
            const payload = await req.json().catch(() => null)
            if (!payload) return new Response('OK', { status: 200 })

            console.log('[PagBank Webhook] Payload:', JSON.stringify(payload).substring(0, 600))

            const supabase = getSupabaseAdmin()

            // Webhook de Checkout (mudança de status do link)
            if (payload.id?.startsWith('CHEC_') && Array.isArray(payload.charges)) {
                for (const charge of payload.charges) {
                    const status = STATUS_MAP[charge.status] || 'pending'
                    await persistirPagamento(supabase, payload.reference_id, charge.id, status, charge)
                }
                return new Response('OK', { status: 200 })
            }

            // Webhook de Order (com charges embutidos)
            if ((payload.id?.startsWith('ORDE_') || payload.charges) && payload.reference_id) {
                for (const charge of (payload.charges || [])) {
                    const status = STATUS_MAP[charge.status] || 'pending'
                    await persistirPagamento(supabase, payload.reference_id, charge.id, status, charge)
                }
                return new Response('OK', { status: 200 })
            }

            // Webhook de Charge isolado
            if (payload.id?.startsWith('CHAR_') && payload.reference_id) {
                const status = STATUS_MAP[payload.status] || 'pending'
                await persistirPagamento(supabase, payload.reference_id, payload.id, status, payload)
                return new Response('OK', { status: 200 })
            }

            return new Response('OK', { status: 200 })
        } catch (err) {
            console.error('[PagBank Webhook] Erro:', err)
            return new Response('OK', { status: 200 })
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ROTAS INTERNAS (chamadas via supabase.functions.invoke)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
        const PAGBANK_TOKEN = resolverTokenPagBank(pagbankEnv)
        if (!PAGBANK_TOKEN) {
            return new Response(
                JSON.stringify({
                    success: false,
                    errorCode: 'PAGBANK_TOKEN_MISSING',
                    errors: [pagbankEnv === 'sandbox'
                        ? 'PAGSEGURO_TOKEN_SANDBOX não configurado nos Secrets da Edge Function.'
                        : 'PAGSEGURO_TOKEN não configurado nos Secrets da Edge Function.'],
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabase = getSupabaseAdmin()
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/processar-pagamento-pagseguro?webhook=true`

        // ── Obter chave pública ──────────────────────────────────────────────────
        if (body.action === 'get-public-key') {
            // Tenta variável de ambiente primeiro
            let publicKey = Deno.env.get('PAGSEGURO_PUBLIC_KEY') || null

            if (!publicKey) {
                // Tenta buscar chave existente
                const getRes = await fetch(`${pagbankApiUrl}/public-keys/card`, {
                    headers: { 'Authorization': `Bearer ${PAGBANK_TOKEN}` }
                })
                if (getRes.ok) {
                    const d = await getRes.json().catch(() => ({}))
                    publicKey = d.public_key || null
                }

                // Se não encontrou, cria
                if (!publicKey) {
                    const postRes = await fetch(`${pagbankApiUrl}/public-keys`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${PAGBANK_TOKEN}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ type: 'card' })
                    })
                    const postData = await postRes.json().catch(() => ({}))

                    if (postRes.ok) {
                        publicKey = postData.public_key || null
                    } else if (postRes.status === 409) {
                        // Já existe — buscar novamente
                        const retryRes = await fetch(`${pagbankApiUrl}/public-keys/card`, {
                            headers: { 'Authorization': `Bearer ${PAGBANK_TOKEN}` }
                        })
                        const retryData = await retryRes.json().catch(() => ({}))
                        publicKey = retryData.public_key || null
                    } else {
                        const code = (postRes.status === 401 || postRes.status === 403) ? 'PAGBANK_TOKEN_INVALID' : 'PAGBANK_KEY_ERROR'
                        return new Response(
                            JSON.stringify({ success: false, errorCode: code, errors: ['Não foi possível obter a chave pública.'] }),
                            { status: getClientSafeErrorStatus(postRes.status), headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        )
                    }
                }
            }

            if (!publicKey) {
                return new Response(
                    JSON.stringify({ success: false, errorCode: 'PAGBANK_KEY_MISSING', errors: ['Chave pública não disponível.'] }),
                    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({ success: true, publicKey }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── Criar sessão 3DS ─────────────────────────────────────────────────────
        if (body.action === 'create-3ds-session') {
            const sessRes = await fetch(`${pagbankApiUrl}/checkout-sdk/sessions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${PAGBANK_TOKEN}`, 'Content-Type': 'application/json' },
            })

            if (!sessRes.ok) {
                return new Response(
                    JSON.stringify({ success: false, errors: ['Não foi possível iniciar autenticação 3D Secure.'] }),
                    { status: getClientSafeErrorStatus(sessRes.status), headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const sessData = await sessRes.json().catch(() => ({}))
            if (!sessData?.session) {
                return new Response(
                    JSON.stringify({ success: false, errors: ['Sessão 3D Secure inválida.'] }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({ success: true, session: sessData.session }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── Validações comuns ────────────────────────────────────────────────────
        const { pedidoId, valor, itens, nomeCliente, email, cpf, telefone, redirectUrl,
                encryptedCard, parcelas, tipo, authenticationId } = body

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

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  CHECKOUT HOSPEDADO (sem cartão = link de pagamento)
        //
        //  Fluxo:
        //  1. Backend cria o checkout via API do PagBank
        //  2. PagBank retorna um link (rel=PAY)
        //  3. Frontend redireciona o cliente para esse link
        //  4. Cliente paga no ambiente do PagBank
        //  5. PagBank redireciona o cliente de volta via redirect_url
        //  6. PagBank notifica o backend via notification_urls (webhook)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (!encryptedCard) {
            if (!Array.isArray(itens) || itens.length === 0) {
                return new Response(
                    JSON.stringify({ success: false, errors: ['Itens do pedido são obrigatórios.'] }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // URL de retorno: onde o cliente vai após pagar
            // Deve ser a URL do SEU SITE (não do checkout do PagBank)
            const returnUrl = redirectUrl || `${SITE_URL}/checkout-retorno.html?pedido=${encodeURIComponent(pedidoId)}`

            const itensFormatados = formatarItensPagBank(itens, pedidoId)
            const customerPhone = normalizarTelefone(telefone) || undefined

            const payload = {
                reference_id: pedidoId,
                customer: {
                    name: (nomeCliente || 'CLIENTE').substring(0, 80),
                    email: normalizarEmailPagBank(email, pedidoId),
                    tax_id: cpfLimpo,
                    ...(customerPhone ? { phones: [customerPhone] } : {}),
                },
                items: itensFormatados,
                payment_methods: [
                    { type: 'CREDIT_CARD' },
                    { type: 'DEBIT_CARD' },
                    { type: 'PIX' },
                    { type: 'BOLETO' },
                ],
                // ↓ URL do SEU SITE para onde o cliente volta após pagar
                redirect_url: returnUrl,
                // ↓ URL da EDGE FUNCTION que recebe notificações do PagBank
                notification_urls: [WEBHOOK_URL],
                soft_descriptor: 'JSL EMBALAGENS',
            }

            console.log('[PagBank] Criando checkout:', pedidoId)

            const res = await fetch(`${pagbankApiUrl}/checkouts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${PAGBANK_TOKEN}`,
                    'x-idempotency-key': `chk_${pedidoId}`,
                },
                body: JSON.stringify(payload),
            })

            const data = await res.json().catch(() => ({}))
            console.log('[PagBank] Resposta checkout:', res.status, JSON.stringify(data).substring(0, 400))

            if (!res.ok) {
                const erros = data?.error_messages?.map(e => traduzirErro(e.code, e.description))
                    || ['Não foi possível criar o checkout.']
                const code = (res.status === 401 || res.status === 403) ? 'PAGBANK_TOKEN_INVALID' : 'PAGBANK_CHECKOUT_ERROR'
                return new Response(
                    JSON.stringify({ success: false, errorCode: code, errors: erros }),
                    { status: getClientSafeErrorStatus(res.status || 400), headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // O link de pagamento está em links[].rel === 'PAY'
            const checkoutUrl = data?.links?.find(l => l?.rel === 'PAY')?.href || null
            if (!checkoutUrl) {
                return new Response(
                    JSON.stringify({ success: false, errors: ['Link de checkout não retornado pelo PagBank.'] }),
                    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Salva checkoutId no banco para rastreamento
            if (supabase && data.id) {
                const { error: checkoutSaveErr } = await supabase.from('payments').update({
                    gateway: 'pagbank',
                    gateway_transaction_id: data.id,
                    updated_at: new Date().toISOString(),
                }).eq('order_id', pedidoId)
                if (checkoutSaveErr) console.error('[PagBank] Erro ao salvar checkoutId:', checkoutSaveErr)
            }

            return new Response(
                JSON.stringify({ success: true, checkoutUrl, checkoutId: data.id }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  COBRANÇA DIRETA COM CARTÃO CRIPTOGRAFADO
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const isCredito = tipo !== 'debit_card'
        const numParcelas = isCredito ? (parseInt(parcelas) || 1) : 1
        const pedidoSalvo = await obterPedidoCompleto(supabase, pedidoId)
        const itensOrder = formatarItensPagBank(
            Array.isArray(itens) && itens.length > 0 ? itens : (pedidoSalvo?.order_items || []),
            pedidoId
        )

        if (itensOrder.length === 0) {
            return new Response(
                JSON.stringify({ success: false, errors: ['Itens do pedido são obrigatórios para pagamento com cartão.'] }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const customerPhone = normalizarTelefone(telefone) || undefined
        const shippingAddress = formatarEnderecoPagBank(pedidoSalvo)
        const holderName = (nomeCliente || pedidoSalvo?.shipping_recipient || 'CLIENTE').substring(0, 30)
        const paymentMethod = {
            type: isCredito ? 'CREDIT_CARD' : 'DEBIT_CARD',
            installments: numParcelas,
            capture: true,
            card: {
                encrypted: encryptedCard,
                store: false,
            },
            holder: {
                name: holderName,
                tax_id: cpfLimpo,
            },
        }

        if (!isCredito && authenticationId) {
            paymentMethod.authentication_method = { type: 'THREEDS', id: authenticationId }
        }

        const orderPayload = {
            reference_id: pedidoId,
            customer: {
                name: (nomeCliente || pedidoSalvo?.shipping_recipient || 'CLIENTE').substring(0, 80),
                email: normalizarEmailPagBank(email, pedidoId),
                tax_id: cpfLimpo,
                ...(customerPhone ? { phones: [customerPhone] } : {}),
            },
            items: itensOrder,
            ...(shippingAddress ? { shipping: { address: shippingAddress } } : {}),
            notification_urls: [WEBHOOK_URL],
            charges: [
                {
                    reference_id: `${pedidoId}-1`.substring(0, 64),
                    description: `Pedido JSL #${pedidoId.substring(0, 8).toUpperCase()}`,
                    amount: { value: valorCentavos, currency: 'BRL' },
                    payment_method: paymentMethod,
                }
            ],
        }

        console.log('[PagBank] Criando order com cartão:', pedidoId, tipo, valorCentavos)

        const orderRes = await fetch(`${pagbankApiUrl}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PAGBANK_TOKEN}`,
                'x-idempotency-key': `ord_${pedidoId}`,
            },
            body: JSON.stringify(orderPayload),
        })

        const orderData = await orderRes.json().catch(() => ({}))
        console.log('[PagBank] Resposta order:', orderRes.status, JSON.stringify(orderData).substring(0, 500))

        if (!orderRes.ok || orderData.error_messages) {
            const erros = extrairMensagemErroPagBank(orderData, 'Erro ao processar pagamento.')
            const code = (orderRes.status === 401 || orderRes.status === 403) ? 'PAGBANK_TOKEN_INVALID' : 'PAGBANK_ORDER_ERROR'
            return new Response(
                JSON.stringify({
                    success: false,
                    errorCode: code,
                    errors: erros,
                    ...(pagbankEnv === 'sandbox' ? { gatewayDebug: orderData } : {}),
                }),
                { status: getClientSafeErrorStatus(orderRes.status || 400), headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const charge = Array.isArray(orderData?.charges) ? orderData.charges[0] : null
        const status = STATUS_MAP[charge?.status || orderData?.status] || 'pending'
        const gatewayId = charge?.id || orderData?.id || pedidoId

        await persistirPagamento(supabase, pedidoId, gatewayId, status, orderData)

        return new Response(
            JSON.stringify({
                success: status === 'approved' || status === 'processing',
                status,
                gateway: 'pagbank',
                gatewayId,
                orderId: orderData?.id || null,
                message: getMensagem(status),
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('[PagBank] Erro interno:', err)
        return new Response(
            JSON.stringify({ success: false, errors: ['Erro interno ao processar pagamento.'] }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
