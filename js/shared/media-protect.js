/**
 * ?? MediaProtect - Disuade la captura/descarga de contenido privado.
 *
 * En la web NO existe una forma 100% infalible de impedir una captura de
 * pantalla. Este mdulo aplica las protecciones posibles: bloquea men
 * contextual/arrastre/seleccin/copia, oculta el contenido al perder el foco
 * de la ventana (capturas, cambio de app, grabacin de pantalla), oculta las
 * imgenes al imprimir/guardar como PDF, y difumina al detectar PrintScreen.
 *
 * Uso: marcar el contenedor con `data-protect-media="1"` y llamar
 * `MediaProtect.install()` una vez.
 */

const STYLE_ID = 'mp-protect-styles';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
    [data-protect-media],
    [data-protect-media] img,
    [data-protect-media] video {
      -webkit-user-drag: none !important;
      -webkit-user-select: none !important;
      user-select: none !important;
      -webkit-touch-callout: none !important;
    }
    [data-protect-media] { position: relative; }
    .mp-shielded img,
    .mp-shielded video {
      filter: blur(26px) !important;
      opacity: .25 !important;
      transition: filter .12s ease, opacity .12s ease;
    }
    .mp-shielded::after {
      content: 'Contenido protegido';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font: 800 12px/1.2 system-ui, sans-serif;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #fff;
      background: rgba(15, 23, 42, .55);
      border-radius: inherit;
      pointer-events: none;
      z-index: 5;
    }
    .mp-hint {
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%) translateY(12px);
      background: rgba(15, 23, 42, .94);
      color: #fff;
      font: 700 12px/1.3 system-ui, sans-serif;
      padding: 10px 16px;
      border-radius: 999px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, .3);
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s, transform .2s;
      z-index: 100000;
    }
    .mp-hint.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    @media print {
      [data-protect-media] { display: none !important; }
    }
  `;
  document.head.appendChild(st);
}

let installed = false;
let unshieldTimer = null;
let lastProtectedHit = 0;
let hintEl = null;

function isProtected(target) {
  return !!(target && target.closest && target.closest('[data-protect-media]'));
}

function flashHint(message) {
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.className = 'mp-hint';
    document.body.appendChild(hintEl);
  }
  hintEl.textContent = message;
  hintEl.classList.add('show');
  clearTimeout(hintEl._t);
  hintEl._t = setTimeout(() => hintEl.classList.remove('show'), 1800);
}

export const MediaProtect = {
  install() {
    if (installed) return;
    installed = true;
    ensureStyles();

    document.addEventListener('contextmenu', (e) => {
      if (isProtected(e.target)) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    document.addEventListener('dragstart', (e) => {
      if (isProtected(e.target)) e.preventDefault();
    }, true);

    document.addEventListener('selectstart', (e) => {
      if (isProtected(e.target)) e.preventDefault();
    }, true);

    document.addEventListener('copy', (e) => {
      const sel = window.getSelection && window.getSelection();
      const anchor = sel && sel.anchorNode;
      if (isProtected(e.target) || isProtected(anchor && anchor.parentElement)) e.preventDefault();
    }, true);

    document.addEventListener('click', (e) => {
      if (isProtected(e.target)) lastProtectedHit = Date.now();
    }, true);

    document.addEventListener('keyup', (e) => {
      if (e.key === 'PrintScreen' || e.key === 'Snapshot') {
        try { navigator.clipboard?.writeText(' ').catch(() => {}); } catch (_) {}
        this.shield();
        flashHint('Captura bloqueada: contenido protegido');
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      const k = String(e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's')) {
        if (document.querySelector('[data-protect-media]')) {
          e.preventDefault();
          flashHint('Impresin/descarga deshabilitada en contenido protegido');
        }
      }
    }, true);

    window.addEventListener('blur', () => {
      if (document.querySelector('[data-protect-media]')) this.shield();
    });
    window.addEventListener('focus', () => this.unshield());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.shield();
      else this.unshield();
    });

    const patchLightbox = () => {
      const orig = window.openLightbox;
      if (!orig || orig._mpPatched) return;
      const wrapped = function (url, type) {
        const res = orig(url, type);
        const inner = document.getElementById('karpusLbInner');
        if (inner) {
          if (Date.now() - lastProtectedHit < 1500) inner.setAttribute('data-protect-media', '1');
          else inner.removeAttribute('data-protect-media');
        }
        return res;
      };
      wrapped._mpPatched = true;
      window.openLightbox = wrapped;
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', patchLightbox, { once: true });
    } else {
      patchLightbox();
    }
  },

  shield() {
    this.install();
    document.querySelectorAll('[data-protect-media]').forEach((el) => el.classList.add('mp-shielded'));
  },

  unshield() {
    if (unshieldTimer) clearTimeout(unshieldTimer);
    unshieldTimer = setTimeout(() => {
      document.querySelectorAll('.mp-shielded').forEach((el) => el.classList.remove('mp-shielded'));
    }, 400);
  },

  flashHint
};
