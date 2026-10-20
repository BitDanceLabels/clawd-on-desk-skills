// Fake JAVIS gateway for the 0.12.0 tester + acceptance video.
// Fake LLM, fake TTS (synthesized WAV), in-memory tasks/tickets/clipboard. No real AI, no network.
//   node fake-gateway.js <port>
//   POST /__add-task {title}   → adds a waiting task + pushes task.updated on /fleet/stream
//   GET  /__log                → request log (method path auth)
//   GET  /__mail               → fake outbox (email codes; no real mail is sent)
//   POST /__expire-access      → every access token expires (next call: 401 → refresh)
//   POST /__revoke-all         → every device revoked (refresh answers relogin:true)
//   POST /__revoke-legacy      → old jvk_ keys rejected
//   POST /__rate-limit {n}     → the next n GET /fleet/desk/pending answer 429 (Retry-After: 60)
// CONTRACT.md v1.1: machine tokens only READ GET /fleet/desk/pending; /fleet/home/tasks stays 401
// for them and every approve route answers 403.
"use strict";
const http = require("http");
const { createFakeAuth } = require("./fake-auth");
const port = Number(process.argv[2] || 18999);
// "Đăng nhập JAVIS" per CONTRACT.md. The tester's old jvk_ key is valid until /__revoke-legacy.
const auth = createFakeAuth({ legacyKeys: ["jvk_FAKEFAKEFAKEFAKEFAKEFAKE"], accessTtl: Number(process.env.FAKE_ACCESS_TTL || 3600) });
const log = [];
const streams = new Set();
let seq = 0;
let rateLimit = 0;

const now = () => Date.now() / 1000;
const tasks = [
  { id: "idea_lich1111", title: "Duyệt lịch đăng mùa sale 11.11 cho shop hoa", state: "waiting", can_approve: true, importance: "P1", due: Date.parse("2026-10-22T17:00:00+07:00") / 1000 },
  { id: "idea_thumbmv", title: "Chốt thumbnail MV The N77 Quantum", state: "waiting", can_approve: true, importance: "P2" },
  { id: "idea_kichban", title: "Kịch bản trực inbox cho tiệm bánh", state: "doing", can_approve: false },
  { id: "idea_pitch", title: "Cập nhật số liệu pitch nhà đầu tư", state: "waiting", can_approve: false, importance: "P2" },
];
const tickets = [
  { id: "tk_ads200", title: "Chi 200.000đ chạy thử quảng cáo TikTok", state: "open", urgent: false, link: null,
    items: [{ n: 1, question: "Cho chi 200k?" }, { n: 2, question: "Đăng từ tài khoản shop?" }] },
];
const clip = { key_id: null, items: [], devices: [{ id: "cd_iphone", name: "iPhone của anh", platform: "iphone" }] };
// CLIP_SEED_K=<b64u key>: the account already has a clipboard with one item sent from the iPhone.
if (process.env.CLIP_SEED_K) {
  const c = require(process.env.CLIP_CRYPTO || "../src/javis-clip-crypto");
  const K = c.fromB64u(process.env.CLIP_SEED_K);
  clip.key_id = c.keyId(K);
  const e = c.encryptPayload(K, c.textPayload("Địa chỉ giao hoa: 12 Nguyễn Huệ, Q1 — giao trước 9h sáng mai", "iPhone của anh", Date.now()));
  clip.items.push({ id: "ci_0000000000000iph", seq: 1, device_id: "cd_iphone", size: e.ct.length, created_at: Date.now() / 1000 - 300, pinned: true, ct: e.ct });
}

// "TTS giả": a voiced, syllable-like WAV (no real TTS service).
function fakeSpeechWav(text) {
  const sr = 16000;
  const secs = Math.min(20, Math.max(2, String(text).split(/\s+/).length / 2.6));
  const n = Math.floor(sr * secs);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const syl = Math.max(0, Math.sin(2 * Math.PI * 4.2 * t)) ** 0.6;
    const pause = (t % 3.1) > 2.7 ? 0 : 1;
    const f0 = 190 + 25 * Math.sin(2 * Math.PI * 0.8 * t);
    const v = (Math.sin(2 * Math.PI * f0 * t) + 0.5 * Math.sin(4 * Math.PI * f0 * t) + 0.25 * Math.sin(6 * Math.PI * f0 * t)) * 0.28 * syl * pause;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
  }
  return buf;
}

// The web approval page (CONTRACT luồng A bước 3). The real one sits behind the web login.
function approvePage(q) {
  const esc = (v) => String(v || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const body = JSON.stringify({ client_id: q.get("client_id"), redirect_uri: q.get("redirect_uri"), state: q.get("state"), code_challenge: q.get("code_challenge"), device_name: q.get("device_name") });
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>JAVIS · Cho phép máy</title></head>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0e22;color:#F3F1EA;font:16px system-ui,sans-serif">
<div style="text-align:center;max-width:420px;padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:#141833">
<p style="color:#A9AECB;margin:0 0 6px">javis.bumbee.asia · owner@demo.test</p>
<h1 style="font-size:20px;margin:0 0 18px">Cho phép máy <b>${esc(q.get("device_name"))}</b> dùng JAVIS của anh?</h1>
<button id="allow" style="height:46px;padding:0 22px;border:0;border-radius:12px;background:#F5B83D;font:600 16px system-ui;cursor:pointer">Cho phép máy này</button>
<button id="deny" style="height:46px;padding:0 18px;margin-left:8px;border-radius:12px;border:1px solid #555;background:none;color:#ddd;font:16px system-ui">Huỷ</button>
</div><script>
const req = ${body};
document.getElementById("allow").onclick = async () => {
  const r = await fetch("/fleet/auth/desktop/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  const j = await r.json();
  location.href = j.redirect;
};
document.getElementById("deny").onclick = () => { location.href = req.redirect_uri + "?error=access_denied&state=" + encodeURIComponent(req.state); };
</script></body></html>`;
}

// GET /fleet/desk/pending body: exactly the 7 contract fields, urgent first then nearest due.
function deskPending() {
  const items = [
    ...tasks.filter((t) => t.state !== "done").map((t) => ({ id: t.id, title: t.title.slice(0, 140), kind: "task", status: t.state,
      due: typeof t.due === "number" ? t.due : null, urgency: t.importance === "P0" || t.importance === "P1" ? "high" : "normal",
      link: `https://javis.bumbee.asia/?task=${encodeURIComponent(t.id)}` })),
    ...tickets.filter((k) => k.state === "open").map((k) => ({ id: k.id, title: k.title.slice(0, 140), kind: "approval", status: "pending",
      due: null, urgency: k.urgent ? "high" : "normal", link: `https://javis.bumbee.asia/?ticket=${encodeURIComponent(k.id)}` })),
  ];
  const rank = (i) => (i.urgency === "high" ? 0 : 1);
  items.sort((a, b) => rank(a) - rank(b) || (a.due || Infinity) - (b.due || Infinity));
  return { items: items.slice(0, 50), total: items.length, scope: "home", at: now() };
}

function push(type, data) {
  const ev = { id: ++seq, type, data, at: now() };
  for (const res of streams) res.write(`id: ${ev.id}\nevent: ${type}\ndata: ${JSON.stringify(ev)}\n\n`);
}

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    log.push(`${req.method} ${p} auth=${req.headers.authorization ? "yes" : "no"}`);
    const json = (o, st = 200) => { res.writeHead(st, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(o)); };
    let b = {};
    try { b = body ? JSON.parse(body) : {}; } catch {}
    if (p === "/__log") { res.end(log.join("\n")); return; }
    if (p === "/__add-task") {
      const id = "idea_new" + seq;
      tasks.unshift({ id, title: b.title || "Việc mới cần anh duyệt", state: "waiting", can_approve: true, importance: "P1" });
      push("task.updated", { idea_id: id });
      return json({ ok: true, id });
    }
    if (p === "/__mail") return json(auth.outbox);
    if (p === "/__rate-limit") { rateLimit = Number(b.n || 1); return json({ ok: true }); }
    if (p === "/__streams") return json({ open: streams.size });
    if (p === "/__auth-log") return json(auth.log);
    if (p === "/__expire-access") { auth.expireAccess(); return json({ ok: true }); }
    if (p === "/__revoke-all") { auth.revokeAll(); return json({ ok: true }); }
    if (p === "/__revoke-legacy") { auth.legacy.clear(); return json({ ok: true }); }
    if (p === "/auth/desktop") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(approvePage(url.searchParams)); return; }
    const a = auth.handle(req.method, p, b, req.headers);
    if (a) return json(a.body, a.status);
    if (!auth.authorize(req.headers.authorization)) return json({ detail: "unauthorized" }, 401);

    if (p === "/fleet/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      res.write(": ok\n\n");
      streams.add(res);
      res.on("close", () => streams.delete(res));
      return;
    }
    if (p === "/fleet/desk/pending" && req.method === "GET") {
      if (rateLimit > 0) {
        rateLimit--;
        res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
        res.end(JSON.stringify({ detail: "quá 30 lần/phút" }));
        return;
      }
      return json(deskPending());
    }
    // Machine tokens: the owner's Home list stays closed, nothing can be approved.
    if (p === "/fleet/home/tasks") return json({ detail: "unauthorized" }, 401);
    if (req.method === "POST" && /\/approve$/.test(p)) return json({ detail: "duyệt trên web" }, 403);
    if (p === "/fleet/report/morning") {
      const t = now();
      return json({
        completed: [{ title: "Bài Học viện: 5 mẹo dùng AI Clipboard", state: "completed", updated_at: t - 3600 },
          { title: "Bộ ảnh sản phẩm cho tiệm hoa", state: "completed", updated_at: t - 7200 }],
        running: [{ title: "Lô bài hit tuần 43", state: "in_progress" }, { title: "Video demo pitch 3 phút", state: "in_progress" }],
        stalled: [{ title: "Build bản Mac đã ký", state: "blocked" }],
        waiting_owner: [{ title: "Duyệt lịch đăng mùa sale 11.11 cho shop hoa", state: "waiting_owner" }],
        reminders_today: [{ text: "15 giờ gọi chị Lan về đơn hoa khai trương", due_at: t + 3600, done: false }],
        generated_at: t,
      });
    }
    if (p === "/fleet/voice/tts" && req.method === "POST") {
      const wav = fakeSpeechWav(b.text || b.input || "");
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length });
      res.end(wav);
      return;
    }
    if (p === "/fleet/chat") return json({ active: "s-demo", sessions: [{ id: "s-demo", title: "Phiên chung với web", count: 2 }],
      session: { messages: [
        { id: "u1", role: "user", text: "JAVIS ơi, hôm nay còn việc gì chờ anh?" },
        { id: "a1", role: "assistant", text: "Dạ anh, còn 3 việc chờ duyệt và 1 phiếu chi 200k. (trả lời giả để kiểm giao diện)" },
      ] } });
    if (p.startsWith("/fleet/chat/")) return json({ ok: true, messages: [] });
    if (p.startsWith("/fleet/voice/chat")) { res.writeHead(200, { "Content-Type": "text/event-stream" }); res.end('data: {"delta":"Dạ, (LLM giả) em nhận rồi."}\n\ndata: [DONE]\n\n'); return; }

    // AI Clipboard (stores only ciphertext, like the real one)
    if (p === "/fleet/clip/state") return json({ user: "owner", key_id: clip.key_id, settings: { ttl_h: 24, paused: false }, devices: clip.devices, seq: clip.items.length });
    if (p === "/fleet/clip/init" && req.method === "POST") { clip.key_id = b.key_id; return json({ key_id: clip.key_id }); }
    if (p === "/fleet/clip/items" && req.method === "POST") {
      if (b.key_id !== clip.key_id) return json({ detail: "sai key_id" }, 409);
      const it = { id: "ci_" + String(clip.items.length).padStart(16, "0"), seq: clip.items.length + 1, device_id: "cd_desk", size: b.ct.length, created_at: now(), pinned: false, ct: b.ct };
      clip.items.unshift(it);
      return json(it, 201);
    }
    if (p === "/fleet/clip/items") return json({ items: clip.items.slice(0, Number(url.searchParams.get("limit") || 50)), seq: clip.items.length });
    return json({ error: "nf" }, 404);
  });
}).listen(port, "127.0.0.1", () => console.log("fake gateway on", port));

module.exports = { fakeSpeechWav };
