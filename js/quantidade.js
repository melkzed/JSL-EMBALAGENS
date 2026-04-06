export function initQuantidade() {

    document.querySelectorAll(".quantidade").forEach(box => {
        const btnMais = box.querySelector(".mais")
        const btnMenos = box.querySelector(".menos")
        const numero = box.querySelector(".numero")
        const produtoCard = box.closest(".produto-card")
        const precoElemento = produtoCard?.querySelector(".preco")

        if (!precoElemento) return
        const parsePreco = texto => {
            const partes = texto
                .replace("R$", "")
                .replace("/und", "")
                .replace(/<[^>]+>/g, "")
                .trim()
            const valorNum = parseFloat(partes.replace(".", "").replace(",", "."))
            return isNaN(valorNum) ? 0 : valorNum
        }
        const formatarPreco = valor => {
            return valor.toFixed(2).replace('.', ',')
        }

        const precoUnitario = parsePreco(precoElemento.textContent)
        let totalElemento = produtoCard.querySelector(".total")

        if (!totalElemento) {
            totalElemento = document.createElement("span")
            totalElemento.className = "total"
            totalElemento.style.display = "block"
            totalElemento.style.margin = "0.15rem 0 0.5rem"
            totalElemento.style.fontWeight = "500"
            totalElemento.style.fontSize = "0.85rem"
            totalElemento.style.color = "#2c4dfc"
            precoElemento.insertAdjacentElement("afterend", totalElemento)
        }

        const atualizarTotal = () => {
            const quantidade = parseInt(numero.innerText) || 1
            const total = precoUnitario * quantidade
            totalElemento.innerText = `Total: R$ ${formatarPreco(total)}`
        }

        const mudarQuantidade = delta => {
            let valor = parseInt(numero.innerText) || 1
            let novoValor = valor + delta
            if (novoValor < 1) novoValor = 1
            numero.innerText = novoValor
            atualizarTotal()
        }

        if (btnMais && btnMenos && numero) {
            btnMais.addEventListener("click", () => mudarQuantidade(1))
            btnMenos.addEventListener("click", () => mudarQuantidade(-1))
            atualizarTotal()
        }
    })
}