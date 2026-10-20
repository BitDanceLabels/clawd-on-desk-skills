// "Việc chờ anh" window (javis-desk://app/inbox.html).
"use strict";
const $ = (id) => document.getElementById(id);
const api = window.javisTools;
const busy = new Set();

const ERRORS = {
  pairing_rejected: "Khoá thiết bị bị từ chối. Anh ghép đôi lại giúp em nhé.",
  gateway_unreachable: "Chưa kết nối được máy chủ JAVIS (đã thử 3 lần rồi dừng). Kiểm tra mạng/Tailscale rồi bấm Thử lại.",
};

function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function show(id, on) { $(id).classList.toggle("hidden", !on); }

function row(it) {
  const li = document.createElement("li");
  li.className = "item" + (it.urgent ? " urgent" : "");
  li.dataset.id = it.id;
  const t = document.createElement("div");
  t.className = "t";
  const b = document.createElement("b");
  b.textContent = it.title;
  b.title = it.title;
  const small = document.createElement("small");
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = it.kind === "ticket" ? "Phiếu duyệt" : "Việc";
  small.appendChild(tag);
  const extra = [];
  if (it.urgent) extra.push("gấp");
  if (it.due) extra.push(`hạn ${it.due}`);
  if (it.kind === "ticket") extra.push(it.questions ? `${it.questions} mục · duyệt trên web` : "duyệt trên web");
  small.appendChild(document.createTextNode(extra.join(" · ")));
  t.append(b, small);
  li.appendChild(t);
  if (it.canApprove) {
    const ok = document.createElement("button");
    ok.className = "primary small";
    ok.textContent = "Duyệt";
    ok.disabled = busy.has(it.id);
    ok.onclick = () => approve(it, ok);
    li.appendChild(ok);
  }
  const web = document.createElement("button");
  web.className = "small";
  web.textContent = "Mở trên web";
  web.onclick = () => api.openWeb(it.webUrl);
  li.appendChild(web);
  return li;
}

async function approve(it, btn) {
  busy.add(it.id);
  btn.disabled = true;
  btn.textContent = "Đang duyệt…";
  const r = await api.inboxApprove(it.id);
  busy.delete(it.id);
  if (r && r.ok) return; // list re-renders from the inbox update
  btn.disabled = false;
  btn.textContent = "Duyệt";
  if (r && r.error === "web_only") { api.openWeb(r.webUrl || it.webUrl); return; }
  $("error-text").textContent = `Chưa duyệt được: ${(r && r.error) || "lỗi"}.`;
  show("error", true);
}

function render(s) {
  if (!s) return;
  const count = s.count || 0;
  $("count").textContent = String(count);
  $("count").classList.toggle("zero", !count);
  show("not-paired", !s.paired);
  const err = s.paired && s.error;
  show("error", !!err);
  if (err) $("error-text").textContent = ERRORS[s.error] || `Lỗi: ${s.error}`;
  show("empty", s.paired && s.loaded && !err && !count);
  $("sub").textContent = !s.paired ? "Chưa ghép đôi"
    : s.loading && !s.loaded ? "Đang tải…"
    : count ? `${count} việc · ${s.approvable || 0} việc duyệt được ngay` : "Không có việc chờ";
  $("updated").textContent = s.updatedAt ? `Cập nhật lúc ${hhmm(s.updatedAt)}` : "";
  const list = $("list");
  list.textContent = "";
  if (s.paired) for (const it of s.items || []) list.appendChild(row(it));
}

$("btn-refresh").onclick = async () => render(await api.inboxRefresh());
$("btn-retry").onclick = async () => render(await api.inboxRefresh());
$("btn-web").onclick = () => api.openWeb("https://javis.bumbee.asia/");
$("btn-pair").onclick = () => api.openPairing();
$("btn-pair-web").onclick = () => api.pairingWeb();
api.onInbox(render);
api.inboxGet().then(render);
