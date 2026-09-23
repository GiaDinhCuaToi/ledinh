// Service Worker tối giản — CHỈ để nhận Web Push và hiện thông báo hệ điều hành, không cache gì
// cả (trang này không cần chạy offline). Đường dẫn tương đối bên dưới tự resolve theo đúng vị
// trí file này (vd /ledinh/sw.js) nên không cần biết basePath là gì.

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Dòng Họ Lê Đình", {
      body: data.body || "Có thông báo mới — mở trang để xem.",
      icon: "apple-icon.png",
      badge: "icon-light-32x32.png",
      data: { url: data.url || "./" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || "./", self.registration.scope).href

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
