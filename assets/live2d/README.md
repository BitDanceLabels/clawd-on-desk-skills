# Live2D characters

Drop each character into its own subfolder, e.g.:

```
assets/live2d/
├── runtime/
│   └── live2dcubismcore.min.js   (downloaded by `npm run setup:live2d`)
├── hiyori/
│   ├── hiyori.model3.json
│   ├── hiyori.moc3
│   ├── textures/
│   └── motions/
└── another-character/
    └── another.model3.json
```

The app auto-detects subfolders containing a `*.model3.json` file and
lists them in the Character menu.

License: each character is your responsibility. Source from Booth.pm
with `商用利用可` (commercial OK) or commission your own. The Cubism
Core runtime requires a free Live2D Release License — see
https://www.live2d.com/en/sdk/license/