/**
 * 🛡️ Colegio Montessori Sonrisas Creativas — Security Module
 * Protección contra XSS, CSRF, clickjacking e inyección.
 * Importar en todos los paneles: import { Security } from '../shared/security.js';
 */

export const Security = {

  /**
   * Sanitiza texto para inserción segura en HTML.
   * Más completo que escapeHTML básico.
   */
  sanitize(input = '') {
    if (typeof input !== 'string') return String(input ?? '');
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .replace(/`/g, '&#x60;')
      .replace(/=/g, '&#x3D;');
  },

  /**
   * Valida y sanitiza una URL — evita javascript: y data: URIs maliciosas.
   */
  safeUrl(url = '') {
    if (!url) return '#';
    const lower = url.toLowerCase().trim();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
      return '#';
    }
    return url;
  },

  /**
   * Escapa un string para uso seguro en contextos JavaScript (onclick, template literals).
   * Previene inyección de código vía atributos de eventos inline.
   */
  safeJS(str = '') {
    if (typeof str !== 'string') return String(str ?? '');
    return str
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/</g, '\\x3c')
      .replace(/>/g, '\\x3e')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  },

  /**
   * Valida email básico.
   */
  isValidEmail(email = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  },

  /**
   * Valida contraseña segura (mín 8 chars, 1 mayúscula, 1 número).
   */
  isStrongPassword(pwd = '') {
    if (pwd.length < 8) return { ok: false, msg: 'Mínimo 8 caracteres' };
    if (!/[A-Z]/.test(pwd)) return { ok: false, msg: 'Debe incluir al menos una mayúscula' };
    if (!/[0-9]/.test(pwd)) return { ok: false, msg: 'Debe incluir al menos un número' };
    return { ok: true, msg: '' };
  },

  /**
   * Limpia un objeto de payload antes de enviarlo a Supabase.
   * Elimina campos undefined/null opcionales y sanitiza strings.
   */
  cleanPayload(obj = {}, sanitizeStrings = false) {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      if (sanitizeStrings && typeof v === 'string') {
        clean[k] = v.trim();
      } else {
        clean[k] = v;
      }
    }
    return clean;
  },

  /**
   * Detecta y bloquea intentos de XSS en inputs del usuario.
   * Retorna true si el input parece malicioso.
   */
  isMalicious(input = '') {
    const patterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,       // onclick=, onload=, etc.
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /eval\s*\(/i,
      /document\.cookie/i,
      /window\.location/i,
    ];
    return patterns.some(p => p.test(input));
  },

  /**
   * Valida un atributo HTML y su valor antes de insertarlo en la plantilla.
   * Devuelve null si el nombre no es permitido o el valor es peligroso.
   */
  safeAttr(name = '', value = '') {
    const ALLOWED = new Set(['alt', 'title', 'aria-label', 'class', 'id', 'data-role', 'data-status', 'target', 'rel', 'placeholder']);
    const v = String(value ?? '');
    if (!ALLOWED.has(name)) return null;
    if (/[\u0000-\u001f\u007f"'>]/u.test(v)) return null;
    return v.slice(0, 500);
  },

  /**
   * Detecta intentos de DOM clobbering: elementos con id/name que
   * "secuestran" propiedades globales (window.id, window.name, etc).
   */
  isDomClobbered(el) {
    if (!el || typeof el !== 'object') return false;
    const DANGEROUS_NAMES = ['location', 'status', 'frames', 'name', 'self', 'top', 'parent', 'opener', 'length', 'close', 'open', 'alert', 'fetch', 'token'];
    const id = (el.id || '').toString();
    const name = (el.getAttribute && el.getAttribute('name')) || '';
    return DANGEROUS_NAMES.includes(id) || DANGEROUS_NAMES.includes(name);
  },

  /**
   * Escanea y neutraliza elementos que intentan secuestrar el DOM global.
   * Llamar tras cargar contenido dinámico (innerHTML, insertAdjacentHTML).
   */
  scrubDomClobbering(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[id], [name]').forEach((el) => {
      if (this.isDomClobbered(el)) {
        el.removeAttribute('id');
        el.removeAttribute('name');
      }
    });
  },

  /**
   * Bloquea prototipo-políticas en payloads (evita __proto__ pollution).
   * Retorna un objeto "limpio" o el payload original si no es objeto.
   */
  dePollute(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const v = obj[k];
      out[k] = v && typeof v === 'object' ? this.dePollute(v) : v;
    }
    return out;
  },

  /**
   * Limita la longitud de un string (anti payloads gigantes).
   */
  limitLength(str = '', max = 500) {
    const s = String(str ?? '');
    return s.length > max ? s.slice(0, max) : s;
  },

  /**
   * Valida un ID numérico (bigint safe). Devuelve null si no es válido.
   */
  safeInteger(input, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    const n = Number(input);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    if (n < min || n > max) return null;
    return n;
  },

  /**
   * Detecta y neutraliza `data:`/`blob:` URLs en atributos de recursos.
   */
  safeResourceUrl(url = '') {
    const lower = url.toLowerCase().trim();
    if (/^(javascript|vbscript|file|data):/.test(lower)) return '';
    if (lower.startsWith('blob:')) return url; // blob permitido (uploads)
    return this.safeUrl(url);
  },

  /**
   * Inicializa protecciones globales en el documento.
   * Llamar una vez al cargar cada panel.
   */
  init() {
    // 1. Prevenir clickjacking via JS (refuerza X-Frame-Options)
    if (window.self !== window.top) {
      document.body.innerHTML = '<div style="padding:2rem;font-family:sans-serif;text-align:center"><h2>Acceso no permitido</h2><p>Esta página no puede cargarse en un iframe.</p></div>';
      return;
    }

    // 2. Detectar DevTools abiertos (disuasión básica)
    // Solo en producción
    if (window.location.hostname === 'montessorisonrisascreativas.com') {
      let devtoolsOpen = false;
      const threshold = 160;
      setInterval(() => {
        const widthDiff  = window.outerWidth  - window.innerWidth  > threshold;
        const heightDiff = window.outerHeight - window.innerHeight > threshold;
        if ((widthDiff || heightDiff) && !devtoolsOpen) {
          devtoolsOpen = true;
          console.warn('%c⚠️ Colegio Montessori Sonrisas Creativas — Zona Restringida', 'color:red;font-size:20px;font-weight:bold');
          console.warn('%cSi eres un desarrollador autorizado, ignora este mensaje.', 'color:orange;font-size:14px');
        } else if (!widthDiff && !heightDiff) {
          devtoolsOpen = false;
        }
      }, 1000);
    }

    // 3. Sanitizar automáticamente inputs al perder foco
    document.addEventListener('blur', (e) => {
      const el = e.target;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
      if (el.type === 'password' || el.type === 'email') return; // no tocar passwords/emails
      
      if (el.value && this.isMalicious(el.value)) {
        console.warn('Security check failed for input:', el.id || el.name);
        
        // ✅ SANITIZACIÓN SILENCIOSA: Escapar en lugar de borrar
        // Evita frustración al usuario mientras mantenemos la seguridad.
        const sanitized = el.value
          .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '[Script eliminado]')
          .replace(/on\w+="[^"]*"/gim, '[Evento eliminado]')
          .replace(/javascript:/gim, '[JS bloqueado]');
        
        el.value = sanitized;
        
        // Notificar al usuario (opcionalmente)
        if (window.safeToast) {
          window.safeToast('Se han eliminado caracteres no permitidos por seguridad.', 'warning');
        } else {
          el.classList.add('border-rose-500');
        }
      }
    }, true);

    // 4. Prevenir paste de scripts en inputs de texto
    document.addEventListener('paste', (e) => {
      const el = e.target;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
      if (el.type === 'password') return;
      const pasted = e.clipboardData?.getData('text') || '';
      if (this.isMalicious(pasted)) {
        e.preventDefault();
      }
    }, true);

    // 5. Vigilar contenido dinámico (innerHTML de terceros) contra DOM clobbering
    this.scrubDomClobbering(document);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes || []) {
          if (node && node.querySelectorAll) {
            this.scrubDomClobbering(node);
          } else if (node && node.id && this.isDomClobbered(node)) {
            node.removeAttribute('id');
          }
        }
      }
    });
    if (window.MutationObserver) {
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }

    // 6. Protección débil de prototipo para payloads globales (si expuesto)
    window.__karpus_dePollute = this.dePollute.bind(this);

  }
};

// Auto-init en todos los paneles
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => Security.init());
}
