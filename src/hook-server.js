// src/hook-server.js — local HTTP endpoint the Claude Code / Gemini / Cursor hooks
// talk to (127.0.0.1:23333-23337, port written to ~/.clawd/runtime.json).
//
//   GET  /state        health probe used by the hooks' port discovery
//   POST /state        session state update  → onState()
//   POST /permission   blocking PermissionRequest hook → a card in the desk window
//   POST /notification external notice       → onNotification()
//   GET  /sessions     tracked sessions
//   GET  /health       app/version/port
//
// Everything the old pet app served besides these (wiki, skills, Bumbee OS, chat)
// lives in archive/.
"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  CLAWD_SERVER_HEADER,
  CLAWD_SERVER_ID,
  DEFAULT_SERVER_PORT,
  clearRuntimeConfig,
  getPortCandidates,
  readRuntimePort,
  writeRuntimeConfig,
} = require("../hooks/server-config");

const APP_VERSION = (() => {
  try { return require("../package.json").version || "0.0.0"; } catch { return "0.0.0"; }
})();

// Claude's own task bookkeeping tools never need a human.
const PASSTHROUGH_TOOLS = new Set(["TaskCreate", "TaskUpdate", "TaskGet", "TaskList", "TaskStop", "TaskOutput"]);
const PREVIEW_MAX = 500;

function readBody(req, limit, cb) {
  let body = "";
  let size = 0;
  let tooLarge = false;
  req.on("data", (chunk) => {
    if (tooLarge) return;
    size += chunk.length;
    if (size > limit) { tooLarge = true; return; }
    body += chunk;
  });
  req.on("end", () => {
    if (tooLarge) return cb(new Error("too_large"));
    if (!body) return cb(null, {});
    try { cb(null, JSON.parse(body)); } catch { cb(new Error("bad_json")); }
  });
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
  res.end(JSON.stringify(payload));
}

function truncateDeep(obj, depth = 0) {
  if (depth > 10) return obj;
  if (Array.isArray(obj)) return obj.map((v) => truncateDeep(v, depth + 1));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = truncateDeep(v, depth + 1);
    return out;
  }
  return typeof obj === "string" && obj.length > PREVIEW_MAX ? obj.slice(0, PREVIEW_MAX) + "…" : obj;
}

// One-line human summary of what the tool wants to do.
function describeToolInput(toolName, input) {
  if (!input || typeof input !== "object") return "";
  const pick = input.command || input.file_path || input.path || input.url || input.pattern || input.query || input.description;
  if (typeof pick === "string") return pick.slice(0, 300);
  try { return JSON.stringify(input).slice(0, 300); } catch { return ""; }
}

// Claude's permission_suggestions → the updatedPermissions entry it expects back.
function normalizeSuggestion(s) {
  if (!s || typeof s !== "object") return null;
  if (s.type === "addRules") {
    const rules = Array.isArray(s.rules) ? s.rules : [{ toolName: s.toolName, ruleContent: s.ruleContent }];
    return { type: "addRules", destination: s.destination || "localSettings", behavior: s.behavior || "allow", rules };
  }
  if (s.type === "setMode" && typeof s.mode === "string") {
    return { type: "setMode", mode: s.mode, destination: s.destination || "localSettings" };
  }
  return null;
}

function sendPermissionResponse(res, decision, hookEventName = "PermissionRequest") {
  if (!res || res.writableEnded || res.destroyed) return;
  try {
    res.writeHead(200, { "Content-Type": "application/json", [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
    res.end(JSON.stringify({ hookSpecificOutput: { hookEventName, decision } }));
  } catch {}
}

/**
 * deps:
 *   onState({ id, state, event, agent, cwd, host, headless }) → void
 *   onPermission(card) / onPermissionGone(id)                 → show / hide the card
 *   onNotification({ title, message, level })                → void
 *   listSessions()                                            → array
 *   isDoNotDisturb()                                          → bool
 *   isHeadless(sessionId)                                     → bool
 *   autoStartWithClaude                                       → bool (hook option)
 */
function createHookServer(deps) {
  const {
    onState = () => {},
    onPermission = () => {},
    onPermissionGone = () => {},
    onNotification = () => {},
    listSessions = () => [],
    isDoNotDisturb = () => false,
    isHeadless = () => false,
    log = () => {},
  } = deps;

  let server = null;
  let activePort = null;
  let settingsWatcher = null;
  let seq = 0;
  let ownsRuntime = false;
  const pending = new Map(); // id → { res, sessionId, elicitation }

  function getPort() {
    return activePort || readRuntimePort() || DEFAULT_SERVER_PORT;
  }

  function syncHooks() {
    const tryRun = (label, fn) => {
      try {
        const r = fn();
        if (r && (r.added || r.updated || r.removed)) log(`JAVIS: synced ${label} hooks (+${r.added || 0} ~${r.updated || 0} -${r.removed || 0})`);
      } catch (err) {
        log(`JAVIS: ${label} hook sync failed: ${err.message}`);
      }
    };
    tryRun("Claude", () => require("../hooks/install.js").registerHooks({ silent: true, autoStart: !!deps.autoStartWithClaude, port: getPort() }));
    tryRun("Gemini", () => require("../hooks/gemini-install.js").registerGeminiHooks({ silent: true }));
    tryRun("Cursor", () => require("../hooks/cursor-install.js").registerCursorHooks({ silent: true }));
  }

  // Another tool may rewrite ~/.claude/settings.json and drop our hooks: re-add them
  // (debounced, at most once per 5 s — no write wars).
  function watchSettings() {
    const dir = path.join(os.homedir(), ".claude");
    const file = path.join(dir, "settings.json");
    let timer = null;
    let lastSync = 0;
    try {
      settingsWatcher = fs.watch(dir, (_e, name) => {
        if (name && name !== "settings.json") return;
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          if (Date.now() - lastSync < 5000) return;
          try {
            if (!fs.readFileSync(file, "utf8").includes("clawd-hook.js")) {
              lastSync = Date.now();
              syncHooks();
            }
          } catch {}
        }, 1000);
      });
      settingsWatcher.on("error", () => {});
    } catch {}
  }

  // behavior: "allow" | "deny" | "always" (allow + Claude's first suggestion).
  function decide(id, behavior) {
    const entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    if (entry.res && entry.onClose) entry.res.removeListener("close", entry.onClose);
    if (entry.elicitation) {
      // AskUserQuestion: the owner answers in the terminal; deny hands it back there.
      sendPermissionResponse(entry.res, { behavior: "deny" }, "Elicitation");
    } else {
      const decision = { behavior: behavior === "allow" || behavior === "always" ? "allow" : "deny" };
      if (decision.behavior === "deny") decision.message = "Anh Nhựt từ chối trên JAVIS";
      if (behavior === "always" && entry.suggestion) {
        decision.behavior = "allow";
        decision.updatedPermissions = [entry.suggestion];
      }
      sendPermissionResponse(entry.res, decision);
    }
    onPermissionGone(id);
    return true;
  }

  function dropSession(sessionId) {
    for (const [id, entry] of pending) {
      if (entry.sessionId === sessionId) decide(id, "deny");
    }
  }

  function handlePermission(req, res) {
    readBody(req, 512 * 1024, (err, data) => {
      if (err) return sendPermissionResponse(res, { behavior: "deny", message: "Yêu cầu quá lớn, trả lời trong terminal" });
      if (isDoNotDisturb()) return sendPermissionResponse(res, { behavior: "deny", message: "JAVIS đang ở chế độ không làm phiền" });
      const toolName = typeof data.tool_name === "string" ? data.tool_name : "Unknown";
      const sessionId = typeof data.session_id === "string" && data.session_id ? data.session_id : "default";
      if (isHeadless(sessionId)) return sendPermissionResponse(res, { behavior: "deny", message: "Non-interactive session; auto-denied" });
      if (PASSTHROUGH_TOOLS.has(toolName)) return sendPermissionResponse(res, { behavior: "allow" });
      const input = truncateDeep(data.tool_input && typeof data.tool_input === "object" ? data.tool_input : {});
      const suggestion = Array.isArray(data.permission_suggestions)
        ? data.permission_suggestions.map(normalizeSuggestion).find(Boolean) || null
        : null;
      const id = `perm-${Date.now().toString(36)}-${++seq}`;
      const elicitation = toolName === "AskUserQuestion";
      const entry = { res, sessionId, elicitation, suggestion, onClose: null };
      // Answered in the terminal / Claude timed out: drop the card.
      entry.onClose = () => {
        if (!pending.has(id) || res.writableFinished) return;
        pending.delete(id);
        onPermissionGone(id);
      };
      res.on("close", entry.onClose);
      pending.set(id, entry);
      if (elicitation) onState({ id: sessionId, state: "notification", event: "Elicitation" });
      onPermission({
        id,
        sessionId,
        tool: toolName,
        elicitation,
        summary: elicitation ? String(input.questions?.[0]?.question || input.question || "Claude đang hỏi anh") : describeToolInput(toolName, input),
        canAlways: !!suggestion,
        cwd: typeof data.cwd === "string" ? data.cwd : "",
        at: Date.now(),
      });
    });
  }

  function handleState(req, res) {
    readBody(req, 4096, (err, data) => {
      if (err) { res.writeHead(400); return res.end(err.message); }
      const sid = typeof data.session_id === "string" && data.session_id ? data.session_id : "default";
      const event = typeof data.event === "string" ? data.event : "";
      if (event === "PostToolUse" || event === "PostToolUseFailure" || event === "Stop") dropSession(sid);
      onState({
        id: sid,
        state: data.state,
        event,
        agent: typeof data.agent_id === "string" ? data.agent_id : "claude-code",
        cwd: typeof data.cwd === "string" ? data.cwd : "",
        host: typeof data.host === "string" ? data.host : null,
        headless: data.headless === true,
      });
      res.writeHead(200, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
      res.end("ok");
    });
  }

  function route(req, res) {
    const url = (req.url || "").split("?")[0];
    if (req.method === "GET" && url === "/state") return jsonResponse(res, 200, { ok: true, app: CLAWD_SERVER_ID, port: getPort() });
    if (req.method === "POST" && url === "/state") return handleState(req, res);
    if (req.method === "POST" && url === "/permission") return handlePermission(req, res);
    if (req.method === "POST" && url === "/notification") {
      return readBody(req, 64 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        onNotification({
          title: typeof data.title === "string" ? data.title.slice(0, 200) : "Thông báo",
          message: typeof data.message === "string" ? data.message.slice(0, 2000) : "",
          level: ["info", "success", "warning", "error"].includes(data.level) ? data.level : "info",
        });
        jsonResponse(res, 200, { ok: true });
      });
    }
    if (req.method === "GET" && url === "/sessions") {
      const sessions = listSessions();
      return jsonResponse(res, 200, { ok: true, count: sessions.length, sessions });
    }
    if (req.method === "GET" && url === "/health") {
      return jsonResponse(res, 200, { ok: true, app: CLAWD_SERVER_ID, version: APP_VERSION, port: getPort(), sessions: listSessions().length, pending: pending.size });
    }
    res.writeHead(404);
    res.end();
  }

  function start({ ports = getPortCandidates(), sync = true } = {}) {
    server = http.createServer(route);
    let index = 0;
    server.on("error", (err) => {
      if (!activePort && err.code === "EADDRINUSE" && index < ports.length - 1) {
        index++;
        server.listen(ports[index], "127.0.0.1");
        return;
      }
      log(`JAVIS: hook server error: ${err.message}`);
    });
    return new Promise((resolve) => {
      server.on("listening", () => {
        activePort = server.address().port;
        if (sync) {
          writeRuntimeConfig(activePort);
          ownsRuntime = true;
          syncHooks();
          watchSettings();
        }
        resolve(activePort);
      });
      server.listen(ports[index], "127.0.0.1");
    });
  }

  function stop() {
    for (const id of [...pending.keys()]) decide(id, "deny");
    if (settingsWatcher) settingsWatcher.close();
    if (server) {
      server.close();
      if (ownsRuntime) clearRuntimeConfig();
    }
    server = null;
  }

  return { start, stop, decide, getPort, pendingCount: () => pending.size };
}

module.exports = { createHookServer, describeToolInput, normalizeSuggestion, PASSTHROUGH_TOOLS };
