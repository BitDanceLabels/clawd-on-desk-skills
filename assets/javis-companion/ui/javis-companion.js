//#region src/companion/config.ts
var e = {
	BASE_URL: "/",
	DEV: !1,
	MODE: "production",
	PROD: !0,
	SSR: !1
}, t = typeof window < "u" && window.COMPANION_LIVE2D_SAMPLES === !1, n = e?.VITE_COMPANION_LIVE2D_SAMPLES !== "0" && !t, r = "This content uses sample data owned and copyrighted by Live2D Inc. The sample data are utilized in accordance with terms and conditions set by Live2D Inc.", i = "This content uses sample data owned and copyrighted by Live2D Inc.", a = "Nhân vật mẫu © Live2D Inc.", o = [
	{
		id: "mat",
		kind: "mesh",
		rig: "rig/mat/",
		name: "Mật",
		role: "Trợ lý chính · JAVIS",
		teams: [],
		hair: "twin",
		accessory: "bee",
		palette: {
			hair: "#F5B83D",
			hairDark: "#B86F17",
			hairLight: "#FFE59A",
			eye: "#7C6CFF",
			eyeDark: "#3B2FA8",
			skin: "#FFE4D0",
			skinShade: "#F0B9A1",
			outfit: "#4A3FB8",
			outfitDark: "#2C2574",
			accent: "#4FD1E8",
			sock: "#1B1530"
		},
		greeting: "Em là Mật, trợ lý JAVIS của anh. Anh cần gì cứ nói, em làm liền!",
		label: "Nhân vật AI"
	},
	{
		id: "linh",
		kind: "mesh",
		rig: "rig/linh/",
		name: "Linh",
		role: "Thư ký Media · Truyền thông",
		teams: ["media", "brand"],
		hair: "bob",
		accessory: "beret",
		palette: {
			hair: "#C77DFF",
			hairDark: "#7B3FB8",
			hairLight: "#EED5FF",
			eye: "#4FD1E8",
			eyeDark: "#1C7C95",
			skin: "#FFE4D0",
			skinShade: "#F0B9A1",
			outfit: "#FF6FAE",
			outfitDark: "#B8336E",
			accent: "#FFE08A",
			sock: "#2A1838"
		},
		greeting: "Linh đây ạ! Bài đăng, kênh, lịch nội dung — anh giao em lo.",
		label: "Nhân vật AI"
	},
	{
		id: "an",
		kind: "mesh",
		rig: "rig/an/",
		name: "An",
		role: "Kỹ thuật · Vận hành máy",
		teams: [
			"ops",
			"tech",
			"fleet"
		],
		hair: "ponytail",
		accessory: "headset",
		palette: {
			hair: "#4FD1E8",
			hairDark: "#1E7F94",
			hairLight: "#C9F6FF",
			eye: "#F5B83D",
			eyeDark: "#9A5E0B",
			skin: "#FFE4D0",
			skinShade: "#F0B9A1",
			outfit: "#141833",
			outfitDark: "#0B0E22",
			accent: "#4FD1E8",
			sock: "#0B0E22"
		},
		greeting: "An trực kỹ thuật. Máy nào kẹt, deploy gì, anh nói em kiểm ngay.",
		label: "Nhân vật AI"
	}
], s = {
	id: "hiyori",
	name: "Hiyori",
	role: "Trợ lý JAVIS · nhân vật mẫu Live2D",
	teams: [],
	hair: "twin",
	accessory: "none",
	palette: {
		hair: "#8A5A44",
		hairDark: "#5A3626",
		hairLight: "#C9967A",
		eye: "#7C6CFF",
		eyeDark: "#3B2FA8",
		skin: "#FFE4D0",
		skinShade: "#F0B9A1",
		outfit: "#F3F1EA",
		outfitDark: "#A9AECB",
		accent: "#F5B83D",
		sock: "#1B1530"
	},
	greeting: "Em là Hiyori, trợ lý JAVIS của anh. Anh cần gì cứ nói, em làm liền!",
	label: "Nhân vật mẫu Live2D",
	kind: "live2d",
	live2d: {
		model: "hiyori/Hiyori.model3.json",
		licenseNote: "Hiyori · nhân vật mẫu Live2D (dùng theo giấy phép doanh nghiệp nhỏ)"
	}
};
function c(e = n) {
	return e ? [s, ...o] : o;
}
var l = c();
l[0].id;
function u(e, t = l) {
	return t.find((t) => t.id === e) || t[0];
}
var d = (e) => e.kind === "live2d", f = "#3B2538", p = "#2B1E3A", m = "#7A2A3A";
function h(e) {
	return `<defs>
  <linearGradient id="${e}-gh" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color:var(--c-hair-light)"/><stop offset=".35" style="stop-color:var(--c-hair)"/><stop offset="1" style="stop-color:var(--c-hair-dark)"/>
  </linearGradient>
  <linearGradient id="${e}-gt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color:var(--c-hair)"/><stop offset="1" style="stop-color:var(--c-hair-dark)"/>
  </linearGradient>
  <radialGradient id="${e}-gi" cx=".5" cy=".35" r=".7">
    <stop offset="0" style="stop-color:var(--c-eye)"/><stop offset=".55" style="stop-color:var(--c-eye)"/><stop offset="1" style="stop-color:var(--c-eye-dark)"/>
  </radialGradient>
  <linearGradient id="${e}-go" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color:var(--c-outfit)"/><stop offset="1" style="stop-color:var(--c-outfit-dark)"/>
  </linearGradient>
  <radialGradient id="${e}-gs" cx=".5" cy=".4" r=".75">
    <stop offset="0" style="stop-color:var(--c-skin)"/><stop offset="1" style="stop-color:var(--c-skin-shade)"/>
  </radialGradient>
  <clipPath id="${e}-face"><path d="${g}"/></clipPath>
  <clipPath id="${e}-sc"><path d="${_}"/></clipPath>
</defs>`;
}
var g = "M160 72 C214 72 240 112 236 160 C233 204 198 238 160 242 C122 238 87 204 84 160 C80 112 106 72 160 72 Z", _ = "M107 171 C109 151 147 149 149 169 C147 188 111 190 107 171 Z";
function v(e) {
	return `<g class="c-eye-open">
    <path d="${_}" fill="#fff"/>
    <g class="c-iris" clip-path="url(#${e}-sc)">
      <circle cx="128" cy="171" r="14.5" fill="url(#${e}-gi)"/>
      <circle cx="128" cy="171" r="14.5" fill="none" style="stroke:var(--c-eye-dark)" stroke-width="1.2" opacity=".7"/>
      <ellipse cx="128" cy="178" rx="7" ry="3" fill="#fff" opacity=".28"/>
      <circle cx="128" cy="172" r="6.8" style="fill:var(--c-eye-dark)"/>
      <circle cx="128" cy="172" r="3.2" fill="#140c22"/>
      <circle cx="122.5" cy="164" r="4.6" fill="#fff"/>
      <circle cx="134" cy="177" r="2" fill="#fff" opacity=".95"/>
    </g>
    <path d="M107 171 C109 151 147 149 149 169 C147 161 111 161 107 171 Z" fill="${p}" opacity=".16"/>
    <path d="M105 171 C111 147 149 146 151 167" fill="none" stroke="${p}" stroke-width="4.6" stroke-linecap="round"/>
    <path d="M106.5 168 L98 161.5" stroke="${p}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M112 183 C122 191 136 191 146 183" fill="none" stroke="${p}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
  </g>
  <path class="c-eye-closed" d="M108 174 C118 185 138 185 148 172" fill="none" stroke="${p}" stroke-width="3.6" stroke-linecap="round" opacity="0"/>`;
}
function y() {
	return `<g class="c-mouth" style="transform-box:fill-box;transform-origin:50% 20%">
    <path class="c-m c-m-X" d="M151 207 Q160 215 169 207" fill="none" stroke="#B5485F" stroke-width="2.4" stroke-linecap="round"/>
    <path class="c-m c-m-smile" d="M148 205 Q160 207 172 205 Q168 222 160 223 Q152 222 148 205 Z" fill="${m}" opacity="0"/>
    <path class="c-m c-m-sad" d="M151 213 Q160 205 169 213" fill="none" stroke="#B5485F" stroke-width="2.4" stroke-linecap="round" opacity="0"/>
    <g class="c-m c-m-A" opacity="0"><path d="M149 205 Q160 201 171 205 Q170 222 160 224 Q150 222 149 205 Z" fill="${m}"/><path d="M153 217 Q160 212 167 217 Q160 224 153 217 Z" fill="#E26B86"/><path d="M151.5 206 Q160 204 168.5 206 L167.5 209 Q160 208 152.5 209 Z" fill="#fff" opacity=".9"/></g>
    <path class="c-m c-m-I" d="M147 207 Q160 205 173 207 Q160 214 147 207 Z" fill="${m}" opacity="0"/>
    <path class="c-m c-m-U" d="M155 206 Q160 204 165 206 Q166 215 160 216 Q154 215 155 206 Z" fill="${m}" opacity="0"/>
    <path class="c-m c-m-E" d="M150 206 Q160 204 170 206 Q168 217 160 218 Q152 217 150 206 Z" fill="${m}" opacity="0"/>
    <g class="c-m c-m-O" opacity="0"><path d="M153 204 Q160 201 167 204 Q169 214 160 217 Q151 214 153 204 Z" fill="${m}"/><path d="M155 212 Q160 209 165 212 Q160 217 155 212Z" fill="#E26B86"/></g>
  </g>`;
}
function b(e, t) {
	let n = `<path d="M160 58 C232 58 258 118 250 180 C246 206 240 232 236 258 L84 258 C80 232 74 206 70 180 C62 118 88 58 160 58 Z" fill="url(#${t}-gt)" stroke="var(--c-hair-dark)" stroke-width="1.5"/>`;
	if (e === "bob") return `<g class="c-hair-back">${n}
      <path d="M84 258 C78 232 100 230 112 250 L208 250 C220 230 242 232 236 258 C224 276 200 262 160 264 C120 262 96 276 84 258 Z" style="fill:var(--c-hair-dark)" opacity=".9"/>
    </g>`;
	if (e === "ponytail") return `<g class="c-hair-back">${n}</g>
    <g class="c-tail-r c-tail" style="transform-box:fill-box;transform-origin:20% 10%">
      <path d="M214 92 C262 80 290 130 282 190 C276 236 252 282 246 330 C242 352 258 364 252 372 C236 376 222 356 222 334 C222 290 236 240 232 196 C230 160 222 118 214 92 Z" fill="url(#${t}-gt)" stroke="var(--c-hair-dark)" stroke-width="1.5"/>
      <path d="M248 300 C250 322 246 344 240 362 C250 352 256 330 256 306 Z" style="fill:var(--c-hair-dark)" opacity=".8"/>
      <ellipse cx="226" cy="104" rx="10" ry="7" transform="rotate(-25 226 104)" style="fill:var(--c-accent)"/>
    </g>`;
	let r = `<path d="M100 170 C70 204 60 262 70 322 C74 344 92 352 102 338 C112 302 112 232 118 182 Z" fill="url(#${t}-gt)" stroke="var(--c-hair-dark)" stroke-width="1.5"/>
      <path d="M74 300 C76 322 80 340 92 348 C84 344 76 326 70 300 Z" style="fill:var(--c-hair-dark)" opacity=".85"/>
      <path d="M94 302 C90 318 90 332 98 342" fill="none" style="stroke:var(--c-hair-light)" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>
      <path d="M96 170 C88 166 84 176 90 184 Q100 186 104 178 Z" style="fill:var(--c-accent)"/>`;
	return `<g class="c-hair-back">${n}</g>
    <g class="c-tail-l c-tail" style="transform-box:fill-box;transform-origin:90% 6%">${r}</g>
    <g class="c-tail-r c-tail" style="transform-box:fill-box;transform-origin:10% 6%"><g transform="matrix(-1 0 0 1 320 0)">${r}</g></g>`;
}
function x(e) {
	let t = `<path d="M80 150 C74 192 80 232 92 266 C98 274 108 266 106 252 C100 222 102 192 106 160 Z" fill="url(#${e}-gh)" stroke="var(--c-hair-dark)" stroke-width="1.4"/>`;
	return `<g class="c-hair-front">
    <path d="M80 152 C72 100 100 58 160 56 C220 58 248 100 240 152 C236 122 222 114 214 140 C208 120 198 116 190 142 C182 116 170 112 160 140 C150 112 138 116 130 142 C122 116 112 120 106 140 C98 114 84 122 80 152 Z"
      fill="url(#${e}-gh)" stroke="var(--c-hair-dark)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M108 100 L120 90 L130 98 L144 86 L154 96 L168 84 L178 94 L192 84 L202 96 L214 90" fill="none" style="stroke:var(--c-hair-light)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
    <path d="M160 140 C150 112 138 116 130 142" fill="none" style="stroke:var(--c-hair-dark)" stroke-width="1.2" opacity=".5"/>
    <path d="M118 128 C112 110 100 112 92 136 M196 106 C204 96 214 100 222 124 M146 100 C138 96 128 104 124 118" fill="none" style="stroke:var(--c-hair-dark)" stroke-width="1.1" stroke-linecap="round" opacity=".45"/>
    <path d="M190 142 C182 116 170 112 160 140" fill="none" style="stroke:var(--c-hair-dark)" stroke-width="1.2" opacity=".5"/>
    ${t}<g transform="matrix(-1 0 0 1 320 0)">${t}</g>
  </g>`;
}
function S(e) {
	if (e === "bee") {
		let e = "<path d=\"M128 70 C120 60 116 52 112 42\" fill=\"none\" stroke=\"#2A2140\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><circle cx=\"112\" cy=\"40\" r=\"6.5\" style=\"fill:var(--c-hair)\" stroke=\"#2A2140\" stroke-width=\"1.5\"/><circle cx=\"110\" cy=\"38\" r=\"2\" fill=\"#fff\" opacity=\".8\"/>";
		return `<g class="c-acc c-acc-bee">${e}<g transform="matrix(-1 0 0 1 320 0)">${e}</g>
      <g transform="translate(104 128) rotate(-12)"><path d="M0 -9 L8 -4.5 L8 4.5 L0 9 L-8 4.5 L-8 -4.5 Z" style="fill:var(--c-accent)" stroke="#2A2140" stroke-width="1.4"/><path d="M-3 0 H3 M0 -3 V3" stroke="#2A2140" stroke-width="1.4" stroke-linecap="round"/></g>
    </g>`;
	}
	if (e === "beret") return "<g class=\"c-acc c-acc-beret\">\n      <path d=\"M86 96 C94 56 226 48 240 90 C236 100 204 104 160 104 C116 104 98 104 86 96 Z\" fill=\"url(#__GO__)\" stroke=\"var(--c-outfit-dark)\" stroke-width=\"1.6\"/>\n      <path d=\"M100 98 C120 92 200 92 232 94\" fill=\"none\" stroke=\"var(--c-outfit-dark)\" stroke-width=\"2\" opacity=\".6\"/>\n      <circle cx=\"168\" cy=\"54\" r=\"5\" style=\"fill:var(--c-accent)\"/>\n    </g>";
	if (e === "headset") {
		let e = "<rect x=\"76\" y=\"146\" width=\"18\" height=\"30\" rx=\"7\" style=\"fill:var(--c-outfit)\" stroke=\"#2A2140\" stroke-width=\"1.6\"/><rect x=\"80\" y=\"152\" width=\"3\" height=\"18\" rx=\"1.5\" style=\"fill:var(--c-accent)\"/>";
		return `<g class="c-acc c-acc-headset">
      <path d="M85 150 C86 72 234 72 235 150" fill="none" stroke="#2A2140" stroke-width="7" stroke-linecap="round"/>
      <path d="M85 150 C86 72 234 72 235 150" fill="none" style="stroke:var(--c-outfit)" stroke-width="3" stroke-linecap="round"/>
      ${e}<g transform="matrix(-1 0 0 1 320 0)">${e}</g>
      <path d="M90 176 C98 194 122 206 146 200" fill="none" stroke="#2A2140" stroke-width="3" stroke-linecap="round"/>
      <circle cx="148" cy="200" r="4" style="fill:var(--c-accent)" stroke="#2A2140" stroke-width="1.5"/>
    </g>`;
	}
	return "";
}
function C(e) {
	let t = `<path d="M118 384 L150 384 L146 444 L124 444 Z" style="fill:var(--c-sock)"/>
    <path d="M119 392 L149 392 L148.6 398 L119.4 398 Z M120 406 L148.2 406 L147.8 411 L120.4 411 Z" style="fill:var(--c-hair)" opacity=".9"/>
    <path d="M122 442 C112 442 108 454 112 460 L150 460 C154 452 150 442 146 442 Z" fill="#1A1326" stroke="${f}" stroke-width="1.2"/>
    <path d="M112 457 L150 457" style="stroke:var(--c-accent)" stroke-width="2" opacity=".8"/>`;
	return `<g class="c-body" style="transform-box:fill-box;transform-origin:50% 0%">
    <path d="M104 352 L216 352 L221 386 Q160 394 99 386 Z" style="fill:var(--c-outfit-dark)" stroke="${f}" stroke-width="1.2"/>
    ${t}<g transform="matrix(-1 0 0 1 320 0)">${t}</g>
    <path d="M108 268 C104 232 216 232 212 268 C196 254 124 254 108 268 Z" style="fill:var(--c-outfit-dark)" stroke="${f}" stroke-width="1.4"/>
    <path d="M146 226 L146 254 Q160 262 174 254 L174 226 Z" fill="url(#${e}-gs)"/>
    <path d="M146 226 L146 240 Q160 250 174 240 L174 226 Z" style="fill:var(--c-skin-shade)" opacity=".7"/>
    <path d="M160 246 C128 246 104 258 98 282 L92 340 C90 352 96 358 108 358 L212 358 C224 358 230 352 228 340 L222 282 C216 258 192 246 160 246 Z" fill="url(#${e}-go)" stroke="${f}" stroke-width="1.5"/>
    <path d="M124 258 C132 274 188 274 196 258 C190 248 130 248 124 258 Z" style="fill:var(--c-outfit-dark)" stroke="${f}" stroke-width="1.2"/>
    <path d="M118 318 C120 348 200 348 202 318 C196 336 124 336 118 318 Z" style="fill:var(--c-outfit-dark)" opacity=".55"/>
    <path d="M150 268 C148 282 146 294 145 306 M170 268 C172 282 174 294 175 306" fill="none" style="stroke:var(--c-accent)" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="145" cy="308" r="2.6" style="fill:var(--c-accent)"/><circle cx="175" cy="308" r="2.6" style="fill:var(--c-accent)"/>
    <path d="M160 300 L166 314 L160 318 L154 314 Z" style="fill:var(--c-hair)" opacity=".9"/>
    <g class="c-arm c-arm-l"><path d="M102 276 C86 290 82 320 86 346 C88 356 104 358 108 348 L114 302 Z" fill="url(#${e}-go)" stroke="${f}" stroke-width="1.4"/><ellipse cx="94" cy="354" rx="9.5" ry="8" fill="url(#${e}-gs)" stroke="${f}" stroke-width="1"/></g>
    <g class="c-arm c-arm-r" style="transform-box:fill-box;transform-origin:50% 8%"><g transform="matrix(-1 0 0 1 320 0)"><path d="M102 276 C86 290 82 320 86 346 C88 356 104 358 108 348 L114 302 Z" fill="url(#${e}-go)" stroke="${f}" stroke-width="1.4"/><ellipse cx="94" cy="354" rx="9.5" ry="8" fill="url(#${e}-gs)" stroke="${f}" stroke-width="1"/></g></g>
  </g>`;
}
function w() {
	let e = (e, t, n) => `<path transform="translate(${e} ${t}) scale(${n})" d="M0 -8 C1 -2 2 -1 8 0 C2 1 1 2 0 8 C-1 2 -2 1 -8 0 C-2 -1 -1 -2 0 -8 Z" style="fill:var(--c-hair-light)"/>`, t = (e, t, n) => `<path transform="translate(${e} ${t}) scale(${n})" d="M0 6 C-8 0 -8 -8 -3 -8 C-1 -8 0 -6 0 -5 C0 -6 1 -8 3 -8 C8 -8 8 0 0 6 Z" fill="#FF6F9C"/>`;
	return `<g class="c-fx c-fx-sparkle" opacity="0">${e(70, 110, 1)}${e(252, 96, .8)}${e(248, 200, .6)}</g>
  <g class="c-fx c-fx-hearts" opacity="0">${t(66, 150, 1.1)}${t(254, 128, .9)}${t(240, 216, .7)}</g>
  <g class="c-fx c-fx-sweat" opacity="0"><path d="M228 130 C236 142 240 150 234 156 C228 160 220 154 222 146 C224 140 226 136 228 130 Z" fill="#9FE6FF" stroke="#5CB8D8" stroke-width="1.2"/></g>
  <g class="c-fx c-fx-zzz" opacity="0" font-family="inherit" font-weight="800" fill="#BFC6FF"><text x="236" y="116" font-size="18">z</text><text x="252" y="98" font-size="24">Z</text><text x="272" y="76" font-size="30">Z</text></g>
  <g class="c-fx c-fx-think" opacity="0"><circle cx="246" cy="112" r="4" fill="#DCE3FF"/><circle cx="258" cy="96" r="6" fill="#DCE3FF"/><circle cx="276" cy="74" r="9" fill="#DCE3FF"/><text x="270" y="79" font-size="12" fill="#5B63A8" font-weight="700">?</text></g>`;
}
function T(e, t = "jc", n = {}) {
	let r = e.palette, i = `--c-hair:${r.hair};--c-hair-dark:${r.hairDark};--c-hair-light:${r.hairLight};--c-eye:${r.eye};--c-eye-dark:${r.eyeDark};--c-skin:${r.skin};--c-skin-shade:${r.skinShade};--c-outfit:${r.outfit};--c-outfit-dark:${r.outfitDark};--c-accent:${r.accent};--c-sock:${r.sock}`, a = S(e.accessory).replace("__GO__", `${t}-go`), o = `<ellipse cx="86" cy="168" rx="7" ry="10" fill="url(#${t}-gs)" stroke="${f}" stroke-width="1.2"/>`, s = "<ellipse class=\"c-blush\" cx=\"114\" cy=\"194\" rx=\"13\" ry=\"6\" fill=\"#FF7E9C\" opacity=\".45\"/>", c = "<path class=\"c-brow\" d=\"M110 141 C118 133 134 131 146 137\" fill=\"none\" style=\"stroke:var(--c-hair-dark)\" stroke-width=\"3.4\" stroke-linecap=\"round\"/>";
	return `<svg class="jc-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${n.portrait ? "62 36 196 196" : n.bust ? "20 18 280 280" : "0 0 320 480"}" role="img" aria-label="${e.name} · ${e.label}" style="${i}">
${h(t)}
<g class="c-root" style="transform-box:fill-box;transform-origin:50% 100%">
  <g class="c-hair-back-wrap" style="transform-box:fill-box;transform-origin:50% 20%">${b(e.hair, t)}</g>
  ${C(t)}
  <g class="c-head" style="transform-box:fill-box;transform-origin:50% 92%">
    ${o}<g transform="matrix(-1 0 0 1 320 0)">${o}</g>
    <path class="c-face" d="${g}" fill="url(#${t}-gs)" stroke="${f}" stroke-width="1.5"/>
    <g clip-path="url(#${t}-face)">
      <path d="M80 158 C72 106 100 64 160 62 C220 64 248 106 240 158 C236 128 222 120 214 146 C208 126 198 122 190 148 C182 122 170 118 160 146 C150 118 138 122 130 148 C122 122 112 126 106 146 C98 120 84 128 80 158 Z" style="fill:var(--c-skin-shade)" opacity=".5"/>
    </g>
    <g class="c-eyes">
      <g class="c-eye c-eye-l" style="transform-box:fill-box;transform-origin:50% 50%">${v(t)}</g>
      <g class="c-eye c-eye-r" style="transform-box:fill-box;transform-origin:50% 50%"><g transform="matrix(-1 0 0 1 320 0)">${v(t)}</g></g>
    </g>
    <g class="c-brows">
      <g class="c-brow-l" style="transform-box:fill-box;transform-origin:50% 50%">${c}</g>
      <g class="c-brow-r" style="transform-box:fill-box;transform-origin:50% 50%"><g transform="matrix(-1 0 0 1 320 0)">${c}</g></g>
    </g>
    ${s}<g transform="matrix(-1 0 0 1 320 0)">${s}</g>
    <path d="M158 191 Q161.5 194.5 160 198" fill="none" style="stroke:var(--c-skin-shade)" stroke-width="1.8" stroke-linecap="round"/>
    ${y()}
    ${x(t)}
    ${a}
  </g>
  ${w()}
</g>
</svg>`;
}
//#endregion
//#region src/companion/rig/snapshot.ts
var E = "javis.companion.snap.", D = /* @__PURE__ */ new Map(), O = /* @__PURE__ */ new Set();
function k(e) {
	if (D.has(e)) return D.get(e);
	try {
		let t = localStorage.getItem(E + e);
		if (t && t.startsWith("data:image/")) return D.set(e, t), t;
	} catch {}
	return null;
}
function ee(e, t) {
	D.set(e, t);
	try {
		localStorage.setItem(E + e, t);
	} catch {}
	O.forEach((t) => t(e));
}
function A(e) {
	return O.add(e), () => {
		O.delete(e);
	};
}
var j = (e) => e.replace(/[&<>"']/g, (e) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[e]);
function M(e, t, n = "/ui/") {
	if (e.kind === "mesh" && e.rig) return `<img src="${j(n + e.rig)}portrait.webp" alt="" draggable="false" decoding="async" style="width:100%;height:100%;display:block;object-fit:cover">`;
	if (!d(e)) return T(e, t, { portrait: !0 });
	let r = k(e.id);
	return r ? `<img src="${r}" alt="" draggable="false" style="width:100%;height:100%;display:block;object-fit:cover">` : `<span style="width:100%;height:100%;display:grid;place-items:center;font:700 10px/1.1 system-ui,sans-serif;letter-spacing:.04em;color:#F5B83D;text-align:center;background:radial-gradient(circle at 50% 35%,#141833,#070916 80%)">${j(e.name)}<br>Live2D</span>`;
}
//#endregion
//#region src/companion/rig/lipsync.ts
var N = "aăâàáạảãằắặẳẵầấậẩẫ", P = "iyìíịỉĩỳýỵỷỹ", F = "uưùúụủũừứựửữ", I = "eêèéẹẻẽềếệểễ", L = "oôơòóọỏõồốộổỗờớợởỡ";
function te(e) {
	let t = e.toLowerCase();
	return N.includes(t) ? "A" : P.includes(t) ? "I" : F.includes(t) ? "U" : I.includes(t) ? "E" : L.includes(t) ? "O" : null;
}
function ne(e) {
	let t = [];
	for (let n of (e || "").split(/\s+/)) {
		let e = null;
		for (let t of n) if (e = te(t), e) break;
		e && t.push(e);
	}
	return t.length ? t : [
		"A",
		"O",
		"E"
	];
}
var R = 4.5;
function re(e, t) {
	if (!e.length) return "X";
	let n = Math.floor(t * R);
	return n >= e.length ? "X" : e[n % e.length];
}
function ie(e, t) {
	if (e >= t.length / 4.5) return 0;
	let n = e * R % 1, r = Math.sin(n * Math.PI), i = .85 + .15 * Math.sin(e * 13.7);
	return Math.max(0, Math.min(1, r * i));
}
var ae = {
	A: 1,
	O: .85,
	E: .7,
	I: .45,
	U: .5,
	X: 0
};
function oe(e, t, n) {
	let r = t > e ? .03 : .09, i = 1 - Math.exp(-Math.max(.001, n) / r);
	return e + (t - e) * i;
}
//#endregion
//#region src/companion/rig/view.ts
var z = [
	"X",
	"smile",
	"sad",
	"A",
	"I",
	"U",
	"E",
	"O"
], B = {
	neutral: {
		browY: 0,
		browRot: 0,
		browAsym: 0,
		lid: 1,
		blush: .45,
		mouth: "X",
		fx: null,
		lookY: 0
	},
	happy: {
		browY: -1,
		browRot: 0,
		browAsym: 0,
		lid: .92,
		blush: .65,
		mouth: "smile",
		fx: null,
		lookY: 0
	},
	excited: {
		browY: -4,
		browRot: 0,
		browAsym: 0,
		lid: 1.04,
		blush: .8,
		mouth: "smile",
		fx: "sparkle",
		lookY: -.1
	},
	thinking: {
		browY: 1,
		browRot: 6,
		browAsym: 3,
		lid: .9,
		blush: .35,
		mouth: "X",
		fx: "think",
		lookY: -.6
	},
	sad: {
		browY: 2,
		browRot: 14,
		browAsym: 0,
		lid: .8,
		blush: .3,
		mouth: "sad",
		fx: "sweat",
		lookY: .4
	},
	surprised: {
		browY: -6,
		browRot: 0,
		browAsym: 0,
		lid: 1.08,
		blush: .5,
		mouth: "O",
		fx: "sparkle",
		lookY: 0
	},
	focused: {
		browY: 2,
		browRot: -8,
		browAsym: 0,
		lid: .82,
		blush: .35,
		mouth: "X",
		fx: null,
		lookY: 0
	},
	sleepy: {
		browY: 3,
		browRot: 4,
		browAsym: 0,
		lid: .45,
		blush: .35,
		mouth: "X",
		fx: "zzz",
		lookY: .3
	},
	listening: {
		browY: -2,
		browRot: 0,
		browAsym: 0,
		lid: 1,
		blush: .5,
		mouth: "X",
		fx: null,
		lookY: 0
	}
}, V = {
	wave: 1800,
	nod: 900,
	shake: 900,
	point: 1400,
	think: 2200,
	dance: 2400,
	bow: 1300,
	celebrate: 2e3
}, H = [
	"A",
	"I",
	"U",
	"E",
	"O"
], U = (e, t, n) => Math.max(t, Math.min(n, e)), W = (e, t, n) => e + (t - e) * n, G = class {
	host;
	ch;
	opt;
	el = {};
	mouths = {};
	blushes = [];
	raf = 0;
	running = !1;
	visible = !0;
	t0 = performance.now();
	last = this.t0;
	emotion = "neutral";
	emotionUntil = 0;
	baseEmotion = "neutral";
	gesture = null;
	look = {
		x: 0,
		y: 0
	};
	lookTarget = {
		x: 0,
		y: 0
	};
	blink = {
		next: 0,
		at: 0,
		double: !1
	};
	level = 0;
	speech = null;
	pose = {
		browY: 0,
		browRot: 0,
		browAsym: 0,
		lid: 1,
		blush: .45
	};
	io = null;
	frames = 0;
	fpsAt = 0;
	fps = 0;
	l2d = null;
	l2dLoading = !1;
	l2dGen = 0;
	ro = null;
	l2dState = "none";
	mesh = null;
	meshGen = 0;
	meshState = "none";
	reduced;
	onPointer = (e) => {
		let t = this.host.getBoundingClientRect(), n = t.left + t.width / 2, r = t.top + t.height * (this.opt.portrait ? .5 : this.bust ? .38 : .3);
		this.lookTarget = {
			x: U((e.clientX - n) / Math.max(240, innerWidth / 2), -1, 1),
			y: U((e.clientY - r) / Math.max(200, innerHeight / 2), -1, 1)
		};
	};
	onVis = () => {
		this.visible = !document.hidden && this.inView, this.tick();
	};
	inView = !0;
	get bust() {
		return !this.opt.portrait && !!this.opt.bust;
	}
	constructor(e, t, n = {}) {
		this.host = e, this.ch = t, this.opt = n, this.reduced = n.reducedMotion ?? (typeof matchMedia == "function" && matchMedia("(prefers-reduced-motion: reduce)").matches), this.mount();
	}
	mount() {
		this.l2dGen++, this.l2d?.destroy(), this.l2d = null, this.l2dLoading = !1, this.ro?.disconnect(), this.ro = null, this.meshGen++, this.mesh?.destroy(), this.mesh = null, this.meshState = "none", this.el = {}, this.mouths = {}, this.blushes = [], d(this.ch) ? this.mountLive2DPlaceholder() : (this.l2dState = "none", this.mountSvg(this.ch), this.ch.kind === "mesh" && this.ch.rig && !this.reduced && this.loadMesh());
	}
	loadMesh() {
		let e = this.meshGen, t = this.ch;
		this.meshState = "loading", import("./javis-companion-lazy-meshView-BqG0mqD3.js").then((e) => e.createMeshView(this.host, t, {
			portrait: this.opt.portrait,
			bust: this.bust,
			base: this.opt.assetBase ?? "/ui/"
		})).then((t) => {
			e === this.meshGen ? (this.host.querySelectorAll(":scope > svg").forEach((e) => e.remove()), this.el = {}, this.mouths = {}, this.blushes = [], this.mesh = t, this.meshState = "ready", this.render(performance.now(), 0)) : t.destroy();
		}).catch((t) => {
			e === this.meshGen && (this.meshState = "failed", console.warn("[companion] mesh lỗi → giữ SVG", t));
		});
	}
	mountSvg(e) {
		this.host.innerHTML = T(e, "jc" + Math.random().toString(36).slice(2, 7), {
			portrait: this.opt.portrait,
			bust: this.bust
		});
		let t = (e) => this.host.querySelector(e);
		this.el = {
			root: t(".c-root"),
			head: t(".c-head"),
			body: t(".c-body"),
			hairBack: t(".c-hair-back-wrap"),
			tailL: t(".c-tail-l"),
			tailR: t(".c-tail-r"),
			armR: t(".c-arm-r"),
			eyeOpenL: t(".c-eye-l .c-eye-open"),
			eyeOpenR: t(".c-eye-r .c-eye-open"),
			eyeClosedL: t(".c-eye-l .c-eye-closed"),
			eyeClosedR: t(".c-eye-r .c-eye-closed"),
			irisL: t(".c-eye-l .c-iris"),
			irisR: t(".c-eye-r .c-iris"),
			browL: t(".c-brow-l"),
			browR: t(".c-brow-r"),
			mouth: t(".c-mouth"),
			fxSparkle: t(".c-fx-sparkle"),
			fxHearts: t(".c-fx-hearts"),
			fxSweat: t(".c-fx-sweat"),
			fxZzz: t(".c-fx-zzz"),
			fxThink: t(".c-fx-think")
		};
		for (let e of ["eyeOpenL", "eyeOpenR"]) {
			let t = this.el[e];
			t && (t.style.transformBox = "fill-box", t.style.transformOrigin = "50% 58%");
		}
		this.blushes = [...this.host.querySelectorAll(".c-blush")], this.blushes.forEach((e) => e.style.transition = "opacity .4s");
		for (let e of [
			"X",
			"smile",
			"sad",
			"A",
			"I",
			"U",
			"E",
			"O"
		]) this.mouths[e] = t(".c-m-" + e);
		this.blink.next = performance.now() + 1200 + Math.random() * 2e3;
	}
	mountLive2DPlaceholder() {
		this.l2dState = "wait";
		let e = this.opt.portrait ? k(this.ch.id) : null;
		e ? this.host.innerHTML = `<img class="jc-l2d-wait" src="${e}" alt="" draggable="false" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : this.host.innerHTML = "<span class=\"jc-l2d-wait\" style=\"position:absolute;inset:0;display:grid;place-items:center\"><span style=\"width:38%;aspect-ratio:1;border-radius:50%;border:2px solid rgba(245,184,61,.55);border-top-color:transparent;animation:jcspin 1s linear infinite\"></span></span><style>@keyframes jcspin{to{transform:rotate(1turn)}}</style>";
	}
	loadLive2D() {
		if (this.l2dLoading || this.l2d || this.l2dState === "failed" || !d(this.ch) || !this.ch.live2d) return;
		this.l2dLoading = !0, this.l2dState = "loading";
		let e = this.l2dGen, t = this.ch;
		(async () => {
			try {
				let n = await import("./javis-companion-lazy-live2d-D0IAV1FI.js"), r = this.opt.portrait && !k(t.id) ? (e) => ee(t.id, e) : void 0, i = null, a = null;
				for (let o = 0; o < 3 && !i; o++) try {
					i = await n.Live2DLayer.create(this.host, {
						model: t.live2d.model,
						portrait: !!this.opt.portrait,
						bust: this.bust,
						reduced: this.reduced,
						base: this.opt.live2dBase,
						onSnapshot: r
					});
				} catch (t) {
					if (a = t, e !== this.l2dGen) return;
					await new Promise((e) => setTimeout(e, 800 * 2 ** o));
				}
				if (e !== this.l2dGen) {
					i?.destroy();
					return;
				}
				if (!i) throw a;
				this.l2d = i, this.l2dState = "ready", this.host.innerHTML = "", this.host.appendChild(i.canvas), typeof ResizeObserver < "u" && (this.ro = new ResizeObserver(() => this.l2d?.resize()), this.ro.observe(this.host)), this.tick();
			} catch (t) {
				if (e !== this.l2dGen) return;
				this.l2dState = "failed", console.warn("[companion] Live2D lỗi → về nhân vật gốc", t), this.mountSvg(o[0]), this.render(performance.now(), 0), this.opt.onLive2DError?.(t);
			} finally {
				e === this.l2dGen && (this.l2dLoading = !1);
			}
		})();
	}
	setCharacter(e) {
		e.id !== this.ch.id && (this.ch = e, this.mount(), this.render(performance.now(), 0));
	}
	get character() {
		return this.ch;
	}
	start() {
		this.running || (this.running = !0, document.addEventListener("visibilitychange", this.onVis), this.opt.trackPointer !== !1 && !this.reduced && addEventListener("pointermove", this.onPointer, { passive: !0 }), typeof IntersectionObserver < "u" && (this.io = new IntersectionObserver((e) => {
			this.inView = e.some((e) => e.isIntersecting), this.onVis();
		}, { threshold: .01 }), this.io.observe(this.host)), this.last = performance.now(), this.tick());
	}
	stop() {
		this.running = !1, cancelAnimationFrame(this.raf), this.raf = 0, document.removeEventListener("visibilitychange", this.onVis), removeEventListener("pointermove", this.onPointer), this.io?.disconnect(), this.io = null;
	}
	destroy() {
		this.stop(), this.meshGen++, this.mesh?.destroy(), this.mesh = null, this.l2dGen++, this.l2d?.destroy(), this.l2d = null, this.ro?.disconnect(), this.ro = null, this.host.innerHTML = "";
	}
	setEmotion(e, t = 0) {
		this.emotion = e, this.emotionUntil = t > 0 ? performance.now() + t : 0, t || (this.baseEmotion = e), this.running || this.render(performance.now(), 0);
	}
	setBaseEmotion(e) {
		this.baseEmotion = e, this.emotionUntil || (this.emotion = e);
	}
	doGesture(e) {
		this.gesture = {
			g: e,
			at: performance.now()
		}, e === "celebrate" && this.setEmotion("excited", V[e]), e === "think" && this.setEmotion("thinking", V[e]), e === "bow" && this.setEmotion("happy", V[e]);
	}
	lookAt(e, t = 0) {
		this.lookTarget = e === null ? {
			x: 0,
			y: 0
		} : {
			x: U(e, -1, 1),
			y: U(t, -1, 1)
		};
	}
	speak(e) {
		this.speech = {
			seq: ne(e),
			at: performance.now()
		};
	}
	stopSpeaking() {
		this.speech = null;
	}
	get speaking() {
		return !!this.speech;
	}
	tick = () => {
		if (cancelAnimationFrame(this.raf), !this.running || !this.visible) return;
		this.l2dState === "wait" && this.loadLive2D();
		let e = performance.now(), t = Math.min(.1, (e - this.last) / 1e3);
		this.reduced && e - this.last < 30 || (this.last = e, this.render(e, t), this.frames++, e - this.fpsAt >= 1e3 && (this.fps = this.frames, this.frames = 0, this.fpsAt = e)), this.raf = requestAnimationFrame(this.tick);
	};
	render(e, t) {
		let n = this.el, r = (e - this.t0) / 1e3;
		this.emotionUntil && e > this.emotionUntil && (this.emotionUntil = 0, this.emotion = this.baseEmotion);
		let i = B[this.emotion], a = 1 - Math.exp(-t / .18);
		this.pose.browY = W(this.pose.browY, i.browY, a), this.pose.browRot = W(this.pose.browRot, i.browRot, a), this.pose.browAsym = W(this.pose.browAsym, i.browAsym, a), this.pose.lid = W(this.pose.lid, i.lid, a), this.pose.blush = W(this.pose.blush, i.blush, a);
		let o = 1 - Math.exp(-t / .12);
		this.look.x = W(this.look.x, this.lookTarget.x, o), this.look.y = W(this.look.y, this.lookTarget.y + i.lookY, o);
		let s = +!this.reduced, c = Math.sin(r * Math.PI * 2 / 3.8) * s, l = (Math.sin(r * .45) * 1.6 + this.look.x * 5) * s, u = c * 1.2, d = 0, f = 0, p = 1, m = 0, h = this.gesture, g = h ? (e - h.at) / V[h.g] : 0;
		if (h && s) {
			let t = (e - h.at) / V[h.g];
			if (t >= 1) this.gesture = null;
			else {
				let e = Math.sin(Math.PI * Math.min(1, t));
				switch (h.g) {
					case "wave":
						m = -150 * Math.min(1, t * 4) + Math.sin(t * Math.PI * 7) * 18 * e, l += 6 * e;
						break;
					case "nod":
						u += Math.abs(Math.sin(t * Math.PI * 2)) * 9;
						break;
					case "shake":
						l += Math.sin(t * Math.PI * 4) * 9 * e;
						break;
					case "point":
						m = -95 * Math.min(1, t * 3) * (t > .8 ? (1 - t) / .2 : 1);
						break;
					case "think":
						l += 5 * e;
						break;
					case "dance":
						f = Math.sin(t * Math.PI * 6) * 4, d = -Math.abs(Math.sin(t * Math.PI * 6)) * 8, l += Math.sin(t * Math.PI * 6 + 1) * 6;
						break;
					case "bow":
						u += e * 14, p = 1 - e * .04;
						break;
					case "celebrate": d = -Math.abs(Math.sin(t * Math.PI * 4)) * 14, m = -160 * e;
				}
			}
		}
		n.root && (n.root.style.transform = `translateY(${d}px) rotate(${f}deg) scaleY(${p})`), n.body && (n.body.style.transform = `scaleY(${1 + c * .008})`), n.head && (n.head.style.transform = `translateY(${u}px) rotate(${l}deg)`);
		let _ = -l * .55 - Math.sin((r - .35) * .45) * 1.8 * s + (d ? Math.sin(r * 9) * 3 : 0);
		n.tailL && (n.tailL.style.transform = `rotate(${_}deg)`), n.tailR && (n.tailR.style.transform = `rotate(${_}deg)`), n.hairBack && (n.hairBack.style.transform = `translateY(${u * .6}px) rotate(${l * .7}deg)`), n.armR && (n.armR.style.transform = `rotate(${m}deg)`);
		let v = this.pose.lid;
		if (e >= this.blink.next && (this.blink.at = e, this.blink.double = Math.random() < .18, this.blink.next = e + 2200 + Math.random() * 3800), this.blink.at) {
			let t = e - this.blink.at, n = (e) => e < 120 ? 1 - e / 120 : e < 230 ? (e - 120) / 110 : 1, r = n(t);
			this.blink.double && t > 230 && (r = n(t - 230)), v *= Math.max(.06, r), t > (this.blink.double ? 470 : 240) && (this.blink.at = 0);
		}
		let y = v < .2;
		for (let [e, t] of [[n.eyeOpenL, n.eyeClosedL], [n.eyeOpenR, n.eyeClosedR]]) e && (e.style.transform = `scaleY(${v})`, e.style.opacity = y ? "0" : "1"), t && (t.style.opacity = y ? "1" : "0");
		let b = this.look.x * 5, x = this.look.y * 3.5;
		n.irisL && (n.irisL.style.transform = `translate(${b}px, ${x}px)`), n.irisR && (n.irisR.style.transform = `translate(${-b}px, ${x}px)`), n.browL && (n.browL.style.transform = `translateY(${this.pose.browY - this.pose.browAsym}px) rotate(${this.pose.browRot}deg)`), n.browR && (n.browR.style.transform = `translateY(${this.pose.browY + this.pose.browAsym}px) rotate(${-this.pose.browRot}deg)`);
		for (let e of this.blushes) e.style.opacity = String(this.pose.blush);
		let S = 0, C = "X";
		if (this.speech) {
			let t = (e - this.speech.at) / 1e3, n = this.opt.levelProvider?.(), r = t % Math.max(.5, this.speech.seq.length / 4.5 + .3);
			S = n ?? ie(r, this.speech.seq), C = re(this.speech.seq, r), C === "X" && (C = "A"), S *= ae[C];
		}
		this.level = oe(this.level, S, t || .016);
		let w = this.level, T = U(w * 1.6, 0, 1), E = (e, t) => {
			let n = this.mouths[e];
			n && (n.style.opacity = String(t));
		};
		if (this.speech || w > .03) {
			for (let e of H) E(e, e === C ? T : 0);
			E("smile", 0), E("sad", 0), E("X", 1 - T);
		} else {
			for (let e of H) E(e, 0);
			E("smile", +(i.mouth === "smile")), E("sad", +(i.mouth === "sad")), E("O", i.mouth === "O" ? .9 : 0), E("X", +(i.mouth === "X"));
		}
		n.mouth && (n.mouth.style.transform = `scale(${1 + w * .12})`);
		let D = (e, t, n = 0) => {
			e && (e.style.opacity = t ? "1" : "0", t && s && (e.style.transform = `translateY(${Math.sin(r * 3 + n) * 2}px)`));
		};
		if (D(n.fxSparkle, i.fx === "sparkle", 0), D(n.fxThink, i.fx === "think", 1), D(n.fxSweat, i.fx === "sweat", 2), D(n.fxZzz, i.fx === "zzz", 3), D(n.fxHearts, h?.g === "celebrate" || h?.g === "bow", 4), this.mesh) {
			let e = Object.fromEntries(z.map((e) => [e, 0]));
			this.speech || w > .03 ? (e[C] = T, e.X = 1 - T) : i.mouth === "O" ? e.O = .9 : e[i.mouth] = 1, this.mesh.apply({
				t: r,
				motion: s,
				breath: c,
				headRot: l,
				headY: u,
				rootY: d,
				rootRot: f,
				rootScale: p,
				armRot: m,
				tail: _,
				eyeK: v,
				eyeClosed: y,
				lookX: this.look.x,
				lookY: this.look.y,
				browY: this.pose.browY,
				browRot: this.pose.browRot,
				browAsym: this.pose.browAsym,
				blush: this.pose.blush,
				mouth: e,
				level: w,
				fx: {
					sparkle: i.fx === "sparkle",
					think: i.fx === "think",
					sweat: i.fx === "sweat",
					zzz: i.fx === "zzz",
					hearts: h?.g === "celebrate" || h?.g === "bow"
				}
			});
		}
		this.l2d && this.l2d.frame({
			dt: t,
			lookX: this.look.x,
			lookY: this.look.y,
			mouth: w,
			speaking: !!this.speech,
			emotion: this.emotion,
			lid: this.pose.lid,
			gesture: h && g < 1 ? {
				g: h.g,
				p: g
			} : null,
			reduced: this.reduced
		});
	}
};
//#endregion
//#region src/companion/companionModel.ts
function K(e) {
	return e === "dot" || e === "stage" ? e : "mini";
}
function se(e, t, n) {
	return e === "dot" ? {
		mode: "mini",
		panel: !1
	} : e === "mini" ? {
		mode: n ? "mini" : "stage",
		panel: !0
	} : {
		mode: "stage",
		panel: !t
	};
}
var ce = [
	"neutral",
	"happy",
	"excited",
	"thinking",
	"sad",
	"surprised",
	"focused",
	"sleepy",
	"listening"
], le = [
	"wave",
	"nod",
	"shake",
	"point",
	"think",
	"dance",
	"bow",
	"celebrate"
], q = {
	owner: {
		x: null,
		y: 0
	},
	screen: {
		x: 0,
		y: -.3
	},
	left: {
		x: -1,
		y: 0
	},
	right: {
		x: 1,
		y: 0
	},
	up: {
		x: 0,
		y: -1
	},
	down: {
		x: 0,
		y: 1
	}
};
function ue(e) {
	let t = {};
	if (!e) return t;
	let n = e.action || "say";
	return n === "say" && typeof e.text == "string" && e.text.trim() && (t.say = e.text.trim().slice(0, 600)), n === "idle" && (t.emotion = "neutral"), e.emotion && ce.includes(e.emotion) && (t.emotion = e.emotion), e.gesture && le.includes(e.gesture) && (t.gesture = e.gesture), n === "look" && e.target && q[e.target] && (t.look = q[e.target]), n === "move" && (e.to === "left" || e.to === "center" || e.to === "right") && (t.move = e.to), t;
}
function J(e) {
	return Math.min(14e3, 2500 + e.length * 45);
}
//#endregion
//#region src/lib/sse.ts
function Y(e) {
	return e.split("\n").filter((e) => e.startsWith("data:") && !e.includes("[DONE]")).map((e) => {
		try {
			return JSON.parse(e.slice(5)).choices?.[0]?.delta?.content || "";
		} catch {
			return "";
		}
	}).filter(Boolean);
}
//#endregion
//#region src/companion/hero.ts
var de = "[data-slot=\"assistant-stage\"]", fe = "[data-slot=\"assistant-avatar\"]:not([data-own])", pe = () => typeof document > "u" ? null : document.querySelector(de), me = () => typeof document > "u" ? null : document.querySelector(fe);
function he(e) {
	return e.tucked === null ? e.heroOnScreen ? "hero" : "avatar" : e.tucked ? "hero" : "avatar";
}
function ge(e, t, n, r = 150) {
	let i = !0, a = () => he({
		tucked: t ? t.classList.contains("is-tucked") : null,
		heroOnScreen: i
	}), o = a(), s, c = () => {
		clearTimeout(s), s = setTimeout(() => {
			let e = a();
			e !== o && (o = e, n(e));
		}, r);
	}, l = t && typeof MutationObserver < "u" ? new MutationObserver(c) : null;
	l?.observe(t, {
		attributes: !0,
		attributeFilter: ["class"]
	});
	let u = !t && typeof IntersectionObserver < "u" ? new IntersectionObserver((e) => {
		i = e.some((e) => e.isIntersecting), c();
	}) : null;
	return u?.observe(e), n(o), () => {
		clearTimeout(s), l?.disconnect(), u?.disconnect();
	};
}
var X = (e) => !!e.closest("button, a[href]");
function _e() {
	let e = document.querySelector("[data-open-ast]") || document.querySelector(".jx-assistant__avatar:not([data-own])");
	return e ? (e.click(), !0) : !1;
}
//#endregion
//#region src/core/brainError.ts
function ve(e) {
	let t = e instanceof Error ? e.message : String(e ?? ""), n = Number((t.match(/\b([1-5]\d\d)\b/) || [])[1] || 0);
	return n === 401 || n === 403 ? "Đang chờ cập nhật máy chủ, chat sẽ dùng được sau ít phút." : n === 429 ? "Đang hơi đông, anh đợi chút rồi nhắn lại nhé." : n >= 500 ? "Máy chủ JAVIS đang bận, anh thử lại sau ít phút nhé." : /failed to fetch|network|load failed|aborted|timeout/i.test(t) ? "Mất kết nối tới JAVIS, anh kiểm tra mạng giúp em rồi thử lại nhé." : "Chưa kết nối được JAVIS, anh thử lại sau ít phút nhé.";
}
//#endregion
//#region src/companion/element.ts
var ye = "\n:host{all:initial;position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:80;font-family:'Be Vietnam Pro',-apple-system,BlinkMacSystemFont,system-ui,sans-serif,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji';font-size:14px;line-height:1.45;color:var(--jx-text,#F3F1EA);\n  --bg0:var(--jx-bg-0,var(--jx-bg,#070916));--bg1:var(--jx-bg-1,#0b0e22);--bg2:var(--jx-bg-2,#141833);--gold:var(--jx-gold,var(--jx-accent,#F5B83D));--gold-t:var(--jx-gold-text,var(--gold));--on-gold:var(--jx-on-gold,#1a1405);--violet:var(--jx-violet,#7C6CFF);--cyan:var(--jx-cyan,#4FD1E8);--line:var(--jx-line,rgba(255,255,255,.09));--fg2:var(--jx-text-2,#A9AECB);--fg3:var(--jx-text-3,#7D83A6);--sf:var(--jx-surface,rgba(255,255,255,.04));--sf2:var(--jx-surface-2,rgba(255,255,255,.07));--shadow:var(--jx-shadow,0 16px 40px -16px rgba(0,0,0,.9))}\n@media(min-width:821px){:host{right:24px}}\n:host([hidden]){display:none}.wrap{position:relative;display:inline-block}:host([compact]) .ai{display:none}:host([compact]) .avatar{border-width:1px}*{box-sizing:border-box}\n.avatar{position:relative;width:var(--jc-size,64px);height:var(--jc-size,64px);border-radius:50%;padding:0;cursor:pointer;border:2px solid color-mix(in srgb,var(--gold) 70%,transparent);background:radial-gradient(circle at 50% 30%,var(--bg2),var(--bg0) 80%);\n  box-shadow:var(--shadow),0 0 28px -4px color-mix(in srgb,var(--violet) 55%,transparent);display:block;-webkit-tap-highlight-color:transparent}\n.portrait{position:absolute;inset:0;border-radius:50%;overflow:hidden}.portrait svg,.portrait canvas,.figure canvas,.head .pf img{width:100%;height:100%;display:block}\n.credit{margin:0;display:flex;flex-direction:column;gap:1px;font-size:10px;line-height:1.3;color:var(--fg3)}.credit span:last-child{color:var(--fg2)}.panel .credit{flex:none;padding:6px 12px;border-bottom:1px solid var(--line);background:var(--bg2)}.hello .credit{margin-top:6px;padding-top:5px;border-top:1px solid var(--line);font-size:9px}\n.stage .credit{position:absolute;left:50%;bottom:-40px;transform:translateX(-50%);width:max-content;max-width:240px;text-align:center;font-size:8.5px;opacity:.72;pointer-events:none}.stage .credit span:last-child{display:none}\n.ai{position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);font-size:9px;font-weight:700;letter-spacing:.04em;padding:1px 6px;border-radius:999px;background:var(--bg0);color:var(--fg2);border:1px solid var(--line);white-space:nowrap;pointer-events:none}\n.dot{width:48px;height:48px;border-radius:50%;border:1px solid color-mix(in srgb,var(--gold) 45%,transparent);background:radial-gradient(circle at 50% 35%,var(--bg2),var(--bg0) 75%);color:var(--gold);font-size:20px;display:grid;place-items:center;cursor:pointer;padding:0}\n.stage{position:fixed;width:176px;height:264px;right:24px;bottom:calc(44px + env(safe-area-inset-bottom,0px));z-index:81;touch-action:none;user-select:none;cursor:grab;filter:drop-shadow(0 18px 24px color-mix(in srgb,var(--bg0) 55%,transparent));animation:stepout .5s cubic-bezier(.2,.8,.2,1) both}\n.stage.placed{right:auto;bottom:auto}.figure{position:absolute;inset:0}.figure svg{width:100%;height:100%;display:block;overflow:visible}\n.name{position:absolute;left:50%;bottom:-24px;transform:translateX(-50%);white-space:nowrap;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;background:color-mix(in srgb,var(--bg1) 72%,transparent);border:1px solid var(--line);backdrop-filter:blur(10px);pointer-events:none}\n.name small{font-weight:500;color:var(--fg3);margin-left:6px}\n.tools{position:absolute;top:8px;right:-6px;display:flex;flex-direction:column;gap:6px;opacity:0;transition:opacity .2s}.stage:hover .tools,.open .tools{opacity:1}@media(hover:none){.tools{opacity:1}}\n.tools button{width:32px;height:32px;border-radius:50%;border:1px solid var(--line);background:color-mix(in srgb,var(--bg1) 72%,transparent);color:var(--fg2);display:grid;place-items:center;cursor:pointer;padding:0;font-size:14px}\n.hello{position:absolute;right:0;bottom:calc(100% + 12px);width:max-content;max-width:min(300px,calc(100vw - 32px));padding:10px 14px;border-radius:16px 16px 4px 16px;background:color-mix(in srgb,var(--bg1) 80%,transparent);border:1px solid color-mix(in srgb,var(--gold) 35%,var(--line));backdrop-filter:blur(16px);box-shadow:var(--shadow);animation:pop .28s cubic-bezier(.2,.8,.2,1) both}\n.stage .hello{bottom:calc(100% - 8px);right:0}.open .stage .hello{max-width:176px}.hello b{color:var(--gold-t)}\n.panel{position:fixed;z-index:82;right:calc(24px + 176px + 16px);bottom:calc(16px + env(safe-area-inset-bottom,0px));width:400px;height:min(560px,calc(100dvh - 120px));display:flex;flex-direction:column;overflow:hidden;background:color-mix(in srgb,var(--bg1) 94%,transparent);border:1px solid var(--line);border-radius:24px;box-shadow:var(--shadow);backdrop-filter:blur(20px);animation:pop .26s cubic-bezier(.2,.7,.2,1) both}\n@media(max-width:820px){.panel{left:0;right:0;width:auto;top:auto;bottom:0;height:min(70vh,70dvh);border-radius:24px 24px 0 0;background:var(--bg1)}.stage{display:none}}\n.head{display:flex;align-items:center;gap:8px;padding:10px 8px 10px 12px;border-bottom:1px solid var(--line)}.head .pf{width:40px;height:40px;border-radius:50%;overflow:hidden;border:1.5px solid color-mix(in srgb,var(--gold) 60%,transparent);background:var(--bg2);flex:none}.head .pf svg{width:100%;height:100%;display:block}\n.head .who{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}.head b{font-size:15px}.head small{font-size:12px;color:var(--fg3)}\n.ib{min-width:40px;height:40px;border-radius:12px;border:1px solid transparent;background:transparent;color:var(--fg2);cursor:pointer;padding:0 8px;font:inherit;font-size:13px;font-weight:600}.ib:hover,.ib.on{color:inherit;background:var(--bg2);border-color:var(--line)}\n.log{flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}\n.msg{max-width:86%;padding:9px 12px;border-radius:16px;white-space:pre-wrap;word-break:break-word}.me{align-self:flex-end;background:color-mix(in srgb,var(--violet) 32%,var(--bg2));border:1px solid color-mix(in srgb,var(--violet) 45%,transparent);border-bottom-right-radius:6px}\n.aim{align-self:flex-start;background:var(--sf2);border:1px solid var(--line);border-bottom-left-radius:6px}.empty{color:var(--fg3)}\n.sess{display:flex;flex-direction:column;gap:4px;list-style:none;margin:0;padding:0}.sess button{all:unset;cursor:pointer;min-height:48px;padding:6px 12px;border-radius:10px;border:1px solid var(--line);background:var(--sf);display:flex;flex-direction:column;justify-content:center}.sess .on{border-color:color-mix(in srgb,var(--gold) 60%,transparent)}.sess small{font-size:12px;color:var(--fg3)}\n.bar{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--line);align-items:flex-end}\ntextarea{flex:1;min-height:44px;max-height:116px;resize:none;padding:11px 14px;border-radius:16px;border:1px solid var(--line);background:var(--bg0);color:inherit;font:inherit;font-size:16px;outline:0}textarea:focus{border-color:color-mix(in srgb,var(--gold) 60%,transparent)}\n.send{width:44px;height:44px;border-radius:50%;border:0;background:var(--gold);color:var(--on-gold);cursor:pointer;font-size:18px}.send:disabled{background:var(--bg2);color:var(--fg3)}\n@keyframes pop{from{opacity:0;transform:translateY(6px) scale(.96)}}@keyframes stepout{from{opacity:0;transform:translateY(24px) scale(.6)}}\n@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}", be = "\n:host{all:initial;position:absolute;inset:0;display:block;border-radius:inherit;z-index:1;font-family:'Be Vietnam Pro',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:var(--jx-text,#F3F1EA)}\n*{box-sizing:border-box}\n.hero,.avatar{all:unset;position:absolute;inset:0;display:block;border-radius:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}\n.hero:focus-visible,.avatar:focus-visible{box-shadow:inset 0 0 0 2px var(--jx-gold-text,#F5B83D)}\n.figure,.portrait{position:absolute;inset:0;border-radius:inherit;overflow:hidden}\n.figure canvas,.figure svg,.figure img,.portrait canvas,.portrait svg,.portrait img{width:100%;height:100%;display:block}\n.credit{position:absolute;left:0;right:0;bottom:0;margin:0;padding:12px 6px 5px;font-size:9.5px;line-height:1.2;text-align:center;color:var(--jx-text-2,#A9AECB);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;\n  background:linear-gradient(transparent,color-mix(in srgb,var(--jx-bg-1,#0b0e22) 82%,transparent) 60%)}\n.tools{position:absolute;top:6px;right:6px;display:flex;gap:4px;opacity:0;transition:opacity .2s}\n.hero:hover .tools,.hero:focus-within .tools{opacity:1}\n@media(hover:none){.tools{display:none}}\n.tools button,.on{width:32px;height:32px;border-radius:50%;border:1px solid var(--jx-line-2,rgba(255,255,255,.16));background:color-mix(in srgb,var(--jx-bg-1,#0b0e22) 72%,transparent);color:var(--jx-text-2,#A9AECB);display:grid;place-items:center;cursor:pointer;padding:0;backdrop-filter:blur(8px)}\n.tools button:hover{color:var(--jx-text,#F3F1EA);border-color:var(--jx-gold,#F5B83D)}\n.on{position:absolute;right:6px;bottom:6px;width:auto;height:32px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;white-space:nowrap;font-family:inherit;font-size:11px;font-weight:600;line-height:1;color:var(--jx-gold-text,#F5B83D);gap:4px}\n@media(max-width:767px){.credit{font-size:8px;line-height:1.15;white-space:normal;padding:10px 3px 3px}.on{font-size:10px;padding:0 8px}}\n@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}", xe = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5\"/></svg>", Se = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M18.4 5.6a9 9 0 1 1-12.8 0M12 2v10\"/></svg>", Z = (e) => String(e ?? "").replace(/[&<>"']/g, (e) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[e]), Q = () => Math.random().toString(36).slice(2, 9), $ = class extends HTMLElement {
	static get observedAttributes() {
		return [
			"character",
			"mode",
			"fleet",
			"token"
		];
	}
	root;
	rigs = /* @__PURE__ */ new Set();
	ch = l[0];
	mode = "mini";
	open = !1;
	view = "log";
	msgs = [];
	sessions = [];
	sid = "";
	busy = !1;
	bubble = null;
	pos = null;
	es = null;
	level = 0;
	audioLevel = () => null;
	slotEl = null;
	heroEl = null;
	frameEl = null;
	active = "hero";
	unwatch = null;
	unsnap = null;
	saved = /* @__PURE__ */ new Map();
	constructor() {
		super(), this.root = this.attachShadow({ mode: "open" });
	}
	connectedCallback() {
		this.ch = u(this.getAttribute("character") || localStorage.getItem("javis.companion.character")), this.mode = K(this.getAttribute("mode") || localStorage.getItem("javis.companion.mode")), this.slotEl = me(), this.heroEl = pe(), this.frameEl = this.slotEl?.closest(".jx-assistant") ?? null, this.heroEl && this.mode === "stage" && (this.mode = "mini");
		let e = document.createElement("style");
		e.textContent = ye, this.root.appendChild(e), this.heroEl && (this.unsnap = A((e) => {
			e === this.ch.id && this.pageExtras(!0);
		})), this.heroEl ? this.unwatch = ge(this.heroEl, this.frameEl, (e) => {
			this.active = e, this.render();
		}) : this.render(), this.getAttribute("stream") === "1" && this.listen(), localStorage.getItem("javis.companion.hello") || setTimeout(() => {
			localStorage.setItem("javis.companion.hello", "1"), this.each((e) => e.doGesture("wave")), this.heroEl || this.showBubble(this.ch.greeting);
		}, 1400);
	}
	disconnectedCallback() {
		this.unwatch?.(), this.unwatch = null, this.unsnap?.(), this.unsnap = null, this.each((e) => e.destroy()), this.rigs.clear(), this.es?.close(), this.restoreSlots(), this.pageExtras(!1);
	}
	attributeChangedCallback(e, t, n) {
		this.isConnected && (e === "character" && n && this.setCharacter(n), e === "mode" && n && (this.mode = K(n), this.render()));
	}
	setCharacter(e) {
		let t = u(e);
		t.id !== this.ch.id && (this.ch = t, localStorage.setItem("javis.companion.character", t.id), this.each((e) => e.setCharacter(t)), this.render(), this.showBubble(t.greeting), this.each((e) => {
			e.setEmotion("happy", 4e3), e.doGesture("wave");
		}));
	}
	say(e, t = {}) {
		this.act({
			action: "say",
			text: e,
			emotion: t.emotion,
			gesture: t.gesture
		}, t.voice !== !1);
	}
	act(e, t = !0) {
		let n = ue(e);
		n.emotion && this.each((e) => e.setEmotion(n.emotion, 6e3)), n.gesture && this.each((e) => e.doGesture(n.gesture)), n.look && this.each((e) => e.lookAt(n.look.x, n.look.y)), n.say && (this.mode === "mini" && innerWidth > 820 && !this.heroEl && (this.mode = "stage", this.render()), this.showBubble(n.say), this.dispatchEvent(new CustomEvent("javis-companion-say", {
			detail: { text: n.say },
			bubbles: !0,
			composed: !0
		})), t && this.speak(n.say));
	}
	get fps() {
		return [...this.rigs][0]?.fps ?? 0;
	}
	get activeSlot() {
		return this.heroEl ? this.active : null;
	}
	get rigCount() {
		return this.rigs.size;
	}
	get fleet() {
		return (this.getAttribute("fleet") || localStorage.getItem("javis:fleet") || "").replace(/\/$/, "");
	}
	headers() {
		let e = { "Content-Type": "application/json" }, t = this.getAttribute("token") || localStorage.getItem("javis:token");
		return t && (e.Authorization = "Bearer " + t), e;
	}
	async api(e, t, n) {
		let r = await fetch(this.fleet + t, {
			method: e,
			headers: this.headers(),
			credentials: this.fleet ? "include" : "same-origin",
			body: n === void 0 ? void 0 : JSON.stringify(n)
		});
		if (!r.ok) throw Error(String(r.status));
		return r.json();
	}
	listen() {
		try {
			let e = this.getAttribute("token") || localStorage.getItem("javis:token");
			this.es = new EventSource(this.fleet + "/fleet/stream?v=2" + (e ? "&token=" + encodeURIComponent(e) : ""), { withCredentials: !!this.fleet }), this.es.onmessage = (e) => {
				try {
					let t = JSON.parse(e.data);
					t.type === "avatar.command" && this.act(t.data);
				} catch {}
			};
		} catch {}
	}
	async loadChat() {
		try {
			let e = await this.api("GET", "/fleet/chat");
			this.sessions = e.sessions || [], this.sid = e.active || this.sid || "s-" + Date.now().toString(36), this.msgs = (e.session?.messages || []).map((e) => ({
				id: e.id,
				role: e.role,
				text: e.text
			}));
		} catch {
			this.sid ||= "s-" + Date.now().toString(36);
		}
		this.renderPanel();
	}
	async restore(e) {
		try {
			let t = await this.api("GET", "/fleet/chat/sessions/" + encodeURIComponent(e));
			this.sid = e, this.msgs = (t.messages || []).map((e) => ({
				id: e.id,
				role: e.role,
				text: e.text
			})), this.api("POST", "/fleet/chat/active", {
				session_id: e,
				client_id: "wc"
			}).catch(() => {});
		} catch {}
		this.view = "log", this.renderPanel();
	}
	async send(e) {
		if (!e.trim() || this.busy) return;
		this.busy = !0;
		let t = Date.now(), n = {
			id: "u-" + t,
			role: "user",
			text: e
		}, r = {
			id: "a-" + t,
			role: "assistant",
			text: "…"
		};
		this.msgs.push(n, r), this.renderPanel(), this.each((e) => e.setBaseEmotion("thinking")), this.api("POST", "/fleet/chat/messages", {
			session_id: this.sid,
			message: {
				...n,
				time: "",
				pending: !1
			},
			client_id: "wc"
		}).catch(() => {});
		try {
			let t = await fetch(this.fleet + "/fleet/voice/chat", {
				method: "POST",
				headers: this.headers(),
				credentials: this.fleet ? "include" : "same-origin",
				body: JSON.stringify({
					text: e,
					session_id: this.sid,
					chat_session_id: this.sid,
					stream: !0,
					execute: !0,
					tools: !0
				})
			});
			if (!t.ok || !t.body) throw Error(String(t.status));
			let n = t.body.getReader(), i = new TextDecoder(), a = "", o = "";
			for (this.each((e) => {
				e.setBaseEmotion("happy"), e.speak("");
			});;) {
				let { done: e, value: t } = await n.read();
				if (e) break;
				a += i.decode(t, { stream: !0 });
				let s = a.lastIndexOf("\n\n");
				if (!(s < 0)) {
					for (let e of Y(a.slice(0, s))) o += e;
					a = a.slice(s + 2), r.text = o || "…", this.renderPanel();
				}
			}
			for (let e of Y(a)) o += e;
			r.text = o.trim() || "Dạ anh!", this.api("POST", "/fleet/chat/messages", {
				session_id: this.sid,
				message: {
					...r,
					time: ""
				},
				client_id: "wc"
			}).catch(() => {}), this.each((e) => {
				e.stopSpeaking(), e.doGesture("nod");
			}), localStorage.getItem("javis:voice") === "1" && this.speak(r.text);
		} catch (e) {
			r.text = ve(e), this.each((e) => {
				e.stopSpeaking(), e.setEmotion("sad", 3e3);
			});
		}
		this.busy = !1, this.each((e) => e.setBaseEmotion("neutral")), this.renderPanel();
	}
	async speak(e) {
		this.each((t) => t.speak(e));
		try {
			let t = await fetch(this.fleet + "/fleet/voice/tts", {
				method: "POST",
				headers: this.headers(),
				credentials: this.fleet ? "include" : "same-origin",
				body: JSON.stringify({
					text: e,
					voice: this.ch.voice
				})
			});
			if (!t.ok || (t.headers.get("Content-Type") || "").includes("json")) throw Error("degraded");
			let n = URL.createObjectURL(await t.blob()), r = new Audio(n), i = window.AudioContext || window.webkitAudioContext, a = null;
			if (i) {
				let e = new i();
				a = e.createAnalyser(), a.fftSize = 256, e.createMediaElementSource(r).connect(a), a.connect(e.destination);
				let t = new Float32Array(a.fftSize);
				this.audioLevel = () => {
					a.getFloatTimeDomainData(t);
					let e = 0;
					for (let n = 0; n < t.length; n++) e += t[n] * t[n];
					let n = Math.sqrt(e / t.length);
					return this.level += (Math.min(1, Math.max(0, (n - .01) * 4.2)) - this.level) * .5, this.level;
				};
			}
			await new Promise((e) => {
				r.onended = () => e(), r.onerror = () => e(), r.play().catch(() => e());
			}), URL.revokeObjectURL(n);
		} catch {
			"speechSynthesis" in window ? await new Promise((t) => {
				let n = new SpeechSynthesisUtterance(e);
				n.lang = "vi-VN", n.onend = n.onerror = () => t(), speechSynthesis.speak(n);
			}) : await new Promise((t) => setTimeout(t, 600 + e.length * 55));
		}
		this.audioLevel = () => null, this.each((e) => e.stopSpeaking());
	}
	each(e) {
		this.rigs.forEach(e);
	}
	showBubble(e) {
		this.bubble = {
			text: e,
			until: Date.now() + J(e)
		}, this.renderBubble(), setTimeout(() => {
			this.bubble && Date.now() >= this.bubble.until && (this.bubble = null, this.renderBubble());
		}, J(e) + 20);
	}
	get assetBase() {
		let e = this.getAttribute("asset-base");
		if (e) return e.replace(/\/?$/, "/");
		try {
			return new URL(
				/* @vite-ignore */
				"./",
				import.meta.url
			).href;
		} catch {
			return "/ui/";
		}
	}
	get live2dBase() {
		let e = this.getAttribute("live2d-base");
		if (e) return e.replace(/\/?$/, "/");
		try {
			return new URL(
				/* @vite-ignore */
				"../live2d/",
				import.meta.url
			).href;
		} catch {
			return "/live2d/";
		}
	}
	mount(e, t, n = !1) {
		let r = new G(e, this.ch, {
			portrait: t,
			bust: n,
			levelProvider: () => this.audioLevel(),
			trackPointer: !t,
			live2dBase: this.live2dBase,
			assetBase: this.assetBase,
			onLive2DError: () => {
				d(this.ch) && (this.ch = o[0], localStorage.setItem("javis.companion.character", this.ch.id), this.render());
			}
		});
		return r.start(), this.rigs.add(r), r;
	}
	credit(e = !1) {
		return d(this.ch) ? `<p class="credit" data-credit="live2d"><span lang="en">${e ? i : r}</span><span>${a}</span></p>` : "";
	}
	tap = () => {
		let e = se(this.mode, this.open, innerWidth <= 820);
		this.mode = e.mode, localStorage.setItem("javis.companion.mode", e.mode), this.dispatchEvent(new CustomEvent("javis-companion-open", {
			detail: { mode: e.mode },
			bubbles: !0,
			composed: !0
		})), this.open = !this.hasAttribute("no-chat") && e.panel, this.open && (this.each((e) => e.setEmotion("happy", 2500)), this.loadChat()), this.render();
	};
	render() {
		this.each((e) => e.destroy()), this.rigs.clear();
		for (let e of [...this.root.childNodes]) e.nodeName !== "STYLE" && e.remove();
		this.restoreSlots();
		let e = document.createElement("div");
		if (e.className = "wrap" + (this.open ? " open" : ""), this.root.appendChild(e), this.heroEl) {
			this.renderHeroPage(e);
			return;
		}
		let t = innerWidth <= 820;
		if (this.mode === "dot") {
			e.innerHTML = "<button class=\"dot\" aria-label=\"Bật lại nhân vật JAVIS\"><svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z\"/></svg></button>", e.querySelector("button").onclick = this.tap;
			return;
		}
		let n = this.mode === "mini" || t;
		if (n && this.slotEl) this.renderAvatarSlot(this.slotEl);
		else if (n) {
			let t = document.createElement("button");
			t.className = "avatar", t.setAttribute("aria-label", `${this.ch.name} · JAVIS` + (d(this.ch) ? " · " + r : "")), t.title = this.ch.name + (d(this.ch) ? "\n" + r : ""), t.innerHTML = `<span class="portrait"></span><span class="ai">${d(this.ch) ? "© Live2D" : Z(this.ch.label)}</span>`, t.onclick = this.tap, e.appendChild(t), this.mount(t.querySelector(".portrait"), !0);
		}
		if (this.mode === "stage" && !t) {
			let t = document.createElement("div");
			t.className = "stage" + (this.pos ? " placed" : ""), t.setAttribute("role", "button"), t.tabIndex = 0, t.setAttribute("aria-label", `${this.ch.name} — bấm để chat, kéo để di chuyển`), this.pos && (t.style.left = this.pos.x + "px", t.style.top = this.pos.y + "px"), t.innerHTML = `<div class="figure"></div><span class="name">${Z(this.ch.name)}<small>${Z(this.ch.label)}</small></span>${this.credit(!0)}<div class="tools">
        <button data-a="chat" title="Chat" aria-label="Mở chat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.3A8 8 0 1 1 21 12z"/></svg></button><button data-a="next" title="Đổi nhân vật" aria-label="Đổi nhân vật"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></button><button data-a="mini" title="Thu nhỏ" aria-label="Thu về chân dung"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg></button><button data-a="off" title="Tắt nhân vật" aria-label="Tắt nhân vật"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.4 5.6a9 9 0 1 1-12.8 0M12 2v10"/></svg></button></div><span class="hello-slot"></span>`, e.appendChild(t), this.mount(t.querySelector(".figure"), !1), t.querySelector(".tools").addEventListener("click", (e) => {
				e.stopPropagation();
				let t = e.target.closest("button")?.dataset.a;
				if (t === "chat" && (this.open = !this.open, this.open && this.loadChat(), this.render()), t === "next") {
					let e = l.findIndex((e) => e.id === this.ch.id);
					this.setCharacter(l[(e + 1) % l.length].id);
				}
				t === "mini" && (this.open = !1, this.mode = "mini", localStorage.setItem("javis.companion.mode", "mini"), this.render()), t === "off" && (this.open = !1, this.mode = "dot", localStorage.setItem("javis.companion.mode", "dot"), this.render());
			});
			let n = null;
			t.onpointerdown = (e) => {
				if (e.target.closest("button")) return;
				let r = t.getBoundingClientRect();
				n = {
					sx: e.clientX,
					sy: e.clientY,
					ox: r.left,
					oy: r.top,
					moved: !1
				}, t.setPointerCapture(e.pointerId);
			}, t.onpointermove = (e) => {
				if (!n) return;
				let r = e.clientX - n.sx, i = e.clientY - n.sy;
				!n.moved && Math.hypot(r, i) < 6 || (n.moved = !0, this.pos = {
					x: Math.max(8, Math.min(innerWidth - 184, n.ox + r)),
					y: Math.max(8, Math.min(innerHeight - 272, n.oy + i))
				}, t.classList.add("placed"), t.style.left = this.pos.x + "px", t.style.top = this.pos.y + "px");
			}, t.onpointerup = t.onpointercancel = () => {
				if (!n) return;
				let e = n.moved;
				n = null, e || this.tap();
			}, t.onkeydown = (e) => {
				(e.key === "Enter" || e.key === " ") && (e.preventDefault(), this.tap());
			};
		}
		this.open && this.appendPanel(e), this.renderBubble();
	}
	appendPanel(e) {
		let t = document.createElement("section");
		t.className = "panel", t.setAttribute("role", "dialog"), t.setAttribute("aria-label", `${this.ch.name} · JAVIS`), e.appendChild(t), this.renderPanel();
	}
	slotRoot(e, t = !1) {
		let n = this.saved.get(e);
		n || (n = [...e.childNodes], this.saved.set(e, n));
		let r = document.createElement("span");
		r.className = "jc-slot", r.dataset.jc = "1", e.replaceChildren(...t ? n : [], r);
		let i = r.attachShadow({ mode: "open" }), a = document.createElement("style");
		return a.textContent = be, i.appendChild(a), i;
	}
	restoreSlots() {
		for (let [e, t] of this.saved) e.replaceChildren(...t);
		this.saved.clear();
	}
	renderAvatarSlot(e) {
		let t = this.slotRoot(e), n = !X(e), i = document.createElement(n ? "button" : "span");
		i.className = "avatar", n && (i.setAttribute("aria-label", `${this.ch.name} · JAVIS` + (d(this.ch) ? " · " + r : "")), i.onclick = this.tap), i.title = this.ch.name + (d(this.ch) ? "\n" + r : ""), i.innerHTML = "<span class=\"portrait\"></span>", t.appendChild(i), this.mount(i.querySelector(".portrait"), !0);
	}
	renderHeroPage(e) {
		let t = this.heroEl;
		if (this.mode === "dot") {
			let e = this.slotRoot(t, !0);
			e.innerHTML += "<button class=\"on\" type=\"button\" aria-label=\"Bật lại nhân vật JAVIS\"><svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z\"/></svg>Bật nhân vật</button>", e.querySelector(".on").onclick = (e) => {
				e.stopPropagation(), this.setMode("mini");
			};
		} else if (this.active === "hero") {
			let e = this.slotRoot(t), n = d(this.ch), i = document.createElement("div");
			i.className = "hero", i.setAttribute("role", "button"), i.tabIndex = 0, i.setAttribute("aria-label", `${this.ch.name} · JAVIS — bấm để nói chuyện` + (n ? " · " + r : "")), i.innerHTML = `<div class="figure"></div>${n ? `<p class="credit" data-credit="live2d" title="${Z(r)}">${Z(a)}</p>` : ""}<div class="tools"><button type="button" data-a="next" title="Đổi nhân vật" aria-label="Đổi nhân vật">${xe}</button><button type="button" data-a="off" title="Tắt nhân vật" aria-label="Tắt nhân vật">${Se}</button></div>`, e.appendChild(i), this.mount(i.querySelector(".figure"), !1, !0), i.onclick = (e) => {
				let t = e.target.closest("button")?.dataset.a;
				t ? (e.stopPropagation(), this.tool(t)) : this.openChat();
			}, i.onkeydown = (e) => {
				(e.key === "Enter" || e.key === " ") && e.target === i && (e.preventDefault(), this.openChat());
			};
		} else this.slotEl && this.renderAvatarSlot(this.slotEl);
		this.pageExtras(!0), this.open && this.appendPanel(e), this.renderBubble();
	}
	setMode(e) {
		this.mode = e, localStorage.setItem("javis.companion.mode", e), this.render();
	}
	tool(e) {
		if (e === "next") {
			let e = l.findIndex((e) => e.id === this.ch.id);
			this.setCharacter(l[(e + 1) % l.length].id);
		}
		e === "off" && (this.open = !1, this.setMode("dot")), e === "on" && this.setMode("mini");
	}
	openChat() {
		this.each((e) => e.setEmotion("happy", 2500)), this.dispatchEvent(new CustomEvent("javis-companion-open", {
			detail: {
				mode: this.mode,
				from: "hero"
			},
			bubbles: !0,
			composed: !0
		})), !(this.hasAttribute("no-chat") || _e()) && (this.open = !0, this.loadChat(), this.render());
	}
	pageExtras(e) {
		let t = this.frameEl?.querySelector(".jx-assistant__panel") || document.querySelector(".jx-assistant__panel:not([data-own])");
		if (!t) return;
		t.querySelector("[data-jc-bar]")?.remove();
		let n = t.querySelector(".jx-assistant__mini");
		if (n && (e && this.mode !== "dot" && (!d(this.ch) || k(this.ch.id)) ? (n.innerHTML = M(this.ch, "wcm-" + Q(), this.assetBase), n.style.overflow = "hidden") : (n.innerHTML = "", n.style.overflow = "")), !e) return;
		let i = document.createElement("div");
		i.dataset.jcBar = "1", i.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px 12px 6px 18px;border-bottom:1px solid var(--jx-line);font-size:11px;line-height:1.3;color:var(--jx-text-3)";
		let o = (e, t) => `<button type="button" data-a="${e}" style="flex:none;min-height:32px;padding:0 10px;border-radius:999px;border:1px solid var(--jx-line-2);background:var(--jx-surface);color:var(--jx-text-2);font:inherit;font-weight:600;cursor:pointer">${t}</button>`;
		i.innerHTML = (d(this.ch) && this.mode !== "dot" ? `<span data-credit="live2d" title="${Z(r)}" aria-label="${Z(r)}" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Z(a)}</span>` : `<span style="flex:1;min-width:0">${this.mode === "dot" ? "Nhân vật đang tắt" : Z(this.ch.name + " · " + this.ch.label)}</span>`) + (this.mode === "dot" ? o("on", "Bật nhân vật") : o("next", "Đổi") + o("off", "Tắt nhân vật")), i.onclick = (e) => {
			let t = e.target.closest("button")?.dataset.a;
			t && this.tool(t);
		}, t.querySelector(".jx-assistant__head")?.after(i);
	}
	renderBubble() {
		if (this.root.querySelectorAll(".hello").forEach((e) => e.remove()), this.heroEl) {
			this.pageBubble();
			return;
		}
		if (!this.bubble || this.mode === "dot") return;
		let e = this.root.querySelector(".stage") || this.root.querySelector(".wrap");
		if (!e) return;
		let t = document.createElement("div");
		t.className = "hello", t.setAttribute("role", "status"), t.innerHTML = `<b>${Z(this.ch.name)}:</b> ${Z(this.bubble.text)}`, t.onclick = () => {
			this.bubble = null, this.renderBubble();
		}, e.appendChild(t);
	}
	pageBubble() {
		let e = this.heroEl.closest(".jx-assistant-card")?.querySelector(".jx-assistant-card__bubble"), t = this.frameEl?.querySelector(".jx-assistant__hello"), n = this.bubble && this.mode !== "dot" ? this.bubble.text : null, r = (e, t) => {
			e && (e.dataset.jcOrig === void 0 && (e.dataset.jcOrig = e.textContent || ""), e.textContent = t ?? e.dataset.jcOrig);
		};
		if (r(e, this.active === "hero" ? n : null), t) {
			let e = t.dataset.jcSay === "1";
			r(t, this.active === "avatar" ? n : null), this.active === "avatar" && n ? (t.hidden = !1, t.dataset.jcSay = "1") : e && (t.hidden = !0, delete t.dataset.jcSay);
		}
	}
	renderPanel() {
		let e = this.root.querySelector(".panel");
		if (!e) return;
		let t = this.view === "sessions" ? `<ul class="sess">${this.sessions.length ? this.sessions.map((e) => `<li><button data-id="${Z(e.id)}" class="${e.id === this.sid ? "on" : ""}"><b>${Z(e.title || e.id)}</b><small>${e.id === this.sid ? "đang chat" : (e.count ?? 0) + " tin"}</small></button></li>`).join("") : "<li class=\"empty\">Chưa có phiên nào.</li>"}</ul>` : this.msgs.length ? this.msgs.map((e) => `<div class="msg ${e.role === "user" ? "me" : "aim"}">${Z(e.text)}</div>`).join("") : `<p class="empty">${Z(this.ch.greeting)}</p>`;
		e.innerHTML = `<header class="head"><span class="pf">${M(this.ch, "wc-" + Q(), this.assetBase)}</span><span class="who"><b>${Z(this.ch.name)} · JAVIS</b><small>${Z(this.ch.role)} · ${Z(this.ch.label)}</small></span>
      <button class="ib ${this.view === "sessions" ? "on" : ""}" data-a="sess">Phiên ${this.sessions.length || ""}</button><button class="ib" data-a="new" title="Trò chuyện mới">+ Mới</button><button class="ib" data-a="close" aria-label="Đóng">×</button></header>${this.credit(innerWidth <= 820)}
      <div class="log" role="log" aria-live="polite">${t}</div>
      <form class="bar"><textarea rows="1" placeholder="Hỏi ${Z(this.ch.name)} bất cứ gì…" aria-label="Nhắn JAVIS"></textarea><button class="send" type="submit" aria-label="Gửi" ${this.busy ? "disabled" : ""}>${this.busy ? "…" : "<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 19V5M5 12l7-7 7 7\"/></svg>"}</button></form>`;
		let n = e.querySelector(".log");
		n.scrollTop = n.scrollHeight, e.querySelector(".head").addEventListener("click", (e) => {
			let t = e.target.closest("button")?.dataset.a;
			t === "close" && (this.open = !1, this.render()), t === "sess" && (this.view = this.view === "sessions" ? "log" : "sessions", this.renderPanel()), t === "new" && (this.sid = "s-" + Date.now().toString(36) + "-" + Q(), this.msgs = [], this.view = "log", this.api("POST", "/fleet/chat/active", {
				session_id: this.sid,
				client_id: "wc"
			}).catch(() => {}), this.renderPanel());
		}), n.addEventListener("click", (e) => {
			let t = e.target.closest("button[data-id]")?.dataset.id;
			t && t !== this.sid ? this.restore(t) : t && (this.view = "log", this.renderPanel());
		});
		let r = e.querySelector("textarea"), i = e.querySelector("form");
		i.onsubmit = (e) => {
			e.preventDefault();
			let t = r.value.trim();
			t && (r.value = "", this.send(t));
		}, r.onkeydown = (e) => {
			e.key === "Enter" && !e.shiftKey && (e.preventDefault(), i.requestSubmit());
		}, this.busy || setTimeout(() => r.focus({ preventScroll: !0 }), 50);
	}
};
typeof customElements < "u" && !customElements.get("javis-companion") && customElements.define("javis-companion", $);
//#endregion
export { l as CHARACTERS, G as CompanionRig, $ as JavisCompanionElement, T as buildCharacterSvg };
