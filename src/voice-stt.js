// src/voice-stt.js — speech to text for the desk mic button.
//
// The renderer records one utterance (16 kHz mono WAV, base64) and hands it here;
// it goes to the Bumbee Vision speech service the 0.11 app already used, one
// request per utterance (no retries, no streaming loop).
"use strict";

const VISION_AUDIO_WS_URL = "wss://vision.bumbee.asia/ws/audio-stream";
const TIMEOUT_MS = 30_000;
const MAX_BASE64 = 8 * 1024 * 1024; // ~60 s of 16 kHz mono WAV

async function toText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data && typeof data.text === "function") return data.text();
  return String(data || "");
}

function transcribe(payload, { WebSocketImpl = globalThis.WebSocket, url = VISION_AUDIO_WS_URL } = {}) {
  const data = typeof payload?.data === "string" ? payload.data : "";
  if (!data) return Promise.reject(new Error("missing_audio"));
  if (data.length > MAX_BASE64) return Promise.reject(new Error("audio_too_long"));
  if (typeof WebSocketImpl !== "function") return Promise.reject(new Error("websocket_unavailable"));
  const chunkId = `javis-desk-${Date.now().toString(36)}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    let ws = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (ws && ws.readyState === 1) ws.close(); } catch {}
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("stt_timeout")), TIMEOUT_MS);
    try {
      ws = new WebSocketImpl(url);
    } catch (err) {
      finish(reject, err);
      return;
    }
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "chunk", data, source_id: "javis-desk", chunk_id: chunkId }));
    }, { once: true });
    ws.addEventListener("message", async (event) => {
      let msg = null;
      try { msg = JSON.parse(await toText(event.data)); } catch { return; }
      if (msg.type === "transcript" && (!msg.chunk_id || msg.chunk_id === chunkId)) {
        finish(resolve, { ok: true, text: String(msg.text || "").trim() });
      } else if (msg.type === "error") {
        finish(reject, new Error(String(msg.error || "stt_error")));
      }
    });
    ws.addEventListener("error", () => finish(reject, new Error("stt_unreachable")), { once: true });
    ws.addEventListener("close", () => finish(reject, new Error("stt_closed")), { once: true });
  });
}

module.exports = { transcribe, VISION_AUDIO_WS_URL };
