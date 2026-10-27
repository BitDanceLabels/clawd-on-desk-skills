// src/sessions.js — Claude Code / Codex / Gemini / Cursor session tracker.
//
// Hooks POST {state, event, session_id, ...} to the local hook server; this
// module keeps one record per session and reduces them to what the desk
// assistant shows: is an AI working, is one waiting for the owner, did one fail.
// Pure (no Electron, no timers) so it is unit tested directly.
"use strict";

const STATES = new Set([
  "idle", "yawning", "dozing", "collapsing", "thinking", "working", "juggling",
  "sweeping", "error", "attention", "notification", "carrying", "sleeping", "waking",
]);

const WORKING = new Set(["thinking", "working", "juggling", "sweeping", "carrying"]);

// A session that has not reported for this long is treated as gone (Codex has no
// SessionEnd; a killed terminal never sends one either).
const STALE_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 64;

function phaseOf(state) {
  if (WORKING.has(state)) return "working";
  if (state === "notification") return "waiting";
  if (state === "error") return "error";
  if (state === "attention") return "done";
  return "idle";
}

function shortCwd(cwd) {
  if (typeof cwd !== "string" || !cwd) return "";
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

function createSessionTracker({ now = () => Date.now() } = {}) {
  const sessions = new Map();

  function prune() {
    const t = now();
    for (const [id, s] of sessions) {
      if (t - s.updatedAt > STALE_MS) sessions.delete(id);
    }
  }

  /**
   * Returns { ok, transition } where transition is the phase the session just
   * entered when it is worth telling the owner about ("waiting" | "done" |
   * "error"), else null.
   */
  function update({ id, state, event = "", agent = "claude-code", cwd = "", host = null, headless = false } = {}) {
    if (!STATES.has(state)) return { ok: false, transition: null };
    const sid = typeof id === "string" && id ? id : "default";
    prune();
    if (event === "SessionEnd" || state === "sleeping") {
      sessions.delete(sid);
      return { ok: true, transition: null };
    }
    const prev = sessions.get(sid);
    const phase = phaseOf(state);
    const record = {
      id: sid,
      agent: typeof agent === "string" && agent ? agent : "claude-code",
      state,
      phase,
      event: typeof event === "string" ? event : "",
      cwd: typeof cwd === "string" && cwd ? cwd : (prev ? prev.cwd : ""),
      host: host || (prev ? prev.host : null),
      headless: !!headless,
      startedAt: prev ? prev.startedAt : now(),
      updatedAt: now(),
    };
    if (!prev && sessions.size >= MAX_SESSIONS) {
      const oldest = [...sessions.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
      if (oldest) sessions.delete(oldest.id);
    }
    sessions.set(sid, record);
    const changed = !prev || prev.phase !== phase;
    // Headless runs (claude -p workers) never wait for a human: don't ping the owner.
    const notable = phase === "waiting" || phase === "error" || (phase === "done" && prev && prev.phase === "working");
    return { ok: true, transition: changed && notable && !record.headless ? phase : null, session: record };
  }

  function remove(id) {
    sessions.delete(id);
  }

  function list() {
    prune();
    return [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // Overall mode for the hologram: waiting beats error beats working beats idle.
  function summary() {
    const all = list();
    const count = (p) => all.filter((s) => s.phase === p).length;
    const waiting = count("waiting");
    const errors = count("error");
    const working = count("working");
    const mode = waiting ? "waiting" : errors ? "error" : working ? "working" : "idle";
    return {
      mode,
      working,
      waiting,
      errors,
      total: all.length,
      sessions: all.slice(0, 12).map((s) => ({
        id: s.id, agent: s.agent, phase: s.phase, state: s.state, where: shortCwd(s.cwd), host: s.host, updatedAt: s.updatedAt,
      })),
    };
  }

  return { update, remove, list, summary, has: (id) => sessions.has(id), get: (id) => sessions.get(id) };
}

module.exports = { createSessionTracker, phaseOf, shortCwd, STATES, STALE_MS };
