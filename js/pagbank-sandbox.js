const SUPABASE_FUNCTIONS_URL = 'https://otwmjdiqjhumqvyztnbl.supabase.co/functions/v1'
const SUPABASE_PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90d21qZGlxamh1bXF2eXp0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTU3NTUsImV4cCI6MjA5MDA3MTc1NX0.1syGgZJNqoax0z-E5dWcTtm5g47xDUdFa3U7lttxZz4'

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
        return {
            data,
            error: new Error(data?.errors?.[0] || data?.message || `Erro HTTP ${response.status}`),
        }
    }

    return { data, error: null }
}

const TEST_CARDS = [
    { label: 'Visa', number: '4539620659922097', cvv: '123', expiry: '12/2026' },
    { label: 'Mastercard', number: '5240082975622454', cvv: '123', expiry: '12/2026' },
    { label: 'American Express', number: '345817690311361', cvv: '1234', expiry: '12/2026' },
    { label: 'Elo', number: '4514161122113757', cvv: '123', expiry: '12/2026' },
    { label: 'Hiper', number: '6062828598919021', cvv: '123', expiry: '12/2026' },
]

const cardSelect = document.getElementById('testCardSelect')
const form = document.getElementById('sandboxForm')
const resultBox = document.getElementById('sandboxResult')
const statusBox = document.getElementById('sandboxStatus')
const smokeBtn = document.getElementById('btnSmokeTest')
const runBtn = document.getElementById('btnRunSandbox')

function preencherCartoes() {
    cardSelect.innerHTML = TEST_CARDS.map((card, index) =>
        `<option value="${index}">${card.label} - ${card.number}</option>`
    ).join('')

    aplicarCartao(0)
    cardSelect.addEventListener('change', () => aplicarCartao(Number(cardSelect.value)))
}

function aplicarCartao(index) {
    const card = TEST_CARDS[index] || TEST_CARDS[0]
    document.getElementById('cardNumber').value = card.number
    document.getElementById('cardCVV').value = card.cvv
    document.getElementById('cardExpiry').value = card.expiry
}

function preencherPadroes() {
    document.getElementById('holderName').value = 'Comprador Teste'
    document.getElementById('buyerName').value = 'Comprador Teste'
    document.getElementById('buyerCPF').value = '12345678909'
    document.getElementById('buyerPhone').value = '83996389725'
    document.getElementById('buyerEmail').value = `comprador.teste+${Date.now()}@example.com`
}

function setStatus(kind, message) {
    statusBox.className = `sandbox-status is-${kind}`
    statusBox.textContent = message
}

function setResult(data) {
    resultBox.textContent = JSON.stringify(data, null, 2)
}

function getExpiryParts(value) {
    const [month = '', year = ''] = String(value || '').split('/')
    return {
        expMonth: month.trim(),
        expYear: year.trim(),
    }
}

async function invokeSandbox(body) {
    const { data, error } = await invokeFunctionPublic('processar-pagamento-pagseguro', {
        environment: 'sandbox',
        ...body,
    })

    if (error) {
        throw new Error(error.message || 'Falha ao chamar a Edge Function.')
    }

    return data
}

async function obterPublicKeySandbox() {
    const data = await invokeSandbox({ action: 'get-public-key' })
    if (!data?.success || !data?.publicKey) {
        throw new Error(data?.errors?.[0] || 'Nao foi possivel obter a chave publica sandbox.')
    }
    return data.publicKey
}

async function criptografarCartao(cardData) {
    if (typeof PagSeguro === 'undefined') {
        throw new Error('SDK do PagBank nao carregado.')
    }

    const publicKey = await obterPublicKeySandbox()
    const encrypted = await PagSeguro.encryptCard({
        publicKey,
        holder: cardData.holderName,
        number: cardData.number,
        expMonth: cardData.expMonth,
        expYear: cardData.expYear,
        securityCode: cardData.cvv,
    })

    if (!encrypted || encrypted.hasErrors || !encrypted.encryptedCard) {
        const sdkErrors = encrypted?.errors?.map(err => err.message || err.code).join(', ')
        throw new Error(sdkErrors || 'Nao foi possivel criptografar o cartao.')
    }

    return encrypted.encryptedCard
}

async function rodarSmokeTest() {
    setStatus('running', 'Executando smoke test do sandbox...')
    setResult({})

    try {
        const [publicKey, session3ds] = await Promise.all([
            invokeSandbox({ action: 'get-public-key' }),
            invokeSandbox({ action: 'create-3ds-session' }),
        ])

        setStatus('success', 'Smoke test do sandbox concluido com sucesso.')
        setResult({ publicKey, session3ds })
    } catch (error) {
        setStatus('error', error.message || 'Falha no smoke test.')
        setResult({ error: error.message || String(error) })
    }
}

async function rodarPagamentoSandbox(event) {
    event.preventDefault()
    setStatus('running', 'Criptografando cartao e enviando pedido sandbox...')
    setResult({})

    runBtn.disabled = true
    smokeBtn.disabled = true

    try {
        const expiry = getExpiryParts(document.getElementById('cardExpiry').value)
        const holderName = document.getElementById('holderName').value.trim()
        const buyerName = document.getElementById('buyerName').value.trim()
        const buyerEmail = document.getElementById('buyerEmail').value.trim()
        const buyerCPF = document.getElementById('buyerCPF').value.replace(/\D/g, '')
        const buyerPhone = document.getElementById('buyerPhone').value.replace(/\D/g, '')
        const value = Number(document.getElementById('orderValue').value)
        const installments = Number(document.getElementById('installments').value)
        const itemName = document.getElementById('itemName').value.trim()

        const encryptedCard = await criptografarCartao({
            holderName,
            number: document.getElementById('cardNumber').value.replace(/\s+/g, ''),
            cvv: document.getElementById('cardCVV').value.trim(),
            expMonth: expiry.expMonth,
            expYear: expiry.expYear,
        })

        const pedidoId = `sandbox-ui-${Date.now()}`
        const data = await invokeSandbox({
            pedidoId,
            valor: value,
            parcelas: installments,
            tipo: 'credit_card',
            encryptedCard,
            cpf: buyerCPF,
            nomeCliente: buyerName,
            email: buyerEmail,
            telefone: buyerPhone,
            itens: [
                {
                    nome: itemName,
                    quantidade: 1,
                    preco: value,
                }
            ],
        })

        if (!data?.success) {
            throw new Error(data?.errors?.[0] || 'Pagamento sandbox retornou falha.')
        }

        setStatus('success', 'Pagamento sandbox aprovado.')
        setResult({
            pedidoId,
            response: data,
        })
    } catch (error) {
        setStatus('error', error.message || 'Falha ao executar o pagamento sandbox.')
        setResult({ error: error.message || String(error) })
    } finally {
        runBtn.disabled = false
        smokeBtn.disabled = false
    }
}

preencherCartoes()
preencherPadroes()
form.addEventListener('submit', rodarPagamentoSandbox)
smokeBtn.addEventListener('click', rodarSmokeTest)
