/**
 * JSL Embalagens — Gerador automático de sitemap.xml
 * 
 * Execute no terminal do servidor ou via Node.js:
 *   node sitemap-generator.js
 * 
 * Requer: @supabase/supabase-js instalado
 *   npm install @supabase/supabase-js
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const SUPABASE_URL = 'https://otwmjdiqjhumqvyztnbl.supabase.co'
const SUPABASE_KEY = 'SUA_CHAVE_ANON_AQUI'   // use a chave anon pública
const BASE_URL     = 'https://www.jslembalagens.com.br'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function gerarSitemap() {
  const { data: produtos, error } = await supabase
    .from('products')
    .select('slug, updated_at')
    .eq('active', true)

  if (error) {
    console.error('Erro ao buscar produtos:', error)
    process.exit(1)
  }

  const paginasEstaticas = [
    { loc: '/',         changefreq: 'weekly',  priority: '1.0', lastmod: new Date().toISOString().split('T')[0] },
    { loc: '/produtos', changefreq: 'daily',   priority: '0.9', lastmod: new Date().toISOString().split('T')[0] },
    { loc: '/sobre',    changefreq: 'monthly', priority: '0.7', lastmod: new Date().toISOString().split('T')[0] },
    { loc: '/contato',  changefreq: 'monthly', priority: '0.8', lastmod: new Date().toISOString().split('T')[0] },
    { loc: '/politicas',changefreq: 'yearly',  priority: '0.4', lastmod: new Date().toISOString().split('T')[0] },
  ]

  const urlsProdutos = (produtos || []).map(p => ({
    loc:        `/produtos/${p.slug}`,
    changefreq: 'weekly',
    priority:   '0.85',
    lastmod:    p.updated_at ? p.updated_at.split('T')[0] : new Date().toISOString().split('T')[0]
  }))

  const todasUrls = [...paginasEstaticas, ...urlsProdutos]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${todasUrls.map(u => `  <url>
    <loc>${BASE_URL}${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  writeFileSync('./sitemap.xml', xml, 'utf8')
  console.log(`✅ sitemap.xml gerado com ${todasUrls.length} URLs (${urlsProdutos.length} produtos)`)
}

gerarSitemap()
