// src/javis-voice.js — "Thư ký" voice: read a text aloud in Vietnamese.
//
// Order (owner's choice): 1) `bsay` (VieNeu-TTS on the Mac) if installed,
// 2) gateway TTS POST /fleet/voice/tts (WAV, played in the character window so
// she can lip-sync to the real audio), 3) the system voice (Web Speech in the
// character window). One reading at a time; stop() always works.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const BSAY_VOICE = "Phạm Tuyên";
const GATEWAY_MAX_TEXT = 2000; // VOICE_MAX_TEXT on the gateway

function bsayCandidates(home = os.homedir()) {
  // Absolute paths: a Finder-launched app has a minimal PATH without /opt/homebrew/bin.
  return [
    path.join(home, "Bumbee/tts-local/bsay"),
    "/opt/homebrew/bin/bsay",
    "/usr/local/bin/bsay",
  ];
}

function findBsay({ platform = process.platform, exists = fs.existsSync, home } = {}) {
  if (platform !== "darwin") return null;
  return bsayCandidates(home).find((p) => { try { return exists(p); } catch { return false; } }) || null;
}

/** Which engines to try, in order. */
function voicePlan({ bsayPath, paired }) {
  const plan = [];
  if (bsayPath) plan.push("bsay");
  if (paired) plan.push("gateway");
  plan.push("system");
  return plan;
}

const ENGINE_LABEL = {
  bsay: "Giọng VieNeu (trên máy)",
  gateway: "Giọng JAVIS (máy chủ)",
  system: "Giọng hệ thống",
};

/**
 * @param deps.spawn          child_process.spawn
 * @param deps.findBsay       () => path|null
 * @param deps.isPaired       () => boolean
 * @param deps.fetchTts       async (text) => { status, buffer, contentType }
 * @param deps.toCharacter    (channel, payload) => void   — sends to the character window
 * @param deps.onState        ({ speaking, engine, text, seconds }) => void
 */
function createSpeaker({ spawn, findBsay: find = findBsay, isPaired, fetchTts, toCharacter, onState = () => {}, log = () => {} }) {
  let current = null; // { id, engine, proc }
  let seq = 0;

  function emit(extra) {
    onState({ speaking: !!current, engine: current ? current.engine : null, ...extra });
  }

  function finish(id) {
    if (!current || current.id !== id) return;
    current = null;
    toCharacter("javis-speech", { action: "stop", id });
    emit({});
  }

  function stop() {
    if (!current) return false;
    const c = current;
    current = null;
    if (c.proc) { try { c.proc.kill(); } catch {} }
    toCharacter("javis-speech", { action: "stop", id: c.id });
    emit({ stopped: true });
    return true;
  }

  function trySpawnBsay(bin, text, id) {
    return new Promise((resolve) => {
      let proc;
      try {
        proc = spawn(bin, ["-v", BSAY_VOICE, text], { stdio: "ignore", detached: false });
      } catch { resolve(false); return; }
      let settled = false;
      const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      proc.on("error", () => { done(false); if (current && current.proc === proc) finish(id); });
      proc.on("spawn", () => done(true));
      proc.on("exit", () => { if (current && current.proc === proc) finish(id); });
      if (current && current.id === id) current.proc = proc;
      setTimeout(() => done(true), 400);
    });
  }

  /** Speak `text`. Resolves with the engine used. */
  async function speak(text, { seconds = 0 } = {}) {
    stop();
    const clean = String(text || "").trim();
    if (!clean) return { ok: false, error: "empty" };
    const id = ++seq;
    const plan = voicePlan({ bsayPath: find(), paired: !!isPaired() });
    for (const engine of plan) {
      current = { id, engine, proc: null };
      if (engine === "bsay") {
        const ok = await trySpawnBsay(find(), clean, id);
        if (current && current.id === id && ok) {
          // bsay plays the audio itself: the character mouths along with a speech-like rhythm.
          toCharacter("javis-speech", { action: "mouth", id, seconds });
          emit({ text: clean, seconds });
          return { ok: true, engine };
        }
        if (!current || current.id !== id) return { ok: false, error: "stopped" };
        continue;
      }
      if (engine === "gateway") {
        let r = null;
        try { r = await fetchTts(clean.slice(0, GATEWAY_MAX_TEXT)); } catch (err) { log(`tts gateway: ${err && err.message}`); }
        if (!current || current.id !== id) return { ok: false, error: "stopped" };
        if (r && r.status === 200 && r.buffer && r.buffer.byteLength > 44) {
          // Real audio → the character window plays it and lip-syncs to its loudness.
          toCharacter("javis-speech", { action: "audio", id, audio: r.buffer, contentType: r.contentType || "audio/wav" });
          emit({ text: clean, seconds });
          return { ok: true, engine };
        }
        continue;
      }
      toCharacter("javis-speech", { action: "system", id, text: clean, lang: "vi-VN", seconds });
      emit({ text: clean, seconds });
      return { ok: true, engine: "system" };
    }
    current = null;
    emit({});
    return { ok: false, error: "no_voice" };
  }

  /** The character window reports the end of audio / system speech. */
  function ended(id) { finish(id); }

  return { speak, stop, ended, isSpeaking: () => !!current, engine: () => (current ? current.engine : null) };
}

module.exports = { BSAY_VOICE, ENGINE_LABEL, bsayCandidates, findBsay, voicePlan, createSpeaker };
