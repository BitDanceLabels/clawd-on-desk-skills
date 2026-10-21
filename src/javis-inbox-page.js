// "Việc chờ anh" window (javis-desk://app/inbox.html).
"use strict";
const $ = (id) => document.getElementById(id);
const api = window.javisTools;

const ERRORS = {
  pairing_rejected: "Phiên đăng nhập đã hết hạn. Anh bấm Đăng nhập JAVIS để vào lại nhé.",
  forbidden: "Máy chủ chưa cho máy này xem việc chờ. Anh mở JAVIS web để xem nhé.",
  feature_denied: "Tài khoản trên máy này chưa có quyền xem việc chờ. Anh vẫn đang đăng nhập — bấm Làm mới để thử lại.",
  rate_limited: "Máy chủ đang bận, em sẽ tự tải lại sau ít phút.",
  gateway_unreachable: "Chưa kết nối được máy chủ JAVIS (đã thử 3 lần rồi dừng). Kiểm tra mạng/Tailscale rồi bấm Thử lại.",
};
const STATUS = {
  todo: "chưa làm", doing: "đang làm", waiting: "chờ anh", pending: "chờ duyệt", waiting_approval: "đơn chờ duyệt",
};

function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// due is epoch seconds (CONTRACT v1.1).
function dueText(sec) {
  const d = new Date(sec * 1000);
  const day = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const late = d.getTime() < Date.now() ? " (quá hạn)" : "";
  return `hạn ${hhmm(d.getTime())} ${day}${late}`;
}

// 429: "Làm mới"/"Thử lại" stay off until Retry-After has passed.
let waitTimer = null;
function setWaiting(until) {
  const wait = until ? until - Date.now() : 0;
  $("btn-retry").disabled = $("btn-refresh").disabled = wait > 0;
  clearTimeout(waitTimer);
  if (wait > 0) waitTimer = setTimeout(() => setWaiting(0), wait);
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
  tag.textContent = it.kind === "approval" ? "Phiếu duyệt" : "Việc";
  small.appendChild(tag);
  const extra = [];
  if (it.urgent) extra.push("gấp");
  if (STATUS[it.status]) extra.push(STATUS[it.status]);
  if (it.due) extra.push(dueText(it.due));
  small.appendChild(document.createTextNode(extra.join(" · ")));
  t.append(b, small);
  li.appendChild(t);
  // Machine sign-in cannot approve (CONTRACT v1.1): approving always happens on the web.
  const open = document.createElement("button");
  open.className = "primary small";
  open.textContent = "Mở để duyệt";
  open.title = "Mở trên trình duyệt";
  open.onclick = () => api.openWeb(it.webUrl);
  li.appendChild(open);
  return li;
}

function render(s) {
  if (!s) return;
  const count = s.count || 0;
  $("count").textContent = String(count);
  $("count").classList.toggle("zero", !count);
  show("not-paired", !s.paired);
  const err = s.paired && s.error;
  show("error", !!err);
  if (err) {
    let msg = ERRORS[s.error] || `Lỗi: ${s.error}`;
    if (s.error === "rate_limited" && s.retryAt) msg = `Máy chủ đang bận, em tự tải lại lúc ${hhmm(s.retryAt)}.`;
    $("error-text").textContent = msg;
  }
  setWaiting(s.retryAt);
  show("empty", s.paired && s.loaded && !err && !count);
  const more = count > (s.shown || 0) ? ` · hiện ${s.shown}` : "";
  $("sub").textContent = !s.paired ? "Chưa đăng nhập"
    : s.loading && !s.loaded ? "Đang tải…"
    : count ? `${count} việc${more} · duyệt trên web` : "Không có việc chờ";
  $("updated").textContent = s.updatedAt ? `Cập nhật lúc ${hhmm(s.updatedAt)}` : "";
  const list = $("list");
  list.textContent = "";
  if (s.paired) for (const it of s.items || []) list.appendChild(row(it));
}

$("btn-refresh").onclick = async () => render(await api.inboxRefresh());
$("btn-retry").onclick = async () => render(await api.inboxRefresh());
$("btn-web").onclick = () => api.openWeb("https://javis.bumbee.asia/");
$("btn-login").onclick = () => api.login();
api.onInbox(render);
api.inboxGet().then(render);
