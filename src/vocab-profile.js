// src/vocab-profile.js — renderer cửa sổ Hồ sơ đam mê
"use strict";
const api = window.bumbeeProfile;
const $ = (id) => document.getElementById(id);
const FIELDS = ["profession", "passions", "books", "subjects", "facebook", "linkedin", "youtube", "website"];

function setStatus(msg, ok) {
  const s = $("status");
  s.textContent = msg;
  s.className = "status" + (ok ? " ok" : "");
}

async function load() {
  try {
    const p = await api.get();
    if (p && p.ok && p.profile) FIELDS.forEach((f) => { $(f).value = p.profile[f] || ""; });
    if (p && p.lastCurate) setStatus(`Lần AI biên soạn gần nhất: ${String(p.lastCurate).slice(0, 10)}`, false);
  } catch {}
}

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
