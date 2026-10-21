// src/javis-inbox.js — "Việc chờ anh": things on the JAVIS gateway that wait for the owner.
//
// Source: GET /fleet/desk/pending (CONTRACT.md v1.1, read-only for machine tokens jvd_/jvk_):
//   { items: [{ id, title, kind: "task"|"approval", status, due (epoch s|null), urgency, link }],
//     total, scope: "home"|"workspace", at }
// Items come sorted (urgent first, then nearest due), at most 50; `total` is the real count
// (the badge uses it). Nothing can be approved with a machine token (403): every line has
// one "Mở để duyệt" button that opens its `link` on the web.
//
// Refresh is event-driven: once at start, when the owner opens the menu/window, and when
// /fleet/stream reports task/ticket changes. No timer polling; automatic refreshes are at most
// 1 per minute. 429 → wait Retry-After (default 60 s). Network errors: at most 3 attempts with
// growing back-off, then stop until the next real event.
"use strict";

const WEB_BASE = "https://javis.bumbee.asia";
const MAX_FAILURES = 3;
const REFRESH_DEBOUNCE_MS = 20 * 1000;
const MIN_AUTO_INTERVAL_MS = 60 * 1000;
const DEFAULT_RETRY_AFTER_S = 60;
const MAX_TITLE = 140;
// Refreshes the owner did not ask for: kept to ≤ 1 per minute (contract: 30/min/machine max).
const AUTO_REASONS = new Set(["event", "menu", "start"]);
const STREAM_EVENTS = /^(task\.|ticket|coordinator\.ticket|approval|owner\.ticket|idea\.|order\.)/;

function webLinkFor(item, webBase = WEB_BASE) {
  if (typeof item.link === "string" && /^https:\/\//.test(item.link)) return item.link;
  const base = String(webBase || WEB_BASE).replace(/\/+$/, "");
  return item.kind === "approval" ? `${base}/?ticket=${encodeURIComponent(item.id)}` : `${base}/?approvals=1`;
}

/**
 * GET /fleet/desk/pending JSON → { items, count, shown, scope }.
 * Keeps the gateway's order; only the 7 contract fields are read.
 */
function summarizePending(body, { webBase = WEB_BASE } = {}) {
  const items = [];
  for (const it of Array.isArray(body && body.items) ? body.items : []) {
    if (!it || it.id === undefined || it.id === null || it.id === "") continue;
    const kind = it.kind === "approval" ? "approval" : "task";
    const due = Number(it.due);
    const item = {
      kind,
      id: String(it.id),
      title: String(it.title || (kind === "approval" ? "Phiếu cần anh duyệt" : "(không tên)")).trim().slice(0, MAX_TITLE),
      status: typeof it.status === "string" ? it.status : "",
      due: it.due !== null && it.due !== undefined && Number.isFinite(due) && due > 0 ? due : null,
      urgent: it.urgency === "high",
      link: typeof it.link === "string" ? it.link : null,
    };
    item.webUrl = webLinkFor(item, webBase);
    items.push(item);
  }
  const total = Number(body && body.total);
  const count = Number.isFinite(total) && total >= items.length ? Math.floor(total) : items.length;
  const scope = body && body.scope === "workspace" ? "workspace" : "home";
  return { items, count, shown: items.length, scope };
}

/** Ids in `next` that were not in `prevIds` (a Set or array). */
function newItemIds(prevIds, next) {
  const prev = prevIds instanceof Set ? prevIds : new Set(prevIds || []);
  return next.filter((i) => !prev.has(`${i.kind}:${i.id}`)).map((i) => `${i.kind}:${i.id}`);
}

/**
 * Whether the character may speak up about new items.
 * Silent while sleeping (DND), while the pet is hidden, and for the very first load.
 */
function shouldNotify({ newCount, firstLoad, doNotDisturb, petHidden }) {
  return newCount > 0 && !firstLoad && !doNotDisturb && !petHidden;
}

/** Minimal SSE parser: feed text chunks, get back complete { event, data } records. */
function createSseParser() {
  let buf = "";
  return function feed(chunk) {
    buf += chunk.replace(/\r\n/g, "\n");
    const out = [];
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      const data = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const c = line.indexOf(":");
        const field = c < 0 ? line : line.slice(0, c);
        const value = c < 0 ? "" : line.slice(c + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (event !== "message" || data.length) out.push({ event, data: data.join("\n") });
    }
    return out;
  };
}

function isInboxEvent(ev) {
  if (!ev) return false;
  if (STREAM_EVENTS.test(ev.event)) return true;
  if (ev.event === "message" && ev.data) {
    try {
      const d = JSON.parse(ev.data);
      return !!(d && typeof d.type === "string" && STREAM_EVENTS.test(d.type));
    } catch { return false; }
  }
  return false;
}

/**
 * Inbox state machine. `client.request(method, path, body)` → { status, data, retryAfter } (see
 * javis-companion-host createGatewayClient; 401 there already means refresh failed → relogin).
 * Timers are injectable for tests.
 */
function createInbox({ client, isPaired, onChange = () => {}, onNew = () => {}, webBase = WEB_BASE,
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
  const state = {
    loaded: false, loading: false, items: [], count: 0, shown: 0, scope: "home",
    error: null, failures: 0, stoppedUntilEvent: false, updatedAt: 0, fetchedAt: 0, blockedUntil: 0,
  };
  let seen = new Set();
  let retryTimer = null;
  let debounceTimer = null;

  function snapshot() {
    return { paired: !!isPaired(), loaded: state.loaded, loading: state.loading, items: state.items.slice(),
      count: state.count, shown: state.shown, scope: state.scope, error: state.error, updatedAt: state.updatedAt,
      retryAt: state.blockedUntil > now() ? state.blockedUntil : 0 };
  }

  function scheduleRetry(ms) {
    if (retryTimer) clearTimer(retryTimer);
    retryTimer = setTimer(() => { retryTimer = null; void refresh({ reason: "retry" }); }, ms);
  }

  async function refresh({ reason = "manual" } = {}) {
    if (!isPaired()) {
      state.items = []; state.count = 0; state.shown = 0; state.error = null;
      onChange(snapshot());
      return snapshot();
    }
    if (state.loading) return snapshot();
    // 429: nobody calls again before Retry-After (one retry is already scheduled for then).
    if (reason !== "retry" && state.blockedUntil > now()) return snapshot();
    // Automatic refreshes stay ≤ 1/minute; an owner action (open, Làm mới, report) goes through.
    const since = now() - state.fetchedAt;
    if (AUTO_REASONS.has(reason) && state.fetchedAt && since < MIN_AUTO_INTERVAL_MS) {
      if (reason === "event" && !retryTimer && !debounceTimer) {
        debounceTimer = setTimer(() => { debounceTimer = null; void refresh({ reason: "event" }); }, MIN_AUTO_INTERVAL_MS - since);
      }
      return snapshot();
    }
    // A real event re-arms a stopped refresher.
    if (reason !== "retry") { state.failures = 0; state.stoppedUntilEvent = false; }
    if (retryTimer) { clearTimer(retryTimer); retryTimer = null; }
    state.loading = true;
    state.fetchedAt = now();
    let r;
    try {
      r = await client.request("GET", "/fleet/desk/pending");
    } catch (err) {
      r = { status: 0, data: { error: err && err.message } };
    }
    state.loading = false;
    if (r.status === 200 && r.data) {
      const firstLoad = !state.loaded;
      const s = summarizePending(r.data, { webBase });
      const fresh = newItemIds(seen, s.items);
      seen = new Set(s.items.map((i) => `${i.kind}:${i.id}`));
      Object.assign(state, { loaded: true, items: s.items, count: s.count, shown: s.shown, scope: s.scope,
        error: null, failures: 0, blockedUntil: 0, updatedAt: now() });
      onChange(snapshot());
      if (fresh.length) onNew({ ids: fresh, count: fresh.length, total: s.count, firstLoad });
      return snapshot();
    }
    if (r.notPaired || r.status === 401) {
      // The gateway client already tried /refresh; the login screen is shown by the auth layer.
      state.error = "pairing_rejected";
      state.stoppedUntilEvent = true;
      onChange(snapshot());
      return snapshot();
    }
    if (r.status === 403) {
      // featureDenied: the gateway refused this feature only — still signed in, try again later.
      state.error = r.featureDenied ? "feature_denied" : "forbidden";
      state.stoppedUntilEvent = true;
      onChange(snapshot());
      return snapshot();
    }
    state.failures++;
    if (r.status === 429) {
      const wait = Math.max(1, Number(r.retryAfter) || DEFAULT_RETRY_AFTER_S) * 1000;
      state.error = "rate_limited";
      state.blockedUntil = now() + wait;
      if (state.failures < MAX_FAILURES) scheduleRetry(wait);
      else state.stoppedUntilEvent = true;
      onChange(snapshot());
      return snapshot();
    }
    state.error = r.status ? `gateway_${r.status}` : "gateway_unreachable";
    if (state.failures < MAX_FAILURES) scheduleRetry(5000 * 2 ** state.failures);
    else state.stoppedUntilEvent = true; // owner rule: 3 tries, then stop and report
    onChange(snapshot());
    return snapshot();
  }

  /** A stream event arrived — refresh soon (coalesce bursts). */
  function poke() {
    if (debounceTimer) return;
    debounceTimer = setTimer(() => { debounceTimer = null; void refresh({ reason: "event" }); }, REFRESH_DEBOUNCE_MS);
  }

  /** Only links the gateway gave for current lines may be opened from the window. */
  function hasLink(url) {
    return state.items.some((i) => i.webUrl === url);
  }

  function reset() {
    if (retryTimer) clearTimer(retryTimer);
    if (debounceTimer) clearTimer(debounceTimer);
    retryTimer = debounceTimer = null;
    seen = new Set();
    Object.assign(state, { loaded: false, loading: false, items: [], count: 0, shown: 0, scope: "home", error: null,
      failures: 0, stoppedUntilEvent: false, fetchedAt: 0, blockedUntil: 0 });
    onChange(snapshot());
  }

  return { refresh, poke, hasLink, reset, snapshot, state };
}

/**
 * Listen to /fleet/stream for task/ticket events. `openStream()` resolves to a Response-like
 * object with a web ReadableStream `body`. Stops after 3 failed connects in a row (owner rule).
 */
function createStreamWatcher({ openStream, onEvent, setTimer = setTimeout, clearTimer = clearTimeout, log = () => {} }) {
  let running = false;
  let failures = 0;
  let timer = null;
  let reader = null;

  async function connect() {
    if (!running) return;
    let res;
    try {
      res = await openStream();
    } catch (err) {
      return fail(err && err.message);
    }
    if (!running) return;
    if (!res || res.status === 401 || res.status === 403) { running = false; log("inbox stream: auth rejected, stop"); return; }
    if (!res.ok || !res.body) return fail(`status ${res.status}`);
    failures = 0;
    const feed = createSseParser();
    const decoder = new TextDecoder();
    try {
      reader = res.body.getReader();
      while (running) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const ev of feed(decoder.decode(value, { stream: true }))) {
          if (isInboxEvent(ev)) onEvent(ev);
        }
      }
    } catch (err) {
      if (!running) return;
      return fail(err && err.message);
    } finally {
      reader = null;
    }
    if (running) fail("stream ended");
  }

  function fail(why) {
    failures++;
    log(`inbox stream: ${why} (${failures}/${MAX_FAILURES})`);
    if (failures >= MAX_FAILURES) { running = false; return; }
    timer = setTimer(() => { timer = null; void connect(); }, 5000 * 2 ** failures);
  }

  return {
    start() { if (running) return; running = true; failures = 0; void connect(); },
    stop() {
      running = false;
      if (timer) { clearTimer(timer); timer = null; }
      if (reader) { try { reader.cancel(); } catch {} }
    },
    isRunning: () => running,
  };
}

module.exports = {
  WEB_BASE, MAX_FAILURES, REFRESH_DEBOUNCE_MS, MIN_AUTO_INTERVAL_MS,
  summarizePending, newItemIds, shouldNotify, webLinkFor, createSseParser, isInboxEvent, createInbox, createStreamWatcher,
};
