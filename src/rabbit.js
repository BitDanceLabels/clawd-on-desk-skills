// src/rabbit.js — Periodic cute rabbit popup with native notification + sound.
// Public API (returned from initRabbit): start, stop, scheduleNext, showNow,
//   setEnabled, setIntervalMin, getEnabled, getIntervalMin, cleanup.

"use strict";

const path = require("path");
const { BrowserWindow, Notification, screen, ipcMain } = require("electron");

const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";

const POPUP_W = 280;
const POPUP_H = 320;
const AUTO_HIDE_MS = 8000;
const MIN_INTERVAL_MIN = 1;     // hard floor (sanity)
const MAX_INTERVAL_MIN = 24 * 60;

const ALLOWED_INTERVALS = [30, 60, 90, 120];
const DEFAULT_INTERVAL_MIN = 60;

const MESSAGES = {
  en: ["Hi! 🥕", "Hop hop!", "Take a break!", "Snack time?", "Stretch a bit!"],
  zh: ["嗨！🥕", "蹦蹦跳跳~", "休息一下吧！", "来点零食？", "伸个懒腰~"],
};

function pickMessage(lang) {
  const list = MESSAGES[lang] || MESSAGES.en;
  return list[Math.floor(Math.random() * list.length)];
}

function clampInterval(min) {
  const n = Number(min);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_MIN;
  return Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, Math.round(n)));
}

module.exports = function initRabbit(ctx) {
  let enabled = !!ctx.initialEnabled;
  let intervalMin = clampInterval(ctx.initialIntervalMin || DEFAULT_INTERVAL_MIN);
  let timer = null;
  let hideTimer = null;
  let popup = null;
  let ipcRegistered = false;

  function getNearestWorkArea() {
    try {
      const cursor = screen.getCursorScreenPoint();
      return screen.getDisplayNearestPoint(cursor).workArea;
    } catch {
      return { x: 0, y: 0, width: 1280, height: 720 };
    }
  }

  function destroyPopup() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (popup && !popup.isDestroyed()) {
      try { popup.destroy(); } catch {}
    }
    popup = null;
  }

  function createPopup() {
    destroyPopup();
    const wa = getNearestWorkArea();
    // Bottom-right of nearest screen, with 24px margin
    const x = wa.x + wa.width - POPUP_W - 24;
    const y = wa.y + wa.height - POPUP_H - 24;

    popup = new BrowserWindow({
      x, y,
      width: POPUP_W,
      height: POPUP_H,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload-rabbit.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    if (isLinux) popup.setSkipTaskbar(true);
    popup.setAlwaysOnTop(true, isWin ? "pop-up-menu" : "screen-saver");
    popup.setIgnoreMouseEvents(false);

    popup.on("closed", () => { popup = null; });
    return popup;
  }

  function showNotification(message) {
    if (!Notification.isSupported()) return;
    try {
      const n = new Notification({
        title: "Clawd Rabbit 🐰",
        body: message,
        silent: false,
      });
      n.show();
      // Auto-dismiss after a while on platforms that keep it sticky
      setTimeout(() => { try { n.close(); } catch {} }, AUTO_HIDE_MS);
    } catch (err) {
      console.warn("Clawd: rabbit notification failed:", err.message);
    }
  }

  function showNow() {
    if (ctx.isDoNotDisturb && ctx.isDoNotDisturb()) {
      // Skip during DND; reschedule next slot
      scheduleNext();
      return;
    }
    const lang = (ctx.getLang && ctx.getLang()) || "en";
    const message = pickMessage(lang);

    const win = createPopup();
    win.loadFile(path.join(__dirname, "rabbit.html"));
    win.webContents.once("did-finish-load", () => {
      if (!win || win.isDestroyed()) return;
      win.showInactive();
      try { win.webContents.send("rabbit-show", { message }); } catch {}
    });

    showNotification(message);

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => destroyPopup(), AUTO_HIDE_MS);

    scheduleNext();
  }

  function scheduleNext() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!enabled) return;
    const ms = intervalMin * 60 * 1000;
    timer = setTimeout(showNow, ms);
  }

  function start() {
    if (!ipcRegistered) {
      ipcMain.on("rabbit-close", () => destroyPopup());
      ipcRegistered = true;
    }
    scheduleNext();
  }

  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
    destroyPopup();
  }

  function setEnabled(val) {
    enabled = !!val;
    if (enabled) scheduleNext(); else stop();
    if (ctx.savePrefs) ctx.savePrefs();
  }

  function setIntervalMin(min) {
    intervalMin = clampInterval(min);
    if (enabled) scheduleNext();
    if (ctx.savePrefs) ctx.savePrefs();
  }

  // Apply persisted prefs without triggering savePrefs (avoid recursion at boot).
  function configure(opts) {
    if (!opts) return;
    if (typeof opts.enabled === "boolean") enabled = opts.enabled;
    if (opts.intervalMin != null) intervalMin = clampInterval(opts.intervalMin);
  }

  function cleanup() {
    stop();
    if (ipcRegistered) {
      try { ipcMain.removeAllListeners("rabbit-close"); } catch {}
      ipcRegistered = false;
    }
  }

  return {
    start,
    stop,
    scheduleNext,
    showNow,
    setEnabled,
    setIntervalMin,
    configure,
    getEnabled: () => enabled,
    getIntervalMin: () => intervalMin,
    cleanup,
    ALLOWED_INTERVALS,
    DEFAULT_INTERVAL_MIN,
  };
};
