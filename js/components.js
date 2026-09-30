/**
 * ========================================
 * COMPONENTES REUTILIZABLES
 * Colegio Montessori Sonrisas Creativas
 * ========================================
 */

/**
 * ========================================
 * COMPONENTE: MASCOTAS ANIMADAS
 * ========================================
 */
const MascotComponent = {
    triangle: {
        blink: function() {
            const eyes = document.querySelectorAll('.triangle-eyes circle:nth-child(1), .triangle-eyes circle:nth-child(2)');
            eyes.forEach(eye => {
                eye.style.animation = 'none';
                eye.offsetHeight; // Trigger reflow
                eye.style.animation = 'triangleBlink 4s ease-in-out infinite';
            });
        },
        dance: function() {
            const triangle = document.querySelector('.triangle-mascot');
            if (triangle) {
                triangle.style.animation = 'none';
                triangle.offsetHeight;
                triangle.style.animation = 'triangleBounce 0.5s ease-in-out 3';
                setTimeout(() => {
                    triangle.style.animation = 'triangleBounce 2.5s ease-in-out infinite';
                }, 1500);
            }
        }
    },
    hexagon: {
        wave: function() {
            const arm = document.querySelector('.hexagon-arm');
            if (arm) {
                arm.style.animation = 'none';
                arm.offsetHeight;
                arm.style.animation = 'armWave 0.3s ease-in-out 5';
                setTimeout(() => {
                    arm.style.animation = 'armWave 2s ease-in-out infinite';
                }, 1500);
            }
        }
    },
    sun: {
        shine: function() {
            const rays = document.querySelector('.sun-rays');
            if (rays) {
                rays.style.animation = 'none';
                rays.offsetHeight;
                rays.style.animation = 'sunRays 0.5s ease-in-out 5';
                setTimeout(() => {
                    rays.style.animation = 'sunRays 2s ease-in-out infinite';
                }, 2500);
            }
        }
    },
    init: function() {
        console.log('🎭 Mascotas inicializadas');
        
        // Interacciones al hacer hover en botones
        const primaryBtns = document.querySelectorAll('.btn-primary');
        primaryBtns.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                this.triangle.dance();
            });
        });
        
        const secondaryBtns = document.querySelectorAll('.btn-secondary');
        secondaryBtns.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                this.hexagon.wave();
            });
        });
    }
};

/**
 * ========================================
 * COMPONENTE: GALERÍA INTERACTIVA
 * ========================================
 */
const GalleryComponent = {
    lightbox: null,
    init: function() {
        const galleryItems = document.querySelectorAll('.gallery-item');
        
        galleryItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                this.openLightbox(item, index);
            });
            
            // Efecto de wobble al hacer hover
            item.addEventListener('mouseenter', () => {
                item.style.animation = 'wobble 0.5s ease-in-out';
            });
            
            item.addEventListener('animationend', () => {
                item.style.animation = '';
            });
        });
    },
    openLightbox: function(item, index) {
        // Implementación básica de lightbox
        console.log('🖼️ Abriendo imagen:', index);
    }
};

/**
 * ========================================
 * COMPONENTE: FORMULARIO DE CONTACTO
 * ========================================
 */
const ContactFormComponent = {
    form: null,
    init: function() {
        this.form = document.getElementById('contact-form');
        
        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSubmit();
            });
        }
    },
    handleSubmit: function() {
        console.log('📨 Formulario enviado');
        // Mostrar mensaje de éxito
        this.showSuccessMessage();
    },
    showSuccessMessage: function() {
        // Crear confeti especial para el éxito
        const successEmojis = ['🎉', '🎊', '✨', '⭐', '🌟'];
        for (let i = 0; i < 15; i++) {
            setTimeout(() => {
                this.createSuccessConfetti(successEmojis);
            }, i * 80);
        }
    },
    createSuccessConfetti: function(emojis) {
        const confetti = document.createElement('div');
        confetti.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        confetti.style.position = 'fixed';
        confetti.style.left = '50%';
        confetti.style.top = '50%';
        confetti.style.fontSize = '2rem';
        confetti.style.pointerEvents = 'none';
        confetti.style.zIndex = '99999';
        
        document.body.appendChild(confetti);
        
        const randomX = (Math.random() - 0.5) * 500;
        const randomY = -Math.random() * 400 - 200;
        
        confetti.animate([
            {
                transform: 'translate(-50%, -50%) scale(0)',
                opacity: 1
            },
            {
                transform: `translate(calc(-50% + ${randomX}px), calc(-50% + ${randomY}px)) scale(1.5)`,
                opacity: 0
            }
        ], {
            duration: 1500,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        });
        
        setTimeout(() => confetti.remove(), 1500);
    }
};

/**
 * ========================================
 * COMPONENTE: BOTONES FLOTANTES (FAB)
 * ========================================
 */
const FabComponent = {
    init: function() {
        const fabs = document.querySelectorAll('.fab');
        
        fabs.forEach(fab => {
            fab.addEventListener('mouseenter', () => {
                this.createRipple(fab);
            });
        });
    },
    createRipple: function(element) {
        const ripple = document.createElement('span');
        ripple.style.position = 'absolute';
        ripple.style.borderRadius = '50%';
        ripple.style.background = 'rgba(255, 255, 255, 0.4)';
        ripple.style.width = '100px';
        ripple.style.height = '100px';
        ripple.style.top = '50%';
        ripple.style.left = '50%';
        ripple.style.transform = 'translate(-50%, -50%) scale(0)';
        ripple.style.animation = 'ripple 0.6s ease-out';
        ripple.style.pointerEvents = 'none';
        
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    }
};

/**
 * ========================================
 * COMPONENTE: TÍTULOS EFECTO PINCEL
 * ========================================
 */
const BrushTitleComponent = {
    init: function() {
        const titles = document.querySelectorAll('.section-title');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.animateTitle(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        
        titles.forEach(title => observer.observe(title));
    },
    animateTitle: function(title) {
        const underline = title.querySelector('.brush-underline');
        if (underline) {
            underline.style.width = '0';
            underline.style.left = '50%';
            underline.style.transition = 'all 1s cubic-bezier(0.4, 0, 0.2, 1)';
            
            requestAnimationFrame(() => {
                underline.style.width = '100%';
                underline.style.left = '0';
            });
        }
    }
};

/**
 * ========================================
 * COMPONENTE: MENÚ MÓVIL
 * ========================================
 */
const MobileMenuComponent = {
    isOpen: false,
    menuBtn: null,
    navLinks: null,
    init: function() {
        this.menuBtn = document.querySelector('.mobile-menu-btn');
        this.navLinks = document.querySelector('.nav-links');
        
        if (this.menuBtn) {
            this.menuBtn.addEventListener('click', () => {
                this.toggleMenu();
            });
        }
        
        // Cerrar menú al hacer click en un enlace
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (this.isOpen) {
                    this.closeMenu();
                }
            });
        });
    },
    toggleMenu: function() {
        if (this.isOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    },
    openMenu: function() {
        this.isOpen = true;
        if (this.navLinks) {
            this.navLinks.style.display = 'flex';
            this.navLinks.style.flexDirection = 'column';
            this.navLinks.style.position = 'absolute';
            this.navLinks.style.top = '100%';
            this.navLinks.style.left = '0';
            this.navLinks.style.right = '0';
            this.navLinks.style.background = 'white';
            this.navLinks.style.padding = '20px';
            this.navLinks.style.boxShadow = '0 10px 40px rgba(30, 90, 168, 0.15)';
            this.navLinks.style.borderRadius = '0 0 30px 30px';
            this.navLinks.style.gap = '15px';
        }
    },
    closeMenu: function() {
        this.isOpen = false;
        if (this.navLinks && window.innerWidth < 1024) {
            this.navLinks.style.display = 'none';
        }
    }
};

/**
 * ========================================
 * COMPONENTE: EFECTOS DE CURSOR
 * ========================================
 */
const CursorEffectComponent = {
    cursor: null,
    init: function() {
        // Solo en desktop
        if (window.innerWidth > 768) {
            this.createCustomCursor();
        }
    },
    createCustomCursor: function() {
        // Implementación opcional de cursor personalizado
        console.log('🖱️ Efectos de cursor listos');
    }
};

/**
 * ========================================
 * COMPONENTE: CONTADOR DE VISITAS (FUN)
 * ========================================
 */
const FunCounterComponent = {
    count: 0,
    max: 1000,
    init: function() {
        // Contador divertido que aumenta con el scroll
        let lastScroll = 0;
        
        window.addEventListener('scroll', throttle(() => {
            const currentScroll = window.scrollY;
            if (currentScroll > lastScroll) {
                this.count++;
            }
            lastScroll = currentScroll;
        }, 100));
    }
};

/**
 * ========================================
 * UTILIDAD: THROTTLE
 * ========================================
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * ========================================
 * INICIALIZACIÓN DE TODOS LOS COMPONENTES
 * ========================================
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🧩 Inicializando componentes...');
    
    MascotComponent.init();
    FabComponent.init();
    BrushTitleComponent.init();
    MobileMenuComponent.init();
    CursorEffectComponent.init();
    FunCounterComponent.init();
    
    // Solo inicializar galería si existe
    if (document.querySelector('.gallery-item')) {
        GalleryComponent.init();
    }
    
    // Solo inicializar formulario si existe
    if (document.getElementById('contact-form')) {
        ContactFormComponent.init();
    }
    
    console.log('✅ Todos los componentes listos!');
});

/**
 * ========================================
 * EXPORTAR COMPONENTES (para uso modular)
 * ========================================
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MascotComponent,
        GalleryComponent,
        ContactFormComponent,
        FabComponent,
        BrushTitleComponent,
        MobileMenuComponent
    };
}