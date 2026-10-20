// src/javis-companion-host.js — JAVIS chat inside the desktop app.
//
// The chat window embeds the same <javis-companion> web component as the JAVIS web
// app and talks to the same gateway endpoints (/fleet/chat, /fleet/voice/*,
// /fleet/stream), so desktop and web share one chat history.
//
// The page is served from the privileged scheme javis-desk://app/. Requests to
// javis-desk://app/fleet/* are proxied here in the main process to the JAVIS
// gateway with "Authorization: Bearer <access token>". Sign-in ("Đăng nhập JAVIS",
// browser + PKCE or a 6-digit email code) lives in javis-auth.js; tokens stay in the
// main process and are never handed to the renderer. Old jvk_ device keys still work.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAuth, createSessionStore, isPlausibleDeviceKey } = require("./javis-auth");

const SCHEME = "javis-desk";
const ORIGIN = `${SCHEME}://app`;
const DEFAULT_GATEWAY = "https://server-google-vscode.tail88b7de.ts.net:18110";
const KEY_FILE = "javis-device-key.json";
const CONFIG_FILE = "javis-companion.json";
const CLIENT_ID_HEADER = "X-Javis-Client";

// Retry policy (owner rule): at most 3 attempts with growing back-off, then stop.
const MAX_FAILURES = 3;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".moc3": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

// Must run before app "ready".
function registerJavisScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  }]);
}

function normalizeGateway(url) {
  if (typeof url !== "string") return null;
  const trimmed = url.trim().replace(/\/+$/, "");
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return `${u.protocol}//${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return null;
  }
}

// Map a javis-desk://app/<path> request to a bundled file. Returns null when the
// path is not one we serve (no directory listing, no traversal, no model export).
function resolveStaticPath(pathname, roots) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  if (rel.includes("\0") || rel.includes("\\")) return null;
  rel = path.posix.normalize(rel);
  if (rel.includes("..")) return null;
  if (rel === "/" || rel === "/index.html") return path.join(roots.src, "javis-chat.html");
  if (rel === "/javis-chat.js" || rel === "/javis-chat.css") return path.join(roots.src, rel.slice(1));
  if (rel === "/icon.png") return path.join(roots.assets, "icons", "128x128.png");
  // 0.12.0 tool windows: Việc chờ anh, Thư ký đọc báo cáo, AI Clipboard.
  let t = rel.match(/^\/(inbox|secretary|clip)\.html$/);
  if (t) return path.join(roots.src, `javis-${t[1]}.html`);
  t = rel.match(/^\/(javis-(?:inbox|secretary|clip)-page\.js|javis-tools\.css)$/);
  if (t) return path.join(roots.src, t[1]);
  let m = rel.match(/^\/ui\/(javis-companion[A-Za-z0-9_.-]*\.js)$/);
  if (m) return path.join(roots.assets, "javis-companion", "ui", m[1]);
  if (rel === "/live2d/live2dcubismcore.min.js") return path.join(roots.assets, "live2d", "runtime", "live2dcubismcore.min.js");
  // Only the Hiyori sample (used by <javis-companion>); files are read in place, never written out.
  m = rel.match(/^\/live2d\/hiyori\/([A-Za-z0-9_./-]+)$/);
  if (m && /\.(json|moc3|png)$/.test(m[1])) return path.join(roots.assets, "live2d", "hiyori", m[1]);
  return null;
}

function createKeyStore({ userDataDir, safeStorage, fsImpl = fs }) {
  const file = path.join(userDataDir, KEY_FILE);

  function read() {
    try {
      const data = JSON.parse(fsImpl.readFileSync(file, "utf8"));
      let key = null;
      if (data.enc && safeStorage && safeStorage.isEncryptionAvailable()) {
        key = safeStorage.decryptString(Buffer.from(data.enc, "base64"));
      } else if (typeof data.plain === "string") {
        key = data.plain;
      }
      return key ? { key, email: data.email || "", name: data.name || "", pairedAt: data.pairedAt || 0 } : null;
    } catch {
      return null;
    }
  }

  function save(key, meta = {}) {
    const record = { v: 1, email: meta.email || "", name: meta.name || "", pairedAt: Date.now() };
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      record.enc = safeStorage.encryptString(key).toString("base64");
    } else {
      // No OS keychain (e.g. headless Linux): keep it owner-only.
      record.plain = key;
    }
    fsImpl.mkdirSync(userDataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fsImpl.writeFileSync(tmp, JSON.stringify(record), { encoding: "utf8", mode: 0o600 });
    fsImpl.renameSync(tmp, file);
  }

  function clear() {
    try { fsImpl.unlinkSync(file); } catch {}
  }

  return { read, save, clear, file };
}

function createConfigStore({ userDataDir, fsImpl = fs }) {
  const file = path.join(userDataDir, CONFIG_FILE);
  function read() {
    try { return JSON.parse(fsImpl.readFileSync(file, "utf8")) || {}; } catch { return {}; }
  }
  function getGateway() {
    return normalizeGateway(process.env.JAVIS_GATEWAY_URL || "") || normalizeGateway(read().gateway || "") || DEFAULT_GATEWAY;
  }
  function setGateway(url) {
    const g = normalizeGateway(url);
    if (!g) throw new Error("invalid_gateway_url");
    const next = { ...read(), gateway: g };
    fsImpl.mkdirSync(userDataDir, { recursive: true });
    fsImpl.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
    return g;
  }
  return { read, getGateway, setGateway };
}

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

/**
 * Proxy for javis-desk://app/fleet/*. `fetchImpl` is Electron's net.fetch in the app
 * and a fake in tests (no real gateway / LLM calls from tests). The bearer comes from
 * `auth` (access token, or an old jvk_ key); a 401 refreshes once and retries once.
 */
function createFleetProxy({ auth, configStore, fetchImpl, log = () => {} }) {
  const state = { streamFailures: 0, streamBlockedUntil: 0 };
  // Open /fleet/stream connections. Closed when the session ends, otherwise they keep
  // HTTP/1.1 sockets to the gateway busy and later calls (even "Đăng xuất") queue forever.
  const liveStreams = new Set();

  function reset() {
    state.streamFailures = 0;
    state.streamBlockedUntil = 0;
  }

  function abortStreams() {
    for (const ac of liveStreams) { try { ac.abort(); } catch {} }
    liveStreams.clear();
  }

  async function handle(request) {
    const url = new URL(request.url);
    const isStream = url.pathname === "/fleet/stream";
    if (!auth.isSignedIn()) return jsonResponse(401, { error: "not_signed_in" });
    if (isStream && state.streamFailures >= MAX_FAILURES) {
      // 204 tells EventSource to stop reconnecting (no endless retries).
      return new Response(null, { status: 204 });
    }
    if (isStream && Date.now() < state.streamBlockedUntil) return new Response(null, { status: 204 });
    let token = await auth.token();
    if (!token) return auth.isSignedIn() ? jsonResponse(502, { error: "gateway_unreachable" }) : jsonResponse(401, { error: "not_signed_in" });

    // Never forward a token from the page; the bearer is added here.
    url.searchParams.delete("token");
    const target = configStore.getGateway() + url.pathname + (url.search || "");
    const baseHeaders = new Headers();
    for (const name of ["content-type", "accept", "last-event-id"]) {
      const v = request.headers.get(name);
      if (v) baseHeaders.set(name, v);
    }
    baseHeaders.set(CLIENT_ID_HEADER, "javis-desktop");
    const body = request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : undefined;

    let res;
    let ac = null;
    if (isStream) {
      ac = new AbortController();
      liveStreams.add(ac);
      // The page closed its EventSource → close the upstream connection too.
      if (request.signal) request.signal.addEventListener("abort", () => { ac.abort(); liveStreams.delete(ac); });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const headers = new Headers(baseHeaders);
      headers.set("Authorization", `Bearer ${token}`);
      const init = { method: request.method, headers, redirect: "manual" };
      if (body !== undefined) init.body = body;
      if (ac) init.signal = ac.signal;
      try {
        res = await fetchImpl(target, init);
      } catch (err) {
        if (ac) liveStreams.delete(ac);
        log(`JAVIS: gateway unreachable (${url.pathname}): ${err && err.message}`);
        if (isStream) {
          state.streamFailures++;
          state.streamBlockedUntil = Date.now() + 5000 * 2 ** state.streamFailures;
        }
        return jsonResponse(502, { error: "gateway_unreachable" });
      }
      if (res.status !== 401) break;
      const next = await auth.onUnauthorized(token, { retried: attempt > 0 });
      if (!next) { if (ac) liveStreams.delete(ac); return jsonResponse(401, { error: "signed_out" }); }
      token = next;
    }

    if (isStream) {
      if (!res.ok) liveStreams.delete(ac);
      if (res.ok) state.streamFailures = 0;
      else {
        state.streamFailures++;
        state.streamBlockedUntil = Date.now() + 5000 * 2 ** state.streamFailures;
      }
    }

    const outHeaders = new Headers();
    for (const name of ["content-type", "cache-control", "content-disposition"]) {
      const v = res.headers.get(name);
      if (v) outHeaders.set(name, v);
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
  }

  return { handle, reset, abortStreams, state, liveStreams };
}

/**
 * Main-process calls to the gateway (Việc chờ anh, báo cáo, giọng đọc, Clipboard) with the
 * same sign-in as the proxy. A 401 refreshes the access token and retries once; if that is
 * rejected too the session ends (login screen). A 403 is returned to the caller (e.g. an
 * owner ticket that only the owner's web session may decide) and does not sign out.
 */
function createGatewayClient({ auth, configStore, fetchImpl }) {
  function headersFor(token, extra = {}) {
    return { Authorization: `Bearer ${token}`, [CLIENT_ID_HEADER]: "javis-desktop", ...extra };
  }

  async function send(method, pathname, init0) {
    if (!auth.isSignedIn()) return { notSignedIn: true };
    let token = await auth.token();
    if (!token) return { offline: auth.isSignedIn(), notSignedIn: !auth.isSignedIn() };
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(configStore.getGateway() + pathname, { ...init0, method, headers: headersFor(token, init0.headers) });
      if (res.status !== 401 || attempt > 0) {
        if (res.status === 401) await auth.onUnauthorized(token, { retried: true });
        return { res };
      }
      const next = await auth.onUnauthorized(token);
      if (!next) return { res };
      token = next;
    }
  }

  async function request(method, pathname, body, { raw = false } = {}) {
    const init = { headers: body !== undefined ? { "Content-Type": "application/json" } : {} };
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await send(method, pathname, init);
    if (r.notSignedIn) return { status: 0, data: { error: "not_paired" }, notPaired: true };
    if (r.offline) throw new Error("gateway_unreachable");
    const res = r.res;
    if (raw) {
      const buffer = res.ok ? await res.arrayBuffer() : null;
      return { status: res.status, buffer, contentType: res.headers.get("content-type") || "" };
    }
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data: data || {} };
  }

  const liveStreams = new Set();
  function abortStreams() {
    for (const ac of liveStreams) { try { ac.abort(); } catch {} }
    liveStreams.clear();
  }

  async function openStream() {
    const ac = new AbortController();
    liveStreams.add(ac);
    const r = await send("GET", "/fleet/stream", { headers: { Accept: "text/event-stream" }, signal: ac.signal })
      .catch((err) => { liveStreams.delete(ac); throw err; });
    if (!r.res || !r.res.ok) liveStreams.delete(ac);
    if (r.notSignedIn) return { status: 401, ok: false };
    if (r.offline) throw new Error("gateway_unreachable");
    return r.res;
  }

  return { request, openStream, abortStreams, isPaired: () => auth.isSignedIn() };
}

/**
 * Wire everything into the Electron app. Returns { openChat, openLogin, … }.
 */
function initJavisCompanionHost(deps) {
  const {
    app, BrowserWindow, ipcMain, session, net, safeStorage, shell, getBounds, onOpen,
    onPairChange = () => {}, onAuthState = () => {}, onSessionExpired = () => {},
  } = deps;
  const roots = { src: __dirname, assets: path.resolve(__dirname, "..", "assets") };
  const userDataDir = app.getPath("userData");
  const keyStore = createKeyStore({ userDataDir, safeStorage });
  const sessionStore = createSessionStore({ userDataDir, safeStorage });
  const configStore = createConfigStore({ userDataDir });
  const fetchImpl = (url, init) => net.fetch(url, init);
  let win = null;

  const send = (channel, payload) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  let proxy = null;
  let gatewayClient = null;
  const auth = createAuth({
    fetchImpl,
    getGateway: () => configStore.getGateway(),
    sessionStore,
    legacyStore: keyStore,
    openExternal: (url) => shell.openExternal(url),
    deviceName: os.hostname().replace(/\.local$/, "") || "JAVIS Desktop",
    onChange: (s, { wasIn }) => {
      send("javis:auth", { ...status(), ...s });
      onAuthState(s);
      if (s.signedIn && !wasIn) { if (proxy) proxy.reset(); onPairChange("paired"); }
      else if (!s.signedIn && wasIn) {
        if (proxy) proxy.abortStreams();
        if (gatewayClient) gatewayClient.abortStreams();
        onPairChange(s.state === "expired" ? "rejected" : "unpaired");
      }
    },
    onExpired: (s) => {
      // The session is over: show the login screen again (and the character says so once).
      open("login", { inactive: true });
      onSessionExpired(s);
    },
    log: (msg) => console.warn(msg),
  });
  auth.init();
  proxy = createFleetProxy({ auth, configStore, fetchImpl, log: (msg) => console.warn(msg) });
  gatewayClient = createGatewayClient({ auth, configStore, fetchImpl });
  let emailEnabled = true;

  session.defaultSession.protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("not found", { status: 404 });
    if (url.pathname.startsWith("/fleet/")) return proxy.handle(request);
    if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
    const file = resolveStaticPath(url.pathname, roots);
    if (!file) return new Response("not found", { status: 404 });
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });

  // Live2D sample data must not be exported: no downloads from the JAVIS window.
  session.defaultSession.on("will-download", (event, _item, contents) => {
    if (win && !win.isDestroyed() && contents === win.webContents) event.preventDefault();
  });

  function status() {
    const s = auth.getState();
    return {
      ...s,
      paired: s.signedIn,
      gateway: configStore.getGateway(),
      defaultGateway: DEFAULT_GATEWAY,
      emailEnabled,
      encrypted: !!(safeStorage && safeStorage.isEncryptionAvailable()),
    };
  }

  const fromChat = (event) => win && !win.isDestroyed() && event.sender === win.webContents;
  const guarded = (channel, fn) => ipcMain.handle(channel, async (e, ...args) => {
    if (!fromChat(e)) return null;
    const r = await fn(...args);
    return { ...(r || {}), status: status() };
  });
  ipcMain.handle("javis:status", async (e) => {
    if (!fromChat(e)) return null;
    // Hide "Hoặc nhận mã qua email" only when the gateway says mail is off.
    if (!auth.isSignedIn()) {
      try { emailEnabled = (await auth.config()).emailEnabled; } catch {}
    }
    return status();
  });
  guarded("javis:login", () => auth.login());
  guarded("javis:login-reopen", () => auth.reopenBrowser());
  guarded("javis:login-cancel", () => { auth.cancel(); return { ok: true }; });
  guarded("javis:email-start", (email) => auth.emailStart(email));
  guarded("javis:email-verify", (code) => auth.emailVerify(code));
  guarded("javis:email-resend", () => auth.emailResend());
  guarded("javis:logout", () => auth.logout());
  guarded("javis:use-key", (key) => auth.useLegacyKey(key));
  guarded("javis:set-gateway", (url) => {
    try {
      configStore.setGateway(url);
      auth.resetConfig();
      proxy.reset();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // view: null = chat (or login when signed out), "login", "settings".
  // inactive: show without stealing focus (the session expired in the background).
  function open(view, { inactive = false } = {}) {
    if (onOpen) onOpen();
    if (win && !win.isDestroyed()) {
      if (view) send("javis:show-view", view);
      if (inactive) win.showInactive();
      else { win.show(); win.focus(); }
      return win;
    }
    const width = 440;
    const height = 780;
    const b = getBounds ? getBounds(width, height) : {};
    win = new BrowserWindow({
      width,
      height,
      x: b.x,
      y: b.y,
      minWidth: 380,
      minHeight: 620,
      title: "JAVIS",
      show: false,
      backgroundColor: "#070916",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload-javis.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: !app.isPackaged,
      },
    });
    const wc = win.webContents;
    // Keep the page inside javis-desk://app; real links open in the system browser.
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    wc.on("will-navigate", (event, url) => {
      if (!url.startsWith(ORIGIN + "/")) {
        event.preventDefault();
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
      }
    });
    win.loadURL(`${ORIGIN}/index.html${view ? `#${view}` : ""}`);
    win.once("ready-to-show", () => {
      if (!win || win.isDestroyed()) return;
      if (inactive) win.showInactive();
      else win.show();
    });
    // A browser sign-in still in progress keeps waiting (≤ 5 min) after the window closes.
    win.on("closed", () => { win = null; });
    return win;
  }

  return {
    openChat: () => open(null),
    // { start: true } = also open the browser sign-in right away (one click from other windows).
    openLogin: (opts = {}) => {
      if (auth.isSignedIn()) return open("settings");
      open("login");
      if (opts && opts.start && auth.getState().state !== "waiting_browser") void auth.login();
      return win;
    },
    openSettings: () => open("settings"),
    getWindow: () => win,
    status,
    auth,
    keyStore,
    configStore,
    gatewayClient,
  };
}

module.exports = {
  SCHEME,
  ORIGIN,
  DEFAULT_GATEWAY,
  MAX_FAILURES,
  registerJavisScheme,
  initJavisCompanionHost,
  __test: { normalizeGateway, isPlausibleDeviceKey, resolveStaticPath, createKeyStore, createConfigStore, createFleetProxy, createGatewayClient },
};
