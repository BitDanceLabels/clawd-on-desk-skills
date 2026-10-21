// src/javis-report.js — turn GET /fleet/report/morning (+ the inbox) into a short spoken report.
//
// Pure functions, no network: the main process fetches, this module only writes the text.
// Target: at most 90 seconds read aloud (Vietnamese TTS ≈ 2.6 syllables/second).
"use strict";

const MAX_SECONDS = 90;
const SYLLABLES_PER_SECOND = 2.6;
const DAY_MS = 24 * 3600 * 1000;
const WEEKDAYS = ["Chủ nhật", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy"];

function estimateSeconds(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / SYLLABLES_PER_SECOND) * 10) / 10;
}

// Keep titles short and speakable: no ids, links, emoji or markdown.
function speakable(title, maxWords = 12) {
  let s = String(title || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(idea|goal|tk|ci|rq)_[0-9a-z]+\b/gi, "")
    .replace(/[*_`#>[\]{}|]/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:,–-]+$/, "");
  const words = s.split(" ").filter(Boolean);
  if (words.length > maxWords) s = words.slice(0, maxWords).join(" ") + "…";
  return s;
}

function dateLine(nowMs) {
  const d = new Date(nowMs);
  return `${WEEKDAYS[d.getDay()]}, ngày ${d.getDate()} tháng ${d.getMonth() + 1}`;
}

function titlesOf(list, n, key = "title") {
  return (Array.isArray(list) ? list : [])
    .map((x) => speakable(x && (x[key] || x.text || x.title)))
    .filter(Boolean)
    .slice(0, n);
}

function section(label, list, n, key) {
  const all = Array.isArray(list) ? list : [];
  if (!all.length) return null;
  const names = titlesOf(all, n, key);
  const more = all.length - names.length;
  let s = `${label} ${all.length} việc`;
  if (names.length) s += `: ${names.join("; ")}`;
  if (more > 0 && names.length) s += `; và ${more} việc khác`;
  return s + ".";
}

/**
 * @param {object} p
 * @param {object} p.morning  GET /fleet/report/morning body
 * @param {object} [p.inbox]  javis-inbox snapshot ({ items, count })
 * @param {number} [p.now]
 * @returns {{ text: string, seconds: number, empty: boolean }}
 */
function buildReportSpeech({ morning, inbox, now = Date.now(), name = "anh" } = {}) {
  const m = morning || {};
  // "completed" is every finished goal: keep the ones finished in the last 24 hours.
  const completed = (Array.isArray(m.completed) ? m.completed : []).filter((g) => {
    const t = Number(g && (g.completed_at || g.updated_at)) || 0;
    return !t || now - t * 1000 < DAY_MS;
  });
  const waiting = [
    ...((inbox && Array.isArray(inbox.items)) ? inbox.items : []),
    ...(Array.isArray(m.waiting_owner) ? m.waiting_owner : []),
  ];
  // Same thing can come from both lists — keep the first title.
  const seen = new Set();
  const waitingUnique = waiting.filter((x) => {
    const k = speakable(x && x.title).toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const intro = `Chào ${name}. Báo cáo hôm nay, ${dateLine(now)}.`;
  const outroWaiting = "Anh mở mục Việc chờ anh để duyệt nhé.";
  const outro = "Hết báo cáo.";

  // Most detail first; shrink the lists until it fits in 90 seconds.
  for (const n of [3, 2, 1, 0]) {
    const parts = [
      section("Chờ anh duyệt", waitingUnique, n),
      section("Đang kẹt", m.stalled, n),
      section("Đã xong", completed, n),
      section("Đang chạy", m.running, Math.min(n, 2)),
      section("Nhắc việc hôm nay", m.reminders_today, n, "text"),
    ].filter(Boolean);
    const empty = !parts.length;
    const body = empty ? "Hôm nay chưa có việc nào cần báo. Mọi thứ đang ổn." : parts.join(" ");
    const text = [intro, body, waitingUnique.length ? outroWaiting : "", outro].filter(Boolean).join(" ");
    const seconds = estimateSeconds(text);
    if (seconds <= MAX_SECONDS || n === 0) {
      if (seconds <= MAX_SECONDS) return { text, seconds, empty };
      // Even counts-only is too long (should not happen): hard cut on words.
      const max = Math.floor(MAX_SECONDS * SYLLABLES_PER_SECOND) - 3;
      const cut = text.split(/\s+/).slice(0, max).join(" ") + "… " + outro;
      return { text: cut, seconds: estimateSeconds(cut), empty };
    }
  }
  return { text: intro, seconds: estimateSeconds(intro), empty: true };
}

module.exports = { MAX_SECONDS, estimateSeconds, speakable, buildReportSpeech, dateLine };
