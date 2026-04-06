export function initWhatsapp() {
    const btn = document.querySelector(".whatsapp-float")
    if(btn){
        btn.addEventListener("click", () => {
            const numero = "5583996389725"
            const mensagem = "Olá! Vim pelo site da JSL Soluções em Embalagens."
            window.open(`https://wa.me/${numero}?text=${mensagem}`)
        })
    }
}