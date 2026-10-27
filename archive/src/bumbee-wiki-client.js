const http = require("http");
const https = require("https");
const { URL } = require("url");

function requestJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (err) { return reject(err); }
    const lib = parsed.protocol === "https:" ? https : http;
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const headers = {
      "Accept": "application/json",
      "User-Agent": "clawd-on-desk/bumbee-wiki-client",
      ...(opts.headers || {}),
    };
    if (body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || (body ? "POST" : "GET"),
      headers,
      timeout: opts.timeout || 15_000,
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        const message = data?.detail || data?.error || data?.message || `HTTP ${res.statusCode}`;
        reject(new Error(typeof message === "string" ? message : JSON.stringify(message)));
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = function initBumbeeWikiClient(opts = {}) {
  const baseUrl = (opts.baseUrl || process.env.BUMBEE_WIKI_URL || "https://wiki.bumbee.asia/api").replace(/\/$/, "");
  const getToken = typeof opts.getToken === "function" ? opts.getToken : () => opts.token || "";

  function call(path, options = {}) {
    return requestJson(`${baseUrl}${path}`, {
      ...options,
      token: getToken() || "",
    });
  }

  return {
    baseUrl,
    health: () => call("/health"),
    registerApp: (payload) => call("/apps/register", { method: "POST", body: payload }),
    ask: (payload) => call("/apps/chat", { method: "POST", body: payload, timeout: 60_000 }),
    search: (params = {}) => {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
      }
      return call(`/wiki/search${qs.toString() ? `?${qs}` : ""}`);
    },
    ingestDocument: (payload) => call("/ingest/document", { method: "POST", body: payload }),
    updates: (params = {}) => {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
      }
      return call(`/brain/updates${qs.toString() ? `?${qs}` : ""}`);
    },
    skillsManifest: (params = {}) => {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
      }
      return call(`/skills/manifest${qs.toString() ? `?${qs}` : ""}`);
    },
  };
};
