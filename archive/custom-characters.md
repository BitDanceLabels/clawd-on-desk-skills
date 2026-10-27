# Custom Characters (Live2D + VRM)

Clawd v0.8+ supports loading your own Live2D and VRM character models in
addition to the built-in SVG characters (Clawd, Bunny).

## File layout

```
assets/
├── live2d/
│   ├── runtime/
│   │   └── live2dcubismcore.min.js   ← required, see "Setup" below
│   ├── <character-1>/
│   │   ├── <character-1>.model3.json
│   │   ├── <character-1>.moc3
│   │   ├── textures/
│   │   ├── motions/
│   │   └── expressions/
│   └── <character-2>/...
└── vrm/
    ├── <character-3>.vrm
    └── <character-4>/<anything>.vrm
```

The app auto-detects:

- **Live2D**: any subfolder of `assets/live2d/` (except `runtime/`) that
  contains a file ending in `.model3.json`
- **VRM**: any `.vrm` file directly under `assets/vrm/` or one level deep

Detected characters appear under the **Character → Live2D Characters / VRM 3D
Characters** menu. Click to switch instantly.

## Setup (one-time, only if you use Live2D)

The Live2D Cubism Core runtime is **not** bundled in this repo because Live2D
Inc retains copyright. Run:

```bash
npm run setup:live2d
```

The script asks you to confirm the Cubism Core License before downloading
`live2dcubismcore.min.js` from the official URL into `assets/live2d/runtime/`.

For commercial distribution, register a free Cubism Release License at
https://www.live2d.com/en/sdk/license/ (required even for free indie use of
the runtime).

VRM does not need any extra runtime — `@pixiv/three-vrm` is bundled.

## Where to source models

| Source | Format | Commercial? | Notes |
|---|---|---|---|
| [Booth.pm](https://booth.pm) | both | filter by `商用利用可` | largest paid catalog |
| [VRoid Hub](https://hub.vroid.com) | VRM | per-model — read terms carefully | free + paid mix |
| [VRoid Studio](https://vroid.com/en/studio) | VRM | yours 100% if you create it | free desktop tool by Pixiv |
| Commission an artist (Behance, ArtStation, Fiverr) | both | yours per contract | $80–800 typical |

⚠️ Most "free" VRoid Hub models forbid commercial redistribution. If you
intend to sell the app or include the model with it, verify each model's
license one-by-one or commission your own.

## State → motion mapping (Live2D)

Live2D models declare motion groups in `<model>.model3.json` under
`FileReferences.Motions`. The default mapping picks the first available
group from these candidates per state:

| Clawd state | Tries motion group (in order) |
|---|---|
| `idle` | `Idle`, `idle` |
| `working` | `Idle`, `TapBody` |
| `thinking` | `Idle` |
| `sleeping` | `Idle` |
| `notification` | `TapBody`, `Tap`, `Idle` |
| `attention` | `TapBody`, `Tap`, `Idle` |
| `error` | `TapBody`, `Idle` |

If your model has different group names, the renderer falls back to `Idle`.
Custom mappings are planned for a future release.

## VRM (3D) MVP limitations

- Idle pose only — no state-driven animation yet
- No bone-based motion (BVH) wired up
- No facial expression (blendshape) hooks
- Camera locked to a 3/4 view of upper body

These will land in subsequent releases. The VRM scene is fully rendered with
lighting and material support; only the animation layer is stubbed.

## Troubleshooting

- **Live2D character doesn't appear** — check `Character → Add Live2D
  Folder…` opens the right path. Confirm `assets/live2d/runtime/live2dcubismcore.min.js`
  exists. Reopen the app after dropping files.
- **VRM character looks dark** — increase `DirectionalLight.intensity` in
  `src/vrm-renderer.js` (will be a setting in a future release).
- **Window too small for character** — change pet size to L from the
  Character menu.
