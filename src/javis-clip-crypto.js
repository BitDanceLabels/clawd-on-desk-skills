// src/javis-clip-crypto.js — AI Clipboard encryption, same as docs/clipboard/PROTOCOL.md (javis-g1).
//
//   key_id = first 16 hex of SHA-256("javis-clip-kid" + K)
//   ct     = b64u(nonce12 + AES-256-GCM(K, nonce, payload, aad="jclip1:" + key_id) + tag16)
//   payload = {"v":1,"kind":"text|url","mime":"text/plain","name":"","text":"…","src":"<device>","t":<ms>}
// The server only ever sees `ct`. K stays on this computer (safeStorage).
"use strict";

const crypto = require("crypto");

function b64u(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64u(s) {
  const t = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(t + "=".repeat((4 - (t.length % 4)) % 4), "base64");
}

function keyId(K) {
  return crypto.createHash("sha256").update(Buffer.concat([Buffer.from("javis-clip-kid"), Buffer.from(K)])).digest("hex").slice(0, 16);
}

function newKey() {
  return crypto.randomBytes(32);
}

function encryptPayload(K, payload) {
  const kid = keyId(K);
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(K), nonce);
  c.setAAD(Buffer.from("jclip1:" + kid));
  const body = Buffer.concat([c.update(Buffer.from(JSON.stringify(payload), "utf8")), c.final()]);
  return { ct: b64u(Buffer.concat([nonce, body, c.getAuthTag()])), key_id: kid };
}

function decryptPayload(K, ct) {
  const raw = fromB64u(ct);
  if (raw.length < 12 + 16) throw new Error("ct_too_short");
  const nonce = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(12, raw.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(K), nonce);
  d.setAAD(Buffer.from("jclip1:" + keyId(K)));
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(body), d.final()]).toString("utf8"));
}

function textPayload(text, src, now = Date.now()) {
  const s = String(text || "");
  const isUrl = /^https?:\/\/\S+$/i.test(s.trim());
  return { v: 1, kind: isUrl ? "url" : "text", mime: isUrl ? "text/uri-list" : "text/plain", name: "", text: s, src: String(src || "JAVIS Desktop"), t: now };
}

/**
 * Pairing link from a device that already has the clipboard:
 *   https://<host>/clip#p=<code>.<b64u(K)>   or just  <code>.<b64u(K)>
 * Returns { code, K } or null.
 */
function parsePairLink(input) {
  let s = String(input || "").trim();
  if (!s) return null;
  const hash = s.indexOf("#");
  if (hash >= 0) s = s.slice(hash + 1);
  const m = s.match(/(?:^|[&?])?p=([^&\s]+)/);
  if (m) s = m[1];
  try { s = decodeURIComponent(s); } catch {}
  const dot = s.lastIndexOf(".");
  if (dot <= 0) return null;
  const code = s.slice(0, dot);
  const K = fromB64u(s.slice(dot + 1));
  if (K.length !== 32 || !/^[A-Za-z0-9_-]{4,128}$/.test(code)) return null;
  return { code, K };
}

/** Text that looks like a password / API key / OTP: never sent automatically, needs a click. */
function looksSensitive(text) {
  const s = String(text || "").trim();
  if (/^\d{6,8}$/.test(s)) return true; // OTP (4 digits is usually a year/time)
  if (/^(sk|pk|rk|ghp|gho|github_pat|xox[abp]|jvk|jvc|jvm|AKIA)[-_A-Za-z0-9]{12,}$/.test(s)) return true;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s)) return true;
  return false;
}

module.exports = { b64u, fromB64u, keyId, newKey, encryptPayload, decryptPayload, textPayload, parsePairLink, looksSensitive };
