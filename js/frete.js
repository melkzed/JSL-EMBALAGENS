
import { supabase } from './supabaseClient.js'
import { escapeHtml, formatarPreco } from './utils.js'



export const CONFIG_FRETE = {
    cepOrigem: '58780000', 
    prazoPreparacao: 2,     // Reduzido de 7 para 2 dias
    fatorCubagemCorreios: 6000,  
    fatorCubagemTransp: 5000,    
    pesoMinimoCorreios: 0.3,     
    pesoMinimoJadlog: 0.3,
    pesoMinimoBraspress: 5,      
    pesoMaximoCorreios: 30,      

    usarAPI: true, 
}



const _cache = new Map()
const CACHE_TTL = 10 * 60 * 1000 

function cacheKey(cep, peso, cubagem) {
    return `${cep}_${peso.toFixed(2)}_${cubagem.toFixed(2)}`
}



function validarCEP(cep) {
    const limpo = cep.replace(/\D/g, '')
    if (limpo.length !== 8) return false
    const prefixo = parseInt(limpo.substring(0, 5))
    
    if (prefixo < 1000 || prefixo > 99999) return false
    
    if (prefixo >= 0 && prefixo <= 999) return false
    return true
}

function obterZonaPorCEP(cep) {
    const num = parseInt(cep.replace(/\D/g, '').substring(0, 5))

    
    if (num >= 58000 && num <= 58999) return { zona: 1, uf: 'PB', regiao: 'Local' }

    
    if (num >= 50000 && num <= 56999) return { zona: 2, uf: 'PE', regiao: 'Vizinho' }
    if (num >= 59000 && num <= 59999) return { zona: 2, uf: 'RN', regiao: 'Vizinho' }
    if (num >= 57000 && num <= 57999) return { zona: 2, uf: 'AL', regiao: 'Vizinho' }

    
    if (num >= 60000 && num <= 63999) return { zona: 3, uf: 'CE', regiao: 'Nordeste' }
    if (num >= 49000 && num <= 49999) return { zona: 3, uf: 'SE', regiao: 'Nordeste' }
    if (num >= 40000 && num <= 48999) return { zona: 3, uf: 'BA', regiao: 'Nordeste' }
    if (num >= 64000 && num <= 64999) return { zona: 3, uf: 'PI', regiao: 'Nordeste' }
    if (num >= 65000 && num <= 65999) return { zona: 3, uf: 'MA', regiao: 'Nordeste' }

    
    if (num >= 1000 && num <= 19999) return { zona: 4, uf: 'SP', regiao: 'Sudeste' }
    if (num >= 20000 && num <= 28999) return { zona: 4, uf: 'RJ', regiao: 'Sudeste' }
    if (num >= 29000 && num <= 29999) return { zona: 4, uf: 'ES', regiao: 'Sudeste' }
    if (num >= 30000 && num <= 39999) return { zona: 4, uf: 'MG', regiao: 'Sudeste' }

    
    if (num >= 80000 && num <= 87999) return { zona: 5, uf: 'PR', regiao: 'Sul' }
    if (num >= 88000 && num <= 89999) return { zona: 5, uf: 'SC', regiao: 'Sul' }
    if (num >= 90000 && num <= 99999) return { zona: 5, uf: 'RS', regiao: 'Sul' }

    
    if (num >= 70000 && num <= 76999) return { zona: 5, uf: 'GO/DF', regiao: 'Centro-Oeste' }
    if (num >= 77000 && num <= 77999) return { zona: 5, uf: 'TO', regiao: 'Centro-Oeste' }
    if (num >= 78000 && num <= 78899) return { zona: 5, uf: 'MT', regiao: 'Centro-Oeste' }
    if (num >= 78900 && num <= 79999) return { zona: 5, uf: 'MS', regiao: 'Centro-Oeste' }

    
    if (num >= 66000 && num <= 68899) return { zona: 6, uf: 'PA', regiao: 'Norte' }
    if (num >= 68900 && num <= 68999) return { zona: 6, uf: 'AP', regiao: 'Norte' }
    if (num >= 69300 && num <= 69389) return { zona: 6, uf: 'RR', regiao: 'Norte' }
    if (num >= 69000 && num <= 69299) return { zona: 6, uf: 'AM', regiao: 'Norte' }
    if (num >= 69390 && num <= 69399) return { zona: 6, uf: 'AM', regiao: 'Norte' }
    if (num >= 69400 && num <= 69899) return { zona: 6, uf: 'AM', regiao: 'Norte' }
    if (num >= 69900 && num <= 69999) return { zona: 6, uf: 'AC', regiao: 'Norte' }
    if (num >= 76800 && num <= 76999) return { zona: 6, uf: 'RO', regiao: 'Norte' }

    
    return null
}



const TABELA_CORREIOS_PAC = {
    1: [12.00, 1.20],   // -30% base, -20% por kg
    2: [14.00, 1.60],
    3: [16.50, 2.24],
    4: [19.50, 2.80],
    5: [22.75, 3.36],
    6: [26.50, 4.00],
}

const TABELA_CORREIOS_SEDEX = {
    1: [18.00, 2.56],
    2: [22.75, 3.20],
    3: [27.85, 4.00],
    4: [31.15, 4.64],
    5: [36.40, 5.20],
    6: [43.40, 6.24],
}

const TABELA_JADLOG = {
    1: [11.20, 0.96],
    2: [13.00, 1.44],
    3: [15.40, 2.00],
    4: [17.85, 2.40],
    5: [21.00, 3.04],
    6: [25.20, 3.60],
}

const TABELA_BRASPRESS = {
    1: [17.50, 0.72],
    2: [21.00, 1.20],
    3: [25.20, 1.60],
    4: [28.00, 1.84],
    5: [31.50, 2.24],
    6: [36.40, 2.80],
}


const PRAZOS = {
    pac:       { 1: [5, 7],  2: [6, 9],   3: [8, 12],  4: [9, 14],  5: [12, 18], 6: [15, 22] },
    sedex:     { 1: [1, 2],  2: [2, 3],   3: [3, 5],   4: [3, 5],   5: [4, 7],   6: [5, 9] },
    jadlog:    { 1: [3, 5],  2: [4, 7],   3: [6, 9],   4: [6, 10],  5: [8, 13],  6: [10, 16] },
    braspress: { 1: [4, 7],  2: [5, 8],   3: [7, 11],  4: [7, 12],  5: [9, 15],  6: [12, 18] },
}



export function calcularPesoCubagem(itens) {
    let pesoTotalG = 0
    let volumeTotalMM3 = 0

    
    let maiorComprimento = 0
    let maiorLargura = 0
    let alturaAcumulada = 0

    for (const item of itens) {
        const v = item.product_variants || item
        const qty = item.quantity || 1
        const peso = parseInt(v.weight_grams || 300) * qty
        const altura = parseInt(v.height_mm || 100)
        const largura = parseInt(v.width_mm || 100)
        const comprimento = parseInt(v.length_mm || 100)

        pesoTotalG += peso

        
        for (let i = 0; i < qty; i++) {
            alturaAcumulada += altura
            if (comprimento > maiorComprimento) maiorComprimento = comprimento
            if (largura > maiorLargura) maiorLargura = largura
        }

        volumeTotalMM3 += (altura * largura * comprimento) * qty
    }

    const pesoRealKg = pesoTotalG / 1000

    
    const alturaCm = alturaAcumulada / 10
    const larguraCm = maiorLargura / 10
    const comprimentoCm = maiorComprimento / 10

    const pesoCubagemCorreios = (comprimentoCm * larguraCm * alturaCm) / CONFIG_FRETE.fatorCubagemCorreios
    const pesoCubagemTransp = (comprimentoCm * larguraCm * alturaCm) / CONFIG_FRETE.fatorCubagemTransp

    return {
        pesoRealKg,
        pesoCubagemCorreios,
        pesoCubagemTransp,
        dimensoes: {
            alturaCm: Math.ceil(alturaCm),
            larguraCm: Math.ceil(larguraCm),
            comprimentoCm: Math.ceil(comprimentoCm),
        },
        volumeTotal: volumeTotalMM3,
    }
}



function calcularFreteLocal(cepDestino, dadosPeso) {
    const infoZona = obterZonaPorCEP(cepDestino)
    if (!infoZona) return []
    const zona = infoZona.zona
    const opcoes = []

    const { pesoRealKg, pesoCubagemCorreios, pesoCubagemTransp } = dadosPeso

    
    const pesoCorreios = Math.max(pesoRealKg, pesoCubagemCorreios, CONFIG_FRETE.pesoMinimoCorreios)
    const pesoTransp = Math.max(pesoRealKg, pesoCubagemTransp, CONFIG_FRETE.pesoMinimoJadlog)

    
    if (pesoCorreios <= CONFIG_FRETE.pesoMaximoCorreios) {
        const [base, porKg] = TABELA_CORREIOS_PAC[zona]
        const preco = base + (porKg * pesoCorreios)
        const [prazoMin, prazoMax] = PRAZOS.pac[zona]

        opcoes.push({
            id: 'pac',
            transportadora: 'Correios',
            servico: 'PAC',
            logo: 'correios',
            preco: arredondar(Math.max(preco, 17.50)),
            prazoMin: prazoMin + CONFIG_FRETE.prazoPreparacao,
            prazoMax: prazoMax + CONFIG_FRETE.prazoPreparacao,
            peso: arredondar(pesoCorreios),
            regiao: infoZona.regiao,
        })
    }

    
    if (pesoCorreios <= CONFIG_FRETE.pesoMaximoCorreios) {
        const [base, porKg] = TABELA_CORREIOS_SEDEX[zona]
        const preco = base + (porKg * pesoCorreios)
        const [prazoMin, prazoMax] = PRAZOS.sedex[zona]

        opcoes.push({
            id: 'sedex',
            transportadora: 'Correios',
            servico: 'SEDEX',
            logo: 'correios',
            preco: arredondar(Math.max(preco, 25.00)),
            prazoMin: prazoMin + CONFIG_FRETE.prazoPreparacao,
            prazoMax: prazoMax + CONFIG_FRETE.prazoPreparacao,
            peso: arredondar(pesoCorreios),
            regiao: infoZona.regiao,
        })
    }

    
    {
        const pesoJadlog = Math.max(pesoTransp, CONFIG_FRETE.pesoMinimoJadlog)
        const [base, porKg] = TABELA_JADLOG[zona]
        const preco = base + (porKg * pesoJadlog)
        const [prazoMin, prazoMax] = PRAZOS.jadlog[zona]

        opcoes.push({
            id: 'jadlog',
            transportadora: 'Jadlog',
            servico: 'Package',
            logo: 'jadlog',
            preco: arredondar(Math.max(preco, 16.00)),
            prazoMin: prazoMin + CONFIG_FRETE.prazoPreparacao,
            prazoMax: prazoMax + CONFIG_FRETE.prazoPreparacao,
            peso: arredondar(pesoJadlog),
            regiao: infoZona.regiao,
        })
    }

    
    if (pesoRealKg >= CONFIG_FRETE.pesoMinimoBraspress || pesoCubagemTransp >= CONFIG_FRETE.pesoMinimoBraspress) {
        const pesoBraspress = Math.max(pesoTransp, CONFIG_FRETE.pesoMinimoBraspress)
        const [base, porKg] = TABELA_BRASPRESS[zona]
        const preco = base + (porKg * pesoBraspress)
        const [prazoMin, prazoMax] = PRAZOS.braspress[zona]

        opcoes.push({
            id: 'braspress',
            transportadora: 'Braspress',
            servico: 'Rodoviário',
            logo: 'braspress',
            preco: arredondar(Math.max(preco, 25.00)),
            prazoMin: prazoMin + CONFIG_FRETE.prazoPreparacao,
            prazoMax: prazoMax + CONFIG_FRETE.prazoPreparacao,
            peso: arredondar(pesoBraspress),
            regiao: infoZona.regiao,
        })
    }

    
    opcoes.sort((a, b) => a.preco - b.preco)

    return opcoes
}



async function calcularFreteAPI(cepDestino, dadosPeso, itens) {
    try {
        const produtos = itens.map(item => {
            const v = item.product_variants || item
            return {
                width: Math.max(Math.ceil((parseInt(v.width_mm || 100)) / 10), 11),
                height: Math.max(Math.ceil((parseInt(v.height_mm || 100)) / 10), 2),
                length: Math.max(Math.ceil((parseInt(v.length_mm || 100)) / 10), 16),
                weight: Math.max((parseInt(v.weight_grams || 300)) / 1000, 0.3),
                insurance_value: parseFloat(v.price || 0),
                quantity: item.quantity || 1,
            }
        })

        const { data, error } = await supabase.functions.invoke('calcular-frete', {
            body: {
                cepOrigem: CONFIG_FRETE.cepOrigem,
                cepDestino: cepDestino.replace(/\D/g, ''),
                produtos,
            }
        })

        if (error) throw error
        if (data?.opcoes) return data.opcoes
        throw new Error('Resposta inválida da API')
    } catch (err) {
        console.warn('[Frete] Erro na API, usando cálculo local:', err.message)
        return null
    }
}



export async function calcularFrete(cepDestino, itensCarrinho) {
    const cep = cepDestino.replace(/\D/g, '')
    if (cep.length !== 8 || !validarCEP(cep)) {
        return { erro: 'CEP inválido. Verifique o número digitado.', opcoes: [] }
    }

    
    const dadosPeso = calcularPesoCubagem(itensCarrinho)

    
    const key = cacheKey(cep, dadosPeso.pesoRealKg, dadosPeso.pesoCubagemCorreios)
    const cached = _cache.get(key)
    if (cached && (Date.now() - cached.ts < CACHE_TTL)) {
        return { opcoes: cached.opcoes, dadosPeso, cache: true }
    }

    let opcoes = null

    if (CONFIG_FRETE.usarAPI) {
        opcoes = await calcularFreteAPI(cep, dadosPeso, itensCarrinho)
    }

    // Se a API falhar, retorna erro e não usa cálculo local
    if (!opcoes) {
        return { erro: 'Não foi possível calcular o frete no momento. Tente novamente mais tarde.', opcoes: [] }
    }

    _cache.set(key, { opcoes, ts: Date.now() })
    return { opcoes, dadosPeso }
}



let _freteSelecionado = null

export function renderizarOpcoesFrete(container, opcoes, onSelect) {
    if (!opcoes || opcoes.length === 0) {
        container.innerHTML = `
            <div class="frete-erro">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <p>Não foi possível calcular o frete para este CEP.</p>
            </div>
        `
        return
    }

    
    const logos = {
        correios: '<i class="fa-solid fa-envelope"></i>',
        jadlog: '<i class="fa-solid fa-truck"></i>',
        braspress: '<i class="fa-solid fa-truck-moving"></i>',
    }

    container.innerHTML = opcoes.map((op, idx) => `
        <label class="frete-opcao ${idx === 0 ? 'selecionada' : ''}" data-idx="${idx}">
            <input type="radio" name="freteOpcao" value="${idx}" ${idx === 0 ? 'checked' : ''}>
            <div class="frete-opcao-logo ${op.logo}">
                ${logos[op.logo] || '<i class="fa-solid fa-box"></i>'}
            </div>
            <div class="frete-opcao-info">
                <strong>${escapeHtml(op.transportadora)} ${escapeHtml(op.servico)}</strong>
                <span class="frete-opcao-prazo">
                    <i class="fa-regular fa-clock"></i> ${op.prazoMin}-${op.prazoMax} dias úteis
                </span>
            </div>
            <div class="frete-opcao-preco">
                R$ ${formatarPreco(op.preco)}
            </div>
        </label>
    `).join('')

    
    _freteSelecionado = opcoes[0]
    if (onSelect) onSelect(opcoes[0])

    
    container.querySelectorAll('input[name="freteOpcao"]').forEach(radio => {
        radio.addEventListener('change', () => {
            container.querySelectorAll('.frete-opcao').forEach(el => el.classList.remove('selecionada'))
            radio.closest('.frete-opcao').classList.add('selecionada')

            const idx = parseInt(radio.value)
            _freteSelecionado = opcoes[idx]
            if (onSelect) onSelect(opcoes[idx])
        })
    })
}

export function getOpcaoFreteSelecionada() {
    return _freteSelecionado
}

export function limparFreteSelecionado() {
    _freteSelecionado = null
}



export function mostrarFreteLoading(container) {
    container.innerHTML = `
        <div class="frete-loading">
            <div class="spinner-sm"></div>
            <p>Calculando frete para seu endereço...</p>
        </div>
    `
}



function arredondar(v) {
    return Math.round(v * 100) / 100
}
