# 07 — Quy trình bán hàng (Sales Process)

## Funnel tổng thể

```
Awareness → Interest → Trial (Free) → Activation → Conversion (Pro/Team) → Expansion → Advocacy
```

## Stage 1 — Awareness (lượng truy cập đầu vào)

**Kênh:**
- Content marketing (blog, video, X thread) — xem `/marketing/`
- Cộng đồng dev: Reddit r/ClaudeAI, r/cursor, r/Anthropic, HackerNews, ProductHunt
- Việt Nam: Vietdev FB group, J2Team, TopDev, Daynhauhoc
- KOL outreach: dev influencer trên YouTube/X

**KPI:**
- Visit / tháng
- Click → GitHub stars
- Click → Download installer

**Chuyển sang Interest** = user click landing page CTA hoặc star repo.

## Stage 2 — Interest

**Hành vi user:**
- Đọc landing
- Xem demo video
- Click GitHub README
- Đọc docs

**Cần cho user:**
- Landing rõ value prop trong 5 giây
- Demo video < 60 giây
- Setup guide 1 dòng (`npm start` hoặc download installer)

**KPI:**
- Time on page > 1 phút
- % scroll đến demo
- Click "Download" / "Get Started"

## Stage 3 — Trial (cài Free)

**Trải nghiệm cốt lõi user phải đạt được:**
1. Cài app < 3 phút
2. Pet xuất hiện trên màn hình < 30 giây sau khi start
3. Lần đầu prompt Claude Code → pet thinking → "wow"

**Onboarding tự động:**
- Lần đầu mở app: pet xuất hiện kèm tooltip "Tôi sống được khi bạn dùng AI agent đó. Thử prompt Claude Code xem!"
- Sau 5 phút không có hook event: tooltip "Cần help setup hook? Click vào đây."
- Sau 1 ngày: notification nhỏ "Bạn vừa có 23 session với Claude Code hôm nay 🐰"

**KPI:**
- % user có ≥ 1 hook event trong 24h đầu (activation rate)
- Số ngày user mở app trong tuần đầu
- Retention day 7

## Stage 4 — Activation

User được tính là **activated** khi:
- ≥ 5 ngày active trong 7 ngày
- ≥ 50 hook events / ngày
- Đã thử ít nhất 2 agent

→ Đây là user đã **value the product**, sẵn sàng nghe pitch Pro.

## Stage 5 — Conversion

### Trigger nâng cấp Pro Personal:
- User đã active 14 ngày → in-app prompt: "Bạn đã 14 ngày cùng Bumbee 🎉 Mở Avatar Store xem 12 nhân vật mới?" → click → modal Pro
- User mở Avatar Store xem ≥ 3 lần → in-app prompt offer first-month $1
- User dùng nhiều máy (detect via account) → modal Cloud Sync

### Trigger nâng cấp Team:
- Detect ≥ 3 user cùng domain email → email outreach manual: "Thấy team {công ty} có {N} dev đang dùng Bumbee. Team plan có dashboard tổng hợp, ưu đãi annual. Có 15 phút em demo không?"
- Manual lead từ landing form "I'm a team manager"

### Trigger nâng cấp Enterprise:
- Inbound từ form / email
- Outbound: tự sales team identify công ty tier 1 (50+ dev, đã adopt AI agent)

### Phương thức close:
- **Self-serve** (Pro Personal/Pro+/Avatar Store): Stripe / SePay / payment gateway VN, 1 click checkout
- **Touch-low** (Team < 20 seats): demo qua Google Meet 30 phút + invoice
- **Touch-high** (Team 20+, Enterprise): MSA, PoC, security review, procurement cycle

## Stage 6 — Expansion

**Cho user đã trả tiền:**
- Cross-sell skin lẻ trong Pro Personal
- Upsell Pro → Pro+ (Avatar Pass)
- Upsell Pro+ → Custom Skin commission
- Upsell Team → thêm seat

**Cho Team / Enterprise:**
- Quarterly business review tìm room mở rộng
- Đưa feature mới vào contract năm sau
- Co-marketing (case study, joint webinar)

## Stage 7 — Advocacy

**Biến user thành kênh marketing:**
- Referral program: -10% cả hai phía
- "Founding Member" badge cho 100 user đầu trả tiền
- Case study: phỏng vấn user → blog → tag user trên X
- Bug bounty + feature request: thưởng Pro 1 năm khi PR được merge
- KOL nhỏ: gửi free Pro+ cho dev có 1k+ follower trên X/TikTok đổi review

## Quy trình xử lý lead manual (cho Sales)

### Bước 1: Lead vào CRM
**Nguồn:**
- Form landing
- Email response
- DM social
- Webhook từ app khi user click "Talk to sales"

**Trong vòng 24h** sales gửi email phản hồi đầu.

### Bước 2: Qualify
4 câu hỏi qualify (BANT light):
1. **Budget**: cá nhân / team / công ty trả?
2. **Authority**: bạn quyết được không hay cần qua boss?
3. **Need**: dùng agent gì, mỗi ngày bao nhiêu session?
4. **Timeline**: cần dùng từ khi nào?

→ Phân loại:
- **Hot**: budget có, authority có, timeline < 30 ngày → demo trong tuần
- **Warm**: 1-2 yếu tố thiếu → demo trong 2 tuần + nurture content
- **Cold**: chỉ tò mò → email sequence nurture, không cần demo cá nhân

### Bước 3: Demo
- Hot lead: schedule trong 3 ngày
- Warm: 7 ngày
- Format: Google Meet 30 phút (5 phút intro + 15 phút demo + 10 phút Q&A)

### Bước 4: Proposal
- Cá nhân/Team < 10 seats: link Stripe checkout luôn sau demo
- Team 10+ / Enterprise: PDF proposal trong 48h, gồm pricing tier, security overview, SLA, support

### Bước 5: Close
- Self-serve auto Stripe
- Manual: gửi MSA, đợi sign, invoice, kick-off meeting

### Bước 6: Onboarding
- Personal: email guide + invite Discord
- Team: 1 buổi onboard 60 phút cho admin + setup SSO + train dashboard
- Enterprise: kick-off + PoC plan 30 ngày + dedicated CSM

### Bước 7: Theo dõi & expand
- Tuần 1, 4, 12 sau onboard: check-in email
- Quý: business review (Team+/Enterprise)
- Năm: renewal 60 ngày trước expire

## Sales tooling stack đề xuất

| Mục đích | Công cụ |
|---|---|
| CRM | HubSpot Free / Pipedrive / Notion (giai đoạn đầu) |
| Email outreach | Lemlist / Mailshake / Apollo |
| Lead enrichment | Hunter.io / Apollo |
| Demo & meeting | Google Meet + Calendly |
| Payment | Stripe (global) + SePay/VietQR (VN) |
| Analytics | Posthog (privacy-first) + Plausible |
| Support | Intercom / Crisp / kết hợp Discord |

## SLA nội bộ

| Stage | Response time |
|---|---|
| Form lead | ≤ 24h |
| Hot lead | demo trong 3 ngày |
| Email Pro user | ≤ 48h |
| Email Team user | ≤ 24h |
| Email Enterprise | ≤ 4h biz hour |
| Critical bug | ≤ 4h Enterprise, ≤ 24h Team, best-effort Pro |

## Metric tổng để báo cáo

- **MRR / ARR**
- **Free → Pro conversion rate** (mục tiêu 2-5%)
- **Activation rate** (mục tiêu 40%+)
- **Pro Personal churn** (mục tiêu < 5%/tháng)
- **NPS** (mục tiêu > 40)
- **Avatar Store revenue / Pro user**
- **Team plan expansion rate** (% Team upgrade thêm seat trong 6 tháng)
