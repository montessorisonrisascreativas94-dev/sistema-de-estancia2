/**
 * sw.js — Service Worker · Colegio Montessori Sonrisas Creativas
 * ─────────────────────────────────────────────────────────────────
 * PARA PUBLICAR UNA ACTUALIZACIÓN:
 *   Solo cambia el número en APP_VERSION (ej: 1.0.1 → 1.0.2)
 *   Al hacer deploy, todos los dispositivos verán el banner de actualización.
 */
const APP_VERSION = '1.0.2';
const CACHE_NAME = `sonrisas-v${APP_VERSION}`;

// Archivos a cachear en la instalación inicial
const PRECACHE = [
  '/login.html',
  '/index.html',
  '/panel-maestra.html',
  '/panel_directora.html',
  '/panel_asistente.html',
  '/panel_encargada.html',
  '/panel_padres.html',
  '/panel_control.html',
  '/css/theme.css',
  '/css/layout.css',
  '/css/montessori-modern.css',
  '/logo/android-chrome-192x192.png',
];

// ── INSTALL: precachear archivos base ─────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    )
  );
});

// ── ACTIVATE: limpiar cachés viejos y avisar a clientes ──────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const oldKeys = keys.filter((key) => key !== CACHE_NAME);
      const hadOldCache = oldKeys.length > 0;

      await Promise.all(oldKeys.map((key) => caches.delete(key)));
      await self.clients.claim();

      // Solo avisar si de verdad veníamos de una versión anterior
      if (hadOldCache) {
        const clients = await self.clients.matchAll({
          includeUncontrolled: true,
          type: 'window',
        });
        clients.forEach((client) => {
          client.postMessage({
            type: 'APP_UPDATED',
            version: APP_VERSION,
          });
        });
      }
    })()
  );
});

// ── FETCH: network-first con fallback a caché ────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── MESSAGE: permitir que el banner active la nueva versión ──────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
