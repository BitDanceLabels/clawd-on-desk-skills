// src/live2d-renderer.js — Renderer-process Live2D character renderer.
// Reads window.ClawdLive2D (loaded from src/bundles/live2d.bundle.js) and
// drives a Pixi canvas overlaid on the pet container.
//
// The state machine sends "state-change" IPC with a canonical Clawd state
// name ("idle", "working", ...). This module maps the state to one of the
// model's motion groups via skin-manager metadata.

(function () {
  "use strict";

  let app = null;
  let model = null;
  let canvas = null;
  let canvasContainer = null;
  let currentSkinPath = null;
  let currentMotionGroup = null;

  function ensureCanvas() {
    if (canvas && canvas.isConnected) return canvas;
    canvasContainer = document.getElementById("live2d-container");
    if (!canvasContainer) {
      canvasContainer = document.createElement("div");
      canvasContainer.id = "live2d-container";
      Object.assign(canvasContainer.style, {
        position: "absolute", inset: "0",
        width: "100%", height: "100%",
        pointerEvents: "none",
      });
      document.body.appendChild(canvasContainer);
    }
    canvas = document.createElement("canvas");
    canvas.id = "live2d-canvas";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvasContainer.appendChild(canvas);
    return canvas;
  }

  function destroyCanvas() {
    if (app) {
      try { app.destroy(true, { children: true, texture: true, baseTexture: true }); } catch {}
      app = null;
    }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null;
    if (canvasContainer && canvasContainer.parentNode && !canvasContainer.children.length) {
      canvasContainer.parentNode.removeChild(canvasContainer);
      canvasContainer = null;
    }
    model = null;
  }

  function isAvailable() {
    return !!(window.ClawdLive2D && window.Live2DCubismCore);
  }

  async function load(modelPath) {
    if (!isAvailable()) {
      console.warn("[live2d] Cubism Core or Live2D bundle not loaded");
      return false;
    }
    if (currentSkinPath === modelPath && model) return true;

    const { PIXI, Live2DModel } = window.ClawdLive2D;
    ensureCanvas();
    if (!app) {
      app = new PIXI.Application({
        view: canvas,
        backgroundAlpha: 0,
        autoStart: true,
        resizeTo: canvasContainer,
        antialias: true,
      });
    }

    try {
      if (model) {
        app.stage.removeChild(model);
        try { model.destroy(); } catch {}
        model = null;
      }
      model = await Live2DModel.from(modelPath, { autoInteract: false });
      app.stage.addChild(model);
      fitModelToStage();
      currentSkinPath = modelPath;
      return true;
    } catch (err) {
      console.error("[live2d] failed to load", modelPath, err);
      currentSkinPath = null;
      return false;
    }
  }

  function fitModelToStage() {
    if (!model || !app) return;
    const { width, height } = app.renderer;
    const w = model.internalModel.width;
    const h = model.internalModel.height;
    const scale = Math.min(width / w, height / h) * 0.95;
    model.scale.set(scale);
    model.x = width / 2 - (w * scale) / 2;
    model.y = height - h * scale;
  }

  // Map canonical Clawd state → motion group name on the model. Each model
  // typically declares motion groups in the .model3.json under FileReferences
  // → Motions (e.g. "Idle", "TapBody"). The skin manifest can override these
  // via passing a stateMotionMap when loading.
  const DEFAULT_STATE_MOTIONS = {
    idle: ["Idle", "idle"],
    working: ["Idle", "TapBody"],
    thinking: ["Idle"],
    sleeping: ["Idle"],
    notification: ["TapBody", "Tap", "Idle"],
    attention: ["TapBody", "Tap", "Idle"],
    error: ["TapBody", "Idle"],
  };

  function startMotion(state, options = {}) {
    if (!model) return;
    const map = options.stateMotionMap || DEFAULT_STATE_MOTIONS;
    const candidates = map[state] || map.idle || ["Idle"];
    for (const group of candidates) {
      try {
        const ok = model.motion(group, undefined, /* MotionPriority.NORMAL */ 2);
        if (ok) { currentMotionGroup = group; return; }
      } catch {}
    }
  }

  function setExpression(name) {
    if (!model || !name) return;
    try { model.expression(name); } catch {}
  }

  function unload() {
    destroyCanvas();
    currentSkinPath = null;
    currentMotionGroup = null;
  }

  window.addEventListener("resize", fitModelToStage);

  window.ClawdLive2DRenderer = {
    isAvailable, load, startMotion, setExpression, unload,
    fit: fitModelToStage,
  };
})();
