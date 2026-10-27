// 0.13.1: the 0.12.4 pieces (silent tailnet sign-in, gateway updater, in-app "Cần anh duyệt",
// focus guard, network recovery) wired into the minimal 0.13 desk. Fake Electron + fake
// gateway: no network, no real token, no AI call.
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const deskHost = require("../src/javis-desk-host");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TS_GW = "https://server-google-vscode.tail88b7de.ts.net:18110";

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

function fakeElectron({ answer }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "javis-0131-"));
  const handlers = new Map();
  const sent = [];
  const calls = [];
  const resets = [];
  const powerMonitor = new EventEmitter();
  const webContents = { send: (ch, p) => sent.push([ch, p]) };
  const win = { isDestroyed: () => false, webContents };
  let protocolHandler = null;
  const deps = {
    app: { getPath: () => dir },
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
    session: {
      defaultSession: {
        protocol: { handle: (_s, fn) => { protocolHandler = fn; } },
        closeAllConnections: async () => resets.push("close"),
        clearHostResolverCache: async () => resets.push("dns"),
      },
    },
    net: {
      fetch: async (url, init) => {
        calls.push({ url, body: init && init.body ? String(init.body) : "", auth: init && init.headers ? new Headers(init.headers).get("authorization") : null });
        return answer(url, init, calls.length);
      },
    },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
    shell: { openExternal: async () => {} },
    powerMonitor,
    getWindow: () => win,
  };
  const saved = process.env.JAVIS_GATEWAY_URL;
  process.env.JAVIS_GATEWAY_URL = TS_GW;
  cleanups.push(() => {
    if (saved === undefined) delete process.env.JAVIS_GATEWAY_URL; else process.env.JAVIS_GATEWAY_URL = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const ipc = (ch, ...args) => handlers.get(ch)({ sender: webContents }, ...args);
  return { deps, sent, calls, resets, powerMonitor, ipc, dir, protocol: (req) => protocolHandler(req) };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const TOKENS = { access_token: "jat_ACCESS", refresh_token: "jvr_REFRESH", expires_in: 3600, email: "nhut@demo.test", name: "Nhựt" };
const tick = () => new Promise((r) => setImmediate(r));

describe("0.13.1 · máy trong tailnet tự đăng nhập, không còn bước ghép đôi", () => {
  it("mở app → POST /fleet/auth/desktop/tailnet → đã kết nối; trang nhận 'approved' via tailnet; proxy dùng token", async () => {
    const env = fakeElectron({
      answer: (url) => {
        if (url.endsWith("/fleet/auth/desktop/tailnet")) return json(200, TOKENS);
        return json(200, { items: [] });
      },
    });
    const host = deskHost.initDeskHost(env.deps);
    cleanups.push(() => host.stop());
    await tick(); await tick();
    const first = env.calls[0];
    assert.strictEqual(first.url, TS_GW + "/fleet/auth/desktop/tailnet");
    assert.strictEqual(JSON.parse(first.body).client_id, "javis-desk");
    assert.ok(JSON.parse(first.body).device_name);
    const st = await env.ipc("javis:status");
    assert.strictEqual(st.paired, true);
    assert.strictEqual(st.kind, "oauth");
    assert.strictEqual(st.email, "nhut@demo.test");
    const approved = env.sent.filter(([ch, p]) => ch === "javis:pair-update" && p.status === "approved");
    assert.strictEqual(approved.length, 1);
    assert.strictEqual(approved[0][1].via, "tailnet");
    assert.ok(!JSON.stringify(env.sent).includes("jat_ACCESS"), "token không bao giờ tới trang");
    // the page asks for pending work through the same-origin proxy
    const res = await env.protocol(new Request("javis-desk://app/fleet/desk/pending"));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(env.calls.at(-1).auth, "Bearer jat_ACCESS");
  });

  it("tailnet chưa được (403) → không thử lại; QR/khoá vẫn là đường dự phòng (dán khoá → đã kết nối)", async () => {
    const env = fakeElectron({ answer: (url) => (url.endsWith("/tailnet") ? json(403, { detail: "not tailnet" }) : json(200, {})) });
    const host = deskHost.initDeskHost(env.deps);
    cleanups.push(() => host.stop());
    await tick(); await tick();
    let st = await env.ipc("javis:status");
    assert.strictEqual(st.paired, false);
    assert.strictEqual(st.autoSigningIn, false);
    await tick();
    assert.strictEqual(env.calls.filter((c) => c.url.endsWith("/tailnet")).length, 1, "403 → thôi tới lần mở sau");
    const r = await env.ipc("javis:pair-paste-key", "jvk_" + "k".repeat(30));
    assert.strictEqual(r.ok, true);
    st = await env.ipc("javis:status");
    assert.deepStrictEqual([st.paired, st.kind], [true, "legacy"]);
  });

  it("mất mạng lúc mở → máy dậy (resume): làm mới kết nối rồi thử tự đăng nhập ngay", async () => {
    let online = false;
    const env = fakeElectron({
      answer: (url) => {
        if (!online) throw new Error("net::ERR_INTERNET_DISCONNECTED");
        return url.endsWith("/tailnet") ? json(200, TOKENS) : json(200, {});
      },
    });
    const host = deskHost.initDeskHost(env.deps);
    cleanups.push(() => host.stop());
    await tick(); await tick(); await tick();
    assert.strictEqual((await env.ipc("javis:status")).paired, false);
    online = true;
    env.powerMonitor.emit("resume");
    for (let i = 0; i < 6; i++) await tick();
    assert.strictEqual((await env.ipc("javis:status")).paired, true);
    assert.ok(env.resets.includes("close") && env.resets.includes("dns"), "đóng kết nối cũ + xoá DNS");
  });

  it("serves ui/javis-ask-box.js from javis-desk://app", async () => {
    const env = fakeElectron({ answer: () => json(403, {}) });
    const host = deskHost.initDeskHost(env.deps);
    cleanups.push(() => host.stop());
    const res = await env.protocol(new Request("javis-desk://app/ui/javis-ask-box.js"));
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get("content-type"), /javascript/);
    assert.match(await res.text(), /customElements\.define\("javis-ask-box"/);
  });
});

describe("0.13.1 · bản tối giản giữ nguyên + updater qua gateway", () => {
  const pkg = JSON.parse(read("package.json"));
  it("version 0.13.1, không còn electron-updater / publish GitHub", () => {
    assert.strictEqual(pkg.version, "0.13.1");
    assert.ok(!pkg.dependencies["electron-updater"]);
    assert.ok(!("publish" in pkg.build));
    assert.ok(!fs.existsSync(path.join(ROOT, "src", "updater.js")));
    for (const [name, cmd] of Object.entries(pkg.scripts)) if (/electron-builder/.test(cmd)) assert.match(cmd, /--publish never/, name);
    assert.ok(pkg.build.files.includes("assets/javis-ask-box/**/*"), "askbox is packaged");
  });

  it("main dùng javis-updater (gateway) + focus-guard, không nạp gì từ archive/", () => {
    const main = read("src/main.js");
    assert.ok(main.includes('require("./javis-updater").createUpdater'));
    assert.ok(!main.includes('require("./updater")'));
    assert.ok(main.includes("isUserBusy: () => focusGuard.isUserBusy()"));
    assert.ok(main.includes("updater.onQuit()"), "cài lúc thoát app");
    assert.ok(main.includes("powerMonitor"), "máy dậy / mở khoá → host hồi mạng + tự đăng nhập");
    for (const f of fs.readdirSync(path.join(ROOT, "src"))) {
      if (!f.endsWith(".js")) continue;
      assert.ok(!/require\(["'][./]*archive\//.test(read(`src/${f}`)), f);
    }
  });

  it("thẻ việc chờ anh + bong bóng mở <javis-ask-box> trong app; thẻ gộp mở link sâu bằng trình duyệt", () => {
    const cards = read("src/desk/cards.js");
    const desk = read("src/desk/desk.js");
    assert.ok(cards.includes("onclick: wait ? () => ctx.openAsk(t.id)"), "bấm thẻ việc chờ → hộp trả lời");
    assert.ok(!/approvals[^\n]*linkButton\("Duyệt"/.test(cards), "phiếu duyệt không văng ra web");
    assert.ok(desk.includes('document.createElement("javis-ask-box")'));
    assert.ok(desk.includes('"javis-ask-open-link"') && desk.includes("e.preventDefault()"));
    assert.ok(desk.includes('label: "Trả lời ngay", tone: "warm", run: () => showAskCard('), "bong bóng → hộp trả lời");
    const csp = read("src/desk/index.html").match(/Content-Security-Policy" content="([^"]+)"/)[1];
    assert.match(csp, /script-src 'self';/, "script vẫn chỉ cùng nguồn");
  });

  it("bong bóng tự hiện chờ anh rảnh tay (focus-guard), không gọi showBubble trực tiếp cho thông báo tự động", () => {
    const desk = read("src/desk/desk.js");
    assert.ok(desk.includes("await desk.userBusy()"));
    const auto = desk.slice(desk.indexOf("desk.onSessionNotice"), desk.indexOf("desk.onPermissionGone"));
    assert.ok(!auto.includes("showBubble("), "session notices + permission bubble go through notify()");
    const owner = desk.slice(desk.indexOf("async function checkOwnerWork"), desk.indexOf("// Gateway event stream"));
    assert.ok(!owner.includes("showBubble("));
    assert.ok(read("src/preload-desk.js").includes('ipcRenderer.invoke("desk:user-busy")'));
  });
});
