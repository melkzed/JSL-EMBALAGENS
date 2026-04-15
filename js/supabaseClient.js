const supabaseUrl = 'https://otwmjdiqjhumqvyztnbl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90d21qZGlxamh1bXF2eXp0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTU3NTUsImV4cCI6MjA5MDA3MTc1NX0.1syGgZJNqoax0z-E5dWcTtm5g47xDUdFa3U7lttxZz4'

// Aguarda o SDK do Supabase carregar (pode vir com defer antes dos módulos ES)
function waitForSupabase(timeout = 5000) {
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

await waitForSupabase()

export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)