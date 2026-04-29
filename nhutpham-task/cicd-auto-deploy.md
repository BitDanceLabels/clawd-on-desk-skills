Đủ thông tin. Trả lời 2 câu hỏi:

1. Bản macOS có không?
Có sẵn lệnh build, nhưng không build được trên Windows.

package.json đã có script: npm run build:mac (build DMG x64 + arm64)
Nhưng DMG bắt buộc build trên máy macOS (không cross-compile được — Apple yêu cầu công cụ Apple để code-sign)
File DMG hiện tại trong dist/ không có vì bạn build trên Windows
3 cách lấy bản Mac:

Cách	Thực hiện
Tự build trên Mac	clone repo trên Macbook → npm install → npm run build:mac → file ra dist/*.dmg
GitHub Actions tự build (khuyên dùng)	.github/workflows/build.yml đã config sẵn 3 platform. Chỉ cần git tag v0.5.9 && git push --tags → CI tự build Win+Mac+Linux + tạo GitHub Release
Build local Linux	npm run build:linux (cross-compile được trên Windows qua WSL/Docker)
2. Logic auto-update hoạt động ra sao
Luồng release:


1. Sửa code
2. Bump version trong package.json (ví dụ 0.5.8 → 0.5.9)
3. git commit + git tag v0.5.9 + git push --tags
4. GitHub Actions chạy build.yml → 3 jobs build Win/Mac/Linux song song
5. Job "release" gom artifacts → upload lên GitHub Release v0.5.9
   Files trên Release: Clawd-on-Desk-Setup-0.5.9.exe, latest.yml, *.dmg, latest-mac.yml, *.AppImage, *.deb, latest-linux.yml
Luồng client check update (trong src/updater.js):


App khởi động
   ↓ chờ 5s
checkForUpdates(false) — silent check
   ↓
[1] fetchLatestVersion() → GET https://api.github.com/repos/BitDanceLabels/clawd-on-desk-skills/releases/latest
   ↓ trả về tag_name "v0.5.9"
[2] compareVersions("0.5.8", "0.5.9") → -1 (có bản mới)
   ↓
[3] electron-updater download latest.yml từ Release v0.5.9
    Nội dung latest.yml:
        version: 0.5.9
        files:
          - url: Clawd-on-Desk-Setup-0.5.9.exe
            sha512: <hash>
            size: <bytes>
   ↓
[4] Hiện dialog "Update Available — v0.5.9" → user chọn Download
   ↓
[5] Tải .exe (verify SHA512) → save vào pendingUpdate
   ↓
[6] Hiện dialog "Update Ready — Restart Now?"
   ↓ user chọn Restart
[7] autoUpdater.quitAndInstall() → tắt app → chạy NSIS installer → cài đè bản mới → mở lại
Khác biệt theo OS:

OS	Sau bước [3]	Lý do
Windows	Auto-download + auto-install qua NSIS	EXE installer làm được
macOS	Chỉ mở GitHub Releases page trong browser	DMG chưa code-sign → Gatekeeper chặn auto-install
Linux	electron-updater hỗ trợ AppImage auto-update, .deb thì manual	tùy package format
Điểm cần lưu ý khi release:

Phải tăng version trong package.json trước khi build, nếu không latest.yml ghi version cũ → client không thấy update mới
Tag git phải là vX.Y.Z đúng format (workflow on: push: tags: ['v*'] mới trigger)
latest.yml PHẢI được upload chung với .exe — nó là file metadata electron-updater đọc trước. Workflow đã làm đúng (line 24, 40, 57)
SHA512 trong latest.yml dùng để verify download tránh corrupt — sai hash = update fail
Version trong code so sánh là app.getVersion() (đọc từ package.json lúc build) — quên bump version thì user dù tải bản mới cũng vẫn check ra "đã là mới nhất"
Nếu muốn user phải tải mới hoàn toàn (force migration): tăng major version + viết note trong release
Test offline trước khi tag release: sửa package.json thành "version": "0.5.9", build, kiểm tra dist/latest.yml có version đúng. Sau đó mới tag git.