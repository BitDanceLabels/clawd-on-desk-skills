// Tester 0.12.0 — đóng vai anh Nhựt dùng 5 hạng mục trên gateway GIẢ (LLM/TTS giả, không gọi AI thật).
// Chạy trong xvfb (run-tester.sh). Quay video x11grab song song, chụp 5 ảnh, ghi kết quả JSON.
"use strict";
// playwright-core is not an app dependency: `npm i --no-save playwright-core` first.
const { _electron: electron } = require("playwright-core");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

// Run from the repo: APP = repo root. Video/shots go to $JAVIS_E2E_OUT (default ./e2e-out).
const APP = process.env.JAVIS_APP_DIR || path.resolve(__dirname, "..");
const OUT = process.env.JAVIS_E2E_OUT || path.resolve(__dirname, "..", "e2e-out");
const SHOTS = path.join(OUT, "shots");
const GW_PORT = 18999;
const GW = `http://127.0.0.1:${GW_PORT}`;
const RECORD = process.env.RECORD !== "0";
const results = [];
const captions = [];
let t0 = Date.now();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64u = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

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

async function main() {
  // ── fake HOME: upgraded from 0.11 (prefs saved "en" as the old default), paired with a fake key ──
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "javis012-tester-"));
  const ud = path.join(home, ".config", "clawd-on-desk");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(ud, "clawd-prefs.json"), JSON.stringify({ lang: "en", x: 300, y: 520, size: "M", characterSkin: "live2d:hiyori" }));
  fs.writeFileSync(path.join(ud, "javis-device-key.json"), JSON.stringify({ v: 1, email: "owner@demo.test", plain: "jvk_FAKEFAKEFAKEFAKEFAKEFAKE" }));
  const clipK = crypto.randomBytes(32);

  const gwProc = spawn(process.execPath, [path.join(__dirname, "fake-gateway.js"), String(GW_PORT)], {
    env: { ...process.env, CLIP_SEED_K: b64u(clipK), CLIP_CRYPTO: path.join(APP, "src", "javis-clip-crypto.js") }, stdio: "ignore",
  });
  await sleep(600);

  let ff = null;
  const video = path.join(OUT, "nghiem-thu-raw.mp4");
  if (RECORD) {
    ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "x11grab", "-video_size", "1440x900", "-framerate", "12", "-i", process.env.DISPLAY,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", video], { stdio: ["pipe", "inherit", "inherit"] });
  }
  t0 = Date.now();
  caption("JAVIS 0.12.0 · nghiệm thu trên gateway giả");

  const app = await electron.launch({
    executablePath: path.join(APP, "node_modules", "electron", "dist", "electron"),
    // xvfb has no GPU: software WebGL so Live2D (Hiyori) can render in the recording.
    args: [APP, "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: {
      ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"),
      JAVIS_GATEWAY_URL: GW, BUMBEE_WIKI_URL: `${GW}/wiki`, BUMBEE_GATEWAY_URL: GW,
      JAVIS_TEST_HOOKS: "1", CLAWD_DEVTOOLS: "0",
    },
  });
  // Never open a real browser from the test: record the URL instead.
  await T(app, ({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u); }; });
  await sleep(7000);
  const petPage = await findWindow(app, "src/index.html");
  // Remember every note the character shows (they disappear after a few seconds).
  await petPage.evaluate(() => {
    window.__notes = [];
    const n = document.getElementById("javis-note");
    new MutationObserver(() => { if (!n.hidden) window.__notes.push({ text: n.textContent, at: Date.now() }); }).observe(n, { attributes: true, childList: true, characterData: true, subtree: true });
  });

  try {
    // ── 1 · Menu tiếng Việt ──
    caption("1/5 · Menu tiếng Việt (mặc định)");
    check(1, "Ngôn ngữ chuyển sang tiếng Việt sau khi cập nhật từ bản cũ (prefs 'en')", (await hook(app, "lang")) === "vi");
    await sleep(2500); // wait first inbox load
    const labels = await hook(app, "contextLabels");
    check(1, "Mục đầu menu là 'Việc chờ anh' kèm số việc", /^📋 Việc chờ anh \(\d+\)$/.test(labels[0]), labels[0]);
    for (const want of ["🔊 Đọc báo cáo hôm nay", "📎 AI Clipboard", "💬 Trò chuyện với JAVIS…", "🔗 Ghép đôi máy này…", "Nhân vật", "Cỡ nhân vật", "Đi ngủ (không làm phiền)", "Ngôn ngữ", "Phím tắt AI Clipboard", "Thoát"]) {
      check(1, `Có mục "${want}"`, labels.some((l) => l.startsWith(want)));
    }
    const english = labels.filter((l) => /\b(Mode|Open|Show|Hide|Check|Update|Sleep|Quit|Size|Language|Character|Pair|Sessions|Rabbit)\b/.test(l));
    check(1, "Không còn chữ tiếng Anh lẫn trong menu (trừ tên riêng)", english.length === 0, english.join(" | "));
    check(1, "Giữ tiếng Anh / tiếng Trung để chọn", labels.includes("English") && labels.includes("中文") && labels.includes("Tiếng Việt"));
    await hook(app, "popupMenu");
    await sleep(4500);
    shot("1-menu-tieng-viet.png");
    await hook(app, "closeMenu");
    await sleep(500);

    // ── 2 · Việc chờ anh ──
    caption("2/5 · Việc chờ anh: xem, Duyệt 1 chạm, cô bé báo việc mới");
    await hook(app, "clickMenu", "📋 Việc chờ anh");
    const inbox = await findWindow(app, "inbox.html");
    await inbox.waitForSelector("#list .item", { timeout: 10000 });
    await sleep(800);
    const rows = await inbox.$$eval("#list .item b", (els) => els.map((e) => e.textContent));
    check(2, "Cửa sổ hiện mỗi việc 1 dòng (3 việc + 1 phiếu duyệt)", rows.length === 4, rows.join(" | "));
    check(2, "Phiếu của chủ nhân chỉ có nút Mở trên web (không duyệt bằng khoá thiết bị)",
      await inbox.$eval('#list .item[data-id="tk_ads200"]', (li) => !![...li.querySelectorAll("button")].find((b) => b.textContent === "Mở trên web") && ![...li.querySelectorAll("button")].find((b) => b.textContent === "Duyệt")));
    shot("2-viec-cho-anh.png");
    await sleep(3000);
    await inbox.click('#list .item[data-id="idea_lich1111"] button.primary');
    await inbox.waitForFunction(() => !document.querySelector('#list .item[data-id="idea_lich1111"]'), null, { timeout: 8000 });
    check(2, "Bấm Duyệt → gọi POST /fleet/ideas/<id>/task/approve, dòng biến mất", (await gw("GET", "/__log")).includes("POST /fleet/ideas/idea_lich1111/task/approve auth=yes"));
    check(2, "Số việc giảm còn 3", (await inbox.textContent("#count")) === "3");
    await inbox.click('#list .item[data-id="tk_ads200"] button');
    await sleep(300);
    const opened = await T(app, () => globalThis.__opened.slice());
    check(2, "Mở trên web → trang phiếu trên JAVIS web", opened.includes("https://javis.bumbee.asia/?ticket=tk_ads200"), opened.join(" "));
    await sleep(1200);
    // A new task arrives on the gateway → /fleet/stream event → refresh → the character says so.
    await gw("POST", "/__add-task", { title: "Duyệt bài Học viện: mẹo chụp ảnh sản phẩm" });
    const addAt = Date.now();
    await inbox.close();

    // ── 3 · Thư ký đọc báo cáo ──
    caption("3/5 · Thư ký đọc báo cáo hôm nay (giọng + nhép miệng, có nút Dừng)");
    await hook(app, "clickMenu", "🔊 Đọc báo cáo hôm nay");
    const sec = await findWindow(app, "secretary.html");
    await sec.waitForFunction(() => document.getElementById("text").textContent.startsWith("Chào anh"), null, { timeout: 15000 });
    const text = await sec.textContent("#text");
    const secs = Number(((await sec.textContent("#len")).match(/\d+/) || [999])[0]);
    check(3, "Báo cáo rút gọn ≤ 90 giây", secs <= 90, `${secs}s · ${text.slice(0, 120)}`);
    check(3, "Có các mục: chờ duyệt, kẹt, đã xong, đang chạy, nhắc việc", ["Chờ anh duyệt", "Đang kẹt", "Đã xong", "Đang chạy", "Nhắc việc hôm nay"].every((k) => text.includes(k)));
    await sec.waitForFunction(() => /Đang đọc/.test(document.getElementById("voice-text").textContent), null, { timeout: 8000 });
    const voiceLabel = await sec.textContent("#voice-text");
    check(3, "Linux không có bsay → dùng giọng JAVIS (TTS gateway giả)", voiceLabel.includes("Giọng JAVIS (máy chủ)"), voiceLabel);
    check(3, "Đã gọi POST /fleet/voice/tts (TTS giả, không gọi AI thật)", (await gw("GET", "/__log")).includes("POST /fleet/voice/tts auth=yes"));
    const pet = petPage;
    const mouth = [];
    for (let i = 0; i < 12; i++) { mouth.push(await pet.evaluate(() => (window.ClawdLive2DRenderer && window.ClawdLive2DRenderer.getMouth) ? window.ClawdLive2DRenderer.getMouth() : -1)); await sleep(150); }
    check(3, "Cô bé nhép miệng theo giọng (độ mở miệng thay đổi)", Math.max(...mouth) > 0.1 && new Set(mouth.map((m) => m.toFixed(2))).size > 3, mouth.map((m) => m.toFixed(2)).join(","));
    check(3, "Menu đổi thành '⏹ Dừng đọc' khi đang đọc", (await hook(app, "contextLabels")).includes("⏹ Dừng đọc"));
    shot("3-thu-ky-doc-bao-cao.png");
    await sleep(11000);
    await sec.click("#btn-stop");
    await sec.waitForFunction(() => /Đã dừng/.test(document.getElementById("voice-text").textContent), null, { timeout: 5000 });
    check(3, "Nút Dừng dừng ngay, miệng khép lại", !(await hook(app, "isReading")) && (await pet.evaluate(() => window.ClawdLive2DRenderer.getMouth())) === 0);

    // the "new task" note from step 2 (stream event / next refresh → gentle note)
    await pet.waitForFunction(() => window.__notes.length > 0, null, { timeout: Math.max(1000, 35000 - (Date.now() - addAt)) }).catch(() => {});
    const notes = await pet.evaluate(() => window.__notes.map((n) => n.text));
    check(2, "Có việc mới → cô bé báo nhẹ trên đầu nhân vật", notes.some((t) => /có 1 việc mới chờ anh/.test(t)), notes.join(" | "));
    await sleep(1500);
    await sec.close();

    // ── 4 · AI Clipboard ──
    caption("4/5 · AI Clipboard: phím tắt ⌘⇧⌥V / Ctrl+Shift+Alt+V, ô dán nhanh");
    const sc = await hook(app, "clipShortcut");
    check(4, "Phím tắt mặc định Ctrl/⌘+Shift+Alt+V đã đăng ký", sc.acc === "CommandOrControl+Shift+Alt+V" && sc.registered, JSON.stringify(sc));
    check(4, "Mục menu hiện phím tắt", (await hook(app, "contextLabels")).some((l) => l.startsWith("📎 AI Clipboard") && l.includes("Ctrl+Shift+Alt+V")));
    await hook(app, "clickMenu", "📎 AI Clipboard");
    const clip = await findWindow(app, "clip.html");
    await clip.waitForSelector("#s-need-key:not(.hidden)", { timeout: 10000 });
    check(4, "Máy mới: hướng dẫn nối Clipboard bằng link ghép", true);
    await sleep(1200);
    await clip.fill("#link", `${GW}/clip#p=PAIR1234.${b64u(clipK)}`);
    await clip.click("#btn-link");
    await clip.waitForSelector("#s-ready:not(.hidden) #recent .item", { timeout: 10000 }).catch(async (e) => {
      const dbg = await clip.evaluate(() => ({ msg: document.getElementById("msg").textContent, sections: [...document.querySelectorAll("main > section")].map((x) => x.id + ":" + !x.classList.contains("hidden")), recent: document.getElementById("recent").innerHTML.slice(0, 300) }));
      throw new Error("clip not ready: " + JSON.stringify(dbg));
    });
    const first = await clip.textContent("#recent .item b");
    check(4, "Giải mã được mục gửi từ iPhone (mã hoá đầu-cuối)", first.includes("12 Nguyễn Huệ"), first);
    await clip.click("#quick");
    await clip.type("#quick", "Báo giá hoa khai trương: 1.200.000đ, giao trong ngày", { delay: 25 });
    await clip.click("#btn-send");
    await clip.waitForFunction(() => /Đã gửi/.test(document.getElementById("send-msg").textContent), null, { timeout: 8000 });
    const items = await clip.$$eval("#recent .item b", (els) => els.map((e) => e.textContent));
    check(4, "Ô dán nhanh → Gửi → mục mới đứng đầu", items[0].startsWith("Báo giá hoa khai trương"), items.join(" | "));
    const log = await gw("GET", "/__log");
    check(4, "Chỉ gửi bản mã lên máy chủ", log.includes("POST /fleet/clip/items auth=yes"));
    shot("4-ai-clipboard.png");
    await clip.click("#recent .item:nth-child(2) button");
    await sleep(400);
    check(4, "Nút Chép đưa nội dung vào clipboard máy", (await T(app, ({ clipboard }) => clipboard.readText())).includes("12 Nguyễn Huệ"));
    await sleep(3500);
    await clip.close();

    // ── 5 · Không đè cửa sổ + ghép đôi dễ hơn ──
    caption("5/5 · Chat và bảng học từ vựng không đè nhau · ghép đôi 3 bước");
    await hook(app, "openChat");
    await sleep(2500);
    await hook(app, "openVocabChallenge");
    await sleep(2500);
    const b = await hook(app, "bounds");
    const ov = (a, c) => a && c && a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height;
    check(5, "Bảng học từ vựng tự lùi, không đè cửa sổ chat", b.chat && b.challenge && (!b.challenge.visible || !ov(b.chat, b.challenge)), JSON.stringify(b));
    shot("5-khong-de-cua-so.png");
    await sleep(3500);
    const chat = await findWindow(app, "javis-desk://app/index.html");
    await chat.click("#btn-settings");
    await sleep(800);
    const steps = await chat.$$eval("#pair-steps > li > b", (els) => els.map((e) => e.textContent));
    check(5, "Màn ghép đôi ghi rõ 3 bước", steps.length === 3 && steps[1].includes("Mở trang duyệt trên web"), steps.join(" | "));
    // Unpair to show the guide for a computer that is not paired yet.
    await chat.evaluate(() => { document.querySelector("#view-pair details:last-of-type").open = true; });
    await chat.click("#btn-unpair");
    await sleep(600);
    await chat.click("#btn-pair-open");
    await sleep(1200);
    const opened2 = await T(app, () => globalThis.__opened.slice());
    check(5, "Nút 'Mở trang duyệt trên web' lấy mã rồi mở trang duyệt có sẵn mã", opened2.some((u) => u.includes("/auth/device.html?code=JAVS-2026")), opened2.join(" "));
    check(5, "Bước 3 được đánh dấu đang làm", await chat.$eval("#step-3", (li) => li.classList.contains("current")));
    shot("6-ghep-doi-3-buoc.png");
    await sleep(2500);
    await hook(app, "clickMenu", "📋 Việc chờ anh");
    const inbox2 = await findWindow(app, "inbox.html");
    await inbox2.waitForSelector("#not-paired:not(.hidden)", { timeout: 8000 });
    check(2, "Chưa ghép đôi → hướng dẫn ghép đôi 3 bước", (await inbox2.$$eval("#not-paired .steps li", (l) => l.length)) === 3);
    check(1, "Menu báo 'cần ghép đôi'", (await hook(app, "contextLabels"))[0] === "📋 Việc chờ anh (cần ghép đôi)");
    await sleep(3500);
    caption("Xong · JAVIS 0.12.0");
    await sleep(2500);

    if (ff) { ff.stdin.write("q"); await new Promise((r) => ff.on("close", r)); ff = null; }

    // ── Off-video: Sleep (DND) means no note ──
    fs.writeFileSync(path.join(ud, "javis-device-key.json"), JSON.stringify({ v: 1, email: "owner@demo.test", plain: "jvk_FAKEFAKEFAKEFAKEFAKEFAKE" }));
    await chat.evaluate(() => { for (const d of document.querySelectorAll("#view-pair details")) d.open = true; });
    await chat.fill("#paste-key", "jvk_FAKEFAKEFAKEFAKEFAKEFAKE");
    await chat.click("#btn-paste");
    await sleep(2500);
    await hook(app, "dnd", true);
    await sleep(1000);
    await pet.evaluate(() => { window.__notes = []; });
    await sleep(1500);
    await gw("POST", "/__add-task", { title: "Việc mới lúc anh đang ngủ" });
    await sleep(27000);
    const notesAsleep = await pet.evaluate(() => window.__notes.length);
    check(2, "Đang ngủ (không làm phiền) → cô bé không báo", notesAsleep === 0, `${notesAsleep} ghi chú`);
    check(1, "Menu vẫn cập nhật số việc khi đang ngủ", /^📋 Việc chờ anh \(\d+\)$/.test((await hook(app, "contextLabels"))[0]));
  } catch (err) {
    check(0, "Tester chạy hết kịch bản", false, err.stack || err.message);
  } finally {
    if (ff) { ff.stdin.write("q"); await new Promise((r) => ff.on("close", r)); }
    await app.close().catch(() => {});
    gwProc.kill();
    fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify({ results, captions, home }, null, 2));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
