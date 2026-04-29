# 06 — Launch Plan (Day-by-day)

Kế hoạch launch Bumbee on Desk theo 4 tuần: pre-launch, launch day, post-launch.

## Mục tiêu launch

| Metric | 30 ngày | 90 ngày |
|---|---|---|
| GitHub stars | 2.000+ | 5.000+ |
| Total download | 5.000 | 20.000 |
| Active install | 2.000 | 8.000 |
| Pro signup | 50 | 300 |
| Team plan deal | 1 | 5 |
| Discord member | 500 | 2.000 |
| Press mention | 5 (blog/podcast) | 20 |

---

## T-30 đến T-15 (Pre-launch — chuẩn bị)

### Tuần T-4

- [ ] Final QA bản v1.0: test trên Win 11, macOS Apple Silicon, Ubuntu 22
- [ ] Build all platform installer (Win NSIS, Mac DMG, Linux AppImage + deb)
- [ ] Setup landing page bumbee.dev (copy từ `01-landing-copy.md`)
- [ ] Setup analytics: Posthog + Plausible
- [ ] Setup payment: Stripe global + SePay VN
- [ ] Setup email tool: Loops/Resend, import sequence từ `03-email-sequence.md`
- [ ] Setup Discord server: channels (general, showcase, support, dev, vn)
- [ ] Soft-recruit 20 beta tester từ network cá nhân, friend dev, Vietdev

### Tuần T-3

- [ ] Beta test 20 người, ghi feedback, fix bug critical
- [ ] Quay 5 video theo `05-video-script.md`
- [ ] Edit & subtitle video, schedule upload
- [ ] Viết draft 5 bài blog theo `04-blog-seo.md`, publish 1 bài "soft warmup" trước launch
- [ ] Viết 30 social post theo `02-social-content.md`, schedule
- [ ] Submit ProductHunt "coming soon" page, build subscriber list
- [ ] Reach out 10 KOL dev VN + 10 KOL global, mời beta access trước launch

### Tuần T-2

- [ ] Press release final (xem `07-press-kit.md`)
- [ ] Gửi press release tới 10 báo dev VN (TopDev, ITviec blog, Daynhauhoc, ThinhVu, ToiDi, Vietdev), 10 báo global (TheVerge, TechCrunch, ProductHunt blog, HackerNoon)
- [ ] KOL VN ship beta access + brief: 5 dev YouTuber/TikToker tech VN
- [ ] KOL global ship beta access: 5 dev có 10k+ follower X
- [ ] Tạo asset cho ProductHunt: logo, gallery, GIF, mô tả
- [ ] Test launch day flow: download installer → cài → verify hook → reach support
- [ ] Backup plan: nếu landing crash → static fallback, nếu Stripe lỗi → manual invoice flow

### Tuần T-1

- [ ] Final dry-run với team: ai làm gì giờ nào ngày launch
- [ ] Schedule social post day 0 (sáng VN, sáng PT US)
- [ ] Pin tweet, set up X spaces tối launch day để Q&A
- [ ] Inbox dọn sạch, set up auto-reply
- [ ] Discord welcome bot config
- [ ] Sleep tốt T-2 ngày 😴

---

## Day 0 — LAUNCH DAY

**Ngày đề xuất:** Tuesday hoặc Wednesday (PH tránh thứ 2 lễ + cuối tuần). Tránh tuần lễ Tết, holiday lớn.

### Lịch giờ (giờ VN, GMT+7)

| Giờ VN | Giờ PT (US) | Hành động |
|---|---|---|
| 06:00 | 16:00 hôm trước | Live ProductHunt PST midnight: post Bumbee on Desk |
| 06:30 | 16:30 | Submit Hacker News "Show HN: Bumbee on Desk — Desktop pet for AI coding agents" |
| 07:00 | 17:00 | Post Reddit r/ClaudeAI, r/cursor, r/Anthropic |
| 08:00 | 18:00 | Post X main account thread launch |
| 08:30 | 18:30 | Post LinkedIn personal account |
| 09:00 | 19:00 | Tweet thread tech deep dive (X Post 2 trong `02-social-content.md`) |
| 09:00 | — | Email database + newsletter list "Bumbee đã launch" |
| 10:00 | 20:00 | FB post Vietdev, J2Team groups |
| 11:00 | 21:00 | TikTok video 1 demo 60s |
| 12:00 | 22:00 | YouTube hero video 90s + tutorial 3p go live |
| 13:00 | 23:00 | Post Threads + IG Reel |
| 14:00 | 00:00 | Reply comment trên các kênh đầu post (mục tiêu < 15 phút response) |
| 16:00 | 02:00 | Post Reddit r/SideProject + r/IndieHackers + r/programming |
| 18:00 | 04:00 | Twitter X Spaces / Discord stage Q&A 60 phút |
| 20:00 | 06:00 | Update progress trên Twitter: "we crossed N stars / N installs!" |
| 22:00 | 08:00 | Wrap-up post + đếm metric ngày 0 |

### Roles trong team

- **Founder**: post chính, X spaces Q&A, reply DM
- **Marketing lead**: schedule social, monitor analytics
- **Community lead**: Discord, FB groups, comment reply
- **Support**: email + Intercom inbox, urgent bug
- **Dev**: standby fix bug critical nếu có (target deploy < 4h)

---

## Tuần W+1 (Post-launch — momentum)

### Mục tiêu: chuyển traction thành retention

- [ ] Daily: monitor metric, đo conversion
- [ ] Daily: reply mọi comment + DM trong 24h
- [ ] T+1: thank-you post tới tất cả contributor + early user (tag username)
- [ ] T+2: blog post "Day 2 numbers" công khai số liệu (transparency = trust)
- [ ] T+3: outreach lần 2 các báo chưa response
- [ ] T+4: video founder vlog "what happened in launch week"
- [ ] T+5-7: gom feedback → ship patch v1.0.1 nhanh

### Bài học cần ghi
- Conversion rate từng kênh
- Top traffic source
- Top dropping point trong funnel
- Bug critical được report
- KOL nào tạo conversion thật

---

## Tuần W+2 đến W+4

### W+2: Sustain
- [ ] Publish bài blog 2 (so sánh 5 CLI)
- [ ] TikTok 3 + 4 (avatar reveal + easter egg)
- [ ] Email Day 14 sequence cho user mới
- [ ] PR follow-up: mời báo viết review chi tiết hơn

### W+3: Pro Tier launch
- [ ] Public launch Pro Personal + Pro+
- [ ] Email blast tới user đã active 14 ngày: discount $1 first month
- [ ] FB post + X post Pro features
- [ ] KOL outreach offer Pro+ free đổi review

### W+4: Avatar Store soft launch
- [ ] Release 4 skin đầu (Áo dài, Office girl, Cyberpunk, Shiba)
- [ ] TikTok video 5 (avatar reveal)
- [ ] Pre-order link cho Pro+ Avatar Pass

---

## Risk & Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Bug critical Day 0 (crash macOS) | Medium | High | Beta test 20 người trước, hotfix < 4h ready |
| ProductHunt low engagement | Medium | Medium | Network warmup 30 friend trước launch, không spam ask vote |
| HackerNews flagged spam | Low | High | Show HN format đúng, không seed comment, accept fate |
| Server overload | Low | Medium | Cloudflare CDN cho landing, GitHub LFS không phát sinh |
| Negative feedback "another Electron app eats RAM" | High | Low | Đã chuẩn bị FAQ, có metric < 200MB |
| Anthropic legal concern Clawd character | Low | High | Đã rebrand Bumbee, character mới không reuse, có ack trong README |
| Competitor copycat | Medium | Low | Open source MIT — copycat lan ra cũng OK, moat là community + avatar store |
| Marketing budget cạn nhanh | High | Medium | Setup spend cap mỗi kênh, double down kênh ROI cao |

---

## Budget đề xuất launch month

| Khoản | Ngân sách (VNĐ) |
|---|---|
| Domain bumbee.dev + hosting (Vercel/Cloudflare) | 500.000 |
| Stripe + SePay setup phí | 0 (revenue share) |
| Email tool (Loops Pro 1 tháng) | 1.500.000 |
| Music license (Epidemic Sound 1 tháng) | 500.000 |
| Video editor freelance (5 video) | 10.000.000 |
| KOL gift Pro+ (5 KOL × $99 năm) | 12.500.000 |
| FB ads boost (test) | 5.000.000 |
| TikTok ads boost (test) | 5.000.000 |
| Designer commission (12 skin × $150) | 45.000.000 |
| Landing dev freelance (1 tuần) | 8.000.000 |
| Buffer | 12.000.000 |
| **Tổng** | **~100.000.000 VNĐ (~$4.000)** |

Lean budget — nếu không có vốn có thể cắt video freelance (tự làm), bỏ paid ads (organic only), launch trễ skin (chỉ bunny lúc đầu).

---

## Decision log launch

Mỗi quyết định lớn tracking ở đây:

| Date | Decision | Rationale |
|---|---|---|
| _(điền khi launch)_ | _(VD: chọn ngày T+0 = thứ 3 16/04)_ | _(reasoning)_ |

## Post-launch retrospective (làm ngày T+30)

Câu hỏi để brainstorm:
1. Metric nào trượt mục tiêu? Tại sao?
2. Kênh nào ROI cao nhất?
3. Feedback chung từ user là gì?
4. Bug nào không lường trước?
5. Cộng đồng nào support nhiều nhất?
6. Tháng tới ưu tiên gì?
