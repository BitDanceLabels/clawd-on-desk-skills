// src/desk/live2d/live2d-desk.ts — nhân vật Live2D kiểu VTuber cho JAVIS desk (25/11/2026).
//
// Dùng Cubism Web Framework chính chủ (5-r.4, ./framework, Live2D Open Software License) +
// Cubism Core (assets/live2d/core, tải trước bằng <script>). Model mặc định: Mao (Live2D Inc.
// sample, Free Material License) — 16 nhóm vật lý tóc/mũ/áo choàng/dây áo.
//
// Hành vi: đầu + mắt + thân nhìn theo con trỏ (toàn màn hình, main gửi toạ độ), chớp mắt, thở,
// idle motion, vật lý, bấm vào thì có động tác nhỏ, khẩu hình theo âm lượng khi JAVIS nói.
// Nhẹ máy: vòng vẽ hẹn giờ đúng FPS chọn (24/30/60, mặc định 30) — không thức theo mọi vsync;
// dừng hẳn khi cửa sổ ẩn/bị che/khoá màn hình/pin yếu (pause reasons), nghỉ 20 FPS khi con
// trỏ đứng yên lâu. Giao diện giống hologram/portrait cũ để desk.js thay thế 1-1.

import { CubismFramework, Option, LogLevel } from "./framework/live2dcubismframework";
import { CubismUserModel } from "./framework/model/cubismusermodel";
import { CubismModelSettingJson } from "./framework/cubismmodelsettingjson";
import { ICubismModelSetting } from "./framework/icubismmodelsetting";
import { CubismMatrix44 } from "./framework/math/cubismmatrix44";
import { CubismEyeBlink } from "./framework/effect/cubismeyeblink";
import { BreathParameterData, CubismBreath } from "./framework/effect/cubismbreath";
import { CubismDefaultParameterId } from "./framework/cubismdefaultparameterid";
import { CubismIdHandle } from "./framework/id/cubismid";
import { csmVector } from "./framework/type/csmvector";
import { csmMap } from "./framework/type/csmmap";
import { ACubismMotion } from "./framework/motion/acubismmotion";
import { CubismMotion } from "./framework/motion/cubismmotion";

declare const Live2DCubismCore: any;

const PRIORITY_IDLE = 1;
const PRIORITY_NORMAL = 2;
const PRIORITY_FORCE = 3;

let frameworkReady = false;
function startFramework(): void {
  if (frameworkReady) return;
  if (typeof Live2DCubismCore === "undefined") throw new Error("Cubism Core chưa tải");
  const option = new Option();
  option.logFunction = (m: string) => console.warn("[live2d]", m);
  option.loggingLevel = LogLevel.LogLevel_Warning;
  CubismFramework.startUp(option);
  CubismFramework.initialize();
  frameworkReady = true;
}

async function fetchBuf(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.arrayBuffer();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`ảnh lỗi ${url}`));
    img.src = url;
  });
}

const id = (name: string): CubismIdHandle => CubismFramework.getIdManager().getId(name);

/** Một model đã nạp đủ (moc, vật lý, pose, biểu cảm, chuyển động, texture). */
class DeskModel extends CubismUserModel {
  setting!: ICubismModelSetting;
  dir = "";
  motions = new Map<string, CubismMotion>();
  expressions = new Map<string, ACubismMotion>();
  eyeBlinkIds = new csmVector<CubismIdHandle>();
  lipSyncIds = new csmVector<CubismIdHandle>();
  textures: WebGLTexture[] = [];
  gazeX = 0;
  gazeY = 0;
  mouth = 0;
  tilt = 0;
  p = {
    angleX: id(CubismDefaultParameterId.ParamAngleX),
    angleY: id(CubismDefaultParameterId.ParamAngleY),
    angleZ: id(CubismDefaultParameterId.ParamAngleZ),
    bodyX: id(CubismDefaultParameterId.ParamBodyAngleX),
    eyeX: id(CubismDefaultParameterId.ParamEyeBallX),
    eyeY: id(CubismDefaultParameterId.ParamEyeBallY),
    breath: id(CubismDefaultParameterId.ParamBreath),
    mouthOpen: id(CubismDefaultParameterId.ParamMouthOpenY),
  };

  async load(dir: string, file: string, gl: WebGLRenderingContext, maxTexture: number): Promise<void> {
    this.dir = dir;
    const json = await fetchBuf(dir + file);
    const s = (this.setting = new CubismModelSettingJson(json, json.byteLength));
    const moc = await fetchBuf(dir + s.getModelFileName());
    this.loadModel(moc, false);
    if (!this._model) throw new Error("moc3 không nạp được (Core quá cũ?)");

    for (let i = 0; i < s.getExpressionCount(); i++) {
      const buf = await fetchBuf(dir + s.getExpressionFileName(i));
      const exp = this.loadExpression(buf, buf.byteLength, s.getExpressionName(i));
      if (exp) this.expressions.set(s.getExpressionName(i), exp);
    }
    if (s.getPhysicsFileName()) {
      const buf = await fetchBuf(dir + s.getPhysicsFileName());
      this.loadPhysics(buf, buf.byteLength);
    }
    if (s.getPoseFileName()) {
      const buf = await fetchBuf(dir + s.getPoseFileName());
      this.loadPose(buf, buf.byteLength);
    }
    if (s.getEyeBlinkParameterCount() > 0) this._eyeBlink = CubismEyeBlink.create(s);
    for (let i = 0; i < s.getEyeBlinkParameterCount(); i++) this.eyeBlinkIds.pushBack(s.getEyeBlinkParameterId(i));
    for (let i = 0; i < s.getLipSyncParameterCount(); i++) this.lipSyncIds.pushBack(s.getLipSyncParameterId(i));

    // Thở: biên độ nhỏ hơn mẫu SDK một chút cho dáng ngồi bàn làm việc, nhịp lệch nhau để không đều như máy.
    this._breath = CubismBreath.create();
    const b = new csmVector<BreathParameterData>();
    b.pushBack(new BreathParameterData(this.p.angleX, 0, 9, 6.5345, 0.5));
    b.pushBack(new BreathParameterData(this.p.angleY, 0, 5, 3.5345, 0.5));
    b.pushBack(new BreathParameterData(this.p.angleZ, 0, 6, 5.5345, 0.5));
    b.pushBack(new BreathParameterData(this.p.bodyX, 0, 3, 15.5345, 0.5));
    b.pushBack(new BreathParameterData(this.p.breath, 0.5, 0.5, 3.2345, 1));
    this._breath.setParameters(b);

    // Chuyển động: nạp sẵn hết (vài chục KB) để bấm là chạy ngay, không chờ mạng/đĩa.
    for (let gi = 0; gi < s.getMotionGroupCount(); gi++) {
      const group = s.getMotionGroupName(gi);
      for (let i = 0; i < s.getMotionCount(group); i++) {
        const buf = await fetchBuf(dir + s.getMotionFileName(group, i));
        const m = this.loadMotion(buf, buf.byteLength, `${group}_${i}`, undefined, undefined, s, group, i);
        if (m) {
          m.setEffectIds(this.eyeBlinkIds, this.lipSyncIds);
          this.motions.set(`${group}_${i}`, m);
        }
      }
    }

    // Khung: model cao 2 đơn vị, căn giữa. Phóng/khung do khung chiếu (projection) ở ngoài.
    const layout = new csmMap<string, number>();
    s.getLayoutMap(layout);
    this._modelMatrix.setupFromLayout(layout);

    this.createRenderer(1);
    const r = this.getRenderer();
    r.startUp(gl);
    r.setIsPremultipliedAlpha(true);
    // Canvas WebGL này chỉ nhân vật dùng → bỏ lưu/khôi phục ~20 trạng thái GL mỗi khung
    // (mỗi gl.getParameter là 1 lần gọi đồng bộ sang tiến trình GPU; đo trên M4: tốn nhất sau Core).
    (r as any).saveProfile = () => {};
    (r as any).restoreProfile = () => {};
    for (let i = 0; i < s.getTextureCount(); i++) {
      const img = await loadImage(dir + s.getTextureFileName(i));
      const tex = createTexture(gl, img, maxTexture);
      this.textures.push(tex);
      r.bindTexture(i, tex);
    }
    this._model.saveParameters();
    this.setInitialized(true);
    this.setUpdating(false);
  }

  startMotion(group: string, index: number, priority: number): boolean {
    const m = this.motions.get(`${group}_${index}`);
    if (!m) return false;
    if (priority === PRIORITY_FORCE) this._motionManager.setReservePriority(priority);
    else if (!this._motionManager.reserveMotion(priority)) return false;
    this._motionManager.startMotionPriority(m, false, priority);
    return true;
  }

  randomMotion(group: string, priority: number, pick?: (n: number) => number): boolean {
    const n = this.setting.getMotionCount(group);
    if (!n) return false;
    const i = pick ? pick(n) : Math.floor(Math.random() * n);
    return this.startMotion(group, i, priority);
  }

  setExpression(name: string | null): void {
    if (!name) { this._expressionManager.stopAllMotions(); return; }
    const e = this.expressions.get(name);
    if (e) this._expressionManager.startMotion(e, false);
  }

  hitArea(x: number, y: number): string | null {
    const s = this.setting;
    for (let i = 0; i < s.getHitAreasCount(); i++) {
      if (this.isHit(s.getHitAreaId(i), x, y)) return s.getHitAreaName(i);
    }
    return null;
  }

  step(dt: number): void {
    const model = this._model;
    this._dragManager.update(dt);
    const dx = this._dragManager.getX();
    const dy = this._dragManager.getY();

    model.loadParameters();
    let motionUpdated = false;
    if (this._motionManager.isFinished()) this.randomMotion("Idle", PRIORITY_IDLE);
    else motionUpdated = this._motionManager.updateMotion(model, dt);
    model.saveParameters();

    if (!motionUpdated && this._eyeBlink) this._eyeBlink.updateParameters(model, dt);
    if (this._expressionManager) this._expressionManager.updateMotion(model, dt);

    // Nhìn theo con trỏ: đầu ±30°, thân ±10°, mắt ±1 (mẫu VTuber: đầu theo, thân theo nhẹ, mắt theo nhanh nhất).
    model.addParameterValueById(this.p.angleX, dx * 30);
    model.addParameterValueById(this.p.angleY, dy * 30);
    model.addParameterValueById(this.p.angleZ, dx * dy * -30 + this.tilt);
    model.addParameterValueById(this.p.bodyX, dx * 10);
    model.addParameterValueById(this.p.eyeX, dx);
    model.addParameterValueById(this.p.eyeY, dy);

    if (this._breath) this._breath.updateParameters(model, dt);
    if (this._physics) this._physics.evaluate(model, dt);

    if (this.mouth > 0.001) {
      for (let i = 0; i < this.lipSyncIds.getSize(); i++) model.addParameterValueById(this.lipSyncIds.at(i), this.mouth, 0.8);
    }
    if (this._pose) this._pose.updateParameters(model, dt);
    model.update();
  }

  draw(gl: WebGLRenderingContext, projection: CubismMatrix44, w: number, h: number): void {
    const m = new CubismMatrix44();
    m.setMatrix(projection.getArray());
    m.multiplyByMatrix(this._modelMatrix);
    const r = this.getRenderer();
    r.setMvpMatrix(m);
    r.setRenderState(null as unknown as WebGLFramebuffer, [0, 0, w, h]); // khung mặc định, không hỏi GPU
    r.drawModel();
  }

  dispose(gl: WebGLRenderingContext): void {
    for (const t of this.textures) gl.deleteTexture(t);
    this.textures = [];
    try { this.release(); } catch {}
  }
}

function createTexture(gl: WebGLRenderingContext, img: HTMLImageElement, maxSize: number): WebGLTexture {
  let source: TexImageSource = img;
  // Trần texture (mặc định 2048): ảnh lớn hơn thì thu nhỏ 1 lần lúc nạp.
  const limit = Math.min(maxSize, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
  if (img.width > limit || img.height > limit) {
    const k = limit / Math.max(img.width, img.height);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    source = c;
  }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/** Model đóng gói sẵn (Live2D Inc. sample, Free Material License) + khung hình nửa người trên. */
export const LIVE2D_MODELS: Record<string, { dir: string; file: string; zoom: number; offsetY: number; smallTaps: number }> = {
  mao: { dir: "live2d/mao/", file: "Mao.model3.json", zoom: 1.75, offsetY: -0.4, smallTaps: 3 },
  hiyori: { dir: "live2d/hiyori/", file: "Hiyori.model3.json", zoom: 2.15, offsetY: -0.52, smallTaps: 10 },
};

export interface Live2DOptions {
  model?: string;
  dir?: string;
  file?: string;
  fps?: number;
  maxTexture?: number;
  /** Khung hình: phóng (1 = cả người) và dịch dọc (đơn vị model) — Mao để thấy nửa người trên. */
  zoom?: number;
  offsetY?: number;
  onReady?: () => void;
  onError?: (err: Error) => void;
}

export function createDeskLive2D(canvas: HTMLCanvasElement, opts: Live2DOptions = {}) {
  const modelId = LIVE2D_MODELS[opts.model || ""] ? (opts.model as string) : "mao";
  const cfg = LIVE2D_MODELS[modelId];
  const dir = opts.dir || cfg.dir;
  const file = opts.file || cfg.file;
  const zoom = opts.zoom ?? cfg.zoom;
  const offsetY = opts.offsetY ?? cfg.offsetY;
  let fps = [24, 30, 60].includes(Number(opts.fps)) ? Number(opts.fps) : 30;

  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false, powerPreference: "low-power" }) as WebGLRenderingContext | null;
  if (!gl) throw new Error("WebGL không có");
  startFramework();

  let model: DeskModel | null = null;
  let destroyed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let raf = 0;
  let lastStep = 0;
  let lastInput = performance.now();
  let level = 0;
  let levelAt = 0;
  let state = "idle";
  const pauses = new Set<string>();
  // Số đo: FPS thật, thời gian CPU mỗi khung (update + draw), khung trễ (giật).
  const perf = { frames: 0, fps: 0, windowAt: performance.now(), cpu: [] as number[], late: 0, total: 0, gaps: [] as number[] };

  function size(): { w: number; h: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w, h };
  }

  function projection(w: number, h: number): CubismMatrix44 {
    const m = new CubismMatrix44();
    // Giữ tỉ lệ: trục ngang co theo khung dọc của cửa sổ nhân vật.
    m.scale(zoom * (h / w), zoom);
    m.translateY(offsetY * zoom);
    return m;
  }

  function effectiveFps(now: number): number {
    // Con trỏ đứng yên > 20 s, không nói, không động tác bấm → nghỉ 20 FPS (tóc vẫn đung đưa mềm).
    const calm = now - lastInput > 20000 && level < 0.01 && state === "idle";
    return calm ? Math.min(fps, 20) : fps;
  }

  function frame() {
    raf = 0;
    if (destroyed || pauses.size || !model) return;
    const now = performance.now();
    const interval = 1000 / effectiveFps(now);
    // rAF đến sớm hơn nhịp (máy 120 Hz) → chờ vsync sau, không vẽ thừa.
    if (lastStep && now - lastStep < interval - 6) { raf = requestAnimationFrame(frame); return; }
    const dt = lastStep ? Math.min((now - lastStep) / 1000, 0.1) : 1 / fps;
    if (lastStep) {
      const gap = now - lastStep;
      perf.gaps.push(gap);
      if (perf.gaps.length > 300) perf.gaps.shift();
      if (gap > interval * 1.5 + 4) perf.late++;
      perf.total++;
    }
    lastStep = now;

    // Khẩu hình: âm lượng → mở miệng, mở nhanh khép chậm, tự khép nếu 250 ms không có số mới.
    const target = now - levelAt > 250 ? 0 : Math.min(1, level * 1.6);
    model.mouth += (target - model.mouth) * (target > model.mouth ? 0.55 : 0.25);

    const { w, h } = size();
    gl!.viewport(0, 0, w, h);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    model.step(dt);
    model.draw(gl!, projection(w, h), w, h);
    const cpu = performance.now() - now;
    perf.cpu.push(cpu);
    if (perf.cpu.length > 300) perf.cpu.shift();
    perf.frames++;
    if (now - perf.windowAt >= 1000) { perf.fps = Math.round((perf.frames * 1000) / (now - perf.windowAt)); perf.frames = 0; perf.windowAt = now; }
    schedule(interval - (performance.now() - now));
  }

  // Ngủ gần hết khoảng chờ rồi mới xin rAF: rAF rơi đúng vsync kế tiếp → nhịp đều (30 FPS = mỗi 2 vsync
  // ở 60 Hz), mà không thức dậy mỗi vsync 60/120 Hz. Chừa 12 ms (> nửa vsync) để timer trễ vẫn kịp.
  function schedule(delay: number) {
    if (destroyed || pauses.size || timer || raf) return;
    const wait = delay - 12;
    if (wait <= 0) { raf = requestAnimationFrame(frame); return; }
    timer = setTimeout(() => { timer = null; raf = requestAnimationFrame(frame); }, wait);
  }
  function stopLoop() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    lastStep = 0;
  }
  function setPaused(reason: string, on: boolean) {
    if (on) { pauses.add(reason); stopLoop(); }
    else { pauses.delete(reason); schedule(0); }
  }

  const onVis = () => setPaused("hidden", document.hidden);
  document.addEventListener("visibilitychange", onVis);
  if (document.hidden) pauses.add("hidden");
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setPaused("context", true); });
  canvas.addEventListener("webglcontextrestored", () => { opts.onError && opts.onError(new Error("webgl context restored — reload")); });

  const m = new DeskModel();
  m.load(dir, file, gl, opts.maxTexture || 2048).then(() => {
    if (destroyed) { m.dispose(gl); return; }
    model = m;
    // Mở màn: chào bằng 1 động tác nhẹ.
    model.startMotion("TapBody", 0, PRIORITY_NORMAL);
    schedule(0);
    opts.onReady && opts.onReady();
  }).catch((err) => {
    console.warn("JAVIS live2d:", err && err.message);
    opts.onError && opts.onError(err);
  });

  // Toạ độ canvas (px CSS) → toạ độ model (để hit-test).
  function toModel(clientX: number, clientY: number): [number, number] | null {
    if (!model) return null;
    const r = canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((clientY - r.top) / r.height) * 2 - 1);
    const { w, h } = { w: r.width, h: r.height };
    const sx = zoom * (h / w);
    const sy = zoom;
    return [nx / sx, ny / sy - offsetY];
  }

  return {
    kind: "live2d",
    character: () => modelId,
    setCharacter() {},
    setState(next: string) {
      state = next || "idle";
      if (!model) return;
      // Nghiêng đầu nhẹ khi nghe/nghĩ — như người đang chú ý.
      model.tilt = state === "listening" ? 6 : state === "thinking" ? -5 : 0;
    },
    setAudioLevel(v: number) { level = Math.max(0, Math.min(1, Number(v) || 0)); levelAt = performance.now(); if (level > 0.02) lastInput = levelAt; },
    /** x, y ∈ [-1, 1], trục y hướng xuống (toạ độ màn hình). */
    setGaze(x: number, y: number) {
      const gx = Math.max(-1, Math.min(1, Number(x) || 0));
      const gy = Math.max(-1, Math.min(1, Number(y) || 0));
      if (model) {
        const ox = model.gazeX, oy = model.gazeY;
        if (Math.abs(gx - ox) > 0.002 || Math.abs(gy - oy) > 0.002) lastInput = performance.now();
        model.gazeX = gx; model.gazeY = gy;
        model.setDragging(gx, -gy);
      }
    },
    setActive() {},
    setPalette() {},
    playIntro() { if (model) model.startMotion("TapBody", 0, PRIORITY_NORMAL); },
    /** Bấm vào nhân vật: động tác nhỏ (đầu → biểu cảm + gật, thân → 1 chuyển động TapBody). */
    tap(clientX: number, clientY: number): string | null {
      if (!model) return null;
      lastInput = performance.now();
      const p = toModel(clientX, clientY);
      const area = p ? model.hitArea(p[0], p[1]) : null;
      // Phần lớn là động tác nhỏ (mtn_02..04); thỉnh thoảng 1 màn ảo thuật (special_*).
      model.randomMotion("TapBody", PRIORITY_NORMAL, (n) => (Math.random() < 0.2 ? Math.floor(Math.random() * n) : Math.floor(Math.random() * Math.min(cfg.smallTaps, n))));
      if (area === "Head") {
        const names = [...model.expressions.keys()];
        if (names.length) model.setExpression(names[Math.floor(Math.random() * names.length)]);
      }
      return area || "Body";
    },
    /** Con trỏ có nằm trên người nhân vật không (đầu/thân) — ngoài đó cửa sổ để chuột xuyên qua. */
    hitTest(clientX: number, clientY: number): boolean {
      if (!model) return true;
      const p = toModel(clientX, clientY);
      return !!(p && model.hitArea(p[0], p[1]));
    },
    setFps(n: number) { if ([24, 30, 60].includes(Number(n))) fps = Number(n); },
    fps: () => fps,
    setPaused,
    paused: () => [...pauses],
    ready: () => !!model,
    stats() {
      const cpu = perf.cpu.slice().sort((a, b) => a - b);
      const gaps = perf.gaps.slice().sort((a, b) => a - b);
      const q = (arr: number[], p: number) => (arr.length ? Math.round(arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] * 100) / 100 : 0);
      return {
        kind: "live2d", character: modelId, fps: perf.fps, targetFps: fps, paused: [...pauses],
        cpuMsAvg: cpu.length ? Math.round((cpu.reduce((a, b) => a + b, 0) / cpu.length) * 100) / 100 : 0,
        cpuMsP95: q(cpu, 0.95), frameGapP50: q(gaps, 0.5), frameGapP95: q(gaps, 0.95), frameGapMax: q(gaps, 1),
        lateFrames: perf.late, frames: perf.total, mouth: model ? Math.round(model.mouth * 100) / 100 : 0,
        canvas: [canvas.width, canvas.height],
      };
    },
    resetStats() { perf.cpu = []; perf.gaps = []; perf.late = 0; perf.total = 0; },
    destroy() {
      destroyed = true;
      stopLoop();
      document.removeEventListener("visibilitychange", onVis);
      if (model) model.dispose(gl!);
      model = null;
    },
  };
}
