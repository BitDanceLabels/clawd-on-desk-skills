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

## Live2D character (0.15.0, 25/11/2026)
- `assets/live2d/mao/` — **Mao (Mao Niziiro)**, Live2D Inc. sample model, an Official "Live2D Original
  Character" from https://github.com/Live2D/CubismWebSamples (Samples/Resources/Mao, commit b1de66b,
  2026-04-02), unmodified. Used under the **Live2D Free Material License** (v1.6) and the Live2D
  sample model terms (v1.7): General Users / Small-Scale Enterprises (latest annual sales < 10,000,000
  JPY) may use it for commercial or non-commercial purposes; Mao has no extra per-character conditions.
  The raw data must not be redistributed on its own; the model's sound data is not used.
  - https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html
  - https://www.live2d.com/eula/live2d-sample-model-terms_en.html
  - Required notice (show it in the app/store description):
    "This content uses sample data owned and copyrighted by Live2D Inc. The sample data are utilized in
    accordance with terms and conditions set by Live2D Inc. This content itself is created at the
    author's sole discretion."
    Short form (no description field): "This content uses sample data owned and copyrighted by Live2D Inc."
- `assets/live2d/core/live2dcubismcore.min.js` — **Live2D Cubism Core** 5.1.0 (moc3 ≤ v5), the
  "Redistributable Code" of the Live2D Proprietary Software License
  (https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html), from
  https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js.
- `src/desk/live2d/framework/` — **Cubism Web Framework 5-r.4** (https://github.com/Live2D/CubismWebFramework),
  **Live2D Open Software License** (see `src/desk/live2d/framework/LICENSE.md`); bundled into `desk.bundle.js`.
- Cubism SDK Release License: individuals and Small-Scale Enterprises are exempt
  (https://www.live2d.com/en/sdk/license/). If BitDance's annual sales reach 10,000,000 JPY (≈ 1.7 tỷ đồng)
  the company must sign the Release License ≥ 1 month before a release, or switch to an own character.
- JAVIS does not let users load other models (not an "Expandable Application").

## Icons
- `build/javis-icon-source.png` — JAVIS icon (BitDance Labels). Derived icons by `scripts/make-icons.js`.
