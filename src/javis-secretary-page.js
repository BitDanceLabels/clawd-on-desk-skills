// "Thư ký" window: shows the text being read and a Stop button.
"use strict";
const $ = (id) => document.getElementById(id);
const api = window.javisTools;

function renderReport(r) {
  if (!r) return;
  if (r.loading) { $("text").textContent = "Đang lấy báo cáo…"; return; }
  $("text").textContent = r.text || "";
  $("len").textContent = r.seconds ? `Khoảng ${Math.round(r.seconds)} giây` : "";
}

function renderSpeech(s) {
  if (!s) return;
  $("wave").classList.toggle("hidden", !s.speaking);
  $("voice-text").textContent = s.speaking ? `Đang đọc · ${s.label || ""}` : (s.stopped ? "Đã dừng" : "Đọc xong");
  $("btn-stop").disabled = !s.speaking;
}

$("btn-stop").onclick = () => api.reportStop();
$("btn-again").onclick = () => api.reportRead();
api.onReport(renderReport);
api.onSpeech(renderSpeech);
api.reportGet().then((x) => { if (x) { renderReport(x.report); renderSpeech(x.speech); } });
