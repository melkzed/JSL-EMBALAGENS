import { supabase, esc, formatDate, statusLabel } from './admin-state.js'

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

    tbody.innerHTML = nfs.map(n => `<tr>
        <td>${esc(n.invoice_number || '—')}</td>
        <td><strong>${esc(n.orders?.order_number || '—')}</strong></td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis"><small>${esc(n.access_key || '—')}</small></td>
        <td><span class="admin-badge ${n.status}">${statusLabel(n.status)}</span></td>
        <td>${formatDate(n.issued_at || n.created_at)}</td>
        <td>
            ${n.pdf_url ? `<a href="${esc(n.pdf_url)}" target="_blank" class="admin-btn small secondary"><i class="fa-solid fa-file-pdf"></i> PDF</a>` : ''}
            ${n.xml_url ? `<a href="${esc(n.xml_url)}" target="_blank" class="admin-btn small secondary"><i class="fa-solid fa-file-code"></i> XML</a>` : ''}
        </td>
    </tr>`).join('')
}
