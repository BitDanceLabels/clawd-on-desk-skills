// src/desk/hologram-desk.js — the JAVIS girl as a particle hologram on a
// transparent desktop window.
//
// Ported from bumbee-be-den src/hologram.js (point cloud sampled from the chosen
// character image, head turns, voice breathing, orange heart core). The desk
// version drops the sky/mountains/bloom (the desktop is the background) and adds
// an idle budget: fewer particles and frames when nobody is interacting.
import * as THREE from "three";

const FIGURE_HEIGHT = 3.1;
const FIGURE_BOTTOM = -1.55;
const MAX_POINTS = 26000;
const CORE_POINTS = 1400;
const CHARACTER_SRC = "hologram/character.jpg";

export const Palettes = Object.freeze({
  cyan: { primary: "#5fe7ff", secondary: "#2a5bff", core: "#ff8a2a" },
  violet: { primary: "#c89bff", secondary: "#5a2dff", core: "#ff5fa8" },
  gold: { primary: "#ffe3a0", secondary: "#ff8f2e", core: "#ff4d1f" },
});

const figureVertex = /* glsl */ `
  uniform float uTime, uIntro, uAudio, uBass, uSize, uPixelRatio, uThinking, uAlert;
  uniform float uHeadYaw, uHeadPitch, uNeckY;
  uniform vec3 uCorePos;
  attribute vec3 aStart;
  attribute vec4 aSeed;
  attribute float aLum, aCore, aHead;
  varying float vLum, vCore, vAlpha, vScan;

  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }

  void main() {
    float t = uTime;
    vec3 p = position;
    vec3 pivot = vec3(0.0, uNeckY, 0.0);
    p = mix(p, rotX(rotY(p - pivot, uHeadYaw), uHeadPitch) + pivot, aHead);
    p += 0.006 * vec3(sin(t * 1.3 + aSeed.x * 40.0), sin(t * 1.7 + aSeed.y * 40.0), sin(t * 1.1 + aSeed.z * 40.0));

    // Voice: radial breathing plus a wave travelling up the body.
    vec3 radial = normalize(vec3(p.x, (p.y - uCorePos.y) * 0.35, p.z) + 1e-4);
    float rise = sin(p.y * 7.0 - t * 7.5) * 0.5 + 0.5;
    p += radial * uAudio * (0.02 + 0.07 * rise) * (0.4 + aSeed.y) * (1.0 - aCore);

    if (aCore > 0.5) {
      vec3 local = p - uCorePos;
      local = rotY(local, t * (0.6 + uThinking * 2.4) * (aSeed.w - 0.5) * 2.0);
      p = uCorePos + local * (1.0 + uBass * 0.9 + uAlert * 0.25 * (0.5 + 0.5 * sin(t * 6.0)) + 0.1 * sin(t * 3.1));
    }

    // Intro: particles swirl in from a cloud around the figure.
    float k = clamp((uIntro - aSeed.x * 0.55) / 0.45, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    vec3 s = rotY(aStart, (1.0 - k) * (4.0 + aSeed.w * 3.0) + t * 0.4 * (1.0 - k));
    vec3 finalP = mix(s, p, k);

    vec4 mv = modelViewMatrix * vec4(finalP, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = uSize * (0.55 + aSeed.z * 0.9) * (1.0 + aCore * 0.6 + uAudio * 0.4);
    gl_PointSize = size * uPixelRatio / -mv.z;

    vLum = aLum;
    vCore = aCore;
    vScan = smoothstep(0.045, 0.0, abs(fract(finalP.y * 0.32 - t * (0.21 + uThinking * 0.5)) - 0.5));
    float flicker = 0.8 + 0.2 * sin(t * (2.0 + aSeed.w * 6.0) + aSeed.x * 30.0);
    vAlpha = (0.15 + 0.85 * k) * flicker;
  }
`;

const figureFragment = /* glsl */ `
  uniform vec3 uColorA, uColorB, uCore;
  uniform float uOpacity, uAudio;
  varying float vLum, vCore, vAlpha, vScan;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, r);
    soft *= soft;
    vec3 color = mix(uColorB, uColorA, clamp(pow(vLum, 0.85) * 1.25, 0.0, 1.0));
    color += uColorA * (vScan * 0.9 + uAudio * 0.25);
    color = mix(color, uCore * 1.1, vCore);
    // Dark points stay faint so eyes, lips and hair lines read as features.
    float alpha = soft * vAlpha * mix(0.1 + 0.9 * vLum * vLum, 0.6, vCore) * uOpacity;
    // Premultiplied output: additive glow on a transparent window.
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

function smoothstep(edge0, edge1, value) {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function randomInSphere(radius) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = radius * Math.cbrt(Math.random());
  return [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

function createPointBuffer(capacity) {
  return { count: 0, capacity, position: new Float32Array(capacity * 3), lum: new Float32Array(capacity), head: new Float32Array(capacity) };
}

function pushPoint(buffer, x, y, z, lum, head) {
  if (buffer.count >= buffer.capacity) return;
  const i = buffer.count++;
  buffer.position[i * 3] = x;
  buffer.position[i * 3 + 1] = y;
  buffer.position[i * 3 + 2] = z;
  buffer.lum[i] = lum;
  buffer.head[i] = head;
}

// Image → point cloud. Luminance + Sobel edges drive density; the dark background
// is keyed out by distance from the border colour; depth is faked from luminance
// plus a cylindrical bulge. Points are shuffled so any prefix (idle draw range) is
// an even sample of the whole figure.
function buildImageBust(image, capacity) {
  const sampleHeight = 360;
  const sampleWidth = Math.max(16, Math.min(360, Math.round(sampleHeight * image.naturalWidth / image.naturalHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
  const size = sampleWidth * sampleHeight;
  const lum = new Float32Array(size);
  for (let i = 0; i < size; i += 1) lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  let borderSum = 0;
  let borderCount = 0;
  for (let x = 0; x < sampleWidth; x += 1) { borderSum += lum[x] + lum[(sampleHeight - 1) * sampleWidth + x]; borderCount += 2; }
  for (let y = 0; y < sampleHeight; y += 1) { borderSum += lum[y * sampleWidth] + lum[y * sampleWidth + sampleWidth - 1]; borderCount += 2; }
  const background = borderSum / borderCount;
  const mask = new Float32Array(size);
  for (let i = 0; i < size; i += 1) mask[i] = smoothstep(0.06, 0.22, Math.abs(lum[i] - background));
  const edge = new Float32Array(size);
  let maxEdge = 1e-6;
  for (let y = 1; y < sampleHeight - 1; y += 1) {
    for (let x = 1; x < sampleWidth - 1; x += 1) {
      const at = (dx, dy) => lum[(y + dy) * sampleWidth + x + dx];
      const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      const value = Math.hypot(gx, gy);
      edge[y * sampleWidth + x] = value;
      if (value > maxEdge) maxEdge = value;
    }
  }
  const weight = new Float32Array(size);
  let totalWeight = 0;
  let minX = sampleWidth;
  let maxX = 0;
  let topY = sampleHeight;
  for (let i = 0; i < size; i += 1) {
    edge[i] /= maxEdge;
    weight[i] = mask[i] * (0.12 + 0.55 * lum[i] ** 0.8 + 1.1 * Math.min(1, edge[i] * 1.8));
    totalWeight += weight[i];
    if (mask[i] > 0.5) {
      const x = i % sampleWidth;
      const y = Math.floor(i / sampleWidth);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < topY) topY = y;
    }
  }
  if (totalWeight < 1 || maxX <= minX) return null;

  const buffer = createPointBuffer(capacity);
  const scale = FIGURE_HEIGHT / sampleHeight;
  const halfWidth = Math.max(1, (maxX - minX) / 2);
  const centerX = (minX + maxX) / 2;
  const perWeight = (capacity * 0.97) / totalWeight;
  const figureTop = FIGURE_BOTTOM + (sampleHeight - topY) * scale;
  const neckY = figureTop - (figureTop - FIGURE_BOTTOM) * 0.42;
  for (let i = 0; i < size && buffer.count < capacity; i += 1) {
    if (!weight[i]) continue;
    const expected = weight[i] * perWeight;
    let count = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    const px = i % sampleWidth;
    const py = Math.floor(i / sampleWidth);
    while (count-- > 0) {
      const sx = px + Math.random() - 0.5;
      const sy = py + Math.random() - 0.5;
      const x = (sx - centerX) * scale;
      const y = FIGURE_BOTTOM + (sampleHeight - sy) * scale;
      if (Math.random() > 0.1 + 0.9 * smoothstep(FIGURE_BOTTOM, FIGURE_BOTTOM + 0.8, y)) continue;
      const nx = Math.min(1, Math.abs(sx - centerX) / halfWidth);
      const z = (lum[i] - 0.5) * 0.38 + Math.sqrt(Math.max(0, 1 - nx * nx)) * 0.32 + (Math.random() - 0.5) * 0.03;
      pushPoint(buffer, x, y, z, Math.min(1, Math.max(lum[i] * 1.1, edge[i] * 1.6)), smoothstep(neckY - 0.08, neckY + 0.16, y));
    }
  }
  // The heart in the chosen portrait sits low on the chest (~24 % up the figure).
  const chestY = FIGURE_BOTTOM + (figureTop - FIGURE_BOTTOM) * 0.24;
  return { buffer, neckY, corePos: new THREE.Vector3(0, chestY, 0.42) };
}

// Fallback while the image loads (or if it is missing): a soft ellipsoid bust.
function buildFallbackBust(capacity) {
  const buffer = createPointBuffer(capacity);
  while (buffer.count < capacity) {
    const [x, y, z] = randomInSphere(1);
    const head = y > 0.25;
    const px = head ? x * 0.36 : x * 0.85;
    const py = head ? 0.95 + (y - 0.6) * 0.9 : -1.4 + (y + 1) * 1.1;
    pushPoint(buffer, px, py, z * 0.3, 0.4 + Math.random() * 0.5, head ? 1 : 0);
  }
  return { buffer, neckY: 0.42, corePos: new THREE.Vector3(0, -0.3, 0.3) };
}

function shuffleBuffer(buffer) {
  for (let i = buffer.count - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    for (let k = 0; k < 3; k += 1) {
      const t = buffer.position[i * 3 + k];
      buffer.position[i * 3 + k] = buffer.position[j * 3 + k];
      buffer.position[j * 3 + k] = t;
    }
    let t = buffer.lum[i]; buffer.lum[i] = buffer.lum[j]; buffer.lum[j] = t;
    t = buffer.head[i]; buffer.head[i] = buffer.head[j]; buffer.head[j] = t;
  }
}

function createFigureGeometry({ buffer, corePos }) {
  shuffleBuffer(buffer);
  const total = buffer.count + CORE_POINTS;
  const position = new Float32Array(total * 3);
  const start = new Float32Array(total * 3);
  const seed = new Float32Array(total * 4);
  const lum = new Float32Array(total);
  const core = new Float32Array(total);
  const head = new Float32Array(total);
  // Core points first so the heart is always inside the idle draw range.
  for (let i = 0; i < CORE_POINTS; i += 1) {
    const [x, y, z] = randomInSphere(0.15);
    const falloff = Math.random() ** 2.2;
    position.set([corePos.x + x * (0.4 + falloff * 1.6), corePos.y + y * (0.4 + falloff * 1.6), corePos.z + z * 0.6], i * 3);
    lum[i] = 1;
    core[i] = 1;
  }
  position.set(buffer.position.subarray(0, buffer.count * 3), CORE_POINTS * 3);
  lum.set(buffer.lum.subarray(0, buffer.count), CORE_POINTS);
  head.set(buffer.head.subarray(0, buffer.count), CORE_POINTS);
  for (let i = 0; i < total; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.2 + Math.random() * 3.4;
    start.set([Math.cos(angle) * radius, (Math.random() - 0.5) * 5.5, Math.sin(angle) * radius - 1], i * 3);
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  geometry.setAttribute("aLum", new THREE.BufferAttribute(lum, 1));
  geometry.setAttribute("aCore", new THREE.BufferAttribute(core, 1));
  geometry.setAttribute("aHead", new THREE.BufferAttribute(head, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 8);
  return geometry;
}

function createPad(color, count = 900) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = [0.95, 1.18, 1.42][i % 3] + (Math.random() - 0.5) * 0.03;
    positions.set([Math.cos(angle) * radius, FIGURE_BOTTOM - 0.02, Math.sin(angle) * radius * 0.4], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ size: 0.028, color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  return new THREE.Points(geometry, material);
}

/**
 * createDeskHologram(canvas) → controller
 *   setState("idle" | "listening" | "thinking" | "speaking" | "alert")
 *   setAudioLevel(0..1)   mic / TTS level
 *   setGaze(x, y)          -1..1, head follows the pointer
 *   setActive(bool)        interaction budget (full particles + 60 fps)
 *   setPalette(name)
 *   playIntro(), destroy()
 */
export function createDeskHologram(canvas, { palette = "cyan", onReady, intro = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.0, 7.0);
  const lookTarget = new THREE.Vector3(0, -0.12, 0);

  const uniforms = {
    uTime: { value: 0 },
    uIntro: { value: 0 },
    uAudio: { value: 0 },
    uBass: { value: 0 },
    uSize: { value: 30 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uOpacity: { value: 1 },
    uThinking: { value: 0 },
    uAlert: { value: 0 },
    uHeadYaw: { value: 0 },
    uHeadPitch: { value: 0 },
    uNeckY: { value: 0.32 },
    uCorePos: { value: new THREE.Vector3(0, -0.32, 0.36) },
    uColorA: { value: new THREE.Color() },
    uColorB: { value: new THREE.Color() },
    uCore: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: figureVertex,
    fragmentShader: figureFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const group = new THREE.Group();
  scene.add(group);
  const pad = createPad("#5fe7ff");
  scene.add(pad);
  let figure = null;

  function setFigure(build) {
    if (figure) {
      group.remove(figure);
      figure.geometry.dispose();
    }
    figure = new THREE.Points(createFigureGeometry(build), material);
    figure.frustumCulled = false;
    group.add(figure);
    uniforms.uNeckY.value = build.neckY;
    uniforms.uCorePos.value.copy(build.corePos);
  }
  setFigure(buildFallbackBust(6000));
  const image = new Image();
  image.decoding = "async";
  image.src = CHARACTER_SRC;
  image.decode().then(() => {
    const build = buildImageBust(image, MAX_POINTS);
    if (build) {
      setFigure(build);
      if (intro) introStartedAt = performance.now();
    }
    if (onReady) onReady();
  }).catch(() => { if (onReady) onReady(); });

  function setPalette(name) {
    const p = Palettes[name] || Palettes.cyan;
    uniforms.uColorA.value.set(p.primary);
    uniforms.uColorB.value.set(p.secondary);
    uniforms.uCore.value.set(p.core);
    pad.material.color.set(p.primary);
  }
  setPalette(palette);

  let state = "idle";
  let audioLevel = 0;
  let audio = 0;
  let gazeX = 0;
  let gazeY = 0;
  let headYaw = 0;
  let headPitch = 0;
  let active = true;
  let lastActiveAt = performance.now();
  let introStartedAt = intro ? performance.now() : -1e9;
  let lastFrameAt = 0;
  let width = 0;
  let height = 0;
  let raf = 0;
  let destroyed = false;

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uniforms.uPixelRatio.value = renderer.getPixelRatio() * Math.min(1.4, Math.max(0.6, h / 520));
  }

  // Idle budget: after 20 s without interaction or sound, draw ~45 % of the points
  // at ~20 fps; hidden window → no frames at all.
  function budget(now) {
    const busy = active || state !== "idle" || audio > 0.02 || now - lastActiveAt < 20000 || now - introStartedAt < 4000;
    return busy ? { fps: 60, share: 1 } : { fps: 20, share: 0.45 };
  }

  function frame(now) {
    raf = 0;
    if (destroyed) return;
    if (document.hidden) return; // resumed by visibilitychange
    const { fps, share } = budget(now);
    if (now - lastFrameAt < 1000 / fps - 2) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, (now - (lastFrameAt || now)) / 1000);
    lastFrameAt = now;
    resize();
    const t = now / 1000;
    uniforms.uTime.value = t;
    uniforms.uIntro.value = Math.min(1.25, (now - introStartedAt) / 2600);
    const targetAudio = state === "speaking" || state === "listening" ? Math.min(1, audioLevel * 1.6) : 0;
    audio = THREE.MathUtils.lerp(audio, targetAudio, targetAudio > audio ? 0.45 : 0.12);
    uniforms.uAudio.value = audio;
    uniforms.uBass.value = THREE.MathUtils.lerp(uniforms.uBass.value, state === "speaking" ? audio * 0.8 : 0, 0.3);
    uniforms.uThinking.value = THREE.MathUtils.lerp(uniforms.uThinking.value, state === "thinking" ? 1 : 0, 0.05);
    uniforms.uAlert.value = THREE.MathUtils.lerp(uniforms.uAlert.value, state === "alert" ? 1 : 0, 0.05);
    uniforms.uOpacity.value = state === "listening" ? 1.1 + Math.sin(t * 4) * 0.08 : 1;
    headYaw = THREE.MathUtils.lerp(headYaw, gazeX * 0.5, 0.06);
    headPitch = THREE.MathUtils.lerp(headPitch, -gazeY * 0.25, 0.06);
    uniforms.uHeadYaw.value = headYaw;
    uniforms.uHeadPitch.value = headPitch;
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, gazeX * 0.15 + Math.sin(t * 0.35) * 0.04, 0.03);
    group.position.y = Math.sin(t * 1.2) * 0.03;
    pad.rotation.y += dt * (0.25 + uniforms.uThinking.value * 1.2);
    if (figure) {
      const count = figure.geometry.attributes.position.count;
      figure.geometry.setDrawRange(0, Math.max(CORE_POINTS, Math.floor(count * share)));
    }
    camera.lookAt(lookTarget);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && !destroyed && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const onVisibility = () => kick();
  document.addEventListener("visibilitychange", onVisibility);
  kick();

  return {
    setState(next) { state = next || "idle"; lastActiveAt = performance.now(); kick(); },
    get state() { return state; },
    setAudioLevel(level) { audioLevel = Math.max(0, Math.min(1, Number(level) || 0)); },
    setGaze(x, y) { gazeX = Math.max(-1, Math.min(1, x)); gazeY = Math.max(-1, Math.min(1, y)); },
    setActive(next) { active = !!next; if (active) lastActiveAt = performance.now(); kick(); },
    setPalette,
    playIntro() { introStartedAt = performance.now(); kick(); },
    stats() { return { points: figure ? figure.geometry.attributes.position.count : 0, drawn: figure ? figure.geometry.drawRange.count : 0, ...budget(performance.now()) }; },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      if (figure) figure.geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
