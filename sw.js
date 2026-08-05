/**
 * Colegio Montessori Sonrisas Creativas — Service Worker PWA
 * Las notificaciones push de OneSignal se manejan en un service worker
 * dedicado (push/onesignal/OneSignalSDKWorker.js, scope /push/onesignal/)
 * para evitar conflictos de handlers con este worker.
 */

const CACHE_NAME = 'karpus-pwa-v9';

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

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // ✅ CACHÉ DE FUENTES Y CDN (Stale-while-revalidate)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(networkResponse => {
          // ✅ FIX: clonar dentro de try/catch — el navegador puede entregar el
          // mismo Response para dos fetch del mismo URL, y un segundo clone()
          // lanzaría "Response body is already used".
          if (networkResponse.ok && networkResponse.status === 200) {
            try {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy)).catch(() => {});
            } catch (_) { /* cuerpo ya consumido — omitir caché */ }
          }
          return networkResponse;
        });
        return cached || fetchPromise;
      })
    );
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
    e.respondWith(
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
    );
  }
});
