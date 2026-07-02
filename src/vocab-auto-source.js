// src/vocab-auto-source.js — Phase 2: auto-ingest vocabulary from multiple sources
// (clipboard watcher, URL fetch, screen-text hook) → feeds addVocabItems via ctx.
// Privacy: clipboard watching is OFF by default and gated by ctx.isEnabled().
"use strict";

const { clipboard } = require("electron");
const https = require("https");
const http = require("http");

module.exports = function initVocabAutoSource(ctx) {
  // ctx = {
  //   addFromText(text, source) -> Promise<{ok, created, ...}>,
  //   isEnabled() -> bool,          // master clipboard-watch toggle
  //   getIntervalSec() -> number,
  //   log(msg),
  // }
  let timer = null;
  let lastClipHash = "";

  function hashText(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return String(h);
  }

  // Heuristic: is this mostly English prose worth mining? (avoid code, VN text, tokens)
  function looksLikeEnglishProse(text) {
    const t = text.trim();
    const words = t.split(/\s+/);
    if (words.length < 4) return false;
    const letters = (t.match(/[a-zA-Z]/g) || []).length;
    if (letters / t.length < 0.5) return false;         // too many symbols/non-latin
    const viDiacritics = (t.match(/[àáảãạăâđêôơưèéẹìíòóùúýỳ]/gi) || []).length;
    if (viDiacritics > words.length) return false;       // looks Vietnamese
    return true;
  }

  function stripHtml(html) {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function fetchUrl(url, redirects = 0) {
    return new Promise((resolve, reject) => {
      let mod;
      try {
        const u = new URL(url);
        if (u.protocol !== "https:" && u.protocol !== "http:") return reject(new Error("bad_protocol"));
        mod = u.protocol === "https:" ? https : http;
      } catch {
        return reject(new Error("bad_url"));
      }
      const req = mod.get(url, { timeout: 12000, headers: { "User-Agent": "BumbeeVocab/1.0" } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
          res.resume();
          return resolve(fetchUrl(new URL(res.headers.location, url).toString(), redirects + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error("http_" + res.statusCode)); }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { data += c; if (data.length > 800000) req.destroy(); });
        res.on("end", () => resolve(data));
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
    });
  }

  async function grabClipboard(manual = false) {
    let text = "";
    try { text = String(clipboard.readText() || "").trim(); } catch { return { ok: false, reason: "clipboard_unavailable" }; }
    if (text.length < 12 || text.length > 8000) return { ok: false, reason: "empty_or_too_big" };
    if (!looksLikeEnglishProse(text)) return { ok: false, reason: "not_english_prose" };
    const h = hashText(text);
    if (!manual && h === lastClipHash) return { ok: false, reason: "duplicate" };
    lastClipHash = h;
    return ctx.addFromText(text, "clipboard");
  }

  async function addFromUrl(url) {
    let html;
    try { html = await fetchUrl(String(url)); }
    catch (e) { return { ok: false, reason: "fetch_failed", error: e.message }; }
    const text = stripHtml(html).slice(0, 8000);
    if (!looksLikeEnglishProse(text)) return { ok: false, reason: "not_english_prose" };
    return ctx.addFromText(text, "url");
  }

  // Screen-text hook (Phase 2c) — caller passes text pulled from vision-auto-capture.
  async function addFromScreen(text) {
    const t = String(text || "").trim();
    if (t.length < 12 || !looksLikeEnglishProse(t)) return { ok: false, reason: "not_english_prose" };
    return ctx.addFromText(t, "screen");
  }

  function start() {
    if (timer) return;
    const tick = async () => {
      if (!ctx.isEnabled()) return;
      try { await grabClipboard(false); } catch (e) { ctx.log && ctx.log("clipboard grab failed: " + e.message); }
    };
    const intervalMs = Math.max(15, ctx.getIntervalSec ? ctx.getIntervalSec() : 45) * 1000;
    timer = setInterval(tick, intervalMs);
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return { start, stop, grabClipboard, addFromUrl, addFromScreen };
};
