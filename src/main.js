// src/main.js — JAVIS On Desk: one floating hologram assistant.
//
// One transparent always-on-top window (javis-desk://app/index.html):
//   • compact  — just the hologram girl, draggable, click to open
//   • open     — hologram + talk/type bar + the card board ("hiển hoá")
// Plus a tray menu, the local hook server (Claude Code / Codex / Gemini / Cursor
// session state + permission cards) and the auto-updater. Everything the old pet
// app did besides this lives in archive/.
"use strict";

const { app, BrowserWindow, Menu, Tray, ipcMain, globalShortcut, screen, session, shell, nativeImage, protocol, net, safeStorage } = require("electron");
require("./user-data-path").pinUserDataPath(app);
const path = require("path");
const fs = require("fs");
const deskHost = require("./javis-desk-host");
const { createSessionTracker } = require("./sessions");
const { createHookServer } = require("./hook-server");

deskHost.registerJavisScheme(protocol);

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";

// Window geometry. The figure box is the bottom-right (side "right") or bottom-left
// (side "left") corner of the window; when opening, the window grows away from it
// so the girl stays exactly where the owner left her.
const FIGURE = { width: 230, height: 300 };
const OPEN = { width: 800, height: 620 };
// Compact figure + room above it for a notice bubble.
const PEEK = { width: 320, height: 470 };
const SIZES = { open: OPEN, peek: PEEK };
const TOGGLE_SHORTCUT = "CommandOrControl+Shift+J";

// ── Prefs ──
const PREFS_FILE = path.join(app.getPath("userData"), "javis-desk.json");
const DEFAULT_PREFS = { figureX: null, figureY: null, doNotDisturb: false, voiceReply: false, autoStartWithClaude: false, palette: "cyan" };
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(PREFS_FILE, "utf8")) }; } catch { return { ...DEFAULT_PREFS }; }
}
let prefs = loadPrefs();
let savePrefsTimer = null;
function savePrefs() {
  clearTimeout(savePrefsTimer);
  savePrefsTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
      fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), "utf8");
    } catch (err) {
      console.warn("JAVIS: cannot save prefs:", err.message);
    }
  }, 300);
}

let win = null;
let tray = null;
let host = null;
let mode = "compact";
let side = "right";
let isQuitting = false;
let codexMonitor = null;

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

// ── Geometry ──
function workAreaAt(x, y) {
  return screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
}

function defaultFigurePos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - FIGURE.width - 24, y: wa.y + wa.height - FIGURE.height - 12 };
}

function figureRect() {
  if (!win || win.isDestroyed()) {
    const p = prefs.figureX == null ? defaultFigurePos() : { x: prefs.figureX, y: prefs.figureY };
    return { ...p, ...FIGURE };
  }
  const b = win.getBounds();
  const x = side === "right" ? b.x + b.width - FIGURE.width : b.x;
  return { x, y: b.y + b.height - FIGURE.height, ...FIGURE };
}

function clampFigure(pos) {
  const wa = workAreaAt(pos.x + FIGURE.width / 2, pos.y + FIGURE.height / 2);
  return {
    x: Math.min(Math.max(pos.x, wa.x - FIGURE.width / 3), wa.x + wa.width - (FIGURE.width * 2) / 3),
    y: Math.min(Math.max(pos.y, wa.y), wa.y + wa.height - FIGURE.height / 2),
  };
}

// Window bounds for a mode, keeping the figure at `fig` on screen.
function boundsFor(nextMode, fig) {
  const size = SIZES[nextMode];
  if (!size) return { bounds: { x: fig.x, y: fig.y, ...FIGURE }, side: "right" };
  const wa = workAreaAt(fig.x + FIGURE.width / 2, fig.y + FIGURE.height / 2);
  const extraW = size.width - FIGURE.width;
  const nextSide = fig.x - extraW >= wa.x - 8 ? "right" : "left";
  let x = nextSide === "right" ? fig.x - extraW : fig.x;
  let y = fig.y + FIGURE.height - size.height;
  // Not enough room above: the window stops at the top of the work area.
  if (y < wa.y) y = wa.y;
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - size.width));
  return { bounds: { x: Math.round(x), y: Math.round(y), ...size }, side: nextSide };
}

function applyMode(nextMode) {
  if (!win || win.isDestroyed()) return;
  const fig = figureRect();
  const next = boundsFor(nextMode, fig);
  mode = SIZES[nextMode] ? nextMode : "compact";
  side = next.side;
  win.setBounds(next.bounds);
  // Where the figure really ended up (the window may have been clamped).
  const b = next.bounds;
  const figX = side === "right" ? b.x + b.width - FIGURE.width : b.x;
  send("desk:layout", { mode, side, figure: FIGURE, figureOffset: { x: figX - b.x, y: b.height - FIGURE.height } });
  if (mode === "open") {
    win.setIgnoreMouseEvents(false);
    win.focus();
  }
}

function rememberFigure() {
  const fig = figureRect();
  prefs.figureX = Math.round(fig.x);
  prefs.figureY = Math.round(fig.y);
  savePrefs();
}

// ── Window ──
function createWindow() {
  const start = clampFigure(prefs.figureX == null ? defaultFigurePos() : { x: prefs.figureX, y: prefs.figureY });
  win = new BrowserWindow({
    x: Math.round(start.x),
    y: Math.round(start.y),
    width: FIGURE.width,
    height: FIGURE.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "JAVIS",
    webPreferences: {
      preload: path.join(__dirname, "preload-desk.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
      devTools: !app.isPackaged,
    },
  });
  win.setAlwaysOnTop(true, isMac ? "floating" : "screen-saver");
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    if (!url.startsWith(deskHost.ORIGIN + "/")) event.preventDefault();
  });
  win.loadURL(`${deskHost.ORIGIN}/index.html`);
  win.once("ready-to-show", () => {
    if (!win || win.isDestroyed()) return;
    win.showInactive();
    applyMode("compact");
    send("desk:prefs", publicPrefs());
    send("desk:sessions", tracker.summary());
  });
  // Esc / click elsewhere closes the board back to the figure.
  win.on("blur", () => {
    if (mode === "open" && !keepOpen) send("desk:command", { type: "blur" });
  });
  win.on("closed", () => { win = null; });
  // Keep the girl reachable when displays change.
  screen.on("display-removed", () => {
    if (!win || win.isDestroyed()) return;
    const fig = clampFigure(figureRect());
    win.setPosition(Math.round(fig.x), Math.round(fig.y));
    applyMode(mode);
  });
}

let keepOpen = false;

function toggleWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

function openBoard(command) {
  if (!win || win.isDestroyed()) createWindow();
  if (!win.isVisible()) win.showInactive();
  applyMode("open");
  if (command) send("desk:command", command);
}

function publicPrefs() {
  return { doNotDisturb: !!prefs.doNotDisturb, voiceReply: !!prefs.voiceReply, palette: prefs.palette, version: app.getVersion(), platform: process.platform };
}

// ── Tray + menu ──
function menuTemplate() {
  const loginItem = isLinux ? null : app.getLoginItemSettings();
  return [
    { label: win && win.isVisible() ? "Ẩn JAVIS" : "Hiện JAVIS", accelerator: TOGGLE_SHORTCUT, click: toggleWindow },
    { label: "Mở bảng JAVIS", click: () => openBoard({ type: "focus-input" }) },
    { type: "separator" },
    { label: "Việc cần anh", click: () => openBoard({ type: "ask", text: "việc cần anh" }) },
    { label: "Máy + tải", click: () => openBoard({ type: "ask", text: "các máy đang sao" }) },
    { label: "Kho tài sản", click: () => openBoard({ type: "ask", text: "kho tài sản" }) },
    { type: "separator" },
    { label: "Không làm phiền", type: "checkbox", checked: !!prefs.doNotDisturb, click: (item) => setPref({ doNotDisturb: item.checked }) },
    { label: "Đọc to câu trả lời", type: "checkbox", checked: !!prefs.voiceReply, click: (item) => setPref({ voiceReply: item.checked }) },
    ...(loginItem ? [{ label: "Mở cùng máy", type: "checkbox", checked: !!loginItem.openAtLogin, click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) }] : []),
    { label: "Ghép đôi JAVIS…", click: () => openBoard({ type: "pair" }) },
    { label: "Mở JAVIS web", click: () => shell.openExternal("https://javis.bumbee.asia") },
    { type: "separator" },
    updater ? updater.getUpdateMenuItem() : { label: "Kiểm tra cập nhật", enabled: false },
    { label: `JAVIS ${app.getVersion()}`, enabled: false },
    { label: "Thoát", accelerator: isMac ? "Command+Q" : undefined, click: () => { isQuitting = true; app.quit(); } },
  ];
}

function rebuildMenus() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

function createTray() {
  let icon;
  if (isMac) {
    icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "tray-iconTemplate.png"));
    icon.setTemplateImage(true);
  } else {
    icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "tray-icon.png")).resize({ width: 32, height: 32 });
  }
  tray = new Tray(icon);
  tray.setToolTip("JAVIS");
  tray.on("click", () => (isMac ? null : toggleWindow()));
  rebuildMenus();
}

function setPref(patch) {
  const allowed = {};
  for (const key of ["doNotDisturb", "voiceReply", "palette"]) {
    if (key in patch) allowed[key] = key === "palette" ? String(patch[key]).slice(0, 16) : !!patch[key];
  }
  prefs = { ...prefs, ...allowed };
  savePrefs();
  rebuildMenus();
  send("desk:prefs", publicPrefs());
  return publicPrefs();
}

// ── Updater (electron-updater + GitHub releases) ──
const UPDATE_TEXT = {
  checkForUpdates: "Kiểm tra cập nhật",
  checkingForUpdates: "Đang kiểm tra cập nhật…",
  download: "Tải về",
  restartLater: "Để sau",
  restartNow: "Khởi động lại",
  updateAvailable: "Có bản mới",
  updateAvailableMacMsg: "Đã có JAVIS v{version}. Mở trang tải về?",
  updateAvailableMsg: "Đã có JAVIS v{version}. Tải và cài ngay?",
  updateDownloading: "Đang tải bản cập nhật…",
  updateError: "Lỗi cập nhật",
  updateErrorMsg: "Chưa kiểm tra được bản mới. Thử lại sau.",
  updateNotAvailable: "Đang là bản mới nhất",
  updateNotAvailableMsg: "JAVIS v{version} là bản mới nhất.",
  updateReady: "Bản cập nhật đã sẵn sàng",
  updateReadyMsg: "Đã tải xong v{version}. Khởi động lại để cập nhật?",
};
let updater = null;
let updateLogFile = null;
function initUpdater() {
  updater = require("./updater")({
    get doNotDisturb() { return !!prefs.doNotDisturb; },
    get miniMode() { return false; },
    t: (key) => UPDATE_TEXT[key] || key,
    rebuildAllMenus: rebuildMenus,
    updateLog: (msg) => {
      if (!updateLogFile) return;
      try { require("./log-rotate").rotatedAppend(updateLogFile, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
    },
  });
}

// ── Local AI sessions (hooks) ──
const tracker = createSessionTracker();
const hookServer = createHookServer({
  autoStartWithClaude: prefs.autoStartWithClaude,
  isDoNotDisturb: () => !!prefs.doNotDisturb,
  isHeadless: (id) => !!(tracker.get(id) && tracker.get(id).headless),
  listSessions: () => tracker.list(),
  onState: (s) => {
    const r = tracker.update(s);
    if (!r.ok) return;
    send("desk:sessions", tracker.summary());
    if (r.transition && !prefs.doNotDisturb) {
      send("desk:session-notice", { phase: r.transition, agent: r.session.agent, where: require("./sessions").shortCwd(r.session.cwd), id: r.session.id });
    }
  },
  onPermission: (card) => {
    send("desk:permission", card);
    if (win && !win.isDestroyed() && !win.isVisible()) win.showInactive();
  },
  onPermissionGone: (id) => send("desk:permission-gone", id),
  onNotification: (n) => {
    if (!prefs.doNotDisturb) send("desk:session-notice", { phase: "notice", title: n.title, message: n.message, level: n.level });
  },
  log: (msg) => console.log(msg),
});

function startCodexMonitor() {
  try {
    const CodexLogMonitor = require("../agents/codex-log-monitor");
    codexMonitor = new CodexLogMonitor(require("../agents/codex"), (sid, state, event, extra = {}) => {
      const mapped = state === "codex-permission" ? "notification" : state;
      const r = tracker.update({ id: sid, state: mapped, event, agent: "codex", cwd: extra.cwd || "" });
      if (!r.ok) return;
      send("desk:sessions", tracker.summary());
      if (r.transition && !prefs.doNotDisturb) send("desk:session-notice", { phase: r.transition, agent: "codex", where: require("./sessions").shortCwd(extra.cwd || ""), id: sid });
    });
    codexMonitor.start();
  } catch (err) {
    console.warn("JAVIS: Codex monitor not started:", err.message);
  }
}

// ── IPC from the desk page ──
function fromDesk(event) {
  return win && !win.isDestroyed() && event.sender === win.webContents;
}

function registerIpc() {
  ipcMain.handle("desk:info", (e) => (fromDesk(e) ? { mode, side, figure: FIGURE, ...publicPrefs() } : null));
  ipcMain.handle("desk:set-mode", (e, next) => {
    if (!fromDesk(e)) return null;
    applyMode(next);
    return { mode, side };
  });
  ipcMain.on("desk:set-interactive", (e, interactive) => {
    if (!fromDesk(e) || isLinux) return; // Linux has no forwarded mouse events: stay clickable.
    // The board is bottom-anchored and sizes to its cards, so even when open the
    // empty area above it must let clicks through to the desktop.
    win.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.on("desk:move-by", (e, dx, dy) => {
    if (!fromDesk(e) || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.on("desk:move-end", (e) => {
    if (!fromDesk(e)) return;
    const fig = clampFigure(figureRect());
    if (mode === "compact") win.setPosition(Math.round(fig.x), Math.round(fig.y));
    rememberFigure();
  });
  ipcMain.on("desk:menu", (e) => {
    if (!fromDesk(e)) return;
    keepOpen = true;
    Menu.buildFromTemplate(menuTemplate()).popup({ window: win, callback: () => { keepOpen = false; } });
  });
  ipcMain.handle("desk:open-url", (e, url) => {
    if (!fromDesk(e) || typeof url !== "string") return { ok: false };
    let u;
    try { u = new URL(url); } catch { return { ok: false }; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false };
    shell.openExternal(u.href);
    return { ok: true };
  });
  ipcMain.handle("desk:set-prefs", (e, patch) => (fromDesk(e) && patch && typeof patch === "object" ? setPref(patch) : null));
  ipcMain.handle("desk:stt", async (e, payload) => {
    if (!fromDesk(e)) return null;
    try {
      return await require("./voice-stt").transcribe(payload);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle("desk:sessions", (e) => (fromDesk(e) ? tracker.summary() : null));
  ipcMain.handle("desk:decide", (e, id, behavior) => (fromDesk(e) ? hookServer.decide(String(id), String(behavior)) : false));
}

// Mic for voice input, only for our own page.
function configureMediaPermissions() {
  const ours = (wc) => !!(win && !win.isDestroyed() && wc === win.webContents);
  session.defaultSession.setPermissionCheckHandler((wc, permission) => ours(wc) && (permission === "media" || permission === "speaker-selection"));
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const audioOnly = !details || !details.mediaTypes || details.mediaTypes.every((t) => t === "audio");
    callback(ours(wc) && permission === "media" && audioOnly);
  });
}

// ── Lifecycle ──
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openBoard({ type: "focus-input" }));

  app.whenReady().then(() => {
    if (isMac && app.dock) app.dock.hide();
    updateLogFile = path.join(app.getPath("userData"), "update-debug.log");
    host = deskHost.initDeskHost({ app, ipcMain, session, net, safeStorage, shell, getWindow: () => win });
    configureMediaPermissions();
    registerIpc();
    initUpdater();
    createWindow();
    createTray();
    try { globalShortcut.register(TOGGLE_SHORTCUT, toggleWindow); } catch {}
    hookServer.start().catch((err) => console.warn("JAVIS: hook server not started:", err.message));
    startCodexMonitor();
    updater.setupAutoUpdater();
    setTimeout(() => updater.checkForUpdates(false), 8000);
    // Dev-only screenshot helper: JAVIS_DEV_OPEN="tasks" opens the board on that card.
    if (!app.isPackaged && process.env.JAVIS_DEV_OPEN) {
      setTimeout(() => openBoard({ type: "ask", text: process.env.JAVIS_DEV_OPEN }), 2500);
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    globalShortcut.unregisterAll();
    hookServer.stop();
    if (codexMonitor) codexMonitor.stop();
    if (host) host.stop();
  });

  app.on("window-all-closed", () => {
    if (isQuitting) app.quit();
  });
}
