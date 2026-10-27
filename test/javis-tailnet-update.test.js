// 0.12.3: tự đăng nhập trong tailnet + tự cập nhật từ gateway. Fake fetch, không gọi mạng thật.
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAuth, createSessionStore, isTailnetGateway, TAILNET_MAX_TRIES } = require("../src/javis-auth");
const {
  createUpdater, platformKey, compareSemver, parseLatest, macAppBundle, macSwapScript, MAX_DOWNLOADS_PER_DAY, IDLE_POLL_MS,
} = require("../src/javis-updater");

const TS_GW = "https://server-google-vscode.tail88b7de.ts.net:18110";
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s, "utf8"),
  decryptString: (b) => b.toString("utf8"),
};

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

function tmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function jsonRes(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

// ── Tự đăng nhập tailnet ──
function setupAuth({ gateway = TS_GW, answers = [] } = {}) {
  const dir = tmpDir("javis-tn-");
  const calls = [];
  const timers = [];
  const logs = [];
  const states = [];
  const queue = answers.slice();
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
    const a = queue.length ? queue.shift() : { status: 403, body: { detail: "no" } };
    if (a === "offline") throw new Error("net::ERR_INTERNET_DISCONNECTED");
    return jsonRes(a.status, a.body);
  };
  const sessionStore = createSessionStore({ userDataDir: dir, safeStorage: fakeSafeStorage });
  const auth = createAuth({
    fetchImpl, getGateway: () => gateway, sessionStore, legacyStore: null, deviceName: "Air-M1",
    onChange: (s) => states.push(s), log: (l) => logs.push(l),
    setTimer: (fn, ms) => { const h = { fn, ms }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
  });
  auth.init();
  cleanups.push(() => auth.dispose());
  return { auth, calls, timers, logs, states, sessionStore };
}

const OK_TOKENS = { status: 200, body: { access_token: "jat_A", refresh_token: "jvr_R", expires_in: 3600, email: "nhut@demo.test", name: "Nhựt" } };

describe("Tự đăng nhập trong tailnet", () => {
  it("chỉ gateway .ts.net mới là tailnet", () => {
    assert.ok(isTailnetGateway(TS_GW));
    assert.ok(!isTailnetGateway("https://bumbee.asia"));
    assert.ok(!isTailnetGateway("http://ts.net.evil.test"));
    assert.ok(!isTailnetGateway("not a url"));
  });

  it("thành công → signed_in, lưu refresh, có email; body đúng hợp đồng; log không có token", async () => {
    const env = setupAuth({ answers: [OK_TOKENS] });
    const r = await env.auth.autoSignIn("start");
    assert.deepStrictEqual(r, { ok: true });
    assert.strictEqual(env.calls[0].url, `${TS_GW}/fleet/auth/desktop/tailnet`);
    assert.deepStrictEqual(env.calls[0].body, { client_id: "javis-desk", device_name: "Air-M1" });
    const s = env.auth.getState();
    assert.strictEqual(s.state, "signed_in");
    assert.strictEqual(s.email, "nhut@demo.test");
    assert.strictEqual(s.autoSigningIn, false);
    assert.strictEqual(env.sessionStore.read().refresh, "jvr_R");
    assert.strictEqual(await env.auth.token(), "jat_A");
    assert.ok(env.states.some((x) => x.autoSigningIn === true), "màn đăng nhập thấy 'Đang tự đăng nhập…'");
    assert.ok(!env.logs.join("\n").includes("jvr_R") && !env.logs.join("\n").includes("jat_A"));
    // Đã đăng nhập: không gọi lại.
    assert.strictEqual((await env.auth.autoSignIn("resume")).skipped, true);
    assert.strictEqual(env.calls.length, 1);
  });

  it("403 → về nút Đăng nhập JAVIS, không báo lỗi đỏ, không thử lại tới lần mở sau", async () => {
    const env = setupAuth({ answers: [{ status: 403, body: { detail: "not tailnet" } }] });
    const r = await env.auth.autoSignIn("start");
    assert.strictEqual(r.ok, false);
    const s = env.auth.getState();
    assert.strictEqual(s.state, "signed_out");
    assert.strictEqual(s.notice, "");
    assert.strictEqual(s.autoSigningIn, false);
    assert.strictEqual(env.timers.length, 0);
    assert.strictEqual((await env.auth.autoSignIn("resume")).skipped, true);
    assert.strictEqual(env.calls.length, 1);
  });

  it("404 (gateway chưa có endpoint) cũng thôi luôn", async () => {
    const env = setupAuth({ answers: [{ status: 404, body: {} }] });
    await env.auth.autoSignIn("start");
    assert.strictEqual((await env.auth.autoSignIn("resume")).skipped, true);
    assert.strictEqual(env.calls.length, 1);
  });

  it("429/mất mạng → thử lại giãn cách, tối đa 3 lần rồi thôi tới lần mở sau", async () => {
    const env = setupAuth({ answers: [{ status: 429, body: {} }, "offline", { status: 503, body: {} }, OK_TOKENS] });
    await env.auth.autoSignIn("start");
    assert.strictEqual(env.timers.length, 1);
    const gap1 = env.timers[0].ms;
    await env.timers.shift().fn();
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(env.timers.length, 1);
    assert.ok(env.timers[0].ms > gap1, "giãn cách tăng dần");
    await env.timers.shift().fn();
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(env.calls.length, TAILNET_MAX_TRIES);
    assert.strictEqual(env.timers.length, 0, "hết 3 lần: không hẹn nữa");
    assert.strictEqual((await env.auth.autoSignIn("resume")).skipped, true);
    assert.strictEqual(env.calls.length, 3);
    const s = env.auth.getState();
    assert.strictEqual(s.state, "signed_out");
    assert.strictEqual(s.notice, "");
  });

  it("máy dậy giữa chừng: thử ngay (còn lượt) thay vì chờ hẹn", async () => {
    const env = setupAuth({ answers: ["offline", OK_TOKENS] });
    await env.auth.autoSignIn("start");
    assert.strictEqual(env.timers.length, 1);
    const r = await env.auth.autoSignIn("resume");
    assert.strictEqual(r.ok, true);
    assert.strictEqual(env.calls.length, 2);
    assert.ok(!env.timers.some((t) => t.ms === 10 * 1000), "hẹn thử lại đã huỷ (chỉ còn hẹn làm mới token)");
  });

  it("gateway không phải .ts.net → không gọi", async () => {
    const env = setupAuth({ gateway: "https://bumbee.asia", answers: [OK_TOKENS] });
    assert.strictEqual((await env.auth.autoSignIn("start")).skipped, true);
    assert.strictEqual(env.calls.length, 0);
    assert.strictEqual(env.auth.getState().state, "signed_out");
  });
});

// ── Tự cập nhật ──
function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

function setupUpdater({ platform = "win32", arch = "x64", latest, payload = Buffer.from("NEW-INSTALLER"), current = "0.12.3", busy = () => false, run, execPath } = {}) {
  const dir = tmpDir("javis-upd-");
  const calls = [];
  const spawned = [];
  const timers = [];
  let quit = 0;
  const clock = { now: Date.UTC(2026, 9, 27, 3) };
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/fleet/desk/app/latest")) return jsonRes(200, typeof latest === "function" ? latest() : latest);
    const body = typeof payload === "function" ? payload() : payload;
    return { status: 200, ok: true, body: (async function* () { yield body.subarray(0, 4); yield body.subarray(4); })() };
  };
  const u = createUpdater({
    currentVersion: current, platform, arch, execPath: execPath || "C:\\Program Files\\JAVIS\\JAVIS.exe",
    userDataDir: dir, getGateway: () => TS_GW, fetchImpl, isUserBusy: busy,
    quitApp: () => { quit += 1; }, run: run || (async () => ({ code: 0, stdout: "", stderr: "" })),
    spawnDetached: (cmd, args) => spawned.push({ cmd, args }),
    now: () => clock.now, random: () => 0.5,
    setTimer: (fn, ms) => { const h = { fn, ms }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    pid: 4242,
  });
  cleanups.push(() => u.stop());
  return { u, dir, calls, spawned, timers, clock, quits: () => quit };
}

describe("Tự cập nhật · so phiên bản + chọn gói", () => {
  it("semver", () => {
    assert.strictEqual(compareSemver("0.12.4", "0.12.3"), 1);
    assert.strictEqual(compareSemver("0.12.3", "0.12.3"), 0);
    assert.strictEqual(compareSemver("0.9.10", "0.12.0"), -1);
    assert.strictEqual(compareSemver("1.0.0", "0.99.99"), 1);
    assert.strictEqual(compareSemver("v0.13.0", "0.12.3"), 1);
    assert.strictEqual(compareSemver("0.13.0-beta.1", "0.13.0"), -1);
    assert.strictEqual(compareSemver("0.13.0-beta.2", "0.13.0-beta.10"), -1);
    assert.strictEqual(compareSemver("rác", "0.12.3"), 0);
  });

  it("chọn platform đúng gói", () => {
    assert.strictEqual(platformKey("darwin", "arm64"), "mac-arm64");
    assert.strictEqual(platformKey("darwin", "x64"), "mac-x64");
    assert.strictEqual(platformKey("win32", "x64"), "win-x64");
    assert.strictEqual(platformKey("win32", "arm64"), null);
    assert.strictEqual(platformKey("linux", "x64"), null);
  });

  it("url tương đối ghép gateway; câu trả lời thiếu sha/size bị bỏ", () => {
    const ok = parseLatest({ version: "0.12.4", url: "/releases/JAVIS-0.12.4-arm64.zip", sha256: "a".repeat(64), size: 10 }, TS_GW);
    assert.strictEqual(ok.url, `${TS_GW}/releases/JAVIS-0.12.4-arm64.zip`);
    assert.strictEqual(parseLatest({ version: "0.12.4", url: "/x", sha256: "abc", size: 10 }, TS_GW), null);
    assert.strictEqual(parseLatest({ version: "0.12.4", url: "/x", sha256: "a".repeat(64) }, TS_GW), null);
    assert.strictEqual(parseLatest({ version: "x", url: "/x", sha256: "a".repeat(64), size: 1 }, TS_GW), null);
    assert.strictEqual(parseLatest({ version: "0.12.4", url: "file:///etc/passwd", sha256: "a".repeat(64), size: 1 }, TS_GW), null);
  });

  it("đường dẫn .app từ execPath", () => {
    assert.strictEqual(macAppBundle("/Applications/JAVIS.app/Contents/MacOS/JAVIS"), "/Applications/JAVIS.app");
    assert.strictEqual(macAppBundle("/usr/bin/node"), null);
  });

  it("script đổi bản Mac: chờ app thoát, giữ bản cũ ở prev, lùi khi lỗi, open -g", () => {
    const s = macSwapScript();
    assert.match(s, /kill -0 "\$PID"/);
    assert.match(s, /mv "\$TARGET" "\$PREV\/JAVIS.app"/);
    assert.match(s, /roll back/);
    assert.match(s, /open -g "\$TARGET"/);
  });
});

describe("Tự cập nhật · luồng", () => {
  it("hỏi đúng platform, bản cũ hơn/bằng → không tải", async () => {
    const env = setupUpdater({ latest: { version: "0.12.3", url: "/r/x.exe", sha256: "a".repeat(64), size: 5 } });
    const s = await env.u.check();
    assert.strictEqual(s.state, "latest");
    assert.match(env.calls[0], /\/fleet\/desk\/app\/latest\?platform=win-x64$/);
    assert.strictEqual(env.calls.length, 1);
  });

  it("sha256 sai → xoá file, không cài; tối đa 3 lần tải/ngày, hôm sau thử lại", async () => {
    const payload = Buffer.from("TAMPERED-BYTES");
    const env = setupUpdater({ payload, latest: { version: "0.12.4", url: "/r/JAVIS.exe", sha256: "b".repeat(64), size: payload.length } });
    for (let i = 0; i < MAX_DOWNLOADS_PER_DAY; i++) {
      const s = await env.u.check();
      assert.strictEqual(s.state, "error");
    }
    const files = fs.readdirSync(path.join(env.dir, "updates")).filter((n) => n !== "state.json");
    assert.deepStrictEqual(files, [], "file sai đã bị xoá");
    const before = env.calls.length;
    const s4 = await env.u.check();
    assert.strictEqual(s4.state, "error");
    assert.strictEqual(env.calls.length, before + 1, "lần 4 trong ngày: chỉ hỏi phiên bản, không tải");
    env.clock.now += 24 * 3600 * 1000;
    await env.u.check();
    assert.strictEqual(env.calls.length, before + 3, "hôm sau tải lại");
  });

  it("kích thước sai cũng bị loại", async () => {
    const payload = Buffer.from("NEW-INSTALLER");
    const env = setupUpdater({ payload, latest: { version: "0.12.4", url: "/r/JAVIS.exe", sha256: sha(payload), size: payload.length + 1 } });
    assert.strictEqual((await env.u.check()).state, "error");
    assert.strictEqual(env.spawned.length, 0);
  });

  it("Windows: đúng sha → ready; anh đang gõ thì chờ, rảnh tay mới cài /S rồi thoát", async () => {
    let busy = true;
    const payload = Buffer.from("NEW-INSTALLER");
    const env = setupUpdater({ payload, busy: () => busy, latest: { version: "0.12.4", url: "/r/JAVIS-0.12.4-x64.exe", sha256: sha(payload), size: payload.length } });
    const s = await env.u.check();
    assert.strictEqual(s.state, "ready");
    assert.strictEqual(env.calls[1], `${TS_GW}/r/JAVIS-0.12.4-x64.exe`);
    const idle = env.timers.find((t) => t.ms === IDLE_POLL_MS);
    assert.ok(idle);
    env.timers.splice(env.timers.indexOf(idle), 1);
    idle.fn();
    assert.strictEqual(env.spawned.length, 0, "đang gõ: chưa cài");
    assert.strictEqual(env.quits(), 0);
    busy = false;
    const again = env.timers.find((t) => t.ms === IDLE_POLL_MS);
    env.timers.splice(env.timers.indexOf(again), 1);
    again.fn();
    assert.strictEqual(env.spawned.length, 1);
    assert.match(env.spawned[0].cmd, /JAVIS-0\.12\.4-win-x64\.exe$/);
    assert.deepStrictEqual(env.spawned[0].args, ["--updated", "/S", "--force-run"]);
    assert.strictEqual(env.quits(), 1);
    assert.strictEqual(env.u.onQuit(), false, "không cài 2 lần khi app thoát");
  });

  it("thoát app khi đã có bản sẵn sàng → cài lúc thoát", async () => {
    const payload = Buffer.from("NEW-INSTALLER");
    const env = setupUpdater({ payload, busy: () => true, latest: { version: "0.12.4", url: "/r/a.exe", sha256: sha(payload), size: payload.length } });
    await env.u.check();
    assert.strictEqual(env.u.onQuit(), true);
    assert.strictEqual(env.spawned.length, 1);
  });

  it("Mac: kiểm chữ ký + bundle id; bundle id lạ → không cài", async () => {
    const payload = Buffer.from("ZIPBYTES");
    const cmds = [];
    const run = async (cmd, args) => {
      cmds.push([cmd, ...args].join(" "));
      if (cmd.endsWith("ditto")) {
        fs.mkdirSync(path.join(args[3], "JAVIS.app", "Contents"), { recursive: true });
        return { code: 0, stdout: "", stderr: "" };
      }
      if (args.includes("CFBundleIdentifier")) return { code: 0, stdout: "com.evil.app\n", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    };
    const env = setupUpdater({ platform: "darwin", arch: "arm64", payload, run, execPath: "/Applications/JAVIS.app/Contents/MacOS/JAVIS",
      latest: { version: "0.12.4", url: "/r/JAVIS-0.12.4-arm64.zip", sha256: sha(payload), size: payload.length } });
    const s = await env.u.check();
    assert.match(env.calls[0], /platform=mac-arm64/);
    assert.strictEqual(s.state, "error");
    assert.ok(cmds.some((c) => c.startsWith("/usr/bin/codesign --verify --deep --strict")));
    assert.strictEqual(env.u._staged(), null);
  });

  it("Mac: chữ ký phải cùng chứng chỉ JAVIS với bản đang chạy", async () => {
    const payload = Buffer.from("ZIPBYTES");
    const cmds = [];
    const run = async (cmd, args) => {
      cmds.push([cmd, ...args].join(" "));
      if (cmd.endsWith("ditto")) { fs.mkdirSync(path.join(args[3], "JAVIS.app", "Contents"), { recursive: true }); return { code: 0, stdout: "", stderr: "" }; }
      if (args.includes("CFBundleIdentifier")) return { code: 0, stdout: "com.clawd.on-desk\n", stderr: "" };
      if (args.includes("CFBundleShortVersionString")) return { code: 0, stdout: "0.12.4\n", stderr: "" };
      if (args[0] === "-d") return { code: 0, stdout: "", stderr: 'designated => identifier "com.clawd.on-desk" and certificate leaf = H"abcd"\n' };
      if (args.some((a) => a.startsWith("-R="))) return { code: 3, stdout: "", stderr: "does not satisfy" };
      return { code: 0, stdout: "", stderr: "" };
    };
    const env = setupUpdater({ platform: "darwin", arch: "arm64", payload, run, execPath: "/Applications/JAVIS.app/Contents/MacOS/JAVIS",
      latest: { version: "0.12.4", url: "/r/a.zip", sha256: sha(payload), size: payload.length } });
    assert.strictEqual((await env.u.check()).state, "error");
    assert.ok(cmds.some((c) => c.includes('-R=identifier "com.clawd.on-desk" and certificate leaf = H"abcd"')));
  });

  it("Mac: hợp lệ nhưng /Applications không ghi được → 'manual' (menu: bấm để cài), không tự cài", async () => {
    const payload = Buffer.from("ZIPBYTES");
    const run = async (cmd, args) => {
      if (cmd.endsWith("ditto")) { fs.mkdirSync(path.join(args[3], "JAVIS.app", "Contents"), { recursive: true }); return { code: 0, stdout: "", stderr: "" }; }
      if (args.includes("CFBundleIdentifier")) return { code: 0, stdout: "com.clawd.on-desk\n", stderr: "" };
      if (args.includes("CFBundleShortVersionString")) return { code: 0, stdout: "0.12.4\n", stderr: "" };
      if (args[0] === "-d") return { code: 0, stdout: "", stderr: "designated => cdhash H\"00\"\n" };
      return { code: 0, stdout: "", stderr: "" };
    };
    const env = setupUpdater({ platform: "darwin", arch: "arm64", payload, run, execPath: "/nonexistent-dir/JAVIS.app/Contents/MacOS/JAVIS",
      latest: { version: "0.12.4", url: "/r/a.zip", sha256: sha(payload), size: payload.length } });
    const s = await env.u.check();
    assert.strictEqual(s.state, "manual");
    assert.ok(env.u.stagedApp().endsWith("JAVIS.app"));
    assert.strictEqual(env.u.installNow(), false);
    assert.strictEqual(env.u.onQuit(), false);
    assert.strictEqual(env.spawned.length, 0);
  });

  it("Mac ghi được: cài bằng script phụ, đúng tham số, mở lại", async () => {
    const payload = Buffer.from("ZIPBYTES");
    const root = tmpDir("javis-apps-");
    const target = path.join(root, "JAVIS.app");
    fs.mkdirSync(path.join(target, "Contents", "MacOS"), { recursive: true });
    const run = async (cmd, args) => {
      if (cmd.endsWith("ditto")) { fs.mkdirSync(path.join(args[3], "JAVIS.app", "Contents"), { recursive: true }); return { code: 0, stdout: "", stderr: "" }; }
      if (args.includes("CFBundleIdentifier")) return { code: 0, stdout: "com.clawd.on-desk\n", stderr: "" };
      if (args.includes("CFBundleShortVersionString")) return { code: 0, stdout: "0.12.4\n", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    };
    const env = setupUpdater({ platform: "darwin", arch: "arm64", payload, run, busy: () => true, execPath: path.join(target, "Contents", "MacOS", "JAVIS"),
      latest: { version: "0.12.4", url: "/r/a.zip", sha256: sha(payload), size: payload.length } });
    assert.strictEqual((await env.u.check()).state, "ready");
    assert.strictEqual(env.u.installNow({ reason: "menu" }), true);
    const { cmd, args } = env.spawned[0];
    assert.strictEqual(cmd, "/bin/sh");
    assert.deepStrictEqual(args.slice(1, 3), ["4242", target]);
    assert.ok(args[3].endsWith(path.join("JAVIS-0.12.4", "JAVIS.app")));
    assert.ok(args[4].endsWith(path.join("updates", "prev")));
    assert.strictEqual(args[6], "1");
    assert.ok(fs.existsSync(args[0]));
    assert.strictEqual(env.quits(), 1);
  });

  it("tắt bằng JAVIS_AUTO_UPDATE=0: không hẹn kiểm", () => {
    const dir = tmpDir("javis-upd-off-");
    const timers = [];
    const u = createUpdater({ currentVersion: "0.12.3", platform: "darwin", arch: "arm64", userDataDir: dir, getGateway: () => TS_GW,
      fetchImpl: async () => { throw new Error("no"); }, enabled: false, setTimer: (fn, ms) => { timers.push(ms); return {}; } });
    u.start();
    assert.deepStrictEqual(timers, []);
  });

  it("bật: kiểm sau 30 giây", () => {
    const dir = tmpDir("javis-upd-on-");
    const timers = [];
    const u = createUpdater({ currentVersion: "0.12.3", platform: "darwin", arch: "arm64", userDataDir: dir, getGateway: () => TS_GW,
      fetchImpl: async () => { throw new Error("no"); }, setTimer: (fn, ms) => { timers.push(ms); return {}; }, clearTimer: () => {} });
    u.start();
    assert.deepStrictEqual(timers, [30 * 1000]);
  });
});
