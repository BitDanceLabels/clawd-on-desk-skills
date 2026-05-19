// src/intelligent-layer.js — Lop tuong tac thong minh cho clawd-on-desk
//
// Modes:
//   - "wiki"    : tra cuu Bumbee Wiki trung tam, fallback Wikipedia REST API
//   - "english" : tu vung + dich Anh-Viet, dung Wiktionary + duckduckgo instant answer
//   - "work"    : route prompt qua Bumbee API Gateway (/bumbee/chat)
//                 → forward toi Claude/Codex backend, lay tra loi
//   - "general" : fallback giong "work"
//
// Khi gateway khong online, "work"/"general"/"english" se tra ve loi de menu
// hien thi cho user; "wiki" hoat dong doc lap khong can gateway.

const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { URL } = require("url");

const WIKI_HOSTS = {
  vi: "vi.wikipedia.org",
  en: "en.wikipedia.org",
};

function fetch(url, opts) {
  const o = opts || {};
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return reject(e); }
    const lib = parsed.protocol === "https:" ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + (parsed.search || ""),
      method: o.method || "GET",
      headers: Object.assign({
        "User-Agent": "clawd-on-desk/intelligent-layer",
        "Accept": "application/json",
      }, o.headers || {}),
      timeout: o.timeout || 8000,
    };
    const req = lib.request(reqOpts, (res) => {
      let chunks = "";
      res.on("data", (d) => { chunks += d; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(o.parseJson === false ? chunks : JSON.parse(chunks)); }
          catch { resolve(chunks); }
        } else if (res.statusCode === 404) {
          resolve(null);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 200)}`));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (o.body) req.write(typeof o.body === "string" ? o.body : JSON.stringify(o.body));
    req.end();
  });
}

function detectWikiLang(query) {
  const hasVietnameseDiacritics = /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i.test(query);
  return hasVietnameseDiacritics ? "vi" : "en";
}

async function wikiSummary(query, lang) {
  const targetLang = lang || detectWikiLang(query);
  const host = WIKI_HOSTS[targetLang] || WIKI_HOSTS.en;
  const title = encodeURIComponent(query.replace(/\s+/g, "_"));
  const url = `https://${host}/api/rest_v1/page/summary/${title}?redirect=true`;
  try {
    const data = await fetch(url, { timeout: 6000 });
    if (!data || !data.extract) return null;
    return {
      lang: targetLang,
      title: data.title,
      summary: data.extract,
      url: data.content_urls?.desktop?.page || `https://${host}/wiki/${title}`,
      thumbnail: data.thumbnail?.source || null,
    };
  } catch (e) {
    return { error: e.message, lang: targetLang };
  }
}

async function wiktionaryDefinition(word, lang) {
  const targetLang = lang || "en";
  const host = "en.wiktionary.org";
  const title = encodeURIComponent(word.toLowerCase().trim());
  const url = `https://${host}/api/rest_v1/page/definition/${title}`;
  try {
    const data = await fetch(url, { timeout: 6000 });
    if (!data) return null;
    const defs = data[targetLang] || data.en || [];
    const compact = defs.slice(0, 3).map(group => ({
      partOfSpeech: group.partOfSpeech,
      definitions: (group.definitions || []).slice(0, 3).map(d => ({
        text: (d.definition || "").replace(/<[^>]+>/g, "").slice(0, 300),
        examples: (d.examples || []).slice(0, 1).map(e => (e || "").replace(/<[^>]+>/g, "").slice(0, 200)),
      })),
    }));
    return { word, lang: targetLang, definitions: compact };
  } catch (e) {
    return { error: e.message, word };
  }
}

function readTokenFile(filePath) {
  if (!filePath || typeof filePath !== "string") return "";
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function resolveChatAuthToken(config) {
  const envToken = process.env.SMART_CHAT_AUTH_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN || process.env.GATEWAY_API_KEY || "";
  if (config.chatAuthToken || envToken) {
    return {
      token: config.chatAuthToken || envToken,
      source: config.chatAuthToken ? "config" : "env",
    };
  }

  const candidateFiles = [
    config.chatAuthTokenFile,
    process.env.SMART_CHAT_AUTH_TOKEN_FILE,
    process.env.CLAWDBOT_GATEWAY_TOKEN_FILE,
    process.env.GATEWAY_API_KEY_FILE,
    path.join(os.homedir(), ".clawd-on-desk", "bumbee-gateway-token.txt"),
    path.join(os.homedir(), ".bumbee", "bumbee-gateway-token.txt"),
  ].filter(Boolean);

  for (const file of candidateFiles) {
    const token = readTokenFile(file);
    if (token) return { token, source: file };
  }
  return { token: "", source: null };
}

module.exports = function initIntelligentLayer(opts) {
  const config = opts || {};
  const gatewayUrl = (config.gatewayUrl || process.env.GATEWAY_URL || "https://gateway.bumbee.asia").replace(/\/$/, "");
  const enabled = config.enabled !== false && (process.env.SMART_LAYER_ENABLE !== "0");
  // Endpoint backend chat — co the override qua env.
  const chatEndpoint = config.chatEndpoint || process.env.SMART_CHAT_ENDPOINT || "/clawdbot/bumbee-desk/v1/chat/completions";
  const chatModel = config.chatModel || process.env.SMART_CHAT_MODEL || "clawdbot";
  const chatAuth = resolveChatAuthToken(config);
  const chatAuthToken = chatAuth.token;
  const bumbeeWiki = config.bumbeeWiki || null;

  async function gatewayChat(prompt, system, mode, context) {
    return gatewayChatToEndpoint(chatEndpoint, prompt, system, mode, context);
  }

  async function gatewayChatToEndpoint(endpoint, prompt, system, mode, context) {
    const url = `${gatewayUrl}${endpoint}`;
    const contextObj = context && typeof context === "object" ? context : {};
    const camera = contextObj.camera || null;
    const audio = contextObj.audio || null;
    const gatewayContext = { ...contextObj };
    delete gatewayContext.source;
    delete gatewayContext.device_id;
    delete gatewayContext.session_id;
    delete gatewayContext.camera;
    delete gatewayContext.audio;
    const userContent = [{ type: "text", text: prompt }];
    if (camera?.image_data_url) {
      userContent.push({ type: "image_url", image_url: { url: camera.image_data_url } });
    }
    if (audio?.audio_data_url) {
      const base64 = String(audio.audio_data_url).split(",")[1] || "";
      userContent.push({ type: "input_audio", input_audio: { data: base64, format: /wav/i.test(audio.mime_type || "") ? "wav" : "webm" } });
    }
    const payload = endpoint === "/bumbee/chat"
      ? {
          message: prompt,
          mode: mode || "general",
          source: contextObj.source || "clawd-on-desk",
          device_id: String(contextObj.device_id || ""),
          session_id: String(contextObj.session_id || ""),
          context: Object.keys(gatewayContext).length ? gatewayContext : {},
          camera,
          audio,
        }
      : {
          model: chatModel,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: userContent.length > 1 ? userContent : prompt },
          ],
          stream: false,
          metadata: { mode: mode || "general", source: contextObj.source || "clawd-on-desk", camera, audio },
        };
    const headers = { "Content-Type": "application/json" };
    if (chatAuthToken) headers.Authorization = `Bearer ${chatAuthToken}`;
    if (contextObj.session_id) headers["x-clawdbot-session-key"] = String(contextObj.session_id);
    return fetch(url, { method: "POST", body: payload, timeout: 30_000, headers });
  }

  async function gatewayChatWithFallback(prompt, system, mode, context) {
    try {
      const data = await gatewayChat(prompt, system, mode, context);
      return { data, endpoint: chatEndpoint };
    } catch (err) {
      const message = err?.message || "";
      if (chatEndpoint === "/bumbee/chat" || !/timeout|ECONNREFUSED|ECONNRESET|HTTP 5\d\d/i.test(message)) throw err;
      const data = await gatewayChatToEndpoint("/bumbee/chat", String(prompt || "").split("\n\nContext:")[0], system, mode, context);
      return { data, endpoint: "/bumbee/chat" };
    }
  }

  async function chat({ mode, query, context }) {
    if (!enabled) return { error: "intelligent layer disabled" };
    if (!query || typeof query !== "string") return { error: "missing query" };

    if (mode === "wiki") {
      if (bumbeeWiki && typeof bumbeeWiki.ask === "function") {
        try {
          const data = await bumbeeWiki.ask(query, {
            mode: "auto",
            project: context && typeof context === "object" ? context.project : null,
          });
          return {
            mode: "wiki",
            answer: extractAnswer(data) || JSON.stringify(data).slice(0, 500),
            source: {
              type: "bumbee-wiki",
              appId: bumbeeWiki.status?.().appId,
              project: bumbeeWiki.status?.().project,
              sources: data?.sources || [],
            },
          };
        } catch (e) {
          // Public Wikipedia fallback keeps chat useful if the private wiki is offline.
        }
      }
      const result = await wikiSummary(query);
      if (!result) return { mode: "wiki", answer: `Không tìm thấy bài Wikipedia cho: "${query}"` };
      if (result.error) return { mode: "wiki", error: result.error };
      return {
        mode: "wiki",
        answer: result.summary,
        source: { type: "wikipedia", lang: result.lang, title: result.title, url: result.url, thumbnail: result.thumbnail },
      };
    }

    if (mode === "english") {
      // Try Wiktionary trước, fallback gateway
      const word = query.trim().split(/\s+/)[0];
      const wikt = await wiktionaryDefinition(word, "en");
      if (wikt && wikt.definitions && wikt.definitions.length) {
        const lines = [];
        lines.push(`Tu vung: ${wikt.word}`);
        for (const grp of wikt.definitions) {
          lines.push(`\n[${grp.partOfSpeech || "word"}]`);
          for (const def of grp.definitions) {
            lines.push(`- ${def.text}`);
            if (def.examples && def.examples.length) {
              lines.push(`  ex: ${def.examples[0]}`);
            }
          }
        }
        return {
          mode: "english",
          answer: lines.join("\n"),
          source: { type: "wiktionary", word: wikt.word, lang: "en" },
        };
      }
      // fallback gateway: dich + giai thich
      try {
        const sys = "Bạn là trợ lý học tiếng Anh cho người Việt. Trả lời ngắn gọn bằng tiếng Việt có dấu, kèm nghĩa tiếng Việt và 1 ví dụ.";
        const { data, endpoint } = await gatewayChatWithFallback(query, sys, mode, context);
        return {
          mode: "english",
          answer: extractAnswer(data) || JSON.stringify(data).slice(0, 500),
          source: { type: "gateway", endpoint },
        };
      } catch (e) {
        return { mode: "english", error: `Wiktionary không có từ này; gateway lỗi: ${e.message}` };
      }
    }

    // work / general → forward gateway
    const sys = mode === "work"
      ? "Bạn là trợ lý công việc thông minh. Luôn trả lời bằng tiếng Việt có dấu đầy đủ, ngắn gọn, đưa ra các bước làm việc rõ ràng."
      : "Bạn là trợ lý chung thông minh. Luôn trả lời bằng tiếng Việt có dấu đầy đủ, ngắn gọn và chính xác.";
    const fullPrompt = context ? `${query}\n\nContext: ${typeof context === "string" ? context : JSON.stringify(context)}` : query;
    const gatewayPrompt = chatEndpoint === "/bumbee/chat" ? query : fullPrompt;
    try {
      const { data, endpoint } = await gatewayChatWithFallback(gatewayPrompt, sys, mode, context);
      return {
        mode,
        answer: extractAnswer(data) || JSON.stringify(data).slice(0, 500),
        source: { type: "gateway", endpoint },
      };
    } catch (e) {
      return { mode, error: `Gateway chat thất bại: ${e.message}` };
    }
  }

  function extractAnswer(data) {
    if (!data) return null;
    if (typeof data === "string") return data;
    // Co gang lay tu cac shape pho bien
    if (data.reply) return data.reply;
    if (data.answer) return data.answer;
    if (data.content) return Array.isArray(data.content) ? data.content.map(c => c.text || "").join("\n") : data.content;
    if (data.choices && data.choices[0]) {
      const c = data.choices[0];
      return c.message?.content || c.text || null;
    }
    if (data.message?.content) return data.message.content;
    if (data.result) return typeof data.result === "string" ? data.result : JSON.stringify(data.result);
    return null;
  }

  function status() {
    return {
      enabled,
      gatewayUrl,
      chatEndpoint,
      chatModel,
      authenticated: !!chatAuthToken,
      authSource: chatAuthToken ? chatAuth.source : null,
    };
  }

  return { chat, status, wikiSummary, wiktionaryDefinition };
};
