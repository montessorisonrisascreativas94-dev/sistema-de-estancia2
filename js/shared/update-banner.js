/**
 * update-banner.js — Banner animado de nueva versión disponible
 * Se activa cuando el Service Worker detecta una nueva versión del app
 * o cuando la versión de /sw.js es distinta a la última vista por el dispositivo.
 */

const VERSION_KEY = 'karpus_app_version';
const SNOOZE_KEY = 'karpus_update_snooze';
const SNOOZE_MS = 60 * 60 * 1000;
const CHECK_MS = 5 * 60 * 1000;

let _registration = null;
let _targetVersion = null;
let _checking = false;
let _initialized = false;

export function initUpdateBanner() {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;
  window.__karpusUpdateBannerInit = true;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        _registration = reg;

        if (reg.waiting) _promptUpdate(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              _promptUpdate(worker);
            }
          });
        });

        _promptUpdate(reg.waiting);
        setInterval(() => {
          reg.update().catch(() => {});
          _promptUpdate(reg.waiting);
        }, CHECK_MS);
      })
      .catch(() => {
        _promptUpdate(null);
      });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'APP_UPDATED') {
        _promptUpdate(_registration?.waiting || null);
      }
    });
  } else {
    _promptUpdate(null);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    _registration?.update().catch(() => {});
    _promptUpdate(_registration?.waiting || null);
  });

  window.addEventListener('online', () => {
    _registration?.update().catch(() => {});
    _promptUpdate(_registration?.waiting || null);
  });
}

async function _getServerVersion() {
  try {
    const response = await fetch(`/sw.js?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const text = await response.text();
    const match = text.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function _promptUpdate(worker) {
  if (_checking) return;
  _checking = true;

  try {
    const version = await _getServerVersion();
    const stored = _getStoredVersion();

    if (!stored) {
      if (version) _setStoredVersion(version);
      if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }

    if (version && version === stored) {
      if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    if (!version && !worker) return;

    const target = version || stored;
    if (_isSnoozed(target)) return;

    if (version) _targetVersion = version;
    _renderBanner(worker, version);
  } finally {
    _checking = false;
  }
}

function _getStoredVersion() {
  try {
    return localStorage.getItem(VERSION_KEY);
  } catch {
    return null;
  }
}

function _setStoredVersion(version) {
  try {
    localStorage.setItem(VERSION_KEY, version);
  } catch {
    /* almacenamiento no disponible */
  }
}

function _isSnoozed(version) {
  try {
    const snooze = JSON.parse(localStorage.getItem(SNOOZE_KEY) || 'null');
    return Boolean(
      snooze &&
      snooze.version === version &&
      Date.now() < Number(snooze.until)
    );
  } catch {
    return false;
  }
}

function _markUpdated(version) {
  const target = version || _targetVersion;
  if (target) _setStoredVersion(target);
  try {
    localStorage.removeItem(SNOOZE_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

function _snooze(version) {
  try {
    localStorage.setItem(
      SNOOZE_KEY,
      JSON.stringify({ version: version || _targetVersion || 'unknown', until: Date.now() + SNOOZE_MS })
    );
  } catch {
    /* almacenamiento no disponible */
  }
}

function _renderBanner(worker, version) {
  _removeBanner();
  _injectStyles();

  const escape = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));

  const versionLabel = version ? `Versión ${escape(version)}` : 'Mejoras listas';

  const banner = document.createElement('div');
  banner.id = 'karpus-update-banner';
  banner.setAttribute('role', 'alertdialog');
  banner.setAttribute('aria-modal', 'true');
  banner.setAttribute('aria-labelledby', 'kub-title');
  banner.innerHTML = `
    <div class="kub-overlay"></div>
    <div class="kub-card">
      <div class="kub-glow"></div>
      <div class="kub-sparkles" aria-hidden="true">
        <span>✨</span><span>🚀</span><span>⭐</span><span>🌟</span><span>💫</span><span>🎉</span>
      </div>
      <div class="kub-version">${versionLabel}</div>
      <div class="kub-icon-wrap" aria-hidden="true">
        <div class="kub-ring kub-ring-1"></div>
        <div class="kub-ring kub-ring-2"></div>
        <div class="kub-ring kub-ring-3"></div>
        <span class="kub-icon">🆙</span>
      </div>
      <h2 class="kub-title" id="kub-title">¡Nueva actualización!</h2>
      <p class="kub-sub">Sonrisas Creativas se mejoró para ti.<br>Toca el botón para aplicar los cambios.</p>
      <button class="kub-btn" id="kubApplyBtn" type="button">
        <span class="kub-btn-icon">⚡</span>
        <span id="kubApplyText">Actualizar ahora</span>
      </button>
      <button class="kub-skip" id="kubSkipBtn" type="button">Recordar después</button>
    </div>
  `;

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('kub-visible'));

  const applyBtn = document.getElementById('kubApplyBtn');
  const applyText = document.getElementById('kubApplyText');
  const skipBtn = document.getElementById('kubSkipBtn');

  applyBtn.addEventListener('click', () => {
    applyBtn.disabled = true;
    applyText.textContent = 'Aplicando cambios...';
    applyBtn.querySelector('.kub-btn-icon').innerHTML = '<span class="kub-spinner"></span>';
    _markUpdated(version);
    _applyUpdate(worker);
  });

  skipBtn.addEventListener('click', () => {
    _snooze(version);
    _hideBanner();
  });

  setTimeout(() => applyBtn.focus(), 450);
}

function _applyUpdate(worker) {
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };

  const targetWorker = worker || _registration?.waiting || null;

  if (targetWorker) {
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    targetWorker.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(reload, 2500);
    return;
  }

  setTimeout(reload, 400);
}

function _hideBanner() {
  const banner = document.getElementById('karpus-update-banner');
  if (!banner) return;
  banner.classList.remove('kub-visible');
  banner.classList.add('kub-hiding');
  setTimeout(() => banner.remove(), 400);
}

function _removeBanner() {
  document.getElementById('karpus-update-banner')?.remove();
}

function _injectStyles() {
  if (document.getElementById('kub-styles')) return;
  const style = document.createElement('style');
  style.id = 'kub-styles';
  style.textContent = `
    #karpus-update-banner {
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none; opacity: 0;
      transition: opacity .35s ease;
    }
    #karpus-update-banner.kub-visible { opacity: 1; pointer-events: auto; }
    #karpus-update-banner.kub-hiding  { opacity: 0; pointer-events: none; }

    .kub-overlay {
      position: absolute; inset: 0;
      background: rgba(15,23,42,.78);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .kub-card {
      position: relative; z-index: 1;
      background: #fff; border-radius: 32px;
      padding: 40px 32px 32px;
      max-width: 380px; width: calc(100% - 32px);
      text-align: center;
      box-shadow: 0 32px 80px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.08);
      transform: translateY(48px) scale(.9);
      transition: transform .5s cubic-bezier(0.34,1.56,0.64,1);
      overflow: hidden;
    }
    #karpus-update-banner.kub-visible .kub-card {
      transform: translateY(0) scale(1);
      animation: kub-breathe 3.2s ease-in-out .6s infinite;
    }

    .kub-glow {
      position: absolute; inset: -40%;
      background: conic-gradient(from 0deg, #28B54D, #0B63C7, #7C3AED, #EC4899, #28B54D);
      opacity: .10;
      animation: kub-spin 9s linear infinite;
      pointer-events: none;
    }

    .kub-version {
      position: relative; z-index: 1;
      display: inline-block; margin: 0 auto 16px;
      padding: 6px 14px; border-radius: 999px;
      background: linear-gradient(135deg, #dcfce7, #dbeafe);
      color: #0B63C7; font-size: 11px; font-weight: 900;
      letter-spacing: .08em; text-transform: uppercase;
    }

    .kub-sparkles {
      position: absolute; inset: 0; pointer-events: none; overflow: hidden;
    }
    .kub-sparkles span {
      position: absolute; font-size: 18px;
      animation: kub-float 3s ease-in-out infinite;
    }
    .kub-sparkles span:nth-child(1) { left: 8%;  top: 14%; animation-delay: 0s;   animation-duration: 2.8s; }
    .kub-sparkles span:nth-child(2) { right: 8%; top: 18%; animation-delay: .4s;  animation-duration: 3.2s; }
    .kub-sparkles span:nth-child(3) { left: 14%; bottom: 22%; animation-delay: .8s; animation-duration: 2.6s; }
    .kub-sparkles span:nth-child(4) { right: 14%; bottom: 26%; animation-delay: .2s; animation-duration: 3.5s; }
    .kub-sparkles span:nth-child(5) { left: 46%; top: 8%; animation-delay: .6s;  animation-duration: 2.9s; }
    .kub-sparkles span:nth-child(6) { right: 30%; top: 42%; animation-delay: 1s;  animation-duration: 3.1s; }

    .kub-icon-wrap {
      position: relative; width: 104px; height: 104px;
      margin: 0 auto 22px;
      display: flex; align-items: center; justify-content: center;
    }
    .kub-ring {
      position: absolute; inset: 0; border-radius: 50%;
      border: 2.5px solid transparent; animation: kub-spin 3s linear infinite;
    }
    .kub-ring-1 { border-top-color: #28B54D; border-right-color: #28B54D55; }
    .kub-ring-2 { inset: 8px; border-top-color: #0B63C7; border-left-color: #0B63C755; animation-duration: 2s; animation-direction: reverse; }
    .kub-ring-3 { inset: 16px; border-top-color: #7C3AED; border-right-color: #7C3AED55; animation-duration: 4s; }
    .kub-icon {
      font-size: 44px; z-index: 1; position: relative;
      animation: kub-pulse 1.5s ease-in-out infinite;
    }

    .kub-title {
      font-size: 24px; font-weight: 900; color: #0f172a;
      margin: 0 0 8px; line-height: 1.15;
    }
    .kub-sub {
      font-size: 14px; color: #64748b; font-weight: 500;
      margin: 0 0 24px; line-height: 1.5;
    }

    .kub-btn {
      display: inline-flex; align-items: center; justify-content: center;
      gap: 8px; width: 100%; padding: 16px;
      background: linear-gradient(135deg, #28B54D, #239943);
      color: #fff; border: none; border-radius: 16px;
      font-size: 15px; font-weight: 900; cursor: pointer;
      box-shadow: 0 8px 24px rgba(40,181,77,.35);
      transition: transform .15s ease, box-shadow .15s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .kub-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(40,181,77,.45); }
    .kub-btn:active { transform: scale(.97); }
    .kub-btn:disabled { opacity: .75; cursor: default; transform: none; }
    .kub-btn-icon { font-size: 18px; display: inline-flex; align-items: center; }

    .kub-skip {
      display: block; margin: 12px auto 0;
      background: none; border: none; cursor: pointer;
      font-size: 12px; font-weight: 700; color: #94a3b8;
      -webkit-tap-highlight-color: transparent;
      padding: 6px 10px;
    }
    .kub-skip:hover { color: #64748b; }

    .kub-spinner {
      display: inline-block; width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,.3);
      border-top-color: #fff; border-radius: 50%;
      animation: kub-spin .7s linear infinite;
    }

    @keyframes kub-spin  { to { transform: rotate(360deg); } }
    @keyframes kub-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
    @keyframes kub-float { 0%,100% { transform: translateY(0) rotate(0deg); opacity:.7; } 50% { transform: translateY(-12px) rotate(15deg); opacity:1; } }
    @keyframes kub-breathe { 0%,100% { box-shadow: 0 32px 80px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.08); } 50% { box-shadow: 0 32px 90px rgba(40,181,77,.35), 0 0 0 1px rgba(255,255,255,.12); } }

    @media (max-width: 420px) {
      .kub-card { padding: 32px 20px 24px; border-radius: 28px; }
      .kub-title { font-size: 21px; }
      .kub-sub   { font-size: 13px; }
      .kub-btn   { font-size: 14px; padding: 14px; }
    }
  `;
  document.head.appendChild(style);
}
