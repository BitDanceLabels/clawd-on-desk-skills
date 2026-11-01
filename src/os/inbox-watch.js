// src/os/inbox-watch.js — unread count + "new customer message" detection for the
// Hộp thư chung app (Dock badge, macOS-style banners). Pure logic, no timers:
// the OS page calls `apply(view)` after a gateway "inbox.updated" event (event-driven,
// owner rule: no polling). CommonJS + browser.
"use strict";

const CONV_ID = /^hv_[0-9a-f]{10}$/;

/**
 * createInboxWatch() → { apply(view) → { unread, fresh[] }, unread() }
 * `view` is GET /fleet/inbox?folder=chua_doc. The first apply only learns the current
 * state (no banners for old messages); later applies report conversations that became
 * unread or got a newer incoming message.
 */
function createInboxWatch({ maxFresh = 3 } = {}) {
  let primed = false;
  let seen = new Map(); // conv id → last_in_at (or last_at) we already announced
  let count = 0;

  function stamp(row) {
    return Number(row.last_in_at || row.last_at || 0);
  }

  function apply(view) {
    const rows = (view && Array.isArray(view.rows) ? view.rows : []).filter((r) => r && CONV_ID.test(String(r.id)));
    const counts = (view && view.counts) || {};
    const unreadRows = rows.filter((r) => !r.test && (r.unread === true || Number(r.unread) > 0));
    count = Number.isFinite(Number(counts.chua_doc)) ? Number(counts.chua_doc) : unreadRows.length;
    const fresh = [];
    const next = new Map();
    for (const r of unreadRows) {
      const t = stamp(r);
      next.set(r.id, t);
      if (!primed) continue;
      const before = seen.get(r.id);
      // Only a message FROM the customer is news; our own reply bumping last_at is not.
      if ((before === undefined || t > before) && (r.last_dir || "in") === "in") fresh.push(toNotice(r));
    }
    seen = next;
    primed = true;
    fresh.sort((a, b) => b.at - a.at);
    return { unread: count, fresh: fresh.slice(0, maxFresh), more: Math.max(0, fresh.length - maxFresh) };
  }

  return { apply, unread: () => count, primed: () => primed };
}

function toNotice(r) {
  const name = String(r.name || "Khách").slice(0, 60);
  const via = String(r.account_name || r.channel || "").slice(0, 40);
  const text = String(r.preview || r.subject || "Tin nhắn mới").replace(/\s+/g, " ").trim();
  return {
    conv: r.id,
    title: name,
    subtitle: via,
    body: text.length > 90 ? text.slice(0, 89) + "…" : text,
    initials: String(r.initials || name.slice(0, 1)).slice(0, 2).toUpperCase(),
    badge: String(r.badge || "").slice(0, 3),
    at: Number(r.last_in_at || r.last_at || 0),
  };
}

const api = { createInboxWatch, toNotice, CONV_ID };
if (typeof module !== "undefined" && module.exports) module.exports = api;
