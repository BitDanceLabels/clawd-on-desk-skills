# 05 — Script Pitch & Demo

## 3 độ dài pitch

| Format | Độ dài | Khi dùng |
|---|---|---|
| Elevator pitch | 30 giây | Gặp ngẫu nhiên (event, networking, X reply) |
| Demo standard | 5 phút | Cold call, sales meeting 1-1 |
| Pitch deep dive | 15 phút | Enterprise eval, partner meeting |

---

## A. Elevator Pitch — 30 giây

> "Anh/chị đang dùng Claude Code hay Cursor đúng không? Em làm Bumbee on Desk — pet desktop nhảy theo session AI agent. Khi agent đang nghĩ, pet ôm đầu suy nghĩ. Khi xin quyền, pet bốc bubble cho click 1 phát. 5 agent cùng support, free open-source, có Pro store nhân vật áo dài. Cho em link 30 giây xem demo nhé?"

Mục tiêu: lấy được URL view / cho cài app. Không cố close.

---

## B. Demo Standard — 5 phút

### Phút 0-1: Hook + Painpoint
> "Em hỏi anh nhanh: anh chạy AI agent xong, bao nhiêu lần anh không biết nó đang chạy hay đã treo? Hoặc miss permission request vì terminal bị che?"

→ Đợi gật đầu / kể trải nghiệm.

> "Vấn đề chung của dev dùng AI CLI: agent chạy nền, terminal câm, không có heartbeat. Em build Bumbee để giải cái đó."

### Phút 1-3: Live Demo (quan trọng nhất)
**Mở app sẵn, để pet ngồi góc màn hình.** Sau đó:

1. **Mở terminal, prompt Claude Code 1 task đơn giản** ("read this file") → pet chuyển thinking → typing.
2. **Tạo subagent** → pet chuyển juggling.
3. **Cố tình cho agent gọi tool nguy hiểm** → bubble pop ra → click Allow trong app, không cần switch terminal.
4. **Drag pet sang mép phải** → vào mini mode, ẩn nửa người.
5. **Bonus**: chuột không di chuyển 60s → pet ngáp → ngủ. Lắc chuột → giật mình.

### Phút 3-4: Differentiation
> "Cùng 1 lúc Bumbee theo dõi Claude Code, Codex, Copilot, Gemini, Cursor — đó là cái Wallpaper Engine pet không làm được, vì pet đó chỉ trang trí. Bumbee thực sự đọc event hook của agent."

> "Pet đáng yêu thì nhiều, nhưng pet biết workflow code AI thì chỉ có Bumbee."

### Phút 4-5: Call to action
> "Em gửi link cài đây. Free hoàn toàn cho cá nhân. Nếu anh thích nhân vật áo dài / hanfu / cyberpunk, store có 12 skin. Pro 99k/tháng có avatar pass + cloud sync. Anh test 1 tuần rồi feedback giúp em được không?"

→ Lấy email/Zalo, schedule follow-up sau 7 ngày.

---

## C. Pitch Deep Dive — 15 phút (cho Enterprise / Partner)

### Phần 1 — Bối cảnh thị trường (2 phút)
- 2025-2026 là năm AI coding CLI bùng nổ
- Stat: GitHub Copilot 1.3M paid user, Cursor 100k+ paid 2025, Claude Code đạt 50k+ active dev tháng 1/2026 _(số ước đoán, dùng số mới nhất khi pitch)_
- Pain chung: visibility & permission UX kém

### Phần 2 — Sản phẩm (3 phút)
- Live demo như mục B
- Highlight Team Dashboard (mockup nếu chưa có UI thật)
- Highlight Avatar Store (show preview 12 skin)

### Phần 3 — Architecture & Privacy (2 phút)
**Cho enterprise/security buyer cần điều này:**
- Hook chạy local — không gửi prompt content lên cloud
- HTTP server 127.0.0.1 only
- Mã nguồn MIT có thể audit
- Bumbee Pro cloud sync chỉ sync setting (vị trí pet, skin chọn), không sync session content
- Enterprise có on-prem mode, air-gapped

### Phần 4 — Mô hình kinh doanh (2 phút)
- Free open-source → community + viral
- Pro Personal $5/tháng → indie/dev VN
- Team $8/seat → SMB
- Enterprise custom → công ty lớn
- Marketplace 70/30 — incentivize artist
- White-label cho OEM partner

### Phần 5 — Roadmap (3 phút)
- **Q2 2026**: Avatar Store launch 12 skin, Pro Personal billing
- **Q3 2026**: Team Dashboard beta, Gateway API public
- **Q4 2026**: Live2D support, voice integration
- **Q1 2027**: Mobile companion (iOS/Android), Linux native package

### Phần 6 — Partner ask / Investment (3 phút)
Tùy đối tượng:
- Partner: tích hợp gì cụ thể?
- Reseller: phân bổ region nào, % share?
- Investor: round bao nhiêu, valuation, use of fund

---

## Cold Email Template

**Subject:** Pet desktop biết bạn vừa prompt Claude Code

```
Chào anh/chị {tên},

Em thấy {nguồn — blog/X post} anh/chị chia sẻ về workflow dùng {agent name}. 
Em làm Bumbee on Desk — pet desktop phản ứng real-time với session AI coding,
hỗ trợ Claude Code + Cursor + Copilot + Codex + Gemini cùng lúc.

Khác pet trang trí thuần: Bumbee đọc hook event nên biết agent đang thinking, 
juggling subagent, hay đang xin permission. Permission request hiện thành bubble 
floating, không kẹt trong terminal.

Demo 30 giây: {link landing}
Bản free MIT: {link GitHub}

Anh/chị có 5 phút tuần sau em demo trực tiếp được không?

Cảm ơn,
{Tên} - Bumbee on Desk
```

---

## Follow-up Templates

### Sau 3 ngày không reply:
> "Hi {tên}, em gửi lại trên đây sợ email trước rơi vào promotion. Bumbee free thử trước, không tốn gì — link {url}. Nếu không phù hợp anh/chị reply 'không' giúp em xóa khỏi list nhé."

### Sau khi đã cài (báo qua webhook hoặc tự nguyện feedback):
> "Hi {tên}, thấy anh/chị cài Bumbee — cảm ơn nhiều. Anh/chị thấy state animation nào hữu ích nhất? Em đang gom feedback để build avatar pack tiếng Việt cho launch tháng tới, nếu được anh/chị 5 phút em chia sẻ roadmap."

### Sau khi ngừng dùng (auto-detect không state thay đổi 14 ngày):
> "Hi {tên}, Bumbee bên anh/chị 2 tuần nay không có hook event. Em không spy đâu — chỉ là metric local app gửi heartbeat. Có vấn đề gì hoặc không phù hợp em xin feedback thẳng để cải thiện. Hoặc nếu chỉ tạm nghỉ, em hold lại không spam thêm."

---

## Ngôn ngữ & tone

- **VN B2C**: thân mật, "em-anh/chị", emoji vừa phải, dùng "ngầu", "vibe", "cute"
- **VN B2B**: lịch sự, "team Bumbee — quý anh/chị", giảm emoji, focus ROI
- **EN global**: casual, đầu thân câu "Hey {name}", body relaxed, end "Cheers"
- **EN enterprise**: "Hi {name}, I'm reaching out from team Bumbee on Desk. We're building..."

## Demo checklist trước khi gặp khách

- [ ] App đã update version mới nhất
- [ ] Test 1 lần Claude Code prompt → pet phản ứng
- [ ] Test permission bubble (cố tình tool nguy hiểm)
- [ ] Test multi-session (mở 2 terminal Claude Code → juggling)
- [ ] Test mini mode drag
- [ ] Tắt notification khác để không spam khi demo
- [ ] Có sẵn link landing + GitHub trong clipboard
- [ ] Có 1 video record demo backup (lỡ live demo lỗi)
- [ ] Slide pricing in sẵn / share screen
