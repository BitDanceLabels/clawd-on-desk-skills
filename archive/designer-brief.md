# Character Designer Brief — Clawd on Desk

> Đưa file này cho họa sĩ/studio bạn thuê. Nó định nghĩa chính xác cần
> những gì để model chạy được trong app.

## 1. Project context

**App:** Clawd on Desk — desktop pet for Windows / macOS / Linux.
**Repo:** https://github.com/BitDanceLabels/clawd-on-desk-skills
**Distribution:** commercial (Steam, Microsoft Store, direct download).

App hiện tại đã có pipeline render Live2D + VRM 3D. Designer chỉ cần giao
file model đúng spec, app tự động nhận diện.

---

## 2. Hai option format — chọn 1 hoặc cả 2

### Option A — Live2D (2.5D, được khuyên cho mass market)

| Yêu cầu | Spec |
|---|---|
| Format | Live2D Cubism 4 (`.model3.json` + `.moc3` + textures + motions) |
| SDK version | Cubism 4 (4.0+) — KHÔNG dùng Cubism 2 (deprecated) |
| Texture size | 1024×1024 hoặc 2048×2048 (PNG, alpha) |
| Canvas size | 2048×2048 viewBox khi rig |
| Polygon count | < 5000 polygons (tối ưu desktop pet) |
| Bone hierarchy | Standard humanoid + face deformers |
| File size tổng | < 10 MB / model (gồm cả textures, motions) |

### Option B — VRM 3D (xoay 360, premium tier)

| Yêu cầu | Spec |
|---|---|
| Format | VRM 1.0 (`.vrm` single file) |
| Build tool | VRoid Studio, Blender + UniVRM, Unity + UniVRM |
| Polygon count | < 50,000 triangles |
| Texture size | 2048×2048 max per texture |
| Bone hierarchy | VRM Humanoid standard (53 bones) |
| Blendshapes | VRM Expression preset (tối thiểu: Neutral, Joy, Angry, Sorrow, Fun, Blink, Aa, Ih, Ou, Ee, Oh) |
| File size | < 30 MB / model |

---

## 3. Style guidelines (mandatory)

### Phong cách

- **Chibi / semi-realistic anime** — đầu chiếm ~1/3 chiều cao, dễ thương
- **Color palette mềm** — pastel, không neon chói
- **Style tham khảo**: Animal Crossing, Genshin Impact NPC chibi, Hololive
  characters trong style "small mascot" mode
- **KHÔNG** sexualized: che vai, bụng, đùi. Quần áo che kín ngực và bụng.
  Skirt/shorts không quá ngắn (qua đầu gối hoặc qua giữa đùi).

### Outfit options designer có thể đề xuất

| Theme | Mô tả |
|---|---|
| **Áo dài Việt** | Áo dài truyền thống/cách tân, quần dài, nón lá optional |
| **Hanfu/Qipao** | Trung Hoa cổ trang elegant, tay rộng |
| **Office anime** | Sơ mi + váy bút chì + giày Oxford, tóc búi |
| **Casual student** | Hoodie + skirt qua gối + sneaker |
| **Kimono Nhật** | Yukata ngắn + obi |
| **Hiện đại minimalist** | Áo len oversized + quần jeans + tóc bob |

→ Designer nên đề xuất 2–3 mood board trước khi đi vào sketch.

### Pose

- **Idle resting**: đứng tự nhiên, hai tay xuống, mắt nhìn về phía người dùng
- **Sitting**: ngồi xếp bằng hoặc khoanh chân (cho desktop pet small size)

---

## 4. Animation requirements

### Live2D — required motion groups

Model PHẢI có ít nhất các motion group sau (đặt trong `Motions` của
`.model3.json`):

| Group name | Mô tả | Số motion files |
|---|---|---|
| `Idle` | Loop thở/blink/swing tóc | 2–3 motions |
| `TapBody` | Phản ứng khi click vào model | 1–2 motions |
| `Tap` | Reaction nhẹ | 1 motion (optional) |

Mapping app → motion:

```
state "idle"          → group "Idle"
state "working"       → group "Idle" (hoặc "Working" nếu có)
state "thinking"      → group "Idle"
state "sleeping"      → group "Idle"
state "notification"  → group "TapBody" → fallback "Tap" → fallback "Idle"
state "attention"     → group "TapBody" → fallback "Tap" → fallback "Idle"
state "error"         → group "TapBody" → fallback "Idle"
```

Designer có thể bonus thêm các group:
- `Working` — gõ phím / cầm laptop
- `Sleep` — nhắm mắt nằm
- `Surprised` — ngạc nhiên / exclamation
- `Sad` — buồn / lỗi

App auto-detect và sẽ map nếu có.

### Live2D — required parameters

Model phải có các parameter chuẩn Cubism để app điều khiển realtime:

| Parameter ID | Range | Used for |
|---|---|---|
| `ParamAngleX` | -30 ~ 30 | Eye tracking horizontal |
| `ParamAngleY` | -30 ~ 30 | Eye tracking vertical |
| `ParamAngleZ` | -30 ~ 30 | Head tilt |
| `ParamEyeBallX` | -1 ~ 1 | Pupils horizontal |
| `ParamEyeBallY` | -1 ~ 1 | Pupils vertical |
| `ParamMouthOpenY` | 0 ~ 1 | Lip-sync (future feature) |
| `ParamMouthForm` | -1 ~ 1 | Smile/frown |

Tất cả params trên là **standard Cubism** — designer Live2D chuyên nghiệp
sẽ tự rig đúng convention.

### VRM — recommended animations

VRM model **không cần animation built-in** (app sẽ wire BVH/Mixamo motion sau).
Chỉ cần:
- T-pose chuẩn humanoid
- Spring bone setup cho tóc + vạt áo (tự nhiên khi đi/xoay)
- Face blendshapes đầy đủ (Joy, Angry, Sorrow, Fun, Blink, viseme)

---

## 5. License — quan trọng nhất

Designer PHẢI ký một trong hai dạng:

### Option 1 — Buyout đầy đủ (khuyên cho commercial)
- Bạn sở hữu 100% IP
- Có quyền chỉnh sửa, redistribute, bán
- Designer không quyền dùng asset cho dự án khác
- Giá thường cao hơn 30–50% so với commission thường

### Option 2 — Commercial use license
- Designer giữ IP, bạn có quyền dùng commercial trong app cụ thể
- Không quyền resell asset standalone
- Rẻ hơn nhưng giới hạn

⚠️ **TUYỆT ĐỐI** không nhận file mà không có giấy tờ license rõ ràng. Nhiều
artist Việt nhận commission nhưng giữ quyền — sau này họ có thể yêu cầu
takedown nếu thấy app bạn bán tốt.

Mẫu hợp đồng ngắn (English):

```
The artist (<name>) hereby grants <your company> exclusive worldwide
rights to use, modify, reproduce, and distribute the delivered Live2D /
VRM character files ("Asset") as part of any product or marketing
material.

The artist confirms the Asset is original work, not infringing any
third-party rights, and not previously sold to another party.

Signed: <artist> ___ <date> ___
        <buyer>  ___ <date> ___
```

---

## 6. Deliverables checklist

### Live2D delivery package

```
character-name/
├── character-name.model3.json     ← entry, app tìm file này
├── character-name.moc3            ← model data (binary)
├── character-name.physics3.json   ← physics (tóc, váy)
├── character-name.pose3.json      ← T-pose data
├── character-name.cdi3.json       ← display info (optional)
├── textures/
│   └── texture_00.png             ← 2048×2048 PNG alpha
├── motions/
│   ├── idle_01.motion3.json
│   ├── idle_02.motion3.json
│   ├── tap_body_01.motion3.json
│   └── ...
└── expressions/                   ← optional
    ├── smile.exp3.json
    └── ...
```

### VRM delivery package

```
character-name.vrm                 ← single file (GLB-based)

Bonus deliverables:
├── source/
│   ├── character-name.blend       ← Blender source (nếu Blender)
│   └── character-name.vroid       ← VRoid Studio source (nếu VRoid)
└── textures/
    └── exports.zip                ← high-res texture exports
```

### Mỗi delivery kèm:

- [ ] License contract đã ký
- [ ] Source file (.blend / .psd / .vroid) — quan trọng để chỉnh sửa sau
- [ ] Test screenshot showing model render đúng
- [ ] Demo video 10–30s show idle animation
- [ ] List of motion group names trong `.model3.json` (cho Live2D)
- [ ] List of expressions / blendshapes available

---

## 7. Test trước khi accept delivery

```bash
# 1. Drop model vào dev environment
# Live2D:
copy character-name/ → assets/live2d/character-name/
# VRM:
copy character-name.vrm → assets/vrm/character-name.vrm

# 2. Run app
npm start

# 3. Right-click pet → Character → Live2D Characters / VRM 3D Characters
#    → chọn character mới
#    → verify rendering, animation, không lỗi console

# 4. Test các state (delegate task to Claude Code, đợi work/idle/sleep loop)
```

Nếu lỗi: bug report cho designer kèm console log + screenshot.

---

## 8. Pricing reference (research 2026)

| Studio level | Live2D | VRM |
|---|---|---|
| Indonesia/VN/Phillipines mid-tier | $150–400 | $200–500 |
| China/Korea pro | $400–1200 | $500–1500 |
| Japan top studio (Live2D verified partner) | $1500–5000 | $2000–6000 |

Tham khảo:
- https://booth.pm — search "Live2D commission" filter Đông Nam Á
- https://www.fiverr.com/categories/programming-tech/game-development?gigs_filter%5Btype%5D=animation
- ArtStation — Live2D rigger/animator
- Behance — VRoid creator portfolios
- Twitter: search hashtag #commissionopen #live2dcommission

---

## 9. Production timeline

| Phase | Live2D | VRM |
|---|---|---|
| Concept + sketch | 3–5 days | 3–5 days |
| Illustration / 3D modeling | 7–14 days | 14–21 days |
| Rigging | 7–14 days | 5–10 days |
| Motion / blendshape | 5–10 days | 5–10 days |
| QA + revision | 5 days | 5 days |
| **Total per character** | **27–48 days** | **32–51 days** |

Đặt 3 character song song với 3 designer khác nhau → ra mắt sau ~6 tuần.

---

## 10. Liên hệ technical từ phía bạn

Để designer hỏi technical question:
- Pipeline source: https://github.com/BitDanceLabels/clawd-on-desk-skills/blob/main/src/live2d-renderer.js
- Pipeline source (VRM): https://github.com/BitDanceLabels/clawd-on-desk-skills/blob/main/src/vrm-renderer.js
- Test build: chạy `npm run setup:demo-models` để xem 2 demo Hiyori/Haru
  của Live2D Inc làm reference

---

## 11. Don't / Hard requirements

- ❌ KHÔNG dùng Cubism 2 (deprecated)
- ❌ KHÔNG dùng FBX rigged character cho Live2D (chỉ Cubism)
- ❌ KHÔNG miss license contract
- ❌ KHÔNG dùng face/body của người thật làm reference (chân dung quyền)
- ❌ KHÔNG phong cách sexualized (sẽ bị Steam/Microsoft Store reject)
- ❌ Không miss texture alpha (background phải transparent)
- ✓ Source file (.blend/.vroid/.psd) PHẢI delivered
- ✓ License contract PHẢI ký trước khi nhận tiền cọc

---

## 12. Quick links

| Tool | URL |
|---|---|
| Live2D Cubism Editor (rigging) | https://www.live2d.com/en/cubism/download/editor/ |
| Live2D Cubism Free Trial license info | https://www.live2d.com/en/sdk/license/ |
| VRoid Studio (free, build VRM) | https://vroid.com/en/studio |
| VRM specification | https://vrm.dev/en/ |
| UniVRM (Unity/Blender VRM tools) | https://github.com/vrm-c/UniVRM |
| Test app pipeline (this app) | https://github.com/BitDanceLabels/clawd-on-desk-skills |
