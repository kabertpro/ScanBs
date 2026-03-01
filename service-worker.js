/* =====================================================
   VeriBs — Service Worker
   Cache offline-first para todos los assets estáticos
   ===================================================== */

const CACHE_NAME   = 'veribs-v1.0.0';
const OFFLINE_PAGE = './index.html';

// Assets que se cachean durante la instalación
const PRECACHE_ASSETS = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];

// ── Instalación: pre-cachear assets ─────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-cacheando assets…');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Error en pre-cache:', err))
  );
});

// ── Activación: limpiar caches anteriores ───────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activando…');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando cache antiguo:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: Estrategia Cache-First con fallback a red ────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptar peticiones GET del mismo origen o CDNs conocidas
  if (request.method !== 'GET') return;

  // Para CDNs (Tesseract.js, Google Fonts) → Network-first con cache fallback
  const isExternal = url.origin !== self.location.origin;

  if (isExternal) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Para assets locales → Cache-first
  event.respondWith(cacheFirstStrategy(request));
});

// ── Estrategia: Cache First ──────────────────────────────
async function cacheFirstStrategy(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    // No está en cache → intentar red
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Sin red y sin cache → devolver página principal si existe
    const fallback = await caches.match(OFFLINE_PAGE);
    return fallback || new Response('Sin conexión', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ── Estrategia: Network First ────────────────────────────
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Sin red → intentar cache
    const cached = await caches.match(request);
    return cached || new Response('Sin conexión', { status: 503 });
  }
}

// ── Mensajes desde el cliente ────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ status: 'ok' });
    });
  }
});
