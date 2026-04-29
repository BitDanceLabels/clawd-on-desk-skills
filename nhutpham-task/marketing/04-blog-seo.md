# 04 — Blog SEO Articles

5 bài blog target keyword cụ thể, dài 1500-2500 từ mỗi bài.

| # | Title | Primary keyword | Intent | Format |
|---|-------|-----------------|--------|--------|
| 1 | Cách thấy Claude Code đang làm gì mà không phải nhìn terminal | "claude code visibility", "claude code monitor" | Informational | How-to |
| 2 | So sánh 5 AI coding CLI 2026: Claude Code vs Cursor vs Copilot vs Codex vs Gemini | "claude code vs cursor", "best ai coding cli 2026" | Comparison | Listicle |
| 3 | Permission UX trong AI coding agent: vấn đề và 3 giải pháp | "ai agent permission", "claude code permission ux" | Thought leadership | Essay |
| 4 | Setup desktop dev 2026: 8 thứ developer dùng AI agent nên có | "dev desktop setup 2026", "ai dev setup" | Lifestyle | Listicle |
| 5 | Build pet desktop tích hợp AI agent: kiến trúc Bumbee on Desk | "electron desktop pet", "ai agent hook architecture" | Tech deep-dive | Tutorial |

---

## Bài 1 — Cách thấy Claude Code đang làm gì mà không phải nhìn terminal

**Slug:** `/blog/claude-code-visibility-without-terminal`
**Meta description:** Mệt vì phải switch tab terminal liên tục để check Claude Code? Hướng dẫn 4 cách có visibility tốt hơn vào AI coding session, từ tail -f đến desktop pet.

### Outline

#### H2: Vấn đề: Terminal là blackbox khi chạy AI agent
- Claude Code chạy 30 giây không output → đang nghĩ hay treo?
- Permission request hiện ra trong terminal → bị browser/editor che → miss
- Multi-session → 3 tab terminal → không biết tab nào đang chạy gì
- Agent crash → không có ai báo

#### H2: 4 cách tăng visibility Claude Code session

**H3: 1. Tail log file**
```bash
tail -f ~/.claude/logs/session-*.log
```
Pros/Cons. Lý do dev hardcore vẫn dùng cách này. Hạn chế: vẫn cần tab thứ 3.

**H3: 2. Status bar terminal (tmux/zsh prompt)**
- Customize tmux status bar gọi API local
- Plugin starship hiển thị state
- Setup mức trung cấp

**H3: 3. Notification system (macOS Notification Center / Windows Toast)**
- Claude Code's built-in notification hook
- Pros: không tốn UI space
- Cons: dễ miss notification, không thể hiện multi-session

**H3: 4. Desktop pet (Bumbee on Desk)**
- Pet pixel art ngồi góc desktop
- 12 trạng thái map từ event hook real-time
- Permission bubble pop khi cần Allow/Deny
- Multi-agent: 1 pet cover Claude Code + Cursor + Copilot + Codex + Gemini
- Setup: tải bumbee.dev, hook tự register

→ Compare bảng 4 cách (effort, visibility, multi-session, vibe).

#### H2: Khi nào nên dùng cách nào?
- Solo dev minimal vibe → tail -f đủ
- Solo dev decor desktop → Bumbee
- Team dev → Bumbee Team Dashboard cross-agent
- Headless server → tail + log shipping (Datadog/Loki)

#### H2: Setup Bumbee 3 phút
- Tải installer từ bumbee.dev
- Mở app → pet xuất hiện
- Mở Claude Code → pet phản ứng
- (Hook auto-register, không cần config)

#### H2: Kết
- Visibility là vấn đề thật của AI coding 2026
- Bumbee là 1 cách solve, free open source MIT
- CTA: tải về thử

**Internal link:** `/pricing`, `/docs/setup`, `/blog/permission-ux`

---

## Bài 2 — So sánh 5 AI coding CLI 2026

**Slug:** `/blog/ai-coding-cli-comparison-2026`
**Meta description:** Đánh giá đầy đủ Claude Code, Cursor Agent, Copilot CLI, Codex CLI, Gemini CLI 2026 — strengths, weaknesses, pricing, hook support.

### Outline

#### H2: 5 AI coding CLI đáng dùng 2026
Bảng tổng quan: vendor, ngày ra mắt, ngôn ngữ runtime, pricing tier free/paid.

#### H2: Claude Code (Anthropic)
- Strengths: hook system mature, permission UX (terminal), agentic loop tốt
- Weaknesses: pricing API token đắt, Codespaces support limited
- Hook integration: full command + HTTP hook
- Best for: indie dev, complex multi-step task

#### H2: Cursor Agent
- Strengths: tích hợp IDE Cursor, hook API mới
- Weaknesses: cần Cursor IDE
- Hook integration: stdin JSON
- Best for: team đã dùng Cursor IDE

#### H2: Copilot CLI
- Strengths: GitHub ecosystem, free tier rộng cho student
- Weaknesses: hook chỉ support deny không support allow
- Hook integration: command hook, manual setup
- Best for: dev đã dùng Copilot trong VS Code muốn extend ra terminal

#### H2: Codex CLI (OpenAI)
- Strengths: GPT-5/o3 power, JSONL log dễ parse
- Weaknesses: hook hardcoded off trên Windows, latency 1.5s polling
- Hook integration: chỉ JSONL polling
- Best for: dev macOS/Linux ưa OpenAI

#### H2: Gemini CLI (Google)
- Strengths: free tier rộng, tích hợp Google Workspace
- Weaknesses: subagent detection limited, ecosystem mới
- Hook integration: command hook auto-register
- Best for: dev đã dùng Google Cloud, thử nghiệm free

#### H2: Bảng so sánh dài
| Feature | Claude Code | Cursor | Copilot | Codex | Gemini |
|---|---|---|---|---|---|
| Hook system | ✅ Full | ✅ Stdin | ⚠️ Deny only | ❌ JSONL only | ✅ Command |
| Permission UX | ⚠️ Terminal | ⚠️ Terminal | ⚠️ Terminal | ⚠️ Notification | ⚠️ Terminal |
| Multi-session tracking | Manual | Manual | Manual | Manual | Manual |
| Free tier | $5 credit | Free 2 weeks | Free + edu | Limited | Generous |
| Multi-platform | Win/Mac/Linux | Win/Mac/Linux | Win/Mac/Linux | Mac/Linux | Win/Mac/Linux |

#### H2: Workflow dùng đồng thời
- Tại sao dev dùng nhiều CLI cùng lúc (mỗi cái mạnh khác)
- Vấn đề: visibility cross-CLI khó
- Bumbee on Desk gom state cả 5 vào 1 pet desktop

#### H2: Kết luận
- Không có CLI tốt nhất, chỉ có CLI phù hợp task
- Universal tool như Bumbee giúp orchestration

**CTA cuối:** Bumbee on Desk hỗ trợ cả 5 — tải bumbee.dev

---

## Bài 3 — Permission UX trong AI coding agent

**Slug:** `/blog/ai-agent-permission-ux-problem`
**Meta description:** AI coding agent ngày càng nhiều quyền. Permission UX hiện tại trong terminal đang fail. 3 hướng giải pháp.

### Outline

#### H2: Vấn đề: Permission fatigue
- Agent xin Read, Write, Bash, WebFetch, Edit liên tục
- Mỗi request là một moment "should I trust?"
- Terminal UX: text "(y/n)" → user mệt → reflex bấm y → security risk

#### H2: Vì sao terminal permission UX kém
- Không visible khi terminal bị che
- Không context (tool gì? file nào? command gì?)
- Không bulk action (every time individual)
- Không persistence rules (must answer mỗi lần)

#### H2: 3 hướng giải pháp

**H3: 1. Settings rule-based (Claude Code's allow/deny rules)**
- Pros: đặt 1 lần, áp lâu
- Cons: setup ban đầu friction, không cover edge case

**H3: 2. Permission dashboard riêng (proposal)**
- Concept: web UI riêng, list pending request
- Pros: visualize tốt
- Cons: yet another tab

**H3: 3. Floating bubble (Bumbee on Desk approach)**
- Pet pop bubble nổi góc phải dưới khi có request
- Card hiển thị: tool name + command preview + 3 nút Allow/Deny/Suggestion
- Auto-dismiss nếu user trả lời terminal trước
- Stack nếu nhiều request cùng lúc
- Pros: peripheral attention, không cần switch tab
- Cons: chỉ work với Claude Code (other agent hook chưa support full flow)

#### H2: Architecture của bubble
```
Claude Code PermissionRequest
  → HTTP POST 127.0.0.1:23333/permission
  → Bumbee tạo BrowserWindow bubble
  → User click → response { behavior }
  → Claude Code execute
```
Code snippet, screenshot bubble UI.

#### H2: Future của permission UX
- Voice approval ("Hey Bumbee, allow this")
- Mobile companion approval (push tới iPhone)
- Team-level policy (admin set rule, user inherit)

#### H2: Kết
- Permission UX là design space rộng, terminal là local minima
- Bumbee là 1 attempt. Nhiều attempt sẽ tốt cho cộng đồng.

**CTA:** Cài Bumbee free thử bubble: bumbee.dev

---

## Bài 4 — Setup desktop dev 2026

**Slug:** `/blog/dev-desktop-setup-2026`
**Meta description:** 8 thứ dev dùng AI coding agent nên có trên desktop 2026: terminal đẹp, font dev, pet companion, dashboard, hotkey...

### Outline (rút gọn, listicle vibe)

#### H2: 8 thứ phải có

1. **Terminal đẹp**: WezTerm / Warp / Wave Terminal — pros/cons mỗi cái
2. **Font dev**: JetBrains Mono / FiraCode / Cascadia
3. **AI coding CLI**: chọn 1-2 cái phù hợp (link bài 2)
4. **Pet desktop có hồn**: Bumbee on Desk (link bài 1)
5. **Hotkey launcher**: Raycast / Alfred / Fluent Search
6. **Clipboard manager**: Maccy / Ditto / clipy
7. **Window manager**: Rectangle / yabai / FancyZones
8. **Lofi music player**: lofi.cafe / spotify-tui

Mỗi mục 200-300 từ, link affiliate (nếu có), screenshot.

#### H2: Bonus — vibe layer
- Mechanical keyboard
- Trà / cà phê
- Cây xanh nhỏ
- Pixel art wallpaper

#### H2: Kết
- 2026 là năm dev cá nhân hóa workspace
- AI coding làm việc bớt nặng nề → còn thời gian decor

---

## Bài 5 — Build pet desktop tích hợp AI agent (tech deep dive)

**Slug:** `/blog/build-electron-desktop-pet-ai-agent`
**Meta description:** Kiến trúc Bumbee on Desk: Electron 2 cửa sổ, hook architecture, state machine, permission HTTP blocking — chia sẻ kỹ thuật.

### Outline (technical, target dev audience để stars + community)

#### H2: Tại sao build Bumbee
- Pain visibility AI agent
- Đã có Wallpaper Engine pet nhưng không hook agent
- Quyết định build với Electron + zero-dep hook script

#### H2: Architecture overview
Diagram ASCII / Mermaid:
```
Claude Code event
  → clawd-hook.js (zero-dep Node)
  → HTTP POST 127.0.0.1:23333/state
  → src/server.js → src/state.js (state machine)
  → IPC state-change
  → src/renderer.js (SVG render)
```

#### H2: 2-window architecture
- Render window: transparent, click-through, eye-tracking SVG
- Hit window: transparent shape, focusable, drag/click
- Lý do tách: Windows drag-drop bug từ layered focus
- Code snippet `setShape` + `setIgnoreMouseEvents`

#### H2: Hook system zero-dependency
- Lý do không dùng npm package (npm install trên máy user là khó)
- 100% Node built-in: `http`, `fs`, `path`
- Code snippet hook script

#### H2: State machine multi-session
- Mỗi session lưu Map theo session_id
- resolveDisplayState() → priority queue
- Min display time chống flicker
- Auto-return cho one-shot state (error, attention)

#### H2: Permission HTTP blocking
- Khác command hook (fire-and-forget): HTTP hook block tới khi user trả lời
- 600s timeout
- BrowserWindow bubble + IPC decide

#### H2: Multi-agent abstraction
- agents/ folder, mỗi agent 1 config module
- Event mapping centralized
- Extensible: thêm agent mới = thêm 1 file

#### H2: Lessons learned
- Pixel art > realistic vì asset cheap + cute
- Open source first, monetize qua experience layer
- Permission UX là wide space, đừng over-engineer
- Cộng đồng dev VN có động lực contribute nếu repo Việt-friendly

#### H2: Repo & contributions welcome
- GitHub link
- Discord
- Roadmap

**CTA:** Star repo, thử Bumbee, hoặc fork build pet riêng.

---

## SEO checklist mỗi bài

- [ ] Title 50-60 ký tự
- [ ] Meta description 140-160 ký tự
- [ ] Primary keyword trong H1, H2 đầu, đoạn đầu, đoạn cuối
- [ ] LSI keyword tự nhiên xuyên bài
- [ ] Internal link 3-5 bài blog khác / page sản phẩm
- [ ] External link 2-3 nguồn uy tín
- [ ] Hình minh họa alt text descriptive
- [ ] Schema markup Article + BreadcrumbList
- [ ] OG image custom mỗi bài
- [ ] CTA cuối bài link Bumbee

## Cadence publish
- 1 bài/2 tuần (chất hơn lượng)
- Promote mỗi bài: X thread + LinkedIn + FB group VN + Reddit relevant subreddit
