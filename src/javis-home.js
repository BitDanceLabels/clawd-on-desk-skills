// src/javis-home.js — "Trang chủ JAVIS" (the main window) helpers, no Electron here.
//   • the JAVIS OS pages that only open on the web (owner areas: a machine token has no owner rights)
//   • "Phiên đang chạy trên máy này" from the hook-tracked sessions
//   • chat health: a 401/403 on /fleet/chat* means the server still refuses chat for this machine
"use strict";

const path = require("path");

const WEB_BASE = "https://javis.bumbee.asia";

// Deep links of JAVIS OS web (apps/web App.tsx: `/?app=<module id>` opens the module once).
const WEB_PAGES = [
  { id: "desk", app: "desk", icon: "⧉", title: "Bàn làm việc", hint: "Nhiều tab, chia khung, kéo phiên Claude/Codex vào làm trực tiếp." },
  { id: "assets", app: "asset-hub", icon: "▣", title: "Kho tài sản", hint: "Mọi kết quả FINAL của các team: dự án, ảnh, nhạc, prompt." },
  { id: "sessions", app: "work-groups", icon: "▤", title: "Phiên làm việc", hint: "Phiên Codex, Claude, AI của mọi máy, gom theo dự án." },
  { id: "graph", app: "fleet-map", icon: "◉", title: "Graph", hint: "Bản đồ vận hành, lớp Đồ thị: việc nào đang chạy, chờ, kẹt." },
];

function webPageUrl(id, base = WEB_BASE) {
  const root = String(base || WEB_BASE).replace(/\/+$/, "");
  if (!id || id === "home") return `${root}/`;
  const page = WEB_PAGES.find((p) => p.id === id);
  return page ? `${root}/?app=${encodeURIComponent(page.app)}` : null;
}

const AGENT_NAMES = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "copilot-cli": "Copilot",
  "gemini-cli": "Gemini",
  "cursor-agent": "Cursor",
};
const STATE_TEXT = {
  working: "đang làm", thinking: "đang nghĩ", juggling: "đang làm nhiều việc",
  idle: "đang chờ", sleeping: "đang nghỉ", attention: "xong việc", notification: "cần anh xem",
};
const STATE_RANK = { notification: 6, attention: 5, juggling: 4, working: 3, thinking: 2, idle: 1, sleeping: 0 };

// Hook-tracked sessions (state.js Map) → short rows for the Home tab. No ids or pids leave main.
function listMachineSessions(sessions, now = Date.now()) {
  const rows = [];
  for (const [id, s] of sessions || []) {
    if (!s) continue;
    const folder = s.cwd ? path.basename(String(s.cwd).replace(/[\\/]+$/, "")) : "";
    rows.push({
      key: String(id).slice(-6),
      agent: AGENT_NAMES[s.agentId] || (s.agentId ? String(s.agentId) : "Phiên AI"),
      folder: folder || "(không rõ thư mục)",
      state: s.state || "idle",
      stateText: STATE_TEXT[s.state] || "đang chạy",
      host: s.host || "",
      headless: !!s.headless,
      canFocus: !!s.sourcePid,
      ago: Math.max(0, Math.round((now - (s.updatedAt || now)) / 1000)),
      _id: id,
    });
  }
  rows.sort((a, b) => (STATE_RANK[b.state] || 0) - (STATE_RANK[a.state] || 0) || a.ago - b.ago);
  return rows;
}

// Requests the <javis-companion> chat makes (javis-companion.js: /fleet/chat, /fleet/chat/*, /fleet/voice/chat).
function isChatPath(pathname) {
  return pathname === "/fleet/chat" || pathname.startsWith("/fleet/chat/") || pathname === "/fleet/voice/chat";
}

// null = says nothing (keep the last state); otherwise { ok, status }.
function chatHealthFrom(status) {
  if (status === 401 || status === 403) return { ok: false, status };
  if (status >= 200 && status < 300) return { ok: true, status };
  return null;
}

module.exports = { WEB_BASE, WEB_PAGES, webPageUrl, listMachineSessions, isChatPath, chatHealthFrom, AGENT_NAMES };
