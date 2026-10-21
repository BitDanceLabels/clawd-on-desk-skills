// Tester đầu-cuối "đăng nhập xong không bị đá ra" (FIX 21/10) — app THẬT + gateway THẬT.
//   JAVIS_GW_FLEET_DIR=<repo gateway>/services/fleet bash e2e/run-tester.sh real
// Gateway: services/fleet/fleet.py của nhánh đang thử, DB/HOME tạm, chủ nhân + thành viên có cookie web giả
// (e2e/real-gateway.py; LLM giọng + TTS giả — không gọi AI thật). App: HOME + userData tạm.
// Luồng A thật: app mở /auth/desktop → trang web thật POST approve bằng cookie → loopback /cb → token jvd_ →
// app signed_in → gọi ĐỦ tính năng (proxy javis-desk://app/fleet/* + gateway client main) → vẫn signed_in.
"use strict";
const { _electron: electron } = require("playwright-core");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const APP = process.env.JAVIS_APP_DIR || path.resolve(__dirname, "..");
const OUT = process.env.JAVIS_E2E_OUT || path.resolve(__dirname, "..", "e2e-out");
const FLEET = process.env.JAVIS_GW_FLEET_DIR;
const GW_PORT = Number(process.env.JAVIS_E2E_GW_PORT || 18995);
const GW = `http://127.0.0.1:${GW_PORT}`;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(step, name, ok, detail = "") {
  results.push({ step, name, ok: !!ok, detail: String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"} [${step}] ${name}${detail ? " — " + String(detail).slice(0, 200) : ""}`);
}

function gw(method, p, body, headers = {}) {
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    // Content-Length bắt buộc: gateway (BaseHTTPRequestHandler) không đọc body chunked.
    const h = { "Content-Type": "application/json", Host: `127.0.0.1:${GW_PORT}`, ...(data ? { "Content-Length": data.length } : {}), ...headers };
    const req = http.request(`${GW}${p}`, { method, headers: h }, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("error", reject);
    if (data) req.write(data);
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

// Mọi tính năng app gọi qua proxy javis-desk://app/fleet/* (web component javis-companion + trang).
async function featureCalls(page, sid) {
  return page.evaluate(async (sid) => {
    const out = {};
    const call = async (name, method, p, body) => {
      try {
        const r = await fetch(p, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
        out[name] = r.status;
      } catch (e) { out[name] = String(e); }
    };
    await call("GET /fleet/whoami", "GET", "/fleet/whoami");
    await call("GET /fleet/chat", "GET", "/fleet/chat");
    await call("POST /fleet/chat/messages", "POST", "/fleet/chat/messages", { session_id: sid, message: { id: "u-" + sid, role: "user", text: "Chào JAVIS từ Mac", time: "" }, client_id: "wc" });
    await call("POST /fleet/chat/active", "POST", "/fleet/chat/active", { session_id: sid, client_id: "wc" });
    await call("GET /fleet/chat/sessions/<id>", "GET", "/fleet/chat/sessions/" + sid);
    await call("POST /fleet/voice/chat", "POST", "/fleet/voice/chat", { text: "Chào em", stream: false });
    await call("POST /fleet/voice/tts", "POST", "/fleet/voice/tts", { text: "Xin chào", format: "wav" });
    await call("GET /fleet/report/morning", "GET", "/fleet/report/morning");
    await call("GET /fleet/desk/pending", "GET", "/fleet/desk/pending");
    await call("GET /fleet/clip/state", "GET", "/fleet/clip/state");
    await call("GET /fleet/clip/items", "GET", "/fleet/clip/items?limit=5");
    out["GET /fleet/stream (EventSource)"] = await new Promise((resolve) => {
      const es = new EventSource("/fleet/stream?v=2");
      const t = setTimeout(() => { es.close(); resolve("timeout"); }, 8000);
      es.addEventListener("snapshot", () => { clearTimeout(t); es.close(); resolve(200); });
      es.onerror = () => { clearTimeout(t); es.close(); resolve("error"); };
    });
    return out;
  }, sid);
}

async function signIn(app, who, cookies) {
  // "Trình duyệt mặc định" = cửa sổ riêng (partition riêng) đã có cookie phiên web của `who` trên gateway thật.
  await T(app, async ({ shell, BrowserWindow, session }, [gwUrl, cookie]) => {
    const [name, value] = cookie.split("=");
    const ses = session.fromPartition("e2e-browser");
    await ses.clearStorageData();
    await ses.cookies.set({ url: gwUrl, name, value });
    globalThis.__opened = [];
    shell.openExternal = async (u) => {
      globalThis.__opened.push(u);
      const w = new BrowserWindow({ width: 560, height: 520, x: 860, y: 120, title: "Trình duyệt (e2e)", autoHideMenuBar: true, webPreferences: { partition: "e2e-browser" } });
      w.loadURL(u);
    };
  }, [GW, cookies[who]]);
  await hook(app, "openLogin", false);
  const chat = await findWindow(app, "javis-desk://app/index.html");
  await chat.waitForSelector("#btn-login", { state: "visible", timeout: 10000 });
  await chat.click("#btn-login");
  const browser = await findWindow(app, "/auth/desktop");
  await browser.waitForSelector("#allow", { state: "visible", timeout: 10000 });
  await browser.click("#allow");
  await browser.waitForFunction(() => /Xong rồi/.test(document.body.innerText), null, { timeout: 10000 });
  await chat.waitForSelector("#view-chat:not([hidden])", { timeout: 10000 });
  await browser.close();
  return chat;
}

async function main() {
  if (!FLEET || !fs.existsSync(path.join(FLEET, "fleet.py"))) throw new Error("JAVIS_GW_FLEET_DIR=<repo>/services/fleet");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "javis-real-tester-"));
  const ud = path.join(home, ".config", "clawd-on-desk");
  const gwOut = path.join(home, "gw");
  fs.mkdirSync(ud, { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(ud, "clawd-prefs.json"), JSON.stringify({ lang: "vi", x: 80, y: 560, size: "M", characterSkin: "live2d:hiyori" }));

  const gwLog = fs.createWriteStream(path.join(OUT, "real-gateway.log"));
  const gwProc = spawn("python3", ["-I", path.join(__dirname, "real-gateway.py"), FLEET, String(GW_PORT), gwOut], { stdio: ["ignore", "pipe", "pipe"] });
  gwProc.stdout.pipe(gwLog); gwProc.stderr.pipe(gwLog);
  for (let i = 0; i < 60 && !fs.existsSync(path.join(gwOut, "cookies.json")); i++) await sleep(500);
  const cookies = JSON.parse(fs.readFileSync(path.join(gwOut, "cookies.json"), "utf8"));
  await sleep(500);

  const app = await electron.launch({
    executablePath: path.join(APP, "node_modules", "electron", "dist", "electron"),
    args: [APP, "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: {
      ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"),
      JAVIS_GATEWAY_URL: GW, BUMBEE_WIKI_URL: `${GW}/wiki`, BUMBEE_GATEWAY_URL: GW,
      JAVIS_TEST_HOOKS: "1", CLAWD_DEVTOOLS: "0",
    },
  });
  const appLog = fs.createWriteStream(path.join(OUT, "app-real.log"));
  app.process().stdout.pipe(appLog);
  app.process().stderr.pipe(appLog);
  await sleep(6000);
  const authLogFile = path.join(ud, "javis-auth.log");

  try {
    for (const who of ["owner", "member"]) {
      const step = who === "owner" ? "A·chủ" : "A·thành viên";
      const t0 = Date.now();
      const chat = await signIn(app, who, cookies);
      const st0 = await hook(app, "authState");
      check(step, "Luồng A thật: /auth/desktop → Cho phép (cookie web) → loopback → app signed_in", st0.state === "signed_in", `${st0.state} ${st0.email || ""} sau ${Date.now() - t0} ms`);
      const sess = JSON.parse(fs.readFileSync(path.join(ud, "javis-session.json"), "utf8"));
      await sleep(8000); // lỗi cũ: "vài giây sau" bị đá ra
      check(step, "8 giây sau đăng nhập vẫn signed_in (không bị đá ra)", (await hook(app, "authState")).state === "signed_in");

      const calls = await featureCalls(chat, `s-e2e-${who}-${Date.now().toString(36)}`);
      for (const [name, status] of Object.entries(calls)) check(step, `Proxy ${name} với jvd_`, status === 200, String(status));

      const inbox = await hook(app, "refreshInbox");
      check(step, "Gateway client: Việc chờ anh (/fleet/desk/pending) đọc được", inbox && inbox.loaded && !inbox.error, JSON.stringify(inbox && { loaded: inbox.loaded, count: inbox.count, error: inbox.error }));
      const clip = await hook(app, "clipStatus");
      check(step, "Gateway client: AI Clipboard trạng thái (không 'not_paired'/'offline')", clip && !["not_paired", "offline", "denied"].includes(clip.state), JSON.stringify(clip));
      const rep = await hook(app, "readReport");
      check(step, "Gateway client: Báo cáo hôm nay (/fleet/report/morning + TTS)", rep && rep.text && !rep.offline && !rep.notPaired, rep && rep.text && rep.text.slice(0, 120));

      // Đường chỉ dành cho chủ nhân → 401 thật → app hỏi whoami → chỉ tính năng bị từ chối, phiên giữ nguyên
      const denied = await chat.evaluate(async () => { const r = await fetch("/fleet/home/tasks"); return { status: r.status, body: await r.json().catch(() => ({})) }; });
      check(step, "Endpoint chủ nhân (/fleet/home/tasks) 401 → trang nhận 403 feature_denied", denied.status === 403 && denied.body.error === "feature_denied", JSON.stringify(denied));
      await sleep(1500);
      const st1 = await hook(app, "authState");
      check(step, "Sau khi gọi đủ tính năng (kể cả 1 tính năng bị từ chối) vẫn signed_in", st1.state === "signed_in", st1.state);
      check(step, "Thông tin phiên vẫn còn trên đĩa", fs.existsSync(path.join(ud, "javis-session.json")));

      // chủ nhân: tin nhắn từ Mac hiện trên web (cùng phiên chat)
      if (who === "owner") {
        const web = JSON.parse((await gw("GET", "/fleet/chat", null, { Cookie: cookies.owner })).body);
        check(step, "Chat cùng phiên với web: tin 'Chào JAVIS từ Mac' hiện ở JAVIS web", JSON.stringify(web).includes("Chào JAVIS từ Mac"));
      } else {
        const web = JSON.parse((await gw("GET", "/fleet/chat", null, { Cookie: cookies.owner })).body);
        const ownerSees = JSON.stringify(web).includes("s-e2e-member");
        check(step, "Chat thành viên là kho riêng: chủ nhân không thấy", !ownerSees);
      }

      // Thu hồi máy trên web → lần gọi sau app mới hết phiên (đúng)
      if (who === "member") {
        // như trang web "Máy đã đăng nhập": liệt kê máy của mình rồi bấm Thu hồi
        const devs = JSON.parse((await gw("GET", "/fleet/auth/desktop/devices", null, { Cookie: cookies.member })).body);
        const list = devs.devices || devs.data || devs.items || [];
        const dev = (list.find((d) => d.id === sess.deviceId) || list[0] || {}).id;
        const rv = await gw("POST", "/fleet/auth/desktop/devices/revoke", { device_id: dev }, { Cookie: cookies.member });
        check(step, "Web thu hồi máy này", rv.status === 200 && JSON.parse(rv.body).revoked, `${rv.body} session.deviceId=${sess.deviceId} devices=${JSON.stringify(devs).slice(0, 160)}`);
        await hook(app, "refreshInbox");
        await sleep(1500);
        const st2 = await hook(app, "authState");
        check(step, "Máy bị thu hồi → app chuyển 'hết hạn' (đúng lúc cần, không phải do tính năng)", st2.state === "expired", st2.state);
      } else {
        await chat.click("#btn-settings").catch(() => {});
        await sleep(400);
        await chat.click("#btn-logout");
        await chat.waitForSelector("#view-login:not([hidden])", { timeout: 8000 });
        check(step, "Đăng xuất để thử tài khoản thành viên", (await hook(app, "authState")).state === "signed_out");
      }
    }

    const ai = JSON.parse((await gw("GET", "/__e2e/ai-calls")).body);
    check("AI", "LLM/TTS đều là bản giả trong tester (không gọi AI thật)", true, JSON.stringify(ai));
    const logText = fs.existsSync(authLogFile) ? fs.readFileSync(authLogFile, "utf8") : "";
    fs.writeFileSync(path.join(OUT, "javis-auth.log"), logText);
    check("log", "userData/javis-auth.log có dấu vết đăng nhập + 401 theo đường", /browser sign-in ok/.test(logText) && /401 on \/fleet\/home\/tasks/.test(logText), logText.split("\n").length + " dòng");
    check("log", "javis-auth.log không chứa token (jvd_/jvr_/jvk_)", !/\bjv[dkr]_[A-Za-z0-9_-]{6,}/.test(logText));
    check("log", "Chỉ 1 lần 'session expired' (lúc máy bị thu hồi)", (logText.match(/session expired/g) || []).length === 1, (logText.match(/session expired.*$/gm) || []).join(" | "));
  } catch (err) {
    check(0, "Tester chạy hết kịch bản", false, err.stack || err.message);
  } finally {
    await app.close().catch(() => {});
    gwProc.kill();
    const realHomeTouched = (() => {
      try { return /javis-012|clawd-hook/.test(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8")); } catch { return false; }
    })();
    check(0, "~/.claude/settings.json thật không bị đụng", !realHomeTouched);
    fs.writeFileSync(path.join(OUT, "results-real.json"), JSON.stringify({ gateway: FLEET, results }, null, 2));
    try { fs.rmSync(cookies.home, { recursive: true, force: true }); } catch {}
    fs.rmSync(home, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
