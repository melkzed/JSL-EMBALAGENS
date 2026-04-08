// @ts-nocheck — Deno runtime (Supabase Edge Functions)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
    'https://jslembalagens.com.br',
    'https://www.jslembalagens.com.br',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
    'http://localhost:5501'
]

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') || ''
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
}

const PAGSEGURO_API_URL = 'https://api.pagseguro.com'

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const PAGSEGURO_TOKEN = Deno.env.get('PAGSEGURO_TOKEN')
        if (!PAGSEGURO_TOKEN) {
            return new Response(
                JSON.stringify({
                    success: false,
                    gateway: 'pagseguro',
                    errors: ['Gateway PagSeguro não configurado. Configure PAGSEGURO_TOKEN.'],
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const body = await req.json()

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  ROTA: CRIAR SESSÃO 3DS
        //  Chamada pelo frontend antes de autenticar débito
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (body.action === 'get-public-key') {
            let publicKey = Deno.env.get('PAGSEGURO_PUBLIC_KEY')

            if (!publicKey) {
                const pkResponse = await fetch(`${PAGSEGURO_API_URL}/public-keys`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${PAGSEGURO_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ type: 'card' })
                })

                const pkData = await pkResponse.json()
                publicKey = pkData.public_key
            }

            return new Response(
                JSON.stringify({ publicKey }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (body.action === 'create-3ds-session') {
            const sessionResponse = await fetch(`${PAGSEGURO_API_URL}/checkout-sdk/sessions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PAGSEGURO_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            })

            if (!sessionResponse.ok) {
                const errData = await sessionResponse.json().catch(() => ({}))
                console.error('[PagSeguro] Erro ao criar sessão 3DS:', sessionResponse.status, errData)
                return new Response(
                    JSON.stringify({ success: false, errors: ['Não foi possível iniciar autenticação 3D Secure.'] }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const sessionData = await sessionResponse.json()
            return new Response(
                JSON.stringify({ success: true, session: sessionData.session }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  ROTA: PROCESSAR COBRANÇA
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const {
            pedidoId,
            valor,
            parcelas,
            tipo,              // 'credit_card' ou 'debit_card'
            encryptedCard,
            cartao,            // { numero, titular, mesExpiracao, anoExpiracao, cvv }
            cpf,
            email,
            nomeCliente,
            telefone,
            authenticationId,  // ID da autenticação 3DS (obrigatório para débito)
        } = body

        // Validação de entrada
        if (!pedidoId || !valor || !encryptedCard || !cpf) {
            return new Response(JSON.stringify({
                success: false,
                errors: ['Dados incompletos']
            }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Validar formato do CPF
        const cpfLimpo = cpf.replace(/\D/g, '')
        if (cpfLimpo.length !== 11) {
            return new Response(
                JSON.stringify({ success: false, errors: ['CPF inválido.'] }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Validar dados do cartão


        const valorEmCentavos = Math.round(parseFloat(valor) * 100)
        if (valorEmCentavos <= 0 || valorEmCentavos > 99999999) {
            return new Response(
                JSON.stringify({ success: false, errors: ['Valor inválido.'] }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 1. CRIPTOGRAFAR CARTÃO VIA PAGSEGURO
        // PagSeguro exige que os dados do cartão sejam criptografados
        // usando a public key antes de enviar para a API de charges
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // Primeiro, obter/criar a public key
        let publicKey = Deno.env.get('PAGSEGURO_PUBLIC_KEY') || null

        if (!publicKey) {
            // Tentar criar uma public key via API
            try {
                const pkResponse = await fetch(`${PAGSEGURO_API_URL}/public-keys`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${PAGSEGURO_TOKEN}`,
                    },
                    body: JSON.stringify({ type: 'card' })
                })

                if (pkResponse.status === 409) {
                    // Já existe, buscar a existente
                    const pkGetResponse = await fetch(`${PAGSEGURO_API_URL}/public-keys/card`, {
                        headers: { 'Authorization': `Bearer ${PAGSEGURO_TOKEN}` }
                    })
                    const pkGetData = await pkGetResponse.json()
                    publicKey = pkGetData.public_key
                } else if (pkResponse.ok) {
                    const pkData = await pkResponse.json()
                    publicKey = pkData.public_key
                }
            } catch (e) {
                console.warn('Não foi possível obter public key do PagSeguro:', e)
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 2. CRIAR COBRANÇA (CHARGE) NO PAGSEGURO
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        const isCredito = tipo !== 'debit_card'
        const numParcelas = isCredito ? (parseInt(parcelas) || 1) : 1

        // Montar payload para o PagSeguro API v4
        const chargePayload: any = {
            reference_id: pedidoId,
            description: `Pedido ${pedidoId}`,
            amount: {
                value: valorEmCentavos,
                currency: 'BRL'
            },
            payment_method: {
                type: isCredito ? 'CREDIT_CARD' : 'DEBIT_CARD',
                installments: numParcelas,
                capture: true,
                card: {
                    encrypted: encryptedCard,
                    holder: {
                        name: nomeCliente || 'CLIENTE',
                        tax_id: cpfLimpo
                    }
                }
            },
            notification_urls: [
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/processar-pagamento-pagseguro?webhook=true`
            ]
        }

        // Se débito, enviar autenticação 3DS (quando disponível)
        if (!isCredito && authenticationId) {
            chargePayload.payment_method.authentication_method = {
                type: 'THREEDS',
                id: authenticationId,
            }
        }

        console.log('[PagSeguro] Criando charge para pedido:', pedidoId, 'tipo:', tipo, 'valor:', valorEmCentavos)

        const chargeResponse = await fetch(`${PAGSEGURO_API_URL}/charges`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PAGSEGURO_TOKEN}`,
                'x-idempotency-key': `charge_${pedidoId}`,
            },
            body: JSON.stringify(chargePayload),
        })

        const chargeData = await chargeResponse.json()

        console.log('[PagSeguro] Resposta:', chargeResponse.status, JSON.stringify(chargeData).substring(0, 500))

        // Se houve erro na API
        if (!chargeResponse.ok || chargeData.error_messages) {
            const erros = chargeData.error_messages?.map((e: any) =>
                traduzirErroPagSeguro(e.code, e.description)
            ) || ['Erro ao processar pagamento via PagSeguro.']

            console.error('[PagSeguro] Erros:', erros)

            return new Response(
                JSON.stringify({
                    success: false,
                    gateway: 'pagseguro',
                    errors: erros,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 3. ATUALIZAR BANCO DE DADOS
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

        // Mapear status PagSeguro → nosso status
        const statusMap: Record<string, string> = {
            'AUTHORIZED': 'approved',
            'PAID': 'approved',
            'IN_ANALYSIS': 'processing',
            'WAITING': 'pending',
            'DECLINED': 'refused',
            'CANCELED': 'cancelled',
        }

        const paymentStatus = statusMap[chargeData.status] || 'pending'

        // Atualizar pagamento no banco
        const updateData: any = {
            gateway: 'pagseguro',
            gateway_transaction_id: chargeData.id,
            gateway_response: chargeData,
            status: paymentStatus,
            updated_at: new Date().toISOString(),
        }

        if (paymentStatus === 'approved') {
            updateData.paid_at = new Date().toISOString()
        }

        const { data: payRow, error: payErr } = await supabaseAdmin
            .from('payments')
            .update(updateData)
            .eq('order_id', pedidoId)
            .select('id')

        if (payErr) {
            console.error('[PagSeguro] Erro ao atualizar payment:', payErr)
        }

        // Se aprovado, atualizar pedido
        if (paymentStatus === 'approved') {
            const { error: ordErr } = await supabaseAdmin
                .from('orders')
                .update({ status: 'paid', updated_at: new Date().toISOString() })
                .eq('id', pedidoId)

            if (ordErr) {
                console.error('[PagSeguro] Erro ao atualizar order:', ordErr)
            }

            await supabaseAdmin
                .from('order_status_history')
                .insert({
                    order_id: pedidoId,
                    status: 'paid',
                    notes: `Pagamento aprovado via PagSeguro (ID: ${chargeData.id})`,
                }).catch(() => { })
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 4. RETORNAR RESULTADO
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        const result = {
            success: paymentStatus === 'approved' || paymentStatus === 'processing',
            status: paymentStatus,
            gateway: 'pagseguro',
            gatewayId: chargeData.id,
            message: getStatusMessage(paymentStatus),
        }

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('Erro PagSeguro:', err)
        return new Response(
            JSON.stringify({
                success: false,
                gateway: 'pagseguro',
                errors: ['Erro interno ao processar pagamento via PagSeguro.'],
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRADUÇÃO DE ERROS PAGSEGURO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function traduzirErroPagSeguro(code: string, descricao: string): string {
    const traducoes: Record<string, string> = {
        '40001': 'Parâmetro obrigatório não informado.',
        '40002': 'Parâmetro inválido.',
        '40003': 'Parâmetro inválido (header).',
        '11013': 'Número do cartão inválido.',
        '11014': 'CVV inválido.',
        '11015': 'Mês de validade inválido.',
        '11016': 'Ano de validade inválido.',
        '11017': 'Cartão vencido.',
        '20000': 'Pagamento recusado pelo banco emissor. Tente outro cartão.',
        '20001': 'Pagamento recusado — cartão vencido.',
        '20002': 'Pagamento recusado — cartão bloqueado.',
        '20003': 'Pagamento recusado pelo banco emissor.',
        '20004': 'Pagamento recusado — saldo insuficiente.',
        '20005': 'Pagamento recusado — cartão não aceito.',
        '20006': 'Pagamento recusado — suspeita de fraude.',
    }

    return traducoes[code] || descricao || 'Erro ao processar pagamento. Verifique os dados e tente novamente.'
}

function getStatusMessage(status: string): string {
    const messages: Record<string, string> = {
        'approved': 'Pagamento aprovado com sucesso!',
        'processing': 'Pagamento em análise. Você será notificado quando for aprovado.',
        'pending': 'Pagamento pendente de confirmação.',
        'refused': 'Pagamento recusado. Verifique os dados do cartão e tente novamente.',
        'cancelled': 'Pagamento cancelado.',
    }
    return messages[status] || 'Pagamento em análise.'
}
