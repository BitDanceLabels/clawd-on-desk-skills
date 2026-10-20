// src/javis-speech-renderer.js — character window side of "Thư ký" (0.12.0).
// Plays the report voice and moves Hiyori's mouth with it; shows the small
// "có việc mới" note. Main decides when (Sleep/DND is respected there).
(function () {
  "use strict";
  const api = window.electronAPI;
  if (!api || !api.onJavisSpeech) return;

  let current = null; // { id, stop() }
  let raf = 0;

  const setMouth = (v) => {
    const r = window.ClawdLive2DRenderer;
    if (r && r.setMouth) r.setMouth(v);
  };

  // Speech-like rhythm (~4.5 syllables/s, phrase swell, short pauses) when only the
  // duration is known (bsay plays the audio itself; system voice has no level meter).
  function envelope(ms) {
    const t = ms / 1000;
    const syll = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.5 * t);
    const phrase = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.6 * t + 1);
    const pause = (t % 3.2) > 2.85 ? 0 : 1;
    return Math.max(0, Math.min(1, syll * phrase * pause));
  }

  function stopAll(notify) {
    const c = current;
    current = null;
    cancelAnimationFrame(raf);
    setMouth(0);
    if (c) {
      try { c.stop(); } catch {}
      if (notify) api.javisSpeechEnded(c.id);
    }
  }

  function animate(fn) {
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const step = (now) => {
      if (!current) return;
      setMouth(fn(now - t0));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function rhythm(id, seconds, onTimeout) {
    current = { id, stop: () => {} };
    animate(envelope);
    if (seconds > 0) {
      const timer = setTimeout(() => { if (current && current.id === id) { onTimeout ? onTimeout() : stopAll(true); } }, seconds * 1000 + 600);
      current.stop = () => clearTimeout(timer);
    }
  }

  async function playAudio(id, bytes, contentType) {
    const ctx = new AudioContext();
    let buf;
    try {
      const ab = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      buf = await ctx.decodeAudioData(ab);
    } catch (err) {
      console.warn("[javis-speech] cannot decode audio", contentType, err);
      ctx.close();
      api.javisSpeechEnded(id);
      return;
    }
    if (!current || current.id !== id) { ctx.close(); return; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    const data = new Float32Array(analyser.fftSize);
    let smooth = 0;
    src.onended = () => { if (current && current.id === id) stopAll(true); };
    current.stop = () => { try { src.onended = null; src.stop(); } catch {} ctx.close(); };
    src.start();
    // Lip-sync to the real loudness of the voice.
    animate(() => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      smooth = smooth * 0.55 + Math.min(1, rms * 7) * 0.45;
      return smooth < 0.04 ? 0 : smooth;
    });
  }

  function speakSystem(id, text, lang, seconds) {
    const synth = window.speechSynthesis;
    if (!synth) { rhythm(id, seconds); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || "vi-VN";
    const voice = synth.getVoices().find((v) => /^vi/i.test(v.lang));
    if (voice) u.voice = voice;
    u.rate = 1;
    // No level meter for system speech: mouth follows the speech rhythm until it ends.
    rhythm(id, seconds + 4, () => { synth.cancel(); stopAll(true); });
    const prevStop = current.stop;
    current.stop = () => { prevStop(); synth.cancel(); };
    u.onend = () => { if (current && current.id === id) stopAll(true); };
    u.onerror = () => { if (current && current.id === id) stopAll(true); };
    synth.speak(u);
  }

  api.onJavisSpeech((msg) => {
    if (!msg) return;
    if (msg.action === "stop") {
      if (!current || current.id === msg.id || msg.id == null) stopAll(false);
      return;
    }
    stopAll(false);
    if (msg.action === "audio") {
      current = { id: msg.id, stop: () => {} };
      void playAudio(msg.id, msg.audio, msg.contentType);
    } else if (msg.action === "mouth") {
      rhythm(msg.id, msg.seconds || 0, () => setMouth(0));
    } else if (msg.action === "system") {
      speakSystem(msg.id, msg.text, msg.lang, msg.seconds || 0);
    }
  });

  // Small note above the character ("Anh ơi, có 2 việc mới chờ anh").
  const note = document.getElementById("javis-note");
  let noteTimer = null;
  if (note && api.onJavisNote) {
    api.onJavisNote((n) => {
      if (!n || !n.text) return;
      note.textContent = n.text;
      note.hidden = false;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { note.hidden = true; }, Math.max(3000, Math.min(15000, n.ms || 7000)));
    });
  }
})();
