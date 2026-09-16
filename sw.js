/**
 * Colegio Montessori Sonrisas Creativas — Service Worker PWA
 * Las notificaciones push de OneSignal se manejan en un service worker
 * dedicado (push/onesignal/OneSignalSDKWorker.js, scope /push/onesignal/)
 * para evitar conflictos de handlers con este worker.
 */

const CACHE_NAME = 'karpus-pwa-v11';

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const ASSETS = [
  './',
  'login.html',
  'css/panel-padre.css',
  'logo/favicon.ico',
  'img/mundo.jpg',
  'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Inter:wght@400;700;900&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});

// ✅ FIX: nunca pasar `undefined` a respondWith() — eso lanza
// "Failed to convert value to 'Response'". Siempre devolvemos un Response real.
function _safeRespond(promise) {
  return Promise.resolve(promise).then(res => {
    if (res && typeof res.status === 'number') return res;
    // Fallback si la caché no tiene nada
    return new Response('<!doctype html><meta charset="utf-8"><title>Sin conexión</title><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>&#128421;&#65039; Sin conexión</h2><p style="color:#64748b">Revisa tu conexión e inténtalo de nuevo.</p></div></body>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // ✅ CACHÉ DE FUENTES Y CDN (Stale-while-revalidate)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(_safeRespond(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(networkResponse => {
          if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
            try {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy)).catch(() => {});
            } catch (_) { /* cuerpo ya consumido — omitir caché */ }
          }
          return networkResponse;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    ));
    return;
  }

  // No interceptar requests críticos de OneSignal ni Auth/Supabase ni Storage
  if (
    url.hostname.includes('onesignal.com') ||
    url.hostname.includes('supabase.co') || // Exclude all Supabase requests
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('OneSignal')
  ) {
    return;
  }

  // ✅ CACHÉ DE ASSETS ESTÁTICOS CORE
  const isCoreAsset = url.pathname.endsWith('.css') ||
                     url.pathname.endsWith('.js') ||
                     url.pathname.endsWith('.png') ||
                     url.pathname.endsWith('.jpg') ||
                     url.pathname.endsWith('.svg');

  if (isCoreAsset || url.origin === self.location.origin) {
    e.respondWith(_safeRespond(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.type === 'basic' && res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
          }
          return res;
        }).catch(() => caches.match('login.html'));
      })
    ));
  }
});
