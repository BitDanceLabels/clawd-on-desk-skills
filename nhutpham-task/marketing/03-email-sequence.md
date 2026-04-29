# 03 — Email Sequence

5 sequence chính:
1. Welcome (sau khi đăng ký newsletter / tải app)
2. Activation (cho user đã cài nhưng chưa active)
3. Conversion (free → Pro)
4. Re-engagement (user dropoff)
5. Renewal (Pro/Team sắp hết hạn)

---

## 1. Welcome Sequence — 4 email × 14 ngày

### Email 1: Day 0 — Chào mừng
**Subject:** 🐰 Bumbee chào bạn — bắt đầu từ đây

> Hi {tên},
>
> Cảm ơn đã tải Bumbee on Desk. Trong 30 giây tới pet sẽ xuất hiện ở góc desktop bạn.
>
> 3 việc nên làm trước:
>
> 1. **Mở Claude Code/Cursor/Copilot** — pet sẽ tự nhảy theo session đầu tiên.
> 2. **Drag pet đi xung quanh** — vị trí được nhớ giữa các lần restart.
> 3. **Drag sang mép phải màn hình** — vào mini mode, pet ẩn nửa người.
>
> Nếu pet không phản ứng sau 5 phút, reply email này, tụi mình check.
>
> {Tên founder}
> Bumbee Team
>
> P.S. Tham gia Discord {link} — 200+ dev đang chia sẻ setup, skin custom, tips.

### Email 2: Day 2 — Tip nâng cao
**Subject:** 5 click reaction Bumbee bạn chưa thử

> Hi {tên},
>
> Bumbee có vài easter egg nhỏ:
> - **Double-click**: pet poke
> - **4 click nhanh**: pet flail (vẫy tay loạn)
> - **Right-click**: menu Sessions để jump tới terminal đúng
> - **60 giây không động chuột**: pet bắt đầu sleep cycle (yawning → dozing → collapsing → sleeping)
> - **Lắc chuột khi pet ngủ**: pet giật mình thức dậy
>
> Thử và tag @bumbee.dev trên X/TikTok khi bạn record được pose hài nhất 🐰
>
> {Tên}

### Email 3: Day 7 — Showcase community
**Subject:** Bạn không một mình — đây là setup của 5 dev khác

> Hi {tên},
>
> Tuần đầu cùng Bumbee bạn cảm thấy sao? Đây là setup của 5 user trong community:
>
> [Image grid 5 desktop screenshot có pet]
>
> @user1 — Cursor + Claude Code, pet ở góc trái dưới, mini mode khi focus.
> @user2 — Copilot CLI, ngày 200 hook event.
> @user3 — Team 4 dev, mỗi máy 1 pet, vibe đồng bộ.
> @user4 — VS Code + Codex, dùng terminal jump nhiều.
> @user5 — Multi-monitor 3 màn, pet trên màn giữa.
>
> Share setup của bạn trong Discord channel #showcase được trúng skin Bumbee Pro miễn phí 🎁
>
> {Tên}

### Email 4: Day 14 — Soft pitch Pro
**Subject:** 14 ngày sau, vẫn miễn phí — nhưng có cái này hay hơn

> Hi {tên},
>
> Bạn đã 14 ngày cùng Bumbee 🎉 Tổng số hook event: {N}.
>
> Tụi mình build Free để mãi mãi miễn phí — bạn có thể dừng đọc email này, không vấn đề gì.
>
> Nếu bạn enjoy Bumbee, có 2 thứ nâng cấp:
>
> **Pro Personal — 99k₫/tháng**
> - 50 credit Avatar Store mỗi tháng (đủ 1 skin Common + 1 Rare)
> - Cloud sync setting nhiều máy
> - Priority support 48h
> - Tiếng Việt UI
>
> **Pro+ (Avatar Pass) — 199k₫/tháng**
> - Mọi skin Avatar Store unlock
> - Priority custom skin commission (giảm 30%)
> - Founding Member badge
>
> Trial 7 ngày miễn phí cả 2 gói: {link}
>
> Nếu Free đủ rồi — cũng OK. Bumbee vẫn ở đó với bạn 🐰
>
> {Tên}

---

## 2. Activation Sequence — Cho user đã cài nhưng chưa hook event

### Email A1: Day 1 sau cài, không có hook
**Subject:** 🐰 Bumbee đợi bạn prompt agent đầu tiên

> Hi {tên},
>
> Bumbee đã cài 1 ngày nhưng pet chưa thấy hook event nào. Có thể do:
>
> 1. **Bạn chưa mở agent** — pet chỉ phản ứng khi Claude Code/Cursor/Copilot/Codex/Gemini chạy. Mở 1 cái thử nhé.
> 2. **Hook chưa register** — Bumbee tự register cho Claude Code, Cursor, Gemini. Copilot CLI cần manual setup, xem hướng dẫn: {link docs}
> 3. **Antivirus chặn HTTP local** — kiểm tra firewall Windows/macOS có chặn 127.0.0.1:23333 không.
>
> Nếu vẫn không phản ứng, gửi screenshot terminal command `curl http://127.0.0.1:23333/state` cho tụi mình ở support@bumbee.dev.
>
> {Tên}

### Email A2: Day 3 — Lý do có thể không match
**Subject:** Bumbee có phù hợp với workflow của bạn?

> Hi {tên},
>
> Bumbee thiết kế cho dev dùng AI coding CLI (Claude Code, Cursor Agent, Copilot CLI, Codex CLI, Gemini CLI). Nếu bạn:
>
> - Chỉ dùng AI chat trong browser → Bumbee không match
> - Dùng IDE plugin (Copilot trong VS Code, Cursor IDE thuần) — Cursor IDE có hook hỗ trợ; Copilot VS Code plugin chưa
> - Không dùng AI agent — Bumbee chỉ là pet trang trí, có thể không đáng cài
>
> Nếu thuộc 3 nhóm trên — bạn cứ gỡ Bumbee, không tốn gì. Tụi mình hiểu mà.
>
> Nếu vẫn muốn dùng pet decor: thử Wallpaper Engine + vPet — match hơn cho mục đích đó.
>
> {Tên}

---

## 3. Conversion Sequence — Free user activated → Pro

### Email C1: Khi user mở Avatar Store ≥ 3 lần
**Subject:** Skin {tên skin} đang chờ bạn — first month $1

> Hi {tên},
>
> Tụi mình thấy bạn xem Avatar Store {N} lần. Skin nào catch eye nhất?
>
> Bumbee Pro Personal có 50 credit Avatar Store mỗi tháng — đủ cho 1 skin Rare hoặc 2 skin Common.
>
> Tháng đầu **chỉ $1** (giảm $4) cho user đã active 14+ ngày như bạn:
>
> {CTA: Bắt đầu Pro $1 tháng đầu}
>
> Tự renew $4.99/tháng từ tháng 2. Cancel bất cứ lúc nào.
>
> {Tên}

### Email C2: Khi user dùng nhiều máy (detect device)
**Subject:** 2 máy, 2 setting Bumbee khác nhau — cloud sync sẽ giúp

> Hi {tên},
>
> Bumbee detect bạn đang dùng trên 2 máy ({device A} + {device B}). Vị trí pet, skin, theme mỗi máy đang riêng.
>
> Pro Personal có cloud sync — đồng bộ setting tự động giữa các máy.
>
> Trial 7 ngày miễn phí: {link}

---

## 4. Re-engagement Sequence — User dropoff

### Email R1: Sau 14 ngày không có hook event
**Subject:** Bumbee không thấy bạn 2 tuần rồi 🥲

> Hi {tên},
>
> 2 tuần qua Bumbee không nhận hook event nào. Có thể bạn:
>
> - Chuyển sang workflow khác?
> - Bumbee có vấn đề gì?
> - Đơn giản đang nghỉ lễ?
>
> Nếu Bumbee không phù hợp, reply 1 dòng cho tụi mình biết lý do. Mọi feedback đều có giá trị.
>
> Nếu chỉ tạm nghỉ, không sao — pet đợi bạn quay lại.
>
> Nếu có bug, screenshot {url support}.
>
> {Tên}

### Email R2: Sau 60 ngày inactive — last touch
**Subject:** Cảm ơn — và pet vẫn ở đó nếu bạn cần

> Hi {tên},
>
> Đã 60 ngày Bumbee không sync state. Có thể bạn đã gỡ hoặc thay máy.
>
> Tụi mình không spam thêm. Email này là last touch.
>
> Nếu sau này quay lại, pet vẫn ở đó. Discord {link} luôn có người trả lời.
>
> Cảm ơn đã thử Bumbee 🐰
>
> {Tên}

---

## 5. Renewal Sequence — Pro/Team sắp hết hạn

### Email RN1: 30 ngày trước renew
**Subject:** Pro của bạn renew {date} — bạn có muốn đổi gói?

> Hi {tên},
>
> Pro Personal của bạn sẽ tự renew 99k₫ ngày {date}.
>
> Đây là tóm tắt năm qua:
> - Tổng skin sở hữu: {N}
> - Hook events: {N}
> - Active days: {N}/{365}
> - Top agent: {agent name}
>
> Muốn nâng lên Pro+ (199k/tháng, full Avatar Pass)? {link}
> Muốn xuống Free? {link cancel}
> Muốn đổi sang annual giảm 20%? {link}
>
> Có gì hỏi tụi mình.

### Email RN2: 7 ngày trước, nếu chưa hành động
**Subject:** Auto-renew Pro {date} — last chance đổi gói

> Hi {tên},
>
> 7 ngày nữa Pro renew. Nếu bạn ổn — không cần làm gì, mọi thứ tự động.
>
> Muốn đổi/cancel: {link}

### Email RN3: Sau khi cancel
**Subject:** Đã cancel — pet bunny default vẫn ở với bạn

> Hi {tên},
>
> Pro của bạn đã cancel. Skin đã mua lẻ vẫn dùng được forever. Skin Avatar Pass sẽ revert về bunny default sau {ngày remaining}.
>
> Cloud sync sẽ disable. Setting hiện tại của máy hiện vẫn local.
>
> Nếu lý do cancel có thể chia sẻ: 1-2 dòng giúp tụi mình build tốt hơn. Cảm ơn 🐰

---

## 6. Email cho Team plan

### Email T1: Khi detect ≥ 3 dev cùng domain dùng Free
**Subject:** Thấy {N} dev của {company} đang dùng Bumbee — Team plan giúp gì?

> Hi {tên},
>
> Tụi mình thấy {N} dev có email @{company} đang dùng Bumbee Free. Team plan có thêm:
>
> - **Team Dashboard**: cross-agent analytics cho team
> - **Admin console**: quản lý seat, skin mặc định
> - **Gateway API**: tích hợp với tool nội bộ
> - **SLA 24h** support
>
> $8/seat/tháng, min 5 seats. Annual giảm 20%.
>
> Demo 30 phút Google Meet được không? {link Calendly}
>
> {Tên}

---

## Setting kỹ thuật

**Tool đề xuất:** Loops, Resend, hoặc Mailchimp.
**Frequency cap:** không quá 2 email/tuần per user (tổng các sequence).
**Suppression list:** unsubscribe, bounce, complaint.
**A/B test:**
- Subject line emoji vs no emoji
- Plain text vs HTML rich
- VN tone "tụi mình" vs "Bumbee Team"

**Metric đo:**
- Open rate target: > 35% (welcome), > 25% (others)
- CTR target: > 5%
- Free → Pro conversion từ email C1: > 3%
- Renewal email RN2 → renew: > 80%
