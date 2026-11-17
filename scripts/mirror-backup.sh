#!/usr/bin/env bash
# SAO LƯU TỰ ĐỘNG SANG NƠI THỨ HAI — xem .github/workflows/mirror-backup.yml.
#
# Chép nguyên kho dữ liệu này (đã mã hóa) sang 1 dịch vụ git khác (Codeberg, GitLab…) để nếu một
# ngày GitHub khóa tài khoản/đổi luật/đóng cửa thì dữ liệu vẫn còn. Kho ảnh riêng (danh sách trong
# data/media-repos.json) cũng được chép, sang kho CÙNG TÊN ở cùng chỗ với kho chính bên kia.
#
# Cần secret MIRROR_REMOTE_URL dạng https://<tên>:<token>@codeberg.org/<tên>/<kho>.git
# Chưa đặt thì script chỉ in lời nhắc rồi thoát (không báo lỗi).
#
# Dùng (chạy bên trong bản checkout ĐẦY ĐỦ lịch sử của kho dữ liệu):
#   MIRROR_REMOTE_URL=... bash scripts/mirror-backup.sh <nhánh>
set -euo pipefail

BRANCH="${1:?Thiếu tên nhánh}"
URL="${MIRROR_REMOTE_URL:-}"
SOURCE_HOST="${MIRROR_SOURCE_HOST:-https://github.com}"
if [ -z "$URL" ]; then
  echo "Chưa đặt secret MIRROR_REMOTE_URL — chưa sao lưu sang nơi thứ hai (xem hướng dẫn ở hộp 'Bảo Toàn Lâu Dài')."
  exit 0
fi

# --force: lịch sử ở đây có thể được gộp lại (compact-history.yml) → bên kia phải nhận bản viết lại.
git push --quiet --force "$URL" "HEAD:refs/heads/${BRANCH}"
echo "Đã chép kho dữ liệu sang nơi thứ hai."

[ -f data/media-repos.json ] || exit 0
BASE="${URL%/*}"
REPOS="$(node -e 'const r=JSON.parse(require("fs").readFileSync("data/media-repos.json","utf8")).repos;console.log((Array.isArray(r)?r:[]).filter(x=>/^[\w.-]+\/[\w.-]+$/.test(x)).join("\n"))')"
for repo in $REPOS; do
  name="${repo#*/}"
  src="${SOURCE_HOST}/${repo}.git"
  dst="${BASE}/${name}.git"
  here="$(git ls-remote "$src" "refs/heads/${BRANCH}" | cut -f1)"
  there="$(git ls-remote "$dst" "refs/heads/${BRANCH}" 2>/dev/null | cut -f1 || true)"
  if [ -n "$here" ] && [ "$here" = "$there" ]; then
    echo "Kho ảnh ${repo}: bên kia đã mới nhất."
    continue
  fi
  tmp="$(mktemp -d)"
  if git clone --quiet --bare --single-branch --branch "$BRANCH" "$src" "$tmp/r.git" &&
     git -C "$tmp/r.git" push --quiet --force "$dst" "refs/heads/${BRANCH}:refs/heads/${BRANCH}"; then
    echo "Đã chép kho ảnh ${repo}."
  else
    echo "::warning::Chưa chép được kho ảnh ${repo} — kiểm tra đã tạo kho trống tên '${name}' bên nơi sao lưu chưa."
  fi
  rm -rf "$tmp"
done
