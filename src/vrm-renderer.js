// src/vrm-renderer.js — Renderer-process VRM 3D character renderer.
// Uses three + @pixiv/three-vrm bundled as window.ClawdVRM.

(function () {
  "use strict";

  let renderer = null;
  let scene = null;
  let camera = null;
  let canvas = null;
  let canvasContainer = null;
  let currentVrm = null;
  let currentSkinPath = null;
  let clock = null;
  let rafId = 0;

  function ensureCanvas() {
    if (canvas && canvas.isConnected) return canvas;
    canvasContainer = document.getElementById("vrm-container");
    if (!canvasContainer) {
      canvasContainer = document.createElement("div");
      canvasContainer.id = "vrm-container";
      Object.assign(canvasContainer.style, {
        position: "absolute", inset: "0",
        width: "100%", height: "100%",
        pointerEvents: "none",
      });
      document.body.appendChild(canvasContainer);
    }
    canvas = document.createElement("canvas");
    canvas.id = "vrm-canvas";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvasContainer.appendChild(canvas);
    return canvas;
  }

  function isAvailable() {
    return !!(window.ClawdVRM);
  }

  function setupScene() {
    const { THREE } = window.ClawdVRM;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(20, 1, 0.1, 20);
    camera.position.set(0, 1.3, 3.5);
    camera.lookAt(0, 1.0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1, 2, 1);
    scene.add(dir);
  }

  function tick() {
    if (!renderer || !scene || !camera) return;
    const dt = clock ? clock.getDelta() : 0;
    if (currentVrm && currentVrm.update) currentVrm.update(dt);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  function resize() {
    if (!renderer || !canvasContainer || !camera) return;
    const w = canvasContainer.clientWidth || 1;
    const h = canvasContainer.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  async function load(modelPath) {
    if (!isAvailable()) {
      console.warn("[vrm] bundle not loaded");
      return false;
    }
    if (currentSkinPath === modelPath && currentVrm) return true;

    const { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils } = window.ClawdVRM;
    ensureCanvas();
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      setupScene();
      clock = new THREE.Clock();
      window.addEventListener("resize", resize);
      resize();
      tick();
    }

    if (currentVrm) {
      scene.remove(currentVrm.scene);
      try { VRMUtils.deepDispose(currentVrm.scene); } catch {}
      currentVrm = null;
    }

    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      loader.load(
        modelPath,
        (gltf) => {
          const vrm = gltf.userData.vrm;
          try { VRMUtils.removeUnnecessaryVertices(gltf.scene); } catch {}
          try { VRMUtils.removeUnnecessaryJoints(gltf.scene); } catch {}
          scene.add(vrm.scene);
          // Face camera (most VRM models import facing -Z; rotate 180 to face +Z)
          vrm.scene.rotation.y = Math.PI;
          currentVrm = vrm;
          currentSkinPath = modelPath;
          resolve(true);
        },
        undefined,
        (err) => {
          console.error("[vrm] load failed", modelPath, err);
          resolve(false);
        }
      );
    });
  }

  // VRM doesn't have built-in motion groups like Live2D — for now we only
  // expose a hook so future state→animation work can plug in (e.g. play
  // BVH/Mixamo clips per state).
  function startMotion(_state) {
    // no-op MVP: idle pose only
  }

  function unload() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (currentVrm && scene) {
      scene.remove(currentVrm.scene);
      try { window.ClawdVRM.VRMUtils.deepDispose(currentVrm.scene); } catch {}
    }
    if (renderer) {
      try { renderer.dispose(); } catch {}
      renderer = null;
    }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (canvasContainer && canvasContainer.parentNode) canvasContainer.parentNode.removeChild(canvasContainer);
    canvas = null;
    canvasContainer = null;
    currentVrm = null;
    currentSkinPath = null;
    scene = null;
    camera = null;
    clock = null;
  }

  window.ClawdVRMRenderer = { isAvailable, load, startMotion, unload };
})();
