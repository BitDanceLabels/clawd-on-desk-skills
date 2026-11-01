// JAVIS OS: app registry, Spotlight app search, inbox unread/banners, webview auth guards.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const apps = require("../src/os/apps");
const { createInboxWatch } = require("../src/os/inbox-watch");
const { __test: host } = require("../src/os-host");

const GW = "https://server-google-vscode.tail88b7de.ts.net:18110";

test("Dock has the 9 owner apps in order, CRM is the central one", () => {
  assert.deepStrictEqual(apps.DOCK_APPS.map((a) => a.id), ["giao-viec", "crm", "ban-viec", "kho", "nhac", "media", "ban-hang", "bao-cao", "may"]);
  assert.strictEqual(apps.getApp("crm").module, "hop-thu-chung");
  assert.ok(apps.getApp("crm").central);
});

test("every app id is unique and embeds a module or a static page", () => {
  const ids = apps.ALL_APPS.map((a) => a.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const a of apps.ALL_APPS) {
    assert.ok(a.module || a.path, a.id);
    assert.ok(Array.isArray(a.tint) && a.tint.length === 2, a.id);
  }
});

test("appUrl: module link on the gateway, only whitelisted props", () => {
  assert.strictEqual(apps.appUrl(GW + "/", apps.getApp("crm")), `${GW}/?module=hop-thu-chung`);
  assert.strictEqual(apps.appUrl(GW, apps.getApp("crm"), { conv: "hv_0123456789", token: "x", evil: "1" }), `${GW}/?module=hop-thu-chung&conv=hv_0123456789`);
  assert.strictEqual(apps.appUrl(GW, apps.getApp("may")), `${GW}/ops/tai-may.html`);
  assert.strictEqual(apps.appUrl("", apps.getApp("crm")), "");
});

test("Spotlight finds apps with or without diacritics and by keywords", () => {
  const top = (q) => (apps.searchApps(q)[0] || {}).app?.id;
  assert.strictEqual(top("hộp thư"), "crm");
  assert.strictEqual(top("hop thu"), "crm");
  assert.strictEqual(top("inbox"), "crm");
  assert.strictEqual(top("zalo"), "crm");
  assert.strictEqual(top("ban viec"), "ban-viec");
  assert.strictEqual(top("nhạc"), "nhac");
  assert.strictEqual(top("gpu"), "may");
  assert.deepStrictEqual(apps.searchApps(""), []);
});

test("inbox watch: first load only learns, later customer messages become banners", () => {
  const w = createInboxWatch();
  const row = (id, at, extra = {}) => ({ id, last_at: at, unread: 1, last_dir: "in", name: "Chị Lan", account_name: "Page N77", preview: "Shop ơi còn hàng không?", ...extra });
  let r = w.apply({ counts: { chua_doc: 2 }, rows: [row("hv_aaaaaaaaaa", 100), row("hv_bbbbbbbbbb", 90)] });
  assert.strictEqual(r.unread, 2);
  assert.strictEqual(r.fresh.length, 0);
  r = w.apply({ counts: { chua_doc: 3 }, rows: [row("hv_aaaaaaaaaa", 100), row("hv_bbbbbbbbbb", 120), row("hv_cccccccccc", 130, { name: "Anh Tú" })] });
  assert.strictEqual(r.unread, 3);
  assert.deepStrictEqual(r.fresh.map((n) => n.conv), ["hv_cccccccccc", "hv_bbbbbbbbbb"]);
  assert.strictEqual(r.fresh[0].title, "Anh Tú");
  assert.strictEqual(r.fresh[1].subtitle, "Page N77");
});

test("inbox watch: our own reply, read rows, test rows and bad ids are not news", () => {
  const w = createInboxWatch();
  w.apply({ rows: [{ id: "hv_aaaaaaaaaa", last_at: 1, unread: 1, last_dir: "in" }] });
  const r = w.apply({ rows: [
    { id: "hv_aaaaaaaaaa", last_at: 5, unread: 1, last_dir: "out" },
    { id: "hv_bbbbbbbbbb", last_at: 6, unread: 0, last_dir: "in" },
    { id: "hv_cccccccccc", last_at: 7, unread: 1, last_dir: "in", test: true },
    { id: "../evil", last_at: 8, unread: 1, last_dir: "in" },
  ] });
  assert.strictEqual(r.fresh.length, 0);
  assert.strictEqual(r.unread, 1);
});

test("inbox watch: at most 3 banners at once, the rest counted", () => {
  const w = createInboxWatch();
  w.apply({ rows: [] });
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: `hv_00000000${10 + i}`, last_at: 10 + i, unread: 1, last_dir: "in" }));
  const r = w.apply({ rows });
  assert.strictEqual(r.fresh.length, 3);
  assert.strictEqual(r.more, 2);
});

test("webviews may only show the JAVIS web", () => {
  assert.ok(host.isAllowedWebUrl(`${GW}/?module=studio`, GW));
  assert.ok(host.isAllowedWebUrl("https://javis.bumbee.asia/?module=x", GW));
  assert.ok(!host.isAllowedWebUrl("https://evil.example/?module=x", GW));
  assert.ok(!host.isAllowedWebUrl("file:///etc/passwd", GW));
  assert.ok(!host.isAllowedWebUrl(`https://user:pw@server-google-vscode.tail88b7de.ts.net:18110/`, GW));
  assert.ok(!host.isAllowedWebUrl("javascript:alert(1)", GW));
});

test("bearer goes only to the gateway and never overrides the page's own header", () => {
  const h1 = host.withBearer({ Accept: "x" }, `${GW}/fleet/inbox`, GW, "tok");
  assert.strictEqual(h1.Authorization, "Bearer tok");
  const ws = host.withBearer({}, "wss://server-google-vscode.tail88b7de.ts.net:18110/ws", GW, "tok");
  assert.strictEqual(ws.Authorization, "Bearer tok");
  assert.deepStrictEqual(host.withBearer({}, "https://cdn.example/x.js", GW, "tok"), {});
  assert.strictEqual(host.withBearer({ authorization: "Bearer page" }, `${GW}/x`, GW, "tok").Authorization, undefined);
  assert.deepStrictEqual(host.withBearer({}, `${GW}/x`, GW, null), {});
});

test("JAVIS OS UI copy has no 'AI' word (owner rule)", () => {
  const files = ["src/os/os.html", "src/os/os.js", "src/os/apps.js"].map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
  // Visible strings only: Vietnamese copy in quotes / between tags.
  for (const raw of files) {
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/<!--[\s\S]*?-->/g, "");
    const strings = src.match(/(["'`])(?:(?!\1).)*\1|>[^<]+</g) || [];
    for (const s of strings) assert.ok(!/(^|[^A-Za-z])AI([^A-Za-z]|$)/.test(s), `found "AI" in: ${s.slice(0, 80)}`);
  }
});

test("OS page is served from the app scheme", () => {
  const { __test } = require("../src/javis-desk-host");
  const roots = { src: "/R/src", assets: "/R/assets" };
  assert.strictEqual(__test.resolveStaticPath("/os.html", roots), path.join("/R/src", "os", "os.html"));
  assert.strictEqual(__test.resolveStaticPath("/os.bundle.js", roots), path.join("/R/src", "bundles", "os.bundle.js"));
  assert.strictEqual(__test.resolveStaticPath("/os/../main.js", roots), null);
});

test.describe("0.14.0 · JAVIS Agents OS phát hành", () => {
  test.it("package.json version 0.14.0, giữ appId để nâng cấp không mất dữ liệu", () => {
    const pkg = require("../package.json");
    assert.strictEqual(pkg.version, "0.14.0");
    assert.strictEqual(pkg.build.appId, "com.clawd.on-desk");
  });
});
