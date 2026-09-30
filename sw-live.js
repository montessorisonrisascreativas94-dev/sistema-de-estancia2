/**
 * Colegio Montessori Sonrisas Creativas — Service Worker PWA for Attendance Live
 */

const CACHE_NAME = 'karpus-live-v3';
const ASSETS = [
  './attendance-live.html',
  'js/shared/html5-qrcode.min.js',
  'css/karpus-tailwind.css',
  'js/shared/supabase-js.min.js'
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

function _safeRespond(promise) {
  return Promise.resolve(promise).then(res => {
    if (res && typeof res.status === 'number') return res;
    return new Response('<!doctype html><meta charset="utf-8"><title>Sin conexión</title><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0"><h2>Sin conexión</h2></body>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase.co')) return;
  if (url.origin !== self.location.origin) return;

  e.respondWith(_safeRespond(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.type === 'basic' && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./attendance-live.html'));
    })
  ));
});
