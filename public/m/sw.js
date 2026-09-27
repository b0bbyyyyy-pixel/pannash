self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Gostwrk Text', body: 'New text', url: '/m/text' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // keep defaults
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Gostwrk Text', {
    body: data.body || '',
    data: { url: data.url || '/m/text' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/m/text';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if (client.url.includes('/m/text') && 'focus' in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
