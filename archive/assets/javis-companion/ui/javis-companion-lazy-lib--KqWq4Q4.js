import { a as e, c as t, d as n, h as r, l as i, m as a, o, p as s, r as c, u as l } from "./javis-companion-lazy-lib-BEBkEh7I.js";
//#region node_modules/@pixi/display/lib/Bounds.mjs
var u = class {
	constructor() {
		this.minX = 1 / 0, this.minY = 1 / 0, this.maxX = -1 / 0, this.maxY = -1 / 0, this.rect = null, this.updateID = -1;
	}
	isEmpty() {
		return this.minX > this.maxX || this.minY > this.maxY;
	}
	clear() {
		this.minX = 1 / 0, this.minY = 1 / 0, this.maxX = -1 / 0, this.maxY = -1 / 0;
	}
	getRectangle(e) {
		return this.minX > this.maxX || this.minY > this.maxY ? o.EMPTY : (e ||= new o(0, 0, 1, 1), e.x = this.minX, e.y = this.minY, e.width = this.maxX - this.minX, e.height = this.maxY - this.minY, e);
	}
	addPoint(e) {
		this.minX = Math.min(this.minX, e.x), this.maxX = Math.max(this.maxX, e.x), this.minY = Math.min(this.minY, e.y), this.maxY = Math.max(this.maxY, e.y);
	}
	addPointMatrix(e, t) {
		let { a: n, b: r, c: i, d: a, tx: o, ty: s } = e, c = n * t.x + i * t.y + o, l = r * t.x + a * t.y + s;
		this.minX = Math.min(this.minX, c), this.maxX = Math.max(this.maxX, c), this.minY = Math.min(this.minY, l), this.maxY = Math.max(this.maxY, l);
	}
	addQuad(e) {
		let t = this.minX, n = this.minY, r = this.maxX, i = this.maxY, a = e[0], o = e[1];
		t = a < t ? a : t, n = o < n ? o : n, r = a > r ? a : r, i = o > i ? o : i, a = e[2], o = e[3], t = a < t ? a : t, n = o < n ? o : n, r = a > r ? a : r, i = o > i ? o : i, a = e[4], o = e[5], t = a < t ? a : t, n = o < n ? o : n, r = a > r ? a : r, i = o > i ? o : i, a = e[6], o = e[7], t = a < t ? a : t, n = o < n ? o : n, r = a > r ? a : r, i = o > i ? o : i, this.minX = t, this.minY = n, this.maxX = r, this.maxY = i;
	}
	addFrame(e, t, n, r, i) {
		this.addFrameMatrix(e.worldTransform, t, n, r, i);
	}
	addFrameMatrix(e, t, n, r, i) {
		let a = e.a, o = e.b, s = e.c, c = e.d, l = e.tx, u = e.ty, d = this.minX, f = this.minY, p = this.maxX, m = this.maxY, h = a * t + s * n + l, g = o * t + c * n + u;
		d = h < d ? h : d, f = g < f ? g : f, p = h > p ? h : p, m = g > m ? g : m, h = a * r + s * n + l, g = o * r + c * n + u, d = h < d ? h : d, f = g < f ? g : f, p = h > p ? h : p, m = g > m ? g : m, h = a * t + s * i + l, g = o * t + c * i + u, d = h < d ? h : d, f = g < f ? g : f, p = h > p ? h : p, m = g > m ? g : m, h = a * r + s * i + l, g = o * r + c * i + u, d = h < d ? h : d, f = g < f ? g : f, p = h > p ? h : p, m = g > m ? g : m, this.minX = d, this.minY = f, this.maxX = p, this.maxY = m;
	}
	addVertexData(e, t, n) {
		let r = this.minX, i = this.minY, a = this.maxX, o = this.maxY;
		for (let s = t; s < n; s += 2) {
			let t = e[s], n = e[s + 1];
			r = t < r ? t : r, i = n < i ? n : i, a = t > a ? t : a, o = n > o ? n : o;
		}
		this.minX = r, this.minY = i, this.maxX = a, this.maxY = o;
	}
	addVertices(e, t, n, r) {
		this.addVerticesMatrix(e.worldTransform, t, n, r);
	}
	addVerticesMatrix(e, t, n, r, i = 0, a = i) {
		let o = e.a, s = e.b, c = e.c, l = e.d, u = e.tx, d = e.ty, f = this.minX, p = this.minY, m = this.maxX, h = this.maxY;
		for (let e = n; e < r; e += 2) {
			let n = t[e], r = t[e + 1], g = o * n + c * r + u, _ = l * r + s * n + d;
			f = Math.min(f, g - i), m = Math.max(m, g + i), p = Math.min(p, _ - a), h = Math.max(h, _ + a);
		}
		this.minX = f, this.minY = p, this.maxX = m, this.maxY = h;
	}
	addBounds(e) {
		let t = this.minX, n = this.minY, r = this.maxX, i = this.maxY;
		this.minX = e.minX < t ? e.minX : t, this.minY = e.minY < n ? e.minY : n, this.maxX = e.maxX > r ? e.maxX : r, this.maxY = e.maxY > i ? e.maxY : i;
	}
	addBoundsMask(e, t) {
		let n = e.minX > t.minX ? e.minX : t.minX, r = e.minY > t.minY ? e.minY : t.minY, i = e.maxX < t.maxX ? e.maxX : t.maxX, a = e.maxY < t.maxY ? e.maxY : t.maxY;
		if (n <= i && r <= a) {
			let e = this.minX, t = this.minY, o = this.maxX, s = this.maxY;
			this.minX = n < e ? n : e, this.minY = r < t ? r : t, this.maxX = i > o ? i : o, this.maxY = a > s ? a : s;
		}
	}
	addBoundsMatrix(e, t) {
		this.addFrameMatrix(t, e.minX, e.minY, e.maxX, e.maxY);
	}
	addBoundsArea(e, t) {
		let n = e.minX > t.x ? e.minX : t.x, r = e.minY > t.y ? e.minY : t.y, i = e.maxX < t.x + t.width ? e.maxX : t.x + t.width, a = e.maxY < t.y + t.height ? e.maxY : t.y + t.height;
		if (n <= i && r <= a) {
			let e = this.minX, t = this.minY, o = this.maxX, s = this.maxY;
			this.minX = n < e ? n : e, this.minY = r < t ? r : t, this.maxX = i > o ? i : o, this.maxY = a > s ? a : s;
		}
	}
	pad(e = 0, t = e) {
		this.isEmpty() || (this.minX -= e, this.maxX += e, this.minY -= t, this.maxY += t);
	}
	addFramePad(e, t, n, r, i, a) {
		e -= i, t -= a, n += i, r += a, this.minX = this.minX < e ? this.minX : e, this.maxX = this.maxX > n ? this.maxX : n, this.minY = this.minY < t ? this.minY : t, this.maxY = this.maxY > r ? this.maxY : r;
	}
}, d = class e extends l.default {
	constructor() {
		super(), this.tempDisplayObjectParent = null, this.transform = new c(), this.alpha = 1, this.visible = !0, this.renderable = !0, this.cullable = !1, this.cullArea = null, this.parent = null, this.worldAlpha = 1, this._lastSortedIndex = 0, this._zIndex = 0, this.filterArea = null, this.filters = null, this._enabledFilters = null, this._bounds = new u(), this._localBounds = null, this._boundsID = 0, this._boundsRect = null, this._localBoundsRect = null, this._mask = null, this._maskRefCount = 0, this._destroyed = !1, this.isSprite = !1, this.isMask = !1;
	}
	static mixin(t) {
		let n = Object.keys(t);
		for (let r = 0; r < n.length; ++r) {
			let i = n[r];
			Object.defineProperty(e.prototype, i, Object.getOwnPropertyDescriptor(t, i));
		}
	}
	get destroyed() {
		return this._destroyed;
	}
	_recursivePostUpdateTransform() {
		this.parent ? (this.parent._recursivePostUpdateTransform(), this.transform.updateTransform(this.parent.transform)) : this.transform.updateTransform(this._tempDisplayObjectParent.transform);
	}
	updateTransform() {
		this._boundsID++, this.transform.updateTransform(this.parent.transform), this.worldAlpha = this.alpha * this.parent.worldAlpha;
	}
	getBounds(e, t) {
		return e || (this.parent ? (this._recursivePostUpdateTransform(), this.updateTransform()) : (this.parent = this._tempDisplayObjectParent, this.updateTransform(), this.parent = null)), this._bounds.updateID !== this._boundsID && (this.calculateBounds(), this._bounds.updateID = this._boundsID), t ||= (this._boundsRect ||= new o(), this._boundsRect), this._bounds.getRectangle(t);
	}
	getLocalBounds(e) {
		e ||= (this._localBoundsRect ||= new o(), this._localBoundsRect), this._localBounds ||= new u();
		let t = this.transform, n = this.parent;
		this.parent = null, this._tempDisplayObjectParent.worldAlpha = n?.worldAlpha ?? 1, this.transform = this._tempDisplayObjectParent.transform;
		let r = this._bounds, i = this._boundsID;
		this._bounds = this._localBounds;
		let a = this.getBounds(!1, e);
		return this.parent = n, this.transform = t, this._bounds = r, this._bounds.updateID += this._boundsID - i, a;
	}
	toGlobal(e, t, n = !1) {
		return n || (this._recursivePostUpdateTransform(), this.parent ? this.displayObjectUpdateTransform() : (this.parent = this._tempDisplayObjectParent, this.displayObjectUpdateTransform(), this.parent = null)), this.worldTransform.apply(e, t);
	}
	toLocal(e, t, n, r) {
		return t && (e = t.toGlobal(e, n, r)), r || (this._recursivePostUpdateTransform(), this.parent ? this.displayObjectUpdateTransform() : (this.parent = this._tempDisplayObjectParent, this.displayObjectUpdateTransform(), this.parent = null)), this.worldTransform.applyInverse(e, n);
	}
	setParent(e) {
		if (!e || !e.addChild) throw Error("setParent: Argument must be a Container");
		return e.addChild(this), e;
	}
	removeFromParent() {
		this.parent?.removeChild(this);
	}
	setTransform(e = 0, t = 0, n = 1, r = 1, i = 0, a = 0, o = 0, s = 0, c = 0) {
		return this.position.x = e, this.position.y = t, this.scale.x = n || 1, this.scale.y = r || 1, this.rotation = i, this.skew.x = a, this.skew.y = o, this.pivot.x = s, this.pivot.y = c, this;
	}
	destroy(e) {
		this.removeFromParent(), this._destroyed = !0, this.transform = null, this.parent = null, this._bounds = null, this.mask = null, this.cullArea = null, this.filters = null, this.filterArea = null, this.hitArea = null, this.eventMode = "auto", this.interactiveChildren = !1, this.emit("destroyed"), this.removeAllListeners();
	}
	get _tempDisplayObjectParent() {
		return this.tempDisplayObjectParent === null && (this.tempDisplayObjectParent = new f()), this.tempDisplayObjectParent;
	}
	enableTempParent() {
		let e = this.parent;
		return this.parent = this._tempDisplayObjectParent, e;
	}
	disableTempParent(e) {
		this.parent = e;
	}
	get x() {
		return this.position.x;
	}
	set x(e) {
		this.transform.position.x = e;
	}
	get y() {
		return this.position.y;
	}
	set y(e) {
		this.transform.position.y = e;
	}
	get worldTransform() {
		return this.transform.worldTransform;
	}
	get localTransform() {
		return this.transform.localTransform;
	}
	get position() {
		return this.transform.position;
	}
	set position(e) {
		this.transform.position.copyFrom(e);
	}
	get scale() {
		return this.transform.scale;
	}
	set scale(e) {
		this.transform.scale.copyFrom(e);
	}
	get pivot() {
		return this.transform.pivot;
	}
	set pivot(e) {
		this.transform.pivot.copyFrom(e);
	}
	get skew() {
		return this.transform.skew;
	}
	set skew(e) {
		this.transform.skew.copyFrom(e);
	}
	get rotation() {
		return this.transform.rotation;
	}
	set rotation(e) {
		this.transform.rotation = e;
	}
	get angle() {
		return this.transform.rotation * i;
	}
	set angle(e) {
		this.transform.rotation = e * t;
	}
	get zIndex() {
		return this._zIndex;
	}
	set zIndex(e) {
		this._zIndex !== e && (this._zIndex = e, this.parent && (this.parent.sortDirty = !0));
	}
	get worldVisible() {
		let e = this;
		do {
			if (!e.visible) return !1;
			e = e.parent;
		} while (e);
		return !0;
	}
	get mask() {
		return this._mask;
	}
	set mask(e) {
		if (this._mask !== e) {
			if (this._mask) {
				let e = this._mask.isMaskData ? this._mask.maskObject : this._mask;
				e && (e._maskRefCount--, e._maskRefCount === 0 && (e.renderable = !0, e.isMask = !1));
			}
			if (this._mask = e, this._mask) {
				let e = this._mask.isMaskData ? this._mask.maskObject : this._mask;
				e && (e._maskRefCount === 0 && (e.renderable = !1, e.isMask = !0), e._maskRefCount++);
			}
		}
	}
}, f = class extends d {
	constructor() {
		super(...arguments), this.sortDirty = null;
	}
};
d.prototype.displayObjectUpdateTransform = d.prototype.updateTransform;
//#endregion
//#region node_modules/@pixi/display/lib/Container.mjs
var p = new e();
function m(e, t) {
	return e.zIndex === t.zIndex ? e._lastSortedIndex - t._lastSortedIndex : e.zIndex - t.zIndex;
}
var h = class e extends d {
	constructor() {
		super(), this.children = [], this.sortableChildren = e.defaultSortableChildren, this.sortDirty = !1;
	}
	onChildrenChange(e) {}
	addChild(...e) {
		if (e.length > 1) for (let t = 0; t < e.length; t++) this.addChild(e[t]);
		else {
			let t = e[0];
			t.parent && t.parent.removeChild(t), t.parent = this, this.sortDirty = !0, t.transform._parentID = -1, this.children.push(t), this._boundsID++, this.onChildrenChange(this.children.length - 1), this.emit("childAdded", t, this, this.children.length - 1), t.emit("added", this);
		}
		return e[0];
	}
	addChildAt(e, t) {
		if (t < 0 || t > this.children.length) throw Error(`${e}addChildAt: The index ${t} supplied is out of bounds ${this.children.length}`);
		return e.parent && e.parent.removeChild(e), e.parent = this, this.sortDirty = !0, e.transform._parentID = -1, this.children.splice(t, 0, e), this._boundsID++, this.onChildrenChange(t), e.emit("added", this), this.emit("childAdded", e, this, t), e;
	}
	swapChildren(e, t) {
		if (e === t) return;
		let n = this.getChildIndex(e), r = this.getChildIndex(t);
		this.children[n] = t, this.children[r] = e, this.onChildrenChange(n < r ? n : r);
	}
	getChildIndex(e) {
		let t = this.children.indexOf(e);
		if (t === -1) throw Error("The supplied DisplayObject must be a child of the caller");
		return t;
	}
	setChildIndex(e, t) {
		if (t < 0 || t >= this.children.length) throw Error(`The index ${t} supplied is out of bounds ${this.children.length}`);
		let r = this.getChildIndex(e);
		n(this.children, r, 1), this.children.splice(t, 0, e), this.onChildrenChange(t);
	}
	getChildAt(e) {
		if (e < 0 || e >= this.children.length) throw Error(`getChildAt: Index (${e}) does not exist.`);
		return this.children[e];
	}
	removeChild(...e) {
		if (e.length > 1) for (let t = 0; t < e.length; t++) this.removeChild(e[t]);
		else {
			let t = e[0], r = this.children.indexOf(t);
			if (r === -1) return null;
			t.parent = null, t.transform._parentID = -1, n(this.children, r, 1), this._boundsID++, this.onChildrenChange(r), t.emit("removed", this), this.emit("childRemoved", t, this, r);
		}
		return e[0];
	}
	removeChildAt(e) {
		let t = this.getChildAt(e);
		return t.parent = null, t.transform._parentID = -1, n(this.children, e, 1), this._boundsID++, this.onChildrenChange(e), t.emit("removed", this), this.emit("childRemoved", t, this, e), t;
	}
	removeChildren(e = 0, t = this.children.length) {
		let n = e, r = t, i = r - n, a;
		if (i > 0 && i <= r) {
			a = this.children.splice(n, i);
			for (let e = 0; e < a.length; ++e) a[e].parent = null, a[e].transform && (a[e].transform._parentID = -1);
			this._boundsID++, this.onChildrenChange(e);
			for (let e = 0; e < a.length; ++e) a[e].emit("removed", this), this.emit("childRemoved", a[e], this, e);
			return a;
		}
		if (i === 0 && this.children.length === 0) return [];
		throw RangeError("removeChildren: numeric values are outside the acceptable range.");
	}
	sortChildren() {
		let e = !1;
		for (let t = 0, n = this.children.length; t < n; ++t) {
			let n = this.children[t];
			n._lastSortedIndex = t, !e && n.zIndex !== 0 && (e = !0);
		}
		e && this.children.length > 1 && this.children.sort(m), this.sortDirty = !1;
	}
	updateTransform() {
		this.sortableChildren && this.sortDirty && this.sortChildren(), this._boundsID++, this.transform.updateTransform(this.parent.transform), this.worldAlpha = this.alpha * this.parent.worldAlpha;
		for (let e = 0, t = this.children.length; e < t; ++e) {
			let t = this.children[e];
			t.visible && t.updateTransform();
		}
	}
	calculateBounds() {
		this._bounds.clear(), this._calculateBounds();
		for (let e = 0; e < this.children.length; e++) {
			let t = this.children[e];
			if (t.visible && t.renderable) {
				if (t.calculateBounds(), t._mask) {
					let e = t._mask.isMaskData ? t._mask.maskObject : t._mask;
					e ? (e.calculateBounds(), this._bounds.addBoundsMask(t._bounds, e._bounds)) : this._bounds.addBounds(t._bounds);
				} else t.filterArea ? this._bounds.addBoundsArea(t._bounds, t.filterArea) : this._bounds.addBounds(t._bounds);
			}
		}
		this._bounds.updateID = this._boundsID;
	}
	getLocalBounds(e, t = !1) {
		let n = super.getLocalBounds(e);
		if (!t) for (let e = 0, t = this.children.length; e < t; ++e) {
			let t = this.children[e];
			t.visible && t.updateTransform();
		}
		return n;
	}
	_calculateBounds() {}
	_renderWithCulling(t) {
		let n = t.renderTexture.sourceFrame;
		if (!(n.width > 0 && n.height > 0)) return;
		let r, i;
		this.cullArea ? (r = this.cullArea, i = this.worldTransform) : this._render !== e.prototype._render && (r = this.getBounds(!0));
		let a = t.projection.transform;
		if (a && (i ? (i = p.copyFrom(i), i.prepend(a)) : i = a), r && n.intersects(r, i)) this._render(t);
		else if (this.cullArea) return;
		for (let e = 0, n = this.children.length; e < n; ++e) {
			let n = this.children[e], r = n.cullable;
			n.cullable = r || !this.cullArea, n.render(t), n.cullable = r;
		}
	}
	render(e) {
		if (!(!this.visible || this.worldAlpha <= 0 || !this.renderable)) {
			if (this._mask || this.filters?.length) this.renderAdvanced(e);
			else if (this.cullable) this._renderWithCulling(e);
			else {
				this._render(e);
				for (let t = 0, n = this.children.length; t < n; ++t) this.children[t].render(e);
			}
		}
	}
	renderAdvanced(e) {
		let t = this.filters, n = this._mask;
		if (t) {
			this._enabledFilters ||= [], this._enabledFilters.length = 0;
			for (let e = 0; e < t.length; e++) t[e].enabled && this._enabledFilters.push(t[e]);
		}
		let i = t && this._enabledFilters?.length || n && (!n.isMaskData || n.enabled && (n.autoDetect || n.type !== r.NONE));
		if (i && e.batch.flush(), t && this._enabledFilters?.length && e.filter.push(this, this._enabledFilters), n && e.mask.push(this, this._mask), this.cullable) this._renderWithCulling(e);
		else {
			this._render(e);
			for (let t = 0, n = this.children.length; t < n; ++t) this.children[t].render(e);
		}
		i && e.batch.flush(), n && e.mask.pop(this), t && this._enabledFilters?.length && e.filter.pop();
	}
	_render(e) {}
	destroy(e) {
		super.destroy(), this.sortDirty = !1;
		let t = typeof e == "boolean" ? e : e?.children, n = this.removeChildren(0, this.children.length);
		if (t) for (let t = 0; t < n.length; ++t) n[t].destroy(e);
	}
	get width() {
		return this.scale.x * this.getLocalBounds().width;
	}
	set width(e) {
		let t = this.getLocalBounds().width;
		t === 0 ? this.scale.x = 1 : this.scale.x = e / t, this._width = e;
	}
	get height() {
		return this.scale.y * this.getLocalBounds().height;
	}
	set height(e) {
		let t = this.getLocalBounds().height;
		t === 0 ? this.scale.y = 1 : this.scale.y = e / t, this._height = e;
	}
};
h.defaultSortableChildren = !1;
var g = h;
//#endregion
//#region node_modules/@pixi/display/lib/settings.mjs
g.prototype.containerUpdateTransform = g.prototype.updateTransform, Object.defineProperties(a, { SORTABLE_CHILDREN: {
	get() {
		return g.defaultSortableChildren;
	},
	set(e) {
		s("7.1.0", "settings.SORTABLE_CHILDREN is deprecated, use Container.defaultSortableChildren"), g.defaultSortableChildren = e;
	}
} });
//#endregion
export { u as Bounds, g as Container, d as DisplayObject, f as TemporaryDisplayObject };
