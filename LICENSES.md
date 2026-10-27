# JAVIS (desktop) — licences & credits

## Application code
- Based on Clawd on Desk — MIT, © rullerzhou-afk (see `LICENSE`). JAVIS changes © BitDance Labels.
- Hologram engine (`src/desk/hologram-desk.js`) ported from BitDance Labels `bumbee-be-den`
  (`src/hologram.js`, main 84f3291) — BitDance Labels code.
- `three` (MIT) — bundled into `desk.bundle.js` at build time.
- `qrcode` (MIT) — pairing QR code. `electron-updater` (MIT) — auto update.

## Character
- `assets/hologram/character.jpg` — JAVIS hologram character chosen by the owner (from
  `bumbee-be-den/public/hologram/character.jpg`). BitDance Labels asset; the app only samples it
  into a particle cloud.
- v0.13.0 no longer ships the Live2D Inc. sample models (Hiyori/Haru) or the Cubism runtime;
  their old credits and terms are kept in `archive/LICENSES.legacy.md` for history.

## Icons
- `build/javis-icon-source.png` — JAVIS icon (BitDance Labels). Derived icons by `scripts/make-icons.js`.
