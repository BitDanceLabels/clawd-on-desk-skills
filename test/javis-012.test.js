// 0.12.0 — Vietnamese menu, Việc chờ anh, Thư ký đọc báo cáo, AI Clipboard, layout.
// Everything runs against fakes: no gateway, no LLM, no TTS service is called.
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");

const i18n = require("../src/i18n");
const inboxMod = require("../src/javis-inbox");
const report = require("../src/javis-report");
const voice = require("../src/javis-voice");
const clipCrypto = require("../src/javis-clip-crypto");
const { createClip, createClipKeyStore } = require("../src/javis-clip");
const layout = require("../src/window-layout");
const host = require("../src/javis-companion-host");
const tools = require("../src/javis-desk-tools");

// ── fakes ──
function fakeTimers() {
  const q = [];
  return {
    setTimer: (fn, ms) => { const t = { fn, ms }; q.push(t); return t; },
    clearTimer: (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); },
    q,
    async runNext() { const t = q.shift(); if (t) await t.fn(); return t; },
  };
}

function fakeClient(routes) {
  const calls = [];
  return {
    calls,
    isPaired: () => true,
    async request(method, p, body) {
      calls.push({ method, path: p, body });
      const h = routes[`${method} ${p.split("?")[0]}`];
      if (!h) return { status: 404, data: {} };
      return typeof h === "function" ? h(body, p) : h;
    },
  };
}

const HOME = {
  data: [
    { id: "idea_a", title: "Duyệt lịch đăng 11.11", state: "waiting", can_approve: true, importance: "P1", due: "2026-10-21" },
    { id: "idea_b", title: "Viết kịch bản inbox", state: "doing", can_approve: false },
    { id: "idea_c", title: "Chốt thumbnail MV", state: "waiting", can_approve: false, importance: "P2" },
    { id: "idea_d", title: "Đã xong", state: "done" },
  ],
  approvals: [
    { id: "tk_1", title: "Chi 200k chạy thử quảng cáo", state: "open", urgent: false, items: [{ n: 1 }, { n: 2 }] },
    { id: "tk_2", title: "Đã quyết", state: "approved" },
  ],
};

describe("1 · Menu tiếng Việt", () => {
  it("Vietnamese has every key English has, Chinese falls back to English", () => {
    const en = Object.keys(i18n.i18n.en);
    for (const k of en) assert.ok(i18n.i18n.vi[k], `vi missing ${k}`);
    assert.strictEqual(i18n.translate("zh", "inbox"), "📋 待你处理");
    assert.strictEqual(i18n.translate("xx", "quit"), "Thoát");
  });

  it("Vietnamese strings carry no stray English words (proper names allowed)", () => {
    const allowed = /\b(JAVIS|Hiyori|Live2D|VRM|Claude|Code|Dock|Bumbee|OS|Telegram|Gateway|gateway|Clawdbot|AI|Clipboard|POST|chat|skills|trigger|VieNeu|Codex|Ctrl|Shift|Alt|url|state|endpoint|n|version|shortcut)\b/g;
    const english = /\b(the|and|Mode|Open|Show|Hide|Check|Update|Start|Settings|Download|Later|Restart|Error|Sessions?|Size|Language|Quit|Wake|Sleep|Character|Pair|About|Status|Reload|Folder|Register|Bubble|Ghost|Rabbit|Interval|Now|Small|Medium|Large|Add|Local|Working|Thinking|Idle|ago|just|Waiting|Read|Stop|Off|More|Vocabulary)\b/;
    for (const [k, v] of Object.entries(i18n.i18n.vi)) {
      const stripped = String(v).replace(/\{[a-z]+\}/g, "").replace(allowed, "");
      assert.ok(!english.test(stripped), `vi.${k} still English: ${v}`);
    }
  });

  it("defaults to Vietnamese; old 'en' (the previous default) moves to vi once, zh is kept", () => {
    assert.strictEqual(i18n.langFromPrefs(null), "vi");
    assert.strictEqual(i18n.langFromPrefs({ lang: "en" }), "vi");
    assert.strictEqual(i18n.langFromPrefs({ lang: "zh" }), "zh");
    assert.strictEqual(i18n.langFromPrefs({ lang: "en", langV: 2 }), "en");
    assert.strictEqual(i18n.langFromPrefs({ lang: "klingon", langV: 2 }), "vi");
  });

  it("menu, updater and session strings are all looked up through i18n", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "menu.js"), "utf8");
    assert.ok(src.includes('require("./i18n")'));
    assert.ok(src.includes('"Tiếng Việt"'));
    assert.ok(!/buttons: \["OK"\]/.test(src), "OK buttons are translated");
    for (const key of ["updateAvailableMsg", "updateReadyMsg", "sessionMinAgo", "noSessions"]) {
      assert.ok(/[à-ỹ]/i.test(i18n.i18n.vi[key]), `${key} is Vietnamese`);
    }
  });

  it("permission bubble speaks Vietnamese by default", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "src", "bubble.html"), "utf8");
    assert.ok(html.includes('id="btnAllow">Cho phép<'));
    assert.ok(html.includes('L(data.lang, "Xin quyền"'));
  });
});

describe("2 · Việc chờ anh", () => {
  it("summarizes /fleet/home/tasks: waiting tasks + open tickets, one line each", () => {
    const s = inboxMod.summarizeHome(HOME);
    assert.deepStrictEqual(s.items.map((i) => i.id), ["idea_a", "idea_c", "tk_1"]);
    assert.strictEqual(s.count, 3);
    assert.strictEqual(s.approvable, 1);
    const tk = s.items.find((i) => i.id === "tk_1");
    assert.strictEqual(tk.canApprove, false, "owner tickets are decided on the web only");
    assert.strictEqual(tk.webUrl, "https://javis.bumbee.asia/?ticket=tk_1");
    assert.strictEqual(tk.questions, 2);
  });

  it("only notifies for new items, never on first load, while sleeping or hidden", () => {
    assert.deepStrictEqual(inboxMod.newItemIds(new Set(["task:idea_a"]), [{ kind: "task", id: "idea_a" }, { kind: "ticket", id: "tk_9" }]), ["ticket:tk_9"]);
    assert.strictEqual(inboxMod.shouldNotify({ newCount: 2, firstLoad: false, doNotDisturb: false, petHidden: false }), true);
    assert.strictEqual(inboxMod.shouldNotify({ newCount: 2, firstLoad: true, doNotDisturb: false, petHidden: false }), false);
    assert.strictEqual(inboxMod.shouldNotify({ newCount: 2, firstLoad: false, doNotDisturb: true, petHidden: false }), false);
    assert.strictEqual(inboxMod.shouldNotify({ newCount: 2, firstLoad: false, doNotDisturb: false, petHidden: true }), false);
  });

  it("refresh → approve (POST /fleet/ideas/<id>/task/approve) removes the line", async () => {
    const client = fakeClient({ "GET /fleet/home/tasks": { status: 200, data: HOME }, "POST /fleet/ideas/idea_a/task/approve": { status: 200, data: {} } });
    const news = [];
    const box = inboxMod.createInbox({ client, isPaired: () => true, onNew: (n) => news.push(n), ...fakeTimers() });
    const s1 = await box.refresh();
    assert.strictEqual(s1.count, 3);
    assert.strictEqual(news[0].firstLoad, true);
    const r = await box.approve("idea_a");
    assert.deepStrictEqual(r, { ok: true });
    assert.strictEqual(box.snapshot().count, 2);
    assert.deepStrictEqual(client.calls.at(-1), { method: "POST", path: "/fleet/ideas/idea_a/task/approve", body: { actor: "owner", via: "desktop" } });
    // a ticket cannot be approved from the app
    assert.strictEqual((await box.approve("tk_1")).error, "not_found");
  });

  it("403 on approve sends the owner to the web instead of unpairing", async () => {
    const client = fakeClient({ "GET /fleet/home/tasks": { status: 200, data: HOME }, "POST /fleet/ideas/idea_a/task/approve": { status: 403, data: {} } });
    const box = inboxMod.createInbox({ client, isPaired: () => true, ...fakeTimers() });
    await box.refresh();
    const r = await box.approve("idea_a");
    assert.strictEqual(r.error, "web_only");
    assert.ok(r.webUrl.startsWith("https://javis.bumbee.asia/"));
  });

  it("network errors: 3 tries with growing back-off, then stop until a real event", async () => {
    let n = 0;
    const client = fakeClient({ "GET /fleet/home/tasks": () => { n++; return { status: 502, data: {} }; } });
    const timers = fakeTimers();
    const box = inboxMod.createInbox({ client, isPaired: () => true, ...timers });
    await box.refresh();
    assert.strictEqual(timers.q[0].ms, 10000);
    await timers.runNext();
    assert.strictEqual(timers.q[0].ms, 20000);
    await timers.runNext();
    assert.strictEqual(n, 3);
    assert.strictEqual(timers.q.length, 0, "no 4th try scheduled");
    assert.strictEqual(box.state.stoppedUntilEvent, true);
    await box.refresh({ reason: "manual" }); // user opens the window = real event
    assert.strictEqual(n, 4);
  });

  it("not paired → no network call, empty list (window shows the 3-step guide)", async () => {
    const client = fakeClient({});
    const box = inboxMod.createInbox({ client, isPaired: () => false, ...fakeTimers() });
    const s = await box.refresh();
    assert.strictEqual(s.paired, false);
    assert.strictEqual(client.calls.length, 0);
    const html = fs.readFileSync(path.join(__dirname, "..", "src", "javis-inbox.html"), "utf8");
    assert.strictEqual((html.match(/<li><b>/g) || []).length, 3);
    assert.ok(html.includes("Mở trang duyệt trên web"));
  });

  it("SSE parser picks task/ticket events from /fleet/stream; stream stops after 3 failures", async () => {
    const feed = inboxMod.createSseParser();
    const evs = [...feed("id: 1\nevent: task.updated\ndata: {\"a\":1}\n\n: ping\n\nevent: pi"), ...feed("ng\ndata: {}\n\n")];
    assert.deepStrictEqual(evs.map((e) => e.event), ["task.updated", "ping"]);
    assert.strictEqual(inboxMod.isInboxEvent(evs[0]), true);
    assert.strictEqual(inboxMod.isInboxEvent(evs[1]), false);
    assert.strictEqual(inboxMod.isInboxEvent({ event: "message", data: '{"type":"coordinator.ticket"}' }), true);

    const timers = fakeTimers();
    let opens = 0;
    const w = inboxMod.createStreamWatcher({ openStream: async () => { opens++; throw new Error("down"); }, onEvent: () => {}, ...timers });
    w.start();
    await new Promise((r) => setImmediate(r));
    await timers.runNext();
    await new Promise((r) => setImmediate(r));
    await timers.runNext();
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(opens, 3);
    assert.strictEqual(w.isRunning(), false);
    assert.strictEqual(timers.q.length, 0);
  });
});

describe("3 · Thư ký đọc báo cáo", () => {
  const now = new Date(2026, 9, 20, 8, 0).getTime();
  it("short report with sections, under 90 seconds", () => {
    const r = report.buildReportSpeech({
      now,
      morning: {
        completed: [{ title: "Bài học viện mẹo AI", updated_at: now / 1000 - 3600 }, { title: "Rất cũ", updated_at: now / 1000 - 9 * 86400 }],
        running: [{ title: "MV The N77" }],
        stalled: [{ title: "Build Mac" }],
        waiting_owner: [{ title: "Duyệt lịch đăng 11.11" }],
        reminders_today: [{ text: "Gọi chị Lan 15h" }],
      },
      inbox: inboxMod.summarizeHome(HOME),
    });
    assert.ok(r.seconds <= 90, `${r.seconds}s`);
    assert.match(r.text, /^Chào anh\. Báo cáo hôm nay, thứ Ba, ngày 20 tháng 10\./);
    assert.match(r.text, /Chờ anh duyệt 3 việc: Duyệt lịch đăng 11\.11; Chốt thumbnail MV; Chi 200k/);
    assert.ok(!r.text.includes("Rất cũ"), "only goals finished in the last 24h");
    assert.match(r.text, /Nhắc việc hôm nay 1 việc: Gọi chị Lan 15h\./);
  });

  it("huge day still fits in 90 seconds", () => {
    const many = (p, n) => Array.from({ length: n }, (_, i) => ({ title: `${p} số ${i} với một cái tên rất dài để kiểm tra cắt bớt cho vừa thời gian đọc báo cáo` }));
    const r = report.buildReportSpeech({ now, morning: { completed: many("Xong", 40), running: many("Chạy", 40), stalled: many("Kẹt", 40), waiting_owner: many("Chờ", 40), reminders_today: many("Nhắc", 40) } });
    assert.ok(r.seconds <= 90, `${r.seconds}s`);
    assert.match(r.text, /và \d+ việc khác/);
  });

  it("empty day and speakable titles", () => {
    assert.match(report.buildReportSpeech({ now, morning: {} }).text, /chưa có việc nào cần báo/);
    assert.strictEqual(report.speakable("🚀 **Deploy** idea_8be66d05dc14 https://x.y/z ok."), "Deploy ok");
  });

  it("voice order: bsay (Mac) → gateway TTS → system voice", () => {
    assert.deepStrictEqual(voice.voicePlan({ bsayPath: "/opt/homebrew/bin/bsay", paired: true }), ["bsay", "gateway", "system"]);
    assert.deepStrictEqual(voice.voicePlan({ bsayPath: null, paired: true }), ["gateway", "system"]);
    assert.deepStrictEqual(voice.voicePlan({ bsayPath: null, paired: false }), ["system"]);
    assert.strictEqual(voice.findBsay({ platform: "linux", exists: () => true }), null);
    assert.strictEqual(voice.findBsay({ platform: "darwin", home: "/Users/n", exists: (p) => p === "/usr/local/bin/bsay" }), "/usr/local/bin/bsay");
  });

  function fakeSpawnOk(log) {
    return (bin, args) => {
      const p = new EventEmitter();
      p.kill = () => { log.push("kill"); p.emit("exit", null); };
      log.push([bin, ...args]);
      setImmediate(() => p.emit("spawn"));
      return p;
    };
  }

  it("bsay present: spawns bsay with the VieNeu voice, she mouths along, stop kills it", async () => {
    const log = [];
    const sent = [];
    const sp = voice.createSpeaker({ spawn: fakeSpawnOk(log), findBsay: () => "/opt/homebrew/bin/bsay", isPaired: () => true,
      fetchTts: async () => { throw new Error("must not be called"); }, toCharacter: (c, p) => sent.push(p) });
    const r = await sp.speak("Chào anh", { seconds: 2 });
    assert.deepStrictEqual(r, { ok: true, engine: "bsay" });
    assert.deepStrictEqual(log[0], ["/opt/homebrew/bin/bsay", "-v", "Phạm Tuyên", "Chào anh"]);
    assert.strictEqual(sent[0].action, "mouth");
    assert.strictEqual(sp.stop(), true);
    assert.ok(log.includes("kill"));
    assert.strictEqual(sent.at(-1).action, "stop");
    assert.strictEqual(sp.isSpeaking(), false);
  });

  it("no bsay: gateway WAV goes to the character window for real lip-sync; TTS down → system voice", async () => {
    const sent = [];
    const wav = new ArrayBuffer(2000);
    const sp = voice.createSpeaker({ spawn: () => { throw new Error("no"); }, findBsay: () => null, isPaired: () => true,
      fetchTts: async (text) => ({ status: 200, buffer: wav, contentType: "audio/wav", text }), toCharacter: (c, p) => sent.push(p) });
    assert.strictEqual((await sp.speak("Xin chào")).engine, "gateway");
    assert.strictEqual(sent.at(-1).action, "audio");
    assert.strictEqual(sent.at(-1).audio, wav);
    sp.ended(sent.at(-1).id);
    assert.strictEqual(sp.isSpeaking(), false);

    const sent2 = [];
    const sp2 = voice.createSpeaker({ spawn: () => { throw new Error("no"); }, findBsay: () => null, isPaired: () => true,
      fetchTts: async () => ({ status: 503, buffer: null }), toCharacter: (c, p) => sent2.push(p) });
    assert.strictEqual((await sp2.speak("Xin chào")).engine, "system");
    assert.deepStrictEqual({ a: sent2.at(-1).action, lang: sent2.at(-1).lang }, { a: "system", lang: "vi-VN" });
  });

  it("character window lip-syncs: Live2D mouth parameter + speech renderer wired", () => {
    const l2d = fs.readFileSync(path.join(__dirname, "..", "src", "live2d-renderer.js"), "utf8");
    assert.ok(l2d.includes('setParameterValueById("ParamMouthOpenY"'));
    const idx = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
    assert.ok(idx.includes("javis-speech-renderer.js") && idx.includes('id="javis-note"'));
  });
});

describe("4 · AI Clipboard", () => {
  const K = Buffer.from([...Array(32).keys()]);

  it("decrypts an item made by the reference Python agent (javis_clip.py) and round-trips", () => {
    const [kid, ct] = fs.readFileSync(path.join(__dirname, "fixtures", "clip-vector.txt"), "utf8").trim().split("\n");
    assert.strictEqual(clipCrypto.keyId(K), kid);
    assert.strictEqual(clipCrypto.decryptPayload(K, ct).text, "Xin chào anh Nhựt");
    const e = clipCrypto.encryptPayload(K, clipCrypto.textPayload("https://bumbee.asia", "test", 1));
    const p = clipCrypto.decryptPayload(K, e.ct);
    assert.deepStrictEqual([p.kind, p.text, e.key_id], ["url", "https://bumbee.asia", kid]);
    assert.throws(() => clipCrypto.decryptPayload(Buffer.alloc(32, 7), e.ct));
  });

  it("parses pairing links and flags passwords / OTP", () => {
    const link = `https://javis.bumbee.asia/clip#p=ABCD1234.${clipCrypto.b64u(K)}`;
    assert.deepStrictEqual(clipCrypto.parsePairLink(link).K, K);
    assert.strictEqual(clipCrypto.parsePairLink(`ABCD1234.${clipCrypto.b64u(K)}`).code, "ABCD1234");
    assert.strictEqual(clipCrypto.parsePairLink("https://x/clip#p=abc.short"), null);
    assert.strictEqual(clipCrypto.looksSensitive("482913"), true);
    assert.strictEqual(clipCrypto.looksSensitive("2026"), false);
    assert.strictEqual(clipCrypto.looksSensitive("sk-ant-abcdefghijklmnopqrstuvwxyz"), true);
    assert.strictEqual(clipCrypto.looksSensitive("Họp lúc 3 giờ"), false);
  });

  function fakeClipServer() {
    const st = { key_id: null, items: [], devices: [{ id: "cd_1" }] };
    const client = fakeClient({
      "GET /fleet/clip/state": () => ({ status: 200, data: { key_id: st.key_id, devices: st.devices, settings: { paused: false } } }),
      "POST /fleet/clip/init": (b) => { st.key_id = b.key_id; return { status: 200, data: { key_id: b.key_id } }; },
      "POST /fleet/clip/items": (b) => {
        if (b.key_id !== st.key_id) return { status: 409, data: {} };
        st.items.unshift({ id: `ci_${st.items.length}`, ct: b.ct, created_at: 1 });
        return { status: 201, data: { id: st.items[0].id } };
      },
      "GET /fleet/clip/items": () => ({ status: 200, data: { items: st.items } }),
    });
    return { st, client };
  }

  it("status → create → send (only ciphertext leaves the computer) → recent", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jclip-"));
    const { st, client } = fakeClipServer();
    const keys = createClipKeyStore({ userDataDir: dir, safeStorage: null });
    const clip = createClip({ client, keys, deviceName: "Test PC" });
    assert.strictEqual((await clip.status()).state, "no_clipboard");
    assert.deepStrictEqual(await clip.create(), { ok: true });
    assert.strictEqual((await clip.status()).state, "ready");
    assert.strictEqual(fs.statSync(keys.file).mode & 0o777, 0o600);
    const r = await clip.send("Mật mã hôm nay là bí mật");
    assert.strictEqual(r.ok, true);
    const body = JSON.stringify(client.calls.find((c) => c.method === "POST" && c.path === "/fleet/clip/items").body);
    assert.ok(!body.includes("bí mật"), "server never sees plaintext");
    const rec = await clip.recent();
    assert.deepStrictEqual(rec.items.map((i) => [i.text, i.src]), [["Mật mã hôm nay là bí mật", "Test PC"]]);
    assert.strictEqual(st.items.length, 1);
  });

  it("joins an existing clipboard by pairing link, refuses a link from another account", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jclip-"));
    const { st, client } = fakeClipServer();
    st.key_id = clipCrypto.keyId(K);
    const clip = createClip({ client, keys: createClipKeyStore({ userDataDir: dir, safeStorage: null }) });
    assert.strictEqual((await clip.status()).state, "need_key");
    const bad = await clip.linkKey(`https://x/clip#p=ZZZZ1111.${clipCrypto.b64u(Buffer.alloc(32, 9))}`);
    assert.strictEqual(bad.ok, false);
    assert.deepStrictEqual(await clip.linkKey(`https://x/clip#p=ZZZZ1111.${clipCrypto.b64u(K)}`), { ok: true });
    assert.strictEqual((await clip.status()).state, "ready");
  });

  it("shortcut ⌘⇧⌥V by default, labels per OS, unknown values fall back", () => {
    assert.strictEqual(tools.DEFAULT_CLIP_SHORTCUT, "CommandOrControl+Shift+Alt+V");
    assert.strictEqual(tools.shortcutLabel(tools.DEFAULT_CLIP_SHORTCUT, "darwin"), "⌘⇧⌥V");
    assert.strictEqual(tools.shortcutLabel(tools.DEFAULT_CLIP_SHORTCUT, "win32"), "Ctrl+Shift+Alt+V");
    assert.strictEqual(tools.normalizeClipShortcut("Alt+F4"), tools.DEFAULT_CLIP_SHORTCUT);
    assert.strictEqual(tools.normalizeClipShortcut(""), "");
  });
});

describe("5 · Cửa sổ không đè nhau + ghép đôi dễ hơn", () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  it("vocab panel steps aside from the chat window", () => {
    const chat = { x: 980, y: 100, width: 440, height: 780 };
    const panel = { x: 1044, y: 104, width: 380, height: 780 };
    assert.ok(layout.overlaps(chat, panel));
    const spot = layout.placeAvoiding(panel, [chat], area);
    assert.ok(spot);
    const moved = { ...panel, ...spot };
    assert.ok(!layout.overlaps(moved, chat));
    assert.ok(layout.inside(moved, area));
    assert.ok(spot.x + panel.width <= chat.x, "goes to the left of the chat");
  });

  it("stays put when free; null (hide until chat closes) when there is no room", () => {
    const panel = { x: 10, y: 10, width: 300, height: 300 };
    assert.deepStrictEqual(layout.placeAvoiding(panel, [{ x: 800, y: 0, width: 400, height: 400 }], area), { x: 10, y: 10 });
    const small = { x: 0, y: 0, width: 800, height: 600 };
    assert.strictEqual(layout.placeAvoiding({ x: 0, y: 0, width: 500, height: 500 }, [{ x: 0, y: 0, width: 800, height: 600 }], small), null);
  });

  it("pairing screen shows 3 numbered steps and an 'open approval page on the web' button", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "src", "javis-chat.html"), "utf8");
    for (const s of ["Bước 1 · Lấy mã ghép đôi", "Bước 2 · Mở trang duyệt trên web", 'Bước 3 · Bấm "Duyệt" trên web']) assert.ok(html.includes(s), s);
    assert.ok(html.includes('id="btn-pair-open">Mở trang duyệt trên web<'));
  });

  it("serves the new tool pages from javis-desk://app and nothing else", () => {
    const roots = { src: "/S", assets: "/A" };
    const r = host.__test.resolveStaticPath;
    assert.strictEqual(r("/inbox.html", roots), path.join("/S", "javis-inbox.html"));
    assert.strictEqual(r("/clip.html", roots), path.join("/S", "javis-clip.html"));
    assert.strictEqual(r("/secretary.html", roots), path.join("/S", "javis-secretary.html"));
    assert.strictEqual(r("/javis-clip-page.js", roots), path.join("/S", "javis-clip-page.js"));
    assert.strictEqual(r("/javis-tools.css", roots), path.join("/S", "javis-tools.css"));
    assert.strictEqual(r("/javis-clip.js", roots), null, "main-process module is not served");
    assert.strictEqual(r("/../main.js", roots), null);
  });

  it("gateway client: 401 stops every later call; 403 does not unpair", async () => {
    let calls = 0;
    let status = 403;
    const state = { authError: false };
    const auth = [];
    const c = host.__test.createGatewayClient({
      keyStore: { read: () => ({ key: "jvk_FAKEFAKEFAKEFAKE" }) },
      configStore: { getGateway: () => "http://gw.test" },
      fetchImpl: async (url, init) => { calls++; assert.strictEqual(init.headers.Authorization, "Bearer jvk_FAKEFAKEFAKEFAKE"); return { status, ok: false, headers: new Map(), json: async () => ({}) }; },
      proxyState: state,
      onAuthError: (s) => auth.push(s),
    });
    assert.strictEqual((await c.request("POST", "/fleet/ideas/x/task/approve", {})).status, 403);
    assert.strictEqual(state.authError, false);
    status = 401;
    await c.request("GET", "/fleet/home/tasks");
    assert.strictEqual(state.authError, true);
    assert.deepStrictEqual(auth, [401]);
    await c.request("GET", "/fleet/home/tasks");
    assert.strictEqual(calls, 2, "no call after 401");
    assert.strictEqual(c.isPaired(), false);
  });
});
