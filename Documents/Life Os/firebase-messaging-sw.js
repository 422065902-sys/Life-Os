importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const _IS_STAGING = self.location.hostname.includes('mylifeos-staging');
firebase.initializeApp(_IS_STAGING ? {
  apiKey:            "AIzaSyDoSVDHs0dfmttl7vUrp-Qf1Qz2qJ8tF4E",
  authDomain:        "mylifeos-staging.firebaseapp.com",
  projectId:         "mylifeos-staging",
  storageBucket:     "mylifeos-staging.firebasestorage.app",
  messagingSenderId: "955142565160",
  appId:             "1:955142565160:web:bc240d2d30743f746b741d"
} : {
  apiKey:            "AIzaSyATQklLWsLAzSqnWkVzcYgz-FVr_Q7eyyQ",
  authDomain:        "life-os-prod-3a590.firebaseapp.com",
  projectId:         "life-os-prod-3a590",
  storageBucket:     "life-os-prod-3a590.firebasestorage.app",
  messagingSenderId: "25285159906",
  appId:             "1:25285159906:web:8e8d648a7a04097bc8a7bb",
  measurementId:     "G-DP8YMBQFCK"
});

const messaging = firebase.messaging();

// ── OFFLINE CACHE ─────────────────────────────────────────────
const CACHE_NAME = 'lifeos-shell-v2';
const APP_SHELL  = ['/', '/index.html', '/main.js', '/styles.css',
                    '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Navegación: network-first, fallback a index.html cacheado
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets estáticos: cache-first, actualiza cache en background
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        return res;
      });
      return cached || network;
    })
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Life OS', {
    body:    body  || '',
    icon:    icon  || '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    tag:     payload.data?.tag || 'life-os',
    data:    { url: payload.data?.url || '/' },
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
