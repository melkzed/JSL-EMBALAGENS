import { supabase } from '../../js/supabaseClient.js'

export { supabase }


export const state = {
    currentAdmin: null,
    senhaCallback: null,
    confirmarCallback: null,
    categoriasCache: [],
    variantesCache: [],
    carriersCache: [],
    rolesCache: []
}


export function toast(msg, tipo = 'sucesso') {
    const el = document.getElementById('adminToast')
    el.textContent = msg
    el.className = `admin-toast ${tipo}`
    el.style.display = 'block'
    setTimeout(() => el.style.display = 'none', 3500)
}

export function esc(str) {
    if (!str) return ''
    const d = document.createElement('div')
    d.textContent = str
    return d.innerHTML
}

export function formatPrice(v) {
    return parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('pt-BR')
}

export function formatDateTime(d) {
    if (!d) return '—'
    return new Date(d).toLocaleString('pt-BR')
}

export function slugify(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function toTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
}

export function statusLabel(s) {
    const map = {
        pending: 'Pendente', paid: 'Pago', preparing: 'Em Preparação',
        shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado',
        refunded: 'Reembolsado', processing: 'Processando', approved: 'Aprovado',
        refused: 'Recusado', issued: 'Emitida', in_transit: 'Em Trânsito',
        out_for_delivery: 'Saiu p/ Entrega', returned: 'Devolvido'
    }
    return map[s] || s
}

export function metodoLabel(m) {
    const map = { pix: 'PIX', credit_card: 'Cartão Crédito', debit_card: 'Cartão Débito', boleto: 'Boleto', transfer: 'Transferência' }
    return map[m] || m
}

export function tipoMovLabel(t) {
    const map = { entry: 'Entrada', exit: 'Saída', adjustment: 'Ajuste', reservation: 'Reserva', return: 'Devolução' }
    return map[t] || t
}

export function openModal(id) { document.getElementById(id).style.display = 'flex' }
export function closeModal(id) {
    document.getElementById(id).style.display = 'none'
    const senhaInput = document.getElementById('inputSenhaConfirmacao')
    if (senhaInput) senhaInput.value = ''
    const senhaErro = document.getElementById('senhaErro')
    if (senhaErro) senhaErro.style.display = 'none'
}

export function pedirSenha(titulo, msg, callback) {
    document.getElementById('modalSenhaTitulo').textContent = titulo
    document.getElementById('modalSenhaMsg').textContent = msg
    state.senhaCallback = callback
    openModal('modalSenha')
    document.getElementById('inputSenhaConfirmacao').focus()
}

export function confirmar(msg) {
    return new Promise(resolve => {
        const overlay = document.getElementById('modalConfirmar')
        document.getElementById('modalConfirmarMsg').textContent = msg
        state.confirmarCallback = resolve
        overlay.style.display = 'flex'
    })
}

export function debounce(fn, ms) {
    let timer
    return (...args) => {
        clearTimeout(timer)
        timer = setTimeout(() => fn(...args), ms)
    }
}
