export function initWhatsapp() {
    const btn = document.querySelector(".whatsapp-float")
    if (btn) {
        btn.addEventListener("click", (event) => {
            event.preventDefault()
            const numero = "5583996389725"
            const mensagem = "Ola! Vim pelo site da JSL Solucoes em Embalagens."
            window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener,noreferrer")
        })
    }

    initContatoWhatsapp()
}

function initContatoWhatsapp() {
    const form = document.querySelector(".ct-form")
    if (!form) return

    const nome = document.getElementById("contatoNome")
    const telefone = document.getElementById("contatoTelefone")
    const email = document.getElementById("contatoEmail")
    const mensagem = document.getElementById("contatoMensagem")

    form.addEventListener("submit", (event) => {
        event.preventDefault()

        const partes = [
            "Ola! Vim pelo site da JSL Solucoes em Embalagens e gostaria de solicitar um orcamento.",
            nome?.value.trim() ? `Nome: ${nome.value.trim()}` : "",
            telefone?.value.trim() ? `Telefone: ${telefone.value.trim()}` : "",
            email?.value.trim() ? `E-mail: ${email.value.trim()}` : "",
            mensagem?.value.trim() ? `Mensagem: ${mensagem.value.trim()}` : ""
        ].filter(Boolean)

        const numero = "5583996389725"
        const texto = partes.join("\n")
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer")
    })
}
