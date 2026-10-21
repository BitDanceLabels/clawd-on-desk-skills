import { D as e, T as t, _ as n, a as r, f as i, g as a, h as o, i as s, l as c, n as l, o as u, r as d, u as f, v as p, w as m, x as h } from "./javis-companion-lazy-lib-FoDFHkt2.js";
import { Container as g } from "./javis-companion-lazy-lib-hCuWBK0s.js";
//#region node_modules/@pixi/mesh/lib/MeshBatchUvs.mjs
var _ = class {
	constructor(e, t) {
		this.uvBuffer = e, this.uvMatrix = t, this.data = null, this._bufferUpdateId = -1, this._textureUpdateId = -1, this._updateID = 0;
	}
	update(e) {
		if (!e && this._bufferUpdateId === this.uvBuffer._updateID && this._textureUpdateId === this.uvMatrix._updateID) return;
		this._bufferUpdateId = this.uvBuffer._updateID, this._textureUpdateId = this.uvMatrix._updateID;
		let t = this.uvBuffer.data;
		(!this.data || this.data.length !== t.length) && (this.data = new Float32Array(t.length)), this.uvMatrix.multiplyUvs(t, this.data), this._updateID++;
	}
}, v = new i(), y = new f(), b = class e extends g {
	constructor(e, n, r, i = t.TRIANGLES) {
		super(), this.geometry = e, this.shader = n, this.state = r || p.for2d(), this.drawMode = i, this.start = 0, this.size = 0, this.uvs = null, this.indices = null, this.vertexData = /* @__PURE__ */ new Float32Array(1), this.vertexDirty = -1, this._transformID = -1, this._roundPixels = m.ROUND_PIXELS, this.batchUvs = null;
	}
	get geometry() {
		return this._geometry;
	}
	set geometry(e) {
		this._geometry !== e && (this._geometry && (this._geometry.refCount--, this._geometry.refCount === 0 && this._geometry.dispose()), this._geometry = e, this._geometry && this._geometry.refCount++, this.vertexDirty = -1);
	}
	get uvBuffer() {
		return this.geometry.buffers[1];
	}
	get verticesBuffer() {
		return this.geometry.buffers[0];
	}
	set material(e) {
		this.shader = e;
	}
	get material() {
		return this.shader;
	}
	set blendMode(e) {
		this.state.blendMode = e;
	}
	get blendMode() {
		return this.state.blendMode;
	}
	set roundPixels(e) {
		this._roundPixels !== e && (this._transformID = -1), this._roundPixels = e;
	}
	get roundPixels() {
		return this._roundPixels;
	}
	get tint() {
		return "tint" in this.shader ? this.shader.tint : null;
	}
	set tint(e) {
		this.shader.tint = e;
	}
	get tintValue() {
		return this.shader.tintValue;
	}
	get texture() {
		return "texture" in this.shader ? this.shader.texture : null;
	}
	set texture(e) {
		this.shader.texture = e;
	}
	_render(n) {
		let r = this.geometry.buffers[0].data;
		this.shader.batchable && this.drawMode === t.TRIANGLES && r.length < e.BATCHABLE_SIZE * 2 ? this._renderToBatch(n) : this._renderDefault(n);
	}
	_renderDefault(e) {
		let t = this.shader;
		t.alpha = this.worldAlpha, t.update && t.update(), e.batch.flush(), t.uniforms.translationMatrix = this.transform.worldTransform.toArray(!0), e.shader.bind(t), e.state.set(this.state), e.geometry.bind(this.geometry, t), e.geometry.draw(this.drawMode, this.size, this.start, this.geometry.instanceCount);
	}
	_renderToBatch(e) {
		let t = this.geometry, n = this.shader;
		n.uvMatrix && (n.uvMatrix.update(), this.calculateUvs()), this.calculateVertices(), this.indices = t.indexBuffer.data, this._tintRGB = n._tintRGB, this._texture = n.texture;
		let r = this.material.pluginName;
		e.batch.setObjectRenderer(e.plugins[r]), e.plugins[r].render(this);
	}
	calculateVertices() {
		let e = this.geometry.buffers[0], t = e.data, n = e._updateID;
		if (n === this.vertexDirty && this._transformID === this.transform._worldID) return;
		this._transformID = this.transform._worldID, this.vertexData.length !== t.length && (this.vertexData = new Float32Array(t.length));
		let r = this.transform.worldTransform, i = r.a, a = r.b, o = r.c, s = r.d, c = r.tx, l = r.ty, u = this.vertexData;
		for (let e = 0; e < u.length / 2; e++) {
			let n = t[e * 2], r = t[e * 2 + 1];
			u[e * 2] = i * n + o * r + c, u[e * 2 + 1] = a * n + s * r + l;
		}
		if (this._roundPixels) {
			let e = m.RESOLUTION;
			for (let t = 0; t < u.length; ++t) u[t] = Math.round(u[t] * e) / e;
		}
		this.vertexDirty = n;
	}
	calculateUvs() {
		let e = this.geometry.buffers[1], t = this.shader;
		t.uvMatrix.isSimple ? this.uvs = e.data : (this.batchUvs ||= new _(e, t.uvMatrix), this.batchUvs.update(), this.uvs = this.batchUvs.data);
	}
	_calculateBounds() {
		this.calculateVertices(), this._bounds.addVertexData(this.vertexData, 0, this.vertexData.length);
	}
	containsPoint(e) {
		if (!this.getBounds().contains(e.x, e.y)) return !1;
		this.worldTransform.applyInverse(e, v);
		let t = this.geometry.getBuffer("aVertexPosition").data, n = y.points, r = this.geometry.getIndex().data, i = r.length, a = this.drawMode === 4 ? 3 : 1;
		for (let e = 0; e + 2 < i; e += a) {
			let i = r[e] * 2, a = r[e + 1] * 2, o = r[e + 2] * 2;
			if (n[0] = t[i], n[1] = t[i + 1], n[2] = t[a], n[3] = t[a + 1], n[4] = t[o], n[5] = t[o + 1], y.contains(v.x, v.y)) return !0;
		}
		return !1;
	}
	destroy(e) {
		super.destroy(e), this._cachedTexture &&= (this._cachedTexture.destroy(), null), this.geometry = null, this.shader = null, this.state = null, this.uvs = null, this.indices = null, this.vertexData = null;
	}
};
b.BATCHABLE_SIZE = 100;
var x = b, S = class extends o {
	constructor(t, n, r) {
		super();
		let i = new a(t), o = new a(n, !0), s = new a(r, !0, !0);
		this.addAttribute("aVertexPosition", i, 2, !1, e.FLOAT).addAttribute("aTextureCoord", o, 2, !1, e.FLOAT).addIndex(s), this._updateId = -1;
	}
	get vertexDirtyId() {
		return this.buffers[0]._updateID;
	}
}, C = class extends r {
	constructor(e, t) {
		let n = {
			uSampler: e,
			alpha: 1,
			uTextureMatrix: c.IDENTITY,
			uColor: new Float32Array([
				1,
				1,
				1,
				1
			])
		};
		t = Object.assign({
			tint: 16777215,
			alpha: 1,
			pluginName: "batch"
		}, t), t.uniforms && Object.assign(n, t.uniforms), super(t.program || u.from("attribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\n\nuniform mat3 projectionMatrix;\nuniform mat3 translationMatrix;\nuniform mat3 uTextureMatrix;\n\nvarying vec2 vTextureCoord;\n\nvoid main(void)\n{\n    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n\n    vTextureCoord = (uTextureMatrix * vec3(aTextureCoord, 1.0)).xy;\n}\n", "varying vec2 vTextureCoord;\nuniform vec4 uColor;\n\nuniform sampler2D uSampler;\n\nvoid main(void)\n{\n    gl_FragColor = texture2D(uSampler, vTextureCoord) * uColor;\n}\n"), n), this._colorDirty = !1, this.uvMatrix = new d(e), this.batchable = t.program === void 0, this.pluginName = t.pluginName, this._tintColor = new h(t.tint), this._tintRGB = this._tintColor.toLittleEndianNumber(), this._colorDirty = !0, this.alpha = t.alpha;
	}
	get texture() {
		return this.uniforms.uSampler;
	}
	set texture(e) {
		this.uniforms.uSampler !== e && (!this.uniforms.uSampler.baseTexture.alphaMode != !e.baseTexture.alphaMode && (this._colorDirty = !0), this.uniforms.uSampler = e, this.uvMatrix.texture = e);
	}
	set alpha(e) {
		e !== this._alpha && (this._alpha = e, this._colorDirty = !0);
	}
	get alpha() {
		return this._alpha;
	}
	set tint(e) {
		e !== this.tint && (this._tintColor.setValue(e), this._tintRGB = this._tintColor.toLittleEndianNumber(), this._colorDirty = !0);
	}
	get tint() {
		return this._tintColor.value;
	}
	get tintValue() {
		return this._tintColor.toNumber();
	}
	update() {
		if (this._colorDirty) {
			this._colorDirty = !1;
			let e = this.texture.baseTexture.alphaMode;
			h.shared.setValue(this._tintColor).premultiply(this._alpha, e).toArray(this.uniforms.uColor);
		}
		this.uvMatrix.update() && (this.uniforms.uTextureMatrix = this.uvMatrix.mapCoord);
	}
}, w = class extends x {
	constructor(e = s.EMPTY, t, n, r, i) {
		let a = new S(t, n, r);
		a.getBuffer("aVertexPosition").static = !1;
		let o = new C(e);
		super(a, o, null, i), this.autoUpdate = !0;
	}
	get vertices() {
		return this.geometry.getBuffer("aVertexPosition").data;
	}
	set vertices(e) {
		this.geometry.getBuffer("aVertexPosition").data = e;
	}
	_render(e) {
		this.autoUpdate && this.geometry.getBuffer("aVertexPosition").update(), super._render(e);
	}
};
//#endregion
//#region src/companion/rig/mesh/rigData.ts
function T(e, t, n) {
	let [r, i] = e.grid, [a, o, s, c] = e.rect, [l, u, d, f] = e.uv, p = (r + 1) * (i + 1), m = new Float32Array(p * 2), h = new Float32Array(p * 2), g = new Uint16Array(r * i * 6);
	for (let e = 0; e <= i; e++) for (let p = 0; p <= r; p++) {
		let g = e * (r + 1) + p, _ = p / r, v = e / i;
		m[g * 2] = a + _ * s, m[g * 2 + 1] = o + v * c, h[g * 2] = (l + _ * d) / t, h[g * 2 + 1] = (u + v * f) / n;
	}
	let _ = 0;
	for (let e = 0; e < i; e++) for (let t = 0; t < r; t++) {
		let n = e * (r + 1) + t, i = n + 1, a = n + r + 1, o = a + 1;
		g[_++] = n, g[_++] = i, g[_++] = a, g[_++] = i, g[_++] = o, g[_++] = a;
	}
	return {
		pos: m,
		uv: h,
		idx: g,
		cols: r,
		rows: i
	};
}
function E(e, t) {
	return {
		angleX: Math.max(-1, Math.min(1, e.lookX * .9 + Math.sin(e.t * .37) * .08 * e.motion)),
		angleY: Math.max(-1, Math.min(1, e.lookY * .7)),
		angleZ: e.headRot,
		headY: e.headY * t,
		breath: e.breath,
		rootY: e.rootY * t,
		rootRot: e.rootRot,
		rootScale: e.rootScale,
		armRot: e.armRot,
		eyeOpen: e.eyeK,
		eyeClosed: e.eyeClosed,
		eyeBallX: e.lookX,
		eyeBallY: e.lookY,
		browY: e.browY * t,
		browRot: e.browRot,
		browAsym: e.browAsym * t,
		level: e.level
	};
}
var D = (e, t, n, r, i) => {
	let a = i * Math.PI / 180, o = Math.cos(a), s = Math.sin(a), c = e - n, l = t - r;
	return [n + c * o - l * s, r + c * s + l * o];
};
function O(e, t, n, r, i, a, o) {
	let [s, c] = e.pivots.neck, [, l] = e.pivots.waist, [u, d, f, p] = e.face, [m, h, g, _] = t.rect, v = t.role || "", y = t.center || [m + g / 2, h + _ / 2], b = t.group === "head" || t.group === "back", x = i.angleX * 7 * o, S = i.angleY * 5 * o, C = Math.max(.06, Math.min(1.12, i.eyeOpen)), w = i.eyeBallX * g * .11, T = i.eyeBallY * _ * .1, E = v === "browR" ? -1 : 1, O = v.startsWith("mouth:") ? 1 + i.level * .08 : 1;
	for (let o = 0; o < n.length; o += 2) {
		let m = n[o], g = n[o + 1];
		if (v === "eyeL" || v === "eyeR" || v === "irisL" || v === "irisR" ? (g = y[1] + (g - y[1]) * C, v[0] === "i" && (m += w, g += T * C)) : v === "browL" || v === "browR" ? ([m, g] = D(m, g, y[0], y[1], i.browRot * .5 * E), g += i.browY * 1.6 + (v === "browL" ? -i.browAsym : i.browAsym)) : O !== 1 && (m = y[0] + (m - y[0]) * O, g = y[1] + (g - y[1]) * (1 + i.level * .14)), t.group === "armR" && e.pivots.shoulderR && i.armRot && ([m, g] = D(m, g, e.pivots.shoulderR[0], e.pivots.shoulderR[1], i.armRot * .12 * Math.max(0, (g - e.pivots.shoulderR[1]) / _))), t.group === "armL" && e.pivots.shoulderL && i.armRot < -120 && ([m, g] = D(m, g, e.pivots.shoulderL[0], e.pivots.shoulderL[1], -i.armRot * .1 * Math.max(0, (g - e.pivots.shoulderL[1]) / _))), a && t.swing) {
			let e = Math.max(0, Math.min(1, (g - h) / _));
			m += a.x * e ** 1.6;
		}
		if (b) {
			let e = (m - u) / (f * 1.25), r = (g - d) / (p * 1.25), a = Math.max(0, 1 - e * e - r * r);
			m += x * (t.depth * .9 + a * .55) * 1, g += S * (t.depth * .8 + a * .45) * 1;
			let l = t.swing?.hang ? 1 - t.swing.hang * Math.max(0, Math.min(1, (n[o + 1] - h) / _)) : 1;
			[m, g] = D(m, g, s, c, i.angleZ * 1 * l), g += i.headY * 1;
		}
		let k = (l - Math.min(g, l)) * i.breath * .006;
		g -= k, (t.group === "body" || t.group === "armL" || t.group === "armR") && (m = s + (m - s) * (1 + i.breath * .004));
		let A = e.size[0] / 2, j = e.size[1];
		i.rootRot && ([m, g] = D(m, g, A, j, i.rootRot)), i.rootScale !== 1 && (g = j - (j - g) * i.rootScale), g += i.rootY, r[o] = m, r[o + 1] = g;
	}
}
function k(e, t, n, r, i, a) {
	let o = (t.swing?.amp ?? 10) * a, s = t.swing?.stiff ?? 1, c = (-n.angleZ / 10 - n.angleX * .6) * o + Math.sin(r * 1.3 + t.z) * o * .12 + (n.rootY ? Math.sin(r * 9) * o * .25 : 0), l = 60 * s, { x: u, v: d } = e, f = Math.min(i, .05) / 2;
	for (let e = 0; e < 2; e++) d += ((c - u) * l - d * 7) * f, u += d * f;
	return {
		x: u,
		v: d
	};
}
function A(e, t, n, r) {
	let i = e.role || "";
	return i === "eyeL" || i === "eyeR" || i === "irisL" || i === "irisR" ? +!t.eyeClosed : i === "closedL" || i === "closedR" ? +!!t.eyeClosed : i === "mouth:X" ? 1 : i.startsWith("mouth:") ? Math.max(0, Math.min(1, n[i.slice(6)] ?? 0)) : i === "blush" ? Math.max(0, Math.min(1, (r - .3) * 1.6)) : 1;
}
//#endregion
//#region src/companion/rig/mesh/meshView.ts
var j = /* @__PURE__ */ new Map();
function M(e) {
	let t = j.get(e);
	return t || (t = fetch(e).then((e) => {
		if (!e.ok) throw Error("rig " + e.status);
		return e.json();
	}), j.set(e, t), t.catch(() => j.delete(e))), t;
}
function N(e) {
	return new Promise((t, n) => {
		let r = new Image();
		r.crossOrigin = "anonymous", r.decoding = "async", r.onload = () => t(r), r.onerror = () => n(/* @__PURE__ */ Error("atlas " + e)), r.src = e;
	});
}
var P = null;
function F() {
	if (P !== null) return P;
	try {
		let e = document.createElement("canvas"), t = e.getContext("webgl2") || e.getContext("webgl");
		P = !!t, t?.getExtension("WEBGL_lose_context")?.loseContext();
	} catch {
		P = !1;
	}
	return P;
}
function I(e) {
	let [t, n, r] = e.frame.portrait, i = Math.min(r * 1.6, e.size[0]);
	return [
		t + r / 2 - i / 2,
		Math.max(0, n - r * .18),
		i,
		i
	];
}
var L = class {
	renderer;
	stage = new g();
	model = new g();
	live = [];
	ro = null;
	lastT = -1;
	s;
	triangles;
	host;
	rig;
	portrait;
	bust;
	constructor(e, t, n, r, i = !1) {
		this.host = e, this.rig = t, this.portrait = r, this.bust = !r && i;
		let a = document.createElement("canvas");
		a.className = "jc-mesh", a.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none", this.renderer = new l({
			view: a,
			backgroundAlpha: 0,
			antialias: !1,
			premultipliedAlpha: !0,
			powerPreference: "low-power",
			resolution: Math.min(2, devicePixelRatio || 1),
			autoDensity: !1,
			width: 2,
			height: 2
		}), this.s = t.size[0] / 320, this.stage.addChild(this.model);
		let o = 0;
		for (let e of [...t.parts].sort((e, t) => e.z - t.z)) {
			let r = T(e, t.atlas.w, t.atlas.h), i = new w(n, r.pos.slice(), r.uv, r.idx);
			i.autoUpdate = !0, this.model.addChild(i), this.live.push({
				p: e,
				mesh: i,
				base: r.pos,
				swing: e.swing ? {
					x: 0,
					v: 0
				} : null
			}), o += r.idx.length / 3;
		}
		this.triangles = o, getComputedStyle(e).position === "static" && (e.style.position = "relative"), e.appendChild(a), e.dataset.rig = "mesh", this.fit(), typeof ResizeObserver < "u" && (this.ro = new ResizeObserver(() => this.fit()), this.ro.observe(e));
	}
	fit() {
		let e = Math.max(2, this.host.clientWidth), t = Math.max(2, this.host.clientHeight);
		this.renderer.resize(e, t);
		let [n, r, i, a] = this.portrait ? this.rig.frame.portrait : this.bust ? I(this.rig) : this.rig.frame.stage, o = this.portrait || this.bust, s = o ? Math.max(e / i, t / a) : Math.min(e / i, t / a);
		this.model.scale.set(s), this.model.position.set((e - i * s) / 2 - n * s, (t - a * s) / (o ? 2 : 1) - r * s), this.lastT = -1;
	}
	apply(e) {
		let t = this.lastT < 0 ? 0 : Math.max(0, e.t - this.lastT);
		this.lastT = e.t;
		let n = E(e, this.s);
		for (let r of this.live) {
			r.swing &&= k(r.swing, r.p, n, e.t, t, this.s);
			let i = A(r.p, n, e.mouth, e.blush);
			r.mesh.visible = i > .01, r.mesh.alpha = i, r.mesh.visible && O(this.rig, r.p, r.base, r.mesh.vertices, n, r.swing, this.s);
		}
		this.renderer.render(this.stage);
	}
	destroy() {
		this.ro?.disconnect(), this.ro = null;
		let e = this.renderer.view;
		this.stage.destroy({ children: !0 }), this.renderer.destroy(!1), e.remove(), delete this.host.dataset.rig;
	}
};
async function R(e, t, r) {
	if (!t.rig) throw Error("nhân vật không có rig mesh");
	if (!F()) throw Error("không có WebGL");
	let i = new URL(t.rig, new URL(r.base, location.href)).href, a = await M(i + "rig.v1.json"), o = Math.max(e.clientWidth, e.clientHeight) * Math.min(2, devicePixelRatio || 1), c = await N(i + ((!r.portrait && o > a.frame.stage[3] * .6 && a.atlas.src[2048] ? a.atlas.src[2048] : a.atlas.src[1024]) || Object.values(a.atlas.src)[0]));
	return new L(e, a, new s(new n(c, { mipmap: 1 })), !!r.portrait, !!r.bust);
}
//#endregion
export { R as createMeshView };
