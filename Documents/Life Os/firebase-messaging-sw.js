importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyATQklLWsLAzSqnWkVzcYgz-FVr_Q7eyyQ",
  authDomain:        "life-os-prod-3a590.firebaseapp.com",
  projectId:         "life-os-prod-3a590",
  storageBucket:     "life-os-prod-3a590.firebasestorage.app",
  messagingSenderId: "25285159906",
  appId:             "1:25285159906:web:8e8d648a7a04097bc8a7bb",
  measurementId:     "G-DP8YMBQFCK"
});

const messaging = firebase.messaging();

// Manejar notificaciones cuando la app está en segundo plano o cerrada
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

// Al hacer clic en la notificación, abrir/enfocar la app
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
