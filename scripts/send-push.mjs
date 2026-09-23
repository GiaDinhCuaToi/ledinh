// Gửi Web Push tới đúng các user_id được liệt kê trong data/push-trigger.json, dựa vào danh
// sách đăng ký ở data/push-subscriptions.json. Chạy bởi .github/workflows/send-push.yml (ở repo
// public "ledinh") mỗi khi push-trigger.json thay đổi (do chính trang web ghi qua GitHub
// Contents API lúc runtime — xem lib/vault/push.ts).
//
// File này được deploy sang repo "ledinh" qua chính pipeline build tĩnh (nằm trong thư mục
// public/ nên Next.js copy y nguyên vào out/, rồi .github/workflows/deploy.yml đẩy sang đó) —
// vì Claude không có quyền push trực tiếp vào repo "ledinh". Sửa file này thì sửa Ở ĐÂY, không
// sửa trực tiếp bên repo ledinh (lần deploy sau sẽ ghi đè mất).
import webpush from "web-push"
import { readFile } from "node:fs/promises"

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf-8"))
  } catch {
    return fallback
  }
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "https://giadinhcuatoi.github.io/ledinh"

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Thiếu VAPID_PUBLIC_KEY hoặc VAPID_PRIVATE_KEY (secret VAPID_PRIVATE_KEY chưa được cấu hình?).")
  process.exit(1)
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const trigger = await readJson("data/push-trigger.json", null)
if (!trigger || !Array.isArray(trigger.recipients) || trigger.recipients.length === 0) {
  console.log("Không có người nhận nào trong push-trigger.json — bỏ qua.")
  process.exit(0)
}

const subscriptions = await readJson("data/push-subscriptions.json", [])
const targets = subscriptions.filter((s) => trigger.recipients.includes(s.user_id))

if (targets.length === 0) {
  console.log("Không ai trong danh sách nhận đã bật thông báo đẩy — bỏ qua.")
  process.exit(0)
}

const payload = JSON.stringify({
  title: "Dòng Họ Lê Đình",
  body: trigger.message || "Có thông báo mới — mở trang để xem.",
  url: "./",
})

let sent = 0
let failed = 0
for (const target of targets) {
  try {
    await webpush.sendNotification(target.subscription, payload)
    sent++
  } catch (err) {
    failed++
    // 404/410 = subscription đã hết hạn/bị thu hồi (gỡ cài đặt, đổi trình duyệt, v.v.) — bình
    // thường, không phải lỗi. Không tự xóa khỏi danh sách ở đây để giữ script đơn giản
    // (read-only); danh sách sẽ tự cập nhật khi người dùng bật lại thông báo đẩy trên máy đó.
    console.error(`Gửi thất bại cho user_id=${target.user_id}: ${err.statusCode || err.message}`)
  }
}

console.log(`Đã gửi ${sent}/${targets.length} thông báo đẩy (${failed} thất bại/hết hạn).`)
