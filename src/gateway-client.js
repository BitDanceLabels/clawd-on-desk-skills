// src/gateway-client.js — Register clawd-on-desk vao Bumbee API Gateway (FastAPI :30091)
// Tu dong dang ky tat ca routes co trong src/server.js de gateway co the proxy.
// Heartbeat lai moi 60s phong khi gateway restart va mat registry.

const http = require("http");
const https = require("https");
const { URL } = require("url");

const SERVICE_NAME = "clawd-on-desk";
const HEARTBEAT_MS = 60_000;

const ROUTES = [
  { name: "clawd_health",            method: "GET",  gateway_path: "/v1/clawd/health",        upstream_path: "/health" },
  { name: "clawd_state_get",         method: "GET",  gateway_path: "/v1/clawd/state",         upstream_path: "/state" },
  { name: "clawd_state_post",        method: "POST", gateway_path: "/v1/clawd/state",         upstream_path: "/state" },
  { name: "clawd_notification",      method: "POST", gateway_path: "/v1/clawd/notification",  upstream_path: "/notification" },
  { name: "clawd_sessions",          method: "GET",  gateway_path: "/v1/clawd/sessions",      upstream_path: "/sessions" },
  { name: "clawd_skills_list",       method: "GET",  gateway_path: "/v1/clawd/skills",        upstream_path: "/skills" },
  { name: "clawd_skills_trigger",    method: "POST", gateway_path: "/v1/clawd/skills/trigger",upstream_path: "/skills/trigger" },
  { name: "clawd_chat",              method: "POST", gateway_path: "/v1/clawd/chat",          upstream_path: "/chat" },
];

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
        "User-Agent": "clawd-on-desk/gateway-client",
      },
      timeout: timeoutMs || 5000,
    }, (res) => {
      let chunks = "";
      res.on("data", (d) => { chunks += d; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(chunks ? JSON.parse(chunks) : {}); }
          catch { resolve({ raw: chunks }); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 200)}`));
        }
      });
    });
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function deleteJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return reject(e); }
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + (parsed.search || ""),
      method: "DELETE",
      headers: { "User-Agent": "clawd-on-desk/gateway-client" },
      timeout: timeoutMs || 3000,
    }, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

module.exports = function initGatewayClient(opts) {
  const config = opts || {};
  const baseUrl = (config.baseUrl || process.env.GATEWAY_URL || "http://127.0.0.1:30091").replace(/\/$/, "");
  const upstreamPort = config.upstreamPort || 23333;
  const upstreamHost = config.upstreamHost || "127.0.0.1";
  const enabled = config.enabled !== false && (process.env.GATEWAY_ENABLE !== "0");

  let registered = false;
  let lastError = null;
  let heartbeatTimer = null;

  async function register() {
    if (!enabled) return false;
    const payload = {
      name: SERVICE_NAME,
      base_url: `http://${upstreamHost}:${upstreamPort}`,
      routes: ROUTES,
    };
    try {
      await postJson(`${baseUrl}/gateway/register`, payload, 5000);
      registered = true;
      lastError = null;
      console.log(`Clawd: registered with gateway at ${baseUrl} (${ROUTES.length} routes)`);
      return true;
    } catch (e) {
      registered = false;
      lastError = e.message;
      console.warn(`Clawd: gateway register failed (${baseUrl}): ${e.message}`);
      return false;
    }
  }

  async function unregister() {
    if (!enabled || !registered) return;
    try {
      await deleteJson(`${baseUrl}/gateway/register/${SERVICE_NAME}`, 3000);
      registered = false;
    } catch (e) {
      console.warn(`Clawd: gateway unregister failed: ${e.message}`);
    }
  }

  function start() {
    if (!enabled) {
      console.log("Clawd: gateway client disabled (GATEWAY_ENABLE=0)");
      return;
    }
    register();
    heartbeatTimer = setInterval(() => {
      register().catch(() => {});
    }, HEARTBEAT_MS);
    if (heartbeatTimer.unref) heartbeatTimer.unref();
  }

  function cleanup() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    unregister().catch(() => {});
  }

  function status() {
    return { enabled, registered, baseUrl, lastError, routeCount: ROUTES.length };
  }

  function setUpstreamPort(port) {
    if (port && port !== upstreamPort) {
      // Re-register with new port if upstream port changed (e.g. EADDRINUSE fallback)
      Object.assign(opts, { upstreamPort: port });
      if (registered) register().catch(() => {});
    }
  }

  return { start, cleanup, status, register, setUpstreamPort };
};
