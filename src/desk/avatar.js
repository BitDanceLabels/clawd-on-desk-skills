// src/desk/avatar.js — chọn nhân vật cho desk: Live2D VTuber (mặc định "mao", 25/11/2026)
// hoặc chân dung 2.5D cũ (mai/linh/an/vy, 0.14.1). Cùng 1 API để desk.js không phải biết loại nào:
//   setState, setAudioLevel, setGaze, setActive, setPalette, playIntro, stats, destroy,
//   character(), setCharacter(id), tap(x, y), hitTest(x, y), setFps(n), setPaused(reason, on)
// Live2D cần WebGL; máy không có WebGL (remote desktop, driver bị chặn) tự lùi về chân dung "mai".
import { createPortraitAvatar } from "./portrait-avatar.js";
import { createDeskLive2D } from "./live2d/live2d-desk.ts";

export const LIVE2D_IDS = Object.freeze(["mao", "hiyori"]);
export const isLive2D = (id) => LIVE2D_IDS.includes(id);

export function createAvatar({ portraitCanvas, live2dCanvas, character = "mao", fps = 30, onFallback = () => {} }) {
  let current = null;
  let currentId = null;
  let fpsPref = fps;
  const pauses = new Map(); // lý do dừng vẽ giữ qua lần đổi nhân vật

  function show(canvas, on) { canvas.hidden = !on; canvas.style.display = on ? "" : "none"; }

  function useLive2D(id) {
    show(portraitCanvas, false);
    show(live2dCanvas, true);
    const a = createDeskLive2D(live2dCanvas, {
      model: id,
      fps: fpsPref,
      onError: (err) => {
        console.warn("JAVIS: Live2D lỗi, dùng chân dung:", err && err.message);
        if (current === a) { a.destroy(); usePortrait("mai"); onFallback(err); }
      },
    });
    for (const [reason, on] of pauses) if (on) a.setPaused(reason, true);
    return a;
  }

  let portrait = null;
  function usePortrait(id) {
    show(live2dCanvas, false);
    show(portraitCanvas, true);
    if (!portrait) portrait = createPortraitAvatar(portraitCanvas, { root: "nhan-vat", character: id });
    else portrait.setCharacter(id);
    current = portrait;
    currentId = id;
    return portrait;
  }

  function setCharacter(id) {
    if (id === currentId) return;
    if (current && current !== portrait) current.destroy();
    // Rời chân dung sang Live2D: tắt hẳn vòng vẽ 2D (không để 2 nhân vật cùng chạy ngầm).
    if (current && current === portrait && isLive2D(id)) { portrait.destroy(); portrait = null; }
    if (isLive2D(id)) {
      try {
        current = useLive2D(id);
        currentId = id;
        return;
      } catch (err) {
        console.warn("JAVIS: không có WebGL, dùng chân dung:", err && err.message);
        onFallback(err);
        id = "mai";
      }
    }
    usePortrait(id);
  }

  setCharacter(character);

  const call = (name, ...args) => (current && typeof current[name] === "function" ? current[name](...args) : undefined);
  return {
    character: () => currentId,
    kind: () => (isLive2D(currentId) ? "live2d" : "portrait"),
    setCharacter,
    setState: (s) => call("setState", s),
    setAudioLevel: (v) => call("setAudioLevel", v),
    setGaze: (x, y) => call("setGaze", x, y),
    setActive: (v) => call("setActive", v),
    setPalette: (p) => call("setPalette", p),
    playIntro: () => call("playIntro"),
    tap: (x, y) => call("tap", x, y) || null,
    // Live2D: chỉ phần có người mới bắt chuột (đầu/thân), vùng trống trong khung để chuột xuyên qua.
    hitTest: (x, y) => (current && typeof current.hitTest === "function" ? current.hitTest(x, y) : true),
    setFps: (n) => { fpsPref = n; call("setFps", n); },
    setPaused: (reason, on) => { pauses.set(reason, !!on); call("setPaused", reason, !!on); },
    stats: () => call("stats") || {},
    resetStats: () => call("resetStats"),
    destroy: () => { call("destroy"); if (portrait && portrait !== current) portrait.destroy(); },
  };
}
