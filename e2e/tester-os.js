// Tester JAVIS OS (0.14.0) — bấm thật app Electron (xvfb), chụp ảnh xem thử.
//   1. bấm bé JAVIS → JAVIS OS mở (menu bar, widget, Dock 9 app + Launchpad, nút JAVIS lơ lửng)
//   2. Dock → Hộp thư chung mở cửa sổ (webview module hop-thu-chung, đăng nhập sẵn), chấm sáng chạy
//   3. mở thêm Bàn việc (nhiều cửa sổ, cửa sổ trước có đèn màu, cửa sổ sau xám), thu nhỏ → Dock, mở lại
//   4. Spotlight (Ctrl+Space): gõ "hop thu" → app lên đầu; gõ câu giao việc → dòng "Giao cho JAVIS" (KHÔNG gửi: không gọi bộ não thật)
//   5. Launchpad lọc; 6. banner khách nhắn (dữ liệu giả, không gửi gì) → bấm mở đúng hội thoại
// Gateway: mặc định gateway thật qua tailnet (chỉ đọc + đăng nhập máy như app thật); JAVIS_E2E_GATEWAY để đổi.
// HOME + userData tạm: không đụng ~/.claude thật. Ảnh: $JAVIS_E2E_OUT/shots/*.png
//   NODE_PATH=<dir có playwright-core> xvfb-run -a -s "-screen 0 1512x945x24" node e2e/tester-os.js
"use strict";
const { _electron: electron } = require("playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");

const APP = process.env.JAVIS_APP_DIR || path.resolve(__dirname, "..");
const OUT = process.env.JAVIS_E2E_OUT || path.resolve(__dirname, "..", "e2e-out");
const SHOTS = path.join(OUT, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + String(detail).slice(0, 200) : ""}`);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "javis-os-e2e-"));
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), JAVIS_AUTO_UPDATE: "0", ELECTRON_DISABLE_SECURITY_WARNINGS: "1" };
  if (process.env.JAVIS_E2E_GATEWAY) env.JAVIS_GATEWAY_URL = process.env.JAVIS_E2E_GATEWAY;
  const app = await electron.launch({ executablePath: require(path.join(APP, "node_modules", "electron")), args: [APP, "--no-sandbox"], env, cwd: APP });
  try {
    await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u); }; });
    await app.firstWindow();
    let desk = null;
    for (let i = 0; i < 40 && !desk; i++) {
      desk = app.windows().find((p) => /\/index\.html$/.test(p.url())) || null;
      if (!desk) await sleep(250);
    }
    await desk.waitForLoadState("domcontentloaded");
    let st = null;
    for (let i = 0; i < (process.env.JAVIS_E2E_KEY_FILE ? 12 : 60); i++) {
      st = await desk.evaluate(() => window.javisDesk.status());
      if (st && st.paired) break;
      await sleep(250);
    }
    if (!process.env.JAVIS_E2E_KEY_FILE) check("máy tự đăng nhập JAVIS", st && st.paired, JSON.stringify({ paired: st && st.paired, kind: st && st.kind }));
    // Preview with full owner data: paste an owner key from a file (never printed; temp userData is deleted).
    if (process.env.JAVIS_E2E_KEY_FILE) {
      const key = fs.readFileSync(process.env.JAVIS_E2E_KEY_FILE, "utf8").trim();
      const r = await desk.evaluate((k) => window.javisDesk.pairPasteKey(k), key);
      check("dán khoá chủ nhân cho bản xem thử", r && r.ok, r && r.ok ? "ok" : JSON.stringify(r).slice(0, 80));
    }

    // 1. tap the girl → JAVIS OS
    await sleep(1500);
    const box = await desk.locator("#stage").boundingBox();
    await desk.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    let osPage = null;
    for (let i = 0; i < 40 && !osPage; i++) {
      osPage = app.windows().find((p) => p.url().endsWith("/os.html")) || null;
      if (!osPage) await sleep(250);
    }
    check("bấm bé → JAVIS OS mở", !!osPage);
    if (!osPage) throw new Error("no OS window");
    osPage.on("console", (m) => { if (m.type() === "error") console.log("os console:", m.text().slice(0, 200)); });
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith("/os.html")); w.setBounds({ x: 0, y: 0, width: 1512, height: 945 }); });
    const visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith("/os.html")).isVisible());
    check("cửa sổ JAVIS OS hiện", visible);
    await sleep(3500);
    const dockIds = await osPage.$$eval("#dock .dock-item", (els) => els.map((e) => e.dataset.app));
    check("Dock đủ 9 app + Launchpad", dockIds.length === 10 && dockIds[1] === "crm" && dockIds[9] === "launchpad", dockIds.join(","));
    const mb = await osPage.evaluate(() => ({ host: document.querySelector("#mb-host span").textContent, clock: document.getElementById("mb-clock").textContent }));
    check("menu bar: máy + giờ VN", mb.host && /\d{2}:\d{2}/.test(mb.clock), JSON.stringify(mb));
    await osPage.screenshot({ path: path.join(SHOTS, "os-1-desktop.png") });

    // 2. Dock → CRM window
    await osPage.click('#dock [data-app="crm"]');
    await sleep(600);
    check("Hộp thư chung mở cửa sổ", await osPage.$('.win[data-app="crm"]') !== null);
    const src = await osPage.$eval('.win[data-app="crm"] webview', (w) => w.getAttribute("src"));
    check("cửa sổ nhúng module hop-thu-chung", /\?module=hop-thu-chung/.test(src), src);
    check("chấm sáng dưới icon đang chạy", await osPage.$('#dock [data-app="crm"].running') !== null);
    for (let i = 0; i < 40; i++) {
      if (await osPage.$('.win[data-app="crm"] .wload.done')) break;
      await sleep(500);
    }
    await sleep(4000);
    const crmTitle = await osPage.$eval('.win[data-app="crm"] webview', (w) => w.getTitle());
    const crmUrl = await osPage.$eval('.win[data-app="crm"] webview', (w) => w.getURL());
    check("module web tải xong, không bị đẩy sang trang đăng nhập", !/\/auth\/login/.test(crmUrl), `${crmTitle} · ${crmUrl.replace(/\?.*/, "")}`);
    await osPage.screenshot({ path: path.join(SHOTS, "os-2-crm.png") });

    // 3. second window + focus + minimize/restore
    await osPage.click('#dock [data-app="ban-viec"]');
    await sleep(5000);
    const front = await osPage.$eval(".win.front", (e) => e.dataset.app);
    check("nhiều cửa sổ, cửa sổ mới lên trước", front === "ban-viec" && (await osPage.$$(".win")).length === 2, front);
    await osPage.screenshot({ path: path.join(SHOTS, "os-3-hai-cua-so.png") });
    await osPage.click('.win[data-app="ban-viec"] .light.min');
    await sleep(700);
    check("thu nhỏ → về Dock", await osPage.$('.win[data-app="ban-viec"].min') !== null);
    await osPage.click('#dock [data-app="ban-viec"]');
    await sleep(600);
    check("bấm Dock → mở lại", await osPage.$('.win[data-app="ban-viec"].min') === null);
    await osPage.click('.win[data-app="ban-viec"] .light.zoom');
    await sleep(500);
    check("đèn xanh phóng to", await osPage.$('.win[data-app="ban-viec"].zoomed') !== null);
    await osPage.click('.win[data-app="ban-viec"] .light.zoom');
    await sleep(400);

    // 4. Spotlight
    await osPage.keyboard.press("Control+Space");
    await sleep(300);
    check("Ctrl+Space mở Spotlight", await osPage.isVisible(".spotlight"));
    await osPage.keyboard.type("hop thu");
    await sleep(400);
    const firstApp = await osPage.$eval(".sp-item.sel .t", (e) => e.textContent);
    check("Spotlight: 'hop thu' → Hộp thư chung lên đầu", firstApp === "Hộp thư chung", firstApp);
    await osPage.fill("#sp-input", "");
    await osPage.keyboard.type("làm 3 video ngắn cho kênh N77 tối nay");
    await sleep(900);
    const giveFirst = await osPage.$eval(".sp-item.sel .t", (e) => e.textContent);
    check("Spotlight: câu lệnh → 'Giao cho JAVIS' sẵn sàng (không gửi trong test)", /^Giao cho JAVIS/.test(giveFirst), giveFirst);
    await osPage.screenshot({ path: path.join(SHOTS, "os-4-spotlight.png") });
    await osPage.keyboard.press("Escape");

    // 5. Launchpad
    await osPage.click('#dock [data-app="launchpad"]');
    await sleep(500);
    const lpCount = await osPage.$$eval(".lp-app", (e) => e.length);
    check("Launchpad liệt kê mọi app/team", lpCount >= 30, String(lpCount));
    await osPage.screenshot({ path: path.join(SHOTS, "os-5-launchpad.png") });
    await osPage.keyboard.type("nha may");
    await sleep(200);
    check("Launchpad lọc theo chữ không dấu", (await osPage.$$eval(".lp-app span", (e) => e.map((x) => x.textContent))).includes("6 Nhà máy"));
    await osPage.keyboard.press("Escape");

    // 6. customer banner (fake data, nothing sent) → opens that conversation
    await osPage.evaluate(() => {
      window.javisOS.notify = async () => ({ inPage: true });
      window.__javisOS.announceCustomer({ conv: "hv_0000000001", title: "Chị Mai Anh", subtitle: "Page The N77 Quantum", body: "Shop ơi, gói làm MV cho quán cà phê bên mình tư vấn giúp chị với", initials: "MA", badge: "f" });
    });
    await sleep(700);
    check("banner kiểu macOS khi khách nhắn", await osPage.isVisible(".banner"));
    await osPage.screenshot({ path: path.join(SHOTS, "os-6-thong-bao.png") });
    await osPage.click(".banner .bact .pri");
    await sleep(800);
    // The web may tidy its address bar after opening; check the URL the window loaded.
    const crmSrc = await osPage.evaluate(() => window.__javisOS.windows.get("crm").url);
    check("bấm banner → mở đúng hội thoại", /conv=hv_0000000001/.test(crmSrc), crmSrc.replace(/^https?:\/\/[^/]+/, ""));
    check("không mở trình duyệt ngoài trong cả lượt test", (await app.evaluate(() => globalThis.__opened.length)) === 0);
  } catch (err) {
    check("tester chạy hết", false, err.message);
  } finally {
    fs.writeFileSync(path.join(OUT, "tester-os.json"), JSON.stringify(results, null, 2));
    await app.close().catch(() => {});
    fs.rmSync(home, { recursive: true, force: true });
    const fail = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - fail}/${results.length} PASS`);
    process.exit(fail ? 1 : 0);
  }
})();
