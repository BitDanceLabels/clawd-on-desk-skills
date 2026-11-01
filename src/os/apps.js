// src/os/apps.js — the apps of JAVIS OS: what sits in the Dock, what the Launchpad
// lists, which JAVIS web module each window embeds, and the Spotlight app search.
//
// Every app window is a <webview> on the JAVIS gateway: `${gateway}/?module=<id>`
// (or a static ops page). The web modules already exist in bumbee-javis; the desk
// only embeds them — never re-implements them. CommonJS + browser (bundled by esbuild).
"use strict";

// Dock, left → right. `glyph` is drawn by os.css (original icons, no Apple artwork).
const DOCK_APPS = [
  { id: "giao-viec", name: "Giao việc", hint: "Gõ hoặc nói 1 câu là giao việc cho đội JAVIS", module: "studio", glyph: "spark", tint: ["#7b5cff", "#2a5bff"], keys: ["ra lenh", "giao viec", "lenh", "studio", "nho lam", "command"] },
  { id: "crm", name: "Hộp thư chung", hint: "Mọi tin nhắn, bình luận của khách ở một chỗ", module: "hop-thu-chung", glyph: "chat", tint: ["#33e1a0", "#0a9f74"], keys: ["hop thu", "inbox", "crm", "tin nhan", "khach", "messenger", "zalo", "binh luan", "social"], central: true },
  { id: "ban-viec", name: "Bàn việc", hint: "Việc chờ anh quyết + việc đang chạy", module: "ban-viec", glyph: "check", tint: ["#ffb340", "#ff7a1a"], keys: ["ban viec", "viec", "task", "viec can anh", "duyet", "cho anh"] },
  { id: "kho", name: "Kho tài sản", hint: "Mọi thành phẩm: video, nhạc, ảnh", module: "asset-hub", glyph: "box", tint: ["#5fe7ff", "#1c8dd8"], keys: ["kho", "tai san", "asset", "thanh pham", "file"] },
  { id: "nhac", name: "Nhạc", hint: "Xưởng nhạc, bài mới, playlist", module: "music-studio", glyph: "note", tint: ["#ff5f8f", "#d4246b"], keys: ["nhac", "music", "suno", "bai hat", "playlist"] },
  { id: "media", name: "Video & Media", hint: "Xưởng phim, MV, video ngắn", module: "xuong-phim", glyph: "film", tint: ["#ff6a5f", "#c2321f"], keys: ["video", "media", "phim", "mv", "clip", "reel", "short"] },
  { id: "ban-hang", name: "Bán hàng", hint: "Khách cần gọi, đơn, phễu bán", module: "sales-desk", glyph: "bag", tint: ["#f5d04d", "#e09a12"], keys: ["ban hang", "sales", "don hang", "khach hang", "doanh thu", "phieu"] },
  { id: "bao-cao", name: "Báo cáo", hint: "Mọi số liệu trên một màn", module: "tong-quan", glyph: "chart", tint: ["#4fa3ff", "#3a4dff"], keys: ["bao cao", "dashboard", "so lieu", "tong quan", "kpi", "dong tien"] },
  { id: "may", name: "Máy móc", hint: "RAM/CPU/GPU từng máy, việc nặng đang chạy", path: "/ops/tai-may.html", glyph: "chip", tint: ["#9aa6c2", "#4b5675"], keys: ["may", "may moc", "ram", "gpu", "cpu", "server", "tai may"] },
];

// Launchpad: every JAVIS module grouped by team (ids from the web's module registry).
const LAUNCHPAD_GROUPS = [
  { name: "Điều hành", apps: [
    { id: "viec-cua-anh", name: "Việc của anh", module: "viec-cua-anh", glyph: "hand", tint: ["#ffb340", "#ff5a1a"] },
    { id: "menu-javis", name: "Menu JAVIS", module: "menu-javis", glyph: "list", tint: ["#5fe7ff", "#2a5bff"] },
    { id: "exec-room", name: "Phòng điều hành", module: "exec-room", glyph: "coin", tint: ["#f5d04d", "#c88a10"] },
    { id: "pnl-room", name: "Sổ P&L", module: "pnl-room", glyph: "coin", tint: ["#33e1a0", "#0a7f5d"] },
    { id: "meeting-room", name: "Phòng họp", module: "meeting-room", glyph: "clock", tint: ["#9b8cff", "#5a3dff"] },
    { id: "goals", name: "Mục tiêu", module: "goals", glyph: "target", tint: ["#ff6a5f", "#c2321f"] },
    { id: "hop-xac-thuc", name: "Hộp xác thực", module: "hop-xac-thuc", glyph: "lock", tint: ["#9aa6c2", "#4b5675"] },
    { id: "results-room", name: "Kết quả", module: "results-room", glyph: "check", tint: ["#33e1a0", "#0a9f74"] },
  ] },
  { name: "Khách & bán hàng", apps: [
    { id: "zalo-care", name: "Chăm sóc Zalo", module: "zalo-care", glyph: "chat", tint: ["#4fa3ff", "#1d5fe0"] },
    { id: "chatbotx-center", name: "Radar inbox", module: "chatbotx-center", glyph: "chat", tint: ["#33e1a0", "#0a7f5d"] },
    { id: "kho-shop", name: "Đặt hàng & kho", module: "kho-shop", glyph: "box", tint: ["#f5d04d", "#e09a12"] },
    { id: "kho-van-hanh", name: "Kho & vận hành", module: "kho-van-hanh", glyph: "grid", tint: ["#ffb340", "#d96a10"] },
    { id: "showroom-desk", name: "Showroom", module: "showroom-desk", glyph: "store", tint: ["#ff5f8f", "#b31e5a"] },
    { id: "pitch-room", name: "Bộ pitch", module: "pitch-room", glyph: "present", tint: ["#7b5cff", "#3a1dbf"] },
  ] },
  { name: "Sản xuất & kênh", apps: [
    { id: "publisher-studio", name: "Soạn & đăng bài", module: "publisher-studio", glyph: "pen", tint: ["#ff6a5f", "#c2321f"] },
    { id: "mikasa-film-ai", name: "JAVIS Studio", module: "mikasa-film-ai", glyph: "camera", tint: ["#9b8cff", "#5a3dff"] },
    { id: "brand-room", name: "Thương hiệu", module: "brand-room", glyph: "crown", tint: ["#f5d04d", "#c88a10"] },
    { id: "social-profiles", name: "Profile & máy", module: "social-profiles", glyph: "user", tint: ["#4fa3ff", "#3a4dff"] },
    { id: "legal-room", name: "Luật nền tảng", module: "legal-room", glyph: "scale", tint: ["#9aa6c2", "#4b5675"] },
    { id: "photo-idea", name: "Ảnh → Idea", module: "photo-idea", glyph: "spark", tint: ["#ff5f8f", "#d4246b"] },
  ] },
  { name: "Máy & đội trợ lý", apps: [
    { id: "quan-tri-nha-may", name: "6 Nhà máy", module: "quan-tri-nha-may", glyph: "gear", tint: ["#ffb340", "#d96a10"] },
    { id: "bo-nao", name: "Bộ não điều phối", path: "/ops/bo-nao.html", glyph: "brain", tint: ["#7b5cff", "#2a5bff"] },
    { id: "team", name: "Năng lực & nhân sự", module: "team", glyph: "people", tint: ["#33e1a0", "#0a9f74"] },
    { id: "ghe-ai", name: "Ghế & remote", module: "ghe-ai", glyph: "seat", tint: ["#5fe7ff", "#1c8dd8"] },
    { id: "remote-desk", name: "Điều khiển từ xa", module: "remote-desk", glyph: "screen", tint: ["#9aa6c2", "#4b5675"] },
    { id: "claude-console", name: "Claude Console", module: "claude-console", glyph: "bolt", tint: ["#ff8a5f", "#c2521f"] },
    { id: "codex-console", name: "Codex Console", module: "codex-console", glyph: "term", tint: ["#4b5675", "#1d2338"] },
    { id: "skill-store", name: "Kho Skill", module: "skill-store", glyph: "grid", tint: ["#9b8cff", "#5a3dff"] },
    { id: "fleet-map", name: "Bản đồ vận hành", module: "fleet-map", glyph: "radar", tint: ["#5fe7ff", "#2a5bff"] },
    { id: "clipboard", name: "Clipboard", module: "clipboard", glyph: "list", tint: ["#9aa6c2", "#4b5675"] },
  ] },
];

const ALL_APPS = (() => {
  const seen = new Set();
  const out = [];
  for (const a of DOCK_APPS) { seen.add(a.id); out.push({ ...a, group: "Dock" }); }
  for (const g of LAUNCHPAD_GROUPS) {
    for (const a of g.apps) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ ...a, group: g.name });
    }
  }
  return out;
})();

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getApp(id) {
  return ALL_APPS.find((a) => a.id === id) || null;
}

// Only these params may ride along to a module (the web reads them as panel props).
const PASS_PROPS = ["conv", "tab", "card", "focus", "kind", "team", "idea_id", "thread_id"];

/** URL of the web module an app window embeds, on the gateway the desk is signed in to. */
function appUrl(gateway, app, props = {}) {
  const base = String(gateway || "").replace(/\/+$/, "");
  if (!base || !app) return "";
  if (app.url) return app.url;
  if (app.path) return base + app.path;
  const q = new URLSearchParams({ module: app.module });
  for (const k of PASS_PROPS) {
    if (props && props[k] != null && props[k] !== "") q.set(k, String(props[k]).slice(0, 120));
  }
  return `${base}/?${q.toString()}`;
}

/**
 * Spotlight app search: name prefix > word prefix > keyword > substring, diacritics optional.
 * Returns [{ app, score }] best first.
 */
function searchApps(query, limit = 6) {
  const q = normalize(query);
  if (!q) return [];
  const scored = [];
  for (const app of ALL_APPS) {
    const name = normalize(app.name);
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.split(" ").some((w) => w.startsWith(q))) score = 60;
    else if ((app.keys || []).some((k) => k === q)) score = 70;
    else if ((app.keys || []).some((k) => k.startsWith(q) || (q.length >= 4 && q.includes(k)))) score = 50;
    else if (name.includes(q)) score = 35;
    else if (normalize(app.hint).includes(q) && q.length >= 3) score = 20;
    if (score) scored.push({ app, score: score + (app.central ? 2 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

const api = { DOCK_APPS, LAUNCHPAD_GROUPS, ALL_APPS, PASS_PROPS, normalize, getApp, appUrl, searchApps };
if (typeof module !== "undefined" && module.exports) module.exports = api;
