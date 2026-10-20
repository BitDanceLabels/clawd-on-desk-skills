// Tester "Đăng nhập JAVIS" (0.12.0) — đóng vai anh Nhựt trên gateway GIẢ theo CONTRACT.md
// (fake-gateway.js + fake-auth.js: không mail thật, không AI thật).
// Chạy trong xvfb (run-tester.sh login). HOME + userData tạm: không đụng ~/.claude thật.
// Quay video x11grab, chụp ảnh màn đầu / đã đăng nhập, ghi kết quả JSON.
"use strict";
const { _electron: electron } = require("playwright-core");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const APP = process.env.JAVIS_APP_DIR || path.resolve(__dirname, "..");
const OUT = process.env.JAVIS_E2E_OUT || path.resolve(__dirname, "..", "e2e-out");
const SHOTS = path.join(OUT, "shots");
const GW_PORT = 18997;
const GW = `http://127.0.0.1:${GW_PORT}`;
const RECORD = process.env.RECORD !== "0";
const LEGACY_KEY = "jvk_FAKEFAKEFAKEFAKEFAKEFAKE";
const results = [];
const captions = [];
let t0 = Date.now();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(step, name, ok, detail = "") {
  results.push({ step, name, ok: !!ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? "PASS" : "FAIL"} [${step}] ${name}${detail ? " — " + String(detail).slice(0, 160) : ""}`);
}

function caption(text) {
  captions.push({ at: (Date.now() - t0) / 1000, text });
  console.log(`== ${text}`);
}

function shot(name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  execFileSync("import", ["-window", "root", path.join(SHOTS, name)]);
}

function gw(method, p, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${GW}${p}`, { method, headers: { "Content-Type": "application/json" } }, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function findWindow(app, part, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const w = app.windows().find((p) => p.url().includes(part));
    if (w) return w;
    await sleep(200);
  }
  throw new Error(`window ${part} not found`);
}

const T = (app, fn, arg) => app.evaluate(fn, arg);
const hook = (app, name, ...args) => app.evaluate(({}, [n, a]) => globalThis.__javisTest[n](...a), [name, args]);

// What the user can actually read in the chat window (hidden sections excluded).
const visibleText = (page) => page.evaluate(() => document.body.innerText);

// Never two messages that disagree on the same screen.
function consistent(text) {
  const signedIn = /Đã đăng nhập/.test(text);
  const out = /Chưa đăng nhập|hết hạn|từ chối|không còn dùng được|Đăng nhập JAVIS để vào lại/.test(text);
  return !(signedIn && out);
}

async function main() {
  // ── HOME + userData tạm: máy đang dùng khoá jvk_ cũ (bản 0.12.0 trước) ──
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "javis-login-tester-"));
  const ud = path.join(home, ".config", "clawd-on-desk");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(ud, "clawd-prefs.json"), JSON.stringify({ lang: "vi", x: 80, y: 560, size: "M", characterSkin: "live2d:hiyori" }));
  fs.writeFileSync(path.join(ud, "javis-device-key.json"), JSON.stringify({ v: 1, email: "owner@demo.test", plain: LEGACY_KEY }));

  const gwProc = spawn(process.execPath, [path.join(__dirname, "fake-gateway.js"), String(GW_PORT)], { stdio: "ignore" });
  await sleep(600);

  let ff = null;
  const video = path.join(OUT, "nghiem-thu-login-raw.mp4");
  fs.mkdirSync(OUT, { recursive: true });
  if (RECORD) {
    ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "x11grab", "-video_size", "1440x900", "-framerate", "12", "-i", process.env.DISPLAY,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", video], { stdio: ["pipe", "inherit", "inherit"] });
  }
  t0 = Date.now();
  caption("JAVIS 0.12.0 · Đăng nhập JAVIS (gateway giả theo CONTRACT)");

  const app = await electron.launch({
    executablePath: path.join(APP, "node_modules", "electron", "dist", "electron"),
    args: [APP, "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: {
      ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"),
      JAVIS_GATEWAY_URL: GW, BUMBEE_WIKI_URL: `${GW}/wiki`, BUMBEE_GATEWAY_URL: GW,
      JAVIS_TEST_HOOKS: "1", CLAWD_DEVTOOLS: "0",
    },
  });
  const appLog = fs.createWriteStream(path.join(OUT, "app-login.log"));
  app.process().stdout.pipe(appLog);
  app.process().stderr.pipe(appLog);
  // The "default browser" = a plain window inside the test (no real browser, no real web).
  await T(app, ({ shell, BrowserWindow }) => {
    globalThis.__opened = [];
    shell.openExternal = async (u) => {
      globalThis.__opened.push(u);
      const w = new BrowserWindow({ width: 560, height: 420, x: 860, y: 140, title: "Trình duyệt (giả)", autoHideMenuBar: true });
      w.loadURL(u);
    };
  });
  await sleep(6000);
  const petPage = await findWindow(app, "src/index.html");
  await petPage.evaluate(() => {
    window.__notes = [];
    const n = document.getElementById("javis-note");
    new MutationObserver(() => { if (!n.hidden) window.__notes.push({ text: n.textContent, at: Date.now() }); }).observe(n, { attributes: true, childList: true, characterData: true, subtree: true });
  });

  try {
    // ── 1 · Khoá cũ vẫn dùng được ──
    caption("1 · Máy đang dùng khoá jvk_ cũ: vẫn chạy bình thường");
    let labels = await hook(app, "contextLabels");
    check(1, "Khoá jvk_ cũ hợp lệ → vẫn dùng, menu 'Đã đăng nhập: <email>'", labels.includes("👤 Đã đăng nhập: owner@demo.test"), labels.filter((l) => /đăng nhập/i.test(l)).join(" | "));
    check(1, "Không còn mục 'Ghép đôi máy này…'", !labels.some((l) => /Ghép đôi/.test(l)));
    await sleep(1500);

    // ── 2 · Khoá cũ bị từ chối → màn Đăng nhập mới ──
    caption("2 · Gateway từ chối khoá cũ → tự hiện màn Đăng nhập mới");
    await gw("POST", "/__revoke-legacy");
    await hook(app, "clickMenu", "📋 Việc chờ anh");
    const chat = await findWindow(app, "javis-desk://app/index.html");
    await chat.waitForSelector("#view-login:not([hidden])", { timeout: 10000 });
    await sleep(800);
    let text = await visibleText(chat);
    check(2, "Khoá cũ bị từ chối → màn Đăng nhập mới hiện ra", /Khoá cũ của máy này không còn dùng được/.test(text), text.replace(/\s+/g, " ").slice(0, 160));
    check(2, "Không hiện 2 thông báo trái nhau (không có 'Đã đăng nhập' cùng 'bị từ chối')", consistent(text), text.replace(/\s+/g, " ").slice(0, 200));
    await petPage.waitForFunction(() => window.__notes.some((n) => /hết hạn/.test(n.text)), null, { timeout: 5000 }).catch(() => {});
    const notes1 = await petPage.evaluate(() => window.__notes.map((n) => n.text));
    check(2, "Cô bé nhắc nhẹ 1 lần", notes1.filter((t) => /phiên đăng nhập JAVIS hết hạn/.test(t)).length >= 1, notes1.join(" | "));
    const inboxWin = app.windows().find((p) => p.url().includes("inbox.html"));
    if (inboxWin) await inboxWin.close();
    shot("login-0-khoa-cu-bi-tu-choi.png");
    await sleep(2000);

    // ── 3 · Luồng A: trình duyệt + PKCE ──
    caption("3 · Bấm Đăng nhập JAVIS → trình duyệt → Cho phép máy này");
    await chat.click("#btn-login");
    await chat.waitForSelector("#pane-browser:not([hidden])", { timeout: 5000 });
    text = await visibleText(chat);
    check(3, "Đang chờ trình duyệt: có nút Huỷ, 1 trạng thái", /Huỷ/.test(text) && /Đang chờ trình duyệt/.test(text) && consistent(text));
    const opened = await T(app, () => globalThis.__opened.slice());
    const loginUrl = new URL(opened[opened.length - 1]);
    const q = loginUrl.searchParams;
    check(3, "Mở trình duyệt mặc định đúng URL hợp đồng (/auth/desktop, PKCE S256, state, 127.0.0.1 cổng ngẫu nhiên)",
      loginUrl.pathname === "/auth/desktop" && q.get("client_id") === "javis-desk" && q.get("code_challenge_method") === "S256"
      && /^http:\/\/127\.0\.0\.1:\d+\/cb$/.test(q.get("redirect_uri")) && q.get("state").length >= 22 && q.get("code_challenge").length === 43,
      loginUrl.href.slice(0, 200));
    const browser = await findWindow(app, "/auth/desktop");
    await browser.waitForSelector("#allow");
    await sleep(2200);
    await browser.click("#allow");
    await browser.waitForFunction(() => /Xong rồi/.test(document.body.innerText), null, { timeout: 8000 });
    check(3, "Trình duyệt báo 'Xong rồi, quay lại app'", true);
    await sleep(1500);
    await chat.waitForSelector("#view-chat:not([hidden])", { timeout: 8000 });
    await browser.close();
    await sleep(800);
    text = await visibleText(chat);
    check(3, "App tự vào chat, dòng trạng thái 'Đã đăng nhập · owner@demo.test'", (await chat.textContent("#status-line")) === "Đã đăng nhập · owner@demo.test");
    check(3, "Không còn thông báo cũ sau khi đăng nhập", consistent(text), text.replace(/\s+/g, " ").slice(0, 200));
    labels = await hook(app, "contextLabels");
    check(3, "Đăng nhập xong → bong bóng 'phiên hết hạn' của cô bé tắt ngay", await petPage.evaluate(() => document.getElementById("javis-note").hidden));
    check(3, "Menu: 'Đã đăng nhập: owner@demo.test'", labels.includes("👤 Đã đăng nhập: owner@demo.test"));
    const alog = JSON.parse(await gw("GET", "/__auth-log"));
    check(3, "Gateway: approve → token (authorization_code)", alog.includes("token authorization_code"), alog.join(", "));
    const session = JSON.parse(fs.readFileSync(path.join(ud, "javis-session.json"), "utf8"));
    check(3, "refresh_token lưu trong userData; access_token không ghi ra đĩa", !!(session.enc || session.plain) && !fs.readFileSync(path.join(ud, "javis-session.json"), "utf8").includes("jat_"));
    check(3, "Khoá cũ đã được thay bằng phiên mới", !fs.existsSync(path.join(ud, "javis-device-key.json")));
    shot("login-2-da-dang-nhap.png");
    await sleep(2500);

    // ── 4 · Refresh tự động khi gặp 401 ──
    caption("4 · Access token hết hạn → tự refresh, anh không phải làm gì");
    await gw("POST", "/__expire-access");
    const before = (await gw("GET", "/__log")).split("\n").length;
    const snap = await T(app, async () => {
      const r = await globalThis.__javisTest.refreshInbox();
      return r;
    }).catch(() => null);
    const log2 = (await gw("GET", "/__log")).split("\n").slice(before - 1);
    const alog2 = JSON.parse(await gw("GET", "/__auth-log"));
    check(4, "Gặp 401 → gọi /refresh → gọi lại thành công", alog2.includes("refresh") && log2.filter((l) => l.startsWith("GET /fleet/home/tasks")).length >= 2, log2.join(" ; ").slice(0, 200));
    check(4, "Vẫn đăng nhập sau refresh", (await hook(app, "authState")).state === "signed_in" && snap && snap.loaded, JSON.stringify(snap && { loaded: snap.loaded, count: snap.count }));
    await sleep(1500);

    // ── 5 · Refresh hỏng (thu hồi) → màn Đăng nhập ──
    caption("5 · Máy bị thu hồi trên web → phiên hết hạn → màn Đăng nhập");
    await petPage.evaluate(() => { window.__notes = []; });
    await gw("POST", "/__revoke-all");
    await T(app, async () => { await globalThis.__javisTest.refreshInbox(); }).catch(() => {});
    await chat.waitForSelector("#view-login:not([hidden])", { timeout: 8000 });
    await sleep(600);
    text = await visibleText(chat);
    const st5 = await hook(app, "authState");
    check(5, "Refresh trả relogin:true → tự hiện lại màn Đăng nhập", st5.state === "expired" && /Phiên đăng nhập đã hết hạn/.test(text), st5.state);
    check(5, "Không hiện 2 thông báo trái nhau", consistent(text), text.replace(/\s+/g, " ").slice(0, 200));
    await petPage.waitForFunction(() => window.__notes.length > 0, null, { timeout: 4000 }).catch(() => {});
    await sleep(1500);
    await T(app, async () => { await globalThis.__javisTest.refreshInbox(); }).catch(() => {});
    await sleep(500);
    const notes5 = await petPage.evaluate(() => window.__notes.map((n) => n.text));
    check(5, "Cô bé nhắc nhẹ đúng 1 lần", new Set(notes5.filter((t) => /hết hạn/.test(t))).size === 1, notes5.join(" | "));
    check(5, "Menu đổi lại thành 'Đăng nhập JAVIS…'", (await hook(app, "contextLabels")).includes("🔑 Đăng nhập JAVIS…"));
    await sleep(1500);

    // ── 6 · Luồng B: mã 6 số qua email ──
    caption("6 · Hoặc nhận mã qua email → nhập mã 6 số");
    await chat.click("#btn-email-link");
    await sleep(600);
    await chat.type("#email", "owner@demo.test", { delay: 35 });
    await sleep(400);
    await chat.click("#pane-email button[type=submit]");
    await chat.waitForSelector("#pane-code:not([hidden])", { timeout: 5000 });
    text = await visibleText(chat);
    check(6, "Gửi mã → màn nhập mã 6 số (đang chờ mã)", /Em đã gửi mã 6 số tới owner@demo\.test/.test(text) && /Đang chờ mã email/.test(text));
    const mail = JSON.parse(await gw("GET", "/__mail"));
    const code = mail[mail.length - 1].code;
    check(6, "Mã chỉ nằm trong hộp thư giả (không gửi mail thật)", /^\d{6}$/.test(code));
    await sleep(1200);
    await chat.type("#code", "000000".slice(0, 6) === code ? "111111" : "000000", { delay: 60 });
    await chat.waitForFunction(() => /Mã chưa đúng/.test(document.getElementById("login-line").textContent), null, { timeout: 5000 });
    check(6, "Nhập sai → 1 dòng 'Mã chưa đúng'", true);
    await sleep(1000);
    await chat.fill("#code", "");
    await chat.type("#code", code, { delay: 90 });
    await chat.waitForSelector("#view-chat:not([hidden])", { timeout: 8000 });
    check(6, "Nhập đúng → đã đăng nhập", (await chat.textContent("#status-line")) === "Đã đăng nhập · owner@demo.test");
    check(6, "Không còn bong bóng 'hết hạn' khi đã đăng nhập", await petPage.evaluate(() => document.getElementById("javis-note").hidden));
    await sleep(2000);

    // ── 7 · Cài đặt chứa phần nâng cao; Đăng xuất → màn đầu gọn ──
    caption("7 · ⚙ Cài đặt: Dán khoá, Nâng cao, Đăng xuất · màn đầu chỉ còn 1 nút");
    await chat.click("#btn-settings");
    await sleep(500);
    text = await visibleText(chat);
    check(7, "Cài đặt có 'Dán khoá thiết bị', 'Nâng cao · Gateway', 'Đăng xuất'", ["Dán khoá thiết bị", "Nâng cao · Gateway", "Đăng xuất"].every((k) => text.includes(k)));
    await sleep(1800);
    await chat.click("#btn-logout");
    await chat.waitForSelector("#view-login:not([hidden])", { timeout: 5000 });
    await sleep(600);
    text = await visibleText(chat);
    const loginText = await chat.evaluate(() => document.getElementById("view-login").innerText);
    check(7, "Màn đầu không có chữ 'Dán khoá' / 'Nâng cao'", !/Dán khoá|Nâng cao/.test(text), loginText.replace(/\s+/g, " "));
    const parts = await chat.evaluate(() => ({
      buttons: [...document.querySelectorAll("#view-login button")].filter((b) => b.offsetParent).map((b) => b.textContent.trim()),
      lines: [...document.querySelectorAll("#view-login p")].filter((p) => p.offsetParent).length,
    }));
    check(7, "Màn đầu: 1 dòng giải thích + 1 nút lớn 'Đăng nhập JAVIS' + 1 liên kết 'Hoặc nhận mã qua email'",
      parts.lines === 1 && JSON.stringify(parts.buttons) === JSON.stringify(["Đăng nhập JAVIS", "Hoặc nhận mã qua email"]), JSON.stringify(parts));
    check(7, "Đăng xuất → menu 'Đăng nhập JAVIS…'", (await hook(app, "contextLabels")).includes("🔑 Đăng nhập JAVIS…"));
    check(7, "Đăng xuất đã thu hồi trên gateway", JSON.parse(await gw("GET", "/__auth-log")).includes("revoke"), "streams mở: " + (await gw("GET", "/__streams")));
    shot("login-1-man-dau.png");
    await sleep(3000);
    caption("Xong · Đăng nhập 1 lần, dùng lâu dài");
    await sleep(2500);
  } catch (err) {
    check(0, "Tester chạy hết kịch bản", false, err.stack || err.message);
  } finally {
    if (ff) { ff.stdin.write("q"); await new Promise((r) => ff.on("close", r)); }
    await app.close().catch(() => {});
    gwProc.kill();
    const realHomeTouched = (() => {
      try { return /javis-012|clawd-hook/.test(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8")); } catch { return false; }
    })();
    check(0, "~/.claude/settings.json thật không bị đụng (không có javis-012 / clawd-hook)", !realHomeTouched);
    fs.writeFileSync(path.join(OUT, "results-login.json"), JSON.stringify({ results, captions, home, video: RECORD ? video : null }, null, 2));
    fs.rmSync(home, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
