#!/usr/bin/env bash
# GỘP LỊCH SỬ CŨ của kho dữ liệu — xem .github/workflows/compact-history.yml.
#
# Mỗi lần trang lưu dữ liệu là 1 commit chứa nguyên 1 bản data/vault.enc.json mới (~vài trăm KB, đã
# mã hóa nên git không nén gọn được). Không dọn thì lịch sử lớn dần mãi (cỡ 0,5–1 GB mỗi năm), tới
# lúc GitHub nhắc/chặn kho quá lớn. Script này viết lại lịch sử: gộp mọi thứ CŨ HƠN <keep> lần ghi
# gần nhất thành 1 commit gốc, GIỮ NGUYÊN <keep> lần ghi gần nhất (để còn khôi phục được bản cũ gần
# đây nếu lỡ tay).
#
# AN TOÀN DỮ LIỆU:
# - Nội dung file hiện tại KHÔNG đổi 1 byte: commit cuối sau khi gộp có đúng cây file của commit cuối
#   trước khi gộp (script tự kiểm tra, khác là dừng).
# - Chỉ đẩy đè khi đầu nhánh trên GitHub VẪN đúng là commit đã lấy về (--force-with-lease). Nếu trang
#   vừa ghi thêm dữ liệu trong lúc gộp thì lần đẩy bị từ chối → lấy về lại, gộp lại từ đầu; không bao
#   giờ đè mất lần ghi nào.
#
# Dùng (chạy bên trong bản checkout của kho dữ liệu): bash scripts/compact-history.sh <nhánh> [keep] [min]
#   min: chỉ gộp khi lịch sử đã có HƠN <min> lần ghi (mặc định = keep). Workflow chạy sau mỗi lần ghi
#   nên đặt min lớn hơn keep nhiều (vd 150) để không phải viết lại lịch sử sau từng lần lưu.
set -euo pipefail

BRANCH="${1:?Thiếu tên nhánh}"
KEEP="${2:-30}"
MIN="${3:-$KEEP}"
if [ "$MIN" -lt "$KEEP" ]; then MIN="$KEEP"; fi
# Máy chạy của GitHub Actions KHÔNG có sẵn tên/email git — phải tự đặt cho cả "người viết" (author)
# lẫn "người ghi" (committer), thiếu là git từ chối tạo commit ("empty ident name"). Commit gốc gộp
# dùng tên này; các commit được giữ lại thì vẫn mang đúng tác giả + ngày giờ gốc của chúng (đặt lại
# trong vòng lặp bên dưới).
export GIT_COMMITTER_NAME="github-actions[bot]"
export GIT_COMMITTER_EMAIL="github-actions[bot]@users.noreply.github.com"
export GIT_AUTHOR_NAME="$GIT_COMMITTER_NAME"
export GIT_AUTHOR_EMAIL="$GIT_COMMITTER_EMAIL"

# Đếm nhanh trước: lấy về tối đa MIN+1 commit. Ít hơn thế (hoặc chạm tới commit gốc thật) thì lịch
# sử còn gọn — thoát ngay, không viết lại gì.
git fetch --quiet --depth "$((MIN + 1))" origin "$BRANCH"
mapfile -t PROBE < <(git rev-list --reverse FETCH_HEAD)
if [ "${#PROBE[@]}" -le "$MIN" ] || ! git cat-file -p "${PROBE[0]}" | grep -q '^parent '; then
  echo "Lịch sử đang gọn (${#PROBE[@]} lần ghi, ngưỡng gộp ${MIN}) — không cần gộp."
  exit 0
fi

for attempt in 1 2 3 4 5; do
  git fetch --quiet --depth "$((KEEP + 1))" origin "$BRANCH"
  HEAD_SHA="$(git rev-parse FETCH_HEAD)"
  mapfile -t COMMITS < <(git rev-list --reverse FETCH_HEAD)
  TOTAL="${#COMMITS[@]}"
  BASE="${COMMITS[0]}"

  # Commit cũ nhất lấy về mà KHÔNG có commit cha thì nó là commit gốc thật → cả lịch sử chỉ có TOTAL
  # commit, không còn gì cũ hơn để gộp. (Xem thẳng nội dung commit: bản lấy nông che mất cha của
  # commit ở "điểm cắt" khi duyệt lịch sử, nhưng dòng "parent" vẫn nằm trong chính commit đó.)
  if [ "$TOTAL" -le "$KEEP" ] || ! git cat-file -p "$BASE" | grep -q '^parent '; then
    echo "Lịch sử đang gọn (${TOTAL} lần ghi) — không cần gộp."
    exit 0
  fi

  NEW="$(git commit-tree "${BASE}^{tree}" -m "Gộp lịch sử cũ (giữ ${KEEP} lần ghi gần nhất) — xem .github/workflows/compact-history.yml")"
  for c in "${COMMITS[@]:1}"; do
    NEW="$(
      GIT_AUTHOR_NAME="$(git log -1 --format=%an "$c")" \
      GIT_AUTHOR_EMAIL="$(git log -1 --format=%ae "$c")" \
      GIT_AUTHOR_DATE="$(git log -1 --format=%aI "$c")" \
      git commit-tree "${c}^{tree}" -p "$NEW" -m "$(git log -1 --format=%B "$c")"
    )"
  done

  if [ "$(git rev-parse "${NEW}^{tree}")" != "$(git rev-parse "${HEAD_SHA}^{tree}")" ]; then
    echo "::error::Cây file sau khi gộp KHÁC trước khi gộp — dừng, không đẩy gì."
    exit 1
  fi

  if git push --quiet --force-with-lease="${BRANCH}:${HEAD_SHA}" origin "${NEW}:refs/heads/${BRANCH}"; then
    echo "Đã gộp lịch sử: giữ $((TOTAL - 1)) lần ghi gần nhất + 1 commit gốc chứa toàn bộ phần cũ hơn."
    exit 0
  fi
  echo "Trang vừa ghi dữ liệu trong lúc gộp (lần ${attempt}) — lấy về lại rồi gộp lại."
  sleep "$((attempt * 4))"
done

echo "::warning::Chưa gộp được sau 5 lần (trang ghi dữ liệu liên tục) — lần ghi dữ liệu kế tiếp sẽ thử lại."
exit 0
