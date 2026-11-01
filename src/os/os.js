// src/os/os.js — JAVIS OS page: menu bar, desktop widgets, Dock, app windows
// (<webview> on the JAVIS web modules), Spotlight, Launchpad, notification banners.
//
// Talks only to javis-desk://app/fleet/* (bearer added in the main process) and to
// window.javisOS (preload). Event-driven: one /fleet/stream, refreshes on events;
// at most 3 reconnects with back-off, then stop (owner rule). No "AI" in UI copy.
import { DOCK_APPS, LAUNCHPAD_GROUPS, ALL_APPS, getApp, appUrl, searchApps, normalize } from "./apps.js";
import { createInboxWatch } from "./inbox-watch.js";
import { recordUtterance } from "../desk/voice-input.js";

const jos = window.javisOS;
const $ = (id) => document.getElementById(id);

// ── tiny DOM helper ──
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error((data && (data.error || data.detail)) || `http_${res.status}`); e.status = res.status; throw e; }
  return data;
}

// ── glyphs (original, 24×24, white fill) ──
const G = {
  spark: "M12 2.5l2.1 6.1 6.4.3-5 4 1.8 6.2L12 15.5l-5.3 3.6 1.8-6.2-5-4 6.4-.3z",
  chat: "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7.2L8 21v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 5.2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zm5 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zm5 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z",
  check: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm1.6 5.3L8 9.7l3-3-1.1-1.1L8 7.5l-.3-.3zM12.5 7v1.8H18V7zm-5.9 5.3L8 13.7l3-3-1.1-1.1L8 11.5l-.3-.3zm5.9-1.3v1.8H18V11zm-5 4v1.8H18V15z",
  box: "M12 2l9 4.6v10.8L12 22l-9-4.6V6.6zm0 2.3L5.6 7.5 12 10.8l6.4-3.3zM4.8 9.1v7.2l6.3 3.3v-7.3zm14.4 0-6.3 3.2v7.3l6.3-3.3z",
  note: "M20 3v12.3a3.2 3.2 0 1 1-2-3V7.4l-8 1.8v8.1A3.2 3.2 0 1 1 8 14.3V5.6z",
  film: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm2 0v2h2V5zm12 0v2h2V5zM5 9v2h2V9zm12 0v2h2V9zM5 13v2h2v-2zm12 0v2h2v-2zM5 17v2h2v-2zm12 0v2h2v-2zM10 8.5v7l5.5-3.5z",
  bag: "M7 7V6a5 5 0 0 1 10 0v1h2.2a1 1 0 0 1 1 .9l1 12A2 2 0 0 1 19.2 22H4.8a2 2 0 0 1-2-2.1l1-12a1 1 0 0 1 1-.9zm2 0h6V6a3 3 0 0 0-6 0zm3 5.2c-.9-1.5-3.7-1.2-3.7 1.1 0 1.8 2.2 3.1 3.7 4.3 1.5-1.2 3.7-2.5 3.7-4.3 0-2.3-2.8-2.6-3.7-1.1z",
  chart: "M4 20h17v2H2V3h2zm2-3V11h3v6zm5 0V6h3v11zm5 0v-8h3v8z",
  chip: "M8 2h2v2h4V2h2v2h2a2 2 0 0 1 2 2v2h2v2h-2v4h2v2h-2v2a2 2 0 0 1-2 2h-2v2h-2v-2h-4v2H8v-2H6a2 2 0 0 1-2-2v-2H2v-2h2v-4H2V8h2V6a2 2 0 0 1 2-2h2zm0 6v8h8V8z",
  hand: "M9 2.5a1.5 1.5 0 0 1 3 0V10h.6V3.6a1.5 1.5 0 0 1 3 0V10h.6V5.6a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-12.6 4.2l-3.5-4.7a1.6 1.6 0 0 1 2.5-2L8 15V5.6z",
  list: "M4 5h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zm-4 6h2v2H4zm4 0h12v2H8z",
  coin: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm1 4h-2v1.1c-1.7.4-2.8 1.6-2.8 3.1 0 3.6 5.3 2.6 5.3 4.5 0 .7-.7 1.2-1.6 1.2-1 0-1.8-.6-2-1.5l-1.9.5c.3 1.5 1.4 2.5 3 2.9V19h2v-1.2c1.7-.4 2.7-1.6 2.7-3.1 0-3.7-5.3-2.6-5.3-4.5 0-.6.6-1.1 1.5-1.1.8 0 1.5.5 1.7 1.3l1.9-.6c-.3-1.3-1.2-2.2-2.5-2.6z",
  clock: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 4v6.4l4.6 3 1.1-1.7-3.7-2.4V6z",
  target: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  lock: "M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0zm3 4a1.8 1.8 0 0 0-1 3.3V19h2v-1.7a1.8 1.8 0 0 0-1-3.3z",
  radar: "M12 2a10 10 0 1 1-7.1 2.9l1.4 1.4A8 8 0 1 0 12 4v6.3a1.8 1.8 0 1 1-2 0V2.2A10 10 0 0 1 12 2zm0 4.5a5.5 5.5 0 1 1-3.9 1.6l1.4 1.4a3.5 3.5 0 1 0 2.5-1z",
  grid: "M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z",
  star: "M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z",
  pen: "M16.6 2.6a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L9 19.8 3 21l1.2-6zM15 6.4l2.6 2.6 1.4-1.4L16.4 5z",
  user: "M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 12c5 0 9 2.5 9 5.5V22H3v-2.5C3 16.5 7 14 12 14z",
  scale: "M11 3h2v2.1l6 1.6V5h2v3l2.6 6.5A4 4 0 0 1 16 14.5L18.7 8 13 6.5V19h4v2H7v-2h4V6.5L5.3 8 8 14.5a4 4 0 0 1-7.6 0L3 8V5h2v1.7l6-1.6zm-6.9 11h3.8L6 9.4zm14 0h3.8L20 9.4z",
  camera: "M9 3h6l1.8 2.5H20a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h3.2zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z",
  gear: "M10.3 2h3.4l.5 2.7 1.7.7 2.3-1.6 2.4 2.4-1.6 2.3.7 1.7 2.7.5v3.4l-2.7.5-.7 1.7 1.6 2.3-2.4 2.4-2.3-1.6-1.7.7-.5 2.7h-3.4l-.5-2.7-1.7-.7-2.3 1.6-2.4-2.4 1.6-2.3-.7-1.7L2 13.7v-3.4l2.7-.5.7-1.7-1.6-2.3 2.4-2.4 2.3 1.6 1.7-.7zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  brain: "M9 2.5A3.5 3.5 0 0 1 12 4a3.5 3.5 0 0 1 6.4 2 3.8 3.8 0 0 1 1.9 6.1A3.8 3.8 0 0 1 17 19a3.5 3.5 0 0 1-5 1.6A3.5 3.5 0 0 1 7 19a3.8 3.8 0 0 1-3.3-6.9A3.8 3.8 0 0 1 5.6 6 3.5 3.5 0 0 1 9 2.5zM11 6H9.4v12H11zm3.6 0H13v12h1.6z",
  people: "M8.5 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm8 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8.5 13c4 0 7 2 7 4.5V20H1.5v-2.5C1.5 15 4.5 13 8.5 13zm8.5.5c3.3.3 5.5 1.9 5.5 4V20h-5v-2.5c0-1.5-.6-2.9-1.7-4z",
  seat: "M7 3h10a2 2 0 0 1 2 2v7h1a1 1 0 0 1 1 1v3h-2v5h-2v-5H7v5H5v-5H3v-3a1 1 0 0 1 1-1h1V5a2 2 0 0 1 2-2z",
  screen: "M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9h16V6z",
  term: "M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm3.4 4L5 9.4 7.6 12 5 14.6 6.4 16l4-4zM12 14v2h6v-2z",
  store: "M3 4h18l1 5a3 3 0 0 1-5.5 1.7A3 3 0 0 1 12 12a3 3 0 0 1-4.5-1.3A3 3 0 0 1 2 9zm1 9.5A5 5 0 0 0 7.5 14 5 5 0 0 0 12 15a5 5 0 0 0 4.5-1 5 5 0 0 0 3.5.5V21H4zM10 16v5h4v-5z",
  present: "M3 3h18v2h-1v10a1 1 0 0 1-1 1h-6v2.3l3.6 2.9-1.2 1.6L12 20.2l-3.4 2.6-1.2-1.6 3.6-2.9V16H5a1 1 0 0 1-1-1V5H3zm4 9h2V8H7zm4 0h2V6h-2zm4 0h2V9h-2z",
  crown: "M2 7l5 4 5-7 5 7 5-4-2 12H4zm3 14h14v2H5z",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6z",
  phone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 3v13h10V5zm4 14.2v1.6h2v-1.6z",
  bulb: "M12 2a7 7 0 0 1 4 12.7V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.3A7 7 0 0 1 12 2zM9 19.5h6V21a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z",
  launch: "M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z",
};
function svg(glyph) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${G[glyph] || G.spark}"/></svg>`;
}
function iconEl(app, extra = "") {
  const el = h("div", { class: `icon ${extra}`, html: svg(app.glyph) });
  el.style.setProperty("--t1", app.tint ? app.tint[0] : "#5fe7ff");
  el.style.setProperty("--t2", app.tint ? app.tint[1] : "#2a5bff");
  return el;
}

// ── state ──
const state = {
  info: { gateway: "", host: "", version: "" },
  signedIn: null,
  unread: 0,
  waiting: [],
  machines: null,
  denied: false, // signed in, but this device may not read owner data yet
  recent: [], // banners shown this session (bell panel)
  focused: true,
};
const inbox = createInboxWatch();

// ═══════════════════════ menu bar ═══════════════════════
const VN_DAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
function vnNow() {
  // Vietnam time regardless of the machine's zone.
  const d = new Date(Date.now() + (new Date().getTimezoneOffset() + 420) * 60000);
  return d;
}
function tickClock() {
  const d = vnNow();
  const p = (n) => String(n).padStart(2, "0");
  $("mb-clock").textContent = `${VN_DAYS[d.getDay()]} ${d.getDate()} thg ${d.getMonth() + 1}  ${p(d.getHours())}:${p(d.getMinutes())}`;
  setTimeout(tickClock, (60 - d.getSeconds()) * 1000 + 50);
}

function setHost() {
  const el = $("mb-host");
  el.querySelector("span").textContent = state.info.host || "máy này";
  el.classList.toggle("on", state.signedIn === true);
  el.classList.toggle("off", state.signedIn === false);
  el.title = state.signedIn ? `JAVIS đang chạy trên ${state.info.host} · đã kết nối` : state.signedIn === false ? "Chưa kết nối JAVIS" : "Đang kết nối JAVIS…";
}

function setBell() {
  const n = state.waiting.length;
  const b = $("bell-count");
  b.hidden = !n;
  b.textContent = n > 99 ? "99+" : String(n);
}

// dropdown menus
let menuFor = null;
function openMenu(anchor, items) {
  const m = $("menu");
  if (menuFor === anchor) return closeMenu();
  closeMenu();
  menuFor = anchor;
  anchor.classList.add("open");
  m.replaceChildren(...items.map((it) => {
    if (it === "-") return h("hr");
    if (it.head) return h("div", { class: "menu-head" }, it.head);
    return h("button", { type: "button", disabled: it.disabled, onclick: () => { closeMenu(); it.run && it.run(); } }, h("span", {}, it.label), it.key ? h("kbd", {}, it.key) : null);
  }));
  const r = anchor.getBoundingClientRect();
  m.hidden = false;
  m.style.left = `${Math.min(r.left, innerWidth - m.offsetWidth - 8)}px`;
  m.style.top = `${r.bottom + 4}px`;
}
function closeMenu() {
  $("menu").hidden = true;
  if (menuFor) menuFor.classList.remove("open");
  menuFor = null;
}
const MOD = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";
$("mb-logo").addEventListener("click", (e) => openMenu(e.currentTarget, [
  { head: `JAVIS OS · bản ${state.info.version || ""}` },
  { label: "Spotlight — giao việc", key: `${MOD}Space`, run: () => openSpotlight() },
  { label: "Launchpad — mọi ứng dụng", key: "F4", run: () => openLaunchpad() },
  { label: "Bảng nhanh của bé JAVIS", run: () => jos.deskBoard() },
  "-",
  { label: "Mở JAVIS trên trình duyệt", run: () => jos.openExternal("https://javis.bumbee.asia") },
  { label: "Toàn màn hình", key: "F11", run: () => jos.fullscreen() },
  "-",
  { label: "Ẩn JAVIS OS", key: `${MOD}H`, run: () => jos.hide() },
  { label: "Thoát JAVIS", key: `${MOD}Q`, run: () => jos.quit() },
]));
$("mb-app").addEventListener("click", (e) => {
  const w = frontWindow();
  openMenu(e.currentTarget, w ? [
    { head: w.app.name },
    { label: "Tải lại", key: `${MOD}R`, run: () => w.webview.reload() },
    { label: "Mở trên trình duyệt", run: () => jos.openExternal(publicUrl(w)) },
    "-",
    { label: "Thu nhỏ", key: `${MOD}M`, run: () => minimize(w) },
    { label: "Phóng to / thu lại", run: () => toggleZoom(w) },
    { label: "Đóng", key: `${MOD}W`, run: () => closeWindow(w) },
  ] : [{ head: "JAVIS" }, { label: "Mở Hộp thư chung", run: () => openApp("crm") }, { label: "Mở Bàn việc", run: () => openApp("ban-viec") }]);
});
$("mb-window").addEventListener("click", (e) => {
  const list = [...windows.values()];
  openMenu(e.currentTarget, [
    { label: "Thu nhỏ tất cả", disabled: !list.length, run: () => list.forEach(minimize) },
    { label: "Xếp cạnh nhau", disabled: list.length < 2, run: tileWindows },
    { label: "Đóng tất cả", disabled: !list.length, run: () => list.forEach(closeWindow) },
    ...(list.length ? ["-", ...list.map((w) => ({ label: `${w.min ? "◇ " : w.el.classList.contains("front") ? "✓ " : ""}${w.app.name}`, run: () => focusWindow(w) }))] : []),
  ]);
});
$("mb-go").addEventListener("click", (e) => openMenu(e.currentTarget, DOCK_APPS.map((a) => ({ label: a.name, run: () => openApp(a.id) }))));
$("mb-search").addEventListener("click", () => openSpotlight());
$("mb-bell").addEventListener("click", () => toggleBellPanel());
document.addEventListener("pointerdown", (e) => {
  if (menuFor && !e.target.closest("#menu") && !e.target.closest(".mb-item")) closeMenu();
  if (!$("bell-panel").hidden && !e.target.closest("#bell-panel") && !e.target.closest("#mb-bell")) $("bell-panel").hidden = true;
});

// ═══════════════════════ windows ═══════════════════════
const windows = new Map(); // app id → win
let zTop = 10;
let cascade = 0;

function desktopRect() {
  const d = $("desktop").getBoundingClientRect();
  const dock = $("dock").getBoundingClientRect();
  return { w: d.width, h: d.height, bottom: Math.max(0, d.bottom - dock.top) + 8 };
}

function loadGeom(id) {
  try { return JSON.parse(localStorage.getItem(`javis-os:geom:${id}`) || "null"); } catch { return null; }
}
function saveGeom(w) {
  if (w.zoomed) return;
  try { localStorage.setItem(`javis-os:geom:${w.app.id}`, JSON.stringify(w.geom)); } catch {}
}

function defaultGeom(app) {
  const r = desktopRect();
  // Work apps (inbox, task board, reports) need room for 3 columns: open them large.
  const big = app && ["crm", "ban-viec", "bao-cao", "ban-hang"].includes(app.id);
  const width = big ? Math.max(720, Math.min(1440, r.w - 40)) : Math.min(1160, Math.max(720, r.w - 160));
  const height = big ? Math.max(460, r.h - r.bottom - 20) : Math.min(760, Math.max(460, r.h - r.bottom - 40));
  if (big) { const off = (cascade++ % 4) * 24; return { x: Math.round((r.w - width) / 2 + off), y: 8 + off, w: width - off, h: height - off }; }
  const off = (cascade++ % 6) * 28;
  return { x: Math.round((r.w - width) / 2 + off - 40), y: Math.round(16 + off), w: width, h: height };
}

function clampGeom(g) {
  const r = desktopRect();
  const w = Math.max(520, Math.min(g.w, r.w));
  const hgt = Math.max(340, Math.min(g.h, r.h - 8));
  return { x: Math.min(Math.max(g.x, -w + 120), r.w - 120), y: Math.min(Math.max(g.y, 0), r.h - 60), w, h: hgt };
}

function applyGeom(w, g) {
  w.el.style.left = `${g.x}px`;
  w.el.style.top = `${g.y}px`;
  w.el.style.width = `${g.w}px`;
  w.el.style.height = `${g.h}px`;
}

function publicUrl(w) {
  const u = w.url.replace(state.info.gateway, "https://javis.bumbee.asia");
  return u;
}

const TOOL = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

// Inside a window the module is the whole app: hide the web's own rail, floating assistant and
// backdrop (JAVIS OS already has the Dock and the JAVIS orb). Desk-side CSS only; if the web's
// markup changes these selectors simply stop matching.
const EMBED_CSS = `
  aside.os-rail, .jx-assistant, .javis > .bg { display: none !important; }
  .javis.has-space > main.space-layer { position: fixed !important; inset: 0 !important; left: 0 !important; top: 0 !important; width: auto !important; height: auto !important; border-radius: 0 !important; margin: 0 !important; }
  .javis.has-focus > .os { visibility: hidden !important; }
  .focus-layer > section.panel.focus { position: fixed !important; inset: 0 !important; left: 0 !important; top: 0 !important; width: auto !important; height: auto !important; max-width: none !important; max-height: none !important; border-radius: 0 !important; border: 0 !important; box-shadow: none !important; transform: none !important; }
  .focus-layer > section.panel.focus > header { display: none !important; }
  .focus-layer > section.panel.focus > .pb { overflow-x: hidden !important; }
`;

const TONE_JS = `(() => {
  let el = document.elementFromPoint(innerWidth / 2, Math.min(innerHeight - 2, 140));
  while (el) {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\\(([^)]+)\\)/);
    if (m) { const [r, g, b, a = 1] = m[1].split(",").map(Number); if (a > 0.5) return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 90; }
    el = el.parentElement;
  }
  return false;
})()`;

function createWindow(app, url) {
  const el = h("section", { class: "win opening", role: "dialog", "aria-label": app.name, "data-app": app.id });
  const lights = h("div", { class: "lights" },
    h("button", { class: "light close", type: "button", "aria-label": "Đóng" }),
    h("button", { class: "light min", type: "button", "aria-label": "Thu nhỏ" }),
    h("button", { class: "light zoom", type: "button", "aria-label": "Phóng to" }));
  const mini = iconEl(app, "mini");
  mini.className = "mini";
  mini.style.background = `linear-gradient(160deg, ${app.tint[0]}, ${app.tint[1]})`;
  const titleText = h("span", {}, app.name);
  const tools = h("div", { class: "wtools" },
    h("button", { class: "wtool", type: "button", title: "Quay lại", html: TOOL.back, "data-act": "back" }),
    h("button", { class: "wtool", type: "button", title: "Tải lại", html: TOOL.reload, "data-act": "reload" }),
    h("button", { class: "wtool", type: "button", title: "Mở trên trình duyệt", html: TOOL.out, "data-act": "out" }));
  const bar = h("header", { class: "titlebar" }, lights, h("div", { class: "wtitle" }, mini, titleText), tools);
  const webview = document.createElement("webview");
  webview.setAttribute("partition", "persist:javis-web");
  webview.setAttribute("allowpopups", "");
  webview.setAttribute("src", url);
  const big = iconEl(app, "big");
  big.className = "big";
  big.style.background = `linear-gradient(160deg, ${app.tint[0]}, ${app.tint[1]})`;
  const load = h("div", { class: "wload" }, big, h("span", {}, `Đang mở ${app.name}…`));
  const body = h("div", { class: "wbody" }, webview, load, h("div", { class: "shield" }));
  el.append(bar, body, ...["e", "s", "w", "se", "sw"].map((d) => h("div", { class: `grip ${d}`, "data-dir": d })));
  $("windows").append(el);

  const w = { app, el, webview, load, titleText, url, geom: clampGeom(loadGeom(app.id) || defaultGeom(app)), zoomed: false, min: false, failures: 0 };
  applyGeom(w, w.geom);
  windows.set(app.id, w);

  lights.children[0].addEventListener("click", (e) => { e.stopPropagation(); closeWindow(w); });
  lights.children[1].addEventListener("click", (e) => { e.stopPropagation(); minimize(w); });
  lights.children[2].addEventListener("click", (e) => { e.stopPropagation(); toggleZoom(w); });
  tools.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "back" && webview.canGoBack()) webview.goBack();
    if (act.dataset.act === "reload") webview.reload();
    if (act.dataset.act === "out") jos.openExternal(publicUrl(w));
  });
  bar.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) toggleZoom(w); });
  el.addEventListener("pointerdown", () => focusWindow(w), true);
  webview.addEventListener("focus", () => focusWindow(w));
  dragBehaviour(w, bar);
  for (const g of el.querySelectorAll(".grip")) resizeBehaviour(w, g);

  webview.addEventListener("dom-ready", () => {
    if (state.info.gateway && webview.getURL().startsWith(state.info.gateway)) webview.insertCSS(EMBED_CSS).catch(() => {});
  });
  webview.addEventListener("did-stop-loading", () => {
    load.classList.add("done");
    w.failures = 0;
    // Dark module → dark title bar, so window chrome and content read as one piece.
    webview.executeJavaScript(TONE_JS).then((dark) => el.classList.toggle("dark", !!dark)).catch(() => {});
  });
  webview.addEventListener("did-fail-load", (e) => {
    if (e.errorCode === -3 || !e.isMainFrame) return; // aborted / sub-frame
    w.failures++;
    load.classList.remove("done");
    load.replaceChildren(big, h("div", { class: "err" }, h("b", {}, `Chưa mở được ${app.name}`), h("span", {}, state.signedIn === false ? "Máy chưa kết nối JAVIS. Anh mở bé JAVIS → Kết nối." : "Mạng tới JAVIS đang chập chờn.")),
      w.failures <= 3 ? h("button", { class: "btn", type: "button", onclick: () => { load.replaceChildren(big, h("span", {}, "Đang thử lại…")); webview.reload(); } }, "Thử lại") : h("span", {}, "Đã thử 3 lần — để sau nhé."));
  });
  webview.addEventListener("page-title-updated", (e) => {
    const t = String(e.title || "").trim();
    titleText.textContent = t && !/^JAVIS$/i.test(t) && t.length < 60 ? `${app.name} — ${t.replace(/\s*[·|–-]\s*JAVIS.*$/i, "")}` : app.name;
  });

  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("opening")));
  focusWindow(w);
  renderDock();
  return w;
}

function openApp(id, props = {}) {
  const app = typeof id === "object" ? id : getApp(id);
  if (!app) return null;
  closeOverlays();
  const url = appUrl(state.info.gateway, app, props);
  if (!url) return null;
  const existing = windows.get(app.id);
  if (existing) {
    if (existing.min) restore(existing);
    focusWindow(existing);
    if (props && Object.keys(props).length && url !== existing.url) {
      existing.url = url;
      existing.webview.loadURL(url).catch(() => {});
    }
    return existing;
  }
  bounceDock(app.id);
  return createWindow(app, url);
}

// A JAVIS link opened from inside a module → its own window.
function openUrlWindow(url) {
  let u;
  try { u = new URL(url); } catch { return; }
  const mod = u.searchParams.get("module");
  const known = mod ? ALL_APPS.find((a) => a.module === mod) : ALL_APPS.find((a) => a.path && u.pathname === a.path);
  if (known) {
    const props = Object.fromEntries(u.searchParams.entries());
    openApp(known.id, props);
    return;
  }
  const id = `web-${mod || u.pathname.replace(/\W+/g, "-")}`.slice(0, 40);
  const app = { id, name: mod || "JAVIS", url: u.href, glyph: "spark", tint: ["#5fe7ff", "#2a5bff"] };
  if (windows.has(id)) { focusWindow(windows.get(id)); windows.get(id).webview.loadURL(u.href).catch(() => {}); return; }
  createWindow(app, u.href);
}

function frontWindow() {
  let best = null;
  for (const w of windows.values()) if (!w.min && (!best || Number(w.el.style.zIndex) > Number(best.el.style.zIndex))) best = w;
  return best;
}

function focusWindow(w) {
  if (!w || w.min) return;
  for (const o of windows.values()) o.el.classList.toggle("front", o === w);
  if (Number(w.el.style.zIndex) !== zTop) w.el.style.zIndex = String(++zTop);
  $("mb-app").textContent = w.app.name;
}

function refreshFront() {
  const w = frontWindow();
  if (w) focusWindow(w);
  else $("mb-app").textContent = "JAVIS";
}

function closeWindow(w) {
  if (!windows.has(w.app.id)) return;
  windows.delete(w.app.id);
  saveGeom(w);
  w.el.classList.add("closing");
  setTimeout(() => w.el.remove(), 160);
  refreshFront();
  renderDock();
}

function dockIconRect(id) {
  const it = $("dock").querySelector(`[data-app="${CSS.escape(id)}"]`) || $("dock").querySelector(".dock-item:last-child");
  return it ? it.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight, width: 0, height: 0 };
}

function minimize(w) {
  if (w.min) return;
  const r = w.el.getBoundingClientRect();
  const t = dockIconRect(w.app.id);
  const dx = t.left + t.width / 2 - (r.left + r.width / 2);
  const dy = t.top - r.bottom;
  w.el.classList.add("minimizing");
  w.el.style.transform = `translate(${dx}px, ${dy}px) scale(0.06, 0.04)`;
  setTimeout(() => {
    w.el.classList.add("min");
    w.el.classList.remove("minimizing", "front");
    w.el.style.transform = "";
    w.min = true;
    refreshFront();
    renderDock();
  }, 340);
}

function restore(w) {
  if (!w.min) return;
  const t = dockIconRect(w.app.id);
  w.min = false;
  w.el.classList.remove("min");
  const r = w.el.getBoundingClientRect();
  w.el.style.transition = "none";
  w.el.style.transform = `translate(${t.left + t.width / 2 - (r.left + r.width / 2)}px, ${t.top - r.bottom}px) scale(0.06, 0.04)`;
  w.el.style.opacity = "0";
  requestAnimationFrame(() => {
    w.el.style.transition = "";
    w.el.style.transform = "";
    w.el.style.opacity = "";
  });
  focusWindow(w);
  renderDock();
}

function toggleZoom(w) {
  w.el.classList.add("animating");
  if (w.zoomed) {
    w.zoomed = false;
    w.el.classList.remove("zoomed");
    applyGeom(w, w.geom);
  } else {
    saveGeom(w);
    w.zoomed = true;
    w.el.classList.add("zoomed");
    const r = desktopRect();
    applyGeom(w, { x: 6, y: 6, w: r.w - 12, h: r.h - r.bottom - 8 });
  }
  setTimeout(() => w.el.classList.remove("animating"), 260);
}

function tileWindows() {
  const list = [...windows.values()].filter((w) => !w.min);
  const r = desktopRect();
  const cols = list.length <= 2 ? list.length : list.length <= 4 ? 2 : 3;
  const rows = Math.ceil(list.length / cols);
  const cw = (r.w - 12) / cols;
  const ch = (r.h - r.bottom - 8) / rows;
  list.forEach((w, i) => {
    w.zoomed = false;
    w.el.classList.remove("zoomed");
    w.el.classList.add("animating");
    w.geom = { x: Math.round(6 + (i % cols) * cw), y: Math.round(6 + Math.floor(i / cols) * ch), w: Math.round(cw - 6), h: Math.round(ch - 6) };
    applyGeom(w, w.geom);
    setTimeout(() => w.el.classList.remove("animating"), 260);
  });
}

function dragBehaviour(w, bar) {
  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, gx: w.zoomed ? null : w.geom.x, gy: w.geom.y };
    if (w.zoomed) {
      // Dragging a zoomed window: restore under the cursor (macOS behaviour).
      const ratio = (e.clientX - w.el.getBoundingClientRect().left) / w.el.offsetWidth;
      w.zoomed = false;
      w.el.classList.remove("zoomed");
      w.geom = { ...w.geom, x: Math.round(e.clientX - w.geom.w * ratio), y: 0 };
      applyGeom(w, w.geom);
      start.gx = w.geom.x;
      start.gy = w.geom.y;
    }
    bar.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging");
    const move = (ev) => {
      w.geom = clampGeom({ ...w.geom, x: start.gx + ev.clientX - start.x, y: start.gy + ev.clientY - start.y });
      applyGeom(w, w.geom);
    };
    const up = () => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
      document.body.classList.remove("dragging");
      saveGeom(w);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
  });
}

function resizeBehaviour(w, grip) {
  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (w.zoomed) { w.zoomed = false; w.el.classList.remove("zoomed"); }
    const dir = grip.dataset.dir;
    const s = { x: e.clientX, y: e.clientY, g: { ...w.geom } };
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging");
    const move = (ev) => {
      const dx = ev.clientX - s.x;
      const dy = ev.clientY - s.y;
      const g = { ...s.g };
      if (dir.includes("e")) g.w = Math.max(520, s.g.w + dx);
      if (dir.includes("s")) g.h = Math.max(340, s.g.h + dy);
      if (dir.includes("w")) { g.w = Math.max(520, s.g.w - dx); g.x = s.g.x + (s.g.w - g.w); }
      w.geom = g;
      applyGeom(w, g);
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      document.body.classList.remove("dragging");
      saveGeom(w);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  });
}

// ═══════════════════════ Dock ═══════════════════════
const LAUNCH_APP = { id: "launchpad", name: "Launchpad", glyph: "launch", tint: ["#e9edf5", "#b8c1d6"] };

let dockClicked = ""; // no tooltip on the icon just clicked until the pointer leaves the Dock
function dockItem(app, { onClick, badge = 0, running = false, extraClass = "" } = {}) {
  const icon = iconEl(app, extraClass);
  const it = h("button", { class: `dock-item${running ? " running" : ""}`, type: "button", "data-app": app.id, "aria-label": app.name },
    icon, h("i", { class: "run" }), h("span", { class: "tip" }, app.name),
    badge > 0 ? h("b", { class: "badge" }, badge > 99 ? "99+" : String(badge)) : null);
  if (dockClicked === app.id) it.classList.add("clicked");
  it.addEventListener("click", (e) => { dockClicked = app.id; it.classList.add("clicked"); onClick(e); });
  return it;
}

function renderDock() {
  const dock = $("dock");
  const items = DOCK_APPS.map((app) => {
    const w = windows.get(app.id);
    return dockItem(app, {
      running: !!w,
      badge: app.id === "crm" ? state.unread : app.id === "ban-viec" ? state.waiting.length : 0,
      onClick: () => {
        const cur = windows.get(app.id);
        if (cur && !cur.min && cur.el.classList.contains("front")) minimize(cur);
        else openApp(app.id);
      },
    });
  });
  // Windows opened from Launchpad / links get a Dock slot while open (like macOS).
  const extra = [...windows.values()].filter((w) => !DOCK_APPS.some((a) => a.id === w.app.id))
    .map((w) => dockItem(w.app, { running: true, onClick: () => (w.min ? restore(w) : w.el.classList.contains("front") ? minimize(w) : focusWindow(w)) }));
  const launch = dockItem(LAUNCH_APP, { extraClass: "launch", onClick: () => toggleLaunchpad() });
  dock.replaceChildren(...items, h("div", { class: "dock-sep" }), ...extra, launch);
}

function bounceDock(id) {
  const it = $("dock").querySelector(`[data-app="${CSS.escape(id)}"]`);
  if (!it) return;
  it.classList.remove("bounce");
  void it.offsetWidth;
  it.classList.add("bounce");
  setTimeout(() => it.classList.remove("bounce"), 1300);
}

// Magnification: icons near the cursor grow (max ×1.45, falls off over ~2.5 icons).
(function magnify() {
  const dock = $("dock");
  const MAX = 1.6;
  const RANGE = 150;
  let raf = 0;
  let mx = null;
  const apply = () => {
    raf = 0;
    for (const it of dock.querySelectorAll(".dock-item")) {
      if (mx == null) { it.style.transform = ""; it.style.margin = ""; continue; }
      const r = it.getBoundingClientRect();
      const d = Math.abs(mx - (r.left + r.width / 2));
      const s = d > RANGE ? 1 : 1 + (MAX - 1) * Math.cos((d / RANGE) * (Math.PI / 2)) ** 2;
      it.style.transform = `scale(${s.toFixed(3)})`;
      const grow = (s - 1) * 52 / 2;
      it.style.margin = `0 ${grow.toFixed(1)}px`;
    }
  };
  dock.addEventListener("pointermove", (e) => { mx = e.clientX; if (!raf) raf = requestAnimationFrame(apply); });
  dock.addEventListener("pointerleave", () => { dockClicked = ""; for (const it of dock.querySelectorAll(".clicked")) it.classList.remove("clicked"); mx = null; if (!raf) raf = requestAnimationFrame(apply); });
})();

// ═══════════════════════ Launchpad ═══════════════════════
function renderLaunchpad(filter = "") {
  const q = normalize(filter);
  const groups = [{ name: "Trên Dock", apps: DOCK_APPS }, ...LAUNCHPAD_GROUPS];
  const out = [];
  for (const g of groups) {
    const apps = g.apps.filter((a) => !q || normalize(a.name).includes(q) || (a.keys || []).some((k) => k.includes(q)) || normalize(g.name).includes(q));
    if (!apps.length) continue;
    out.push(h("section", { class: "lp-group" }, h("h4", {}, g.name), h("div", { class: "lp-apps" },
      apps.map((a) => h("button", { class: "lp-app", type: "button", title: a.hint || a.name, onclick: () => { openApp(a.id); } }, iconEl(a), h("span", {}, a.name))))));
  }
  $("lp-grid").replaceChildren(...(out.length ? out : [h("p", { style: { color: "#cbd5ff", textAlign: "center" } }, "Không thấy ứng dụng nào.")]));
}
function openLaunchpad() {
  closeOverlays();
  $("launchpad").hidden = false;
  $("lp-search").value = "";
  renderLaunchpad();
  setTimeout(() => $("lp-search").focus(), 30);
}
function toggleLaunchpad() {
  if ($("launchpad").hidden) openLaunchpad();
  else $("launchpad").hidden = true;
}
$("lp-search").addEventListener("input", (e) => renderLaunchpad(e.target.value));
$("launchpad").addEventListener("click", (e) => { if (e.target === $("launchpad") || e.target === $("lp-grid")) $("launchpad").hidden = true; });
$("lp-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const first = $("lp-grid").querySelector(".lp-app"); if (first) first.click(); }
});

// ═══════════════════════ Spotlight ═══════════════════════
const sp = { items: [], sel: 0, searchTimer: 0, seq: 0, recorder: null, chatSid: null };

function openSpotlight({ listen = false, text = "" } = {}) {
  closeMenu();
  $("launchpad").hidden = true;
  $("bell-panel").hidden = true;
  $("spotlight").hidden = false;
  const input = $("sp-input");
  input.value = text;
  renderSpotlight();
  setTimeout(() => { input.focus(); input.select(); }, 20);
  if (listen) startListening();
}
function closeSpotlight() {
  if (sp.recorder) { sp.recorder.stop(); sp.recorder = null; }
  $("spotlight").hidden = true;
  $("sp-mic").classList.remove("on");
  $("orb").classList.remove("listening");
}

function spItem(kind, data) {
  return { kind, ...data };
}

function renderSpotlight(remote = null) {
  const text = $("sp-input").value.trim();
  const items = [];
  const apps = text ? searchApps(text, 5) : DOCK_APPS.slice(0, 5).map((app) => ({ app, score: 0 }));
  const strongApp = apps.length && apps[0].score >= 70;
  const give = text ? spItem("task", { title: `Giao cho JAVIS: “${text.length > 60 ? text.slice(0, 59) + "…" : text}”`, sub: "Đội JAVIS nhận việc và báo lại anh", text }) : null;
  if (give && !strongApp) items.push(give);
  for (const { app } of apps) items.push(spItem("app", { app, title: app.name, sub: app.hint || app.group || "" }));
  if (give && strongApp) items.push(give);
  if (remote && remote.length) for (const r of remote) items.push(spItem("found", { title: r.title || r.ref, sub: `${kindLabel(r.kind)}${r.snip ? " · " + r.snip.replace(/[«»]/g, "") : ""}`, ref: r.ref, rkind: r.kind }));
  sp.items = items;
  sp.sel = 0;
  const box = $("sp-results");
  const nodes = [];
  let lastGroup = "";
  items.forEach((it, i) => {
    const group = it.kind === "app" ? (text ? "Ứng dụng" : "Hay dùng") : it.kind === "task" ? "Giao việc" : "Việc & idea";
    if (group !== lastGroup) { nodes.push(h("div", { class: "sp-group" }, group)); lastGroup = group; }
    const icon = it.kind === "app" ? iconEl(it.app) : iconEl(it.kind === "task" ? { glyph: "spark", tint: ["#7b5cff", "#2a5bff"] } : { glyph: "check", tint: ["#ffb340", "#ff7a1a"] });
    nodes.push(h("button", { class: `sp-item${i === 0 ? " sel" : ""}`, type: "button", "data-i": String(i), onclick: () => runItem(i), onmousemove: () => selectItem(i) },
      icon, h("div", {}, h("span", { class: "t" }, it.title), it.sub ? h("span", { class: "s" }, it.sub) : null), i === 0 ? h("kbd", {}, "↩") : h("kbd", {})));
  });
  box.replaceChildren(...nodes, h("div", { class: "sp-foot" }, h("span", {}, "↑↓ chọn · ↩ mở / giao · Esc đóng"), h("span", {}, "Bấm mic để nói")));
}

function kindLabel(k) {
  return { task: "Việc", idea: "Idea", order: "Đơn", asset: "Tài sản", lead: "Khách", doc: "Tài liệu" }[k] || (k || "Kết quả");
}

function selectItem(i) {
  sp.sel = Math.max(0, Math.min(i, sp.items.length - 1));
  for (const b of $("sp-results").querySelectorAll(".sp-item")) {
    const on = Number(b.dataset.i) === sp.sel;
    b.classList.toggle("sel", on);
    b.querySelector("kbd").textContent = on ? "↩" : "";
    if (on) b.scrollIntoView({ block: "nearest" });
  }
}

function runItem(i) {
  const it = sp.items[i];
  if (!it) return;
  if (it.kind === "app") { closeSpotlight(); openApp(it.app.id); }
  else if (it.kind === "task") giveTask(it.text);
  else if (it.kind === "found") {
    closeSpotlight();
    openApp("ban-viec", it.rkind === "idea" ? { idea_id: it.ref } : { card: it.ref });
  }
}

$("sp-input").addEventListener("input", () => {
  renderSpotlight();
  clearTimeout(sp.searchTimer);
  const text = $("sp-input").value.trim();
  if (text.length < 2 || !state.signedIn) return;
  const seq = ++sp.seq;
  sp.searchTimer = setTimeout(async () => {
    try {
      const r = await api(`/fleet/search?q=${encodeURIComponent(text)}&limit=6`);
      if (seq === sp.seq && !$("spotlight").hidden) renderSpotlight((r && r.results) || []);
    } catch {}
  }, 220);
});
$("sp-input").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); selectItem(sp.sel + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); selectItem(sp.sel - 1); }
  else if (e.key === "Escape") { e.preventDefault(); closeSpotlight(); }
});
$("sp-form").addEventListener("submit", (e) => { e.preventDefault(); runItem(sp.sel); });
$("spotlight").addEventListener("pointerdown", (e) => { if (e.target === $("spotlight")) closeSpotlight(); });
$("sp-mic").addEventListener("click", () => (sp.recorder ? sp.recorder.stop() : startListening()));

async function ensureChatSession() {
  if (sp.chatSid) return sp.chatSid;
  try { sp.chatSid = (await api("/fleet/chat")).active || `s-${Date.now().toString(36)}`; } catch { sp.chatSid = `s-${Date.now().toString(36)}`; }
  return sp.chatSid;
}

// Free text → the JAVIS brain (same chat session as JAVIS web), streamed into Spotlight.
async function giveTask(text) {
  if (!text) return;
  const box = $("sp-results");
  const answer = h("div", { class: "sp-answer typing" });
  box.replaceChildren(h("div", { class: "sp-answer" }, h("div", { class: "q" }, `Anh: ${text}`)), answer);
  answer.previousSibling.style.paddingBottom = "0";
  let out = "";
  try {
    const sid = await ensureChatSession();
    const now = Date.now();
    api("/fleet/chat/messages", { method: "POST", body: { session_id: sid, client_id: "desk-os", message: { id: `u-${now}`, role: "user", text, time: "", pending: false } } }).catch(() => {});
    const res = await fetch("/fleet/voice/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, session_id: sid, chat_session_id: sid, stream: true, execute: true, tools: true }) });
    if (!res.ok || !res.body) throw Object.assign(new Error("chat"), { status: res.status });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const cut = buf.lastIndexOf("\n\n");
      if (cut < 0) continue;
      out += deltas(buf.slice(0, cut));
      buf = buf.slice(cut + 2);
      answer.textContent = out || "…";
    }
    out = (out + deltas(buf)).trim() || "Dạ anh, em nhận rồi!";
    answer.classList.remove("typing");
    answer.textContent = out;
    api("/fleet/chat/messages", { method: "POST", body: { session_id: sid, client_id: "desk-os", message: { id: `a-${now}`, role: "assistant", text: out, time: "" } } }).catch(() => {});
  } catch (err) {
    answer.classList.remove("typing");
    answer.textContent = err.status === 401 ? "Máy chưa kết nối JAVIS — anh bấm bé JAVIS → Kết nối nhé." : "Chưa gửi được, mạng tới JAVIS đang chập chờn. Anh bấm ↩ để thử lại.";
  }
}
function deltas(block) {
  return block.split("\n").filter((l) => l.startsWith("data:") && !l.includes("[DONE]"))
    .map((l) => { try { return JSON.parse(l.slice(5)).choices?.[0]?.delta?.content || ""; } catch { return ""; } }).join("");
}

async function startListening() {
  if (sp.recorder) return;
  $("sp-mic").classList.add("on");
  $("orb").classList.add("listening");
  $("sp-input").placeholder = "Em đang nghe…";
  try {
    sp.recorder = recordUtterance({});
    const rec = await sp.recorder.done;
    sp.recorder = null;
    if (!rec.heardSpeech) return;
    const r = await jos.transcribe(rec.base64);
    const text = r && r.ok && r.text ? String(r.text).trim() : "";
    if (text && !$("spotlight").hidden) {
      $("sp-input").value = text;
      renderSpotlight();
      runItem(0);
    }
  } catch {
    $("sp-input").placeholder = "Chưa dùng được micro — anh gõ giúp em nhé";
  } finally {
    sp.recorder = null;
    $("sp-mic").classList.remove("on");
    $("orb").classList.remove("listening");
    if ($("sp-input").placeholder === "Em đang nghe…") $("sp-input").placeholder = "Giao việc, tìm việc, mở ứng dụng…";
  }
}

$("orb").addEventListener("click", () => openSpotlight({ listen: true }));

// ═══════════════════════ banners + bell ═══════════════════════
function banner({ title, subtitle = "", body = "", initials = "J", badge = "", onOpen, actions = [], ttl = 5000, tone = "crm" }) {
  const el = h("div", { class: "banner", role: "status" },
    h("button", { class: "bx", type: "button", "aria-label": "Đóng" }, "✕"),
    h("div", { class: "av", style: tone === "task" ? { background: "linear-gradient(160deg,#ffb340,#ff7a1a)" } : null }, initials, badge ? h("i", {}, badge) : null),
    h("div", {}, h("div", { class: "bh" }, h("b", {}, title), h("span", {}, subtitle || "bây giờ")), body ? h("p", {}, body) : null),
    actions.length ? h("div", { class: "bact" }, actions.map((a) => h("button", { type: "button", class: a.primary ? "pri" : "", onclick: (e) => { e.stopPropagation(); a.run(); dismiss(); } }, a.label))) : null);
  const stack = $("notify");
  stack.prepend(el);
  while (stack.children.length > 3) stack.lastChild.remove();
  let timer = setTimeout(dismiss, ttl);
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => { timer = setTimeout(dismiss, 2500); });
  el.addEventListener("click", (e) => { if (e.target.closest(".bx")) { dismiss(); return; } if (onOpen) onOpen(); dismiss(); });
  function dismiss() {
    clearTimeout(timer);
    el.classList.add("out");
    setTimeout(() => el.remove(), 240);
  }
  return el;
}

function announceCustomer(n) {
  state.recent.unshift({ ...n, kind: "crm", shownAt: Date.now() });
  state.recent = state.recent.slice(0, 20);
  const open = () => { jos.setUnread(state.unread); openApp("crm", { conv: n.conv }); };
  // OS window in front → banner here; otherwise main shows a system notification.
  jos.notify({ title: n.title, subtitle: n.subtitle, body: n.body, conv: n.conv }).then((r) => {
    if (r && r.inPage) {
      banner({ title: n.title, subtitle: n.subtitle || "Hộp thư chung", body: n.body, initials: n.initials, badge: n.badge, onOpen: open,
        actions: [{ label: "Mở hội thoại", primary: true, run: open }, { label: "Để sau", run: () => {} }] });
    }
  }).catch(() => {});
  bounceDock("crm");
}

function toggleBellPanel() {
  const p = $("bell-panel");
  if (!p.hidden) { p.hidden = true; return; }
  closeMenu();
  const wait = state.waiting.slice(0, 8);
  p.replaceChildren(
    h("h3", {}, h("span", {}, `Việc cần anh · ${state.waiting.length}`), h("button", { type: "button", onclick: () => { p.hidden = true; openApp("ban-viec"); } }, "Mở Bàn việc")),
    ...(wait.length ? wait.map((t) => h("button", { class: "bell-item", type: "button", onclick: () => { p.hidden = true; openApp("ban-viec", { card: t.id }); } },
      h("b", { class: "d" }), h("span", {}, String(t.title || "Việc").slice(0, 110), h("small", {}, [t.team, t.owner && t.owner.q ? String(t.owner.q).slice(0, 90) : t.state_label].filter(Boolean).join(" · "))))) : [h("div", { class: "bell-empty" }, "Không có việc nào chờ anh.")]),
    h("h3", { style: { marginTop: "14px" } }, h("span", {}, `Tin khách · ${state.unread} chưa đọc`), h("button", { type: "button", onclick: () => { p.hidden = true; openApp("crm"); } }, "Mở Hộp thư")),
    ...(state.recent.length ? state.recent.slice(0, 6).map((n) => h("button", { class: "bell-item", type: "button", onclick: () => { p.hidden = true; openApp("crm", { conv: n.conv }); } },
      h("b", { class: "d", style: { background: "#33e1a0" } }), h("span", {}, n.title, h("small", {}, `${n.subtitle ? n.subtitle + " · " : ""}${n.body}`)))) : [h("div", { class: "bell-empty" }, "Chưa có tin mới từ lúc mở JAVIS OS.")]),
  );
  p.hidden = false;
}

// ═══════════════════════ widgets ═══════════════════════
function renderWidgets() {
  const wait = state.waiting;
  const m = state.machines;
  const locked = state.denied || state.signedIn === false;
  const lockText = state.signedIn === false ? "Chưa kết nối JAVIS" : "Máy này chưa có quyền xem — duyệt máy trên JAVIS web";
  const num = (n) => (locked ? "—" : String(n));
  const wico = (glyph, t1, t2) => h("span", { class: "w-ico", style: { background: `linear-gradient(160deg,${t1},${t2})` }, html: svg(glyph) });
  $("widgets").replaceChildren(
    h("button", { class: `widget${!locked && state.unread ? " hot" : !locked ? " calm" : ""}`, type: "button", onclick: () => openApp("crm") },
      h("div", { class: "w-top" }, wico("chat", "#33e1a0", "#0a9f74"), "Tin khách"),
      h("div", {}, h("div", { class: "w-num" }, num(state.unread), h("small", {}, "chưa đọc")), h("div", { class: "w-sub" }, locked ? lockText : state.unread ? `${state.needReply ? state.needReply + " cần trả lời · " : ""}bấm để mở` : state.inboxReal === 0 ? "Chưa nối kênh thật" : "Hộp thư đã sạch"))),
    h("button", { class: `widget${!locked && wait.length ? " hot" : !locked ? " calm" : ""}`, type: "button", onclick: () => openApp("ban-viec") },
      h("div", { class: "w-top" }, wico("check", "#ffb340", "#ff7a1a"), "Việc chờ anh"),
      h("div", {}, h("div", { class: "w-num" }, num(wait.length), h("small", {}, "việc")), h("div", { class: "w-sub" }, locked ? lockText : wait.length ? "Cần anh quyết hôm nay" : "Anh rảnh tay"))),
    h("button", { class: "widget wide", type: "button", onclick: () => openApp("ban-viec") },
      h("div", { class: "w-top" }, wico("spark", "#7b5cff", "#2a5bff"), "Gấp nhất hôm nay"),
      !locked && wait.length ? h("ul", { class: "w-list" }, wait.slice(0, 3).map((t) => h("li", {}, h("b"), h("span", {}, String(t.title || "Việc")), t.team ? h("em", {}, t.team) : null)))
        : h("div", { class: "w-empty" }, locked ? lockText : "Không có việc nào chờ anh quyết.")),
    h("button", { class: "widget wide", type: "button", onclick: () => openApp("may") },
      h("div", { class: "w-top" }, wico("chip", "#9aa6c2", "#4b5675"), "Máy móc"),
      m ? h("div", {}, h("div", { class: "w-big" }, h("b", {}, `${m.online}/${m.total}`), "máy online · ", `${m.heavy} việc nặng · ${m.queued} chờ`),
        h("div", { class: "bars" }, Array.from({ length: Math.min(12, m.total) }, (_, i) => h("i", { class: i < m.online ? "on" : "" }))))
        : h("div", { class: "w-empty" }, locked ? lockText : "Bấm để xem RAM/GPU từng máy")),
  );
}

// ═══════════════════════ data (event-driven) ═══════════════════════
async function refreshInbox() {
  try {
    const v = await api("/fleet/inbox?folder=chua_doc");
    const r = inbox.apply(v);
    state.unread = r.unread;
    state.inboxReal = Number(v && v.real_total) || 0;
    state.needReply = Number(v && v.counts && v.counts.can_tra_loi) || 0;
    state.denied = false;
    jos.setUnread(r.unread);
    for (const n of r.fresh.slice().reverse()) announceCustomer(n);
    renderDock();
    renderWidgets();
  } catch (err) {
    onDataError(err);
  }
}

function onDataError(err) {
  if (err.status === 401 || err.status === 403) {
    if (!state.denied) { state.denied = true; renderWidgets(); }
  }
}

let lastTasksAt = 0;
let tasksPrimed = false;
let tasksTimer = 0;
async function refreshTasks(force = false) {
  const gap = Date.now() - lastTasksAt;
  if (!force && gap < 15000) { clearTimeout(tasksTimer); tasksTimer = setTimeout(() => refreshTasks(true), 15000 - gap); return; }
  lastTasksAt = Date.now();
  try {
    const t = await api("/fleet/home/tasks");
    const grew = tasksPrimed && (t.waiting || []).length > state.waiting.length;
    tasksPrimed = true;
    const first = (t.waiting || [])[0];
    state.waiting = t.waiting || [];
    state.denied = false;
    setSigned(true);
    setBell();
    renderDock();
    renderWidgets();
    if (grew && first) {
      banner({ tone: "task", title: "Việc mới chờ anh", subtitle: first.team || "Bàn việc", body: String(first.title || ""), initials: "!", onOpen: () => openApp("ban-viec", { card: first.id }),
        actions: [{ label: "Xem ngay", primary: true, run: () => openApp("ban-viec", { card: first.id }) }] });
    }
  } catch (err) {
    onDataError(err);
  }
}

async function refreshMachines() {
  try {
    const d = await api("/fleet/load");
    const nodes = d.nodes || [];
    const t = d.tong || d.total || {};
    state.machines = { online: t.online ?? nodes.filter((n) => n.online).length, total: t.may ?? nodes.length, heavy: t.heavy_running ?? 0, queued: t.queued ?? 0 };
    renderWidgets();
  } catch (err) { onDataError(err); }
}

function setSigned(on) {
  if (state.signedIn === on) return;
  state.signedIn = on;
  setHost();
  if (on) startStream();
  renderWidgets();
}

let streamFailures = 0;
let streamAbort = null;
let inboxTimer = 0;
async function startStream() {
  if (streamAbort || !state.signedIn) return;
  streamAbort = new AbortController();
  try {
    const res = await fetch("/fleet/stream?v=2", { signal: streamAbort.signal, headers: { Accept: "text/event-stream" } });
    if (!res.ok || !res.body || res.status === 204) throw new Error(`stream_${res.status}`);
    streamFailures = 0;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("\n");
        if (!data) continue;
        let ev = null;
        try { ev = JSON.parse(data); } catch { continue; }
        onEvent(ev);
      }
    }
    throw new Error("stream_closed");
  } catch (err) {
    streamAbort = null;
    if (err && err.name === "AbortError") return;
    streamFailures++;
    if (streamFailures <= 3) setTimeout(startStream, 5000 * 2 ** streamFailures);
  }
}

function onEvent(ev) {
  const type = ev && ev.type;
  if (type === "inbox.updated") {
    clearTimeout(inboxTimer);
    inboxTimer = setTimeout(refreshInbox, 1200);
  } else if (type === "task.updated" || type === "approval.created" || type === "ticket.created") {
    refreshTasks();
  }
}

// ═══════════════════════ keyboard + commands ═══════════════════════
function closeOverlays() {
  closeMenu();
  if (!$("spotlight").hidden) closeSpotlight();
  $("launchpad").hidden = true;
  $("bell-panel").hidden = true;
}

document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && (e.code === "Space" || e.key.toLowerCase() === "k")) { e.preventDefault(); $("spotlight").hidden ? openSpotlight() : closeSpotlight(); return; }
  if (e.key === "F4") { e.preventDefault(); toggleLaunchpad(); return; }
  if (e.key === "Escape") { closeOverlays(); return; }
  if (e.key === "F11") { e.preventDefault(); jos.fullscreen(); return; }
  const w = frontWindow();
  if (mod && e.key.toLowerCase() === "w" && w) { e.preventDefault(); closeWindow(w); }
  else if (mod && e.key.toLowerCase() === "m" && w) { e.preventDefault(); minimize(w); }
  else if (mod && e.key.toLowerCase() === "h") { e.preventDefault(); jos.hide(); }
  else if (mod && e.key.toLowerCase() === "r" && w) { e.preventDefault(); w.webview.reload(); }
  else if (mod && /^[1-9]$/.test(e.key)) { e.preventDefault(); openApp(DOCK_APPS[Number(e.key) - 1].id); }
});

jos.onCommand((cmd) => {
  if (!cmd || typeof cmd !== "object") return;
  if (cmd.type === "spotlight") openSpotlight({ listen: !!cmd.listen, text: cmd.text || "" });
  else if (cmd.type === "open" && cmd.app) openApp(cmd.app, cmd.props || {});
  else if (cmd.type === "open-url" && cmd.url) openUrlWindow(cmd.url);
  else if (cmd.type === "launchpad") openLaunchpad();
  else if (cmd.type === "key" && cmd.key) document.dispatchEvent(new KeyboardEvent("keydown", { key: cmd.key, code: cmd.code || "", metaKey: !!cmd.meta, ctrlKey: !!cmd.ctrl }));
});
jos.onFocus((on) => {
  state.focused = !!on;
  document.body.classList.toggle("idle", !on);
});
jos.onAuth((s) => {
  if (!s) return;
  setSigned(!!(s.paired && !s.authError));
  if (s.paired) { state.denied = false; refreshInbox(); refreshTasks(true); refreshMachines(); }
});

// ═══════════════════════ start ═══════════════════════
(async function start() {
  tickClock();
  try { state.info = { ...state.info, ...(await jos.info()) }; } catch {}
  setHost();
  renderDock();
  renderWidgets();
  const s = await jos.status().catch(() => null);
  if (s && s.paired && !s.authError) {
    setSigned(true);
    refreshInbox();
    refreshTasks(true);
    refreshMachines();
  } else if (s) {
    setSigned(s.autoSigningIn ? null : false);
  }
})();

window.__javisOS = { openApp, openSpotlight, openLaunchpad, state, windows, banner, announceCustomer, tileWindows };
