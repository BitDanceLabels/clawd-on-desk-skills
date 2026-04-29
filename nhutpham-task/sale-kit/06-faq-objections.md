# 06 — FAQ & Xử lý phản đối

## A. FAQ kỹ thuật

### Q1. Bumbee có gửi prompt/code lên cloud không?
**A.** Không. Mọi hook chạy local, HTTP server bind 127.0.0.1. Pro tier có cloud sync nhưng **chỉ sync setting** (vị trí pet, skin chọn, theme), không sync session content. Mã nguồn core MIT — có thể tự audit.

### Q2. Tốn bao nhiêu RAM/CPU?
**A.** ~150-250 MB RAM, < 1% CPU idle. Khi pet animation nặng (juggling, conducting) có thể peak 3-5% CPU một vài giây.

### Q3. Có chạy được trên macOS Apple Silicon không?
**A.** Có. Build native arm64 + x64. Lưu ý DMG hiện chưa code-sign nên Gatekeeper cần right-click → Open lần đầu.

### Q4. Linux nào hỗ trợ?
**A.** Ubuntu 22.04+ test kỹ. AppImage + .deb có sẵn. Cần `wmctrl` hoặc `xdotool` cho terminal focus. Auto-update không hoạt động trên Linux — phải tự download.

### Q5. Có cài được trên server (không có GUI) không?
**A.** Không, Bumbee là pet desktop cần X server / Wayland / Aqua / Win desktop session. Nhưng có thể chạy **remote SSH** — agent trên server, pet trên máy local, kết nối qua SSH reverse tunnel.

### Q6. Permission bubble có cho mọi agent không?
**A.** Hiện chỉ Claude Code (do Claude Code support HTTP hook blocking đầy đủ). Cursor, Copilot, Gemini, Codex chưa có vì hook architecture của họ chưa support đầy đủ allow/deny flow.

### Q7. Hook có ảnh hưởng tốc độ agent không?
**A.** Không đáng kể. Command hook chạy non-blocking (fire-and-forget). HTTP hook blocking duy nhất là PermissionRequest — đã chờ user trong terminal anyway, Bumbee không thêm latency.

### Q8. Có conflict với hook khác đã cài không?
**A.** Không. Bumbee install logic là **append-only, idempotent** — đọc settings.json hiện tại, append entry vào array, không overwrite. Đã test với community hooks phổ biến.

### Q9. Uninstall có sạch không?
**A.** Hiện cần manual: gỡ app + xóa entry hook trong `~/.claude/settings.json`. Roadmap Q2 2026 có script uninstall tự động.

### Q10. Có hỗ trợ multi-monitor không?
**A.** Có. Pet nhớ vị trí trên monitor, có logic clamp khi monitor disconnect. Mini mode dock vào mép phải bất kỳ monitor nào.

### Q11. Tôi đang dùng Cursor IDE chứ không phải Cursor Agent CLI, dùng được không?
**A.** Cursor IDE có hooks API mới (cursor.com/docs/agent/hooks). Bumbee tích hợp qua hooks này. Nếu phiên bản Cursor cũ chưa có hooks, tạm thời chỉ thấy idle state.

### Q12. Bao lâu pet phản ứng từ event?
**A.** Hook-based (Claude Code, Copilot, Gemini, Cursor): ~50-200ms. JSONL polling (Codex CLI): ~1.5s.

## B. FAQ kinh doanh

### Q13. Tại sao trả tiền khi free đã đủ tính năng?
**A.** Free đủ dùng hàng ngày, đúng. Pro trả cho:
- Nhân vật yêu thích (avatar store)
- Cloud sync nhiều máy
- Hỗ trợ chính thức 48h
- Beta access animation mới
- Ủng hộ project tiếp tục dev

Nếu chỉ cần pet bunny mặc định → cứ dùng Free, hoàn toàn được.

### Q14. Có refund không?
**A.** 14 ngày hoàn tiền không hỏi lý do với Pro Personal/Pro+. Team plan refund pro-rata theo seat. Avatar Store mua lẻ không refund (tránh abuse: mua → dùng → trả).

### Q15. Có Lifetime plan không?
**A.** Hiện không. Lý do: chi phí vận hành (cloud sync, store, support) là recurring. Có thể có "Founding Member Lifetime" giới hạn 100 slot khi launch — kèm điều khoản rõ.

### Q16. Tôi mua skin xong, hủy Pro, skin còn dùng được không?
**A.** Skin mua lẻ là **own forever**, kể cả khi hủy Pro. Pro+ Avatar Pass thì skin chỉ unlock khi đang sub.

### Q17. Skin tôi commission có IP riêng không?
**A.** Có. Custom Skin Service (Enterprise hoặc add-on $200-1000) — bạn own toàn bộ IP, Bumbee không claim, không bán lại. Nếu muốn upload lên Avatar Store làm artist, ký thỏa thuận riêng.

### Q18. Team plan có cài lên máy cá nhân được không?
**A.** Được. Seat license per user, không per device. 1 user dùng max 3 device đồng thời.

## C. Xử lý phản đối phổ biến

### Phản đối 1: "Pet desktop hơi childish"
**Phản hồi:**
> "Em hiểu cảm giác đó. Nhưng có 2 thứ thay đổi: (1) Bumbee có mini mode — chỉ hiện 1 nửa người ở mép màn hình khi đang focus, không annoying; (2) line nhân vật có cả style cyberpunk hacker, robot mecha, samurai — không bắt buộc dùng bunny. Anh thử 1 tuần, không hợp gỡ, mất gì đâu."

### Phản đối 2: "Em đang dùng Cursor đủ rồi, có metric built-in"
**Phản hồi:**
> "Cursor metric chỉ thấy Cursor session. Anh có dùng Claude Code song song không? Hoặc ai trong team dùng Codex/Copilot? Bumbee gom cross-agent vào 1 view. Mà Bumbee không thay metric — nó là visual layer trên desktop, hai cái không đụng nhau."

### Phản đối 3: "Sợ ảnh hưởng tốc độ máy / agent"
**Phản hồi:**
> "Hook chạy non-blocking, agent không chờ Bumbee. Pet < 1% CPU idle. Anh test 30 phút thấy nặng máy thì gỡ — nhưng em chưa thấy ai feedback nặng máy."

### Phản đối 4: "Lo Bumbee tracking activity của em"
**Phản hồi:**
> "Code MIT public — anh đọc clawd-hook.js là thấy nó chỉ POST `state, session_id, event` lên 127.0.0.1. Không có prompt content, không gửi đi đâu. Pro cloud sync nếu bật cũng chỉ là setting (vị trí, skin), không phải session. Enterprise có on-prem mode air-gapped 0% phone-home."

### Phản đối 5: "Giá cao hơn em nghĩ"
**Phản hồi:**
> "Free đầy đủ — 99k/tháng Pro chỉ khi anh thích avatar/cloud sync. So với 1 ly cà phê/tuần. Nếu vẫn thấy cao em có discount student 50%, hoặc trả annual giảm 20%. Hoặc cứ Free dùng cho thoải mái."

### Phản đối 6: "Open-source thì sao trả tiền?"
**Phản hồi:**
> "Core MIT free, đúng. Pro tier không ép user mã nguồn, chỉ thêm dịch vụ: avatar store là asset bản quyền, cloud sync là server thật, support là người thật trả lời 48h. Anh có thể chỉ dùng OSS nếu không cần các thứ đó — đúng tinh thần open-core."

### Phản đối 7: "Đợi em xem có ai dùng chưa"
**Phản hồi:**
> "Hợp lý. Anh follow GitHub repo {url} để thấy roadmap & issues; có Discord {url} community 200+ dev đang dùng. Khi nào anh thấy đủ traction thì quay lại — em không push. Em ping anh 2 tuần nữa update tiến độ nhé?"

### Phản đối 8: "Team em không dùng Claude Code, chỉ Copilot"
**Phản hồi:**
> "OK, Bumbee support Copilot CLI command hook đầy đủ. Anh chỉ thấy state typing, juggling, error — chưa có permission bubble cho Copilot vì Copilot hook chỉ support deny. Còn lại đều ngon. Free thử trước rồi quyết."

### Phản đối 9: "Sếp em không cho cài app desktop bên thứ 3"
**Phản hồi:**
> "Hiểu. Bumbee có Enterprise on-prem — IT đóng package nội bộ, audit code, deploy qua MDM. Hoặc nếu chỉ cá nhân anh dùng nhưng công ty cấm — Bumbee không cài driver, không gọi service ngoài, có thể chạy portable không cần admin. Tùy policy nội bộ thôi."

### Phản đối 10: "Tôi muốn xem source thì có gì khác Free?"
**Phản hồi:**
> "Source Free MIT giống nhau. Pro/Team/Enterprise build từ private fork thêm avatar store client + cloud sync client + dashboard. Engine pet 100% giống Free, không có 'feature gating ẩn'. Đó là cam kết open-core."

## D. Câu khó (curveball)

### "Bumbee dùng character của Anthropic phải không? Có legal risk?"
> "Nhân vật Clawd của Anthropic được dùng trong project gốc clawd-on-desk có acknowledgment. Bumbee đã rebrand, **nhân vật mới gồm bunny + 12 line character do team commission từ artist**, không reuse Clawd asset. Anthropic không sponsor cũng không reject. Legal đã review — community project, không infringement."

### "Tôi đã có pet Wallpaper Engine rồi, lý do gì đổi?"
> "Không phải đổi — chạy song song. Wallpaper Engine pet làm decor, Bumbee làm workflow companion. Hai cái khác mục đích."

### "Có roadmap mobile companion không?"
> "Q1 2027 mục tiêu iOS/Android — Bumbee mini xem state agent từ máy desktop của bạn qua push notification. Chưa commit hard date."
