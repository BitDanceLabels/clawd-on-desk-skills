# 03 — Bảng giá & Gói dịch vụ

## Triết lý pricing

1. **Free core mạnh** — bản open-source MIT đầy đủ tính năng cốt lõi để build community.
2. **Pro = trải nghiệm + cá nhân hóa** — không gate tính năng kỹ thuật, mà gate avatar/skin/dashboard.
3. **B2B = dữ liệu + hỗ trợ** — Team Dashboard và SLA chỉ ở tier doanh nghiệp.
4. **Marketplace cắt 30%** — nghệ sĩ upload skin, người dùng mua, Bumbee giữ 30% (giống AppStore/Booth.pm).

## Bảng giá tổng thể

| Gói | Giá | Đối tượng | Highlight |
|---|---|---|---|
| **Free** | 0₫ | Mọi dev | Pet đầy đủ 12 state, multi-agent, mini mode |
| **Bumbee Pro Personal** | 99k₫/tháng hoặc 999k₫/năm (~$4.99/$49.99) | Dev cá nhân | + Avatar Store credit + theme + cloud sync setting |
| **Bumbee Pro+ (Avatar Pass)** | 199k₫/tháng (~$9.99) | Dev mê character | Pro + unlock toàn bộ Avatar Store |
| **Bumbee Team** | $8/seat/tháng (min 5 seats) | Startup, dev team | Team Dashboard + analytics + admin |
| **Bumbee Enterprise** | Custom (từ $20k/năm) | Công ty ≥ 50 dev | SSO, on-prem, SLA, custom skin team |
| **Bumbee White-label** | Từ $5,000/năm + revenue share | AI startup, OEM | Rebrand engine + mascot riêng |

## Chi tiết từng gói

### 🆓 Free (Open Source MIT)
**Có sẵn:**
- Toàn bộ animation 12 state
- Hỗ trợ 5 agent (Claude Code, Codex, Copilot, Gemini, Cursor)
- Permission bubble
- Mini mode
- 1 nhân vật mặc định (Bumbee bunny)
- Auto-update từ GitHub
- Remote SSH
- Tự host, sửa code thoải mái

**Không có:**
- Không cloud sync setting
- Không Avatar Store
- Không team analytics
- Không hỗ trợ chính thức (community-only)

### 💎 Bumbee Pro Personal — 99k/tháng

**Thêm so với Free:**
- 50 credit/tháng để mua avatar trên Store (1 avatar phổ thông ~30-50 credit)
- Cloud sync: setting, skin, vị trí pet đồng bộ giữa nhiều máy
- Theme exclusive: dark elegant, cyberpunk, pastel
- Tiếng Việt UI
- Priority email support (48h)
- Beta access animation mới

**Ai mua?** Dev VN/SEA, indie hacker, freelancer.

### ⭐ Bumbee Pro+ (Avatar Pass) — 199k/tháng

**Thêm so với Pro:**
- Unlock tất cả avatar trên Store (không tốn credit)
- Avatar premium độc quyền (Limited Edition theo tháng — Tết, Halloween, Lunar New Year…)
- Ưu tiên đặt custom skin (giảm 30% phí commission)
- Badge "Founding Member" trong community

**Ai mua?** Heavy user, collector, content creator.

### 🏢 Bumbee Team — $8/seat/tháng (min 5 seats)

**Mọi thứ ở Pro+ cho mỗi seat, cộng:**
- **Team Dashboard** (web): tổng số session/day team, agent breakdown, top tool used, error rate
- **Admin console**: assign avatar mặc định, force update version
- **Bumbee Gateway API hạn chế** (xem mục riêng dưới)
- SLA email response 24h
- Onboarding 1-1 cho admin

**Ai mua?** Startup 5-50 dev, dev team trong công ty trung bình.

### 🏛️ Bumbee Enterprise — Custom

**Mọi thứ ở Team, cộng:**
- SSO (SAML, OIDC)
- On-prem deployment (Docker / K8s helm chart)
- Air-gapped mode (không gọi GitHub Releases)
- Custom skin theo brand công ty (4 skin/năm)
- SLA 4h response, 24/7 emergency
- Quarterly business review
- Audit log + compliance report (SOC2-friendly)

**Khởi điểm:** $20,000/năm cho 50 seats, $400/seat/year tier trên.

**Ai mua?** Công ty 50-500 dev, đặc biệt fintech/agency có nhu cầu compliance.

### 🤝 Bumbee White-label / OEM — Từ $5,000/năm

**Cho công ty muốn rebrand pet engine:**
- Source code build từ private fork (không phải MIT public)
- Logo, tên app, icon, mascot tùy chỉnh hoàn toàn
- Hook layer custom theo agent độc quyền của khách
- Optional: revenue share 10-15% nếu khách bán lại

**Ai mua?** Startup AI dev tool muốn có mascot, công ty OEM phần mềm.

## Bumbee Avatar Store — Marketplace

**Mô hình:**
- Artist upload skin (pixel art / Live2D)
- User mua bằng credit hoặc trực tiếp ($0.99-29.99/skin)
- Bumbee giữ **30%**, artist nhận **70%**

**Tier giá skin:**
| Tier | Giá | Mô tả |
|---|---|---|
| Common | $0.99-2.99 | Reskin đơn giản (đổi màu, accessory) |
| Rare | $4.99-9.99 | Animation đầy đủ 12 state, pixel art riêng |
| Epic | $14.99-19.99 | Live2D nhân vật full body |
| Legendary | $24.99-49.99 | Live2D + voice + reaction set độc quyền |

**Bộ sưu tập launch (12 nhân vật):**
1. Bumbee Bunny — mặc định free
2. Áo Dài Cô Em — Rare, $7.99
3. Hanfu Tiểu Thư — Rare, $7.99
4. Office Girl — Rare, $6.99
5. Cyberpunk Hacker — Epic, $14.99
6. Mèo Mun — Common, $1.99
7. Shiba Inu — Common, $2.99
8. Witch Apprentice — Epic, $16.99
9. Samurai Cat — Epic, $14.99
10. Robot Mecha — Rare, $9.99
11. Ghost Programmer (Halloween) — Limited, $9.99
12. Tết Lì Xì Bunny (Tết LE) — Limited, $5.99

## Bumbee Gateway API

**Cho dev tự build extension:**
- Free tier: 1.000 request/tháng, basic event push
- Pro: 50.000/tháng, $9/tháng
- Team/Enterprise: included

**Use case:**
- Custom agent gửi state vào Bumbee
- Trigger animation từ event ngoài (CI/CD, monitoring)
- Tích hợp vào trợ lý voice riêng

## Promotion / Discount

- **Annual prepay**: -20% (1 năm trả 1 lần)
- **Student**: -50% với email .edu / xác minh thẻ sinh viên VN
- **Indie hackers / FOSS contributor**: free Pro 1 năm khi PR được merge vào repo
- **Referral**: -10% cho cả 2 phía khi referral mua paid plan
- **Launch month**: tháng đầu công bố giảm 30% lifetime cho 100 user đầu

## Khả năng sinh lời (estimate năm 1)

Giả định traction VN tier 1:
- 500 Pro Personal × 99k × 12 = **594.000.000₫**
- 100 Pro+ × 199k × 12 = **238.800.000₫**
- 5 Team × 10 seats × $8 × 12 × 24.500 = **117.600.000₫**
- 1 Enterprise = **$20k = 490.000.000₫**
- 2.000 skin sold × avg $5 × 30% = **$3.000 = 73.500.000₫**

**Tổng năm 1 estimate: ~1,5 tỷ VNĐ** (chưa trừ chi phí artist commission, hosting, marketing).

Số liệu để tham khảo, không cam kết.
