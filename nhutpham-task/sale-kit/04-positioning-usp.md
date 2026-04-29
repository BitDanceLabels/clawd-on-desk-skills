# 04 — Định vị, USP & Phân tích đối thủ

## Định vị (Positioning Statement)

> Cho **dev đang dùng AI coding agent**, những người **muốn workspace có hồn và visibility tức thì vào agent**, **Bumbee on Desk** là **pet desktop duy nhất phản ứng real-time với mọi major AI coding CLI**. Khác với pet trang trí thuần (Wallpaper Engine, vPet) chỉ chạy animation định trước, Bumbee **biết bạn đang làm gì với AI** và **tham gia vào quy trình permission**, biến trải nghiệm code AI từ "tab terminal câm" thành "đồng đội pixel có cảm xúc".

## 5 USP cốt lõi

### USP 1 — Universal Multi-Agent
**Bumbee = 1 pet, 5 agent.** Không sản phẩm nào trên thị trường cover đồng thời Claude Code + Codex + Copilot + Gemini + Cursor. Đối thủ hoặc gắn vào 1 IDE (Cursor only), hoặc chỉ là pet thuần không đọc agent.

### USP 2 — Permission Bubble
Trong khi đối thủ + chính các agent CLI bắt user trả lời permission **trong terminal**, Bumbee có **floating bubble** ngay góc màn hình → Allow/Deny 1 click, không phải tìm tab terminal đang bị đè bởi browser/editor.

### USP 3 — Real-time State Awareness
12 trạng thái animation **map từ event hook**, không phải ngẫu nhiên. Khi pet "juggling" — chắc chắn 2 session đang chạy. Khi "sweeping" — context đang compact. Đây là **visual debugger cho workflow AI**.

### USP 4 — Privacy-first, Open Core
- Mọi hook chạy local
- HTTP server bind 127.0.0.1
- Mã nguồn MIT để audit
- Pro tier không gate tính năng kỹ thuật, chỉ gate avatar/dashboard → user không bị ép upgrade

### USP 5 — Á Đông-flavored Avatar Store
**Phần lớn pet desktop trên thị trường style Nhật.** Bumbee có line nhân vật Á Đông đa dạng (áo dài VN, hanfu TQ, hanbok Hàn) commission từ artist Việt → khác biệt văn hóa, giá rẻ hơn import từ Booth.

## Phân tích đối thủ

### Đối thủ trực tiếp (đụng pet + dev workflow)

| Đối thủ | Điểm mạnh | Điểm yếu | Cách Bumbee thắng |
|---|---|---|---|
| **Clawd Tank** (open-source) | Pet pixel art đáng yêu, OG Claude mascot | Chỉ Claude API (không phải Claude Code CLI), không hook, không multi-agent | Bumbee đa agent + hook real-time + permission bubble |
| **Codex Pet** (community concept) | Có ý tưởng cộng đồng | Chưa có sản phẩm hoàn chỉnh | Bumbee đã ship 36 SVG + 5 agent integration |

### Đối thủ gián tiếp (pet desktop thuần)

| Đối thủ | Điểm mạnh | Điểm yếu | Cách Bumbee thắng |
|---|---|---|---|
| **Wallpaper Engine + vPet** | Steam reach 80M user, library lớn | Không hiểu workflow AI, chỉ animation định trước | Bumbee phản ứng theo agent event, có nghĩa thực sự |
| **Desktop Goose / Bonzi-style** | Vibe meme, viral | Annoying, không có giá trị workflow | Bumbee giúp việc, không phá việc |
| **VRoid / Live2D Cubism viewer** | Character chất lượng cao, custom mạnh | Không tích hợp AI agent, set up phức tạp | Bumbee plug-and-play, hook auto-register |
| **AIRI** (open-source AI VTuber) | Live2D + LLM chat, Tauri shell | Là chat companion, không phải workflow companion; không tích hợp agent CLI | Bumbee bám vào AI coding agent — niche cụ thể, không lan man |

### Đối thủ gián tiếp (productivity dashboard cho AI dev)

| Đối thủ | Điểm mạnh | Điểm yếu | Cách Bumbee thắng |
|---|---|---|---|
| **WakaTime** | Time tracking dev mature | Không có visualization realtime, không cute | Bumbee có dashboard (Team) + UI vibe |
| **Cursor metrics dashboard** (built-in) | Native trong Cursor | Chỉ Cursor, không cross-agent | Bumbee tổng hợp tất cả agent vào 1 view |

## Why now?

3 yếu tố làm thời điểm này hoàn hảo:

1. **AI coding CLI bùng nổ 2025-2026** — Claude Code, Cursor, Copilot CLI, Gemini CLI, Codex tất cả ra mắt trong 12 tháng qua. Dev đang chuyển hàng loạt từ chat-IDE sang agent CLI.
2. **Permission fatigue** — agent ngày càng nhiều quyền, dev phải approve liên tục, terminal UX kém. Thị trường đang đợi giải pháp UX permission mượt.
3. **Vibe/aesthetic dev culture** — gen Z dev mê personalize workspace (tham khảo lofi-girl, anime keyboard, Live2D vTuber). Sản phẩm "nghiêm túc + dễ thương" có thị trường rõ.

## Câu trả lời 30 giây

**"Bumbee là gì?"**
> Pet desktop nhảy theo session AI coding của bạn. Bật lên là biết Claude Code đang typing, Cursor đang juggle, Copilot đang chờ permission. Chấp nhận quyền 1 click qua bubble nổi. Mở source MIT, có Pro tier với store nhân vật áo dài, hanfu, cyberpunk.

**"Khác Wallpaper Engine pet sao?"**
> Wallpaper Engine pet chỉ chạy animation tự nó — đáng yêu nhưng vô tri. Bumbee biết bạn vừa prompt cái gì cho Claude, hiển thị thinking. Khi agent xin quyền, Bumbee bốc bubble cho bạn click. Đây là pet **làm việc cùng**, không phải pet trang trí.

**"Vì sao không tự code?"**
> Nếu rảnh thì cứ tự code, MIT mà. Nhưng để có 12 animation, hỗ trợ 5 agent, permission bubble, mini mode, eye tracking, multi-monitor… mất 6 tháng. Bumbee Pro 99k/tháng tiết kiệm cái đó, cộng cho bạn avatar store nữa.
