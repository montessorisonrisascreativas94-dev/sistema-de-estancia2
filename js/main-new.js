/**
 * ========================================
 * COLEGIO MONTESSORI SONRISAS CREATIVAS
 * JavaScript Principal
 * ========================================
 */

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 ¡Bienvenido a Sonrisas Creativas!');
    
    initNavbar();
    initScrollAnimations();
    initSmoothScroll();
    initConfetti();
    initIntersectionObserver();
});

/**
 * ========================================
 * NAVBAR - Efecto Glassmorphism al hacer scroll
 * ========================================
 */
function initNavbar() {
    const navbar = document.getElementById('navbar');
    const logoText = document.querySelector('.nav-logo-text');
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

/**
 * ========================================
 * SCROLL SMOOTH - Desplazamiento suave
 * ========================================
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

/**
 * ========================================
 * ANIMACIONES AL HACER SCROLL
 * ========================================
 */
function initScrollAnimations() {
    // Ya manejado por Intersection Observer
}

/**
 * ========================================
 * INTERSECTION OBSERVER - Animaciones de entrada
 * ========================================
 */
function initIntersectionObserver() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observar tarjetas de programas
    document.querySelectorAll('.program-card').forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(40px)';
        card.style.transition = `all 0.7s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.1}s`;
        observer.observe(card);
    });
    
    // Observar tarjetas de testimonios
    document.querySelectorAll('.testimonial-card').forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(40px)';
        card.style.transition = `all 0.7s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.15}s`;
        observer.observe(card);
    });
    
    // Observar elementos del about
    document.querySelectorAll('.about-content, .about-image').forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(40px)';
        el.style.transition = `all 0.7s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.2}s`;
        observer.observe(el);
    });
}

/**
 * ========================================
 * CONFETTI - Efecto al hacer scroll
 * ========================================
 */
function initConfetti() {
    let lastScrollY = 0;
    let scrollThreshold = 300;
    const confettiEmojis = ['⭐', '✨', '❤️', '🌟', '🌸', '🎨', '🌈', '💫', '🎪', '🎭'];
    
    window.addEventListener('scroll', function() {
        const currentScrollY = window.scrollY;
        
        if (currentScrollY > lastScrollY + scrollThreshold) {
            createConfettiBurst(confettiEmojis);
            lastScrollY = currentScrollY;
        }
    });
}

/**
 * Crea una explosión de confeti
 */
function createConfettiBurst(emojis) {
    const confettiCount = 8;
    
    for (let i = 0; i < confettiCount; i++) {
        setTimeout(() => {
            createConfettiParticle(emojis);
        }, i * 50);
    }
}

/**
 * Crea una partícula individual de confeti
 */
function createConfettiParticle(emojis) {
    const confetti = document.createElement('div');
    confetti.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.top = '-30px';
    confetti.style.fontSize = (Math.random() * 20 + 15) + 'px';
    confetti.style.position = 'fixed';
    confetti.style.pointerEvents = 'none';
    confetti.style.zIndex = '9999';
    
    document.body.appendChild(confetti);
    
    // Animar el confeti
    requestAnimationFrame(() => {
        confetti.classList.add('visible');
        
        const duration = 3000 + Math.random() * 2000;
        const horizontalDrift = Math.random() * 200 - 100;
        const rotations = Math.random() * 720 - 360;
        
        confetti.animate([
            {
                transform: 'translateY(0) translateX(0) rotate(0deg)',
                opacity: 1
            },
            {
                transform: `translateY(${window.innerHeight + 100}px) translateX(${horizontalDrift}px) rotate(${rotations}deg)`,
                opacity: 0
            }
        ], {
            duration: duration,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        });
    });
    
    // Eliminar después de la animación
    setTimeout(() => {
        confetti.remove();
    }, 5000);
}

/**
 * ========================================
 * FUNCIONES UTILITARIAS
 * ========================================
 */

/**
 * Debounce function para limitar llamadas frecuentes
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function para limitar ejecuciones
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
 * Preload de imágenes para mejor rendimiento
 */
function preloadImages(urls) {
    urls.forEach(url => {
        const img = new Image();
        img.src = url;
    });
}

/**
 * ========================================
 * DETECCIÓN DE DISPOSITIVOS
 * ========================================
 */
const isMobile = {
    Android: function() {
        return navigator.userAgent.match(/Android/i);
    },
    BlackBerry: function() {
        return navigator.userAgent.match(/BlackBerry/i);
    },
    iOS: function() {
        return navigator.userAgent.match(/iPhone|iPad|iPod/i);
    },
    Opera: function() {
        return navigator.userAgent.match(/Opera Mini/i);
    },
    Windows: function() {
        return navigator.userAgent.match(/IEMobile/i);
    },
    any: function() {
        return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
    }
};

// Añadir clase para mobile si es necesario
if (isMobile.any()) {
    document.body.classList.add('is-mobile');
}

/**
 * ========================================
 * MODO REDUCIDO DE MOTION (Accesibilidad)
 * ========================================
 */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
    document.body.classList.add('reduced-motion');
    console.log('🎯 Modo de movimiento reducido activado');
}

/**
 * ========================================
 * LOG DE INFORMACIÓN
 * ========================================
 */
console.log('📱 Modo móvil:', isMobile.any() ? 'Sí' : 'No');
console.log('✨ Animaciones reducidas:', prefersReducedMotion ? 'Sí' : 'No');
console.log('🎨 Diseño cargado exitosamente!');