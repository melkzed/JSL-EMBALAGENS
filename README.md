# JSL Soluções em Embalagens

E-commerce e site institucional da **JSL Soluções em Embalagens**, empresa de Itaporanga - PB
especializada em caixas de papelão, sacolas plásticas, embalagens para delivery, descartáveis e
produtos para empresas de todos os portes, com entrega para todo o Brasil.

O front-end é um site estático (HTML + CSS + JavaScript ES Modules, sem framework nem build step) e
o back-end é totalmente serverless, apoiado no **Supabase** (banco Postgres, autenticação, storage e
Edge Functions).

---

## Índice

- [Funcionalidades](#funcionalidades)
- [Stack tecnológica](#stack-tecnológica)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Rotas](#rotas)
- [Como executar localmente](#como-executar-localmente)
- [Back-end (Supabase)](#back-end-supabase)
- [Pagamentos](#pagamentos)
- [Acessibilidade e usabilidade](#acessibilidade-e-usabilidade)
- [SEO](#seo)
- [Deploy](#deploy)

---

## Funcionalidades

**Loja / cliente**
- Vitrine com categorias em destaque e produtos mais procurados.
- Catálogo com busca, filtros (categoria, faixa de preço, disponibilidade) e ordenação.
- Página de detalhe do produto com galeria, variantes, cálculo de frete, avaliações
  (com upload de imagens) e produtos semelhantes.
- Carrinho lateral (sidebar) e página de carrinho.
- Checkout em 3 etapas (endereço → revisão → confirmação), com entrega ou retirada na loja.
- Autenticação (login/cadastro), perfil com endereços, pedidos, favoritos, cartões e preferências.
- Modal de suporte que encaminha o atendimento para o WhatsApp.

**Administração**
- Painel administrativo (`/admin`) com dashboard, produtos, categorias, estoque, pedidos,
  pagamentos, entregas, avaliações, usuários, hero/preview do site e configurações fiscais.

## Stack tecnológica

| Camada        | Tecnologia                                                                 |
|---------------|-----------------------------------------------------------------------------|
| Front-end     | HTML5, CSS3 (modular via `@import`), JavaScript ES Modules (sem bundler)     |
| Animações     | [GSAP](https://gsap.com/) + ScrollTrigger                                    |
| Ícones        | Font Awesome 6                                                               |
| Back-end      | [Supabase](https://supabase.com/) — Postgres, Auth, Storage, Edge Functions |
| Edge Functions| Deno / TypeScript                                                           |
| Pagamentos    | PagSeguro (PagBank) e Mercado Pago                                           |
| Frete         | Integração de cálculo via Edge Function + ViaCEP para busca de endereço      |
| Hospedagem    | Servidor Apache (regras em `.htaccess`) atrás de HTTPS / Cloudflare          |

## Estrutura do projeto

```
JSL-EMBALAGENS/
├── index.html               # Página inicial (home)
├── checkout-retorno.html    # Retorno de pagamento
├── .htaccess                # Rotas limpas, HTTPS, cache, headers de segurança
├── robots.txt / sitemap.xml # SEO
├── favicon.ico
│
├── components/              # Fragmentos HTML injetados via fetch (navbar, footer)
│   ├── navbar.html
│   └── footer.html
│
├── html/                    # Demais páginas do site
│   ├── produtos.html        # Catálogo
│   ├── produto.html         # Detalhe do produto
│   ├── carrinho.html
│   ├── checkout.html
│   ├── perfil.html
│   ├── contato.html
│   ├── sobre.html
│   ├── politicas.html
│   ├── confirmar-email.html
│   └── pagbank-sandbox.html
│
├── css/                     # Estilos modulares (agregados por style.css)
│   ├── style.css            # Ponto de entrada — importa os demais
│   ├── global.css
│   ├── accessibility.css    # Foco visível, skip link, reduzir movimento
│   ├── navbar.css / footer.css / hero.css / ...
│
├── js/                      # Lógica do front-end (ES Modules)
│   ├── main.js              # Bootstrap: injeta componentes e inicializa tudo
│   ├── config.js            # Flags globais (ex.: rotas amigáveis)
│   ├── supabaseClient.js    # Cliente Supabase + chamada a Edge Functions
│   ├── menu.js / cart.js / auth.js / products.js / ...
│   └── ...
│
├── admin/                   # Painel administrativo (HTML/CSS/JS próprios)
│   ├── index.html / painel.html
│   ├── css/admin.css
│   └── js/admin-*.js
│
├── img/                     # Logos e imagens
└── supabase/                # Back-end
    ├── functions/           # Edge Functions (Deno/TypeScript)
    │   ├── calcular-frete/
    │   ├── create-preference/
    │   ├── mp-webhook/
    │   └── processar-pagamento-pagseguro/
    └── *.sql                # Políticas / RPCs
```

### Como as páginas são montadas

`navbar` e `footer` são fragmentos reutilizáveis em `components/`. Em cada página há dois
_placeholders_ vazios:

```html
<div id="navbar-placeholder"></div>
...
<div id="footer-placeholder"></div>
```

O `js/main.js` faz `fetch` desses fragmentos e os injeta no carregamento, além de inicializar menu,
carrinho, autenticação, animações, filtros e o carregamento de produtos/categorias a partir do
Supabase.

## Rotas

As rotas amigáveis são resolvidas pelo `.htaccess` (Apache). A flag
`window.__JSL_ENABLE_FRIENDLY_ROUTES__` em `js/config.js` faz o JS gerar links amigáveis apenas no
domínio de produção; em ambiente local os links continuam apontando para os arquivos `.html`.

| Rota amigável        | Arquivo                       |
|----------------------|-------------------------------|
| `/`                  | `index.html`                  |
| `/produtos`          | `html/produtos.html`          |
| `/produtos/{slug}`   | `html/produto.html?produto=…` |
| `/sobre`             | `html/sobre.html`             |
| `/contato`           | `html/contato.html`           |
| `/politicas`         | `html/politicas.html`         |
| `/carrinho`          | `html/carrinho.html`          |
| `/checkout`          | `html/checkout.html`          |
| `/perfil`            | `html/perfil.html`            |
| `/confirmar-email`   | `html/confirmar-email.html`   |
| `/checkout-retorno`  | `checkout-retorno.html`       |

## Como executar localmente

O projeto usa ES Modules e faz `fetch` de componentes, então **precisa ser servido por HTTP** (abrir
o `index.html` via `file://` não funciona).

```bash
# Opção 1 — Python
python3 -m http.server 8080

# Opção 2 — Node
npx serve .

# Opção 3 — extensão "Live Server" do VS Code
```

Depois acesse `http://localhost:8080`.

> Em ambiente local as rotas amigáveis do `.htaccess` não estão ativas — navegue pelos links do site
> (que apontam para os arquivos `.html`) ou acesse os arquivos diretamente em `/html/…`.

### Edge Functions (opcional)

Para rodar/deployar as funções serverless é necessário o [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase functions serve            # executa localmente
supabase functions deploy <nome>    # publica no projeto
```

## Back-end (Supabase)

- **Cliente:** configurado em `js/supabaseClient.js` (URL do projeto + chave anônima pública).
- **Edge Functions** (`supabase/functions/`):
  - `calcular-frete` — cálculo de frete.
  - `create-preference` — cria a preferência de pagamento no Mercado Pago.
  - `mp-webhook` — recebe notificações (webhook) do Mercado Pago.
  - `processar-pagamento-pagseguro` — processa pagamentos via PagSeguro/PagBank.
- **SQL** (`supabase/*.sql`) — políticas de RLS e RPCs para variantes de produtos no admin.

> A `apikey` presente em `supabaseClient.js` é a chave **anônima** pública do Supabase, protegida por
> Row Level Security (RLS) — não é um segredo. Chaves de serviço e tokens de pagamento ficam apenas
> nas variáveis de ambiente das Edge Functions.

## Pagamentos

- **PIX**, **cartão de crédito** e **cartão de débito** processados via PagSeguro/PagBank
  (SDK carregado em `assets.pagseguro.com.br`).
- **Mercado Pago** via preferências + webhook.
- **Combinar via WhatsApp** como alternativa manual no checkout.

## Acessibilidade e usabilidade

O projeto segue boas práticas de acessibilidade (WCAG). Principais pontos implementados:

- **Skip link** ("Pular para o conteúdo") em todas as páginas, com alvo `#conteudo`.
- **Landmark `<main id="conteudo">`** em cada página para leitores de tela e para o skip link.
- **Foco visível** por teclado (`:focus-visible`) em links, botões e campos — ver `css/accessibility.css`.
- **Navegação por teclado** nos controles do cabeçalho (carrinho, perfil, admin): expostos com
  `role="button"`, `tabindex` e ativação por Enter/Espaço; o menu mobile fecha com `Esc`.
- **Menu hambúrguer** com `aria-expanded` / `aria-controls`.
- **Ícones decorativos** (Font Awesome) marcados com `aria-hidden="true"`; ícones interativos têm
  `aria-label`.
- **Modais** (suporte) com `role="dialog"`, `aria-modal`, `aria-labelledby`, gestão de foco e
  fechamento por `Esc`.
- **`prefers-reduced-motion`**: animações e transições são reduzidas para quem sinaliza sensibilidade
  a movimento.
- **Formulários** com `<label>` associado, `autocomplete`, `type`/`inputmode` adequados e alvos de
  toque com no mínimo 40&nbsp;px.
- **`lang="pt-BR"`** e `alt` descritivo nas imagens de conteúdo.

## SEO

- Metatags primárias, **Open Graph** e **Twitter Cards** em todas as páginas públicas.
- **Schema.org / JSON-LD**: `Organization`, `LocalBusiness`, `WebSite`, `BreadcrumbList`, `FAQPage`,
  `CollectionPage`, `Product`, etc.
- URLs amigáveis, `canonical`, `robots.txt` e `sitemap.xml`.
- FAQ visível e indexável na home.

## Deploy

Hospedagem em servidor **Apache**. O `.htaccess` cuida de:

- Redirecionamento para **HTTPS** e host canônico (`www.`).
- **Rotas limpas** (URLs amigáveis).
- **Cache** de assets estáticos e _no-cache_ para HTML/CSS/JS.
- **Headers de segurança** (`X-Content-Type-Options`, `Referrer-Policy`) e bloqueio de pastas
  internas (`.git`, `supabase`, etc.) e arquivos sensíveis (`.env`, `.sql`, `.md`…).

Cada página também define uma **Content-Security-Policy** via `<meta http-equiv>`, restringindo as
origens de scripts, estilos, imagens e conexões.

---

## Contato

**JSL Soluções em Embalagens** — R. Francisco Guimarães, Centro, Itaporanga - PB, CEP 58780-000
📞 (83) 99638-9725 · ✉️ contato@jslsolucoesemembalagens.com · 🌐 https://www.jslembalagens.com.br
