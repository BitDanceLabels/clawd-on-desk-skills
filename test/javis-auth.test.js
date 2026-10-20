// "Đăng nhập JAVIS" (CONTRACT.md v1): browser + PKCE, email code, refresh, relogin,
// old jvk_ keys — against the fake gateway in e2e/fake-auth.js (no network, no mail, no AI).
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { createAuth, createSessionStore, createPkce, b64u, TEXT, BROWSER_WAIT_MS, MAX_TRIES } = require("../src/javis-auth");
const { createKeyStore, createFleetProxy, createGatewayClient } = require("../src/javis-companion-host").__test;
const { createFakeAuth, fakeFetch } = require("../e2e/fake-auth");

const GW = "http://gw.test";
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s.split("").reverse().join(""), "utf8"),
  decryptString: (b) => b.toString("utf8").split("").reverse().join(""),
};

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

function setup({ fake = createFakeAuth({ legacyKeys: ["jvk_OLDKEYOLDKEYOLDKEY"] }), clock, preKey, fetchImpl } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "javis-auth-"));
  const timers = [];
  const t = clock || { now: 1_000_000 };
  const states = [];
  const expired = [];
  const opened = [];
  const calls = [];
  const sessionStore = createSessionStore({ userDataDir: dir, safeStorage: fakeSafeStorage });
  const legacyStore = createKeyStore({ userDataDir: dir, safeStorage: fakeSafeStorage });
  if (preKey) legacyStore.save(preKey, { email: "cu@demo.test" });
  const auth = createAuth({
    fetchImpl: fetchImpl || fakeFetch(fake, { calls }),
    getGateway: () => GW,
    sessionStore, legacyStore,
    openExternal: async (u) => opened.push(u),
    deviceName: "Mac-mini-cua-anh",
    onChange: (s) => states.push(s),
    onExpired: (s) => expired.push(s),
    now: () => t.now,
    setTimer: (fn, ms) => { const h = { fn, at: t.now + ms }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    sleep: async () => {},
  });
  auth.init();
  cleanups.push(() => { auth.dispose(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { auth, fake, dir, timers, clock: t, states, expired, opened, calls, sessionStore, legacyStore };
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d })); }).on("error", reject);
  });
}

// What the web page does after "Cho phép máy này": approve → follow the redirect.
async function browserApproves(fake, loginUrl) {
  const q = new URL(loginUrl).searchParams;
  const r = fake.handle("POST", "/fleet/auth/desktop/approve", {
    client_id: q.get("client_id"), redirect_uri: q.get("redirect_uri"), state: q.get("state"),
    code_challenge: q.get("code_challenge"), device_name: q.get("device_name"),
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  return get(r.body.redirect);
}

async function loginA(env) {
  const r = await env.auth.login();
  const page = await browserApproves(env.fake, r.url);
  return { r, page };
}

describe("Đăng nhập JAVIS · luồng A (trình duyệt + PKCE)", () => {
  it("PKCE S256: verifier 43–128 ký tự, challenge = BASE64URL(SHA256(verifier)), state ≥ 128 bit", () => {
    const p = createPkce();
    assert.ok(p.verifier.length >= 43 && p.verifier.length <= 128);
    assert.strictEqual(p.challenge, b64u(crypto.createHash("sha256").update(p.verifier).digest()));
    assert.ok(Buffer.from(p.state, "base64").length * 8 >= 128);
    assert.notStrictEqual(createPkce().state, p.state);
  });

  it("mở trình duyệt mặc định đúng URL hợp đồng, redirect về 127.0.0.1 cổng ngẫu nhiên", async () => {
    const env = setup();
    const r = await env.auth.login();
    assert.strictEqual(env.opened[0], r.url);
    const u = new URL(r.url);
    assert.strictEqual(u.origin + u.pathname, `${GW}/auth/desktop`);
    const q = u.searchParams;
    assert.strictEqual(q.get("client_id"), "javis-desk");
    assert.match(q.get("redirect_uri"), /^http:\/\/127\.0\.0\.1:\d+\/cb$/);
    assert.notStrictEqual(new URL(q.get("redirect_uri")).port, "0");
    assert.strictEqual(q.get("code_challenge_method"), "S256");
    assert.strictEqual(q.get("device_name"), "Mac-mini-cua-anh");
    assert.ok(q.get("state") && q.get("code_challenge"));
    assert.strictEqual(env.auth.getState().state, "waiting_browser");
    env.auth.cancel();
  });

  it("dùng public_base của gateway cho trang duyệt nếu có", async () => {
    const env = setup({ fake: createFakeAuth({ publicBase: "https://bumbee.asia" }) });
    const r = await env.auth.login();
    assert.ok(r.url.startsWith("https://bumbee.asia/auth/desktop?"), r.url);
    env.auth.cancel();
  });

  it("bấm Cho phép → nhận code ở /cb → đổi token → đã đăng nhập; refresh lưu mã hoá, access chỉ trong bộ nhớ", async () => {
    const env = setup();
    const { page } = await loginA(env);
    assert.match(page.body, /Xong rồi/);
    const s = env.auth.getState();
    assert.strictEqual(s.state, "signed_in");
    assert.strictEqual(s.kind, "oauth");
    assert.strictEqual(s.email, "owner@demo.test");
    const tokenCall = env.calls.find((c) => c.path === "/fleet/auth/desktop/token");
    assert.strictEqual(tokenCall.body.grant_type, "authorization_code");
    assert.strictEqual(tokenCall.body.client_id, "javis-desk");
    assert.ok(tokenCall.body.code_verifier.length >= 43);
    const disk = fs.readFileSync(env.sessionStore.file, "utf8");
    const rt = env.sessionStore.read().refresh;
    assert.ok(rt.startsWith("jrt_"));
    assert.ok(!disk.includes(rt), "refresh_token không nằm thô trên đĩa");
    assert.ok(!disk.includes("jat_"), "access_token không ghi ra đĩa");
    assert.strictEqual(env.auth._pending(), null, "server tạm đã đóng");
    assert.ok((await env.auth.token()).startsWith("jat_"));
  });

  it("state sai → bỏ qua, vẫn chờ; cổng tạm chỉ nghe 127.0.0.1", async () => {
    const env = setup();
    const r = await env.auth.login();
    const cb = new URL(new URL(r.url).searchParams.get("redirect_uri"));
    assert.strictEqual(cb.hostname, "127.0.0.1");
    const bad = await get(`${cb.href}?code=abc&state=khong-dung`);
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(env.auth.getState().state, "waiting_browser");
    assert.ok(!env.calls.some((c) => c.path === "/fleet/auth/desktop/token"), "không đổi code khi state sai");
    env.auth.cancel();
  });

  it("chờ tối đa 5 phút rồi dừng, báo 1 dòng; nút Huỷ quay lại màn đầu", async () => {
    const env = setup();
    await env.auth.login();
    const t = env.timers.find((h) => h.at - env.clock.now === BROWSER_WAIT_MS);
    assert.ok(t, "hẹn giờ 5 phút");
    t.fn();
    let s = env.auth.getState();
    assert.strictEqual(s.state, "signed_out");
    assert.strictEqual(s.notice, TEXT.browserTimeout);
    assert.strictEqual(env.auth._pending(), null);
    await env.auth.login();
    s = env.auth.cancel();
    assert.strictEqual(s.state, "signed_out");
    assert.strictEqual(s.notice, "");
  });

  it("người dùng bấm Huỷ trên web (không có code) → màn đầu, 1 thông báo", async () => {
    const env = setup();
    const r = await env.auth.login();
    const q = new URL(r.url).searchParams;
    await get(`${q.get("redirect_uri")}?error=access_denied&state=${q.get("state")}`);
    assert.deepStrictEqual([env.auth.getState().state, env.auth.getState().notice], ["signed_out", TEXT.browserDenied]);
  });
});

describe("Đăng nhập JAVIS · luồng B (mã 6 số qua email)", () => {
  it("email → chờ mã → nhập sai báo 1 dòng → nhập đúng là đã đăng nhập", async () => {
    const env = setup();
    assert.strictEqual((await env.auth.emailStart("Owner@Demo.Test")).ok, true);
    let s = env.auth.getState();
    assert.deepStrictEqual([s.state, s.pendingEmail], ["waiting_code", "owner@demo.test"]);
    const code = env.fake.lastMailCode("owner@demo.test");
    assert.match(code, /^\d{6}$/);
    const wrong = code === "000000" ? "111111" : "000000";
    assert.strictEqual((await env.auth.emailVerify(wrong)).ok, false);
    s = env.auth.getState();
    assert.deepStrictEqual([s.state, s.notice], ["waiting_code", "Mã chưa đúng, anh xem lại email nhé."]);
    assert.strictEqual((await env.auth.emailVerify("12a")).ok, false);
    assert.strictEqual((await env.auth.emailVerify(code)).ok, true);
    s = env.auth.getState();
    assert.deepStrictEqual([s.state, s.kind, s.email, s.notice], ["signed_in", "oauth", "owner@demo.test", ""]);
  });

  it("email sai định dạng không gọi máy chủ; gateway chưa bật mail (503) → báo dùng nút Đăng nhập", async () => {
    const env = setup({ fake: createFakeAuth({ emailEnabled: false }) });
    await env.auth.emailStart("khong-phai-email");
    assert.strictEqual(env.auth.getState().notice, TEXT.badEmail);
    assert.strictEqual(env.calls.length, 0);
    await env.auth.emailStart("owner@demo.test");
    assert.deepStrictEqual([env.auth.getState().state, env.auth.getState().notice], ["signed_out", TEXT.mailOff]);
    assert.strictEqual((await env.auth.config()).emailEnabled, false);
  });

  it("gửi quá 3 lần / 15 phút → báo đợi, không lặp", async () => {
    const env = setup();
    await env.auth.emailStart("owner@demo.test");
    await env.auth.emailResend();
    assert.strictEqual(env.auth.getState().notice, TEXT.resent);
    await env.auth.emailResend();
    const r = await env.auth.emailResend();
    assert.strictEqual(r.error, "too_many");
    assert.strictEqual(env.auth.getState().notice, TEXT.tooMany);
  });
});

describe("Đăng nhập 1 lần dùng lâu dài (refresh)", () => {
  it("tự refresh trước hạn 5 phút; refresh xoay vòng (lưu refresh mới)", async () => {
    const env = setup();
    await loginA(env);
    const first = await env.auth.token();
    const rt1 = env.sessionStore.read().refresh;
    const timer = env.timers.find((h) => h.at === env.clock.now + 3600 * 1000 - 5 * 60 * 1000);
    assert.ok(timer, "hẹn refresh lúc còn 5 phút");
    env.clock.now += 54 * 60 * 1000; // còn 6 phút: chưa refresh
    assert.strictEqual(await env.auth.token(), first);
    env.clock.now += 2 * 60 * 1000; // còn 4 phút: refresh
    const second = await env.auth.token();
    assert.notStrictEqual(second, first);
    assert.notStrictEqual(env.sessionStore.read().refresh, rt1);
    assert.strictEqual(env.fake.log.filter((l) => l === "refresh").length, 1);
  });

  it("gặp 401 → refresh 1 lần → gọi lại được", async () => {
    const env = setup();
    await loginA(env);
    const used = await env.auth.token();
    env.fake.expireAccess();
    const next = await env.auth.onUnauthorized(used);
    assert.ok(next && next !== used);
    assert.strictEqual(env.auth.getState().state, "signed_in");
  });

  it("refresh trả relogin:true → phiên hết hạn, xoá refresh, hiện lại màn Đăng nhập đúng 1 lần", async () => {
    const env = setup();
    await loginA(env);
    const used = await env.auth.token();
    env.fake.revokeAll();
    assert.strictEqual(await env.auth.onUnauthorized(used), null);
    const s = env.auth.getState();
    assert.deepStrictEqual([s.state, s.notice, s.signedIn], ["expired", TEXT.expired, false]);
    assert.strictEqual(env.sessionStore.read(), null);
    assert.strictEqual(env.expired.length, 1);
    assert.strictEqual(await env.auth.token(), null);
    await env.auth.onUnauthorized(used);
    assert.strictEqual(env.expired.length, 1, "chỉ nhắc 1 lần");
  });

  it("dùng lại refresh cũ (bị lộ) → máy chủ thu hồi cả chuỗi → app về màn Đăng nhập", async () => {
    const env = setup();
    await loginA(env);
    const stolen = env.sessionStore.read().refresh;
    env.clock.now += 3600 * 1000;
    await env.auth.token(); // rotates
    const replay = env.fake.handle("POST", "/fleet/auth/desktop/refresh", { refresh_token: stolen, client_id: "javis-desk" });
    assert.deepStrictEqual([replay.status, replay.body.relogin], [401, true]);
    env.clock.now += 3600 * 1000;
    assert.strictEqual(await env.auth.token(), null);
    assert.strictEqual(env.auth.getState().state, "expired");
  });

  it("mạng hỏng khi refresh: thử tối đa 3 lần rồi dừng (không lặp vô hạn), vẫn giữ đăng nhập", async () => {
    const fake = createFakeAuth();
    let down = false;
    let refreshCalls = 0;
    const base = fakeFetch(fake);
    const env = setup({ fake, fetchImpl: async (url, init) => {
      if (url.endsWith("/refresh")) { refreshCalls++; if (down) throw new Error("ECONNREFUSED"); }
      return base(url, init);
    } });
    await loginA(env);
    down = true;
    env.clock.now += 3600 * 1000;
    assert.strictEqual(await env.auth.token(), null);
    assert.strictEqual(refreshCalls, MAX_TRIES);
    assert.strictEqual(await env.auth.token(), null);
    assert.strictEqual(refreshCalls, MAX_TRIES, "nghỉ 1 phút, không gọi dồn");
    assert.strictEqual(env.auth.getState().state, "signed_in");
    down = false;
    env.clock.now += 61 * 1000;
    assert.ok(await env.auth.token());
  });

  it("mở lại app: đọc refresh từ đĩa → đã đăng nhập, access lấy bằng refresh", async () => {
    const env = setup();
    await loginA(env);
    const again = createAuth({
      fetchImpl: fakeFetch(env.fake), getGateway: () => GW, sessionStore: env.sessionStore, legacyStore: env.legacyStore,
      now: () => env.clock.now, setTimer: () => null, clearTimer: () => {}, sleep: async () => {},
    });
    assert.strictEqual(again.init().state, "signed_in");
    assert.ok((await again.token()).startsWith("jat_"));
  });

  it("Đăng xuất: thu hồi trên máy chủ, xoá trên máy", async () => {
    const env = setup();
    await loginA(env);
    const rt = env.sessionStore.read().refresh;
    await env.auth.logout();
    assert.strictEqual(env.auth.getState().state, "signed_out");
    assert.strictEqual(env.sessionStore.read(), null);
    assert.strictEqual(env.fake.handle("POST", "/fleet/auth/desktop/refresh", { refresh_token: rt }).status, 401);
  });
});

describe("Khoá jvk_ cũ (tương thích)", () => {
  it("máy có khoá cũ hợp lệ → vẫn dùng; bị từ chối → màn Đăng nhập mới, xoá khoá", async () => {
    const env = setup({ preKey: "jvk_OLDKEYOLDKEYOLDKEY" });
    let s = env.auth.getState();
    assert.deepStrictEqual([s.state, s.kind], ["signed_in", "legacy"]);
    assert.strictEqual(await env.auth.token(), "jvk_OLDKEYOLDKEYOLDKEY");
    assert.strictEqual(await env.auth.onUnauthorized("jvk_OLDKEYOLDKEYOLDKEY"), null);
    s = env.auth.getState();
    assert.deepStrictEqual([s.state, s.notice], ["expired", TEXT.legacyRejected]);
    assert.strictEqual(env.legacyStore.read(), null);
    assert.strictEqual(env.expired.length, 1);
  });

  it("đăng nhập mới thay khoá cũ", async () => {
    const env = setup({ preKey: "jvk_OLDKEYOLDKEYOLDKEY" });
    await loginA(env);
    assert.strictEqual(env.auth.getState().kind, "oauth");
    assert.strictEqual(env.legacyStore.read(), null);
  });
});

describe("Một máy trạng thái — không bao giờ 2 thông báo trái nhau", () => {
  it("mọi lần đổi trạng thái chỉ có 1 trạng thái và tối đa 1 thông báo", async () => {
    const env = setup({ preKey: "jvk_OLDKEYOLDKEYOLDKEY" });
    await env.auth.onUnauthorized("jvk_OLDKEYOLDKEYOLDKEY");
    await env.auth.emailStart("owner@demo.test");
    await env.auth.emailVerify(env.fake.lastMailCode("owner@demo.test"));
    await env.auth.logout();
    const r = await env.auth.login();
    await browserApproves(env.fake, r.url);
    const allowed = new Set(["signed_out", "waiting_browser", "waiting_code", "signed_in", "expired"]);
    for (const s of env.states) {
      assert.ok(allowed.has(s.state), s.state);
      assert.strictEqual(typeof s.notice, "string");
      assert.strictEqual(s.signedIn, s.state === "signed_in");
      // "đã đăng nhập" never carries a "bị từ chối / hết hạn" notice
      if (s.signedIn) assert.strictEqual(s.notice, "");
    }
    assert.deepStrictEqual([...new Set(env.states.map((s) => s.state))].sort(), [...allowed].sort());
  });
});

describe("Proxy / gateway client dùng phiên đăng nhập", () => {
  it("proxy: 401 → refresh → gửi lại 1 lần với access mới", async () => {
    const env = setup();
    await loginA(env);
    env.fake.expireAccess();
    const calls = [];
    const proxy = createFleetProxy({ auth: env.auth, configStore: { getGateway: () => GW }, fetchImpl: fakeFetch(env.fake, { calls }) });
    const res = await proxy.handle(new Request("javis-desk://app/fleet/whoami?token=leak"));
    assert.strictEqual(res.status, 200);
    const whoami = calls.filter((c) => c.path === "/fleet/whoami");
    assert.strictEqual(whoami.length, 2);
    assert.notStrictEqual(whoami[0].auth, whoami[1].auth);
    assert.ok(!calls.some((c) => c.auth.includes("leak")));
  });

  it("gateway client: 401 lần 2 sau refresh → kết thúc phiên; 403 không đăng xuất", async () => {
    const env = setup();
    await loginA(env);
    let status = 403;
    const c = createGatewayClient({ auth: env.auth, configStore: { getGateway: () => GW }, fetchImpl: async (url, init) => {
      if (url.includes("/fleet/auth/")) return fakeFetch(env.fake)(url, init);
      return new Response("{}", { status });
    } });
    assert.strictEqual((await c.request("POST", "/fleet/orders/x/approve", {})).status, 403);
    assert.strictEqual(env.auth.getState().state, "signed_in");
    status = 401;
    await c.request("GET", "/fleet/desk/pending");
    assert.strictEqual(env.auth.getState().state, "expired");
    assert.strictEqual(c.isPaired(), false);
    const r = await c.request("GET", "/fleet/desk/pending");
    assert.strictEqual(r.notPaired, true);
  });

  it("hết phiên → đóng mọi /fleet/stream đang mở (không giữ chật kết nối tới gateway)", async () => {
    const env = setup();
    await loginA(env);
    const signals = [];
    const proxy = createFleetProxy({ auth: env.auth, configStore: { getGateway: () => GW }, fetchImpl: async (url, init) => {
      signals.push(init.signal);
      return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    } });
    await proxy.handle(new Request("javis-desk://app/fleet/stream"));
    assert.strictEqual(proxy.liveStreams.size, 1);
    assert.strictEqual(signals[0].aborted, false);
    proxy.abortStreams();
    assert.strictEqual(signals[0].aborted, true);
    assert.strictEqual(proxy.liveStreams.size, 0);
  });

  it("chưa đăng nhập → proxy trả 401 tại chỗ, không gọi gateway", async () => {
    const env = setup();
    let n = 0;
    const proxy = createFleetProxy({ auth: env.auth, configStore: { getGateway: () => GW }, fetchImpl: async () => { n++; return new Response("{}"); } });
    assert.strictEqual((await proxy.handle(new Request("javis-desk://app/fleet/chat"))).status, 401);
    assert.strictEqual(n, 0);
  });
});
