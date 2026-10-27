// src/javis-auth.js — "Đăng nhập JAVIS" for the desktop app (CONTRACT.md v1, 20/10/2026).
//
// One state machine, one notice: the window and the menu render from getState() only,
// so two contradicting messages can never show at the same time.
//
//   signed_out ──login()──▶ waiting_browser ──/cb?code──▶ signed_in
//        │                        └─ cancel / 5 min ─▶ signed_out
//        └──emailStart()──▶ waiting_code ──emailVerify()──▶ signed_in
//   signed_in ──refresh says relogin/401, or whoami rejects the token──▶ expired ──login()──▶ …
//   signed_out ──autoSignIn() (gateway *.ts.net: the owner's own machine)──▶ signed_in
//
// A 401 from ONE feature (chat, voice, report, clipboard…) is not "session over" (FIX 21/10:
// the app signed in, then a feature answered 401 and the app wiped the session). The session
// ends only when /fleet/auth/desktop/refresh says relogin:true / 401, or /fleet/whoami rejects
// the token we just got. Otherwise the feature shows "chưa có quyền" and the session stays.
//
// Flow A: loopback http://127.0.0.1:<random>/cb + PKCE S256 + state, default browser.
// Flow B: 6-digit code by email.
// refresh_token: encrypted with safeStorage (Keychain on macOS) in userData.
// access_token: memory only; refreshed 5 min before expiry and on a 401.
// Legacy jvk_ device keys keep working until the gateway rejects them.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const CLIENT_ID = "javis-desk";
const SESSION_FILE = "javis-session.json";
const BROWSER_WAIT_MS = 5 * 60 * 1000;
const REFRESH_EARLY_MS = 5 * 60 * 1000;
// Owner rule: at most 3 tries with growing back-off, then stop and say so.
const MAX_TRIES = 3;
const RETRY_BASE_MS = 1000;
const OFFLINE_COOLDOWN_MS = 60 * 1000;
// A feature that keeps answering 401 must not cost a refresh + whoami on every call.
const VERIFY_TTL_MS = 60 * 1000;
const AUTH_LOG_FILE = "javis-auth.log";
const AUTH_LOG_MAX_BYTES = 256 * 1024;
// Silent sign-in over Tailscale: at most 3 tries per app run (open, wake, network change),
// growing gaps; 403/404 = this machine can't use it → stop until the next start.
const TAILNET_MAX_TRIES = 3;
const TAILNET_RETRY_MS = 10 * 1000;

const STATES = ["signed_out", "waiting_browser", "waiting_code", "signed_in", "expired"];

const TEXT = {
  expired: "Phiên đăng nhập đã hết hạn. Anh bấm Đăng nhập JAVIS để vào lại nhé.",
  legacyRejected: "Khoá cũ của máy này không còn dùng được. Anh đăng nhập lại một lần là xong.",
  browserTimeout: "Hết 5 phút mà chưa thấy anh bấm Cho phép. Anh bấm Đăng nhập JAVIS lần nữa nhé.",
  browserDenied: "Anh đã huỷ trên trình duyệt. Muốn vào thì bấm Đăng nhập JAVIS lần nữa nhé.",
  loginFailed: "Đăng nhập chưa xong. Anh bấm Đăng nhập JAVIS thử lại nhé.",
  offline: "Không kết nối được máy chủ JAVIS. Anh kiểm tra mạng (Tailscale) rồi thử lại nhé.",
  badEmail: "Email chưa đúng, anh xem lại giúp em.",
  mailOff: "Máy chủ chưa bật gửi mã qua email. Anh dùng nút Đăng nhập JAVIS nhé.",
  tooMany: "Gửi mã nhiều quá rồi, anh đợi khoảng 15 phút rồi thử lại nhé.",
  badCode: "Mã chưa đúng, anh xem lại email nhé.",
  codeFormat: "Mã gồm 6 chữ số.",
  resent: "Em gửi lại mã rồi, anh xem email nhé.",
};

function isTailnetGateway(url) {
  try { return /\.ts\.net$/i.test(new URL(url).hostname); } catch { return false; }
}

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function createPkce(randomBytes = crypto.randomBytes) {
  const verifier = b64u(randomBytes(48)); // 64 chars, within 43–128
  const challenge = b64u(crypto.createHash("sha256").update(verifier).digest());
  const state = b64u(randomBytes(24)); // 192 bits
  return { verifier, challenge, state };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function isEmail(s) {
  return typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isPlausibleDeviceKey(key) {
  return typeof key === "string" && /^[A-Za-z0-9_.-]{16,512}$/.test(key.trim());
}

// refresh_token on disk: safeStorage-encrypted when the OS has a keychain, otherwise
// owner-only (0600) plain text (headless Linux has no keychain).
function createSessionStore({ userDataDir, safeStorage, fsImpl = fs }) {
  const file = path.join(userDataDir, SESSION_FILE);
  const canEncrypt = () => !!(safeStorage && safeStorage.isEncryptionAvailable());

  function read() {
    try {
      const data = JSON.parse(fsImpl.readFileSync(file, "utf8"));
      let refresh = null;
      if (data.enc && canEncrypt()) refresh = safeStorage.decryptString(Buffer.from(data.enc, "base64"));
      else if (typeof data.plain === "string") refresh = data.plain;
      return refresh ? { refresh, email: data.email || "", name: data.name || "", deviceId: data.deviceId || "" } : null;
    } catch {
      return null;
    }
  }

  function save(refresh, meta = {}) {
    const record = { v: 1, email: meta.email || "", name: meta.name || "", deviceId: meta.deviceId || "", savedAt: Date.now() };
    if (canEncrypt()) record.enc = safeStorage.encryptString(refresh).toString("base64");
    else record.plain = refresh;
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

// Never write a secret to the log: tokens (jvd_/jvr_/jvk_/jat_…), Bearer values, codes, verifiers.
function redact(text) {
  return String(text)
    .replace(/\b(jv[a-z]|ja[a-z]|jr[a-z])_[A-Za-z0-9._~+/=-]+/g, "$1_***")
    .replace(/\b(Bearer)\s+\S+/gi, "$1 ***")
    .replace(/((?:code|code_verifier|refresh_token|access_token|state|token)=)[^&\s]+/gi, "$1***")
    .replace(/("(?:code|code_verifier|refresh_token|access_token|token)"\s*:\s*")[^"]*"/gi, '$1***"');
}

/** userData/javis-auth.log: sign-in / refresh / 401 trail for diagnosis (no tokens). */
function createAuthLog({ userDataDir, fsImpl = fs, now = () => Date.now(), maxBytes = AUTH_LOG_MAX_BYTES, mirror = () => {} }) {
  const file = path.join(userDataDir, AUTH_LOG_FILE);
  const { rotatedAppend } = require("./log-rotate");
  return Object.assign((msg) => {
    const line = `${new Date(now()).toISOString()} ${redact(msg)}`;
    try { mirror(line); } catch {}
    try {
      fsImpl.mkdirSync(userDataDir, { recursive: true });
      rotatedAppend(file, line + "\n", maxBytes);
    } catch {}
  }, { file });
}

function callbackPage(ok, text) {
  const color = ok ? "#8fe3a8" : "#ffcf7a";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>JAVIS</title></head>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#070916;color:#F3F1EA;font:16px system-ui,sans-serif">
<div style="text-align:center;max-width:420px;padding:24px"><h1 style="color:${color};font-size:22px">${ok ? "Xong rồi!" : "Chưa xong"}</h1><p>${text}</p></div></body></html>`;
}

/**
 * deps:
 *   fetchImpl(url, init)       — Electron net.fetch (fake in tests)
 *   getGateway()               — API base (CONTRACT: Tailscale gateway by default)
 *   sessionStore, legacyStore  — refresh token store / old jvk_ key store ({read, save, clear})
 *   openExternal(url)          — shell.openExternal
 *   deviceName                 — shown on the web approval page
 *   onChange(state)            — every state change (window + menu re-render)
 *   onExpired(state)           — once per "session expired" transition (re-show login, gentle note)
 */
function createAuth(deps) {
  const {
    fetchImpl, getGateway, sessionStore, legacyStore, openExternal = async () => {},
    deviceName = "JAVIS Desktop", onChange = () => {}, onExpired = () => {},
    now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)), randomBytes = crypto.randomBytes,
    createServer = http.createServer, log = () => {},
  } = deps;

  let st = { state: "signed_out", kind: null, email: "", name: "", notice: "", pendingEmail: "", autoSigningIn: false };
  let access = null; // { token, expiresAt }
  let refreshing = null;
  let refreshTimer = null;
  let offlineUntil = 0;
  let pending = null; // flow A: { server, timer, pkce, redirectUri, url, prev }
  let cfgCache = null;
  // "token|path" → when whoami last accepted the token after a 401 on that path. A feature that
  // keeps refusing does not cost a whoami per call; a 401 on another path is checked right away.
  const verified = new Map();
  let verifying = null; // { token, p } — one whoami in flight per token

  function snapshot() {
    return { ...st, signedIn: st.state === "signed_in" };
  }

  function set(next) {
    const wasIn = st.state === "signed_in";
    st = { ...st, notice: "", ...next };
    if (!STATES.includes(st.state)) throw new Error(`bad state ${st.state}`);
    try { onChange(snapshot(), { wasIn }); } catch (err) { log(`JAVIS: auth onChange failed: ${err && err.stack}`); }
  }

  function init() {
    const s = sessionStore.read();
    if (s) {
      st = { ...st, state: "signed_in", kind: "oauth", email: s.email, name: s.name, notice: "" };
    } else {
      const k = legacyStore && legacyStore.read();
      if (k) st = { ...st, state: "signed_in", kind: "legacy", email: k.email || "", name: k.name || "", notice: "" };
    }
    return snapshot();
  }

  async function postJson(pathname, body, headers = {}) {
    const res = await fetchImpl(getGateway() + pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Javis-Client": "javis-desktop", ...headers },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, data: data || {} };
  }

  // GET /fleet/auth/desktop/config → { public_base, email_enabled }. Asked once; falls back
  // to the gateway itself.
  async function config() {
    if (cfgCache) return cfgCache;
    const gw = getGateway();
    try {
      const res = await fetchImpl(gw + "/fleet/auth/desktop/config", { method: "GET", headers: { Accept: "application/json" } });
      const data = res.ok ? await res.json() : {};
      let base = gw;
      try {
        if (data.public_base) {
          const u = new URL(data.public_base);
          if (u.protocol === "https:" || u.protocol === "http:") base = data.public_base.replace(/\/+$/, "");
        }
      } catch {}
      cfgCache = { publicBase: base, emailEnabled: data.email_enabled !== false };
    } catch {
      return { publicBase: gw, emailEnabled: true };
    }
    return cfgCache;
  }

  // ── tokens ──
  function scheduleRefresh() {
    if (refreshTimer) clearTimer(refreshTimer);
    refreshTimer = null;
    if (!access) return;
    const wait = Math.max(10 * 1000, access.expiresAt - REFRESH_EARLY_MS - now());
    refreshTimer = setTimer(() => { refreshTimer = null; void refresh(); }, wait);
    if (refreshTimer && refreshTimer.unref) refreshTimer.unref();
  }

  function applyTokens(data) {
    if (!data || typeof data.access_token !== "string" || typeof data.refresh_token !== "string") return false;
    const user = data.user || {};
    const prev = sessionStore.read();
    const email = user.email || (prev && prev.email) || st.email || st.pendingEmail || "";
    const name = user.name || (prev && prev.name) || "";
    sessionStore.save(data.refresh_token, { email, name, deviceId: data.device_id || (prev && prev.deviceId) || "" });
    // One sign-in at a time: the new account replaces an old jvk_ key.
    if (legacyStore) legacyStore.clear();
    access = { token: data.access_token, expiresAt: now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 };
    verified.clear();
    offlineUntil = 0;
    set({ state: "signed_in", kind: "oauth", email, name, pendingEmail: "" });
    scheduleRefresh();
    return true;
  }

  function expire(notice = TEXT.expired, why = "") {
    log(`auth: session expired (${why || "unknown"})`);
    access = null;
    verified.clear();
    if (refreshTimer) { clearTimer(refreshTimer); refreshTimer = null; }
    if (st.kind === "legacy" && legacyStore) legacyStore.clear();
    sessionStore.clear();
    if (st.state === "expired") return;
    set({ state: "expired", kind: null, notice, pendingEmail: "" });
    try { onExpired(snapshot()); } catch (err) { log(`JAVIS: auth onExpired failed: ${err && err.stack}`); }
  }

  // POST /fleet/auth/desktop/refresh. One refresh at a time; network/5xx: 3 tries then stop
  // (and no new try for a minute). 401 / relogin:true → expired.
  function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const s = sessionStore.read();
      if (!s) { if (st.kind === "oauth") expire(); return null; }
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        let r = null;
        try {
          r = await postJson("/fleet/auth/desktop/refresh", { refresh_token: s.refresh, client_id: CLIENT_ID });
        } catch (err) {
          log(`JAVIS: refresh failed (${attempt}/${MAX_TRIES}): ${err && err.message}`);
        }
        if (r && r.ok && applyTokens(r.data)) { log("auth: refresh ok"); return access.token; }
        if (r && (r.data.relogin || r.status === 401)) {
          expire(TEXT.expired, `refresh ${r.status}${r.data.relogin ? " relogin" : ""}`);
          return null;
        }
        if (r && r.status >= 400 && r.status < 500) {
          // Not "relogin": keep the session, stop asking for a minute.
          log(`auth: refresh rejected ${r.status} without relogin, keep session`);
          break;
        }
        if (r) log(`auth: refresh failed ${r.status} (${attempt}/${MAX_TRIES})`);
        if (attempt < MAX_TRIES) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      }
      offlineUntil = now() + OFFLINE_COOLDOWN_MS;
      return null;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  /** Bearer for the gateway, or null (not signed in / offline). */
  async function token() {
    if (st.kind === "legacy") {
      const k = legacyStore && legacyStore.read();
      return k ? k.key : null;
    }
    if (st.kind !== "oauth") return null;
    if (access && now() < access.expiresAt - REFRESH_EARLY_MS) return access.token;
    if (now() < offlineUntil) return access && now() < access.expiresAt ? access.token : null;
    return refresh();
  }

  // GET /fleet/whoami with `used`: false only when the gateway says this token is dead
  // (401 or authenticated:false). Offline / 5xx → assume alive. One check per token+path per minute.
  function verifySession(used, where = "") {
    const key = `${used}|${where}`;
    if (now() - (verified.get(key) || -Infinity) < VERIFY_TTL_MS) return Promise.resolve(true);
    if (verifying && verifying.token === used) return verifying.p;
    const p = (async () => {
      let res = null;
      let data = null;
      try {
        res = await fetchImpl(getGateway() + "/fleet/whoami", {
          method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${used}`, "X-Javis-Client": "javis-desktop" },
        });
        try { data = await res.json(); } catch {}
      } catch (err) {
        log(`auth: whoami unreachable (${err && err.message}), keep session`);
        return true;
      }
      const dead = res.status === 401 || (res.ok && data && data.authenticated === false);
      log(`auth: whoami ${res.status}${data && "authenticated" in data ? ` authenticated=${data.authenticated}` : ""} → ${dead ? "token rejected" : "session ok"}`);
      if (!dead) {
        if (verified.size > 50) verified.clear();
        verified.set(key, now());
      }
      return !dead;
    })().finally(() => { if (verifying && verifying.p === p) verifying = null; });
    verifying = { token: used, p };
    return p;
  }

  /**
   * The gateway answered 401 to `used` on `path`. Returns a token to retry once with, or null.
   * null + isSignedIn() → only this feature is refused (show "chưa có quyền", keep the session);
   * null + !isSignedIn() → the session is over (refresh said relogin, or whoami rejected the token).
   */
  async function onUnauthorized(used, { retried = false, path: where = "" } = {}) {
    if (st.state !== "signed_in") return null;
    log(`auth: 401 on ${where || "?"}${retried ? " (after retry)" : ""} kind=${st.kind}`);
    if (st.kind === "legacy") {
      if (!(await verifySession(used, where))) expire(TEXT.legacyRejected, `old key rejected by whoami after 401 on ${where || "?"}`);
      else log(`auth: 401 on ${where || "?"} is a feature refusal, session kept`);
      return null;
    }
    if (access && access.token !== used) return access.token;
    // Is the token itself dead, or does only this feature refuse it?
    if (await verifySession(used, where)) {
      log(`auth: 401 on ${where || "?"} is a feature refusal, session kept`);
      return null;
    }
    if (st.state !== "signed_in") return null;
    if (retried) {
      // whoami rejects the token refresh just gave us: the account/device is gone.
      expire(TEXT.expired, `whoami rejected a fresh token after 401 on ${where || "?"}`);
      return null;
    }
    access = null;
    return refresh(); // relogin:true / 401 → expired; offline → null, session kept
  }

  // ── Flow A: browser + loopback + PKCE ──
  function stopPending() {
    if (!pending) return null;
    const p = pending;
    pending = null;
    if (p.timer) clearTimer(p.timer);
    try { p.server.close(); } catch {}
    return p;
  }

  // Leaving "waiting_browser" without a new session: back to where the user started.
  function backFromWaiting(p, notice = "") {
    const prev = p.prev;
    if (prev.state === "signed_in") set({ ...prev, notice });
    else if (prev.state === "expired" && !notice) set({ state: "expired", kind: null, notice: prev.notice });
    else set({ state: "signed_out", kind: null, notice });
  }

  async function exchangeCode(p, code) {
    let r;
    try {
      r = await postJson("/fleet/auth/desktop/token", {
        grant_type: "authorization_code", code, code_verifier: p.pkce.verifier, redirect_uri: p.redirectUri, client_id: CLIENT_ID,
      });
    } catch (err) {
      log(`auth: code exchange unreachable (${err && err.message})`);
      return { ok: false, notice: TEXT.offline };
    }
    if (r.ok && applyTokens(r.data)) { log("auth: browser sign-in ok (code exchanged)"); return { ok: true }; }
    log(`auth: code exchange failed ${r.status}`);
    return { ok: false, notice: TEXT.loginFailed };
  }

  function handleCallback(p, req, res) {
    const send = (status, ok, text) => {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", Connection: "close" });
      res.end(callbackPage(ok, text));
    };
    let u;
    try { u = new URL(req.url, "http://127.0.0.1"); } catch { return send(400, false, "Liên kết không hợp lệ."); }
    if (req.method !== "GET" || u.pathname !== "/cb") return send(404, false, "Không tìm thấy.");
    // A request without our state is not ours: ignore it, keep waiting.
    if (!safeEqual(u.searchParams.get("state"), p.pkce.state)) return send(400, false, "Liên kết đăng nhập không khớp với máy này.");
    if (pending !== p || p.done) return send(200, true, "Anh quay lại app JAVIS nhé.");
    p.done = true;
    const code = u.searchParams.get("code");
    if (!code) {
      log("auth: browser callback without code (denied)");
      stopPending();
      backFromWaiting(p, TEXT.browserDenied);
      return send(200, false, "Đã huỷ. Anh quay lại app JAVIS nhé.");
    }
    exchangeCode(p, code).then((r) => {
      stopPending();
      if (!r.ok) backFromWaiting(p, r.notice);
      send(200, r.ok, r.ok ? "Máy này đã đăng nhập JAVIS. Anh quay lại app là dùng được luôn." : "Đăng nhập chưa xong. Anh quay lại app bấm thử lại nhé.");
    });
  }

  async function login() {
    const prevPending = stopPending();
    const prev = prevPending ? prevPending.prev : { state: st.state, kind: st.kind, email: st.email, name: st.name, notice: st.notice };
    const cfg = await config();
    const pkce = createPkce(randomBytes);
    const p = { pkce, prev, done: false, server: null, timer: null, redirectUri: "", url: "" };
    p.server = createServer((req, res) => handleCallback(p, req, res));
    try {
      await new Promise((resolve, reject) => {
        p.server.once("error", reject);
        p.server.listen(0, "127.0.0.1", resolve);
      });
    } catch (err) {
      set({ notice: TEXT.loginFailed });
      return { ok: false, error: "loopback_failed" };
    }
    const port = p.server.address().port;
    p.redirectUri = `http://127.0.0.1:${port}/cb`;
    const q = new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: p.redirectUri, state: pkce.state,
      code_challenge: pkce.challenge, code_challenge_method: "S256", device_name: deviceName,
    });
    p.url = `${cfg.publicBase}/auth/desktop?${q}`;
    pending = p;
    p.timer = setTimer(() => {
      if (pending !== p) return;
      stopPending();
      backFromWaiting(p, TEXT.browserTimeout);
    }, BROWSER_WAIT_MS);
    set({ state: "waiting_browser", pendingEmail: "" });
    log(`auth: browser sign-in started (gateway ${getGateway()}, page ${cfg.publicBase})`);
    try { await openExternal(p.url); } catch {}
    return { ok: true, url: p.url, redirectUri: p.redirectUri };
  }

  async function reopenBrowser() {
    if (!pending || st.state !== "waiting_browser") return { ok: false };
    try { await openExternal(pending.url); } catch {}
    return { ok: true };
  }

  function cancel() {
    const p = stopPending();
    if (p) backFromWaiting(p, "");
    else if (st.state === "waiting_code") set({ state: "signed_out", kind: null, pendingEmail: "" });
    else if (st.state === "signed_out" && st.notice) set({});
    return snapshot();
  }

  // ── Flow B: 6-digit code by email ──
  async function emailStart(email) {
    stopPending();
    const e = String(email || "").trim().toLowerCase();
    if (!isEmail(e)) { set({ notice: TEXT.badEmail }); return { ok: false, error: "bad_email" }; }
    let r;
    try {
      r = await postJson("/fleet/auth/desktop/email/start", { email: e, device_name: deviceName });
    } catch {
      set({ notice: TEXT.offline });
      return { ok: false, error: "offline" };
    }
    if (r.status === 503) { set({ notice: TEXT.mailOff }); return { ok: false, error: "mail_off" }; }
    if (r.status === 429) { set({ notice: TEXT.tooMany }); return { ok: false, error: "too_many" }; }
    if (!r.ok) { set({ notice: (r.data && r.data.detail) || TEXT.offline }); return { ok: false, error: `start_${r.status}` }; }
    const resend = st.state === "waiting_code" && st.pendingEmail === e;
    set({ state: "waiting_code", kind: null, pendingEmail: e, notice: resend ? TEXT.resent : "" });
    return { ok: true, expiresIn: Number(r.data.expires_in) || 600 };
  }

  async function emailVerify(code) {
    if (st.state !== "waiting_code") return { ok: false, error: "not_waiting" };
    const c = String(code || "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(c)) { set({ notice: TEXT.codeFormat }); return { ok: false, error: "format" }; }
    let r;
    try {
      r = await postJson("/fleet/auth/desktop/email/verify", { email: st.pendingEmail, code: c, device_name: deviceName });
    } catch {
      set({ notice: TEXT.offline });
      return { ok: false, error: "offline" };
    }
    if (r.ok && applyTokens(r.data)) { log("auth: email sign-in ok"); return { ok: true }; }
    log(`auth: email verify failed ${r.status}`);
    set({ notice: (r.data && r.data.detail) || TEXT.badCode });
    return { ok: false, error: "bad_code" };
  }

  function emailResend() {
    if (st.state !== "waiting_code") return Promise.resolve({ ok: false });
    return emailStart(st.pendingEmail);
  }

  // ── Settings ──
  function useLegacyKey(key) {
    if (!isPlausibleDeviceKey(key)) return { ok: false, error: "invalid_key" };
    stopPending();
    sessionStore.clear();
    access = null;
    legacyStore.save(key.trim());
    set({ state: "signed_in", kind: "legacy", email: "", name: "", pendingEmail: "" });
    return { ok: true };
  }

  async function logout() {
    log("auth: logout");
    stopPending();
    const s = sessionStore.read();
    const bearer = access ? access.token : null;
    access = null;
    if (refreshTimer) { clearTimer(refreshTimer); refreshTimer = null; }
    sessionStore.clear();
    if (legacyStore) legacyStore.clear();
    set({ state: "signed_out", kind: null, email: "", name: "", pendingEmail: "" });
    if (s) {
      // Best effort, one try: the device is forgotten locally either way.
      try {
        await postJson("/fleet/auth/desktop/revoke", { refresh_token: s.refresh, client_id: CLIENT_ID }, bearer ? { Authorization: `Bearer ${bearer}` } : {});
      } catch {}
    }
    return snapshot();
  }

  // ── Silent sign-in over Tailscale ──
  // POST /fleet/auth/desktop/tailnet {client_id, device_name}: the gateway knows the machine by
  // its tailnet identity. Same tokens as the code exchange. 403/404/429 = not available: stay on
  // the "Đăng nhập JAVIS" button, no red notice.
  const tn = { tries: 0, stopped: false, running: null, timer: null };

  function tailnetEligible() {
    return st.state === "signed_out" && !tn.stopped && tn.tries < TAILNET_MAX_TRIES && isTailnetGateway(getGateway());
  }

  function autoSignIn(reason = "start") {
    if (tn.running) return tn.running;
    if (!tailnetEligible()) return Promise.resolve({ ok: false, skipped: true });
    if (tn.timer) { clearTimer(tn.timer); tn.timer = null; }
    tn.running = (async () => {
      tn.tries += 1;
      const n = tn.tries;
      set({ autoSigningIn: true, notice: st.notice });
      let r = null;
      try {
        r = await postJson("/fleet/auth/desktop/tailnet", { client_id: CLIENT_ID, device_name: deviceName });
      } catch (err) {
        log(`auth: tailnet sign-in unreachable (${reason}, ${n}/${TAILNET_MAX_TRIES}): ${err && err.message}`);
      }
      const data = r && r.data;
      if (r && r.ok && data && typeof data.access_token === "string") {
        stopPending();
        const user = data.user || { email: data.email || "", name: data.name || "" };
        if (applyTokens({ ...data, user })) {
          log(`auth: tailnet sign-in ok (${reason})`);
          return { ok: true };
        }
      }
      const status = r ? r.status : 0;
      if (status === 403 || status === 404 || (status >= 400 && status < 500 && status !== 429)) {
        tn.stopped = true;
        log(`auth: tailnet sign-in not available (${status}), button login only until next start`);
      } else if (n >= TAILNET_MAX_TRIES) {
        log(`auth: tailnet sign-in failed ${status || "offline"} (${n}/${TAILNET_MAX_TRIES}), stop until next start`);
      } else {
        // 429 / 5xx / offline: one more try after a growing gap (10 s, 30 s).
        const wait = TAILNET_RETRY_MS * 3 ** (n - 1);
        log(`auth: tailnet sign-in failed ${status || "offline"} (${n}/${TAILNET_MAX_TRIES}), retry in ${wait / 1000}s`);
        tn.timer = setTimer(() => { tn.timer = null; void autoSignIn("retry"); }, wait);
        if (tn.timer && tn.timer.unref) tn.timer.unref();
      }
      return { ok: false, status };
    })().finally(() => {
      tn.running = null;
      if (st.autoSigningIn) set({ autoSigningIn: false, notice: st.notice });
    });
    return tn.running;
  }

  // Gateway URL changed: the old session belongs to the old gateway.
  function resetConfig() { cfgCache = null; }

  function dispose() {
    stopPending();
    if (tn.timer) { clearTimer(tn.timer); tn.timer = null; }
    if (refreshTimer) { clearTimer(refreshTimer); refreshTimer = null; }
  }

  return {
    init, getState: snapshot, config, resetConfig, token, refresh, onUnauthorized,
    login, reopenBrowser, cancel, emailStart, emailVerify, emailResend,
    useLegacyKey, logout, dispose, autoSignIn,
    isSignedIn: () => st.state === "signed_in",
    _pending: () => pending,
  };
}

module.exports = {
  CLIENT_ID, STATES, TEXT, BROWSER_WAIT_MS, TAILNET_MAX_TRIES, TAILNET_RETRY_MS, isTailnetGateway, REFRESH_EARLY_MS, MAX_TRIES, VERIFY_TTL_MS, AUTH_LOG_FILE,
  createAuth, createSessionStore, createAuthLog, redact, createPkce, isEmail, isPlausibleDeviceKey, b64u,
};
