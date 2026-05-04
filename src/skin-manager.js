// src/skin-manager.js — Renderer-side skin dispatcher.
//
// Decides which renderer (SVG / Live2D / VRM) is active for the current
// character and forwards state-change events to it. The SVG path remains the
// default for built-in characters (Clawd, Bunny). Live2D and VRM are loaded
// when the user picks a custom character from the menu.

(function () {
  "use strict";

  // skin descriptor shape:
  //   { id: "clawd", type: "svg" }
  //   { id: "user-hiyori", type: "live2d", modelPath: "/abs/path/model3.json" }
  //   { id: "user-yuki", type: "vrm", modelPath: "/abs/path/yuki.vrm" }
  let activeSkin = { id: "clawd", type: "svg" };

  function pathToFileUrl(p) {
    // Renderer running with file:// — convert absolute path to file URL.
    let s = String(p).replace(/\\/g, "/");
    if (!s.startsWith("/")) s = "/" + s;
    return "file://" + s;
  }

  function showSvgLayer() {
    const c = document.getElementById("pet-container");
    if (c) c.style.display = "";
  }
  function hideSvgLayer() {
    const c = document.getElementById("pet-container");
    if (c) c.style.display = "none";
  }

  async function setSkin(skin) {
    if (!skin || !skin.type) skin = { id: "clawd", type: "svg" };
    activeSkin = skin;

    if (skin.type === "svg") {
      // Tear down 3D/Live2D layers if active
      if (window.ClawdLive2DRenderer) window.ClawdLive2DRenderer.unload();
      if (window.ClawdVRMRenderer) window.ClawdVRMRenderer.unload();
      showSvgLayer();
      return true;
    }

    if (skin.type === "live2d") {
      if (!window.ClawdLive2DRenderer || !window.ClawdLive2DRenderer.isAvailable()) {
        console.warn("[skin] Live2D requested but runtime not loaded — falling back to SVG");
        activeSkin = { id: "clawd", type: "svg" };
        return false;
      }
      if (window.ClawdVRMRenderer) window.ClawdVRMRenderer.unload();
      hideSvgLayer();
      const ok = await window.ClawdLive2DRenderer.load(pathToFileUrl(skin.modelPath));
      if (!ok) {
        showSvgLayer();
        activeSkin = { id: "clawd", type: "svg" };
      }
      return ok;
    }

    if (skin.type === "vrm") {
      if (!window.ClawdVRMRenderer || !window.ClawdVRMRenderer.isAvailable()) {
        console.warn("[skin] VRM requested but runtime not loaded — falling back to SVG");
        activeSkin = { id: "clawd", type: "svg" };
        return false;
      }
      if (window.ClawdLive2DRenderer) window.ClawdLive2DRenderer.unload();
      hideSvgLayer();
      const ok = await window.ClawdVRMRenderer.load(pathToFileUrl(skin.modelPath));
      if (!ok) {
        showSvgLayer();
        activeSkin = { id: "clawd", type: "svg" };
      }
      return ok;
    }

    return false;
  }

  function getActiveSkin() { return activeSkin; }
  function isSvgActive() { return activeSkin.type === "svg"; }

  function dispatchState(state /* , svg */) {
    if (activeSkin.type === "live2d" && window.ClawdLive2DRenderer) {
      window.ClawdLive2DRenderer.startMotion(state);
    } else if (activeSkin.type === "vrm" && window.ClawdVRMRenderer) {
      window.ClawdVRMRenderer.startMotion(state);
    }
    // SVG path is handled by renderer.js directly (existing logic).
  }

  function dispatchReaction(svg, durationMs) {
    if (activeSkin.type === "live2d" && window.ClawdLive2DRenderer) {
      window.ClawdLive2DRenderer.startMotion("attention");
      return true;
    }
    if (activeSkin.type === "vrm" && window.ClawdVRMRenderer?.playReaction) {
      window.ClawdVRMRenderer.playReaction(svg, durationMs);
      return true;
    }
    return false;
  }

  window.ClawdSkinManager = { setSkin, getActiveSkin, isSvgActive, dispatchState, dispatchReaction };
})();
