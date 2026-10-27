// Fake "Đăng nhập JAVIS cho máy" gateway side, written from CONTRACT.md v1 (20/10/2026).
// Used by the unit tests (in-process) and by fake-gateway.js (HTTP) for the tester.
// No real mail: email codes go to an in-memory outbox (`outbox`) the test reads.
"use strict";
const crypto = require("crypto");

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const REDIRECT_RE = /^http:\/\/(127\.0\.0\.1|localhost):(\d{1,5})\/cb$/;

function createFakeAuth({ publicBase = "", emailEnabled = true, accessTtl = 3600, now = () => Date.now(), legacyKeys = [] } = {}) {
  const codes = new Map(); // code → { challenge, redirect_uri, exp, used, email }
  const access = new Map(); // sha256(token) → { exp, device, email }
  const refresh = new Map(); // sha256(token) → { device, used, revoked }
  const devices = new Map(); // id → { email, name, revoked }
  const mailCodes = new Map(); // email → { code, exp, wrong, sent: [ts] }
  const legacy = new Set(legacyKeys);
  const outbox = [];
  const log = [];
  const users = new Set(["owner@demo.test"]);
  const opts = { accessTtl, emailEnabled, publicBase };

  function issue(deviceId) {
    const d = devices.get(deviceId);
    const at = "jat_" + b64u(crypto.randomBytes(24));
    const rt = "jrt_" + b64u(crypto.randomBytes(32));
    access.set(sha256(at), { exp: now() + opts.accessTtl * 1000, device: deviceId, email: d.email });
    refresh.set(sha256(rt), { device: deviceId, used: false });
    return {
      access_token: at, token_type: "Bearer", expires_in: opts.accessTtl,
      refresh_token: rt, refresh_expires_in: 7776000, device_id: deviceId,
      user: { email: d.email, name: "Anh Nhựt (giả)" },
    };
  }

  function newDevice(email, name) {
    const id = "dd_" + b64u(crypto.randomBytes(6));
    devices.set(id, { email, name: name || "", revoked: false });
    return id;
  }

  function revokeDevice(id) {
    const d = devices.get(id);
    if (d) d.revoked = true;
    for (const [k, v] of access) if (v.device === id) access.delete(k);
    for (const v of refresh.values()) if (v.device === id) v.revoked = true;
  }

  /** Bearer check for every other /fleet/* call: live access token or a valid old jvk_ key. */
  function authorize(header) {
    const m = /^Bearer\s+(.+)$/.exec(header || "");
    if (!m) return null;
    if (legacy.has(m[1])) return { kind: "legacy" };
    const a = access.get(sha256(m[1]));
    if (!a || a.exp <= now() || devices.get(a.device).revoked) return null;
    return { kind: "access", email: a.email };
  }

  // → { status, body } or null (not an auth route)
  function handle(method, path, b = {}, headers = {}) {
    const res = (status, body) => ({ status, body });
    if (path === "/fleet/auth/desktop/config" && method === "GET") {
      return res(200, { public_base: opts.publicBase || null, email_enabled: opts.emailEnabled });
    }
    if (path === "/fleet/auth/desktop/approve" && method === "POST") {
      // Real gateway: web cookie + CSRF. Fake: the signed-in web user is the owner.
      if (b.client_id !== "javis-desk" || !REDIRECT_RE.test(b.redirect_uri || "") || !b.state || !b.code_challenge) {
        return res(400, { detail: "yêu cầu không hợp lệ" });
      }
      const code = b64u(crypto.randomBytes(18));
      codes.set(code, { challenge: b.code_challenge, redirect_uri: b.redirect_uri, exp: now() + 120 * 1000, used: false, device_name: b.device_name, email: "owner@demo.test" });
      log.push(`approve ${b.device_name}`);
      const u = new URL(b.redirect_uri);
      u.searchParams.set("code", code);
      u.searchParams.set("state", b.state);
      return res(200, { redirect: u.href });
    }
    if (path === "/fleet/auth/desktop/token" && method === "POST") {
      const c = codes.get(b.code);
      if (b.grant_type !== "authorization_code" || b.client_id !== "javis-desk" || !c || c.used || c.exp < now()) return res(400, { detail: "mã không hợp lệ" });
      c.used = true;
      const challenge = b64u(crypto.createHash("sha256").update(String(b.code_verifier || "")).digest());
      if (challenge !== c.challenge || b.redirect_uri !== c.redirect_uri) return res(400, { detail: "PKCE sai" });
      log.push("token authorization_code");
      return res(200, issue(newDevice(c.email, c.device_name)));
    }
    if (path === "/fleet/auth/desktop/email/start" && method === "POST") {
      if (!opts.emailEnabled) return res(503, { detail: "chưa cấu hình gửi mail" });
      const email = String(b.email || "").toLowerCase();
      const rec = mailCodes.get(email) || { sent: [] };
      rec.sent = rec.sent.filter((t) => t > now() - 15 * 60 * 1000);
      if (rec.sent.length >= 3) return res(429, { detail: "Gửi nhiều quá, đợi 15 phút." });
      if (users.has(email)) {
        rec.code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
        rec.exp = now() + 600 * 1000;
        rec.wrong = 0;
        rec.sent.push(now());
        mailCodes.set(email, rec);
        outbox.push({ to: email, code: rec.code });
      }
      log.push(`email/start ${email}`);
      return res(200, { ok: true, expires_in: 600 }); // same answer whether the account exists or not
    }
    if (path === "/fleet/auth/desktop/email/verify" && method === "POST") {
      const email = String(b.email || "").toLowerCase();
      const rec = mailCodes.get(email);
      if (!rec || !rec.code || rec.exp < now()) return res(400, { detail: "Mã đã hết hạn, anh bấm Gửi lại mã nhé." });
      if (rec.code !== String(b.code)) {
        rec.wrong++;
        if (rec.wrong >= 5) rec.code = null;
        return res(400, { detail: "Mã chưa đúng, anh xem lại email nhé." });
      }
      rec.code = null;
      log.push(`email/verify ${email}`);
      return res(200, issue(newDevice(email, b.device_name)));
    }
    if (path === "/fleet/auth/desktop/refresh" && method === "POST") {
      const r = refresh.get(sha256(b.refresh_token || ""));
      if (!r || r.revoked || devices.get(r.device).revoked) return res(401, { detail: "phiên đã bị thu hồi", relogin: true });
      if (r.used) {
        // Reuse of a rotated refresh token → revoke the whole device chain.
        revokeDevice(r.device);
        return res(401, { detail: "refresh dùng lại, đã thu hồi", relogin: true });
      }
      r.used = true;
      log.push("refresh");
      return res(200, issue(r.device));
    }
    if (path === "/fleet/auth/desktop/revoke" && method === "POST") {
      const r = refresh.get(sha256(b.refresh_token || ""));
      const m = /^Bearer\s+(.+)$/.exec(headers.authorization || "");
      const a = m && access.get(sha256(m[1]));
      const dev = (r && r.device) || (a && a.device);
      if (dev) revokeDevice(dev);
      log.push("revoke");
      return res(200, { ok: true });
    }
    return null;
  }

  return {
    handle, authorize, outbox, log, opts, legacy,
    // test controls
    expireAccess: () => { for (const v of access.values()) v.exp = 0; },
    revokeAll: () => { for (const id of devices.keys()) revokeDevice(id); },
    lastMailCode: (email) => { for (let i = outbox.length - 1; i >= 0; i--) if (outbox[i].to === email) return outbox[i].code; return null; },
  };
}

/** fetch() over the fake: auth routes + a protected GET /fleet/whoami. */
function fakeFetch(fake, { calls = [] } = {}) {
  return async (url, init = {}) => {
    const u = new URL(url);
    const h = {};
    const src = init.headers || {};
    if (typeof src.forEach === "function") src.forEach((v, k) => { h[k.toLowerCase()] = v; });
    else for (const [k, v] of Object.entries(src)) h[k.toLowerCase()] = v;
    let body = {};
    if (init.body) {
      const text = typeof init.body === "string" ? init.body : Buffer.from(init.body).toString("utf8");
      try { body = JSON.parse(text); } catch {}
    }
    const method = init.method || "GET";
    calls.push({ method, path: u.pathname, auth: h.authorization || "", body });
    let r = fake.handle(method, u.pathname, body, h);
    if (!r) {
      const who = fake.authorize(h.authorization);
      r = who ? { status: 200, body: { ok: true, who } } : { status: 401, body: { detail: "unauthorized" } };
    }
    const text = JSON.stringify(r.body);
    return new Response(text, { status: r.status, headers: { "Content-Type": "application/json" } });
  };
}

module.exports = { createFakeAuth, fakeFetch, REDIRECT_RE };
