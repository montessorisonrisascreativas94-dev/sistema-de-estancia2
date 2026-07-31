/**
 * LoadingFeedback — Mensajes dinámicos empáticos durante cargas lentas.
 *
 * Objetivo UX: cuando una operación tarda más de un par de segundos,
 * el usuario siente que el sistema lo acompañó ("Estamos trabajando
 * contigo") en vez de un spinner mudo. Muestra un banner/tostada que
 * rota mensajes y ofrece acciones útiles (reintentar / cancelar).
 *
 * Usage:
 *   import { withLoading } from '../shared/loading-feedback.js';
 *   await withLoading('Cargando estudiantes...', () => loadStudents());
 *
 *   const task = withLoading('Procesando reporte...', async () => {...}, {
 *     containerId: 'content',      // mostrar dentro de un contenedor
 *     minMs: 1200,                 // duración mínima percibida
 *     patienceMs: 2500,            // a partir de cuánto rota mensajes
 *     retry: true,                 // ofrecer botón de reintentar
 *   });
 */

const DEFAULT_MESSAGES = [
  'Estamos trabajando contigo...',
  'Un segundo, casi está todo listo.',
  'Gracias por tu paciencia, seguimos en ello.',
  'Ya casi terminamos, no te muevas.',
  'Estamos organizando la información para ti.'
];

const RETRY_MESSAGE = 'Parece que tardamos más de lo esperado. Puedes reintentar o seguir esperando.';

let _activeOverlay = null;

function getRoleLabel() {
  const path = (typeof window !== 'undefined' && window.location) ? window.location.pathname.toLowerCase() : '';
  if (path.includes('panel_padres')) return 'padre';
  if (path.includes('panel_maestra')) return 'maestra';
  if (path.includes('panel_asistente')) return 'asistente';
  if (path.includes('panel_encargada')) return 'encargada';
  return 'directora';
}

function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg, type = 'info', duration = 5000) {
  if (typeof window !== 'undefined' && window.Helpers?.toast) {
    window.Helpers.toast(msg, type, duration);
    return;
  }
  if (typeof window !== 'undefined' && window.SmartLoader?.toast) {
    window.SmartLoader.toast(msg, type, duration);
    return;
  }
  if (typeof window === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'lf-toast';
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#0f172a;color:#fff;padding:14px 20px;border-radius:14px;font-size:13px;font-weight:600;box-shadow:0 12px 32px rgba(0,0,0,.25);max-width:90vw';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, duration);
}

function showInlineBanner(container, text) {
  const existing = container.querySelector('.lf-banner');
  if (existing) {
    existing.querySelector('.lf-banner-text').textContent = text;
    return existing;
  }
  const banner = document.createElement('div');
  banner.className = 'lf-banner';
  banner.style.cssText = 'display:flex;align-items:center;gap:10px;justify-content:center;padding:12px 16px;margin:10px 0;border-radius:14px;background:linear-gradient(90deg,#eef2ff,#f5f3ff);border:1px solid #c7d2fe;color:#4338ca;font-size:13px;font-weight:600;text-align:center';
  banner.innerHTML = `<span class="lf-spinner" style="width:16px;height:16px;border:2px solid #c7d2fe;border-top-color:#6366f1;border-radius:50%;animation:lf-spin 1s linear infinite;flex-shrink:0"></span><span class="lf-banner-text">${escapeHTML(text)}</span>`;
  if (!document.getElementById('lf-spin-style')) {
    const st = document.createElement('style');
    st.id = 'lf-spin-style';
    st.textContent = '@keyframes lf-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  container.prepend(banner);
  return banner;
}

function hideInlineBanner(container) {
  const b = container && container.querySelector('.lf-banner');
  if (b) b.remove();
}

/**
 * Ejecuta `fn` mostrando feedback empático si tarda.
 * @param {string} initialMsg mensaje inicial
 * @param {Function} fn función async a envolver
 * @param {object} opts opciones (ver arriba)
 * @returns {Promise<*>} resultado de fn
 */
export async function withLoading(initialMsg, fn, opts = {}) {
  const {
    containerId = null,
    minMs = 800,
    patienceMs = 2500,
    rotateMs = 4500,
    messages = DEFAULT_MESSAGES,
    retry = false,
    onFinally = null,
    onError = null
  } = opts;

  const container = containerId ? document.getElementById(containerId) : null;
  const start = Date.now();
  let banner = null;
  let patienceTimer = null;
  let rotateTimer = null;
  let done = false;

  const showFeedback = () => {
    if (done) return;
    if (container) {
      banner = showInlineBanner(container, initialMsg);
    } else {
      toast(initialMsg, 'info', 6000);
    }
  };

  // Si pasa de patienceMs sin terminar, mostramos mensajes empáticos rotativos
  patienceTimer = setTimeout(() => {
    showFeedback();
    let idx = 0;
    rotateTimer = setInterval(() => {
      if (done) return;
      idx = (idx + 1) % messages.length;
      const msg = retry && idx === messages.length - 1
        ? RETRY_MESSAGE
        : messages[idx];
      if (container && banner) {
        const textEl = banner.querySelector('.lf-banner-text');
        if (textEl) textEl.textContent = msg;
      } else {
        toast(msg, 'info', 6000);
      }
    }, rotateMs);
  }, patienceMs);

  try {
    const result = await fn();
    return result;
  } catch (e) {
    if (onError) {
      try { onError(e); } catch (_) { /* noop */ }
    } else if (typeof window !== 'undefined' && window.Helpers?.toast) {
      window.Helpers.toast('Algo no salió bien, pero estamos contigo. Inténtalo nuevamente.', 'error', 6000);
    }
    throw e;
  } finally {
    done = true;
    if (patienceTimer) clearTimeout(patienceTimer);
    if (rotateTimer) clearInterval(rotateTimer);
    if (container) hideInlineBanner(container);
    const elapsed = Date.now() - start;
    if (elapsed < minMs) {
      await new Promise(r => setTimeout(r, minMs - elapsed));
    }
    if (onFinally) {
      try { onFinally(); } catch (_) { /* noop */ }
    }
  }
}

/**
 * Overlay a pantalla completa empático (para procesos largos).
 */
export function showOverlay({ title = 'Estamos trabajando contigo...', message = '', autoCloseMs = 0 } = {}) {
  if (_activeOverlay) closeOverlay();
  const el = document.createElement('div');
  el.id = 'lf-overlay';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(15,23,42,.72);backdrop-filter:blur(4px);color:#fff;text-align:center;padding:24px';
  el.innerHTML = `
    <div style="width:48px;height:48px;border:4px solid rgba(255,255,255,.2);border-top-color:#818cf8;border-radius:50%;animation:lf-spin 1s linear infinite"></div>
    <p style="font-size:16px;font-weight:700;margin:0">${escapeHTML(title)}</p>
    ${message ? `<p style="font-size:13px;opacity:.85;margin:0">${escapeHTML(message)}</p>` : ''}
  `;
  document.body.appendChild(el);
  _activeOverlay = el;
  if (autoCloseMs > 0) setTimeout(closeOverlay, autoCloseMs);
  return { close: closeOverlay };
}

export function closeOverlay() {
  if (_activeOverlay) {
    _activeOverlay.remove();
    _activeOverlay = null;
  }
}

if (typeof window !== 'undefined') {
  window.LoadingFeedback = { withLoading, showOverlay, closeOverlay };
}
