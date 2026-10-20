// src/javis-clip.js — AI Clipboard in the desktop app (quick paste + recent items).
//
// Talks to /fleet/clip/* with the JAVIS device key (a jvk_ key counts as the logged-in
// owner there). Items are encrypted here with the clipboard key K before they leave
// the computer; K is stored with safeStorage and never goes to the server or a renderer.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("./javis-clip-crypto");

const KEY_FILE = "javis-clip-key.json";

function createClipKeyStore({ userDataDir, safeStorage, fsImpl = fs }) {
  const file = path.join(userDataDir, KEY_FILE);
  function read() {
    try {
      const d = JSON.parse(fsImpl.readFileSync(file, "utf8"));
      let b64 = null;
      if (d.enc && safeStorage && safeStorage.isEncryptionAvailable()) b64 = safeStorage.decryptString(Buffer.from(d.enc, "base64"));
      else if (typeof d.plain === "string") b64 = d.plain;
      const K = b64 ? crypto.fromB64u(b64) : null;
      return K && K.length === 32 ? K : null;
    } catch { return null; }
  }
  function save(K) {
    const b64 = crypto.b64u(K);
    const rec = { v: 1, key_id: crypto.keyId(K), savedAt: Date.now() };
    if (safeStorage && safeStorage.isEncryptionAvailable()) rec.enc = safeStorage.encryptString(b64).toString("base64");
    else rec.plain = b64;
    fsImpl.mkdirSync(userDataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fsImpl.writeFileSync(tmp, JSON.stringify(rec), { encoding: "utf8", mode: 0o600 });
    fsImpl.renameSync(tmp, file);
  }
  function clear() { try { fsImpl.unlinkSync(file); } catch {} }
  return { read, save, clear, file };
}

const ERRORS = {
  409: "Khoá Clipboard trên máy này không khớp. Dán lại link ghép từ máy đang dùng Clipboard.",
  413: "Nội dung quá lớn (tối đa 2 MB).",
  423: "AI Clipboard đang tạm dừng. Bật lại trên trang Clipboard.",
  429: "Gửi nhanh quá, anh đợi một chút rồi gửi lại.",
};

/**
 * @param deps.client     gateway client ({ request, isPaired })
 * @param deps.keys       createClipKeyStore(...)
 * @param deps.deviceName shown as "src" on other devices
 */
function createClip({ client, keys, deviceName = "JAVIS Desktop", now = Date.now }) {
  async function status() {
    if (!client.isPaired()) return { state: "not_paired" };
    let r;
    try { r = await client.request("GET", "/fleet/clip/state"); } catch { return { state: "offline" }; }
    if (r.status === 401) return { state: "not_paired", rejected: true };
    if (r.status !== 200) return { state: "offline", error: `gateway_${r.status}` };
    const serverKid = r.data.key_id || null;
    const K = keys.read();
    const localKid = K ? crypto.keyId(K) : null;
    const devices = Array.isArray(r.data.devices) ? r.data.devices.length : 0;
    const paused = !!(r.data.settings && r.data.settings.paused);
    if (!serverKid) return { state: "no_clipboard", devices, paused };
    if (localKid !== serverKid) return { state: "need_key", devices, paused };
    return { state: "ready", devices, paused, keyId: serverKid };
  }

  /** First device ever: create the clipboard key here. */
  async function create() {
    const st = await status();
    if (st.state !== "no_clipboard") return { ok: false, error: st.state };
    const K = crypto.newKey();
    const r = await client.request("POST", "/fleet/clip/init", { key_id: crypto.keyId(K) });
    if (r.status !== 200 && r.status !== 201) return { ok: false, error: (r.data && r.data.detail) || `gateway_${r.status}` };
    keys.save(K);
    return { ok: true };
  }

  /** Paste the pairing link from a device that already uses the clipboard (…/clip#p=CODE.KEY). */
  async function linkKey(link) {
    const parsed = crypto.parsePairLink(link);
    if (!parsed) return { ok: false, error: "Link ghép không đúng. Trên máy đang dùng Clipboard: Thêm máy → Chép link." };
    const r = await client.request("GET", "/fleet/clip/state");
    if (r.status !== 200) return { ok: false, error: `gateway_${r.status}` };
    if (r.data.key_id && r.data.key_id !== crypto.keyId(parsed.K)) {
      return { ok: false, error: "Link này thuộc Clipboard của tài khoản khác." };
    }
    keys.save(parsed.K);
    return { ok: true };
  }

  async function send(text) {
    const s = String(text || "");
    if (!s.trim()) return { ok: false, error: "Chưa có gì để gửi." };
    const K = keys.read();
    if (!K) return { ok: false, error: "need_key" };
    const { ct, key_id } = crypto.encryptPayload(K, crypto.textPayload(s, deviceName, now()));
    const r = await client.request("POST", "/fleet/clip/items", { ct, key_id });
    if (r.status === 200 || r.status === 201) return { ok: true, id: r.data && (r.data.id || (r.data.item && r.data.item.id)) };
    return { ok: false, status: r.status, error: ERRORS[r.status] || (r.data && r.data.detail) || `gateway_${r.status}` };
  }

  async function recent(limit = 10) {
    const K = keys.read();
    if (!K) return { ok: false, error: "need_key", items: [] };
    const r = await client.request("GET", `/fleet/clip/items?limit=${Math.max(1, Math.min(50, limit))}`);
    if (r.status !== 200) return { ok: false, error: `gateway_${r.status}`, items: [] };
    const items = [];
    for (const it of (r.data.items || []).slice(0, limit)) {
      if (!it.ct) { items.push({ id: it.id, kind: "file", text: "", big: true, size: it.size, at: it.created_at, pinned: !!it.pinned }); continue; }
      try {
        const p = crypto.decryptPayload(K, it.ct);
        items.push({ id: it.id, kind: p.kind, text: p.kind === "text" || p.kind === "url" ? String(p.text || "") : (p.name || p.kind),
          src: p.src || it.device_name || "", at: it.created_at, pinned: !!it.pinned });
      } catch {
        items.push({ id: it.id, kind: "locked", text: "", at: it.created_at, pinned: !!it.pinned });
      }
    }
    return { ok: true, items };
  }

  return { status, create, linkKey, send, recent };
}

module.exports = { KEY_FILE, createClipKeyStore, createClip, ERRORS };
