// src/desk/intent.js — what did the owner just ask for, and which card shows it.
//
// Runs locally, before any network call: data questions ("việc hôm nay", "máy sao
// rồi", "kho video") open a card straight from the gateway API without spending an
// AI call; only free-form requests go to the JAVIS brain (/fleet/voice/chat).
// Works with or without diacritics and with common typos. CommonJS + browser.
"use strict";

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9.:/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Leading wake words and politeness that carry no meaning for routing.
const PREFIX = /^(?:(?:javis|jarvis|javsi|javos|jav|be den|gia vit|em oi|em|oi|anh hoi|cho anh|giup anh|lam on|xem|xem giup|mo giup|hien|hien thi|cho xem|show)\s*,?\s*)+/;

const SITES = [
  { keys: ["javis", "trang chu", "javis web", "ban dieu hanh"], url: "https://javis.bumbee.asia", label: "JAVIS" },
  { keys: ["kho", "kho tai san", "tai san"], url: "https://javis.bumbee.asia/?module=assets", label: "Kho tài sản" },
  { keys: ["bumbee"], url: "https://bumbee.asia", label: "bumbee.asia" },
  { keys: ["youtube", "yt"], url: "https://studio.youtube.com", label: "YouTube Studio" },
  { keys: ["facebook", "fb"], url: "https://www.facebook.com", label: "Facebook" },
  { keys: ["tiktok"], url: "https://www.tiktok.com", label: "TikTok" },
  { keys: ["notion"], url: "https://www.notion.so", label: "Notion" },
  { keys: ["github", "git hub"], url: "https://github.com/BitDanceLabels", label: "GitHub" },
  { keys: ["suno"], url: "https://suno.com", label: "Suno" },
  { keys: ["gmail", "mail"], url: "https://mail.google.com", label: "Gmail" },
  { keys: ["telegram", "tele"], url: "https://web.telegram.org", label: "Telegram" },
];

const has = (n, words) => words.some((w) => (w instanceof RegExp ? w.test(n) : n.includes(w)));

function assetKind(n) {
  if (has(n, ["video", "clip", "phim", "mv", "reel", "short"])) return "video";
  // "anh" alone is usually the owner ("anh" = I/you), not a picture.
  if (has(n, ["hinh", "image", "thumbnail", "poster", "buc anh", "tam anh", /^anh (moi|gan day|hom nay)/, /\banh (moi|gan day|vua)/])) return "image";
  if (has(n, ["nhac", "bai hat", "audio", "music", "song"])) return "audio";
  return "";
}

function parseOpen(n) {
  const m = n.match(/^(?:mo|open|vao|truy cap)\s+(?:(?:trang web|trang|website|web|app|ung dung)\s+)?(.+)$/);
  if (!m) return null;
  const target = m[1].trim();
  if (!target) return null;
  if (/^https?:\/\//.test(target)) return { url: target, label: target };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(target)) return { url: `https://${target}`, label: target };
  const site = SITES.find((s) => s.keys.some((k) => target === k || target.startsWith(k + " ")));
  return site ? { url: site.url, label: site.label } : null;
}

/**
 * Returns { type, params, text } where type is one of:
 *   tasks | machines | assets | alerts | channels | money | results | system |
 *   sessions | link | pair | help | chat
 */
function classifyIntent(raw) {
  const text = String(raw || "").trim();
  const full = normalize(text);
  const n = full.replace(PREFIX, "").trim() || full;
  if (!n) return { type: "help", params: {}, text };

  const open = parseOpen(n);
  if (open) return { type: "link", params: open, text };

  if (has(n, ["ghep doi", "ket noi javis", "dang nhap javis", "pair"])) return { type: "pair", params: {}, text };
  if (has(n, [/^(help|tro giup|lam duoc gi|biet lam gi)/, "em lam duoc gi", "em biet lam gi"])) return { type: "help", params: {}, text };

  if (has(n, [/kiem tra.{0,12}(he thong|may)/, "system check", "tinh trang he thong", "he thong sao", "he thong on"])) {
    return { type: "system", params: {}, text };
  }
  if (has(n, ["canh bao", "alert", "loi gi", "dang loi", "su co", "bao dong"])) return { type: "alerts", params: {}, text };
  if (has(n, ["dong tien", "doanh thu", "loi nhuan", "lai rong", "chi phi", "chi tieu", "tien vao", "tien ra", "hoa von", /\btien\b(?! do)/, "credit", "ngan sach"])) {
    return { type: "money", params: {}, text };
  }
  if (has(n, ["so lieu kenh", "kenh", "view", "luot xem", "sub", "nguoi dang ky", "follow", "gio xem", "stream", "khan gia", "tang truong"])) {
    return { type: "channels", params: {}, text };
  }
  if (has(n, ["phien claude", "phien codex", "claude dang", "codex dang", "ai dang chay", "phien ai", "session"])) {
    return { type: "sessions", params: {}, text };
  }
  // "mấy" (how many) also normalizes to "may": only match machine phrases.
  if (has(n, ["may tinh", "cac may", "may nao", "may chu", "may chay", "may dang", "may sao", "server", /\bram\b/, /\bcpu\b/, /\bgpu\b/, "tai may", "nhiet do", "vram", "mac mini", "pc gaming", "macbook", "ai server"])) {
    return { type: "machines", params: {}, text };
  }
  if (has(n, ["ket qua", "vua lam", "vua xong", "da xong", "lam xong", "nghiem thu", "bao cao"])) {
    return { type: "results", params: {}, text };
  }
  const kind = assetKind(n);
  if (has(n, ["kho", "tai san", "asset", "thu vien"]) || (kind && has(n, ["moi", "gan day", "hom nay", "xem", "mo", "phat", "nghe", "list", "danh sach", "cua anh"]))) {
    return { type: "assets", params: kind ? { kind } : {}, text };
  }
  if (has(n, ["viec", "task", "can anh", "cho anh", "hom nay lam gi", "lam gi hom nay", "todo", "nhiem vu", "duyet"])) {
    return { type: "tasks", params: {}, text };
  }
  return { type: "chat", params: {}, text };
}

const api = { classifyIntent, normalize, parseOpen, SITES };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.JavisIntent = api;
