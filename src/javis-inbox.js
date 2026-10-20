// src/javis-inbox.js — "Việc chờ anh": things on the JAVIS gateway that wait for the owner.
//
// Source: GET /fleet/home/tasks (same list as the Home "Việc của anh" on the web):
//   data[]      tasks (5 fields + state); state "waiting" = waits for the owner,
//               can_approve = one-tap approve via POST /fleet/ideas/<id>/task/approve
//   approvals[] pending owner tickets. Deciding them needs the owner's Google session
//               (a device key never counts as the owner), so the app only opens them on the web.
//
// Refresh is event-driven: once at start, when the owner opens the menu/window, and when
// /fleet/stream reports task/ticket changes. No timer polling. Network errors: at most
// 3 attempts with growing back-off, then stop until the next real event.
"use strict";

const WEB_BASE = "https://javis.bumbee.asia";
const MAX_FAILURES = 3;
const REFRESH_DEBOUNCE_MS = 20 * 1000;
const STREAM_EVENTS = /^(task\.|ticket|coordinator\.ticket|approval|owner\.ticket|idea\.)/;

function webLinkFor(item, webBase = WEB_BASE) {
  const base = String(webBase || WEB_BASE).replace(/\/+$/, "");
  if (item.kind === "ticket") {
    if (typeof item.link === "string" && /^https:\/\//.test(item.link)) return item.link;
    return `${base}/?ticket=${encodeURIComponent(item.id)}`;
  }
  return `${base}/?approvals=1`;
}

/**
 * GET /fleet/home/tasks JSON → { items, count, approvable }.
 * One line per item; tasks that wait for the owner first (approvable before the rest), then tickets.
 */
function summarizeHome(home, { webBase = WEB_BASE } = {}) {
  const items = [];
  const tasks = Array.isArray(home && home.data) ? home.data : [];
  for (const t of tasks) {
    if (!t || !t.id || t.state === "done") continue;
    const waiting = t.state === "waiting" || t.can_approve === true;
    if (!waiting) continue;
    items.push({
      kind: "task",
      id: String(t.id),
      title: String(t.title || "(không tên)").trim(),
      canApprove: t.can_approve === true,
      importance: t.importance || "",
      due: t.due || null,
      urgent: t.importance === "P0" || t.importance === "P1",
    });
  }
  const tickets = Array.isArray(home && home.approvals) ? home.approvals : [];
  for (const k of tickets) {
    if (!k || !k.id) continue;
    if (k.state && !["open", "editing", "pending"].includes(k.state)) continue;
    items.push({
      kind: "ticket",
      id: String(k.id),
      title: String(k.title || "Phiếu cần anh duyệt").trim(),
      canApprove: false, // owner tickets: only the owner's Google session may decide (web)
      link: k.link || null,
      urgent: !!k.urgent,
      questions: Array.isArray(k.items) ? k.items.length : 0,
    });
  }
  items.sort((a, b) => (Number(b.urgent) - Number(a.urgent)) || (Number(b.canApprove) - Number(a.canApprove)));
  for (const it of items) it.webUrl = webLinkFor(it, webBase);
  return { items, count: items.length, approvable: items.filter((i) => i.canApprove).length };
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
 * Inbox state machine. `client.request(method, path, body)` → { status, data } (see
 * javis-companion-host createGatewayClient). Timers are injectable for tests.
 */
function createInbox({ client, isPaired, onChange = () => {}, onNew = () => {}, webBase = WEB_BASE,
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
  const state = {
    loaded: false, loading: false, items: [], count: 0, approvable: 0,
    error: null, failures: 0, stoppedUntilEvent: false, updatedAt: 0,
  };
  let seen = new Set();
  let retryTimer = null;
  let debounceTimer = null;

  function snapshot() {
    return { paired: !!isPaired(), loaded: state.loaded, loading: state.loading, items: state.items.slice(),
      count: state.count, approvable: state.approvable, error: state.error, updatedAt: state.updatedAt };
  }

  async function refresh({ reason = "manual" } = {}) {
    if (!isPaired()) {
      state.items = []; state.count = 0; state.approvable = 0; state.error = null;
      onChange(snapshot());
      return snapshot();
    }
    if (state.loading) return snapshot();
    // A user action is a real event: it re-arms a stopped refresher.
    if (reason !== "retry") { state.failures = 0; state.stoppedUntilEvent = false; }
    if (retryTimer) { clearTimer(retryTimer); retryTimer = null; }
    state.loading = true;
    let r;
    try {
      r = await client.request("GET", "/fleet/home/tasks");
    } catch (err) {
      r = { status: 0, data: { error: err && err.message } };
    }
    state.loading = false;
    if (r.status === 200 && r.data) {
      const firstLoad = !state.loaded;
      const s = summarizeHome(r.data, { webBase });
      const fresh = newItemIds(seen, s.items);
      seen = new Set(s.items.map((i) => `${i.kind}:${i.id}`));
      Object.assign(state, { loaded: true, items: s.items, count: s.count, approvable: s.approvable, error: null, failures: 0, updatedAt: now() });
      onChange(snapshot());
      if (fresh.length) onNew({ ids: fresh, count: fresh.length, total: s.count, firstLoad });
      return snapshot();
    }
    if (r.status === 401 || r.status === 403) {
      state.error = "pairing_rejected";
      state.stoppedUntilEvent = true;
      onChange(snapshot());
      return snapshot();
    }
    state.failures++;
    state.error = r.status ? `gateway_${r.status}` : "gateway_unreachable";
    if (state.failures < MAX_FAILURES) {
      retryTimer = setTimer(() => { retryTimer = null; void refresh({ reason: "retry" }); }, 5000 * 2 ** state.failures);
    } else {
      state.stoppedUntilEvent = true; // owner rule: 3 tries, then stop and report
    }
    onChange(snapshot());
    return snapshot();
  }

  /** A stream event arrived — refresh soon (coalesce bursts). */
  function poke() {
    if (debounceTimer) return;
    debounceTimer = setTimer(() => { debounceTimer = null; void refresh({ reason: "event" }); }, REFRESH_DEBOUNCE_MS);
  }

  async function approve(id) {
    const item = state.items.find((i) => i.kind === "task" && i.id === id);
    if (!item) return { ok: false, error: "not_found" };
    if (!item.canApprove) return { ok: false, error: "web_only", webUrl: item.webUrl };
    let r;
    try {
      r = await client.request("POST", `/fleet/ideas/${encodeURIComponent(id)}/task/approve`, { actor: "owner", via: "desktop" });
    } catch (err) {
      return { ok: false, error: "gateway_unreachable" };
    }
    if (r.status === 200) {
      state.items = state.items.filter((i) => !(i.kind === "task" && i.id === id));
      state.count = state.items.length;
      state.approvable = state.items.filter((i) => i.canApprove).length;
      seen.delete(`task:${id}`);
      onChange(snapshot());
      return { ok: true };
    }
    if (r.status === 403) return { ok: false, error: "web_only", webUrl: item.webUrl };
    return { ok: false, error: (r.data && (r.data.detail || r.data.error)) || `gateway_${r.status}` };
  }

  function reset() {
    if (retryTimer) clearTimer(retryTimer);
    if (debounceTimer) clearTimer(debounceTimer);
    retryTimer = debounceTimer = null;
    seen = new Set();
    Object.assign(state, { loaded: false, loading: false, items: [], count: 0, approvable: 0, error: null, failures: 0, stoppedUntilEvent: false });
    onChange(snapshot());
  }

  return { refresh, poke, approve, reset, snapshot, state };
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
  WEB_BASE, MAX_FAILURES, REFRESH_DEBOUNCE_MS,
  summarizeHome, newItemIds, shouldNotify, webLinkFor, createSseParser, isInboxEvent, createInbox, createStreamWatcher,
};
