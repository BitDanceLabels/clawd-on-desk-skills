// src/javis-updater.js — JAVIS tự cập nhật từ gateway (thay electron-updater/GitHub cũ, 27/10/2026).
// Anh Nhựt: "javis trên mac air m1 nó còn lạc hậu chưa có nâng cấp" → không máy nào lạc hậu nữa.
//
//   GET {gateway}/fleet/desk/app/latest?platform=mac-arm64|mac-x64|win-x64
//     → { version, url, sha256, size, notes }   (url tương đối thì ghép gateway)
//
// Kiểm 30 s sau khi mở + mỗi 24 h (+ jitter). Bản mới hơn → tải về userData/updates, kiểm
// sha256 + kích thước (sai thì xoá; tối đa 3 lần tải/ngày). Cài lúc anh không gõ (≥30 s) hoặc
// lúc thoát app:
//   Mac: giải nén zip (ditto) → codesign --verify + CFBundleIdentifier = com.clawd.on-desk
//        (+ đúng designated requirement của bản đang chạy nếu bản đó không ad-hoc) → script phụ
//        chờ app thoát, thay JAVIS.app (bản cũ giữ ở updates/prev để lùi), `open -g` mở lại.
//        /Applications không ghi được → menu "Có bản mới — bấm để cài" (mở Finder ở bản mới).
//   Windows: chạy installer NSIS `/S --force-run` (cài im lặng rồi tự mở lại).
// Tắt tự động: JAVIS_AUTO_UPDATE=0 (menu "Kiểm tra bản mới" vẫn dùng được).
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const BUNDLE_ID = "com.clawd.on-desk";
const FIRST_CHECK_MS = 30 * 1000;
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const JITTER_MS = 60 * 60 * 1000;
const MAX_DOWNLOADS_PER_DAY = 3;
const IDLE_POLL_MS = 60 * 1000;

function platformKey(platform = process.platform, arch = process.arch) {
  if (platform === "darwin") return arch === "arm64" ? "mac-arm64" : arch === "x64" ? "mac-x64" : null;
  if (platform === "win32") return arch === "x64" ? "win-x64" : null;
  return null;
}

// "1.2.3" / "v1.2.3-beta.1" → [1,2,3, pre]; a pre-release sorts below the same release.
function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v || "").trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

function compareSemver(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] > y.nums[i] ? 1 : -1;
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn && Number(p) !== Number(q)) return Number(p) > Number(q) ? 1 : -1;
    if (pn !== qn) return pn ? -1 : 1;
    if (p !== q) return p > q ? 1 : -1;
  }
  return 0;
}

/** Validate the gateway answer; returns { version, url (absolute), sha256, size, notes } or null. */
function parseLatest(data, gateway) {
  if (!data || typeof data !== "object") return null;
  const version = String(data.version || "");
  const sha256 = String(data.sha256 || "").toLowerCase();
  const size = Number(data.size);
  if (!parseSemver(version) || !/^[0-9a-f]{64}$/.test(sha256) || !Number.isFinite(size) || size <= 0) return null;
  let url;
  try {
    url = new URL(String(data.url || ""), gateway.replace(/\/+$/, "") + "/").href;
  } catch { return null; }
  if (!/^https?:/.test(url)) return null;
  return { version, url, sha256, size, notes: typeof data.notes === "string" ? data.notes : "" };
}

/** /Applications/JAVIS.app/Contents/MacOS/JAVIS → /Applications/JAVIS.app */
function macAppBundle(execPath) {
  const m = /^(.*?\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath || "");
  return m ? m[1] : null;
}

function dayKey(ms) { return new Date(ms).toISOString().slice(0, 10); }

// Helper run after the app quits: swap the bundle, keep the old one to roll back, reopen in background.
function macSwapScript() {
  return `#!/bin/sh
# JAVIS updater helper: $1=pid $2=target .app $3=new .app $4=prev dir $5=log $6=relaunch(1/0)
PID="$1"; TARGET="$2"; NEW="$3"; PREV="$4"; LOG="$5"; RELAUNCH="$6"
log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }
i=0
while kill -0 "$PID" 2>/dev/null; do
  i=$((i+1)); [ $i -gt 120 ] && { log "app did not quit in 60s, abort"; exit 1; }
  sleep 0.5
done
mkdir -p "$PREV" && rm -rf "$PREV/JAVIS.app"
if ! mv "$TARGET" "$PREV/JAVIS.app"; then log "cannot move old app, abort"; exit 1; fi
if mv "$NEW" "$TARGET" || ditto "$NEW" "$TARGET"; then
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
  log "installed $TARGET"
else
  log "install failed, roll back"; rm -rf "$TARGET"; mv "$PREV/JAVIS.app" "$TARGET"
fi
[ "$RELAUNCH" = "1" ] && open -g "$TARGET"
exit 0
`;
}

/**
 * deps:
 *   currentVersion, platform, arch, execPath, userDataDir
 *   getGateway(), getToken?() → bearer or null, fetchImpl(url, init)
 *   isUserBusy()               — focus-guard (anh gõ/rê chuột trong 30 s)
 *   quitApp()                  — app.quit() (idle install)
 *   onChange(status)           — menu / settings re-render
 *   run(cmd, args) → Promise<{code, stdout, stderr}>, spawnDetached(cmd, args)
 *   enabled                    — false when JAVIS_AUTO_UPDATE=0 (manual check still works)
 */
function createUpdater(deps) {
  const {
    currentVersion, platform = process.platform, arch = process.arch, execPath = process.execPath,
    userDataDir, getGateway, getToken = async () => null, fetchImpl,
    isUserBusy = () => false, quitApp = () => {}, onChange = () => {}, log = () => {},
    run = defaultRun, spawnDetached = defaultSpawnDetached, fsImpl = fs,
    now = () => Date.now(), random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout,
    enabled = true, pid = process.pid,
  } = deps;

  const key = platformKey(platform, arch);
  const dir = path.join(userDataDir, "updates");
  const stateFile = path.join(dir, "state.json");
  let status = { state: "idle", version: "", notes: "", message: "", checkedAt: 0 };
  let staged = null; // { version, kind: "mac"|"win", file, app?, writable }
  let checking = null;
  let checkTimer = null;
  let idleTimer = null;
  let installing = false;

  function set(next) {
    status = { ...status, ...next };
    try { onChange(getStatus()); } catch {}
  }

  function getStatus() {
    return { ...status, currentVersion, platform: key, enabled, staged: !!staged };
  }

  function readState() {
    try { return JSON.parse(fsImpl.readFileSync(stateFile, "utf8")) || {}; } catch { return {}; }
  }
  function writeState(s) {
    try {
      fsImpl.mkdirSync(dir, { recursive: true });
      fsImpl.writeFileSync(stateFile, JSON.stringify(s));
    } catch {}
  }
  function downloadsToday() {
    const s = readState();
    return s.day === dayKey(now()) ? Number(s.downloads) || 0 : 0;
  }
  function countDownload() {
    writeState({ day: dayKey(now()), downloads: downloadsToday() + 1 });
  }

  async function fetchLatest() {
    const gw = getGateway().replace(/\/+$/, "");
    const headers = { Accept: "application/json", "X-Javis-Client": "javis-desktop" };
    try { const t = await getToken(); if (t) headers.Authorization = `Bearer ${t}`; } catch {}
    const res = await fetchImpl(`${gw}/fleet/desk/app/latest?platform=${encodeURIComponent(key)}`, { method: "GET", headers });
    if (!res.ok) throw new Error(`latest ${res.status}`);
    const info = parseLatest(await res.json(), gw);
    if (!info) throw new Error("latest: bad answer");
    return info;
  }

  // Stream to disk while hashing; size + sha256 must match, else the file is removed.
  async function download(info, file) {
    const res = await fetchImpl(info.url, { method: "GET" });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const hash = crypto.createHash("sha256");
    const tmp = `${file}.part`;
    let bytes = 0;
    const fd = fsImpl.openSync(tmp, "w");
    try {
      const write = (chunk) => {
        const buf = Buffer.from(chunk);
        bytes += buf.length;
        if (bytes > info.size) throw new Error("download: bigger than announced");
        hash.update(buf);
        fsImpl.writeSync(fd, buf);
      };
      if (res.body && typeof res.body[Symbol.asyncIterator] === "function") {
        for await (const chunk of res.body) write(chunk);
      } else {
        write(new Uint8Array(await res.arrayBuffer()));
      }
    } catch (err) {
      fsImpl.closeSync(fd);
      try { fsImpl.unlinkSync(tmp); } catch {}
      throw err;
    }
    fsImpl.closeSync(fd);
    const sha = hash.digest("hex");
    if (bytes !== info.size || sha !== info.sha256) {
      try { fsImpl.unlinkSync(tmp); } catch {}
      throw new Error(`download: size/sha256 mismatch (${bytes}/${info.size})`);
    }
    fsImpl.renameSync(tmp, file);
  }

  // Unzip + check signature, bundle id, version (+ same signer as the running app when not ad-hoc).
  async function stageMac(info, zip) {
    const out = path.join(dir, `JAVIS-${info.version}`);
    try { fsImpl.rmSync(out, { recursive: true, force: true }); } catch {}
    fsImpl.mkdirSync(out, { recursive: true });
    const unz = await run("/usr/bin/ditto", ["-x", "-k", zip, out]);
    if (unz.code !== 0) throw new Error(`unzip failed: ${unz.stderr}`.trim());
    const name = fsImpl.readdirSync(out).find((n) => n.endsWith(".app"));
    if (!name) throw new Error("zip has no .app");
    const app = path.join(out, name);
    const v = await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
    if (v.code !== 0) throw new Error(`codesign --verify failed: ${v.stderr}`.trim());
    const plist = path.join(app, "Contents", "Info.plist");
    const id = (await run("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", plist])).stdout.trim();
    if (id !== BUNDLE_ID) throw new Error(`wrong bundle id ${id}`);
    const ver = (await run("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", plist])).stdout.trim();
    if (ver !== info.version) throw new Error(`bundle version ${ver} ≠ ${info.version}`);
    const current = macAppBundle(execPath);
    if (current) {
      // The running app's designated requirement (fixed JAVIS cert): the new one must satisfy it.
      const dr = await run("/usr/bin/codesign", ["-d", "-r-", current]);
      const m = /designated => (.+)/.exec(`${dr.stdout}\n${dr.stderr}`);
      if (m && !/^cdhash /.test(m[1].trim())) {
        const r = await run("/usr/bin/codesign", ["--verify", `-R=${m[1].trim()}`, app]);
        if (r.code !== 0) throw new Error("new app is not signed by the same JAVIS certificate");
      }
    }
    try { fsImpl.unlinkSync(zip); } catch {}
    return { version: info.version, kind: "mac", file: zip, app, target: current, writable: macWritable(current) };
  }

  function macWritable(target) {
    if (!target || /\/AppTranslocation\//.test(target)) return false;
    try {
      fsImpl.accessSync(path.dirname(target), fs.constants.W_OK);
      fsImpl.accessSync(target, fs.constants.W_OK);
      return true;
    } catch { return false; }
  }

  async function checkInner(manual) {
    if (!key) { set({ state: "unsupported", message: "Máy này cập nhật bằng gói cài thủ công." }); return getStatus(); }
    if (staged) { set({ state: staged.writable === false ? "manual" : "ready" }); scheduleIdleInstall(); return getStatus(); }
    set({ state: "checking", message: "" });
    let info;
    try {
      info = await fetchLatest();
    } catch (err) {
      log(`update: check failed: ${err && err.message}`);
      set({ state: "error", message: manual ? "Chưa kiểm được bản mới (mạng/máy chủ). Thử lại sau nhé." : "", checkedAt: now() });
      return getStatus();
    }
    if (compareSemver(info.version, currentVersion) <= 0) {
      log(`update: ${currentVersion} is latest (server ${info.version})`);
      set({ state: "latest", version: info.version, message: "", checkedAt: now() });
      return getStatus();
    }
    if (downloadsToday() >= MAX_DOWNLOADS_PER_DAY) {
      log(`update: ${info.version} available but ${MAX_DOWNLOADS_PER_DAY} downloads today already, wait for tomorrow`);
      set({ state: "error", version: info.version, message: "Tải bản mới lỗi 3 lần hôm nay, mai em thử lại.", checkedAt: now() });
      return getStatus();
    }
    fsImpl.mkdirSync(dir, { recursive: true });
    const ext = key.startsWith("win") ? "exe" : "zip";
    const file = path.join(dir, `JAVIS-${info.version}-${key}.${ext}`);
    set({ state: "downloading", version: info.version, notes: info.notes, checkedAt: now() });
    countDownload();
    try {
      log(`update: downloading ${info.version} (${info.size} bytes)`);
      await download(info, file);
      staged = ext === "zip" ? await stageMac(info, file) : { version: info.version, kind: "win", file, writable: true };
    } catch (err) {
      log(`update: ${info.version} not staged: ${err && err.message}`);
      try { fsImpl.unlinkSync(file); } catch {}
      set({ state: "error", message: "Bản mới tải về chưa đạt kiểm tra, em sẽ thử lại sau." });
      return getStatus();
    }
    log(`update: ${info.version} ready${staged.writable ? "" : " (app folder not writable → manual)"}`);
    set({ state: staged.writable ? "ready" : "manual", message: "" });
    scheduleIdleInstall();
    return getStatus();
  }

  function check({ manual = false } = {}) {
    if (installing) return Promise.resolve(getStatus());
    if (!checking) checking = checkInner(manual).finally(() => { checking = null; });
    return checking;
  }

  function scheduleNext(ms) {
    if (checkTimer) clearTimer(checkTimer);
    checkTimer = setTimer(() => {
      checkTimer = null;
      void check().finally(() => scheduleNext(CHECK_EVERY_MS + Math.floor(random() * JITTER_MS)));
    }, ms);
    if (checkTimer && checkTimer.unref) checkTimer.unref();
  }

  // Ready: install the first time the owner has not typed/moved the mouse for 30 s.
  function scheduleIdleInstall() {
    if (!staged || !staged.writable || idleTimer || !enabled) return;
    const tick = () => {
      idleTimer = null;
      if (!staged || installing) return;
      if (isUserBusy()) { idleTimer = setTimer(tick, IDLE_POLL_MS); if (idleTimer.unref) idleTimer.unref(); return; }
      installNow({ reason: "idle" });
    };
    idleTimer = setTimer(tick, IDLE_POLL_MS);
    if (idleTimer.unref) idleTimer.unref();
  }

  function launchInstaller(relaunch) {
    if (staged.kind === "mac") {
      const script = path.join(dir, "swap.sh");
      fsImpl.writeFileSync(script, macSwapScript(), { mode: 0o755 });
      spawnDetached("/bin/sh", [script, String(pid), staged.target, staged.app, path.join(dir, "prev"), path.join(dir, "install.log"), relaunch ? "1" : "0"]);
    } else {
      // electron-builder NSIS: /S silent, --force-run reopens the app after install.
      spawnDetached(staged.file, ["--updated", "/S", ...(relaunch ? ["--force-run"] : [])]);
    }
  }

  /** Install now (idle or menu click): helper waits for this process, then the app quits. */
  function installNow({ reason = "menu" } = {}) {
    if (!staged || installing || !staged.writable) return false;
    installing = true;
    log(`update: installing ${staged.version} (${reason})`);
    try {
      launchInstaller(true);
    } catch (err) {
      installing = false;
      log(`update: installer failed to start: ${err && err.message}`);
      return false;
    }
    set({ state: "installing" });
    quitApp();
    return true;
  }

  /** before-quit: a staged update is installed while the app closes, then reopened. */
  function onQuit() {
    if (!staged || installing || !staged.writable) return false;
    installing = true;
    log(`update: installing ${staged.version} on quit`);
    try { launchInstaller(true); } catch (err) { log(`update: installer failed on quit: ${err && err.message}`); }
    return true;
  }

  function start() {
    // Leftovers from an old run (a .part, an unzipped folder) are rebuilt on demand.
    try {
      for (const n of fsImpl.readdirSync(dir)) {
        if (n.endsWith(".part") || /^JAVIS-[\d.]+(-[\w.]+)?$/.test(n)) fsImpl.rmSync(path.join(dir, n), { recursive: true, force: true });
      }
    } catch {}
    if (!enabled) { log("update: auto update off (JAVIS_AUTO_UPDATE=0)"); return; }
    scheduleNext(FIRST_CHECK_MS);
  }

  function stop() {
    if (checkTimer) { clearTimer(checkTimer); checkTimer = null; }
    if (idleTimer) { clearTimer(idleTimer); idleTimer = null; }
  }

  return { start, stop, check, installNow, onQuit, getStatus, stagedApp: () => (staged && (staged.app || staged.file)) || null, _staged: () => staged };
}

function defaultRun(cmd, args) {
  return new Promise((resolve) => {
    childProcess.execFile(cmd, args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function defaultSpawnDetached(cmd, args) {
  const child = childProcess.spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

module.exports = {
  BUNDLE_ID, FIRST_CHECK_MS, CHECK_EVERY_MS, JITTER_MS, MAX_DOWNLOADS_PER_DAY, IDLE_POLL_MS,
  createUpdater, platformKey, parseSemver, compareSemver, parseLatest, macAppBundle, macSwapScript,
};
