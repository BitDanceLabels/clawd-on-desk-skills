// portrait-avatar.js — nhân vật JAVIS 2.5D realtime (thay bé hologram hạt sáng, 01/11/2026).
// Ảnh chân dung + bộ khẩu hình (MuseTalk 1.5, dựng sẵn) + mắt nhắm, ghép trên canvas 2D:
// thở, nghiêng đầu, nhìn theo chuột/khuôn mặt, chớp mắt, nhép môi theo mức âm của giọng nói.
// Không WebGL, không gọi mạng ngoài thư mục nhân vật → chạy được desktop, web, iPhone, kể cả máy yếu.
//
// API giữ giống createDeskHologram để thay 1 dòng:
//   setState("idle"|"listening"|"thinking"|"speaking"|"alert"), setAudioLevel(0..1), setGaze(x,y),
//   setActive(bool), setPalette(), playIntro(), stats(), destroy()  + setCharacter(id), character()

export const CHARACTERS = Object.freeze([
  { id: "mai", name: "Mai", note: "áo dài trắng" },
  { id: "linh", name: "Linh", note: "công sở" },
  { id: "an", name: "An", note: "3D hoạt hình" },
  { id: "vy", name: "Vy", note: "3D digital human" },
]);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("không tải được " + src));
    img.src = src;
  });
}

export async function loadCharacter(root, id) {
  const base = `${root.replace(/\/$/, "")}/${id}/`;
  const meta = await (await fetch(base + "meta.json")).json();
  const [img, eyes, ...mouths] = await Promise.all([
    loadImage(base + "base.webp"),
    loadImage(base + "eyes.webp"),
    ...meta.mouth.levels.map((_, k) => loadImage(`${base}mouth-${String(k).padStart(2, "0")}.webp`)),
  ]);
  return { id, meta, img, eyes, mouths };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{root?: string, character?: string, fit?: "bust"|"cover", fade?: boolean, onReady?: Function, onError?: Function}} opts
 */
export function createPortraitAvatar(canvas, opts = {}) {
  const root = opts.root || "nhan-vat";
  const fit = opts.fit || "bust";
  const fade = opts.fade !== false;
  const ctx = canvas.getContext("2d", { alpha: true });
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ch = null;
  let state = "idle";
  let active = false;
  let level = 0; // mức âm thô
  let mouth = 0; // mức miệng đã làm mượt
  let gx = 0, gy = 0, sgx = 0, sgy = 0;
  let blinkAt = performance.now() + 1800;
  let blinkStart = -1;
  let doubleBlink = false;
  let raf = 0;
  let destroyed = false;
  let frames = 0, lastFpsAt = performance.now(), fps = 0;
  let introAt = performance.now();
  let lastLevelAt = 0;

  async function setCharacter(id) {
    try {
      const next = await loadCharacter(root, id);
      if (destroyed) return;
      ch = next;
      canvas.dataset.character = id;
      introAt = performance.now();
      if (opts.onReady) opts.onReady(ch);
      kick();
    } catch (err) {
      if (opts.onError) opts.onError(err);
      else console.warn("JAVIS nhân vật:", err && err.message);
    }
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function scheduleBlink(now) {
    blinkAt = now + 2200 + Math.random() * 4200;
    doubleBlink = Math.random() < 0.18;
  }

  function blinkAlpha(now) {
    if (blinkStart < 0 && now >= blinkAt) { blinkStart = now; scheduleBlink(now); }
    if (blinkStart < 0) return 0;
    const d = now - blinkStart;
    const len = 150;
    if (d < len) return Math.sin((d / len) * Math.PI);
    if (doubleBlink && d > len + 90 && d < len * 2 + 90) return Math.sin(((d - len - 90) / len) * Math.PI);
    if (d > len * 2 + 120 || !doubleBlink) { blinkStart = -1; }
    return 0;
  }

  function draw(now) {
    raf = 0;
    if (destroyed) return;
    resize();
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!ch) { kick(); return; }
    const m = ch.meta;
    const t = now / 1000;

    // âm thanh → miệng: mở nhanh, khép chậm hơn một chút cho tự nhiên; im lặng >250ms thì khép hẳn
    if (now - lastLevelAt > 250) level = 0;
    // trần 0,78: bỏ 2 mức mở to nhất (nhìn bè, lệch mặt)
    const target = Math.min(0.78, Math.max(0, (level - 0.05) * 1.9));
    mouth += (target - mouth) * (target > mouth ? 0.55 : 0.28);
    sgx += (gx - sgx) * 0.08; sgy += (gy - sgy) * 0.08;

    // khung: "bust" = lấy khuôn mặt + vai làm tâm; "cover" = phủ kín
    const face = m.face;
    let scale, ox, oy;
    if (fit === "cover") {
      scale = Math.max(W / m.w, H / m.h);
      ox = (W - m.w * scale) / 2; oy = (H - m.h * scale) / 2;
    } else {
      scale = Math.max(W / m.w, H / (face.h * 3.9));
      ox = W / 2 - face.cx * scale;
      oy = H * 0.43 - face.cy * scale;
      oy = Math.min(0, Math.max(H - m.h * scale, oy));
      ox = Math.min(0, Math.max(W - m.w * scale, ox));
    }

    const amp = reduced ? 0 : 1;
    const thinking = state === "thinking";
    const breath = Math.sin(t * (thinking ? 1.2 : 1.5)) * 0.0045 * amp;
    const sway = (Math.sin(t * 0.63) * 0.006 + Math.sin(t * 0.27) * 0.004) * amp;
    const tilt = sway + sgx * 0.03 + (thinking ? 0.02 : 0) + (state === "speaking" ? Math.sin(t * 2.3) * 0.004 * amp : 0);
    const intro = Math.min(1, (now - introAt) / 600);
    const ease = 1 - Math.pow(1 - intro, 3);

    ctx.save();
    ctx.globalAlpha = ease;
    // xoay quanh cổ (dưới cằm) để giống người nghiêng đầu
    const px = face.cx * scale + ox, py = (face.cy + face.h * 0.95) * scale + oy;
    ctx.translate(px + sgx * W * 0.012, py + sgy * H * 0.008 - breath * H * 0.5 + (1 - ease) * H * 0.03);
    ctx.rotate(tilt);
    ctx.scale(1 + breath, 1 + breath);
    ctx.translate(-px, -py);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(ch.img, ox, oy, m.w * scale, m.h * scale);

    // miệng: trộn 2 mức kề nhau
    const n = ch.mouths.length;
    const pos = mouth * (n - 1);
    const k0 = Math.floor(pos), k1 = Math.min(n - 1, k0 + 1), f = pos - k0;
    const mx = ox + m.mouth.x * scale, my = oy + m.mouth.y * scale, mw = m.mouth.w * scale, mh = m.mouth.h * scale;
    // luôn phủ lớp miệng (kể cả lúc im = mức 0) để mặt lúc nói và lúc nghỉ là cùng một người
    {
      ctx.globalAlpha = ease;
      ctx.drawImage(ch.mouths[k0], mx, my, mw, mh);
      if (f > 0.02 && k1 !== k0) { ctx.globalAlpha = ease * f; ctx.drawImage(ch.mouths[k1], mx, my, mw, mh); }
    }
    // mắt
    const b = blinkAlpha(now);
    if (b > 0.01) {
      ctx.globalAlpha = ease * b;
      ctx.drawImage(ch.eyes, ox + m.eyes.x * scale, oy + m.eyes.y * scale, m.eyes.w * scale, m.eyes.h * scale);
    }
    ctx.restore();

    if (fade) {
      // mờ dần đáy khung để nhân vật "nổi" trên màn hình
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      const g = ctx.createLinearGradient(0, H * 0.78, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      ctx.restore();
    }

    frames++;
    if (now - lastFpsAt > 1000) { fps = frames; frames = 0; lastFpsAt = now; }
    kick();
  }

  function kick() {
    if (raf || destroyed) return;
    if (typeof document !== "undefined" && document.hidden) return;
    raf = requestAnimationFrame(draw);
  }
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);

  setCharacter(opts.character || "mai");

  return {
    setCharacter,
    character: () => (ch ? ch.id : null),
    setState(next) { state = next || "idle"; canvas.dataset.state = state; kick(); },
    setAudioLevel(v) { level = Math.max(0, Math.min(1, Number(v) || 0)); lastLevelAt = performance.now(); },
    setGaze(x, y) { gx = Math.max(-1, Math.min(1, Number(x) || 0)); gy = Math.max(-1, Math.min(1, Number(y) || 0)); },
    setActive(v) { active = !!v; },
    setPalette() {},
    playIntro() { introAt = performance.now(); kick(); },
    stats: () => ({ fps, character: ch ? ch.id : null, mouth: Math.round(mouth * 100) / 100, active }),
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    },
  };
}
