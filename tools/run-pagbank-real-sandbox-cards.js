import { publicEncrypt, constants, createPublicKey } from 'crypto'
import { writeFileSync } from 'fs'

const SUPABASE_FUNCTIONS_URL = 'https://otwmjdiqjhumqvyztnbl.supabase.co/functions/v1'
const SUPABASE_PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90d21qZGlxamh1bXF2eXp0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTU3NTUsImV4cCI6MjA5MDA3MTc1NX0.1syGgZJNqoax0z-E5dWcTtm5g47xDUdFa3U7lttxZz4'

const cards = [
    { label: 'Visa', number: '4539620659922097', cvv: '123', expMonth: '12', expYear: '2026' },
    { label: 'Mastercard', number: '5240082975622454', cvv: '123', expMonth: '12', expYear: '2026' },
    { label: 'American Express', number: '345817690311361', cvv: '1234', expMonth: '12', expYear: '2026' },
    { label: 'Elo', number: '4514161122113757', cvv: '123', expMonth: '12', expYear: '2026' },
]

function maskCard(number) {
    return `${number.slice(0, 6)}******${number.slice(-4)}`
}

function normalizeHolder(holder) {
    return String(holder || '')
        .trim()
        .substring(0, 30)
        .replace("'", '')
        .replace('/', '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z\s]/g, '')
}

function encryptCard(publicKeyBase64Der, card) {
    const key = createPublicKey({
        key: Buffer.from(publicKeyBase64Der, 'base64'),
        format: 'der',
        type: 'spki',
    })

    const payload = [
        card.number.trim(),
        card.cvv.trim(),
        card.expMonth.trim().padStart(2, '0'),
        card.expYear.trim(),
        normalizeHolder('Comprador Teste'),
        Date.now(),
    ].join(';')

    return publicEncrypt(
        {
            key,
            padding: constants.RSA_PKCS1_PADDING,
        },
        Buffer.from(payload, 'utf8'),
    ).toString('base64')
}

async function invokeSandbox(body) {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/processar-pagamento-pagseguro`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_PUBLIC_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLIC_ANON_KEY}`,
        },
        body: JSON.stringify({ environment: 'sandbox', ...body }),
    })

    const data = await response.json().catch(() => ({}))
    return { httpStatus: response.status, data }
}

async function main() {
    const startedAt = new Date().toISOString()
    const publicKeyResponse = await invokeSandbox({ action: 'get-public-key' })

    if (!publicKeyResponse.data?.success || !publicKeyResponse.data?.publicKey) {
        throw new Error(publicKeyResponse.data?.errors?.[0] || 'Nao foi possivel obter public key sandbox.')
    }

    const results = []

    for (const card of cards) {
        const pedidoId = `sandbox-card-${card.label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
        const item = {
            label: card.label,
            maskedCard: maskCard(card.number),
            pedidoId,
            encrypted: false,
            httpStatus: null,
            success: false,
            status: null,
            gatewayId: null,
            orderId: null,
            errors: null,
        }

        try {
            const encryptedCard = encryptCard(publicKeyResponse.data.publicKey, card)
            item.encrypted = Boolean(encryptedCard)

            const paymentResponse = await invokeSandbox({
                pedidoId,
                valor: 10.00,
                parcelas: 1,
                tipo: 'credit_card',
                encryptedCard,
                cpf: '12345678909',
                nomeCliente: 'Comprador Teste',
                email: `comprador.teste+${pedidoId}@example.com`,
                telefone: '83996389725',
                itens: [
                    {
                        nome: `Teste Sandbox ${card.label}`,
                        quantidade: 1,
                        preco: 10.00,
                    },
                ],
            })

            item.httpStatus = paymentResponse.httpStatus
            item.success = Boolean(paymentResponse.data?.success)
            item.status = paymentResponse.data?.status || null
            item.gatewayId = paymentResponse.data?.gatewayId || null
            item.orderId = paymentResponse.data?.orderId || null
            item.errors = paymentResponse.data?.errors || null
            item.errorCode = paymentResponse.data?.errorCode || null
            item.message = paymentResponse.data?.message || null
            item.response = paymentResponse.data
        } catch (error) {
            item.errors = [error.message || String(error)]
        }

        results.push(item)
    }

    const report = {
        startedAt,
        finishedAt: new Date().toISOString(),
        publicKeyOk: true,
        results,
    }

    writeFileSync('tmp/pagbank-real-card-sandbox-result.json', JSON.stringify(report, null, 2), 'utf8')
    console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
    const report = {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        fatalError: error.message || String(error),
    }
    writeFileSync('tmp/pagbank-real-card-sandbox-result.json', JSON.stringify(report, null, 2), 'utf8')
    console.error(JSON.stringify(report, null, 2))
    process.exit(1)
})
