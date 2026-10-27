# CLAUDE.md — JAVIS On Desk

Electron app: one transparent always-on-top window with the JAVIS hologram girl, a talk/type bar
and a card board that visualises gateway data. Read `README.md` first (structure table).

- `npm test` (node --test) must stay green; `npm start` builds `src/bundles/desk.bundle.js` (esbuild) first.
- Renderer code lives in `src/desk/` and is bundled; it only talks to `javis-desk://app/…`
  (same-origin). Gateway calls go through `src/javis-desk-host.js`, which adds the bearer from
  `src/javis-auth.js` (silent tailnet sign-in; QR/device-key pairing is the fallback) — never
  expose a token to the page, never call the gateway from the renderer by absolute URL.
- "Cần anh duyệt" uses the shared `<javis-ask-box>` (vendored `assets/javis-ask-box/`, served as
  `/ui/javis-ask-box.js`). Updates: `src/javis-updater.js` via the gateway; release with
  `bash scripts/publish-desk-release.sh` (signs Mac with `~/.javis-signing`, never commit it).
- Automatic bubbles go through `notify()` (focus guard: wait while the owner is typing).
- New "hiển hoá" card: add the intent in `src/desk/intent.js` (+ cases in `test/intent.test.js`),
  a loader/renderer in `src/desk/cards.js` using an existing `/fleet/*` endpoint.
- Owner rules: retries ≤ 3 with back-off then stop; event-driven, no timed polling loops; no "AI"
  word in UI copy; data questions must not spend LLM calls.
- Hooks: `hooks/install.js` appends to `~/.claude/settings.json`; never register `WorktreeCreate`.
- `archive/` is reference only (old Clawd/Bumbee features). Do not import from it.
