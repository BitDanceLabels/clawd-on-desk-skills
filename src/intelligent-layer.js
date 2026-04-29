// src/intelligent-layer.js — Lop tuong tac thong minh cho clawd-on-desk
//
// Modes:
//   - "wiki"    : tra cuu Wikipedia REST API (vi/en) khong can key
//   - "english" : tu vung + dich Anh-Viet, dung Wiktionary + duckduckgo instant answer
//   - "work"    : route prompt qua Bumbee API Gateway (/v1/chat hoac /v1/llm/chat)
//                 → forward toi Claude/Codex backend, lay tra loi
//   - "general" : fallback giong "work"
//
// Khi gateway khong online, "work"/"general"/"english" se tra ve loi de menu
// hien thi cho user; "wiki" hoat dong doc lap khong can gateway.

const http = require("http");
const https = require("https");
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

module.exports = function initIntelligentLayer(opts) {
  const config = opts || {};
  const gatewayUrl = (config.gatewayUrl || process.env.GATEWAY_URL || "http://127.0.0.1:30091").replace(/\/$/, "");
  const enabled = config.enabled !== false && (process.env.SMART_LAYER_ENABLE !== "0");
  // Endpoint backend chat — co the override qua env. Mac dinh thu vai endpoint gateway hay co
  const chatEndpoint = config.chatEndpoint || process.env.SMART_CHAT_ENDPOINT || "/v1/llm/chat";

  async function gatewayChat(prompt, system) {
    const url = `${gatewayUrl}${chatEndpoint}`;
    const payload = {
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      stream: false,
    };
    return fetch(url, { method: "POST", body: payload, timeout: 30_000, headers: { "Content-Type": "application/json" } });
  }

  async function chat({ mode, query, context }) {
    if (!enabled) return { error: "intelligent layer disabled" };
    if (!query || typeof query !== "string") return { error: "missing query" };

    if (mode === "wiki") {
      const result = await wikiSummary(query);
      if (!result) return { mode: "wiki", answer: `Khong tim thay bai Wikipedia cho: "${query}"` };
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
        const sys = "Ban la tro ly hoc tieng Anh cho nguoi Viet. Tra loi ngan gon, kem nghia tieng Viet va 1 vi du.";
        const data = await gatewayChat(query, sys);
        return {
          mode: "english",
          answer: extractAnswer(data) || JSON.stringify(data).slice(0, 500),
          source: { type: "gateway", endpoint: chatEndpoint },
        };
      } catch (e) {
        return { mode: "english", error: `Wiktionary khong co tu nay; gateway loi: ${e.message}` };
      }
    }

    // work / general → forward gateway
    const sys = mode === "work"
      ? "Ban la tro ly cong viec. Tra loi tieng Viet, ngan gon, dua ra cac buoc lam viec ro rang."
      : "Ban la tro ly chung. Tra loi tieng Viet ngan gon va chinh xac.";
    const fullPrompt = context ? `${query}\n\nContext: ${typeof context === "string" ? context : JSON.stringify(context)}` : query;
    try {
      const data = await gatewayChat(fullPrompt, sys);
      return {
        mode,
        answer: extractAnswer(data) || JSON.stringify(data).slice(0, 500),
        source: { type: "gateway", endpoint: chatEndpoint },
      };
    } catch (e) {
      return { mode, error: `Gateway chat that bai: ${e.message}` };
    }
  }

  function extractAnswer(data) {
    if (!data) return null;
    if (typeof data === "string") return data;
    // Co gang lay tu cac shape pho bien
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
    return { enabled, gatewayUrl, chatEndpoint };
  }

  return { chat, status, wikiSummary, wiktionaryDefinition };
};
