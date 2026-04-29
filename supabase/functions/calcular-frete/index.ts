
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ALLOWED_ORIGINS = [
    'https://jslembalagens.com.br',
    'https://www.jslembalagens.com.br',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
]

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') || ''
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    }
}


const SERVICOS_PERMITIDOS: Record<number, { transportadora: string; servico: string; logo: string }> = {
    1: { transportadora: 'Correios', servico: 'PAC', logo: 'correios' },
    2: { transportadora: 'Correios', servico: 'SEDEX', logo: 'correios' },
    3: { transportadora: 'Jadlog', servico: 'Package', logo: 'jadlog' },
    4: { transportadora: 'Jadlog', servico: '.Com', logo: 'jadlog' },
    17: { transportadora: 'Braspress', servico: 'Rodoviário', logo: 'braspress' },
}

serve(async (req: Request) => {
    const CORS_HEADERS = getCorsHeaders(req)

    
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS })
    }

    try {
        const token = Deno.env.get('MELHOR_ENVIO_TOKEN')
        if (!token) {
            return new Response(
                JSON.stringify({ erro: 'Token Melhor Envio não configurado. Configure com: supabase secrets set MELHOR_ENVIO_TOKEN=seu_token' }),
                { status: 500, headers: CORS_HEADERS }
            )
        }

        const body = await req.json()
        const { cepOrigem, cepDestino, produtos } = body

        if (!cepOrigem || !cepDestino || !produtos || !Array.isArray(produtos)) {
            return new Response(
                JSON.stringify({ erro: 'Dados inválidos. Envie cepOrigem, cepDestino e produtos.' }),
                { status: 400, headers: CORS_HEADERS }
            )
        }

        
        const cepOrigemLimpo = cepOrigem.replace(/\D/g, '')
        const cepDestinoLimpo = cepDestino.replace(/\D/g, '')

        if (cepOrigemLimpo.length !== 8 || cepDestinoLimpo.length !== 8) {
            return new Response(
                JSON.stringify({ erro: 'CEP inválido. Deve conter 8 dígitos.' }),
                { status: 400, headers: CORS_HEADERS }
            )
        }

        
        const prefixoOrigem = parseInt(cepOrigemLimpo.substring(0, 5))
        const prefixoDestino = parseInt(cepDestinoLimpo.substring(0, 5))
        if (prefixoOrigem < 1000 || prefixoOrigem > 99999 || prefixoDestino < 1000 || prefixoDestino > 99999) {
            return new Response(
                JSON.stringify({ erro: 'CEP inválido. Verifique o número digitado.' }),
                { status: 400, headers: CORS_HEADERS }
            )
        }

        
        const produtosValidos = produtos.map((p: Record<string, unknown>) => ({
            width: Math.max(Number(p.width) || 11, 11),
            height: Math.max(Number(p.height) || 2, 2),
            length: Math.max(Number(p.length) || 16, 16),
            weight: Math.max(Number(p.weight) || 0.3, 0.3),
            insurance_value: Math.max(Number(p.insurance_value) || 0, 0),
            quantity: Math.max(Math.floor(Number(p.quantity) || 1), 1),
        }))

        
        const response = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'JSL Embalagens (contato@jslsolucoesemembalagens.com)',
            },
            body: JSON.stringify({
                from: { postal_code: cepOrigemLimpo },
                to: { postal_code: cepDestinoLimpo },
                products: produtosValidos,
            }),
        })

        if (!response.ok) {
            const errText = await response.text()
            console.error('[Frete] Erro Melhor Envio:', response.status, errText)
            return new Response(
                JSON.stringify({ erro: 'Erro ao consultar transportadoras. Tente novamente.' }),
                { status: 502, headers: CORS_HEADERS }
            )
        }

        const resultado = await response.json()

        if (!Array.isArray(resultado)) {
            return new Response(
                JSON.stringify({ erro: 'Resposta inesperada da API.' }),
                { status: 502, headers: CORS_HEADERS }
            )
        }

        
        const prazoPreparacao = 2

        
        const opcoes = resultado
            .filter((s: Record<string, unknown>) => {
                
                const id = Number(s.id)
                return SERVICOS_PERMITIDOS[id] && !s.error && s.price
            })
            .map((s: Record<string, unknown>) => {
                const id = Number(s.id)
                const info = SERVICOS_PERMITIDOS[id]
                const prazoAPI = Number(s.delivery_time) || 0

                return {
                    id: info.servico.toLowerCase().replace(/[^a-z]/g, ''),
                    transportadora: info.transportadora,
                    servico: info.servico,
                    logo: info.logo,
                    preco: parseFloat(Number(s.price).toFixed(2)),
                    prazoMin: prazoAPI + prazoPreparacao,
                    prazoMax: prazoAPI + prazoPreparacao + 2,
                    regiao: '',
                }
            })
            .sort((a: { preco: number }, b: { preco: number }) => a.preco - b.preco)

        return new Response(
            JSON.stringify({ opcoes }),
            { status: 200, headers: CORS_HEADERS }
        )

    } catch (err) {
        console.error('[Frete] Exceção:', err)
        return new Response(
            JSON.stringify({ erro: 'Erro interno ao calcular frete.' }),
            { status: 500, headers: CORS_HEADERS }
        )
    }
})
