
export function initAnimacoes() {
    if (typeof gsap === 'undefined') return

    gsap.registerPlugin(ScrollTrigger)

    
    const gradientTexts = document.querySelectorAll('.hero-gradient-text')
    if (gradientTexts.length > 0) {
        gradientTexts.forEach((el, i) => {
            gsap.fromTo(el,
                { backgroundPosition: '0% 50%' },
                {
                    backgroundPosition: '100% 50%',
                    duration: 6,
                    ease: 'none',
                    repeat: -1,
                    yoyo: true,
                    delay: i * 0.3
                }
            )
        })
    }

    
    const heroTag = document.querySelector('.hero-tag')
    const heroH1 = document.querySelector('.hero-text h1')
    const heroP = document.querySelector('.hero-text > p')
    const heroBtns = document.querySelector('.hero-buttons')
    const heroImg = document.querySelector('.hero-image-wrapper')
    const heroStats = document.querySelector('.hero-stats')

    if (heroTag) {
        const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        heroTl
            .from(heroTag, { y: 20, opacity: 0, duration: 0.6 })
            .from(heroH1, { y: 30, opacity: 0, duration: 0.7 }, '-=0.3')
            .from(heroP, { y: 20, opacity: 0, duration: 0.5 }, '-=0.3')
            .from(heroBtns, { y: 20, opacity: 0, duration: 0.5 }, '-=0.2')
            .from(heroImg, { x: 60, opacity: 0, duration: 0.8 }, '-=0.6')
            .from('.hero-badge-quality', { scale: 0, opacity: 0, duration: 0.4, ease: 'back.out(1.7)' }, '-=0.3')
            .from('.hero-badge-delivery', { y: 20, opacity: 0, duration: 0.4 }, '-=0.2')
            .from(heroStats, { y: 20, opacity: 0, duration: 0.5 }, '-=0.2')
            .from('.hero-scroll-wrapper', { opacity: 0, duration: 0.4 }, '-=0.1')
    }

    
    const scrollArrow = document.getElementById('heroScrollArrow')
    if (scrollArrow) {
        gsap.to(scrollArrow, {
            y: 8,
            duration: 1.2,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true
        })
    }


    gsap.utils.toArray('.produto-card, .categoria-card, .beneficio-card').forEach(el => {
        gsap.from(el, {
            y: 40,
            opacity: 0,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: el,
                start: 'top 85%',
                toggleActions: 'play none none none'
            }
        })
    })

    
    gsap.utils.toArray('.categoria-card, .beneficio-card, .qs-card, .qs-valor-card').forEach(el => {
        el.addEventListener('mouseenter', () => {
            gsap.to(el, { y: -5, duration: 0.2, ease: 'power2.out' })
        })
        el.addEventListener('mouseleave', () => {
            gsap.to(el, { y: 0, duration: 0.2, ease: 'power2.out' })
        })
    })

    
    gsap.utils.toArray('.qs-card, .qs-valor-card').forEach(el => {
        gsap.from(el, {
            y: 40,
            opacity: 0,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: el,
                start: 'top 85%',
                toggleActions: 'play none none none'
            }
        })
    })

    
    gsap.utils.toArray('.qs-section, .qs-mv, .qs-valores').forEach(el => {
        gsap.from(el, {
            y: 30,
            opacity: 0,
            duration: 0.5,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: el,
                start: 'top 88%',
                toggleActions: 'play none none none'
            }
        })
    })

    
    gsap.utils.toArray('.pd-secao, .categorias, .beneficios, .sobre, .quem-somos').forEach(el => {
        gsap.from(el, {
            y: 30,
            opacity: 0,
            duration: 0.5,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: el,
                start: 'top 88%',
                toggleActions: 'play none none none'
            }
        })
    })

    
    const packCircle = document.querySelector('.pack-destaque')
    if (packCircle) {
        gsap.to(packCircle, {
            y: 10,
            duration: 2.5,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true
        })
    }
}


export function animarAuthContainer(el) {
    if (!el || typeof gsap === 'undefined') return
    gsap.fromTo(el,
        { opacity: 0, y: -20, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power2.out' }
    )
}


export function animarCarrinhoOverlay(el) {
    if (!el || typeof gsap === 'undefined') return
    gsap.fromTo(el,
        { opacity: 0 },
        { opacity: 1, duration: 0.25, ease: 'power1.out' }
    )
}


export function animarCarrinhoPainel(el) {
    if (!el || typeof gsap === 'undefined') return
    gsap.fromTo(el,
        { x: '100%' },
        { x: '0%', duration: 0.3, ease: 'power2.out' }
    )
}


export function animarSlideDown(el) {
    if (!el || typeof gsap === 'undefined') return
    gsap.fromTo(el,
        { opacity: 0, maxHeight: 0, overflow: 'hidden' },
        { opacity: 1, maxHeight: 600, duration: 0.3, ease: 'power2.out', onComplete: () => { el.style.maxHeight = 'none'; el.style.overflow = '' } }
    )
}


export function animarCheckBounce(el) {
    if (!el || typeof gsap === 'undefined') return
    gsap.fromTo(el,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.7)' }
    )
}


export function animarFavPulse(el) {
    if (!el || typeof gsap === 'undefined') return
    gsap.fromTo(el,
        { scale: 1 },
        { scale: 1.3, duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1 }
    )
}