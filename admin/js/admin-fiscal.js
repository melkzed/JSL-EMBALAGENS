import { supabase, esc, formatDate, statusLabel } from './admin-state.js'

function isSafeHttpUrl(url) {
    if (!url) return false
    try {
        const parsed = new URL(url, window.location.origin)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}

export async function carregarFiscal() {
    const filtro = document.getElementById('filtroFiscalStatus').value

    let query = supabase
        .from('invoices')
        .select('*, orders(order_number)')
        .order('created_at', { ascending: false })

    if (filtro) query = query.eq('status', filtro)

    const { data: nfs } = await query

    const tbody = document.getElementById('tbodyFiscal')
    if (!nfs || nfs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Nenhuma nota fiscal</td></tr>'
        return
    }

    tbody.innerHTML = nfs.map(n => {
        const pdfUrl = isSafeHttpUrl(n.pdf_url) ? esc(n.pdf_url) : ''
        const xmlUrl = isSafeHttpUrl(n.xml_url) ? esc(n.xml_url) : ''

        return `<tr>
        <td>${esc(n.invoice_number || '—')}</td>
        <td><strong>${esc(n.orders?.order_number || '—')}</strong></td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis"><small>${esc(n.access_key || '—')}</small></td>
        <td><span class="admin-badge ${n.status}">${statusLabel(n.status)}</span></td>
        <td>${formatDate(n.issued_at || n.created_at)}</td>
        <td>
            ${pdfUrl ? `<a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" class="admin-btn small secondary"><i class="fa-solid fa-file-pdf"></i> PDF</a>` : ''}
            ${xmlUrl ? `<a href="${xmlUrl}" target="_blank" rel="noopener noreferrer" class="admin-btn small secondary"><i class="fa-solid fa-file-code"></i> XML</a>` : ''}
        </td>
    </tr>`
    }).join('')
}
