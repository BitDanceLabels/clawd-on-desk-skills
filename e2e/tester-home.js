// Tester "Trang chủ JAVIS" — đóng vai anh Nhựt mở cửa sổ JAVIS và bấm từng ô, trên gateway GIẢ
// theo CONTRACT v1.1 (fake-gateway.js: LLM/TTS giả, không AI thật, không mạng ngoài).
// Chạy trong xvfb (run-tester.sh home). HOME + userData tạm: không đụng ~/.claude thật.
// Chụp ảnh cửa sổ JAVIS từng tab vào $JAVIS_E2E_OUT/shots/home-*.png, ghi kết quả JSON.
"use strict";
const { _electron: electron } = require("playwright-core");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const APP = process.env.JAVIS_APP_DIR || path.resolve(__dirname, "..");
const OUT = process.env.JAVIS_E2E_OUT || path.resolve(__dirname, "..", "e2e-out");
const SHOTS = path.join(OUT, "shots");
const GW_PORT = 18996;
const GW = `http://127.0.0.1:${GW_PORT}`;
const LEGACY_KEY = "jvk_FAKEFAKEFAKEFAKEFAKEFAKE";
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function check(step, name, ok, detail = "") {
  results.push({ step, name, ok: !!ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? "PASS" : "FAIL"} [${step}] ${name}${detail ? " — " + String(detail).slice(0, 160) : ""}`);
}

function req(base, method, p, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(`${base}${p}`, { method, headers: { "Content-Type": "application/json" } }, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(d));
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
const gw = (method, p, body) => req(GW, method, p, body);

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

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

async function openTab(page, tab) {
  await page.click(`.tile[data-tab="${tab}"]`);
  await page.waitForSelector(`#tab-${tab}:not([hidden])`, { timeout: 5000 });
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "javis-home-tester-"));
  const ud = path.join(home, ".config", "clawd-on-desk");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(ud, "clawd-prefs.json"), JSON.stringify({ lang: "vi", x: 80, y: 560, size: "M", characterSkin: "live2d:hiyori" }));
  fs.writeFileSync(path.join(ud, "javis-device-key.json"), JSON.stringify({ v: 1, email: "owner@demo.test", plain: LEGACY_KEY }));

  const clipK = crypto.randomBytes(32);
  const gwProc = spawn(process.execPath, [path.join(__dirname, "fake-gateway.js"), String(GW_PORT)], {
    env: { ...process.env, CLIP_SEED_K: b64u(clipK), CLIP_CRYPTO: path.join(APP, "src", "javis-clip-crypto.js") }, stdio: "ignore",
  });
  await sleep(600);
  // Like the owner's Mac today: the gateway does not let machines chat yet (403).
  await gw("POST", "/__chat-forbidden", { on: true });

  const app = await electron.launch({
    executablePath: path.join(APP, "node_modules", "electron", "dist", "electron"),
    args: [APP, "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: {
      ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"),
      JAVIS_GATEWAY_URL: GW, BUMBEE_WIKI_URL: `${GW}/wiki`, BUMBEE_GATEWAY_URL: GW,
      JAVIS_TEST_HOOKS: "1", CLAWD_DEVTOOLS: "0",
    },
  });
  fs.mkdirSync(OUT, { recursive: true });
  const appLog = fs.createWriteStream(path.join(OUT, "app-home.log"));
  app.process().stdout.pipe(appLog);
  app.process().stderr.pipe(appLog);
  // "Trình duyệt mặc định" = only recorded (no real browser, no real web).
  await T(app, ({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u); }; });
  await sleep(6000);

  try {
    // Two agent sessions on this machine, as the Claude Code / Codex hooks report them.
    const rt = JSON.parse(fs.readFileSync(path.join(home, ".clawd", "runtime.json"), "utf8"));
    const hookBase = `http://127.0.0.1:${rt.port}`;
    await req(hookBase, "POST", "/state", { state: "working", session_id: "home-claude-01", event: "PreToolUse", cwd: "/Users/nhut/work/javis-g1", agent_id: "claude-code", source_pid: process.pid, agent_pid: process.pid });
    await req(hookBase, "POST", "/state", { state: "idle", session_id: "home-codex-02", event: "SessionStart", cwd: "/Users/nhut/work/bumbee-mv", agent_id: "codex", agent_pid: process.pid });

    // ── 1 · Cửa sổ chính = Trang chủ, chat bị 403 ──
    await hook(app, "openChat");
    const page = await findWindow(app, "javis-desk://app/index.html");
    page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
    page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
    await page.waitForSelector("#view-chat:not([hidden])", { timeout: 10000 });
    await page.evaluate(() => localStorage.setItem("javis.home.tab", "chat"));
    await page.reload();
    await page.waitForSelector("#view-chat:not([hidden])", { timeout: 10000 });
    const tiles = await page.$$eval(".tile", (els) => els.filter((e) => e.offsetParent).map((e) => e.querySelector("span").firstChild.textContent.trim()));
    check(1, "Thanh ô lớn ngay đầu có đủ 7 chức năng", ["Trò chuyện", "Cần anh duyệt", "Báo cáo hôm nay", "AI Clipboard", "Học tiếng Anh", "Phiên trên máy", "JAVIS OS"].every((t) => tiles.includes(t)), tiles.join(" · "));
    const tileBox = await page.$eval("#tiles", (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    check(1, "Các ô nằm ngay dưới thanh tiêu đề (không phải tìm trong menu)", tileBox.top < 90 && tileBox.bottom < 200, JSON.stringify(tileBox));
    await page.waitForSelector("#chat-banner:not([hidden])", { timeout: 15000 }).catch(() => {});

    const banner = await page.evaluate(() => (document.getElementById("chat-banner").hidden ? "" : document.getElementById("chat-banner").innerText));
    check(1, "Chat 403 → câu dễ hiểu + 'Chat sẽ dùng được khi máy chủ cập nhật xong'", /máy chủ trả 403/.test(banner) && /Chat sẽ dùng được khi máy chủ cập nhật xong/.test(banner), banner.replace(/\s+/g, " "));
    await page.waitForFunction(() => { const c = document.querySelector("javis-companion"); return c && c.shadowRoot && c.shadowRoot.querySelector(".panel"); }, null, { timeout: 15000 }).catch(() => {});
    await sleep(1000);
    const bannerClear = await page.evaluate(() => {
      const b = document.getElementById("chat-banner").getBoundingClientRect();
      const c = document.querySelector("javis-companion");
      const panel = c && c.shadowRoot && c.shadowRoot.querySelector(".panel");
      return { bottom: Math.round(b.bottom), panelTop: panel ? Math.round(panel.getBoundingClientRect().top) : null };
    });
    check(1, "Dòng báo nằm trọn phía trên khung chat (không bị che)", bannerClear.panelTop === null || bannerClear.bottom <= bannerClear.panelTop, JSON.stringify(bannerClear));
    const credit = await page.evaluate(() => !document.getElementById("credit").hidden && /Live2D Inc/.test(document.getElementById("credit").innerText));
    check(1, "Hiyori + credit Live2D nhỏ vẫn hiện (credit trong khung chat khi có dòng báo)", credit || await page.evaluate(() => { const c = document.querySelector("javis-companion"); return !!(c && c.shadowRoot && /Live2D Inc/.test(c.shadowRoot.textContent)); }));
    await sleep(1500);
    await shot(page, "home-1-tro-chuyen-cho-may-chu.png");

    // Gateway updated → chat works, the line goes away by itself.
    await gw("POST", "/__chat-forbidden", { on: false });
    await page.reload();
    await page.waitForSelector("#view-chat:not([hidden])", { timeout: 10000 });
    await page.waitForSelector("#chat-banner[hidden]", { state: "attached", timeout: 15000 }).catch(() => {});
    check(1, "Máy chủ cập nhật xong → dòng báo tự ẩn, chat chạy (cùng phiên web)", await page.evaluate(() => document.getElementById("chat-banner").hidden));
    await page.waitForFunction(() => { const c = document.querySelector("javis-companion"); return c && c.shadowRoot && /trả lời giả/.test(c.shadowRoot.textContent); }, null, { timeout: 15000 }).catch(() => {});
    await sleep(2000);
    await shot(page, "home-2-tro-chuyen.png");

    // ── 2 · Cần anh duyệt ──
    await openTab(page, "inbox");
    await page.waitForSelector("#inbox-list .item", { timeout: 10000 });
    const rows = await page.$$eval("#inbox-list .item b", (els) => els.map((e) => e.textContent));
    check(2, "Việc chờ anh từ /fleet/desk/pending, mỗi việc/phiếu 1 dòng (4 việc + 1 phiếu)", rows.length === 5 && rows.includes("Chi 200.000đ chạy thử quảng cáo TikTok"), rows.join(" / "));
    check(2, "Số đếm trên ô = total", (await page.textContent("#badge-inbox")) === "5" && await page.isVisible("#badge-inbox"));
    const log = await gw("GET", "/__log");
    check(2, "Gọi GET /fleet/desk/pending (không dùng /fleet/home/tasks)", log.includes("GET /fleet/desk/pending auth=yes") && !log.includes("/fleet/home/tasks"));
    await page.click("#inbox-list .item:first-child button");
    await sleep(400);
    let opened = await T(app, () => globalThis.__opened.slice());
    check(2, "Nút 'Mở để duyệt' mở web", /^https:\/\/javis\.bumbee\.asia\/\?(task|ticket)=/.test(opened[opened.length - 1] || ""), opened[opened.length - 1]);
    await shot(page, "home-3-can-anh-duyet.png");

    // ── 3 · Báo cáo hôm nay ──
    await openTab(page, "report");
    await page.waitForFunction(() => /Báo cáo hôm nay/.test(document.getElementById("report-text").textContent), null, { timeout: 10000 });
    const rep = await page.textContent("#report-text");
    check(3, "Đọc chữ báo cáo ngay trong tab", /Chờ anh duyệt/.test(rep) && /đã xong|Đã xong/.test(rep), rep.slice(0, 120));
    await page.click("#report-read");
    await page.waitForFunction(() => /Đang đọc/.test(document.getElementById("report-voice").textContent), null, { timeout: 10000 }).catch(() => {});
    check(3, "Nút 'Đọc bằng giọng' đọc to (TTS giả), có nút Dừng", /Đang đọc/.test(await page.textContent("#report-voice")) && !(await page.isDisabled("#report-stop")), await page.textContent("#report-voice"));
    check(3, "Đọc trong tab, không mở thêm cửa sổ", !app.windows().some((p) => p.url().includes("secretary.html")));
    await sleep(1200);
    await shot(page, "home-4-bao-cao.png");
    await page.click("#report-stop");
    await page.waitForFunction(() => /Đã dừng/.test(document.getElementById("report-voice").textContent), null, { timeout: 5000 }).catch(() => {});
    check(3, "Bấm Dừng là dừng ngay", !(await hook(app, "isReading")));
    check(3, "Đã gọi POST /fleet/voice/tts (giả)", (await gw("GET", "/__log")).includes("POST /fleet/voice/tts"));

    // ── 4 · AI Clipboard ──
    await openTab(page, "clip");
    await page.waitForSelector("#clip-setup:not([hidden]), #clip-ready:not([hidden])", { timeout: 10000 });
    if (await page.isVisible("#clip-setup")) {
      check(4, "Máy mới: tab báo cần nối + nút mở cửa sổ thiết lập", /chưa nối/.test(await page.textContent("#clip-setup-text")));
      await page.click("#clip-setup-btn");
      const clip = await findWindow(app, "clip.html");
      await clip.waitForSelector("#s-need-key:not(.hidden)", { timeout: 10000 });
      await clip.fill("#link", `${GW}/clip#p=PAIR1234.${b64u(clipK)}`);
      await clip.click("#btn-link");
      await clip.waitForSelector("#s-ready:not(.hidden)", { timeout: 10000 });
      await clip.close();
      await openTab(page, "chat");
      await openTab(page, "clip");
    }
    await page.waitForSelector("#clip-ready:not([hidden]) #clip-recent .item", { timeout: 10000 });
    await page.click("#clip-quick");
    await page.type("#clip-quick", "Báo giá hoa khai trương: 1.200.000đ, giao trong ngày", { delay: 15 });
    await page.click("#clip-send");
    await page.waitForFunction(() => /Đã gửi/.test(document.getElementById("clip-msg").textContent), null, { timeout: 8000 }).catch(() => {});
    const clipItems = await page.$$eval("#clip-recent .item b", (els) => els.map((e) => e.textContent));
    check(4, "Ô dán nhanh → Gửi → mục mới đứng đầu, giải mã được mục từ iPhone", /Báo giá hoa/.test(clipItems[0] || "") && clipItems.some((t) => /Nguyễn Huệ/.test(t)), clipItems.join(" / "));
    await shot(page, "home-5-ai-clipboard.png");

    // ── 5 · Học tiếng Anh ──
    await openTab(page, "english");
    await page.waitForFunction(() => /^\d+$/.test(document.getElementById("eng-total").textContent), null, { timeout: 5000 });
    const due = await page.textContent("#eng-due");
    const total = await page.textContent("#eng-total");
    check(5, "Số từ đến hạn + số từ trong kho", Number(total) > 0 && /^\d+$/.test(due), `đến hạn ${due} / kho ${total}`);
    await shot(page, "home-6-hoc-tieng-anh.png");
    await page.click('[data-vocab="cards"]');
    const vocab = await findWindow(app, "vocab-tinder.html", 10000).catch(() => null);
    check(5, "Nút 'Thẻ từ vựng' mở thẻ từ vựng đang có", !!vocab);
    if (vocab) await vocab.close();

    // ── 6 · Phiên đang chạy trên máy này ──
    await openTab(page, "sessions");
    await page.waitForSelector("#sessions-list .item", { timeout: 8000 });
    const sess = await page.$$eval("#sessions-list .item b", (els) => els.map((e) => e.textContent));
    check(6, "Danh sách phiên Claude/Codex (theo hook)", sess.includes("Claude Code · javis-g1") && sess.includes("Codex · bumbee-mv"), sess.join(" / "));
    check(6, "Phiên đang làm đứng đầu", sess[0] === "Claude Code · javis-g1");
    await shot(page, "home-7-phien-tren-may.png");

    // ── 7 · JAVIS OS mở trên web ──
    await openTab(page, "web");
    await page.waitForSelector("#web-pages .big-card", { timeout: 5000 });
    const cards = await page.$$eval("#web-pages .big-card", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
    check(7, "4 ô Bàn làm việc · Kho tài sản · Phiên làm việc · Graph, ghi 'mở trên web'", ["Bàn làm việc", "Kho tài sản", "Phiên làm việc", "Graph"].every((t) => cards.some((c) => c.startsWith(t) && /mở trên web/.test(c))), cards.join(" / "));
    const want = { desk: "?app=desk", assets: "?app=asset-hub", sessions: "?app=work-groups", graph: "?app=fleet-map" };
    for (const [id, q] of Object.entries(want)) {
      await page.click(`#web-pages [data-page="${id}"]`);
      await sleep(200);
      opened = await T(app, () => globalThis.__opened.slice());
      check(7, `Ô ${id} mở đúng trang JAVIS OS (${q})`, opened[opened.length - 1] === `https://javis.bumbee.asia/${q}`, opened[opened.length - 1]);
    }
    await shot(page, "home-8-javis-os-web.png");

    // ── 8 · Giữ nguyên đăng nhập + hook ──
    const settings = JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
    check(8, "Không đăng ký hook WorktreeCreate", !(settings.hooks && settings.hooks.WorktreeCreate));
    check(8, "Vẫn đăng nhập bằng khoá cũ, không đổi luồng", (await hook(app, "authState")).signedIn === true);
  } catch (err) {
    check(0, "Tester chạy hết kịch bản", false, err && err.stack);
  } finally {
    await app.close().catch(() => {});
    gwProc.kill();
    fs.rmSync(home, { recursive: true, force: true });
  }
  const pass = results.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(OUT, "tester-home.json"), JSON.stringify({ pass, total: results.length, results }, null, 2));
  console.log(`\n${pass}/${results.length} đạt`);
  process.exit(pass === results.length ? 0 : 1);
}

main();
