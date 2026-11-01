// src/os-host.js — JAVIS OS: a macOS-like desktop window (menu bar, Dock, app windows,
// Spotlight, Launchpad, notification banners) opened from the floating JAVIS girl.
//
// The page is javis-desk://app/os.html (same scheme/proxy as the desk, so /fleet/* calls
// carry the device bearer added in the main process). App windows are <webview>s on the
// JAVIS gateway web (`${gateway}/?module=<id>`) in their own partition; the bearer is added
// here to requests for the gateway origin, so the owner signs in once and no token ever
// reaches a page (not the OS page, not the embedded web).
"use strict";

const path = require("path");
const os = require("os");

const WEB_PARTITION = "persist:javis-web";
const MIN = { width: 960, height: 600 };

function originOf(url) {
  try { return new URL(url).origin; } catch { return ""; }
}

/** Is `url` something an app window may show (the gateway web, or the public JAVIS web)? */
function isAllowedWebUrl(url, gateway) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const gw = originOf(gateway);
  return (!!gw && u.origin === gw) || u.origin === "https://javis.bumbee.asia";
}

/** Headers for a webview request: add the bearer only for the gateway, never overwrite the page's own. */
function withBearer(headers, url, gateway, token) {
  if (!token || originOf(url.replace(/^ws/, "http")) !== originOf(gateway)) return headers;
  const has = Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
  if (has) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
}

function createOsHost(deps) {
  const {
    BrowserWindow, Notification, screen, session, shell, ipcMain, app,
    ORIGIN, getGateway, getToken, setTrayCount = () => {}, openDeskBoard = () => {},
    transcribe = async () => ({ ok: false }), isDoNotDisturb = () => false, log = () => {},
  } = deps;

  let win = null;
  let ready = false;
  let pending = [];
  let lastUnread = 0;
  let authedGateway = "";

  const send = (channel, payload) => {
    if (!win || win.isDestroyed()) return;
    if (!ready) { pending.push([channel, payload]); return; }
    win.webContents.send(channel, payload);
  };

  // ── one sign-in for every embedded module ──
  function webSession() {
    return session.fromPartition(WEB_PARTITION);
  }

  function wireWebAuth() {
    const gateway = getGateway();
    if (!gateway || gateway === authedGateway) return;
    authedGateway = gateway;
    const ses = webSession();
    const origin = originOf(gateway);
    const wsOrigin = origin.replace(/^http/, "ws");
    ses.webRequest.onBeforeSendHeaders({ urls: [`${origin}/*`, `${wsOrigin}/*`] }, (details, callback) => {
      Promise.resolve(getToken())
        .catch(() => null)
        .then((token) => callback({ requestHeaders: withBearer(details.requestHeaders, details.url, authedGateway, token) }));
    });
    // Embedded web: no camera/geo/etc. Mic only for the gateway web (voice in Giao việc).
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      const fromGw = originOf((details && details.requestingUrl) || wc.getURL()) === originOf(authedGateway);
      const audioOnly = !details || !details.mediaTypes || details.mediaTypes.every((t) => t === "audio");
      callback(fromGw && ((permission === "media" && audioOnly) || permission === "clipboard-sanitized-write"));
    });
  }

  function workArea() {
    const cursor = screen.getCursorScreenPoint();
    return screen.getDisplayNearestPoint(cursor).workArea;
  }

  function create() {
    wireWebAuth();
    const wa = workArea();
    win = new BrowserWindow({
      x: wa.x, y: wa.y, width: wa.width, height: wa.height,
      minWidth: MIN.width, minHeight: MIN.height,
      show: false,
      frame: false,
      titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
      trafficLightPosition: { x: -100, y: -100 },
      backgroundColor: "#0b1030",
      title: "JAVIS OS",
      fullscreenable: true,
      webPreferences: {
        preload: path.join(__dirname, "preload-os.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
        backgroundThrottling: true,
        devTools: !app.isPackaged,
      },
    });
    if (process.platform === "darwin" && win.setWindowButtonVisibility) win.setWindowButtonVisibility(false);
    const wc = win.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    wc.on("will-navigate", (event, url) => {
      if (!url.startsWith(ORIGIN + "/")) event.preventDefault();
    });
    // Every <webview>: our partition, no preload/node, only the JAVIS web.
    wc.on("will-attach-webview", (event, prefs, params) => {
      delete prefs.preload;
      prefs.nodeIntegration = false;
      prefs.nodeIntegrationInSubFrames = false;
      prefs.contextIsolation = true;
      prefs.sandbox = true;
      prefs.webSecurity = true;
      params.partition = WEB_PARTITION;
      if (!isAllowedWebUrl(params.src, getGateway())) {
        log(`os: blocked webview ${String(params.src).slice(0, 120)}`);
        event.preventDefault();
      }
    });
    wc.on("did-attach-webview", (_e, guest) => {
      // OS shortcuts keep working while the focus is inside an app window.
      guest.on("before-input-event", (event, input) => {
        if (input.type !== "keyDown") return;
        const mod = input.meta || input.control;
        const key = String(input.key || "").toLowerCase();
        if ((mod && (input.code === "Space" || (key === "k" && !input.shift))) || input.key === "F4" || (mod && ["w", "m", "h"].includes(key) && !input.shift && !input.alt)) {
          event.preventDefault();
          send("os:command", { type: "key", key: input.key, code: input.code, meta: !!input.meta, ctrl: !!input.control });
        }
      });
      // Links that leave the JAVIS web open in the system browser; JAVIS links open as a new app window.
      guest.setWindowOpenHandler(({ url }) => {
        if (isAllowedWebUrl(url, getGateway())) send("os:command", { type: "open-url", url });
        else if (/^https?:\/\//.test(url)) shell.openExternal(url);
        return { action: "deny" };
      });
      guest.on("will-navigate", (event, url) => {
        if (isAllowedWebUrl(url, getGateway())) return;
        event.preventDefault();
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
      });
    });
    ready = false;
    wc.on("did-finish-load", () => {
      ready = true;
      const q = pending;
      pending = [];
      for (const [c, p] of q) wc.send(c, p);
    });
    win.loadURL(`${ORIGIN}/os.html`);
    // Closing hides: the page keeps listening for customer messages (banners, Dock badge).
    win.on("close", (event) => {
      if (!deps.isQuitting()) { event.preventDefault(); win.hide(); }
    });
    win.on("closed", () => { win = null; ready = false; });
    win.on("focus", () => send("os:focus", true));
    win.on("blur", () => send("os:focus", false));
    return win;
  }

  function ensure() {
    if (!win || win.isDestroyed()) create();
    return win;
  }

  function show(command) {
    ensure();
    wireWebAuth();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (command) send("os:command", command);
  }

  function hide() {
    if (win && !win.isDestroyed()) win.hide();
  }

  function toggle() {
    if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) hide();
    else show();
  }

  function isOs(event) {
    return !!(win && !win.isDestroyed() && event.sender === win.webContents);
  }

  function info() {
    return {
      gateway: getGateway(),
      host: os.hostname().replace(/\.local$/, ""),
      version: app.getVersion(),
      platform: process.platform,
      doNotDisturb: !!isDoNotDisturb(),
    };
  }

  // ── macOS notification when the OS window is not in front ──
  function notifyNative(n) {
    if (isDoNotDisturb() || !Notification || !Notification.isSupported()) return false;
    const note = new Notification({
      title: String(n.title || "JAVIS").slice(0, 80),
      subtitle: String(n.subtitle || "").slice(0, 80),
      body: String(n.body || "").slice(0, 180),
      silent: false,
    });
    note.on("click", () => show(n.conv ? { type: "open", app: "crm", props: { conv: n.conv } } : { type: "open", app: n.app || "crm" }));
    note.show();
    return true;
  }

  function registerIpc() {
    ipcMain.handle("os:info", (e) => (isOs(e) ? info() : null));
    ipcMain.handle("os:auth-status", (e) => (isOs(e) ? (deps.authStatus ? deps.authStatus() : null) : null));
    ipcMain.on("os:hide", (e) => { if (isOs(e)) hide(); });
    ipcMain.on("os:minimize", (e) => { if (isOs(e)) win.minimize(); });
    ipcMain.on("os:fullscreen", (e) => { if (isOs(e)) win.setFullScreen(!win.isFullScreen()); });
    ipcMain.on("os:quit", (e) => { if (isOs(e)) deps.quit(); });
    ipcMain.on("os:desk-board", (e) => { if (isOs(e)) openDeskBoard(); });
    ipcMain.on("os:unread", (e, n) => {
      if (!isOs(e)) return;
      lastUnread = Math.max(0, Math.min(9999, Number(n) || 0));
      setTrayCount(lastUnread);
    });
    // The page shows its own banner when the OS window is in front; otherwise a system one.
    ipcMain.handle("os:notify", (e, n) => {
      if (!isOs(e) || !n || typeof n !== "object") return { shown: false };
      if (win.isVisible() && win.isFocused()) return { shown: false, inPage: true };
      return { shown: notifyNative(n) };
    });
    ipcMain.handle("os:open-external", (e, url) => {
      if (!isOs(e) || typeof url !== "string" || !/^https?:\/\//.test(url)) return { ok: false };
      shell.openExternal(url);
      return { ok: true };
    });
    ipcMain.handle("os:stt", async (e, payload) => {
      if (!isOs(e)) return null;
      try { return await transcribe(payload); } catch (err) { return { ok: false, error: err.message }; }
    });
  }

  return {
    authChanged: (status) => { wireWebAuth(); send("os:auth", status); },
    registerIpc, create, ensure, show, hide, toggle, info, notifyNative,
    window: () => win, unread: () => lastUnread, isOsSender: isOs,
  };
}

module.exports = { createOsHost, WEB_PARTITION, __test: { isAllowedWebUrl, withBearer, originOf } };
