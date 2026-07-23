const supabaseUrl = 'https://otwmjdiqjhumqvyztnbl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90d21qZGlxamh1bXF2eXp0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTU3NTUsImV4cCI6MjA5MDA3MTc1NX0.1syGgZJNqoax0z-E5dWcTtm5g47xDUdFa3U7lttxZz4'

// Aguarda o SDK do Supabase carregar (pode vir com defer antes dos módulos ES)
function waitForSupabase(timeout = 8000) {
    return new Promise((resolve, reject) => {
        if (window.supabase) return resolve()
        const start = Date.now()
        const interval = setInterval(() => {
            if (window.supabase) {
                clearInterval(interval)
                resolve()
            } else if (Date.now() - start > timeout) {
                clearInterval(interval)
                reject(new Error('Supabase JS não carregou. Verifique sua conexão de internet.'))
            }
        }, 50)
    })
}

// Exibe um aviso acessível caso o SDK do Supabase não carregue, evitando que
// spinners (carrinho, checkout, produtos) fiquem travados sem feedback.
function mostrarErroConexao() {
    const render = () => {
        if (document.getElementById('jslErroConexao')) return
        const banner = document.createElement('div')
        banner.id = 'jslErroConexao'
        banner.setAttribute('role', 'alert')
        banner.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:100000;background:#b91c1c;color:#fff;' +
            'padding:12px 16px;text-align:center;font:600 14px/1.4 Arial,sans-serif;' +
            'box-shadow:0 2px 10px rgba(0,0,0,.2);display:flex;gap:10px;align-items:center;justify-content:center'
        banner.innerHTML =
            '<span>Não foi possível conectar aos nossos servidores. Verifique sua internet e recarregue a página.</span>' +
            '<button type="button" style="background:#fff;color:#b91c1c;border:none;border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer">Recarregar</button>'
        banner.querySelector('button').addEventListener('click', () => location.reload())
        document.body ? document.body.prepend(banner) : document.documentElement.appendChild(banner)
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render, { once: true })
    } else {
        render()
    }
}

try {
    await waitForSupabase()
} catch (err) {
    mostrarErroConexao()
    throw err
}

export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)
export const supabaseAnonKey = supabaseKey

export function getPublicFunctionHeaders() {
    return {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
    }
}

// Chama uma Edge Function usando fetch direto (sem o SDK do Supabase),
// evitando que o JWT da sessão do usuário sobrescreva o Authorization header
// e cause erro 403 em funções com verify_jwt=false.
export async function invokeFunctionPublic(functionName, body) {
    const url = `${supabaseUrl}/functions/v1/${functionName}`
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok && res.status >= 500) {
        throw new Error(data?.errors?.[0] || `Erro interno (HTTP ${res.status})`)
    }
    return { data, error: null }
}