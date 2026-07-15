// 光輝 CRM 推播 Service Worker

// 最小 fetch 處理器：Chrome 認定為「可安裝 PWA」的必要條件（交給瀏覽器預設處理）
self.addEventListener('fetch', function () {})

self.addEventListener('push', function (event) {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { title: '光輝 CRM', body: event.data ? event.data.text() : '' } }
  const title = data.title || '光輝 CRM'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/messages' },
    vibrate: [200, 100, 200],
    tag: data.tag || undefined,
    renotify: !!data.tag,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/messages'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus() }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
