import { supabase, esc, formatPrice, toTitleCase, openModal } from './admin-state.js'

export function gerarPreviewProduto() {
    const nome = document.getElementById('produtoNome').value.trim() || 'Nome do Produto'
    const descricao = document.getElementById('produtoDescricao').value.trim()
    const catSelect = document.getElementById('produtoCategoria')
    const categoriaNome = catSelect.options[catSelect.selectedIndex]?.text || ''

    
    const variantRows = document.querySelectorAll('#variantesContainer .admin-variant-row')
    const variantes = []
    variantRows.forEach((row, idx) => {
        const label = row.querySelector('.v-size').value.trim() || `Variante ${idx + 1}`
        const price = parseFloat(row.querySelector('.v-price').value) || 0
        const compare = parseFloat(row.querySelector('.v-compare').value) || 0
        const stock = parseInt(row.querySelector('.v-stock').value) || 0
        variantes.push({ label, price, compare, stock })
    })

    
    let imgSrc = ''
    const previewImgs = document.querySelectorAll('#imagensPreview img')
    if (previewImgs.length > 0) {
        imgSrc = previewImgs[0].src
    } else {
        const existingImgs = document.querySelectorAll('#imagensContainer img')
        if (existingImgs.length > 0) imgSrc = existingImgs[0].src
    }

    
    const specInputs = document.querySelectorAll('#specsContainer .spec-value')
    const specsMap = {}
    specInputs.forEach(input => {
        const varIdx = parseInt(input.dataset.variantIdx)
        const specLabel = input.closest('.admin-spec-row, div[style]')?.querySelector('label')?.textContent || ''
        const val = input.value.trim()
        if (val) {
            if (!specsMap[varIdx]) specsMap[varIdx] = []
            specsMap[varIdx].push({ name: specLabel, value: val })
        }
    })

    
    const v0 = variantes[0] || { label: '—', price: 0, compare: 0, stock: 0 }

    
    let stockClass = 'verde', stockText = `Em estoque (${v0.stock} un.)`
    if (v0.stock <= 0) { stockClass = 'vermelho'; stockText = 'Fora de estoque' }
    else if (v0.stock <= 10) { stockClass = 'amarelo'; stockText = `Poucas unidades (${v0.stock})` }

    
    let priceHtml = `<div class="pv-price">${formatPrice(v0.price)}</div>`
    if (v0.compare > v0.price) {
        const desc = Math.round((1 - v0.price / v0.compare) * 100)
        priceHtml = `
            <div class="pv-price">${formatPrice(v0.price)} <span style="font-size:0.8rem;text-decoration:line-through;color:#9ca3af;font-weight:400;margin-left:6px">${formatPrice(v0.compare)}</span> <span class="pv-badge">-${desc}%</span></div>
        `
    }
    priceHtml += `<div class="pv-price-info">Preço unitário • Consulte descontos por quantidade</div>`

    
    const varBtns = variantes.map((v, i) =>
        `<span class="pv-variant-btn${i === 0 ? ' ativa' : ''}">${esc(v.label)}</span>`
    ).join('')

    
    let specsHtml = ''
    const specs0 = specsMap[0]
    if (specs0 && specs0.length) {
        specsHtml = `
            <div class="pv-specs">
                <h4>Informações Técnicas</h4>
                ${specs0.map(s => `
                    <div class="pv-spec-row">
                        <div class="pv-spec-label">${esc(s.name)}</div>
                        <div class="pv-spec-value">${esc(s.value)}</div>
                    </div>
                `).join('')}
            </div>
        `
    }

    const body = document.getElementById('previewProdutoBody')
    body.innerHTML = `
        <div class="admin-preview-product">
            <div class="pv-top">
                <div class="pv-gallery">
                    ${imgSrc ? `<img src="${imgSrc}" alt="Preview">` : '<div class="pv-no-img"><i class="fa-solid fa-image" style="font-size:2rem;display:block;margin-bottom:0.5rem"></i>Sem imagem</div>'}
                </div>
                <div>
                    ${categoriaNome ? `<span class="pv-category">${esc(categoriaNome)}</span>` : ''}
                    <h2 class="pv-name">${esc(toTitleCase(nome))}</h2>
                    ${descricao ? `<p class="pv-desc">${esc(descricao)}</p>` : ''}
                    ${priceHtml}
                    ${variantes.length > 1 ? `<div class="pv-variants">${varBtns}</div>` : ''}
                    <div class="pv-stock ${stockClass}"><i class="fa-solid fa-circle" style="font-size:0.5rem;vertical-align:middle;margin-right:4px"></i>${stockText}</div>
                    <button class="pv-btn-cart"><i class="fa-solid fa-cart-plus"></i> Adicionar ao Carrinho</button>
                </div>
            </div>
            ${specsHtml}
        </div>
    `

    openModal('modalPreviewProduto')
}
