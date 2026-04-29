import { supabase, toast, openModal, closeModal, esc } from './admin-state.js'

const HERO_CONFIG_PATH = 'site/home-hero.json'
const HERO_FALLBACK_IMAGE = '../img/imagemExemplo.jpg'

function getHeroConfigUrl() {
    const { data } = supabase.storage.from('products').getPublicUrl(HERO_CONFIG_PATH)
    return data.publicUrl
}

async function carregarConfigHero() {
    try {
        const res = await fetch(`${getHeroConfigUrl()}?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return { image_url: '' }
        return await res.json()
    } catch (err) {
        console.warn('Configuracao do hero nao encontrada:', err)
        return { image_url: '' }
    }
}

function atualizarPreviewHero(url) {
    const preview = document.getElementById('heroHomeImagemPreview')
    if (!preview) return

    const src = url || HERO_FALLBACK_IMAGE
    const label = url ? 'Imagem configurada' : 'Imagem padrao atual'
    preview.innerHTML = `
        <img src="${esc(src)}" alt="Preview da imagem inicial">
        <small>${label}</small>
    `
}

export async function abrirModalHeroHome() {
    document.getElementById('heroHomeImagemUrl').value = ''
    document.getElementById('inputHeroHomeImagem').value = ''
    openModal('modalHeroHome')
    atualizarPreviewHero('')

    const config = await carregarConfigHero()
    const imageUrl = config?.image_url || ''
    document.getElementById('heroHomeImagemUrl').value = imageUrl
    atualizarPreviewHero(imageUrl)
}

export function initHeroHomeAdmin() {
    const btnEditar = document.getElementById('btnEditarHeroHome')
    const inputUrl = document.getElementById('heroHomeImagemUrl')
    const inputFile = document.getElementById('inputHeroHomeImagem')
    const btnRemover = document.getElementById('btnRemoverHeroHome')
    const form = document.getElementById('formHeroHome')

    if (!btnEditar || !inputUrl || !inputFile || !btnRemover || !form) {
        console.warn('Controles da imagem inicial nao encontrados no painel.')
        return
    }

    window.adminAbrirHeroHome = abrirModalHeroHome
    btnEditar.dataset.heroBound = 'true'
    btnEditar.addEventListener('click', abrirModalHeroHome)

    inputUrl.addEventListener('input', (e) => {
        atualizarPreviewHero(e.target.value.trim())
    })

    inputFile.addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (!file) {
            atualizarPreviewHero(inputUrl.value.trim())
            return
        }

        const reader = new FileReader()
        reader.onload = (ev) => atualizarPreviewHero(ev.target.result)
        reader.readAsDataURL(file)
    })

    btnRemover.addEventListener('click', async () => {
        inputUrl.value = ''
        inputFile.value = ''
        atualizarPreviewHero('')
        try {
            await salvarConfigHero('')
            toast('Imagem inicial voltou para o padrao.')
            closeModal('modalHeroHome')
        } catch (err) {
            console.error('Erro ao remover imagem inicial:', err)
        }
    })

    form.addEventListener('submit', salvarHeroHome)
}

async function salvarHeroHome(e) {
    e.preventDefault()

    const btnSalvar = document.getElementById('btnSalvarHeroHome')
    const btnTextoOriginal = btnSalvar.innerHTML
    btnSalvar.disabled = true
    btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'

    try {
        const file = document.getElementById('inputHeroHomeImagem').files[0]
        let imageUrl = document.getElementById('heroHomeImagemUrl').value.trim()

        if (file) {
            const ext = file.name.split('.').pop() || 'jpg'
            const fileName = `site/hero/${Date.now()}.${ext}`
            const { error: uploadError } = await supabase.storage.from('products').upload(fileName, file, { upsert: true })
            if (uploadError) {
                toast('Erro ao enviar imagem: ' + uploadError.message, 'erro')
                return
            }

            const { data: urlData } = supabase.storage.from('products').getPublicUrl(fileName)
            imageUrl = urlData.publicUrl
        }

        await salvarConfigHero(imageUrl)
        toast('Imagem inicial atualizada!')
        closeModal('modalHeroHome')
    } catch (err) {
        console.error('Erro ao salvar imagem inicial:', err)
        toast('Erro ao salvar imagem inicial: ' + (err.message || err), 'erro')
    } finally {
        btnSalvar.disabled = false
        btnSalvar.innerHTML = btnTextoOriginal
    }
}

async function salvarConfigHero(imageUrl) {
    const config = {
        image_url: imageUrl || '',
        updated_at: new Date().toISOString()
    }

    const blob = new Blob([JSON.stringify(config)], { type: 'application/json' })
    const { error } = await supabase.storage.from('products').upload(HERO_CONFIG_PATH, blob, {
        contentType: 'application/json',
        upsert: true
    })

    if (error) {
        toast('Erro ao salvar configuracao da imagem: ' + error.message, 'erro')
        throw error
    }
}
