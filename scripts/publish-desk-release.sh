#!/usr/bin/env bash
# Dựng bản phát hành JAVIS Desk cho updater trong app (src/javis-updater.js), CHƯA tải lên.
#
#   bash scripts/publish-desk-release.sh ["Ghi chú bản mới"]
#
# Làm: build renderer → mac arm64 + x64 (.app, ký chứng chỉ cố định JAVIS bằng scripts/sign-mac.sh,
# zip giữ symlink) → win x64 NSIS exe → sha256 + size → dist/release/latest.json → IN lệnh rsync.
# Chạy trên Linux (cần rcodesign + ~/.javis-signing; xem scripts/sign-mac.sh init).
#
# latest.json (gateway đọc file này; GET /fleet/desk/app/latest?platform=X trả platforms[X]):
#   { "version": "0.12.3", "notes": "...", "published_at": "...",
#     "platforms": { "mac-arm64": {version,url,sha256,size,notes}, "mac-x64": {...}, "win-x64": {...} } }
# url tương đối với gateway (app tự ghép), mặc định /fleet/desk/app/files/<tệp>.
#
# Biến môi trường:
#   RELEASE_URL_BASE   (mặc định /fleet/desk/app/files)
#   RELEASE_DEST       đích rsync (mặc định nhutpm7777@server-google-vscode:/home/bumbee_workspace/javis-desk-releases/)
#   SKIP_WIN=1 / SKIP_MAC_X64=1   bỏ bớt gói khi thử nhanh
set -euo pipefail
cd "$(dirname "$0")/.."

NOTES="${1:-}"
VER="$(node -p "require('./package.json').version")"
URL_BASE="${RELEASE_URL_BASE:-/fleet/desk/app/files}"
DEST="${RELEASE_DEST:-nhutpm7777@server-google-vscode:/home/bumbee_workspace/javis-desk-releases/}"
OUT="dist/release"
export CSC_IDENTITY_AUTO_DISCOVERY=false

npm test
npm run build:renderer
rm -rf dist
mkdir -p "$OUT"

# macOS: dựng .app (dir) rồi tự ký + zip — electron-builder không ký được trên Linux.
MAC_ARCHS="--arm64"; [ "${SKIP_MAC_X64:-0}" = "1" ] || MAC_ARCHS="--arm64 --x64"
npx electron-builder --mac dir $MAC_ARCHS --publish never
for arch in arm64 x64; do
  [ "$arch" = x64 ] && [ "${SKIP_MAC_X64:-0}" = "1" ] && continue
  app="dist/mac-$arch/JAVIS.app"; [ "$arch" = x64 ] && [ ! -d "$app" ] && app="dist/mac/JAVIS.app"
  [ -d "$app" ] || { echo "Không thấy $app"; exit 1; }
  bash scripts/sign-mac.sh sign "$app"
  bash scripts/sign-mac.sh zip "$app" "$OUT/JAVIS-$VER-mac-$arch.zip"
done

if [ "${SKIP_WIN:-0}" != "1" ]; then
  if command -v wine >/dev/null 2>&1; then
    npx electron-builder --win nsis --x64 --publish never
  else
    # NSIS trên Linux cần wine: dùng image electronuserland/builder:wine (không cài wine vào máy).
    # Gắn thư mục cha để symlink node_modules (nếu có) vẫn trỏ đúng; chạy bằng uid hiện tại.
    PARENT="$(cd .. && pwd)"
    WHOME="$(mktemp -d)"  # HOME riêng cho wine (wine đòi thư mục thuộc đúng uid)
    trap 'rm -rf "$WHOME"' EXIT
    docker run --rm -u "$(id -u):$(id -g)" -e HOME="$WHOME" -v "$WHOME:$WHOME" -e CSC_IDENTITY_AUTO_DISCOVERY=false \
      -e ELECTRON_CACHE=/cache/electron -e ELECTRON_BUILDER_CACHE=/cache/electron-builder \
      -v "$PARENT:$PARENT" -v "$HOME/.cache/electron:/cache/electron" -v "$HOME/.cache/electron-builder:/cache/electron-builder" \
      -w "$PWD" electronuserland/builder:wine \
      bash -c 'npx electron-builder --win nsis --x64 --publish never'
  fi
  cp "dist/JAVIS-$VER-x64.exe" "$OUT/JAVIS-$VER-win-x64.exe"
fi

python3 -I - "$OUT" "$VER" "$URL_BASE" "$NOTES" <<'PY'
import hashlib, json, os, sys, datetime
out, ver, base, notes = sys.argv[1:5]
plats = {}
for key, name in (("mac-arm64", f"JAVIS-{ver}-mac-arm64.zip"), ("mac-x64", f"JAVIS-{ver}-mac-x64.zip"), ("win-x64", f"JAVIS-{ver}-win-x64.exe")):
    p = os.path.join(out, name)
    if not os.path.exists(p):
        continue
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    plats[key] = {"version": ver, "url": f"{base.rstrip('/')}/{name}", "sha256": h.hexdigest(), "size": os.path.getsize(p), "notes": notes}
doc = {"version": ver, "notes": notes, "published_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "platforms": plats}
with open(os.path.join(out, "latest.json"), "w") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
for k, v in plats.items():
    print(f"{k:10} {v['size']:>11}  {v['sha256']}  {v['url']}")
PY

echo
echo "Xong: $OUT/latest.json. CHƯA tải lên. Khi đã thử trên máy thật, chạy (gói trước, latest.json sau cùng"
echo "để máy không thấy bản mới khi gói chưa lên đủ):"
echo "  rsync -av --progress --exclude latest.json $OUT/ '$DEST' && rsync -av $OUT/latest.json '$DEST'"
