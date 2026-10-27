// src/desk/voice-input.js — record one utterance from the mic as 16 kHz mono WAV.
// Stops on click, after ~1.5 s of silence once speech was heard, or at 20 s.
// Reports the input level so the hologram breathes with the owner's voice.

const TARGET_RATE = 16000;
const MAX_MS = 20000;
const SILENCE_MS = 1500;
const SPEECH_LEVEL = 0.06;

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i += 1) view.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0, o = 44; i < samples.length; i += 1, o += 2) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function downsample(chunks, fromRate) {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }
  if (fromRate === TARGET_RATE) return merged;
  const ratio = fromRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += merged[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** recordUtterance({ onLevel }) → { stop(), done: Promise<{ base64, ms, heardSpeech }> } */
export function recordUtterance({ onLevel = () => {} } = {}) {
  let stopRequested = false;
  let stopFn = () => { stopRequested = true; };
  const done = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const startedAt = performance.now();
    let lastVoiceAt = 0;
    let heardSpeech = false;
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        processor.onaudioprocess = null;
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        onLevel(0);
        const samples = downsample(chunks, ctx.sampleRate);
        resolve({ base64: toBase64(encodeWav(samples, TARGET_RATE)), ms: performance.now() - startedAt, heardSpeech });
      };
      stopFn = finish;
      if (stopRequested) return finish();
      processor.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data));
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
        const level = Math.min(1, Math.sqrt(sum / data.length) * 6);
        onLevel(level);
        const now = performance.now();
        if (level > SPEECH_LEVEL) { lastVoiceAt = now; heardSpeech = true; }
        if (now - startedAt > MAX_MS || (heardSpeech && now - lastVoiceAt > SILENCE_MS)) finish();
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    });
  })();
  return { stop: () => stopFn(), done };
}
