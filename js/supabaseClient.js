
const supabaseUrl = 'https://otwmjdiqjhumqvyztnbl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90d21qZGlxamh1bXF2eXp0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTU3NTUsImV4cCI6MjA5MDA3MTc1NX0.1syGgZJNqoax0z-E5dWcTtm5g47xDUdFa3U7lttxZz4'

if (!window.supabase) {
    console.error('Supabase JS não carregou. Verifique sua conexão de internet.')
}

export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)