# 01 — Tổng quan sản phẩm

## Một câu định nghĩa

> **Bumbee on Desk** là pet desktop sống cùng dev — phản ứng real-time với mọi session AI coding (Claude Code, Codex, Copilot, Gemini, Cursor), biến quy trình code AI khô khan thành trải nghiệm có hồn.

## Tagline ứng cử

- "Your AI coding has a heartbeat now."
- "Code with company — Bumbee feels every prompt."
- "Người bạn pixel cho dev thời AI."
- "Đừng code một mình — để Bumbee lo phần cảm xúc."

## Vấn đề Bumbee giải quyết

| Pain point của dev dùng AI | Cách Bumbee xử lý |
|---|---|
| Không biết agent đang chạy hay treo | 12 trạng thái animation real-time (thinking, typing, building, juggling…) |
| Permission request nằm trong terminal, dễ miss | Permission bubble nổi trên màn hình, click 1 phát Allow/Deny |
| Multi-session/multi-agent rối loạn | Tự động resolve trạng thái ưu tiên cao nhất, click vào pet jump tới terminal đúng |
| Agent crash/exit không biết | Process liveness detection — tự dọn session ma |
| Coding mệt mỏi, thiếu vibe | Pet đáng yêu, easter egg, idle reading/debugger patrol |

## Tính năng cốt lõi

### 1. Multi-Agent Universal
Hoạt động đồng thời với:
- **Claude Code** — full hook integration + permission bubble
- **Codex CLI** — JSONL log polling, không cần config
- **Copilot CLI** — command hooks
- **Gemini CLI** — auto-register hooks
- **Cursor Agent** — auto-register hooks
- **Remote SSH** — sense agent trên server qua tunnel ngược

### 2. 12+ Animation States
idle (eye-tracking, reading, debugger patrol) · thinking · typing · building · juggling · conducting · sweeping · carrying · happy · error · notification · sleeping (yawning → dozing → collapsing).

### 3. Permission Bubble
- Floating card nổi góc phải dưới, không kẹt trong terminal
- Allow / Deny / Suggestions một click
- Stack nhiều request, auto-dismiss khi user trả lời ở terminal trước

### 4. Mini Mode
Drag sang mép phải → ẩn nửa người, hover để peek. Vẫn báo notification và happy event qua animation rút gọn.

### 5. Privacy-first
- Tất cả hook chạy local
- Không telemetry cloud
- HTTP server bind 127.0.0.1 only
- Mã nguồn MIT có thể audit

## Thông số kỹ thuật

| Hạng mục | Spec |
|---|---|
| OS hỗ trợ | Windows 11, macOS (Intel + Apple Silicon), Ubuntu/Linux |
| Runtime | Electron + Node.js |
| Bộ nhớ | ~150-250 MB RAM |
| CPU idle | < 1% |
| Cài đặt | NSIS installer (Win), DMG (Mac), AppImage/deb (Linux) |
| Auto-update | GitHub Releases + electron-updater |
| Ngôn ngữ UI | Tiếng Anh, Tiếng Trung _(Tiếng Việt sẽ thêm trong Pro)_ |

## Roadmap thương mại (Bumbee Pro)

Trên nền open-source, các lớp commercial:

1. **Bumbee Avatar Store** — marketplace nhân vật Live2D / pixel art (chibi, áo dài, hanfu, office anime). Mua 1 lần hoặc subscription.
2. **Bumbee Gateway API** — kết nối pet với hệ sinh thái trợ lý Bumbee (chat, voice, custom agent).
3. **Bumbee Team Dashboard** — analytics session toàn team, leaderboard, productivity insight (B2B).
4. **Custom Skin Service** — đặt vẽ nhân vật riêng theo brand công ty, $200-1000/skin.
5. **White-label OEM** — rebrand cho công ty AI/dev tool khác làm mascot riêng.

Chi tiết giá xem [03-pricing-packages.md](03-pricing-packages.md).

## Số liệu nhanh để pitch

- 5 AI coding agents được hỗ trợ — bao phủ 90% dev đang dùng AI tools 2026
- 12+ animation states map từ event hook
- < 2s từ event đến animation
- 0 cấu hình cần thiết với Claude Code & Codex CLI
- 36+ SVG asset, 8 mini mode animation
