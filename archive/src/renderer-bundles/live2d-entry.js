// src/renderer-bundles/live2d-entry.js
// Renderer-side entry that exposes Pixi + Live2D via the global ClawdLive2D.
// Bundled into src/bundles/live2d.bundle.js by scripts/build-renderer-bundles.js.

import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display-lipsyncpatch/cubism4";

// Live2D plugin needs Pixi's Ticker hooked so model motions advance.
Live2DModel.registerTicker(PIXI.Ticker);

export { PIXI, Live2DModel };
export default { PIXI, Live2DModel };
