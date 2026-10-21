// src/javis-desk-tools.js — 0.12.0 tools around the character:
//   • Việc chờ anh   (inbox window + count in the menu + gentle note from the character)
//   • Thư ký          (reads today's report aloud, ≤ 90 s, with a Stop button)
//   • AI Clipboard   (quick paste window, global shortcut)
// Pages are served from javis-desk://app (same origin as the chat), preload-javis-tools.js
// exposes only the calls below. Gateway calls happen here, with the paired device key.
"use strict";

const os = require("os");
const path = require("path");
const { createInbox, createStreamWatcher, shouldNotify, WEB_BASE } = require("./javis-inbox");
const { buildReportSpeech } = require("./javis-report");
const { createSpeaker, findBsay, ENGINE_LABEL } = require("./javis-voice");
const { createClip, createClipKeyStore } = require("./javis-clip");
const { looksSensitive } = require("./javis-clip-crypto");

const ORIGIN = "javis-desk://app";
const WINDOWS = {
  inbox: { page: "inbox.html", width: 420, height: 560, title: "Việc chờ anh" },
  secretary: { page: "secretary.html", width: 420, height: 440, title: "Thư ký JAVIS" },
  clip: { page: "clip.html", width: 440, height: 600, title: "AI Clipboard" },
};

// AI Clipboard global shortcut: default ⌘⇧⌥V (Ctrl+Shift+Alt+V), changeable from the menu.
const DEFAULT_CLIP_SHORTCUT = "CommandOrControl+Shift+Alt+V";
const CLIP_SHORTCUTS = [DEFAULT_CLIP_SHORTCUT, "CommandOrControl+Shift+Alt+B", "CommandOrControl+Alt+V", ""];

function shortcutLabel(acc, platform = process.platform) {
  if (!acc) return "";
  const mac = platform === "darwin";
  const map = mac
    ? { CommandOrControl: "⌘", Shift: "⇧", Alt: "⌥", Control: "⌃" }
    : { CommandOrControl: "Ctrl", Shift: "Shift", Alt: "Alt", Control: "Ctrl" };
  const parts = acc.split("+").map((k) => map[k] || k);
  return mac ? parts.join("") : parts.join("+");
}

function normalizeClipShortcut(v) {
  return typeof v === "string" && CLIP_SHORTCUTS.includes(v) ? v : DEFAULT_CLIP_SHORTCUT;
}

function initDeskTools(deps) {
  const {
    app, BrowserWindow, ipcMain, shell, clipboard, safeStorage, spawn,
    host, getBounds, sendToCharacter, isDoNotDisturb, isPetHidden, onMenuChange = () => {},
    onNewItems = () => {}, openLogin, t = (k) => k, log = (m) => console.warn(m),
    getClipShortcut = () => DEFAULT_CLIP_SHORTCUT, onWindowCreated = () => {},
  } = deps;
  const client = host.gatewayClient;
  const wins = {};
  let lastReport = null;
  let speech = { speaking: false, engine: null, text: "", seconds: 0 };

  // Trang chủ JAVIS (the main window) shows the same tools in its tabs: it gets every update too.
  const homeWin = () => (typeof host.getWindow === "function" ? host.getWindow() : null);
  const sendTo = (name, channel, payload) => {
    for (const w of [wins[name], homeWin()]) {
      if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
    }
  };

  // ── Việc chờ anh ──
  const inbox = createInbox({
    client,
    isPaired: () => client.isPaired(),
    onChange: (snap) => { sendTo("inbox", "javis-tools:inbox", snap); onMenuChange(); },
    onNew: ({ count, firstLoad }) => {
      if (!shouldNotify({ newCount: count, firstLoad, doNotDisturb: isDoNotDisturb(), petHidden: isPetHidden() })) return;
      sendToCharacter("javis-note", { text: t("petNewTasks").replace("{n}", count), ms: 8000 });
      onNewItems(count);
    },
  });
  const watcher = createStreamWatcher({
    openStream: () => client.openStream(),
    onEvent: () => inbox.poke(),
    log,
  });

  function startWatching() {
    if (!client.isPaired()) return;
    void inbox.refresh({ reason: "start" });
    watcher.start();
  }

  function onPairChange(kind) {
    if (kind === "paired") { inbox.reset(); startWatching(); }
    else { watcher.stop(); inbox.reset(); }
    sendTo("clip", "javis-tools:clip-changed", {});
  }

  // ── Thư ký ──
  const speaker = createSpeaker({
    spawn,
    findBsay: () => findBsay(),
    isPaired: () => client.isPaired(),
    fetchTts: async (text) => client.request("POST", "/fleet/voice/tts", { text, format: "wav" }, { raw: true }),
    toCharacter: (ch, payload) => sendToCharacter(ch, payload),
    onState: (s) => {
      speech = { ...speech, ...s, label: s.engine ? ENGINE_LABEL[s.engine] : speech.label };
      if (!s.speaking) speech.engine = null;
      sendTo("secretary", "javis-tools:speech", speech);
      onMenuChange();
    },
    log,
  });

  async function buildReport() {
    if (!client.isPaired()) {
      return { text: "Máy này chưa đăng nhập JAVIS nên em chưa lấy được báo cáo. Anh bấm Đăng nhập JAVIS trong menu, một lần là xong.", seconds: 8, empty: true, notPaired: true };
    }
    let morning = null;
    let r = null;
    try { r = await client.request("GET", "/fleet/report/morning"); } catch {}
    if (r && r.status === 200) morning = r.data;
    const snap = await inbox.refresh({ reason: "report" });
    if (!morning && !snap.loaded) {
      return { text: "Em chưa kết nối được máy chủ JAVIS để lấy báo cáo. Anh kiểm tra mạng rồi thử lại sau nhé.", seconds: 7, empty: true, offline: true };
    }
    return buildReportSpeech({ morning: morning || {}, inbox: snap });
  }

  // { window: false } = from the Home tab: the text shows there, no extra window.
  async function readReport({ window: withWindow = true } = {}) {
    if (withWindow) openWindow("secretary");
    sendTo("secretary", "javis-tools:report", { loading: true });
    const rep = await buildReport();
    lastReport = { ...rep, at: Date.now() };
    sendTo("secretary", "javis-tools:report", lastReport);
    const res = await speaker.speak(rep.text, { seconds: rep.seconds });
    return { ...lastReport, engine: res.engine || null, ok: res.ok };
  }

  // Home tab "Báo cáo hôm nay": the text only (🔊 reads it). Reuses a report < 10 min old.
  async function fetchReport({ fresh = false } = {}) {
    if (!fresh && lastReport && !lastReport.empty && Date.now() - lastReport.at < 10 * 60 * 1000) return lastReport;
    sendTo("secretary", "javis-tools:report", { loading: true });
    lastReport = { ...(await buildReport()), at: Date.now() };
    sendTo("secretary", "javis-tools:report", lastReport);
    return lastReport;
  }

  function stopReading() { return speaker.stop(); }

  // ── AI Clipboard ──
  const clip = createClip({
    client,
    keys: createClipKeyStore({ userDataDir: app.getPath("userData"), safeStorage }),
    deviceName: `JAVIS Desktop · ${os.hostname()}`,
  });

  // ── Windows ──
  function openWindow(name) {
    const spec = WINDOWS[name];
    let w = wins[name];
    if (w && !w.isDestroyed()) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
      return w;
    }
    const b = getBounds ? getBounds(spec.width, spec.height) : {};
    w = new BrowserWindow({
      width: spec.width, height: spec.height, x: b.x, y: b.y, minWidth: 360, minHeight: 360,
      title: spec.title, show: false, backgroundColor: "#070916", autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload-javis-tools.js"),
        contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged,
      },
    });
    wins[name] = w;
    const wc = w.webContents;
    wc.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
    wc.on("will-navigate", (e, url) => { if (!url.startsWith(ORIGIN + "/")) e.preventDefault(); });
    const query = name === "clip" ? `?kbd=${encodeURIComponent(shortcutLabel(getClipShortcut()) || "—")}` : "";
    w.loadURL(`${ORIGIN}/${spec.page}${query}`);
    w.once("ready-to-show", () => { if (!w.isDestroyed()) w.show(); });
    onWindowCreated(w);
    w.on("closed", () => {
      if (wins[name] === w) delete wins[name];
      if (name === "secretary") speaker.stop();
    });
    return w;
  }

  const fromTool = (e) => [...Object.values(wins), homeWin()].some((w) => w && !w.isDestroyed() && e.sender === w.webContents);
  const handle = (ch, fn) => ipcMain.handle(ch, async (e, ...args) => (fromTool(e) ? fn(...args) : null));

  handle("javis-tools:inbox-get", async () => inbox.snapshot());
  handle("javis-tools:inbox-refresh", async () => inbox.refresh({ reason: "manual" }));
  handle("javis-tools:open-web", async (url) => {
    // Only the JAVIS web (or the gateway's own pages) — never arbitrary links.
    let u;
    try { u = new URL(String(url || WEB_BASE)); } catch { return { ok: false }; }
    // Plus the exact `link` of a line in "Việc chờ anh" (CONTRACT v1.1: approving happens on the web).
    const allowed = [new URL(WEB_BASE).origin, new URL(host.configStore.getGateway()).origin];
    if (!allowed.includes(u.origin) && !(u.protocol === "https:" && inbox.hasLink(String(url)))) return { ok: false };
    await shell.openExternal(u.href);
    return { ok: true };
  });
  // "Đăng nhập JAVIS" from any tool window: opens the browser sign-in in one click.
  handle("javis-tools:login", async () => { openLogin({ start: true }); return { ok: true }; });

  handle("javis-tools:report-get", async () => ({ report: lastReport, speech }));
  handle("javis-tools:report-read", async (opts) => readReport({ window: !(opts && opts.window === false) }));
  handle("javis-tools:report-fetch", async (opts) => fetchReport({ fresh: !!(opts && opts.fresh) }));
  handle("javis-tools:report-stop", async () => ({ stopped: stopReading() }));

  handle("javis-tools:clip-status", async () => clip.status());
  handle("javis-tools:clip-create", async () => clip.create());
  handle("javis-tools:clip-link", async (link) => clip.linkKey(link));
  handle("javis-tools:clip-send", async (text, { confirmed = false } = {}) => {
    if (!confirmed && looksSensitive(text)) return { ok: false, sensitive: true, error: "Trông giống mật khẩu/mã OTP. Bấm Gửi lần nữa nếu anh chắc." };
    return clip.send(text);
  });
  handle("javis-tools:clip-recent", async () => clip.recent(10));
  handle("javis-tools:clip-read-system", async () => clipboard.readText());
  handle("javis-tools:clip-copy", async (text) => { clipboard.writeText(String(text || "")); return { ok: true }; });
  handle("javis-tools:clip-open-web", async () => {
    await shell.openExternal(new URL("/clip", host.configStore.getGateway() + "/").href);
    return { ok: true };
  });

  ipcMain.on("javis-speech-ended", (_e, id) => speaker.ended(id));

  return {
    openInbox: () => { const w = openWindow("inbox"); void inbox.refresh({ reason: "open" }); return w; },
    openSecretary: () => openWindow("secretary"),
    openClipboard: () => openWindow("clip"),
    readReport,
    stopReading,
    isReading: () => speaker.isSpeaking(),
    inboxSnapshot: () => inbox.snapshot(),
    refreshInbox: (reason = "menu") => inbox.refresh({ reason }),
    clipStatus: () => clip.status(),
    startWatching,
    stopWatching: () => watcher.stop(),
    onPairChange,
    getWindow: (name) => wins[name] || null,
    windows: () => Object.values(wins).filter((w) => w && !w.isDestroyed()),
  };
}

module.exports = { initDeskTools, WINDOWS, DEFAULT_CLIP_SHORTCUT, CLIP_SHORTCUTS, shortcutLabel, normalizeClipShortcut };
