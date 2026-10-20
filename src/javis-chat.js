// JAVIS chat window renderer (javis-desk://app/index.html).
// Hosts <javis-companion> — same component, same /fleet/chat session as JAVIS web.
// All /fleet/* calls go same-origin to javis-desk://app/fleet/*, where the main
// process adds the device key. The page never sees or stores the key.
"use strict";

const $ = (id) => document.getElementById(id);
const api = window.javisDesk;
let companion = null;
let paired = false;

const PAIR_MESSAGES = {
  pending: "Đang chờ duyệt trên JAVIS web…",
  approved: "Đã ghép đôi xong.",
  denied: "Yêu cầu ghép đôi bị từ chối.",
  expired: "Mã đã hết hạn — bấm bắt đầu lại.",
  error: "Không kết nối được gateway JAVIS (đã thử 3 lần, dừng). Kiểm tra Tailscale rồi thử lại.",
};

function setStatusLine(s) {
  const el = $("status-line");
  if (!s.paired) { el.textContent = "Chưa ghép đôi"; el.className = "warn"; return; }
  if (s.authError) { el.textContent = "Khoá thiết bị bị từ chối — cần ghép đôi lại"; el.className = "warn"; return; }
  el.textContent = s.email ? `Đã ghép đôi · ${s.email}` : "Đã ghép đôi";
  el.className = "ok";
}

function renderPairState(s) {
  const box = $("pair-state");
  box.textContent = "";
  const line = document.createElement("div");
  if (s.paired) {
    line.className = s.authError ? "warn" : "ok";
    line.textContent = s.authError
      ? "Gateway đã từ chối khoá hiện tại. Ghép đôi lại bên dưới."
      : `Máy này đã ghép đôi${s.email ? ` với ${s.email}` : ""}.`;
  } else {
    line.className = "warn";
    line.textContent = "Máy này chưa ghép đôi với JAVIS.";
  }
  box.appendChild(line);
  const gw = document.createElement("small");
  gw.className = "muted";
  gw.textContent = `Gateway: ${s.gateway}${s.encrypted ? "" : " · (máy không có keychain: khoá lưu chỉ chủ máy đọc được)"}`;
  box.appendChild(gw);
  $("gateway").value = s.gateway;
}

async function refresh() {
  const s = await api.status();
  paired = !!(s && s.paired && !s.authError);
  setStatusLine(s);
  renderPairState(s);
  return s;
}

function show(view) {
  $("view-chat").hidden = view !== "chat";
  $("view-pair").hidden = view !== "pair";
  if (view === "chat") mountCompanion();
}

function currentCharacter() {
  return localStorage.getItem("javis.companion.character") || "hiyori";
}

function updateCredit() {
  // Live2D Free Material License credit, shown whenever Hiyori (Live2D Inc. sample) is on screen.
  $("credit").hidden = currentCharacter() !== "hiyori";
}

function loadCompanionScript() {
  if (document.querySelector("script[data-javis-companion]")) return;
  const s = document.createElement("script");
  s.type = "module";
  s.src = "ui/javis-companion.js";
  s.dataset.javisCompanion = "1";
  document.head.appendChild(s);
}

async function openPanel(el) {
  await customElements.whenDefined("javis-companion");
  for (let i = 0; i < 40; i++) {
    const btn = el.shadowRoot && el.shadowRoot.querySelector(".avatar, .stage");
    if (btn) {
      if (!el.shadowRoot.querySelector(".panel")) btn.click();
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

function mountCompanion() {
  if (!paired || companion) return;
  // Same-origin proxy: no gateway URL / token in the page.
  localStorage.removeItem("javis:token");
  localStorage.removeItem("javis:fleet");
  if (!localStorage.getItem("javis.companion.mode") || localStorage.getItem("javis.companion.mode") === "dot") {
    localStorage.setItem("javis.companion.mode", "mini");
  }
  loadCompanionScript();
  const el = document.createElement("javis-companion");
  if (!localStorage.getItem("javis.companion.character")) el.setAttribute("character", "hiyori");
  el.setAttribute("mode", "mini");
  el.setAttribute("stream", "1");
  el.setAttribute("live2d-base", `${location.origin}/live2d/`);
  $("companion-host").appendChild(el);
  companion = el;
  updateCredit();
  void openPanel(el);
}

function unmountCompanion() {
  if (companion) { companion.remove(); companion = null; }
}

async function startPairing() {
  $("btn-pair-start").disabled = true;
  $("pair-progress").textContent = "Đang xin mã…";
  const r = await api.pairStart();
  $("btn-pair-start").disabled = false;
  if (!r || !r.ok) {
    $("pair-code").hidden = false;
    $("user-code").textContent = "";
    $("pair-qr").hidden = true;
    $("pair-progress").textContent = `Không xin được mã ghép đôi (${(r && r.error) || "lỗi"}).`;
    return;
  }
  $("pair-code").hidden = false;
  $("user-code").textContent = r.userCode;
  $("pair-qr").hidden = !r.qr;
  if (r.qr) $("pair-qr").src = r.qr;
  $("btn-pair-open").onclick = () => api.pairOpenBrowser(r.verifyUrl);
  $("pair-progress").textContent = PAIR_MESSAGES.pending;
}

function wire() {
  $("btn-settings").onclick = () => show($("view-pair").hidden ? "pair" : "chat");
  $("btn-back").onclick = () => show("chat");
  $("btn-pair-start").onclick = () => void startPairing();
  $("btn-pair-cancel").onclick = async () => { await api.pairCancel(); $("pair-code").hidden = true; };
  $("btn-paste").onclick = async () => {
    const input = $("paste-key");
    const r = await api.pairPasteKey(input.value);
    input.value = "";
    if (!r || !r.ok) { $("pair-progress").textContent = "Khoá không hợp lệ."; $("pair-code").hidden = false; return; }
    unmountCompanion();
    await refresh();
    show("chat");
  };
  $("btn-gateway").onclick = async () => {
    const r = await api.setGateway($("gateway").value);
    if (!r || !r.ok) { $("gateway").setCustomValidity("URL không hợp lệ"); $("gateway").reportValidity(); return; }
    $("gateway").setCustomValidity("");
    unmountCompanion();
    await refresh();
  };
  $("btn-unpair").onclick = async () => {
    await api.unpair();
    unmountCompanion();
    await refresh();
    show("pair");
  };
  api.onPairUpdate(async (u) => {
    $("pair-progress").textContent = PAIR_MESSAGES[u.status] || u.status;
    if (u.status === "approved") {
      $("pair-code").hidden = true;
      unmountCompanion();
      await refresh();
      show("chat");
    }
  });
  api.onAuthError(async () => {
    unmountCompanion();
    await refresh();
    show("pair");
  });
  api.onShowView((v) => show(v === "pair" ? "pair" : "chat"));
  setInterval(updateCredit, 2000);
}

(async () => {
  wire();
  const s = await refresh();
  show(location.hash === "#pair" || !s.paired || s.authError ? "pair" : "chat");
})();
