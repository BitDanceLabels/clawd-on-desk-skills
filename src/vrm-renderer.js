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
  let animationTime = 0;
  let currentState = "idle";
  let reactionState = null;
  let reactionUntil = 0;
  let boneBases = new Map();
  const expressionValues = new Map();

  const BONE_NAMES = [
    "hips", "spine", "chest", "upperChest", "neck", "head",
    "leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm",
  ];

  const EXPRESSIONS = [
    "happy", "angry", "sad", "relaxed", "surprised",
    "blink", "blinkLeft", "blinkRight", "aa", "ih", "ou",
  ];

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
    animationTime += dt;
    if (currentVrm) {
      applyProceduralMotion(dt);
      applyExpressionMotion(dt);
    }
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
          vrm.scene.position.set(0, -0.08, 0);
          currentVrm = vrm;
          currentSkinPath = modelPath;
          animationTime = 0;
          currentState = "idle";
          reactionState = null;
          reactionUntil = 0;
          captureBoneBases();
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

  function getBone(name) {
    try {
      return currentVrm?.humanoid?.getNormalizedBoneNode(name) || null;
    } catch {
      return null;
    }
  }

  function captureBoneBases() {
    boneBases = new Map();
    for (const name of BONE_NAMES) {
      const bone = getBone(name);
      if (bone) boneBases.set(name, bone.rotation.clone());
    }
  }

  function setBoneRotation(name, x = 0, y = 0, z = 0) {
    const bone = getBone(name);
    const base = boneBases.get(name);
    if (!bone || !base) return;
    bone.rotation.set(base.x + x, base.y + y, base.z + z);
  }

  function activeState() {
    if (reactionState && performance.now() < reactionUntil) return reactionState;
    reactionState = null;
    return currentState;
  }

  function stateProfile(state) {
    if (state === "working") return { sway: 0.035, bob: 0.030, head: 0.055, nod: 0.075, speed: 2.0 };
    if (state === "thinking") return { sway: 0.020, bob: 0.012, head: 0.095, nod: 0.035, speed: 0.75, tilt: -0.18 };
    if (state === "sleeping" || state === "yawning") return { sway: 0.012, bob: 0.006, head: 0.020, nod: 0.010, speed: 0.45, tilt: 0.18, slump: 0.18 };
    if (state === "error") return { sway: 0.070, bob: 0.012, head: 0.120, nod: 0.045, speed: 3.8, shake: 0.10 };
    if (state === "attention" || state === "mini-happy") return { sway: 0.060, bob: 0.060, head: 0.080, nod: 0.100, speed: 2.8, happy: true };
    if (state === "notification") return { sway: 0.045, bob: 0.040, head: 0.070, nod: 0.080, speed: 2.5, wave: true };
    if (state === "juggling" || state === "carrying" || state === "sweeping") return { sway: 0.060, bob: 0.038, head: 0.075, nod: 0.085, speed: 2.4, wave: true };
    return { sway: 0.025, bob: 0.018, head: 0.040, nod: 0.030, speed: 1.0 };
  }

  function applyProceduralMotion() {
    const state = activeState();
    const p = stateProfile(state);
    const t = animationTime * p.speed;
    const breath = Math.sin(t * 2.1);
    const sway = Math.sin(t * 1.25);
    const nod = Math.sin(t * 1.75);
    const shake = p.shake ? Math.sin(t * 9.0) * p.shake : 0;
    const wave = p.wave ? Math.sin(t * 5.4) : 0;

    if (currentVrm?.scene) {
      currentVrm.scene.position.y = -0.08 + Math.max(0, breath) * p.bob;
      currentVrm.scene.rotation.z = sway * p.sway * 0.28 + shake * 0.10;
    }

    setBoneRotation("hips", 0, sway * p.sway * 0.25, -sway * p.sway * 0.20);
    setBoneRotation("spine", p.slump || 0, -sway * p.sway * 0.20, sway * p.sway * 0.22);
    setBoneRotation("chest", -Math.max(0, breath) * 0.035 + (p.slump || 0) * 0.4, sway * p.sway * 0.30, -sway * p.sway * 0.30);
    setBoneRotation("neck", p.tilt || 0, sway * p.head * 0.35, -sway * p.head * 0.20);
    setBoneRotation("head", (p.tilt || 0) + nod * p.nod + shake * 0.25, sway * p.head + shake, -sway * p.head * 0.65);

    const armLift = state === "working" ? 0.28 : state === "thinking" ? 0.12 : p.wave ? 0.22 : 0;
    setBoneRotation("leftUpperArm", 0.18 + armLift + wave * 0.10, 0.04, 0.10 + wave * 0.18);
    setBoneRotation("rightUpperArm", 0.18 + armLift - wave * 0.10, -0.04, -0.10 + wave * 0.18);
    setBoneRotation("leftLowerArm", 0.10 + Math.max(0, wave) * 0.20, 0, 0);
    setBoneRotation("rightLowerArm", 0.10 + Math.max(0, -wave) * 0.20, 0, 0);
  }

  function setExpressionValue(name, value) {
    const manager = currentVrm?.expressionManager;
    if (!manager || typeof manager.setValue !== "function") return;
    try { manager.setValue(name, value); } catch {}
  }

  function expressionTargets(state) {
    const blinkPulse = (() => {
      if (state === "sleeping" || state === "yawning") return 0.75;
      const phase = animationTime % 4.2;
      return phase < 0.12 ? Math.sin((phase / 0.12) * Math.PI) : 0;
    })();
    const speechPulse = state === "working" ? Math.max(0, Math.sin(animationTime * 8.0)) * 0.28 : 0;
    return {
      happy: state === "attention" || state === "mini-happy" ? 0.85 : state === "notification" ? 0.45 : 0,
      angry: state === "error" ? 0.65 : 0,
      sad: state === "sleeping" ? 0.18 : 0,
      relaxed: state === "idle" || state === "thinking" ? 0.35 : 0,
      surprised: state === "notification" ? 0.35 : 0,
      blink: blinkPulse,
      blinkLeft: blinkPulse,
      blinkRight: blinkPulse,
      aa: speechPulse,
      ih: state === "thinking" ? 0.10 : 0,
      ou: state === "sleeping" || state === "yawning" ? 0.16 : 0,
    };
  }

  function applyExpressionMotion(dt) {
    const targets = expressionTargets(activeState());
    const alpha = Math.min(1, dt * 8);
    for (const name of EXPRESSIONS) {
      const prev = expressionValues.get(name) || 0;
      const next = prev + ((targets[name] || 0) - prev) * alpha;
      expressionValues.set(name, next);
      setExpressionValue(name, next);
    }
  }

  function startMotion(state) {
    currentState = typeof state === "string" ? state : "idle";
  }

  function playReaction(svgFile, durationMs = 2800) {
    const name = String(svgFile || "");
    if (name.includes("error") || name.includes("annoyed")) reactionState = "error";
    else if (name.includes("happy") || name.includes("wake")) reactionState = "attention";
    else reactionState = "notification";
    reactionUntil = performance.now() + Math.max(700, durationMs);
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
    reactionState = null;
    reactionUntil = 0;
    boneBases = new Map();
    expressionValues.clear();
    scene = null;
    camera = null;
    clock = null;
  }

  window.ClawdVRMRenderer = { isAvailable, load, startMotion, playReaction, unload };
})();
