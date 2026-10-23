// Service worker do PWA e das notificações push. Não faz cache —
// cada requisição vai direto pra rede, então nunca serve conteúdo velho.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload;
      try {
        payload = event.data?.json();
      } catch {
        return;
      }
      if (!payload || typeof payload.tag !== 'string') return;
      // Recheck the current account and ranking participation on shared devices.
      // The authenticated feed is also the source of the message: never display a score payload.
      const response = await fetch('/api/notifications', {
        credentials: 'include',
        cache: 'no-store',
      }).catch(() => null);
      if (!response?.ok) return;
      const feed = await response.json();
      const notification =
        feed.enabled && feed.notifications.find((item) => item.id === payload.tag);
      if (!notification) return;
      await self.registration.showNotification('WOD Coach AI', {
        body: notification.message,
        icon: '/icon-192.png',
        tag: notification.id,
        data: { url: '/ranking' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL('/ranking', self.location.origin).href;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(url);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
