#!/usr/bin/env bash
# Ký JAVIS.app bằng chứng chỉ tự ký CỐ ĐỊNH của JAVIS (rcodesign, chạy được trên Linux).
#
# Vì sao: bản ad-hoc mỗi lần build có cdhash khác → Keychain coi là app lạ và hỏi lại
# "Luôn cho phép" sau mỗi lần cập nhật. Ký cùng 1 chứng chỉ thì designated requirement
# (identifier "com.clawd.on-desk" and certificate leaf = H"<sha1 chứng chỉ>") giữ nguyên
# giữa các bản → Keychain + quyền micro/camera nhận ra đúng app, không hỏi lại.
# Updater trong app (src/javis-updater.js) cũng đòi bản mới thoả DR của bản đang chạy.
#
# Cách dùng (máy build, repo root):
#   bash scripts/sign-mac.sh init                 # 1 lần: tạo ~/.javis-signing/javis.p12 (+ mật khẩu), chmod 600
#   bash scripts/sign-mac.sh sign dist/mac-arm64/JAVIS.app
#   bash scripts/sign-mac.sh zip  dist/mac-arm64/JAVIS.app dist/JAVIS-<ver>-arm64.zip
#   bash scripts/sign-mac.sh info dist/mac-arm64/JAVIS.app
#
# Chứng chỉ KHÔNG nằm trong repo, không commit, không in ra. Mất ~/.javis-signing thì bản sau
# có DR khác: Keychain hỏi lại 1 lần và updater sẽ từ chối bản mới (anh cài tay 1 lần).
# Giữ một bản sao ~/.javis-signing ở nơi an toàn (ổ mã hoá) — đừng đưa lên Git/Drive công khai.
# Biến môi trường: JAVIS_SIGNING_DIR (mặc định ~/.javis-signing), RCODESIGN (mặc định rcodesign).
set -euo pipefail

DIR="${JAVIS_SIGNING_DIR:-$HOME/.javis-signing}"
P12="$DIR/javis.p12"
PASS="$DIR/p12-password"
RCS="${RCODESIGN:-$(command -v rcodesign || echo "$HOME/.local/bin/rcodesign")}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENT="$ROOT/build/entitlements.mac.plist"

need_rcs() { [ -x "$RCS" ] || { echo "Thiếu rcodesign (apple-codesign). Cài: https://github.com/indygreg/apple-platform-rs/releases"; exit 1; }; }

cmd_init() {
  need_rcs
  if [ -f "$P12" ]; then echo "Đã có $P12 — giữ nguyên (đổi chứng chỉ sẽ làm Keychain hỏi lại)."; return 0; fi
  umask 077
  mkdir -p "$DIR"; chmod 700 "$DIR"
  head -c 32 /dev/urandom | base64 | tr -d '\n/+=' > "$PASS"
  "$RCS" generate-self-signed-certificate --algorithm rsa --profile developer-id-application \
    --person-name "JAVIS Desk (BitDance)" --country-name VN --validity-days 7300 \
    --p12-file "$P12" --p12-password "$(cat "$PASS")" >/dev/null
  chmod 600 "$P12" "$PASS"
  echo "Đã tạo chứng chỉ JAVIS ở $P12 (chmod 600). Sao lưu thư mục $DIR ở nơi an toàn."
}

cmd_sign() {
  need_rcs
  local app="${1:?Thiếu đường dẫn JAVIS.app}"
  [ -f "$P12" ] || { echo "Chưa có chứng chỉ: chạy 'bash scripts/sign-mac.sh init' trước."; exit 1; }
  # Không bật hardened runtime (không notarize; giữ hành vi như các bản ad-hoc trước đây).
  # Entitlements (camera/mic…) vẫn gắn cho file chạy chính.
  "$RCS" sign --p12-file "$P12" --p12-password-file "$PASS" \
    --entitlements-xml-file "$ENT" "$app" >/dev/null 2>&1
  cmd_info "$app"
}

cmd_info() {
  need_rcs
  local app="${1:?Thiếu đường dẫn JAVIS.app}"
  local exe; exe="$app/Contents/MacOS/$(basename "$app" .app)"
  "$RCS" print-signature-info "$exe" 2>/dev/null \
    | grep -E "designated_requirement|identifier:|team_name|signing_time|cdhash" | head -12 || true
  "$RCS" verify "$exe" >/dev/null 2>&1 && echo "rcodesign verify: OK" || echo "rcodesign verify: (không kiểm được trên Linux — kiểm bằng codesign --verify trên Mac)"
}

# Zip giữ symlink (Electron Framework dùng Versions/Current) + quyền chạy; Mac giải bằng ditto/Finder.
cmd_zip() {
  local app="${1:?Thiếu JAVIS.app}" out="${2:?Thiếu tệp zip ra}"
  python3 -I - "$app" "$out" <<'PY'
import os, stat, sys, zipfile
app, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
base = os.path.dirname(app)
tmp = out + ".tmp"
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, dirs, files in os.walk(app):
        dirs.sort(); files.sort()
        for name in [d for d in dirs if os.path.islink(os.path.join(root, d))] + files:
            p = os.path.join(root, name)
            rel = os.path.relpath(p, base)
            st = os.lstat(p)
            if stat.S_ISLNK(st.st_mode):
                zi = zipfile.ZipInfo(rel); zi.create_system = 3
                zi.external_attr = (stat.S_IFLNK | 0o755) << 16
                z.writestr(zi, os.readlink(p))
            else:
                zi = zipfile.ZipInfo.from_file(p, rel); zi.create_system = 3
                zi.external_attr = (st.st_mode & 0xFFFF) << 16
                zi.compress_type = zipfile.ZIP_DEFLATED
                with open(p, "rb") as f: z.writestr(zi, f.read())
        dirs[:] = [d for d in dirs if not os.path.islink(os.path.join(root, d))]
os.replace(tmp, out)
PY
  ls -l "$out"
}

case "${1:-}" in
  init) cmd_init ;;
  sign) shift; cmd_sign "$@" ;;
  info) shift; cmd_info "$@" ;;
  zip)  shift; cmd_zip "$@" ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
