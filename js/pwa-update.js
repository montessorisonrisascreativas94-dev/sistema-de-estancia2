(function () {
  if (!('serviceWorker' in navigator)) return;

  var registration = null;

  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(function (reg) {
      registration = reg;

      if (reg.waiting) {
        showUpdateCard(reg.waiting);
      }

      reg.addEventListener('updatefound', function () {
        var newWorker = reg.installing;
        newWorker.addEventListener('statechange', function () {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateCard(newWorker);
          }
        });
      });
    })
    .catch(function () {});

  function showUpdateCard(worker) {
    if (document.getElementById('pwa-update-card')) return;

    var card = document.createElement('div');
    card.id = 'pwa-update-card';
    card.setAttribute('role', 'alert');
    card.innerHTML =
      '<div id="pwa-update-inner">' +
        '<div id="pwa-update-icon">\uD83D\uDE80</div>' +
        '<div id="pwa-update-body">' +
          '<p id="pwa-update-title">Nueva versi\u00F3n disponible</p>' +
          '<p id="pwa-update-desc">Hemos agregado nuevas funciones y mejoras.</p>' +
        '</div>' +
        '<button id="pwa-update-btn">Actualizar ahora</button>' +
      '</div>';

    document.body.appendChild(card);

    document.getElementById('pwa-update-btn').addEventListener('click', function () {
      card.classList.add('pwa-update-dismissing');
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        window.location.reload();
      });
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  }

  var style = document.createElement('style');
  style.textContent =
    '#pwa-update-card{position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:16px;animation:pwa-update-slide-up 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards}' +
    '#pwa-update-inner{max-width:420px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);padding:16px 20px;display:flex;align-items:center;gap:12px;border:1px solid #e2e8f0}' +
    '#pwa-update-icon{width:44px;height:44px;background:#dcfce7;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}' +
    '#pwa-update-body{flex:1;min-width:0}' +
    '#pwa-update-title{font-size:14px;font-weight:900;color:#1e293b;line-height:1.3;margin:0}' +
    '#pwa-update-desc{font-size:11px;font-weight:600;color:#94a3b8;margin:2px 0 0;line-height:1.3}' +
    '#pwa-update-btn{padding:8px 18px;background:#22c55e;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background 0.2s}' +
    '#pwa-update-btn:hover{background:#16a34a}' +
    '@keyframes pwa-update-slide-up{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}' +
    '.pwa-update-dismissing{animation:pwa-update-slide-down 0.25s ease forwards !important}' +
    '@keyframes pwa-update-slide-down{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}';
  document.head.appendChild(style);
})();
