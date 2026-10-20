// JAVIS chat window renderer (javis-desk://app/index.html).
// Hosts <javis-companion> — same component, same /fleet/chat session as JAVIS web.
// All /fleet/* calls go same-origin to javis-desk://app/fleet/*, where the main
// process adds the bearer token. The page never sees or stores any token.
"use strict";

const $ = (id) => document.getElementById(id);
const api = window.javisDesk;
let companion = null;
// Last state from main. Chat vs. login follows it; only "settings" is a user choice.
let auth = null;
let settingsOpen = false;
let emailForm = false;

const LEAD = {
  signed_out: "Đăng nhập một lần là dùng lâu dài: chat, việc chờ anh, báo cáo, AI Clipboard.",
  email: "Nhập email tài khoản JAVIS, em gửi mã 6 số cho anh.",
  waiting_browser: "Đang chờ anh cho phép trên trình duyệt…",
  expired: "Phiên đăng nhập đã hết hạn. Anh bấm Đăng nhập JAVIS để vào lại nhé.",
};

function statusLine(s) {
  if (s.state === "signed_in") {
    return [s.kind === "legacy" ? "Đã đăng nhập · khoá thiết bị" : `Đã đăng nhập${s.email ? ` · ${s.email}` : ""}`, "ok"];
  }
  return [{
    signed_out: "Chưa đăng nhập",
    waiting_browser: "Đang chờ trình duyệt…",
    waiting_code: "Đang chờ mã email…",
    expired: "Phiên đăng nhập hết hạn",
  }[s.state] || "", "warn"];
}

// The whole window is drawn from one state: never two messages that disagree.
function render(s) {
  if (!s) return;
  const wasIn = auth && auth.signedIn;
  auth = s;
  if (wasIn && !s.signedIn) unmountCompanion();
  const out = s.state === "signed_out" || s.state === "expired";
  if (!out) emailForm = false;

  const [line, cls] = statusLine(s);
  $("status-line").textContent = line;
  $("status-line").className = cls;

  const view = settingsOpen ? "settings" : s.signedIn ? "chat" : "login";
  $("view-chat").hidden = view !== "chat";
  $("view-login").hidden = view !== "login";
  $("view-settings").hidden = view !== "settings";
  if (view === "chat") mountCompanion();

  // Login screen
  $("pane-start").hidden = !(out && !emailForm);
  $("pane-email").hidden = !(out && emailForm);
  $("pane-browser").hidden = s.state !== "waiting_browser";
  $("pane-code").hidden = s.state !== "waiting_code";
  $("btn-email-link").hidden = s.emailEnabled === false;
  const lead = s.notice
    || (s.state === "waiting_code" ? `Em đã gửi mã 6 số tới ${s.pendingEmail}. Anh mở email rồi nhập vào đây.` : "")
    || (out && emailForm ? LEAD.email : LEAD[s.state] || LEAD.signed_out);
  $("login-line").textContent = lead;
  $("login-line").className = s.notice || s.state === "expired" ? "lead warn" : "lead";

  // Settings
  $("acct-line").textContent = s.signedIn
    ? (s.kind === "legacy" ? "Máy này đang dùng khoá thiết bị cũ." : `Đã đăng nhập: ${s.email || "tài khoản JAVIS"}`)
    : "Máy này chưa đăng nhập JAVIS.";
  $("acct-line").className = s.signedIn ? "ok" : "warn";
  $("btn-logout").hidden = !s.signedIn;
  $("btn-settings-login").hidden = s.signedIn;
  if (document.activeElement !== $("gateway")) $("gateway").value = s.gateway || "";
  $("gateway-note").textContent = s.encrypted ? "" : "Máy này không có keychain: phiên đăng nhập lưu ở tệp chỉ chủ máy đọc được.";
}

async function act(promise) {
  const r = await promise;
  if (r && r.status) render(r.status);
  return r;
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
  if (!auth || !auth.signedIn || companion) return;
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

function wire() {
  $("btn-settings").onclick = () => { settingsOpen = !settingsOpen; render(auth); };
  $("btn-back").onclick = () => { settingsOpen = false; render(auth); };
  $("btn-login").onclick = () => void act(api.login());
  $("btn-settings-login").onclick = () => { settingsOpen = false; void act(api.login()); };
  $("btn-cancel").onclick = () => void act(api.loginCancel());
  $("btn-reopen").onclick = () => void api.loginReopen();
  $("btn-email-link").onclick = () => { emailForm = true; render(auth); $("email").focus(); };
  $("btn-email-back").onclick = () => { emailForm = false; void act(api.loginCancel()); };
  $("pane-email").onsubmit = async (e) => {
    e.preventDefault();
    const r = await act(api.emailStart($("email").value));
    if (r && r.ok) { $("code").value = ""; $("code").focus(); }
  };
  $("pane-code").onsubmit = async (e) => {
    e.preventDefault();
    const r = await act(api.emailVerify($("code").value));
    if (r && !r.ok) $("code").select();
  };
  $("code").oninput = () => {
    const v = $("code").value.replace(/\D/g, "").slice(0, 6);
    $("code").value = v;
    if (v.length === 6) $("pane-code").requestSubmit();
  };
  $("btn-resend").onclick = () => void act(api.emailResend());
  $("btn-code-back").onclick = async () => { await act(api.loginCancel()); emailForm = true; render(auth); $("email").focus(); };
  $("btn-logout").onclick = async () => { settingsOpen = false; await act(api.logout()); };
  $("btn-paste").onclick = async () => {
    const input = $("paste-key");
    const r = await act(api.useKey(input.value));
    input.value = "";
    $("paste-msg").textContent = r && r.ok ? "" : "Khoá không hợp lệ.";
    if (r && r.ok) { settingsOpen = false; unmountCompanion(); render(auth); }
  };
  $("btn-gateway").onclick = async () => {
    const r = await act(api.setGateway($("gateway").value));
    if (!r || !r.ok) { $("gateway").setCustomValidity("URL không hợp lệ"); $("gateway").reportValidity(); return; }
    $("gateway").setCustomValidity("");
    unmountCompanion();
    render(auth);
  };
  api.onAuth(render);
  api.onShowView((v) => { settingsOpen = v === "settings"; render(auth); });
  setInterval(updateCredit, 2000);
}

(async () => {
  wire();
  settingsOpen = location.hash === "#settings";
  render(await api.status());
})();
