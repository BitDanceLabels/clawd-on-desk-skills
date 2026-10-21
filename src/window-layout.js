// src/window-layout.js — keep the vocab panel out of the chat window's way.
// Pure geometry so it can be unit-tested without Electron.
"use strict";

const GAP = 12;

function overlaps(a, b, gap = 0) {
  if (!a || !b) return false;
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap
    && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

function inside(r, area) {
  return r.x >= area.x && r.y >= area.y && r.x + r.width <= area.x + area.width && r.y + r.height <= area.y + area.height;
}

/**
 * Where should `panel` go so it does not cover any of `obstacles` (chat windows, the pet)?
 * Tries: stay put → beside the first obstacle (left/right) → above/below it → work-area corners.
 * Returns { x, y } (same size) or null when nothing fits (caller hides the panel until chat closes).
 */
function placeAvoiding(panel, obstacles, area, gap = GAP) {
  const obs = (obstacles || []).filter(Boolean);
  const free = (r) => inside(r, area) && !obs.some((o) => overlaps(r, o, gap / 2));
  if (free(panel)) return { x: panel.x, y: panel.y };
  const { width: w, height: h } = panel;
  const cands = [];
  for (const o of obs) {
    cands.push(
      { x: o.x - w - gap, y: panel.y },
      { x: o.x + o.width + gap, y: panel.y },
      { x: o.x - w - gap, y: o.y + o.height - h },
      { x: o.x + o.width + gap, y: o.y + o.height - h },
      { x: panel.x, y: o.y - h - gap },
      { x: panel.x, y: o.y + o.height + gap },
    );
  }
  const m = 16;
  cands.push(
    { x: area.x + m, y: area.y + area.height - h - m },
    { x: area.x + m, y: area.y + m },
    { x: area.x + area.width - w - m, y: area.y + m },
    { x: area.x + area.width - w - m, y: area.y + area.height - h - m },
  );
  // Prefer the spot closest to where the panel was.
  const scored = cands
    .map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), width: w, height: h }))
    .filter(free)
    .map((c) => ({ c, d: Math.hypot(c.x - panel.x, c.y - panel.y) }))
    .sort((a, b) => a.d - b.d);
  return scored.length ? { x: scored[0].c.x, y: scored[0].c.y } : null;
}

module.exports = { GAP, overlaps, inside, placeAvoiding };
