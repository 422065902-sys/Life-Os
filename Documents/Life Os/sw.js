/**
 * ═══════════════════════════════════════════════════════════════
 *  LIFE OS — Service Worker
 *  - Notificaciones Push (Web Push API + FCM)
 *  - Cache First para assets estáticos
 *  - Network First para APIs y datos dinámicos
 * ═══════════════════════════════════════════════════════════════
 */

const CACHE_NAME    = 'lifeos-v11';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/styles.css',
  '/main.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Instalación: pre-cachear assets estáticos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activación: limpiar caches viejas ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: Cache First para assets estáticos, Network First para APIs ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorar extensiones de Chrome, firebase, stripe y otras APIs externas
  if (
    url.protocol === 'chrome-extension:' ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('stripe') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('fonts') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Cache First: index.html y assets locales
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Para solicitudes de navegación (HTML), mostrar offline.html con branding
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          // Para otros assets, intentar la caché o devolver vacío
          return caches.match(event.request);
        });
      })
    );
    return;
  }

  // Network First: cualquier otra URL externa
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── Push: recibir notificación del servidor ──
self.addEventListener('push', event => {
  let payload = { title: 'Life OS', body: 'Nueva notificación', icon: '/icons/icon-192.png', url: '/', tag: 'lifeos-general' };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch(e) {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:              payload.body,
      icon:              payload.icon || '/icons/icon-192.png',
      badge:             '/icons/icon-192.png',
      tag:               payload.tag  || 'lifeos-general',
      requireInteraction: false,
      data:              { url: payload.url || '/' },
    })
  );
});

// ── NotificationClick: abrir o enfocar la app al hacer clic ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si ya hay una ventana de la app abierta, enfocarla
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
