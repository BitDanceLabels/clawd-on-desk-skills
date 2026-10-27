//#region src/companion/rig/live2d.ts
var e = {
	emotion: {
		neutral: { add: {} },
		happy: {
			motion: {
				group: "Idle",
				index: 7
			},
			add: {
				ParamEyeLSmile: .6,
				ParamEyeRSmile: .6,
				ParamMouthForm: .8,
				ParamCheek: .5
			}
		},
		excited: {
			motion: {
				group: "Idle",
				index: 3
			},
			add: {
				ParamEyeLSmile: .9,
				ParamEyeRSmile: .9,
				ParamMouthForm: 1,
				ParamCheek: .8,
				ParamBrowLY: .5,
				ParamBrowRY: .5
			}
		},
		thinking: {
			motion: {
				group: "Idle",
				index: 0
			},
			add: {
				ParamAngleZ: 8,
				ParamBrowLForm: -.4,
				ParamBrowRForm: -.4,
				ParamMouthForm: -.3
			}
		},
		sad: {
			motion: {
				group: "Idle",
				index: 8
			},
			add: {
				ParamBrowLForm: -1,
				ParamBrowRForm: -1,
				ParamBrowLY: -.4,
				ParamBrowRY: -.4,
				ParamMouthForm: -1
			},
			eye: .8
		},
		surprised: {
			motion: {
				group: "TapBody",
				index: 0
			},
			add: {
				ParamBrowLY: 1,
				ParamBrowRY: 1
			},
			eye: 1.15
		},
		focused: {
			add: {
				ParamBrowLForm: -.5,
				ParamBrowRForm: -.5,
				ParamBrowLY: -.2,
				ParamBrowRY: -.2
			},
			eye: .88
		},
		sleepy: {
			add: {
				ParamAngleY: -8,
				ParamBrowLY: -.3,
				ParamBrowRY: -.3
			},
			eye: .45
		},
		listening: { add: {
			ParamAngleZ: -6,
			ParamBrowLY: .3,
			ParamBrowRY: .3
		} }
	},
	gesture: {
		wave: {
			group: "Idle",
			index: 6
		},
		celebrate: {
			group: "Idle",
			index: 4
		},
		dance: {
			group: "Idle",
			index: 4
		},
		point: {
			group: "TapBody",
			index: 0
		},
		think: {
			group: "Idle",
			index: 0
		},
		bow: {
			group: "Idle",
			index: 2
		}
	}
}, t = {
	stage: {
		top: .005,
		height: .6,
		cx: .5
	},
	portrait: {
		cx: .5,
		cy: .19,
		d: .22
	}
}, n = 3;
function r() {
	let e = globalThis;
	return e.JAVIS_LIVE2D_BASE ? e.JAVIS_LIVE2D_BASE.replace(/\/?$/, "/") : ({
		BASE_URL: "/",
		DEV: !1,
		MODE: "production",
		PROD: !0,
		SSR: !1
	}.BASE_URL || "/").replace(/\/?$/, "/") + "live2d/";
}
var i = null, a = "";
function o(e) {
	return window.Live2DCubismCore ? Promise.resolve() : new Promise((t, n) => {
		let r = document.createElement("script");
		r.src = e + "live2dcubismcore.min.js", r.async = !0, r.onload = () => t(), r.onerror = () => {
			r.remove(), n(/* @__PURE__ */ Error("Không tải được Live2D Cubism Core"));
		}, document.head.appendChild(r);
	});
}
var s = 0;
function c(e = r()) {
	return i || (s >= 3 ? Promise.reject(/* @__PURE__ */ Error("Live2D: đã thử 3 lần, dừng")) : (s++, a = e, i = o(e).then(() => Promise.all([
		import("./javis-companion-lazy-lib-BEBkEh7I.js").then((e) => e.t),
		import("./javis-companion-lazy-lib--KqWq4Q4.js"),
		import("./javis-companion-lazy-cubism4.es-BXUs6ltv.js")
	])).then(([e, t, n]) => ({
		core: e,
		display: t,
		l2d: n
	})).catch((e) => {
		throw i = null, e;
	}), i));
}
var l = class i {
	renderer;
	stage;
	model;
	base = {
		x: 0,
		y: 0,
		s: 1
	};
	overlay = {};
	eye = 1;
	cur = null;
	lastEmotion = "neutral";
	lastGesture = null;
	t = 0;
	snapId;
	onSnapshot;
	destroyed = !1;
	canvas;
	host;
	portrait;
	framing;
	constructor(e, t, n, r, i, a, o) {
		this.host = n, this.portrait = r, this.framing = i;
		let s = Math.max(1, n.clientWidth || (r ? 64 : 176)), c = Math.max(1, n.clientHeight || (r ? 64 : 264)), l = Math.min(2, globalThis.devicePixelRatio || 1);
		this.renderer = new e.core.Renderer({
			width: s,
			height: c,
			backgroundAlpha: 0,
			antialias: !0,
			resolution: l,
			autoDensity: !0,
			powerPreference: "low-power"
		}), this.canvas = this.renderer.view, this.canvas.className = "jc-l2d", this.canvas.setAttribute("aria-hidden", "true"), this.canvas.style.cssText = "width:100%;height:100%;display:block", this.stage = new e.display.Container(), this.model = t, this.stage.addChild(t), this.onSnapshot = o, this.snapId = !!o, this.fit(s, c);
		let u = this.model.internalModel;
		a && (u.motionManager.groups.idle = "__none__", u.breath = void 0), u.on("beforeModelUpdate", this.applyParams);
	}
	static async create(e, n) {
		let o = await c(n.base), s = /^(https?:)?\//.test(n.model) ? n.model : (n.base || a || r()) + n.model, l = await o.l2d.Live2DModel.from(s, {
			autoUpdate: !1,
			autoHitTest: !1,
			autoFocus: !1
		});
		return new i(o, l, e, n.portrait, n.framing || t, n.reduced, n.onSnapshot);
	}
	fit(e, t) {
		let n = this.model.internalModel, r = n.originalWidth, i = n.originalHeight;
		if (this.portrait) {
			let n = this.framing.portrait, a = e / (n.d * i);
			this.base = {
				s: a,
				x: e / 2 - n.cx * r * a,
				y: t / 2 - n.cy * i * a
			};
		} else {
			let n = this.framing.stage, a = t / (n.height * i);
			this.base = {
				s: a,
				x: e / 2 - n.cx * r * a,
				y: -n.top * i * a
			};
		}
		this.model.scale.set(this.base.s), this.model.position.set(this.base.x, this.base.y);
	}
	resize() {
		let e = this.host.clientWidth, t = this.host.clientHeight;
		e && t && (this.renderer.resize(e, t), this.fit(e, t));
	}
	play(e) {
		e && this.model.motion(e.group, e.index, n);
	}
	applyParams = () => {
		let e = this.cur;
		if (!e) return;
		let t = this.model.internalModel.coreModel;
		for (let [e, n] of Object.entries(this.overlay)) Math.abs(n) > .001 && t.addParameterValueById(e, n);
		let n = e.gesture;
		if (n && !e.reduced) {
			let e = Math.sin(Math.PI * Math.min(1, n.p));
			n.g === "nod" && t.addParameterValueById("ParamAngleY", -Math.abs(Math.sin(n.p * Math.PI * 2)) * 22), n.g === "shake" && t.addParameterValueById("ParamAngleX", Math.sin(n.p * Math.PI * 4) * 24 * e), n.g === "bow" && (t.addParameterValueById("ParamAngleY", -20 * e), t.addParameterValueById("ParamBodyAngleY", -6 * e)), n.g === "think" && t.addParameterValueById("ParamAngleZ", 10 * e);
		}
		this.eye !== 1 && (t.multiplyParameterValueById("ParamEyeLOpen", this.eye), t.multiplyParameterValueById("ParamEyeROpen", this.eye)), (e.speaking || e.mouth > .03) && (t.setParameterValueById("ParamMouthOpenY", Math.min(1, e.mouth * 1.6)), t.addParameterValueById("ParamMouthForm", .3));
	};
	frame(t) {
		if (this.destroyed) return;
		this.cur = t, this.t += t.dt, t.emotion !== this.lastEmotion && (this.lastEmotion = t.emotion, t.reduced || this.play(e.emotion[t.emotion].motion));
		let n = t.gesture?.g ?? null;
		n !== this.lastGesture && (this.lastGesture = n, n && !t.reduced && this.play(e.gesture[n]));
		let r = e.emotion[t.emotion], i = 1 - Math.exp(-(t.dt || .016) / .25), a = /* @__PURE__ */ new Set([...Object.keys(this.overlay), ...Object.keys(r.add)]);
		for (let e of a) this.overlay[e] = (this.overlay[e] || 0) + ((r.add[e] || 0) - (this.overlay[e] || 0)) * i;
		this.eye += ((r.eye ?? 1) * t.lid - this.eye) * i, this.model.internalModel.focusController.focus(t.lookX, -t.lookY);
		let o = 0;
		t.gesture && !t.reduced && (t.gesture.g === "celebrate" || t.gesture.g === "dance") && (o = -Math.abs(Math.sin(t.gesture.p * Math.PI * 4)) * (this.portrait ? 3 : 10)), this.model.position.set(this.base.x, this.base.y + o), this.model.update(Math.max(1, t.dt * 1e3)), this.renderer.render(this.stage);
		let s = this.canvas;
		s.jcStats = {
			frames: (s.jcStats?.frames || 0) + 1,
			mouth: t.speaking || t.mouth > .03 ? Math.min(1, t.mouth * 1.6) : 0
		}, this.snapId && this.t > 1.2 && this.trySnapshot();
	}
	trySnapshot() {
		if (!(this.model.internalModel.coreModel.getParameterValueById("ParamEyeLOpen") < .85 || this.cur && this.cur.mouth > .05)) {
			try {
				let e = document.createElement("canvas");
				e.width = e.height = 128, e.getContext("2d").drawImage(this.canvas, 0, 0, 128, 128);
				let t = e.toDataURL("image/webp", .9);
				t.startsWith("data:image/webp") || (t = e.toDataURL("image/png")), this.onSnapshot?.(t);
			} catch {}
			this.snapId = !1;
		}
	}
	destroy() {
		if (!this.destroyed) {
			this.destroyed = !0;
			try {
				this.model.internalModel.off("beforeModelUpdate", this.applyParams);
			} catch {}
			this.stage.destroy({
				children: !0,
				texture: !0,
				baseTexture: !0
			}), this.renderer.destroy(!0);
		}
	}
};
//#endregion
export { l as Live2DLayer };
