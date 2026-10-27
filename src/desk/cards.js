// src/desk/cards.js — the "hiển hoá" board: each intent becomes a card built
// from the JAVIS gateway API that already exists (same endpoints as the MCP tools
// javis_home_tasks, tai_cac_may, asset_list, alerts_list, exec_overview,
// results_view, spend_summary). All calls go same-origin to javis-desk://app/…,
// the main process adds the device key.

// ── tiny DOM helpers (textContent only, never innerHTML with data) ──
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

// ── gateway ──
export class GatewayError extends Error {
  constructor(status, code) {
    super(code || `http_${status}`);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(path, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new GatewayError(res.status, data && data.error);
  return data;
}

export function assetUrl(rel) {
  if (!rel) return "";
  if (/^https?:\/\//.test(rel)) return rel;
  return "/asset-files/" + String(rel).replace(/^\/+/, "").replace(/^asset-files\//, "");
}

// ── formatting ──
const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
export function fmtNum(v, unit = "") {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  const abs = Math.abs(n);
  let text;
  if (abs >= 1e9) text = nf.format(n / 1e9) + " tỷ";
  else if (abs >= 1e6) text = nf.format(n / 1e6) + " tr";
  else if (abs >= 1e4) text = nf.format(n / 1e3) + "k";
  else text = nf.format(n);
  if (unit === "USD") return (n < 0 ? "−$" : "$") + text.replace("-", "");
  if (unit === "VND") return text + " ₫";
  if (unit === "%") return text + "%";
  return unit ? `${text} ${unit}` : text;
}

export function ago(sec) {
  if (!sec) return "";
  const d = Date.now() / 1000 - Number(sec);
  if (d < 90) return "vừa xong";
  if (d < 3600) return `${Math.round(d / 60)} phút trước`;
  if (d < 86400) return `${Math.round(d / 3600)} giờ trước`;
  return `${Math.round(d / 86400)} ngày trước`;
}

function dueText(sec) {
  if (!sec) return "";
  const d = (Number(sec) - Date.now() / 1000) / 3600;
  if (d < 0) return "quá hạn";
  if (d < 24) return `còn ${Math.max(1, Math.round(d))} giờ`;
  return `còn ${Math.round(d / 24)} ngày`;
}

const short = (t, n = 90) => {
  const str = String(t || "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
};

// ── charts ──
export function sparkline(values, { width = 120, height = 34, tone = "cyan" } = {}) {
  const pts = (values || []).map(Number).filter((v) => Number.isFinite(v));
  const svg = s("svg", { viewBox: `0 0 ${width} ${height}`, class: `spark ${tone}`, "aria-hidden": "true" });
  // One point, or a flat series, is not a trend: draw nothing.
  if (pts.length < 2 || pts.every((v) => v === pts[0])) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / span) * (height - 8)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  svg.append(
    s("path", { d: `${d} L${xy[xy.length - 1][0].toFixed(1)} ${height} L${xy[0][0].toFixed(1)} ${height} Z`, class: "spark-fill" }),
    s("path", { d, class: "spark-line" }),
    s("circle", { cx: xy[xy.length - 1][0], cy: xy[xy.length - 1][1], r: 2.4, class: "spark-dot" }),
  );
  return svg;
}

function meter(ratio, { warn = 0.75, bad = 0.9 } = {}) {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  const tone = r >= bad ? "bad" : r >= warn ? "warn" : "ok";
  return h("div", { class: `meter ${tone}`, role: "meter", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(r * 100) },
    h("i", { style: `width:${(r * 100).toFixed(0)}%` }));
}

function statTile(label, value, { spark, tone, hint } = {}) {
  return h("div", { class: `stat ${tone || ""}` },
    h("span", { class: "stat-label" }, label),
    h("b", { class: "stat-value" }, value),
    spark ? sparkline(spark, { tone: tone === "bad" ? "warm" : "cyan" }) : null,
    hint ? h("small", {}, hint) : null);
}

function linkButton(label, url, ctx) {
  return h("button", { class: "chip-btn", type: "button", onclick: () => ctx.openUrl(url) }, label, " ↗");
}

function empty(text) {
  return h("p", { class: "empty" }, text);
}

// ── card renderers: (data, ctx) → { title, icon, body, foot? } ──
export const CARD_META = {
  tasks: { title: "Việc cần anh", icon: "◎" },
  machines: { title: "Máy + tải", icon: "▣" },
  assets: { title: "Kho tài sản", icon: "◇" },
  alerts: { title: "Cảnh báo", icon: "△" },
  channels: { title: "Số liệu kênh", icon: "∿" },
  money: { title: "Dòng tiền", icon: "₫" },
  results: { title: "Kết quả vừa làm", icon: "✓" },
  system: { title: "Kiểm tra hệ thống", icon: "◌" },
  sessions: { title: "Phiên Claude/Codex trên máy này", icon: "❯" },
};

async function loadTasks() {
  return api("/fleet/home/tasks");
}
function renderTasks(d, ctx) {
  const waiting = d.waiting || [];
  const top = (d.data || []).filter((t) => !waiting.some((w) => w.id === t.id));
  const approvals = (d.approvals || []).filter((a) => a.state === "open");
  const row = (t, wait, i) => h("li", { class: `task ${wait ? "wait" : ""} ${wait && i === 0 ? "first" : ""}` },
    h("div", { class: "task-main" },
      h("span", { class: `pill ${String(t.importance || "").toLowerCase()}` }, t.importance || "—"),
      h("b", {}, short(t.title, 110))),
    wait && t.owner && t.owner.q ? h("p", { class: "task-q" }, short(t.owner.q, 160)) : null,
    // recommend is sometimes just an option code ("done", "tunecore"): only show sentences.
    wait && t.owner && /\s/.test(String(t.owner.recommend || "").trim()) ? h("p", { class: "task-rec" }, "JAVIS đề xuất: ", short(t.owner.recommend, 140)) : null,
    h("div", { class: "task-meta" },
      h("span", {}, t.state_label || ""),
      t.due ? h("span", { class: dueText(t.due) === "quá hạn" ? "late" : "" }, dueText(t.due)) : null,
      t.result_link ? linkButton("Mở", t.result_link, ctx) : null));
  return {
    summary: waiting.length ? `${waiting.length} việc đang chờ anh quyết` : top.length ? `${top.length} việc quan trọng hôm nay` : "Không có việc nào chờ anh",
    body: h("div", {},
      waiting.length ? h("ul", { class: "tasks" }, waiting.map((t, i) => row(t, true, i))) : null,
      top.length ? h("ul", { class: "tasks" }, top.map((t, i) => row(t, false, i))) : null,
      approvals.length ? h("div", { class: "approvals" },
        approvals.map((a) => h("div", { class: "approval" }, h("span", {}, short(a.title, 90)), a.link ? linkButton("Duyệt", a.link, ctx) : null))) : null,
      !waiting.length && !top.length && !approvals.length ? empty("Hôm nay anh rảnh tay — không có việc nào chờ.") : null),
    foot: linkButton("Mở bàn làm việc JAVIS", "https://javis.bumbee.asia", ctx),
  };
}

async function loadMachines() {
  return api("/fleet/load");
}
function renderMachines(d) {
  const nodes = (d.nodes || []).slice().sort((a, b) => Number(b.online) - Number(a.online));
  const t = d.totals || {};
  const tile = (n) => {
    const ram = n.ram || {};
    const used = ram.total_mb ? 1 - (ram.avail_mb || 0) / ram.total_mb : null;
    const cpu = n.cpu || {};
    const cpuRatio = cpu.pct != null ? cpu.pct / 100 : cpu.load1 != null && cpu.cores ? cpu.load1 / cpu.cores : null;
    const gpus = n.gpu || [];
    const hot = gpus.reduce((m, g) => Math.max(m, Number(g.temp_c) || 0), 0);
    return h("div", { class: `node ${n.online ? "on" : "off"}` },
      h("div", { class: "node-head" }, h("i", { class: "dot" }), h("b", {}, n.ten || n.node), h("small", {}, n.online ? `${(n.heavy || {}).count || 0}/${(n.heavy || {}).max || 0} việc nặng` : "ngoại tuyến")),
      n.online ? h("div", { class: "node-bars" },
        h("label", {}, "RAM", meter(used), h("span", {}, used == null ? "—" : `${Math.round(used * 100)}%`)),
        h("label", {}, "CPU", meter(cpuRatio), h("span", {}, cpuRatio == null ? "—" : `${Math.round(cpuRatio * 100)}%`)),
        gpus.length ? h("label", {}, "GPU", meter(hot / 90, { warn: 0.8, bad: 0.92 }), h("span", { class: hot > 83 ? "late" : "" }, `${Math.round(hot)}°C`)) : null) : null);
  };
  return {
    summary: `${t.online ?? nodes.filter((n) => n.online).length}/${t.may ?? nodes.length} máy online · ${t.heavy_running ?? 0} việc nặng · ${t.queued ?? 0} chờ`,
    body: h("div", { class: "nodes" }, nodes.map(tile)),
  };
}

// No kind asked: the newest playable media (video, image, music) — reports and
// PR records belong to "kết quả", not to the gallery.
async function loadAssets(params = {}) {
  const page = (kind, n) => api(`/fleet/assets?${new URLSearchParams({ per_page: String(n), roots: "1", ...(kind ? { kind } : {}) })}`);
  if (params.kind) return page(params.kind, 9);
  const lists = await Promise.all(["video", "image", "audio"].map((k) => page(k, 6).catch(() => ({ data: [], total: 0 }))));
  const data = lists.flatMap((l) => l.data || []).sort((a, b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0));
  return { data: data.slice(0, 9), total: lists.reduce((n, l) => n + (l.total || 0), 0), media: true };
}
function renderAssets(d, ctx, params = {}) {
  const items = (d.data || []).slice(0, 9);
  const tile = (a) => {
    const file = assetUrl(a.file_url);
    const thumb = assetUrl(a.thumb_url || (a.kind === "image" ? a.file_url : ""));
    const media = h("div", { class: `asset-media ${a.kind}` });
    if (a.kind === "image" && thumb) media.append(h("img", { src: thumb, alt: "", loading: "lazy" }));
    else if (a.kind === "video" && file) {
      const v = h("video", { src: file, muted: true, playsinline: true, preload: "metadata" });
      media.append(v, h("span", { class: "play" }, "▶"));
      media.addEventListener("click", () => {
        v.muted = false;
        v.controls = true;
        v.play().catch(() => {});
        media.classList.add("playing");
      });
    } else if (a.kind === "audio" && file) {
      const audioEl = h("audio", { src: file, preload: "none" });
      const btn = h("button", { class: "play", type: "button" }, "▶");
      btn.addEventListener("click", () => {
        if (audioEl.paused) { ctx.playAudio(audioEl); btn.textContent = "❚❚"; } else { audioEl.pause(); btn.textContent = "▶"; }
      });
      audioEl.addEventListener("ended", () => { btn.textContent = "▶"; });
      media.append(audioEl, btn, h("span", { class: "wave" }, "∿∿∿"));
    } else {
      const ext = (String(a.file_url || a.title || "").match(/\.([a-z0-9]{2,5})(?:$|\?)/i) || [])[1];
      media.append(h("span", { class: "kind" }, ext ? ext.toUpperCase() : KIND_LABEL[a.kind] || "Tệp"), h("small", { class: "kind-sub" }, KIND_LABEL[a.kind] || ""));
    }
    return h("figure", { class: "asset" }, media,
      h("figcaption", {}, h("b", { title: a.title }, short(a.title, 48)), h("small", {}, [a.team, ago(a.updated_at || a.created_at)].filter(Boolean).join(" · "))));
  };
  const label = { video: "video", image: "ảnh", audio: "bài nhạc" }[params.kind] || (d.media ? "video, ảnh, nhạc" : "tài sản");
  return {
    summary: `${d.total ?? items.length} ${label} trong kho · ${items.length} mới nhất`,
    body: items.length ? h("div", { class: "assets" }, items.map(tile)) : empty("Kho chưa có mục nào khớp."),
    foot: linkButton("Mở Kho tài sản", "https://javis.bumbee.asia/?module=assets", ctx),
  };
}

const KIND_LABEL = { report: "Báo cáo", app: "App", doc: "Tài liệu", other: "Tệp", upgrade: "Nâng cấp", text: "Văn bản" };

async function loadAlerts() {
  return api("/fleet/alerts");
}
function renderAlerts(d) {
  const items = (d.data || []).filter((a) => !a.ack);
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => (rank[a.severity] ?? 4) - (rank[b.severity] ?? 4) || (b.last_at || 0) - (a.last_at || 0));
  return {
    summary: items.length ? `${items.length} cảnh báo đang mở · ${items.filter((a) => a.severity === "high" || a.severity === "critical").length} mức cao` : "Không có cảnh báo",
    body: items.length ? h("ul", { class: "alerts" }, items.slice(0, 8).map((a) => h("li", { class: `alert ${a.severity}` },
      h("i", { class: "sev" }), h("div", {}, h("b", {}, short(a.title, 110)), h("small", {}, [a.host, a.count > 1 ? `${a.count} lần` : "", ago(a.last_at)].filter(Boolean).join(" · ")))))) : empty("Mọi thứ đang yên."),
  };
}

function metricById(overview, id) {
  for (const p of overview.pillars || []) for (const m of p.metrics || []) if (m.id === id) return m;
  return null;
}

async function loadChannels() {
  const [overview, results] = await Promise.all([api("/fleet/exec/overview"), api("/fleet/results?days=7").catch(() => null)]);
  return { overview, results };
}
function renderChannels({ overview, results }) {
  const ids = ["yt_subs", "yt_watch_hours", "streams_week", "fb_monetization"];
  const metrics = ids.map((id) => metricById(overview, id)).filter(Boolean);
  const social = results && (results.sections || []).find((x) => x.id === "social");
  const names = new Set(metrics.map((m) => m.name));
  const socialExtra = ((social && social.stats) || []).filter((x) => !names.has(x.label));
  return {
    summary: metrics.some((m) => m.value != null)
      ? metrics.filter((m) => m.value != null).slice(0, 2).map((m) => `${m.name}: ${fmtNum(m.value, m.unit)}`).join(" · ")
      : "Chưa có số liệu kênh",
    body: h("div", {},
      h("div", { class: "stats" }, metrics.map((m) => statTile(m.name, m.value == null ? "chưa nối" : fmtNum(m.value, m.unit), {
        spark: m.spark, tone: m.status === "bad" ? "bad" : m.status === "ok" ? "good" : "", hint: m.period ? `kỳ ${m.period}` : m.source ? short(m.source, 40) : "",
      }))),
      socialExtra.length ? h("ul", { class: "kv" }, socialExtra.slice(0, 6).map((x) => h("li", {}, h("span", {}, x.label), h("b", {}, fmtNum(x.value, x.unit))))) : null),
  };
}

async function loadMoney() {
  const [overview, spend] = await Promise.all([api("/fleet/exec/overview"), api("/fleet/spend/summary").catch(() => null)]);
  return { overview, spend };
}
function barPair(revenue, cost) {
  const max = Math.max(Math.abs(revenue || 0), Math.abs(cost || 0), 1);
  const bar = (v, cls, label) => h("div", { class: `bar ${cls}` }, h("span", {}, label), h("i", { style: `width:${((Math.abs(v || 0) / max) * 100).toFixed(1)}%` }), h("b", {}, fmtNum(v, "USD")));
  return h("div", { class: "bars" }, bar(revenue, "in", "Tiền vào"), bar(cost, "out", "Tiền ra"));
}
function renderMoney({ overview, spend }) {
  const net = overview.north_star || metricById(overview, "net_month");
  const rev = metricById(overview, "revenue_month");
  const cost = metricById(overview, "cost_month");
  const be = metricById(overview, "breakeven_pct");
  const orders = metricById(overview, "orders_paid");
  const totals = spend && spend.totals;
  return {
    summary: net ? `Lãi ròng ${net.period || "tháng"}: ${fmtNum(net.value, net.unit)}` : "Chưa có số dòng tiền",
    body: h("div", {},
      net ? h("div", { class: `hero ${Number(net.value) < 0 ? "neg" : "pos"}` }, h("span", {}, net.name), h("b", {}, fmtNum(net.value, net.unit)), sparkline(net.spark, { width: 180, height: 40, tone: Number(net.value) < 0 ? "warm" : "cyan" })) : null,
      rev && cost ? barPair(rev.value, cost.value) : null,
      h("div", { class: "stats" },
        be ? statTile("Hoà vốn", fmtNum(be.value, "%"), { spark: be.spark }) : null,
        orders ? statTile("Đơn đã trả", fmtNum(orders.value, orders.unit), { spark: orders.spark }) : null,
        totals ? statTile("Chi hôm nay", `${fmtNum(totals.vnd && totals.vnd.day, "VND")}`, { hint: `${fmtNum(totals.credit && totals.credit.day)} credit` }) : null),
      spend && spend.warn && spend.warn.length ? h("p", { class: "warnline" }, "Nguồn sắp chạm trần: ", spend.warn.map((w) => w.source || w).join(", ")) : null),
  };
}

async function loadResults() {
  return api("/fleet/results?days=3");
}
function renderResults(d, ctx) {
  const pick = ["nghiem_thu", "products", "video", "music", "content"];
  const items = [];
  for (const id of pick) {
    const sec = (d.sections || []).find((x) => x.id === id);
    for (const it of (sec && sec.items) || []) items.push({ ...it, section: sec.title });
  }
  items.sort((a, b) => (b.at || b.updated_at || 0) - (a.at || a.updated_at || 0));
  const top = items.slice(0, 8);
  const linkOf = (it) => (it.preview_url && /^https?:/.test(it.preview_url) ? it.preview_url : it.file_url && /^https?:/.test(it.file_url) ? it.file_url : "");
  const nt = (d.sections || []).find((x) => x.id === "nghiem_thu");
  return {
    summary: nt && nt.total ? `${nt.total} việc chờ anh nghiệm thu` : `${top.length} kết quả mới`,
    body: top.length ? h("ul", { class: "results" }, top.map((it) => h("li", {},
      h("div", {}, h("b", {}, short(it.title, 100)), h("small", {}, [it.section, it.team, ago(it.at || it.updated_at)].filter(Boolean).join(" · "))),
      linkOf(it) ? linkButton("Xem", linkOf(it), ctx) : null))) : empty("Chưa có kết quả mới."),
  };
}

async function loadSystem() {
  const [load, alerts] = await Promise.all([api("/fleet/load"), api("/fleet/alerts")]);
  return { load, alerts };
}
function ring(parts) {
  const size = 132;
  const c = size / 2;
  const r = 52;
  const total = parts.reduce((sum, p) => sum + p.value, 0) || 1;
  const svg = s("svg", { viewBox: `0 0 ${size} ${size}`, class: "ring", "aria-hidden": "true" });
  svg.append(s("circle", { cx: c, cy: c, r, class: "ring-track" }));
  let start = -Math.PI / 2;
  for (const p of parts) {
    if (!p.value) continue;
    const end = start + (p.value / total) * Math.PI * 2 - 0.04;
    const large = end - start > Math.PI ? 1 : 0;
    const d = `M ${c + r * Math.cos(start)} ${c + r * Math.sin(start)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(end)} ${c + r * Math.sin(end)}`;
    svg.append(s("path", { d, class: `ring-seg ${p.tone}` }));
    start = end + 0.04;
  }
  return svg;
}
function renderSystem({ load, alerts }, ctx) {
  const nodes = load.nodes || [];
  const online = nodes.filter((n) => n.online).length;
  const open = (alerts.data || []).filter((a) => !a.ack);
  const high = open.filter((a) => a.severity === "high" || a.severity === "critical").length;
  const hot = nodes.filter((n) => (n.gpu || []).some((g) => Number(g.temp_c) > 83)).length;
  const lowRam = nodes.filter((n) => n.online && n.ram && n.ram.ratio != null && n.ram.ratio < 0.15).length;
  const sess = ctx.localSessions();
  const sentence = [
    `${online}/${nodes.length} máy online`,
    high ? `${high} cảnh báo mức cao` : "không có cảnh báo cao",
    hot ? `${hot} máy GPU nóng` : null,
    lowRam ? `${lowRam} máy thiếu RAM` : null,
    sess.total ? `${sess.working} phiên Claude/Codex đang chạy trên máy này` : null,
  ].filter(Boolean).join(", ");
  return {
    summary: sentence,
    speak: `Dạ, em kiểm tra xong: ${sentence}.`,
    body: h("div", { class: "system" },
      h("div", { class: "ring-wrap" }, ring([
        { value: online, tone: "ok" },
        { value: nodes.length - online, tone: "off" },
      ]), h("div", { class: "ring-center" }, h("b", {}, `${online}/${nodes.length}`), h("small", {}, "máy online"))),
      h("ul", { class: "kv" },
        h("li", {}, h("span", {}, "Cảnh báo mở"), h("b", { class: high ? "late" : "" }, `${open.length} (${high} cao)`)),
        h("li", {}, h("span", {}, "Việc nặng đang chạy"), h("b", {}, `${(load.totals || {}).heavy_running ?? 0}/${(load.totals || {}).heavy_capacity ?? 0}`)),
        h("li", {}, h("span", {}, "Hàng chờ"), h("b", {}, String((load.totals || {}).queued ?? 0))),
        h("li", {}, h("span", {}, "GPU > 83°C"), h("b", { class: hot ? "late" : "" }, String(hot))),
        h("li", {}, h("span", {}, "Phiên làm việc máy này"), h("b", {}, `${sess.working} chạy · ${sess.waiting} chờ anh`)))),
  };
}

function renderSessions(_d, ctx) {
  const sess = ctx.localSessions();
  const label = { working: "đang làm", waiting: "chờ anh", error: "lỗi", done: "xong", idle: "rảnh" };
  return {
    summary: sess.total ? `${sess.working} đang làm · ${sess.waiting} chờ anh · ${sess.errors} lỗi` : "Chưa có phiên Claude/Codex nào trên máy này",
    body: sess.total ? h("ul", { class: "sessions" }, sess.sessions.map((x) => h("li", { class: x.phase },
      h("i", { class: "dot" }), h("b", {}, x.agent === "codex" ? "Codex" : x.agent === "claude-code" ? "Claude" : x.agent),
      h("span", {}, x.where || x.id.slice(0, 8)), h("small", {}, label[x.phase] || x.phase)))) : empty("Mở Claude Code hoặc Codex là em thấy ngay."),
  };
}

export const LOADERS = {
  tasks: [loadTasks, renderTasks],
  machines: [loadMachines, renderMachines],
  assets: [loadAssets, renderAssets],
  alerts: [loadAlerts, renderAlerts],
  channels: [loadChannels, renderChannels],
  money: [loadMoney, renderMoney],
  results: [loadResults, renderResults],
  system: [loadSystem, renderSystem],
  sessions: [async () => null, renderSessions],
};

// Parse the OpenAI-style SSE chunks /fleet/voice/chat streams back.
export function sseDeltas(block) {
  return block.split("\n")
    .filter((line) => line.startsWith("data:") && !line.includes("[DONE]"))
    .map((line) => {
      try { return JSON.parse(line.slice(5)).choices?.[0]?.delta?.content || ""; } catch { return ""; }
    })
    .filter(Boolean);
}

// Minimal, safe rich text for brain answers: paragraphs, **bold**, bullet lines, links.
export function richText(text) {
  const wrap = h("div", { class: "rich" });
  const blocks = String(text || "").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const bullets = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
    const container = bullets ? h("ul") : h("p");
    for (const [i, line] of lines.entries()) {
      const target = bullets ? h("li") : container;
      const content = bullets ? line.replace(/^\s*([-*•]|\d+[.)])\s+/, "") : line;
      for (const part of content.split(/(\*\*[^*]+\*\*|https?:\/\/\S+)/g)) {
        if (!part) continue;
        if (part.startsWith("**") && part.endsWith("**")) target.append(h("b", {}, part.slice(2, -2)));
        else if (/^https?:\/\//.test(part)) target.append(h("a", { href: part, target: "_blank", rel: "noopener" }, part.replace(/^https?:\/\//, "").slice(0, 48)));
        else target.append(document.createTextNode(part));
      }
      if (bullets) container.append(target);
      else if (i < lines.length - 1) container.append(h("br"));
    }
    wrap.append(container);
  }
  return wrap;
}
