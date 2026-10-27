// src/javis-desk-host.js — bridge between the JAVIS desk assistant window and the
// JAVIS gateway (bumbee-fleet).
//
// The desk page is served from the privileged scheme javis-desk://app/. Requests to
// javis-desk://app/fleet/* and /asset-files/* are proxied here in the main process
// to the gateway with "Authorization: Bearer <token>". Sign-in lives in javis-auth.js:
//   1. the owner's machines in the tailnet sign in silently (POST /fleet/auth/desktop/tailnet)
//      when the app starts, wakes up or unlocks — no pairing steps;
//   2. fallback when the tailnet route is not available: device-code pairing (QR / link,
//      /fleet/auth/device/start → approve on web → /poll) or a pasted device key.
// Tokens/keys are stored encrypted with safeStorage and never reach the renderer.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAuth, createSessionStore, createAuthLog } = require("./javis-auth");
const { createNetRecover } = require("./net-recover");

const SCHEME = "javis-desk";
const ORIGIN = `${SCHEME}://app`;
const DEFAULT_GATEWAY = "https://server-google-vscode.tail88b7de.ts.net:18110";
const KEY_FILE = "javis-device-key.json";
const CONFIG_FILE = "javis-companion.json";
const CLIENT_ID_HEADER = "X-Javis-Client";

// Retry policy (owner rule): at most 3 attempts with growing back-off, then stop.
const MAX_FAILURES = 3;
const PAIR_POLL_MIN_S = 3;
const FEATURE_DENIED = "Tính năng này chưa có quyền với tài khoản trên máy. Anh vẫn đang đăng nhập, thử lại sau nhé.";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
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

function isPlausibleDeviceKey(key) {
  return typeof key === "string" && /^[A-Za-z0-9_.-]{16,512}$/.test(key.trim());
}

// Paths under javis-desk://app/ that go to the gateway instead of a bundled file.
function isGatewayPath(pathname) {
  return pathname.startsWith("/fleet/") || pathname.startsWith("/asset-files/");
}

// Map a javis-desk://app/<path> request to a bundled file. Returns null when the
// path is not one we serve (no directory listing, no traversal).
const STATIC_FILES = {
  "/": ["src", "desk/index.html"],
  "/index.html": ["src", "desk/index.html"],
  "/desk.css": ["src", "desk/desk.css"],
  "/desk.bundle.js": ["src", "bundles/desk.bundle.js"],
  "/hologram/character.jpg": ["assets", "hologram/character.jpg"],
  "/icon.png": ["assets", "icons/128x128.png"],
  // Shared "Cần anh duyệt" card (same web component as JAVIS web, vendored build).
  "/ui/javis-ask-box.js": ["assets", "javis-ask-box/javis-ask-box.js"],
};
function resolveStaticPath(pathname, roots) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  if (rel.includes("\0") || rel.includes("\\")) return null;
  rel = path.posix.normalize(rel);
  if (rel.includes("..")) return null;
  const hit = STATIC_FILES[rel];
  if (!hit) return null;
  return path.join(roots[hit[0]], ...hit[1].split("/"));
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

const FORWARD_REQUEST_HEADERS = ["content-type", "accept", "last-event-id", "range"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "cache-control", "content-disposition", "content-length", "content-range", "accept-ranges"];

/**
 * Proxy for javis-desk://app/fleet/* and /asset-files/*. `fetchImpl` is Electron's
 * net.fetch in the app and a fake in tests (no real gateway / LLM calls from tests).
 *
 * A 401 is not "signed out" by itself: auth refreshes the token and the request is
 * sent once more; if the token is still good (whoami) only this feature is refused
 * (403 feature_denied, session kept). The session ends only when auth says so.
 */
function createFleetProxy({ auth, configStore, fetchImpl, log = () => {} }) {
  const state = { streamFailures: 0, streamBlockedUntil: 0 };
  // Open /fleet/stream connections, closed when the session ends (otherwise they keep
  // sockets to the gateway busy and later calls queue behind them).
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
    if (!isGatewayPath(url.pathname)) return jsonResponse(404, { error: "not_found" });
    const isStream = url.pathname === "/fleet/stream";
    if (!auth.isSignedIn()) return jsonResponse(401, { error: "not_paired" });
    if (isStream && state.streamFailures >= MAX_FAILURES) {
      // 204 tells the page to stop reconnecting (no endless retries).
      return new Response(null, { status: 204 });
    }
    if (isStream && Date.now() < state.streamBlockedUntil) return new Response(null, { status: 204 });
    let token = await auth.token();
    if (!token) return auth.isSignedIn() ? jsonResponse(502, { error: "gateway_unreachable" }) : jsonResponse(401, { error: "not_paired" });

    // Never forward a token from the page; the bearer is added here.
    url.searchParams.delete("token");
    const target = configStore.getGateway() + url.pathname + (url.search || "");
    const baseHeaders = new Headers();
    for (const name of FORWARD_REQUEST_HEADERS) {
      const v = request.headers.get(name);
      if (v) baseHeaders.set(name, v);
    }
    baseHeaders.set(CLIENT_ID_HEADER, "javis-desktop");
    const body = request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : undefined;

    let ac = null;
    if (isStream) {
      ac = new AbortController();
      liveStreams.add(ac);
      // The page closed its stream → close the upstream connection too.
      if (request.signal) request.signal.addEventListener("abort", () => { ac.abort(); liveStreams.delete(ac); });
    }
    let res;
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
      const next = await auth.onUnauthorized(token, { retried: attempt > 0, path: url.pathname });
      if (!next) {
        if (ac) liveStreams.delete(ac);
        if (!auth.isSignedIn()) return jsonResponse(401, { error: "pairing_rejected" });
        if (isStream) { state.streamFailures = MAX_FAILURES; return new Response(null, { status: 204 }); }
        return jsonResponse(403, { error: "feature_denied", detail: FEATURE_DENIED });
      }
      token = next;
    }

    if (isStream) {
      if (res.ok) state.streamFailures = 0;
      else {
        liveStreams.delete(ac);
        state.streamFailures++;
        state.streamBlockedUntil = Date.now() + 5000 * 2 ** state.streamFailures;
      }
    }

    const outHeaders = new Headers();
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const v = res.headers.get(name);
      if (v) outHeaders.set(name, v);
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
  }

  return { handle, reset, abortStreams, state, liveStreams };
}

/**
 * Device-code pairing: start → show code/QR → poll until approved/denied/expired.
 * Network errors: up to MAX_FAILURES with back-off, then stop and report.
 */
function createPairing({ keyStore, configStore, fetchImpl, onUpdate, onPaired, setTimer = setTimeout, clearTimer = clearTimeout, clientName }) {
  let current = null; // { deviceCode, timer, expiresAt, failures }

  function stop() {
    if (current && current.timer) clearTimer(current.timer);
    current = null;
  }

  async function post(pathname, body) {
    const res = await fetchImpl(configStore.getGateway() + pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CLIENT_ID_HEADER]: "javis-desktop" },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, data: data || {} };
  }

  async function start() {
    stop();
    const gateway = configStore.getGateway();
    const r = await post("/fleet/auth/device/start", { client_name: clientName });
    if (!r.ok || !r.data.device_code) {
      throw new Error(r.data.error || `start_failed_${r.status}`);
    }
    const interval = Math.max(PAIR_POLL_MIN_S, Number(r.data.interval) || PAIR_POLL_MIN_S);
    const expiresIn = Math.max(30, Number(r.data.expires_in) || 600);
    const verifyUrl = new URL(r.data.verify_url || `/auth/device.html?code=${encodeURIComponent(r.data.user_code || "")}`, gateway + "/").href;
    current = { deviceCode: r.data.device_code, interval, expiresAt: Date.now() + expiresIn * 1000, failures: 0, timer: null };
    schedule(interval * 1000);
    return { userCode: r.data.user_code || "", verifyUrl, expiresIn, interval };
  }

  function schedule(ms) {
    if (!current) return;
    const me = current;
    me.timer = setTimer(() => (current === me ? poll().catch((err) => { stop(); onUpdate({ status: "error", error: err.message }); }) : undefined), ms);
  }

  async function poll() {
    const me = current;
    if (!me) return;
    if (Date.now() > me.expiresAt) {
      stop();
      onUpdate({ status: "expired" });
      return;
    }
    let r;
    try {
      r = await post("/fleet/auth/device/poll", { device_code: me.deviceCode });
    } catch (err) {
      if (current !== me) return;
      me.failures++;
      if (me.failures >= MAX_FAILURES) {
        stop();
        onUpdate({ status: "error", error: "gateway_unreachable" });
        return;
      }
      schedule(me.interval * 1000 * 2 ** me.failures);
      return;
    }
    if (current !== me) return;
    const status = r.data.status;
    if (status === "approved" && isPlausibleDeviceKey(r.data.key)) {
      const meta = { email: r.data.email || "", name: r.data.name || "" };
      keyStore.save(r.data.key.trim(), meta);
      stop();
      onPaired(r.data.key.trim(), meta);
      onUpdate({ status: "approved", email: r.data.email || "", name: r.data.name || "" });
      return;
    }
    if (status === "denied" || status === "expired") {
      stop();
      onUpdate({ status });
      return;
    }
    if (!r.ok && status !== "pending") {
      me.failures++;
      if (me.failures >= MAX_FAILURES) {
        stop();
        onUpdate({ status: "error", error: r.data.error || `poll_failed_${r.status}` });
        return;
      }
      schedule(me.interval * 1000 * 2 ** me.failures);
      return;
    }
    me.failures = 0;
    onUpdate({ status: "pending" });
    schedule(me.interval * 1000);
  }

  return { start, stop, poll, isActive: () => !!current };
}

/**
 * Wire the scheme, sign-in, proxy and pairing IPC into the Electron app. Only the
 * desk window (getWindow()) may call the javis:* IPC handlers.
 */
function initDeskHost(deps) {
  const { app, ipcMain, session, net, safeStorage, shell, powerMonitor, getWindow, onAuthChange = () => {} } = deps;
  const roots = { src: __dirname, assets: path.resolve(__dirname, "..", "assets") };
  const userDataDir = app.getPath("userData");
  const keyStore = createKeyStore({ userDataDir, safeStorage });
  const sessionStore = createSessionStore({ userDataDir, safeStorage });
  const configStore = createConfigStore({ userDataDir });
  // userData/javis-auth.log: sign-in / refresh / 401 trail (never a token).
  const authLog = createAuthLog({ userDataDir, mirror: (line) => console.warn(`JAVIS ${line}`) });
  // Network changed (Wi-Fi/Tailscale, wake, unlock): drop stale connections/DNS and retry once.
  const netRecover = createNetRecover({
    getSession: () => session.defaultSession,
    fetchImpl: (url, init) => net.fetch(url, init),
    log: (line) => authLog(line),
  });
  const fetchImpl = netRecover.fetch;

  const send = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  let proxy = null;
  const auth = createAuth({
    fetchImpl,
    getGateway: () => configStore.getGateway(),
    sessionStore,
    legacyStore: keyStore,
    openExternal: (url) => shell.openExternal(url),
    deviceName: os.hostname().replace(/\.local$/, "") || "JAVIS Desktop",
    onChange: (s, { wasIn }) => {
      if (s.signedIn && !wasIn && proxy) proxy.reset();
      if (!s.signedIn && wasIn && proxy) proxy.abortStreams();
      send("javis:auth", status());
      // Silent tailnet sign-in: the page reacts like a finished pairing (pairing sends its own).
      if (s.signedIn && !wasIn && s.kind === "oauth") send("javis:pair-update", { status: "approved", email: s.email || "", name: s.name || "", via: "tailnet" });
      try { onAuthChange(s); } catch {}
    },
    onExpired: (s) => send("javis:auth-error", { status: 401, notice: s.notice || "" }),
    log: authLog,
  });
  auth.init();
  proxy = createFleetProxy({ auth, configStore, fetchImpl, log: authLog });
  const pairing = createPairing({
    keyStore,
    configStore,
    fetchImpl,
    clientName: `JAVIS Desktop · ${os.hostname()}`,
    onUpdate: (u) => send("javis:pair-update", u),
    onPaired: (key, meta) => auth.useLegacyKey(key, meta),
  });

  session.defaultSession.protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("not found", { status: 404 });
    if (isGatewayPath(url.pathname)) return proxy.handle(request);
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

  function status() {
    const s = auth.getState();
    return {
      paired: s.signedIn,
      kind: s.kind,
      email: s.email || "",
      name: s.name || "",
      autoSigningIn: !!s.autoSigningIn,
      notice: s.notice || "",
      gateway: configStore.getGateway(),
      defaultGateway: DEFAULT_GATEWAY,
      authError: s.state === "expired",
      encrypted: !!(safeStorage && safeStorage.isEncryptionAvailable()),
    };
  }

  const fromDesk = (event) => {
    const win = getWindow();
    return win && !win.isDestroyed() && event.sender === win.webContents;
  };
  ipcMain.handle("javis:status", (e) => {
    if (!fromDesk(e)) return null;
    // The page asks while signed out (start, pairing card): try the silent tailnet sign-in
    // if tries are left (no extra try while a retry is already scheduled).
    if (!auth.isSignedIn()) void auth.autoSignIn("login-view");
    return status();
  });
  ipcMain.handle("javis:set-gateway", (e, url) => {
    if (!fromDesk(e)) return null;
    try {
      configStore.setGateway(url);
      pairing.stop();
      auth.resetConfig();
      proxy.reset();
      return { ok: true, status: status() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle("javis:pair-start", async (e) => {
    if (!fromDesk(e)) return null;
    try {
      const info = await pairing.start();
      let qr = "";
      try { qr = await require("qrcode").toDataURL(info.verifyUrl, { margin: 1, width: 200 }); } catch {}
      return { ok: true, ...info, qr };
    } catch (err) {
      return { ok: false, error: err.message || "start_failed" };
    }
  });
  ipcMain.handle("javis:pair-cancel", (e) => { if (fromDesk(e)) pairing.stop(); return { ok: true }; });
  ipcMain.handle("javis:pair-open-browser", (e, url) => {
    if (!fromDesk(e) || typeof url !== "string") return { ok: false };
    const gw = new URL(configStore.getGateway());
    let u;
    try { u = new URL(url); } catch { return { ok: false }; }
    if (u.origin !== gw.origin) return { ok: false };
    shell.openExternal(u.href);
    return { ok: true };
  });
  ipcMain.handle("javis:pair-paste-key", (e, key) => {
    if (!fromDesk(e)) return null;
    const r = auth.useLegacyKey(key);
    if (!r.ok) return r;
    pairing.stop();
    proxy.reset();
    return { ok: true, status: status() };
  });
  ipcMain.handle("javis:unpair", async (e) => {
    if (!fromDesk(e)) return null;
    pairing.stop();
    await auth.logout();
    proxy.reset();
    return { ok: true, status: status() };
  });

  // Wake / unlock: the network may have changed — drop old connections, then try the
  // silent sign-in again right away (only while signed out and tries are left).
  if (powerMonitor) {
    for (const ev of ["resume", "unlock-screen"]) {
      powerMonitor.on(ev, () => {
        void netRecover.reset(ev).then(() => auth.autoSignIn(ev));
      });
    }
  }
  // The owner's machine in the tailnet signs in by itself — no pairing steps.
  void auth.autoSignIn("start");

  return {
    status,
    auth,
    gateway: () => configStore.getGateway(),
    token: async () => (auth.isSignedIn() ? auth.token() : null),
    fetch: fetchImpl,
    stop: () => { pairing.stop(); auth.dispose(); proxy.abortStreams(); },
  };
}

module.exports = {
  SCHEME,
  ORIGIN,
  DEFAULT_GATEWAY,
  MAX_FAILURES,
  registerJavisScheme,
  initDeskHost,
  FEATURE_DENIED,
  __test: { normalizeGateway, isPlausibleDeviceKey, isGatewayPath, resolveStaticPath, createKeyStore, createConfigStore, createFleetProxy, createPairing },
};
