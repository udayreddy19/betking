/**
 * OddsYra Production Web Push Service Worker
 * Handles background push notifications and tab focus / navigation on click.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: 'OddsYra',
      body: event.data ? event.data.text() : 'You have a new update.',
    };
  }

  const title = data.title || 'OddsYra';
  const options = {
    body: data.body || '',
    icon: data.icon || '/oddsyra-logo.png',
    badge: data.badge || '/favicon-32.png',
    tag: data.tag || `oddsyra-notif-${Date.now()}`,
    renotify: true,
    data: data.data || { url: '/notifications' },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/notifications';

  const fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && client.url !== fullUrl) {
            client.navigate(fullUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl);
      }
    })
  );
});
