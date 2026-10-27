// src/renderer-bundles/vrm-entry.js
// Renderer-side entry that exposes three + VRM loader via global ClawdVRM.
// Bundled into src/bundles/vrm.bundle.js by scripts/build-renderer-bundles.js.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

export { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils };
export default { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils };
