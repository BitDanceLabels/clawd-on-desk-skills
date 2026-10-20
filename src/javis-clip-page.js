// AI Clipboard window: quick paste box + last items. Encryption happens in main.
"use strict";
const $ = (id) => document.getElementById(id);
const api = window.javisTools;
const SECTIONS = ["s-not-paired", "s-offline", "s-no-clip", "s-need-key", "s-ready"];
let pendingSensitive = false;

function only(id) { for (const s of SECTIONS) $(s).classList.toggle("hidden", s !== id); }

function ago(sec) {
  if (!sec) return "";
  const d = Math.max(0, Date.now() / 1000 - sec);
  if (d < 60) return "vừa xong";
  if (d < 3600) return `${Math.round(d / 60)} phút trước`;
  if (d < 86400) return `${Math.round(d / 3600)} giờ trước`;
  return `${Math.round(d / 86400)} ngày trước`;
}

async function loadRecent() {
  const r = await api.clipRecent();
  const ul = $("recent");
  ul.textContent = "";
  if (!r || !r.ok) return;
  if (!r.items.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Chưa có mục nào.";
    ul.appendChild(li);
    return;
  }
  for (const it of r.items) {
    const li = document.createElement("li");
    li.className = "item";
    const t = document.createElement("div");
    t.className = "t";
    const b = document.createElement("b");
    b.textContent = it.kind === "locked" ? "(không mở được — khoá khác)" : it.big ? `(tệp lớn ${Math.round((it.size || 0) / 1024)} KB — mở trang đầy đủ)` : it.text.replace(/\s+/g, " ").slice(0, 140);
    const sm = document.createElement("small");
    sm.textContent = [it.pinned ? "📌" : "", it.src, ago(it.at)].filter(Boolean).join(" · ");
    t.append(b, sm);
    li.appendChild(t);
    if (it.text) {
      const c = document.createElement("button");
      c.className = "small";
      c.textContent = "Chép";
      c.onclick = async () => { await api.clipCopy(it.text); c.textContent = "Đã chép ✓"; setTimeout(() => { c.textContent = "Chép"; }, 1500); };
      li.appendChild(c);
    }
    ul.appendChild(li);
  }
}

async function refresh() {
  $("msg").textContent = "";
  const s = await api.clipStatus();
  const st = (s && s.state) || "offline";
  only({ not_paired: "s-not-paired", offline: "s-offline", no_clipboard: "s-no-clip", need_key: "s-need-key", ready: "s-ready" }[st] || "s-offline");
  $("sub").textContent = st === "ready" ? `Đã nối · ${s.devices || 0} máy` : "Chép ở máy này, dán ở máy kia";
  $("paused").textContent = s && s.paused ? "· đang tạm dừng" : "";
  if (st === "ready") { await loadRecent(); $("quick").focus(); }
}

async function send() {
  const text = $("quick").value;
  const btn = $("btn-send");
  btn.disabled = true;
  const r = await api.clipSend(text, { confirmed: pendingSensitive });
  btn.disabled = false;
  if (r && r.ok) {
    pendingSensitive = false;
    $("quick").value = "";
    await loadRecent();
    $("send-msg").className = "muted ok";
    $("send-msg").textContent = "Đã gửi ✓ — mở Clipboard ở máy kia là thấy.";
    return;
  }
  pendingSensitive = !!(r && r.sensitive);
  $("send-msg").className = "muted warn";
  $("send-msg").textContent = (r && r.error) || "Chưa gửi được.";
}

$("btn-login").onclick = () => api.login();
$("btn-retry").onclick = refresh;
$("btn-create").onclick = async () => { const r = await api.clipCreate(); if (!r || !r.ok) $("msg").textContent = `Chưa tạo được (${(r && r.error) || "lỗi"}).`; await refresh(); };
$("btn-link").onclick = async () => {
  const r = await api.clipLink($("link").value);
  $("link").value = "";
  if (!r || !r.ok) { $("msg").textContent = (r && r.error) || "Chưa nối được."; return; }
  await refresh();
};
$("btn-from-sys").onclick = async () => { $("quick").value = (await api.clipReadSystem()) || ""; $("quick").focus(); pendingSensitive = false; };
$("btn-send").onclick = send;
$("quick").addEventListener("input", () => { pendingSensitive = false; });
$("quick").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } });
$("btn-web").onclick = () => api.clipOpenWeb();
api.onClipChanged(refresh);
const params = new URLSearchParams(location.search);
if (params.get("kbd")) $("kbd").textContent = params.get("kbd");
refresh();
