import { supabase, toast, openModal, closeModal, esc } from './admin-state.js'

const IMAGE_SETTINGS = {
    heroHome: {
        configPath: 'site/home-hero.json',
        fallbackImage: '../img/imagemExemplo.jpg',
        folder: 'site/hero',
        modalId: 'modalHeroHome',
        formId: 'formHeroHome',
        openButtonId: 'btnEditarHeroHome',
        urlInputId: 'heroHomeImagemUrl',
        fileInputId: 'inputHeroHomeImagem',
        previewId: 'heroHomeImagemPreview',
        removeButtonId: 'btnRemoverHeroHome',
        saveButtonId: 'btnSalvarHeroHome',
        defaultToast: 'Imagem inicial voltou para o padrao.',
        successToast: 'Imagem inicial atualizada!',
        globalOpenName: 'adminAbrirHeroHome',
        boundDataset: 'heroBound'
    },
    sobre: {
        configPath: 'site/about-image.json',
        fallbackImage: '../img/imagemExemplo.jpg',
        folder: 'site/about',
        modalId: 'modalSobreImagem',
        formId: 'formSobreImagem',
        openButtonId: 'btnEditarSobreImagem',
        urlInputId: 'sobreImagemUrl',
        fileInputId: 'inputSobreImagem',
        previewId: 'sobreImagemPreview',
        removeButtonId: 'btnRemoverSobreImagem',
        saveButtonId: 'btnSalvarSobreImagem',
        defaultToast: 'Imagem da pagina Sobre voltou para o padrao.',
        successToast: 'Imagem da pagina Sobre atualizada!',
        globalOpenName: 'adminAbrirSobreImagem',
        boundDataset: 'imageBound'
    }
}

function getConfigUrl(setting) {
    const { data } = supabase.storage.from('products').getPublicUrl(setting.configPath)
    return data.publicUrl
}

async function carregarConfigImagem(setting) {
    try {
        const res = await fetch(`${getConfigUrl(setting)}?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return { image_url: '' }
        return await res.json()
    } catch (err) {
        console.warn('Configuracao de imagem nao encontrada:', err)
        return { image_url: '' }
    }
}

function atualizarPreviewImagem(setting, url) {
    const preview = document.getElementById(setting.previewId)
    if (!preview) return

    const src = url || setting.fallbackImage
    const label = url ? 'Imagem configurada' : 'Imagem padrao atual'
    preview.innerHTML = `
        <img src="${esc(src)}" alt="Preview da imagem">
        <small>${label}</small>
    `
}

async function abrirModalImagem(setting) {
    document.getElementById(setting.urlInputId).value = ''
    document.getElementById(setting.fileInputId).value = ''
    openModal(setting.modalId)
    atualizarPreviewImagem(setting, '')

    const config = await carregarConfigImagem(setting)
    const imageUrl = config?.image_url || ''
    document.getElementById(setting.urlInputId).value = imageUrl
    atualizarPreviewImagem(setting, imageUrl)
}

function initImagemAdmin(setting) {
    const btnEditar = document.getElementById(setting.openButtonId)
    const inputUrl = document.getElementById(setting.urlInputId)
    const inputFile = document.getElementById(setting.fileInputId)
    const btnRemover = document.getElementById(setting.removeButtonId)
    const form = document.getElementById(setting.formId)

    if (!btnEditar || !inputUrl || !inputFile || !btnRemover || !form) {
        console.warn('Controles de imagem nao encontrados no painel:', setting.openButtonId)
        return
    }

    window[setting.globalOpenName] = () => abrirModalImagem(setting)
    btnEditar.dataset[setting.boundDataset] = 'true'
    btnEditar.addEventListener('click', () => abrirModalImagem(setting))

    inputUrl.addEventListener('input', (e) => {
        atualizarPreviewImagem(setting, e.target.value.trim())
    })

    inputFile.addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (!file) {
            atualizarPreviewImagem(setting, inputUrl.value.trim())
            return
        }

        const reader = new FileReader()
        reader.onload = (ev) => atualizarPreviewImagem(setting, ev.target.result)
        reader.readAsDataURL(file)
    })

    btnRemover.addEventListener('click', async () => {
        inputUrl.value = ''
        inputFile.value = ''
        atualizarPreviewImagem(setting, '')
        try {
            await salvarConfigImagem(setting, '')
            toast(setting.defaultToast)
            closeModal(setting.modalId)
        } catch (err) {
            console.error('Erro ao remover imagem:', err)
        }
    })

    form.addEventListener('submit', (event) => salvarImagem(event, setting))
}

export function initHeroHomeAdmin() {
    initImagemAdmin(IMAGE_SETTINGS.heroHome)
    initImagemAdmin(IMAGE_SETTINGS.sobre)
}

async function salvarImagem(e, setting) {
    e.preventDefault()

    const btnSalvar = document.getElementById(setting.saveButtonId)
    const btnTextoOriginal = btnSalvar.innerHTML
    btnSalvar.disabled = true
    btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'

    try {
        const file = document.getElementById(setting.fileInputId).files[0]
        let imageUrl = document.getElementById(setting.urlInputId).value.trim()

        if (file) {
            const ext = file.name.split('.').pop() || 'jpg'
            const fileName = `${setting.folder}/${Date.now()}.${ext}`
            const { error: uploadError } = await supabase.storage.from('products').upload(fileName, file, { upsert: true })
            if (uploadError) {
                toast('Erro ao enviar imagem: ' + uploadError.message, 'erro')
                return
            }

            const { data: urlData } = supabase.storage.from('products').getPublicUrl(fileName)
            imageUrl = urlData.publicUrl
        }

        await salvarConfigImagem(setting, imageUrl)
        toast(setting.successToast)
        closeModal(setting.modalId)
    } catch (err) {
        console.error('Erro ao salvar imagem:', err)
        toast('Erro ao salvar imagem: ' + (err.message || err), 'erro')
    } finally {
        btnSalvar.disabled = false
        btnSalvar.innerHTML = btnTextoOriginal
    }
}

async function salvarConfigImagem(setting, imageUrl) {
    const config = {
        image_url: imageUrl || '',
        updated_at: new Date().toISOString()
    }

    const blob = new Blob([JSON.stringify(config)], { type: 'application/json' })
    const { error } = await supabase.storage.from('products').upload(setting.configPath, blob, {
        contentType: 'application/json',
        upsert: true
    })

    if (error) {
        toast('Erro ao salvar configuracao da imagem: ' + error.message, 'erro')
        throw error
    }
}
