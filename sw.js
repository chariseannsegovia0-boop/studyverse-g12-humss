self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'STUDYVERSE Reminder ⏰';
  const options = {
    body: data.body || 'You have a scheduled STUDYVERSE reminder.',
    tag: data.tag || 'studyverse-reminder',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || './', taskId: data.taskId || null },
    actions: [{ action: 'open', title: 'Open STUDYVERSE' }]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : './';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(url);
  }));
});
