// src/vocab-profile.js — renderer cửa sổ Hồ sơ đam mê
"use strict";
const api = window.bumbeeProfile;
const $ = (id) => document.getElementById(id);
const FIELDS = ["profession", "passions", "books", "subjects", "facebook", "linkedin", "youtube", "website", "cv_link"];

function setCvStatus(msg, ok) {
  const s = $("cvStatus");
  s.textContent = msg;
  s.className = "status" + (ok ? " ok" : "");
}

function showCvResult(r) {
  if (!r) return;
  if (r.ok) {
    const extra = r.note ? ` — ${r.note}` : (r.chars ? ` — đã trích ${r.chars} ký tự cho AI đọc` : "");
    setCvStatus(`✓ Đã nhận "${r.name}"${extra}`, true);
  } else if (r.reason !== "cancelled") {
    setCvStatus(`✗ ${r.reason || "Không nhận được file"}`, false);
  }
}

function setStatus(msg, ok) {
  const s = $("status");
  s.textContent = msg;
  s.className = "status" + (ok ? " ok" : "");
}

async function load() {
  try {
    const p = await api.get();
    if (p && p.ok && p.profile) {
      FIELDS.forEach((f) => { $(f).value = p.profile[f] || ""; });
      if (p.profile.cv_file) {
        const chars = (p.profile.cv_text || "").length;
        setCvStatus(`✓ CV hiện tại: ${p.profile.cv_file}${chars ? ` (${chars} ký tự đã trích)` : ""}`, true);
      }
    }
    if (p && p.lastCurate) setStatus(`Lần AI biên soạn gần nhất: ${String(p.lastCurate).slice(0, 10)}`, false);
    if (p && p.syncUrl) {
      let box = document.getElementById("syncBox");
      if (!box) {
        box = document.createElement("div");
        box.id = "syncBox";
        box.className = "status";
        box.style.wordBreak = "break-all";
        document.querySelector(".card").appendChild(box);
      }
      box.textContent = "🌐 Sửa hồ sơ từ web (điện thoại/máy khác) — tự đồng bộ: " + p.syncUrl;
    }
  } catch {}
}
if (api.onRefresh) api.onRefresh(load); // web có bản mới → nạp lại form

// ── CV: kéo thả hoặc bấm chọn file ──
const dz = $("dropzone");
dz.addEventListener("click", async () => {
  setCvStatus("Đang mở hộp thoại chọn file…", false);
  showCvResult(await api.pickFile());
});
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.style.borderColor = "#f4c842"; dz.style.color = "#f4c842"; });
dz.addEventListener("dragleave", () => { dz.style.borderColor = "rgba(244,200,66,.5)"; dz.style.color = ""; });
dz.addEventListener("drop", async (e) => {
  e.preventDefault();
  dz.style.borderColor = "rgba(244,200,66,.5)"; dz.style.color = "";
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) { setCvStatus("✗ Không nhận được file", false); return; }
  setCvStatus(`Đang xử lý "${f.name}"…`, false);
  showCvResult(await api.attachDropped(f));
});
// chặn trình duyệt mở file khi thả trượt ra ngoài dropzone
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());

$("saveBtn").addEventListener("click", async () => {
  const profile = {};
  FIELDS.forEach((f) => { profile[f] = $(f).value.trim(); });
  try {
    const r = await api.save(profile);
    setStatus(r && r.ok ? "✓ Đã lưu — AI sẽ tự biên soạn định kỳ mỗi 3 ngày." : "✗ Lưu thất bại", r && r.ok);
  } catch { setStatus("✗ Lỗi khi lưu", false); }
});

$("curateBtn").addEventListener("click", async () => {
  $("curateBtn").setAttribute("disabled", "true");
  setStatus("🪄 AI đang đọc hồ sơ và biên soạn từ vựng…", false);
  try {
    const r = await api.curate();
    if (r && r.ok) setStatus(`✓ Đã thêm ${r.created} từ mới đúng lĩnh vực của bạn (kho: ${r.total}). Mở game để học!`, true);
    else setStatus(`✗ ${r && r.reason || "Chưa biên soạn được — lưu hồ sơ trước nhé."}`, false);
  } catch { setStatus("✗ Lỗi kết nối AI", false); }
  $("curateBtn").removeAttribute("disabled");
});

$("closeBtn").addEventListener("click", () => api.close());
document.addEventListener("keydown", (e) => { if (e.key === "Escape") api.close(); });
load();
