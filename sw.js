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
    (async () => {
      await self.registration.showNotification(data.title || "Dòng Họ Lê Đình", {
        body: data.body || "Có thông báo mới — mở trang để xem.",
        icon: "apple-icon.png",
        badge: "icon-light-32x32.png",
        data: { url: data.url || "./", postId: data.postId || null, commentId: data.commentId || null },
      })
      // Số trên icon app ngoài màn hình chính (Badging API) — không phải trình duyệt nào cũng hỗ
      // trợ (có trên Chrome/Android, Safari iOS 16.4+ khi đã "Thêm vào Màn hình chính"), bỏ qua
      // im lặng nếu không có. Dùng số thông báo hệ điều hành ĐANG HIỂN THỊ (chưa bấm/dismiss) làm
      // số đếm — Service Worker không giải mã được vault nên không biết chính xác số "chưa đọc"
      // thật trong app, đây chỉ là số gần đúng để báo "có việc mới"; app tự sửa lại đúng số thật
      // ngay khi mở lên (xem components/header.tsx).
      if (self.navigator && self.navigator.setAppBadge) {
        try {
          const notifications = await self.registration.getNotifications()
          await self.navigator.setAppBadge(notifications.length)
        } catch {
          // Bỏ qua.
        }
      }
    })()
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = event.notification.data || {}
  const targetUrl = new URL(target.url || "./", self.registration.scope)
  // Trang CHƯA MỞ sẵn thì phải nhờ openWindow — không có cách postMessage, nên gắn target vào
  // URL dạng query, để app tự đọc lúc khởi động (xem components/header.tsx).
  if (target.postId) targetUrl.searchParams.set("notifPostId", target.postId)
  if (target.commentId) targetUrl.searchParams.set("notifCommentId", target.commentId)

  event.waitUntil(
    (async () => {
      if (self.navigator && self.navigator.setAppBadge) {
        try {
          const remaining = await self.registration.getNotifications()
          if (remaining.length > 0) await self.navigator.setAppBadge(remaining.length)
          else await self.navigator.clearAppBadge()
        } catch {
          // Bỏ qua.
        }
      }

      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of clientsList) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          // Trang ĐÃ MỞ SẴN — KHÔNG navigate lại (sẽ mất hết state đang có, vd đang gõ dở bài),
          // chỉ báo cho trang tự kéo tới đúng bài/bình luận qua postMessage.
          if (target.postId) {
            client.postMessage({ type: "scroll-to-notification", postId: target.postId, commentId: target.commentId || null })
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl.href)
    })()
  )
})
