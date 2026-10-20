// Fake JAVIS gateway for the 0.12.0 tester + acceptance video.
// Fake LLM, fake TTS (synthesized WAV), in-memory tasks/tickets/clipboard. No real AI, no network.
//   node fake-gateway.js <port>
//   POST /__add-task {title}   → adds a waiting task + pushes task.updated on /fleet/stream
//   GET  /__log                → request log (method path auth)
"use strict";
const http = require("http");
const port = Number(process.argv[2] || 18999);
const log = [];
const streams = new Set();
let seq = 0;

const now = () => Date.now() / 1000;
const tasks = [
  { id: "idea_lich1111", title: "Duyệt lịch đăng mùa sale 11.11 cho shop hoa", state: "waiting", can_approve: true, importance: "P1", due: "2026-10-22" },
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
    if (p === "/auth/device.html") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end("<h1>Duyệt thiết bị (giả)</h1>"); return; }
    if (p === "/fleet/auth/device/start") return json({ device_code: "dc-demo", user_code: "JAVS-2026", expires_in: 600, interval: 3, verify_url: "/auth/device.html?code=JAVS-2026" });
    if (p === "/fleet/auth/device/poll") return json({ status: "pending" });
    if (!req.headers.authorization) return json({ error: "unauthorized" }, 401);

    if (p === "/fleet/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      res.write(": ok\n\n");
      streams.add(res);
      req.on("close", () => streams.delete(res));
      return;
    }
    if (p === "/fleet/home/tasks") return json({ data: tasks, resuggest: [], approvals: tickets, autodispatch: false, now: now() });
    const ap = p.match(/^\/fleet\/ideas\/([^/]+)\/task\/approve$/);
    if (ap && req.method === "POST") {
      const t = tasks.find((x) => x.id === ap[1]);
      if (!t) return json({ detail: "idea not found" }, 404);
      t.state = "doing"; t.can_approve = false;
      return json({ ...t, routing: { approved_by: b.actor || "owner" } });
    }
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
