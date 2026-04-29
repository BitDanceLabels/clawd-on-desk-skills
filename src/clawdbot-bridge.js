// src/clawdbot-bridge.js — Bridge 2 chieu giua clawd-on-desk va clawdbot (Telegram/Discord/etc)
//
// Outbound (clawd → clawdbot):
//   - Push state changes (attention/error/notification) → clawdbot relay len Telegram chat cua nguoi dung.
//
// Inbound (clawdbot → clawd):
//   - Clawdbot POST notification toi /notification cua clawd-on-desk; bridge nay chi can register endpoint
//     clawdbot dung de gui (qua webhook hoac long-poll).
//
// Bridge dung HTTP simple POST. Khong block khoi dong neu clawdbot khong online.

const http = require("http");
const https = require("https");
const { URL } = require("url");

const PUSH_DEBOUNCE_MS = 1500;
const PUSH_STATES = new Set(["attention", "error", "notification"]);

function postJson(url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return reject(e); }
    const lib = parsed.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload);
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + (parsed.search || ""),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "clawd-on-desk/clawdbot-bridge",
      },
      timeout: timeoutMs || 4000,
    }, (res) => {
      res.on("data", () => {});
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = function initClawdbotBridge(opts) {
  const config = opts || {};
  const baseUrl = (config.baseUrl || process.env.CLAWDBOT_URL || "http://127.0.0.1:18789").replace(/\/$/, "");
  const enabled = config.enabled !== false
    && (process.env.CLAWDBOT_ENABLE !== "0")
    && (process.env.TELEGRAM_NOTIFY !== "false");
  const chatId = config.chatId || process.env.CLAWDBOT_CHAT_ID || null;

  let lastPushAt = 0;
  let connected = false;
  let lastError = null;
  let lastSeenState = null;
  let healthTimer = null;

  async function pushNotification({ title, message, level, sessionId, agentId, cwd }) {
    if (!enabled) return false;
    const now = Date.now();
    if (now - lastPushAt < PUSH_DEBOUNCE_MS) return false;
    lastPushAt = now;
    const payload = {
      source: "clawd-on-desk",
      chat_id: chatId,
      title: title || "Clawd notification",
      message: message || "",
      level: level || "info",
      session_id: sessionId || null,
      agent_id: agentId || "claude-code",
      cwd: cwd || null,
      timestamp: new Date().toISOString(),
    };
    try {
      await postJson(`${baseUrl}/api/external/notify`, payload, 4000);
      connected = true;
      lastError = null;
      return true;
    } catch (e) {
      // Fallback: try generic /notify
      try {
        await postJson(`${baseUrl}/notify`, payload, 3000);
        connected = true;
        lastError = null;
        return true;
      } catch (e2) {
        connected = false;
        lastError = e2.message;
        return false;
      }
    }
  }

  function onStateChange(state, sessionData) {
    if (!enabled) return;
    if (!PUSH_STATES.has(state)) return;
    if (state === lastSeenState) return; // dedupe consecutive same state
    lastSeenState = state;
    const sid = (sessionData && sessionData.id) || "default";
    const cwd = (sessionData && sessionData.cwd) || "";
    const agentId = (sessionData && (sessionData.agentId || sessionData.agent_id)) || "claude-code";
    pushNotification({
      title: state === "error" ? "Clawd: error" : state === "attention" ? "Clawd: attention" : "Clawd: notification",
      message: cwd ? `Session ${sid} — ${cwd}` : `Session ${sid}`,
      level: state === "error" ? "error" : state === "attention" ? "warning" : "info",
      sessionId: sid,
      agentId,
      cwd,
    }).catch(() => {});
  }

  async function checkHealth() {
    if (!enabled) return;
    try {
      const url = new URL(`${baseUrl}/health`);
      await new Promise((resolve, reject) => {
        const lib = url.protocol === "https:" ? https : http;
        const req = lib.request({
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname,
          method: "GET",
          timeout: 2500,
        }, (res) => {
          res.on("data", () => {});
          res.on("end", () => res.statusCode < 500 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`)));
        });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        req.end();
      });
      connected = true;
      lastError = null;
    } catch (e) {
      connected = false;
      lastError = e.message;
    }
  }

  function start() {
    if (!enabled) {
      console.log("Clawd: clawdbot bridge disabled (CLAWDBOT_ENABLE=0 or TELEGRAM_NOTIFY=false)");
      return;
    }
    checkHealth();
    healthTimer = setInterval(checkHealth, 60_000);
    if (healthTimer.unref) healthTimer.unref();
    console.log(`Clawd: clawdbot bridge initialized (target=${baseUrl})`);
  }

  function cleanup() {
    if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
  }

  function status() {
    return { enabled, connected, baseUrl, chatId, lastError };
  }

  return { start, cleanup, status, onStateChange, pushNotification };
};
