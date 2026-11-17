// Gửi thông báo đẩy TRỰC TIẾP khi có người nộp yêu cầu ĐĂNG KÝ TÀI KHOẢN hoặc ĐỔI MẬT KHẨU mới —
// chạy bởi .github/workflows/notify-registration-push.yml ngay khi Issue tương ứng được tạo
// TRONG CHÍNH repo này (ledinh) — xem lib/vault/github.ts: createRegistrationIssue/
// createPasswordResetIssue (nguồn tại webclientFamily.client/, deploy sang đây).
//
// Vì sao cần Action riêng (không để trang web tự gọi lib/vault/push.ts như bài đăng/bình luận):
// người NỘP yêu cầu đăng ký thường CHƯA có tài khoản (hoặc quên mật khẩu, chưa đăng nhập được),
// nên không có GitHub Token quyền ghi để tự kích hoạt luồng thông báo đẩy thông thường. Workflow
// này tự đọc danh sách thiết bị đã đăng ký đẩy (data/push-subscriptions.json, đã có sẵn trong
// CHÍNH repo này nhờ actions/checkout) rồi gửi thẳng bằng web-push — không ghi file nào, không
// cần GitHub Token (khác hẳn cách làm cũ phải ghi CHÉO sang repo khác qua Contents API).
//
// Gửi tới MỌI thiết bị đã bật thông báo đẩy (không lọc riêng admin) — khớp với cách thông báo
// trong-app hiện tại cũng báo số lượng yêu cầu chờ duyệt cho MỌI người đã đăng nhập, không riêng
// admin (xem refreshPendingRegistrationCount trong components/vault-provider.tsx).
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
const issueKind = process.env.ISSUE_KIND // "registration" | "password_reset"
const issueBody = process.env.ISSUE_BODY || ""

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Thiếu VAPID_PUBLIC_KEY hoặc VAPID_PRIVATE_KEY (secret VAPID_PRIVATE_KEY chưa được cấu hình?).")
  process.exit(1)
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

/** Thiết bị vừa nộp yêu cầu này có thể đã bật sẵn thông báo đẩy (từ lần đăng nhập trước) — lấy
 * endpoint của nó (nếu có) từ payload JSON trong nội dung Issue để KHÔNG tự báo lại cho chính
 * thiết bị đó (xem lib/types.ts: PendingRegistration.excludePushEndpoint — field này nằm NGOÀI
 * khối mã hóa hybrid nên đọc thẳng được; bản thân 1 endpoint không lộ danh tính ai, chỉ là địa
 * chỉ đẩy của 1 trình duyệt cụ thể). */
function extractExcludeEndpoint(body) {
  const match = body.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const payload = JSON.parse(match[1])
    return typeof payload.excludePushEndpoint === "string" ? payload.excludePushEndpoint : null
  } catch {
    return null
  }
}

const excludeEndpoint = extractExcludeEndpoint(issueBody)
const message =
  issueKind === "password_reset"
    ? "Có yêu cầu đổi mật khẩu mới đang chờ duyệt — mở app để xem."
    : "Có yêu cầu đăng ký tài khoản mới đang chờ duyệt — mở app để xem."

const subscriptions = await readJson("data/push-subscriptions.json", [])
const targets = subscriptions.filter((s) => s.subscription?.endpoint !== excludeEndpoint)

if (targets.length === 0) {
  console.log("Chưa có thiết bị nào bật thông báo đẩy — bỏ qua.")
  process.exit(0)
}

const payload = JSON.stringify({
  title: "Dòng Họ Lê Đình",
  body: message,
  url: "./",
  postId: null,
  commentId: null,
})

let sent = 0
let failed = 0
for (const target of targets) {
  try {
    await webpush.sendNotification(target.subscription, payload)
    sent++
  } catch (err) {
    failed++
    // 404/410 = subscription đã hết hạn/bị thu hồi — bình thường, không phải lỗi.
    console.error(`Gửi thất bại cho user_id=${target.user_id}: ${err.statusCode || err.message}`)
  }
}

console.log(
  `Đã gửi ${sent}/${targets.length} thông báo đẩy (${issueKind || "registration"}, ${failed} thất bại/hết hạn)` +
    (excludeEndpoint ? " (trừ chính thiết bị vừa nộp yêu cầu)." : ".")
)
