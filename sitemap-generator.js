/**
 * JSL Embalagens - gerador automatico de sitemap.xml
 *
 * Execute:
 *   node sitemap-generator.js
 *
 * Usa fetch nativo do Node 18+ e a chave anon publica do projeto.
 * Tambem aceita sobrescrita via variaveis de ambiente:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, BASE_URL
 */

import { writeFileSync } from 'fs'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://otwmjdiqjhumqvyztnbl.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
    || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90d21qZGlxamh1bXF2eXp0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTU3NTUsImV4cCI6MjA5MDA3MTc1NX0.1syGgZJNqoax0z-E5dWcTtm5g47xDUdFa3U7lttxZz4'
const BASE_URL = (process.env.BASE_URL || 'https://www.jslembalagens.com.br').replace(/\/+$/, '')

function hojeISO() {
    return new Date().toISOString().split('T')[0]
}

function xmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

async function buscarProdutosAtivos() {
    const url = new URL('/rest/v1/products', SUPABASE_URL)
    url.searchParams.set('select', 'slug,updated_at')
    url.searchParams.set('active', 'eq.true')
    url.searchParams.set('order', 'updated_at.desc')

    const response = await fetch(url, {
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
    })

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Erro ao buscar produtos no Supabase: HTTP ${response.status} ${body}`)
    }

    return response.json()
}

async function gerarSitemap() {
    const hoje = hojeISO()
    const produtos = await buscarProdutosAtivos()

    const paginasEstaticas = [
        { loc: '/', changefreq: 'weekly', priority: '1.0', lastmod: hoje },
        { loc: '/produtos', changefreq: 'daily', priority: '0.9', lastmod: hoje },
        { loc: '/sobre', changefreq: 'monthly', priority: '0.7', lastmod: hoje },
        { loc: '/contato', changefreq: 'monthly', priority: '0.8', lastmod: hoje },
        { loc: '/politicas', changefreq: 'yearly', priority: '0.4', lastmod: hoje },
    ]

    const urlsProdutos = (produtos || [])
        .filter((produto) => produto.slug)
        .map((produto) => ({
            loc: `/produtos/${encodeURIComponent(produto.slug)}`,
            changefreq: 'weekly',
            priority: '0.85',
            lastmod: produto.updated_at ? produto.updated_at.split('T')[0] : hoje,
        }))

    const todasUrls = [...paginasEstaticas, ...urlsProdutos]

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${todasUrls.map((url) => `  <url>
    <loc>${xmlEscape(BASE_URL + url.loc)}</loc>
    <lastmod>${xmlEscape(url.lastmod)}</lastmod>
    <changefreq>${xmlEscape(url.changefreq)}</changefreq>
    <priority>${xmlEscape(url.priority)}</priority>
  </url>`).join('\n')}
</urlset>
`

    writeFileSync('./sitemap.xml', xml, 'utf8')
    console.log(`sitemap.xml gerado com ${todasUrls.length} URLs (${urlsProdutos.length} produtos).`)
}

gerarSitemap().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
})
