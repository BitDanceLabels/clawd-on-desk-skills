// Trang chủ JAVIS: web page links, machine sessions, chat health (401/403 → plain line).
"use strict";
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { WEB_PAGES, webPageUrl, listMachineSessions, isChatPath, chatHealthFrom } = require("../src/javis-home");
const { __test } = require("../src/javis-companion-host");
const { resolveStaticPath, createKeyStore, createConfigStore, createFleetProxy } = __test;
const { createAuth, createSessionStore } = require("../src/javis-auth");

const tempDirs = [];
afterEach(() => { while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true }); });

describe("Trang chủ · JAVIS OS mở trên web", () => {
  it("has the 4 owner areas with their JAVIS OS deep links", () => {
    assert.deepStrictEqual(WEB_PAGES.map((p) => p.title), ["Bàn làm việc", "Kho tài sản", "Phiên làm việc", "Graph"]);
    assert.strictEqual(webPageUrl("desk"), "https://javis.bumbee.asia/?app=desk");
    assert.strictEqual(webPageUrl("assets"), "https://javis.bumbee.asia/?app=asset-hub");
    assert.strictEqual(webPageUrl("sessions"), "https://javis.bumbee.asia/?app=work-groups");
    assert.strictEqual(webPageUrl("graph"), "https://javis.bumbee.asia/?app=fleet-map");
    assert.strictEqual(webPageUrl("home"), "https://javis.bumbee.asia/");
  });

  it("refuses unknown pages (no arbitrary links)", () => {
    assert.strictEqual(webPageUrl("https://evil.test"), null);
    assert.strictEqual(webPageUrl("nope"), null);
  });
});

describe("Trang chủ · Phiên đang chạy trên máy này", () => {
  it("lists hook sessions busiest first with agent, folder and state", () => {
    const now = 1_000_000;
    const sessions = new Map([
      ["sess-aaaaaa1", { state: "idle", agentId: "codex", cwd: "/Users/n/work/bumbee-mv/", updatedAt: now - 120_000 }],
      ["sess-bbbbbb2", { state: "working", agentId: "claude-code", cwd: "/Users/n/work/javis-g1", sourcePid: 42, updatedAt: now - 5_000 }],
      ["sess-cccccc3", { state: "thinking", agentId: "gemini-cli", cwd: "", host: "mac-mini", headless: true, updatedAt: now }],
    ]);
    const rows = listMachineSessions(sessions, now);
    assert.deepStrictEqual(rows.map((r) => r.agent), ["Claude Code", "Gemini", "Codex"]);
    assert.strictEqual(rows[0].folder, "javis-g1");
    assert.strictEqual(rows[0].stateText, "đang làm");
    assert.strictEqual(rows[0].canFocus, true);
    assert.strictEqual(rows[0].ago, 5);
    assert.strictEqual(rows[0].key, "bbbbb2");
    assert.strictEqual(rows[1].host, "mac-mini");
    assert.strictEqual(rows[1].headless, true);
    assert.strictEqual(rows[2].folder, "bumbee-mv");
    assert.strictEqual(rows[2].canFocus, false);
  });

  it("is empty without sessions", () => {
    assert.deepStrictEqual(listMachineSessions(new Map()), []);
    assert.deepStrictEqual(listMachineSessions(null), []);
  });
});

describe("Trang chủ · chat 401/403 không bế tắc", () => {
  it("knows the chat requests of <javis-companion>", () => {
    for (const p of ["/fleet/chat", "/fleet/chat/messages", "/fleet/chat/active", "/fleet/voice/chat"]) assert.ok(isChatPath(p), p);
    for (const p of ["/fleet/stream", "/fleet/voice/tts", "/fleet/desk/pending", "/fleet/chatty"]) assert.ok(!isChatPath(p), p);
  });

  it("maps answers to chat health", () => {
    assert.deepStrictEqual(chatHealthFrom(403), { ok: false, status: 403 });
    assert.deepStrictEqual(chatHealthFrom(401), { ok: false, status: 401 });
    assert.deepStrictEqual(chatHealthFrom(200), { ok: true, status: 200 });
    assert.strictEqual(chatHealthFrom(502), null);
    assert.strictEqual(chatHealthFrom(429), null);
  });

  it("the proxy reports a refused chat, then a working one; other paths say nothing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "javis-home-"));
    tempDirs.push(dir);
    const safeStorage = { isEncryptionAvailable: () => false };
    const keyStore = createKeyStore({ userDataDir: dir, safeStorage });
    keyStore.save("jvk_" + "h".repeat(32));
    const auth = createAuth({
      fetchImpl: async () => { throw new Error("no network in tests"); },
      getGateway: () => "http://gw.test",
      sessionStore: createSessionStore({ userDataDir: dir, safeStorage }),
      legacyStore: keyStore,
    });
    auth.init();
    let answer = 403;
    const reports = [];
    const proxy = createFleetProxy({
      auth,
      configStore: createConfigStore({ userDataDir: dir }),
      fetchImpl: async () => new Response(JSON.stringify({}), { status: answer, headers: { "Content-Type": "application/json" } }),
      onChatStatus: (h) => reports.push(h),
    });
    assert.strictEqual((await proxy.handle(new Request("javis-desk://app/fleet/chat"))).status, 403);
    await proxy.handle(new Request("javis-desk://app/fleet/desk/pending"));
    answer = 200;
    await proxy.handle(new Request("javis-desk://app/fleet/chat/messages", { method: "POST", body: "{}" }));
    assert.deepStrictEqual(reports, [
      { ok: false, status: 403, path: "/fleet/chat" },
      { ok: true, status: 200, path: "/fleet/chat/messages" },
    ]);
  });

  it("serves the Home script from javis-desk://app", () => {
    const roots = { src: "/src", assets: "/assets" };
    assert.strictEqual(resolveStaticPath("/javis-home-page.js", roots), path.join("/src", "javis-home-page.js"));
    assert.strictEqual(resolveStaticPath("/javis-home.js", roots), null);
  });

  it("serves the shared 'Cần anh duyệt' card (ui/javis-ask-box.js) and nothing else under ui/", () => {
    const roots = { src: "/src", assets: "/assets" };
    assert.strictEqual(resolveStaticPath("/ui/javis-ask-box.js", roots), path.join("/assets", "javis-companion", "ui", "javis-ask-box.js"));
    assert.strictEqual(resolveStaticPath("/ui/javis-ask-box2.js", roots), null);
    assert.strictEqual(resolveStaticPath("/ui/../package.json", roots), null);
  });
});
