// src/vocab-profile.js — renderer cửa sổ Hồ sơ đam mê
"use strict";
const api = window.bumbeeProfile;
const $ = (id) => document.getElementById(id);
const FIELDS = ["profession", "passions", "books", "subjects", "facebook", "linkedin", "youtube", "website", "cv_link"];

// ── Kéo cửa sổ: chỉ khi bấm trúng nền thẻ (viền/khoảng trống) hoặc thanh .top ──
(function () {
  const card = $("card");
  let dragging = false, lx = 0, ly = 0;
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !api.moveBy) return;
    const onFrame = (e.target === card) || !!e.target.closest(".top");
    if (!onFrame) return;
    if (e.target.closest("#closeBtn, button, input, textarea, select")) return;
    dragging = true; lx = e.screenX; ly = e.screenY;
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.screenX - lx, dy = e.screenY - ly;
    if (dx || dy) { api.moveBy(dx, dy); lx = e.screenX; ly = e.screenY; }
  });
  window.addEventListener("mouseup", () => { dragging = false; });
  window.addEventListener("blur", () => { dragging = false; });
})();

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
    if (p && p.telegramUrl) _telegramUrl = p.telegramUrl;
    if (p && p.misskeyConnected) {
      setMsk(`✓ Đang kết nối bumbee.asia: @${p.misskeyUser}`, true);
      $("resyncBtn").style.display = "block";
      $("loginBtn").textContent = "🔑 Đăng nhập lại (đổi tài khoản)";
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

// ── Kết nối bumbee.asia (Misskey) ──
// Đăng nhập bằng tài khoản (MiAuth) — không cần copy token
$("loginBtn").addEventListener("click", async () => {
  $("loginBtn").setAttribute("disabled", "true");
  setMsk("🌐 Đã mở trình duyệt — đăng nhập & bấm Đồng ý, rồi quay lại đây chờ vài giây…", false);
  try {
    const r = await api.loginMisskey();
    if (r && r.ok) {
      setMsk(`✓ Đã kết nối @${r.username}! AI đọc được ${r.chars} ký tự hồ sơ${r.notes ? ` + ${r.notes} bài đăng` : ""}. Bấm 🪄 Biên soạn ngay!`, true);
    } else setMsk(`✗ ${r && r.reason || "Chưa đăng nhập được"}`, false);
  } catch { setMsk("✗ Lỗi kết nối", false); }
  $("loginBtn").removeAttribute("disabled");
});
$("advToggle").addEventListener("click", () => {
  const b = $("advBox");
  b.style.display = b.style.display === "none" ? "flex" : "none";
});
$("resyncBtn").addEventListener("click", async () => {
  $("resyncBtn").setAttribute("disabled", "true");
  setMsk("🔄 Đang đọc lại hồ sơ mới nhất từ bumbee.asia…", false);
  try {
    const r = await api.resyncMisskey();
    if (r && r.ok) {
      setMsk(r.chars > 0
        ? `✓ Đã cập nhật! AI đọc được ${r.chars} ký tự${r.notes ? ` + ${r.notes} bài đăng` : ""}. Bấm 🪄 Biên soạn ngay!`
        : "⚠️ Hồ sơ trên web vẫn trống — vào Cài đặt → Hồ sơ trên bumbee.asia điền Giới thiệu + Trường bổ sung trước nhé.", r.chars > 0);
    } else setMsk(`✗ ${r && r.reason || "Lỗi"}`, false);
  } catch { setMsk("✗ Lỗi kết nối", false); }
  $("resyncBtn").removeAttribute("disabled");
});
$("connectBtn").addEventListener("click", async () => {
  const token = $("misskeyToken").value.trim();
  if (!token) { setMsk("Dán token trước nhé", false); return; }
  $("connectBtn").setAttribute("disabled", "true");
  setMsk("🔗 Đang kết nối bumbee.asia…", false);
  try {
    const r = await api.connectMisskey(token);
    if (r && r.ok) {
      setMsk(`✓ Đã kết nối @${r.username} — đọc ${r.chars} ký tự hồ sơ${r.notes ? ` + ${r.notes} bài đăng` : ""}. Bấm 🪄 Biên soạn ngay để AI dạy theo đam mê của bạn!`, true);
      $("misskeyToken").value = "";
    } else setMsk(`✗ ${r && r.reason || "Kết nối thất bại"}`, false);
  } catch { setMsk("✗ Lỗi kết nối", false); }
  $("connectBtn").removeAttribute("disabled");
});
function setMsk(msg, ok) {
  const s = $("misskeyStatus");
  s.textContent = msg;
  s.className = "status" + (ok ? " ok" : "");
}

let _telegramUrl = "";
$("tgBtn").addEventListener("click", () => { if (_telegramUrl && api.openUrl) api.openUrl(_telegramUrl); });

$("closeBtn").addEventListener("click", () => api.close());
document.addEventListener("keydown", (e) => { if (e.key === "Escape") api.close(); });
load();
