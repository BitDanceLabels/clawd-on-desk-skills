// src/javis-desk-host.js — bridge between the JAVIS desk assistant window and the
// JAVIS gateway (bumbee-fleet).
//
// The desk page is served from the privileged scheme javis-desk://app/. Requests to
// javis-desk://app/fleet/* and /asset-files/* are proxied here in the main process
// to the gateway with "Authorization: Bearer <device key>". The key comes from
// device-code pairing (/fleet/auth/device/start → approve on web → /poll), is
// stored encrypted with safeStorage, and never reaches the renderer.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const SCHEME = "javis-desk";
const ORIGIN = `${SCHEME}://app`;
const DEFAULT_GATEWAY = "https://server-google-vscode.tail88b7de.ts.net:18110";
const KEY_FILE = "javis-device-key.json";
const CONFIG_FILE = "javis-companion.json";
const CLIENT_ID_HEADER = "X-Javis-Client";

// Retry policy (owner rule): at most 3 attempts with growing back-off, then stop.
const MAX_FAILURES = 3;
const PAIR_POLL_MIN_S = 3;

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
 */
function createFleetProxy({ keyStore, configStore, fetchImpl, onAuthError = () => {}, log = () => {} }) {
  const state = { authError: false, streamFailures: 0, streamBlockedUntil: 0 };

  function reset() {
    state.authError = false;
    state.streamFailures = 0;
    state.streamBlockedUntil = 0;
  }

  async function handle(request) {
    const url = new URL(request.url);
    if (!isGatewayPath(url.pathname)) return jsonResponse(404, { error: "not_found" });
    const isStream = url.pathname === "/fleet/stream";
    const creds = keyStore.read();
    if (!creds) return jsonResponse(401, { error: "not_paired" });
    // Gateway already rejected this key: stop calling it until the user re-pairs.
    if (state.authError) return jsonResponse(401, { error: "pairing_rejected" });
    if (isStream && state.streamFailures >= MAX_FAILURES) {
      // 204 tells the page to stop reconnecting (no endless retries).
      return new Response(null, { status: 204 });
    }
    if (isStream && Date.now() < state.streamBlockedUntil) return new Response(null, { status: 204 });

    // Never forward a token from the page; the key is added here.
    url.searchParams.delete("token");
    const target = configStore.getGateway() + url.pathname + (url.search || "");
    const headers = new Headers();
    for (const name of FORWARD_REQUEST_HEADERS) {
      const v = request.headers.get(name);
      if (v) headers.set(name, v);
    }
    headers.set("Authorization", `Bearer ${creds.key}`);
    headers.set(CLIENT_ID_HEADER, "javis-desktop");

    const init = { method: request.method, headers, redirect: "manual" };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }

    let res;
    try {
      res = await fetchImpl(target, init);
    } catch (err) {
      log(`JAVIS: gateway unreachable (${url.pathname}): ${err && err.message}`);
      if (isStream) {
        state.streamFailures++;
        state.streamBlockedUntil = Date.now() + 5000 * 2 ** state.streamFailures;
      }
      return jsonResponse(502, { error: "gateway_unreachable" });
    }

    if (res.status === 401 || res.status === 403) {
      state.authError = true;
      onAuthError(res.status);
      return jsonResponse(res.status, { error: "pairing_rejected" });
    }
    if (isStream) {
      if (res.ok) state.streamFailures = 0;
      else {
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

  return { handle, reset, state };
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
      keyStore.save(r.data.key.trim(), { email: r.data.email, name: r.data.name });
      stop();
      onPaired();
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
 * Wire the scheme, proxy and pairing IPC into the Electron app. Only the desk
 * window (getWindow()) may call the javis:* IPC handlers.
 */
function initDeskHost(deps) {
  const { app, ipcMain, session, net, safeStorage, shell, getWindow } = deps;
  const roots = { src: __dirname, assets: path.resolve(__dirname, "..", "assets") };
  const userDataDir = app.getPath("userData");
  const keyStore = createKeyStore({ userDataDir, safeStorage });
  const configStore = createConfigStore({ userDataDir });

  const send = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  const proxy = createFleetProxy({
    keyStore,
    configStore,
    fetchImpl: (url, init) => net.fetch(url, init),
    onAuthError: (status) => send("javis:auth-error", { status }),
    log: (msg) => console.warn(msg),
  });
  const pairing = createPairing({
    keyStore,
    configStore,
    fetchImpl: (url, init) => net.fetch(url, init),
    clientName: `JAVIS Desktop · ${os.hostname()}`,
    onUpdate: (u) => send("javis:pair-update", u),
    onPaired: () => proxy.reset(),
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
    const creds = keyStore.read();
    return {
      paired: !!creds,
      email: creds ? creds.email : "",
      name: creds ? creds.name : "",
      gateway: configStore.getGateway(),
      defaultGateway: DEFAULT_GATEWAY,
      authError: proxy.state.authError,
      encrypted: !!(safeStorage && safeStorage.isEncryptionAvailable()),
    };
  }

  const fromDesk = (event) => {
    const win = getWindow();
    return win && !win.isDestroyed() && event.sender === win.webContents;
  };
  ipcMain.handle("javis:status", (e) => (fromDesk(e) ? status() : null));
  ipcMain.handle("javis:set-gateway", (e, url) => {
    if (!fromDesk(e)) return null;
    try {
      configStore.setGateway(url);
      pairing.stop();
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
    if (!isPlausibleDeviceKey(key)) return { ok: false, error: "invalid_key" };
    keyStore.save(key.trim());
    pairing.stop();
    proxy.reset();
    return { ok: true, status: status() };
  });
  ipcMain.handle("javis:unpair", (e) => {
    if (!fromDesk(e)) return null;
    pairing.stop();
    keyStore.clear();
    proxy.reset();
    return { ok: true, status: status() };
  });

  return {
    status,
    gateway: () => configStore.getGateway(),
    stop: () => pairing.stop(),
  };
}

module.exports = {
  SCHEME,
  ORIGIN,
  DEFAULT_GATEWAY,
  MAX_FAILURES,
  registerJavisScheme,
  initDeskHost,
  __test: { normalizeGateway, isPlausibleDeviceKey, isGatewayPath, resolveStaticPath, createKeyStore, createConfigStore, createFleetProxy, createPairing },
};
