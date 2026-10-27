// Tester 0.13.1 — chạy app thật (Electron, xvfb) trên gateway GIẢ (không AI thật, không mạng ngoài):
//   1. máy "trong tailnet" (gw.fake.ts.net → 127.0.0.1) tự đăng nhập, không bước ghép đôi
//   2. bé + bảng hiển hoá "Việc cần anh"
//   3. bấm thẻ việc chờ → <javis-ask-box> mở ngay trong app, có tóm tắt + nút + ô nhắn
//   4. chọn + nhắn + Gửi → POST /fleet/tasklife/<id>/answer
//   5. thẻ gộp (group_ids) → link sâu mở bằng trình duyệt hệ thống (không mở trong app)
// HOME + userData tạm: không đụng ~/.claude thật. Ảnh: $JAVIS_E2E_OUT/shots/*.png
//   NODE_PATH=<dir có playwright-core> xvfb-run -a -s "-screen 0 1440x900x24" node e2e/tester-0131.js
"use strict";
const { _electron: electron } = require("playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const APP = process.env.JAVIS_APP_DIR || path.resolve(__dirname, "..");
const OUT = process.env.JAVIS_E2E_OUT || path.resolve(__dirname, "..", "e2e-out");
const SHOTS = path.join(OUT, "shots");
const PORT = 18997;
const HOST = "gw.fake.ts.net";
const GW = `http://${HOST}:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + String(detail).slice(0, 200) : ""}`);
}

// ── fake gateway ──
const now = () => Math.floor(Date.now() / 1000);
const log = [];
const answers = [];
const PENDING = () => ({
  at: now(),
  items: [
    {
      id: "t-101", kind: "task", team: "media", title: "Đăng bài FB 'Cà phê sáng Sài Gòn' tối nay",
      owner: {
        q: "Anh cho đăng bài này lên FB cá nhân lúc 20:00 tối nay không?",
        why_owner: "Bài đăng trên FB cá nhân của anh — luật cần anh duyệt.",
        options: [{ key: "yes", label: "Đăng 20:00" }, { key: "later", label: "Để mai" }, { key: "change", label: "Sửa lại" }],
        recommend: "yes", deadline: now() + 5 * 3600,
        consequence: "Lỡ khung giờ vàng tối nay, dời sang mai.",
        detail: "Bài 180 chữ + 1 ảnh 4:5, đã qua vision 8.6/10 và legal_check.\nXem bản nháp: https://javis.bumbee.asia/x/draft-101",
      },
    },
    {
      id: "g-7", kind: "task", team: "suno-01", title: "3 bài nhạc mới chờ anh nghe", group_ids: ["s-1", "s-2", "s-3"],
      link: "https://javis.bumbee.asia/?ask=g-7", owner: { q: "Nghe 3 bài và chọn bài đẩy N77" },
    },
  ],
});
const TASKS = () => ({
  waiting: [
    { id: "t-101", title: "Đăng bài FB 'Cà phê sáng Sài Gòn' tối nay", importance: "P1", state_label: "Chờ anh", due: now() + 5 * 3600, owner: { q: "Anh cho đăng bài này lên FB cá nhân lúc 20:00 tối nay không?", recommend: "Đăng 20:00 tối nay" } },
    { id: "g-7", title: "3 bài nhạc mới chờ anh nghe", importance: "P2", state_label: "Chờ anh", owner: { q: "Nghe 3 bài và chọn bài đẩy N77" } },
  ],
  data: [{ id: "t-9", title: "Xưởng Higgs: 6 video ngắn hôm nay", importance: "P2", state_label: "Đang làm" }],
  approvals: [],
});

const server = http.createServer((req, res) => {
  const u = new URL(req.url, GW);
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    log.push(`${req.method} ${u.pathname}`);
    const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    const auth = req.headers.authorization || "";
    if (u.pathname === "/fleet/auth/desktop/tailnet") {
      return send(200, { access_token: "jat_FAKEACCESS", refresh_token: "jvr_FAKEREFRESH", expires_in: 3600, email: "nhut@demo.test", name: "Nhựt" });
    }
    if (u.pathname.startsWith("/fleet/") && auth !== "Bearer jat_FAKEACCESS") return send(401, { error: "unauthorized" });
    if (u.pathname === "/fleet/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(": ok\n\n");
      return; // kept open
    }
    if (u.pathname === "/fleet/whoami") return send(200, { authenticated: true });
    if (u.pathname === "/fleet/home/tasks") return send(200, TASKS());
    if (u.pathname === "/fleet/desk/pending") return send(200, PENDING());
    if (u.pathname === "/fleet/alerts") return send(200, { data: [] });
    const m = u.pathname.match(/^\/fleet\/tasklife\/([^/]+)\/answer$/);
    if (m && req.method === "POST") { answers.push({ id: decodeURIComponent(m[1]), body: JSON.parse(body || "{}") }); return send(200, { ok: true }); }
    // No LLM here at all: chat/voice answer a canned line.
    if (u.pathname === "/fleet/desk/app/latest") return send(404, { error: "none" });
    return send(200, {});
  });
});

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "javis-0131-home-"));
  const userData = path.join(home, "userData");
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), CLAWD_USER_DATA_DIR: userData, JAVIS_GATEWAY_URL: GW, JAVIS_AUTO_UPDATE: "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: require(path.join(APP, "node_modules", "electron")),
    args: [APP, "--no-sandbox", `--host-resolver-rules=MAP ${HOST} 127.0.0.1`],
    env,
    cwd: APP,
  });
  let page = null;
  try {
    // record links the app hands to the system browser
    await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u); }; });
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });

    // 1. silent tailnet sign-in
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await page.evaluate(() => window.javisDesk.status());
      if (st && st.paired) break;
      await sleep(250);
    }
    check("máy tailnet tự đăng nhập (không ghép đôi)", st && st.paired && st.kind === "oauth", JSON.stringify({ paired: st && st.paired, kind: st && st.kind, email: st && st.email }));
    check("đã gọi POST /fleet/auth/desktop/tailnet đúng 1 lần", log.filter((l) => l === "POST /fleet/auth/desktop/tailnet").length === 1, log.slice(0, 6).join(", "));
    await sleep(3200); // greeting bubble
    await page.screenshot({ path: path.join(SHOTS, "0131-1-be-compact.png") });

    // 2. board with "Việc cần anh"
    await page.evaluate(() => window.javisDesk.setMode("open"));
    await sleep(500);
    await page.click('#quick button[data-ask="việc cần anh"]');
    await page.waitForSelector(".task.wait", { timeout: 10000 });
    await sleep(400);
    await page.screenshot({ path: path.join(SHOTS, "0131-2-bang-viec-can-anh.png") });
    check("bảng hiển hoá có thẻ việc chờ anh", (await page.locator(".task.wait").count()) === 2);

    // 3. tap the waiting card → askbox inside the app, focused on it, with a summary
    await page.locator('.task.wait[data-task-id="t-101"]').click();
    const openCard = page.locator('javis-ask-box li.jab-card.open[data-ask-id="t-101"]');
    await openCard.waitFor({ timeout: 10000 });
    await sleep(500);
    const sum = await openCard.locator("dl.jab-sum").innerText();
    check("bấm thẻ → askbox mở trong app, có tóm tắt", /Vì sao cần anh/.test(sum) && /Nếu trễ/.test(sum), sum.replace(/\n/g, " | ").slice(0, 200));
    check("có nút lựa chọn + ô nhắn + Gửi", (await openCard.locator(".jab-opts .jab-btn").count()) === 3 && (await openCard.locator("textarea").count()) === 1 && (await openCard.locator(".jab-send").count()) === 1);
    check("không mở web khi bấm thẻ", (await app.evaluate(() => globalThis.__opened.length)) === 0);
    await page.screenshot({ path: path.join(SHOTS, "0131-3-askbox-tom-tat.png") });

    // 4. answer: choose + message + Gửi (component waits 5 s for "Hoàn tác", then POSTs)
    // the suggested choice comes pre-selected; tapping it again would unselect it
    const pick = openCard.locator(".jab-opts .jab-btn", { hasText: "Đăng 20:00" });
    check("đề xuất được chọn sẵn", (await pick.getAttribute("aria-checked")) === "true");
    if ((await pick.getAttribute("aria-checked")) !== "true") await pick.click();
    await openCard.locator("textarea").fill("Thêm hashtag #caphesaigon giúp anh");
    await openCard.locator(".jab-send").click();
    await sleep(800);
    await page.screenshot({ path: path.join(SHOTS, "0131-4-da-gui-hoan-tac.png") });
    for (let i = 0; i < 30 && !answers.length; i++) await sleep(250);
    const a = answers[0];
    check("Gửi → POST /fleet/tasklife/t-101/answer", a && a.id === "t-101" && a.body.choice === "yes" && /caphesaigon/.test(a.body.text) && a.body.via === "desk", JSON.stringify(a));

    // 5. merged card → deep link in the system browser
    const group = page.locator('javis-ask-box li.jab-card[data-ask-id="g-7"]');
    await group.waitFor({ timeout: 5000 });
    if (!(await group.getAttribute("class")).includes("open")) await group.locator(".jab-head").click();
    await group.locator("a.jab-open").click();
    await sleep(300);
    const opened = await app.evaluate(() => globalThis.__opened);
    check("thẻ gộp → mở link sâu bằng trình duyệt hệ thống", opened.includes("https://javis.bumbee.asia/?ask=g-7"), JSON.stringify(opened));
    await page.screenshot({ path: path.join(SHOTS, "0131-5-the-gop.png") });
    const windows = app.windows().length;
    check("không mở cửa sổ web trong app", windows === 1, `windows=${windows}`);
  } catch (err) {
    check("tester chạy hết", false, err && err.stack);
    if (page) await page.screenshot({ path: path.join(SHOTS, "0131-error.png") }).catch(() => {});
  } finally {
    await app.close().catch(() => {});
    server.close();
    fs.rmSync(home, { recursive: true, force: true });
    fs.writeFileSync(path.join(OUT, "tester-0131.json"), JSON.stringify({ at: new Date().toISOString(), results, gatewayLog: log.slice(0, 80) }, null, 2));
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} PASS`);
    process.exit(failed ? 1 : 0);
  }
}
main();
