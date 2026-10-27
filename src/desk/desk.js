// src/desk/desk.js — JAVIS On Desk page: the hologram girl, the talk/type bar,
// the card board and the notice bubble. Bundled by esbuild into desk.bundle.js.
import { createDeskHologram } from "./hologram-desk.js";
import { classifyIntent } from "./intent.js";
import { h, api, GatewayError, LOADERS, CARD_META, sseDeltas, richText, ago } from "./cards.js";
import { recordUtterance } from "./voice-input.js";

const desk = window.javisDesk;
const $ = (id) => document.getElementById(id);
const body = document.body;
const ui = {
  stage: $("stage"),
  board: $("board"),
  cards: $("cards"),
  input: $("input"),
  form: $("ask"),
  mic: $("btn-mic"),
  bubble: $("bubble"),
  bubbleText: $("bubble-text"),
  bubbleActions: $("bubble-actions"),
  badge: $("badge"),
  greeting: $("greeting"),
  linkState: $("link-state"),
};

const MAX_CARDS = 6;
const state = {
  mode: "compact",
  prefs: { voiceReply: false, doNotDisturb: false },
  paired: null,
  sessions: { mode: "idle", working: 0, waiting: 0, errors: 0, total: 0, sessions: [] },
  waitingOwner: 0,
  highAlerts: 0,
  busy: 0,
  recorder: null,
  chatSid: null,
  permissions: new Map(),
  bubbleTimer: null,
  bubbleSticky: false,
  speakingAudio: null,
  autoSigningIn: false,
  pairPromptPending: false,
};

// ── hologram ──
// No WebGL (old GPU, remote desktop, blocklisted driver): show the character as a
// still glowing portrait so the assistant keeps working.
function stillPortrait() {
  const canvas = $("holo");
  const img = h("img", { class: "still", src: "hologram/character.jpg", alt: "" });
  canvas.replaceWith(img);
  return { setState() {}, setAudioLevel() {}, setGaze() {}, setActive() {}, setPalette() {}, playIntro() {}, stats: () => ({ points: 0 }), destroy() {} };
}
let holo;
try {
  holo = createDeskHologram($("holo"), { palette: "cyan", intro: !window.__JAVIS_SKIP_INTRO });
} catch (err) {
  console.warn("JAVIS: hologram unavailable, using still portrait:", err && err.message);
  holo = stillPortrait();
}

function phase() {
  if (state.recorder) return "listening";
  if (state.speakingAudio) return "speaking";
  if (state.busy > 0) return "thinking";
  if (state.permissions.size || state.sessions.mode === "waiting" || state.waitingOwner > 0) return "alert";
  return "idle";
}
function refreshPhase() {
  const p = phase();
  holo.setState(p === "alert" ? "alert" : p);
  body.dataset.phase = p === "alert" ? (state.permissions.size || state.sessions.mode === "waiting" ? "waiting" : "alert") : p;
  const badge = state.permissions.size + (state.sessions.waiting || 0) + (state.waitingOwner || 0);
  ui.badge.hidden = !badge || state.mode === "open";
  ui.badge.textContent = badge > 9 ? "9+" : String(badge);
}

function greeting(date = new Date()) {
  const hr = date.getHours();
  if (hr >= 5 && hr < 11) return "Chào buổi sáng anh Nhựt";
  if (hr >= 11 && hr < 13) return "Chào buổi trưa anh Nhựt";
  if (hr >= 13 && hr < 18) return "Chào buổi chiều anh Nhựt";
  if (hr >= 18 && hr < 23) return "Chào buổi tối anh Nhựt";
  return "Khuya rồi anh Nhựt";
}

// ── layout + click-through ──
desk.onLayout((layout) => {
  state.mode = layout.mode;
  body.dataset.mode = layout.mode;
  body.dataset.side = layout.side;
  ui.board.hidden = layout.mode !== "open";
  holo.setActive(layout.mode === "open");
  refreshPhase();
  if (layout.mode === "open") {
    ui.greeting.textContent = greeting();
    if (!ui.bubbleSticky) hideBubble();
  }
});

let interactive = false;
function setInteractive(next) {
  if (next === interactive) return;
  interactive = next;
  desk.setInteractive(next);
}
// In compact/peek mode the transparent window lets clicks through except over
// the girl and the bubble. Mouse moves are forwarded so we can tell.
document.addEventListener("mousemove", (e) => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  setInteractive(!!(el && el.closest("[data-hit]")));
  const r = ui.stage.getBoundingClientRect();
  holo.setGaze(((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 0.8, ((e.clientY - (r.top + r.height * 0.35)) / r.height) * 1.2);
  holo.setActive(state.mode === "open" || !!(el && el.closest("#stage")));
});
document.addEventListener("mouseleave", () => setInteractive(false));

// ── drag the girl / click to open ──
let drag = null;
ui.stage.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  ui.stage.setPointerCapture(e.pointerId);
  drag = { x: e.screenX, y: e.screenY, moved: false };
});
ui.stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.screenX - drag.x;
  const dy = e.screenY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  ui.stage.classList.add("dragging");
  drag.x = e.screenX;
  drag.y = e.screenY;
  desk.moveBy(dx, dy);
});
ui.stage.addEventListener("pointerup", () => {
  if (!drag) return;
  const wasDrag = drag.moved;
  drag = null;
  ui.stage.classList.remove("dragging");
  if (wasDrag) desk.moveEnd();
  else toggleBoard();
});
ui.stage.addEventListener("contextmenu", (e) => { e.preventDefault(); desk.showMenu(); });
ui.stage.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBoard(); }
});

function openBoard() {
  if (state.mode !== "open") desk.setMode("open");
  setTimeout(() => ui.input.focus(), 60);
}
function closeBoard() {
  if (state.recorder) state.recorder.stop();
  desk.setMode(ui.bubble.hidden ? "compact" : "peek");
}
function toggleBoard() {
  if (state.mode === "open") closeBoard();
  else openBoard();
}
$("btn-close").addEventListener("click", closeBoard);
$("btn-menu").addEventListener("click", () => desk.showMenu());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.mode === "open") closeBoard();
});

desk.onCommand((cmd) => {
  if (!cmd) return;
  if (cmd.type === "focus-input") openBoard();
  else if (cmd.type === "ask") { openBoard(); ask(cmd.text); }
  else if (cmd.type === "pair") { openBoard(); showPairCard(); }
  else if (cmd.type === "blur") {
    const playing = [...document.querySelectorAll("video,audio")].some((m) => !m.paused);
    const answering = document.documentElement.hasAttribute("data-javis-asking");
    if (!ui.input.value.trim() && !state.recorder && !playing && !state.permissions.size && !answering) closeBoard();
  }
});
desk.onPrefs((p) => { state.prefs = { ...state.prefs, ...p }; });

// ── bubble ──
function showBubble(text, { actions = [], warm = false, sticky = false, ttl = 12000 } = {}) {
  // With the board open, cards carry the message; the bubble would cover her face.
  if (state.mode === "open") return;
  ui.bubbleText.replaceChildren(...(Array.isArray(text) ? text : [text]).map((t) => (t instanceof Node ? t : document.createTextNode(t))));
  ui.bubbleActions.replaceChildren(...actions.map((a) => h("button", { class: `btn ${a.tone || ""}`, type: "button", onclick: () => { a.run(); if (!a.keep) hideBubble(); } }, a.label)));
  ui.bubble.classList.toggle("warm", warm);
  ui.bubble.hidden = false;
  state.bubbleSticky = sticky;
  if (state.mode === "compact") desk.setMode("peek");
  clearTimeout(state.bubbleTimer);
  if (!sticky) state.bubbleTimer = setTimeout(hideBubble, ttl);
}
// Bubbles JAVIS shows by itself (new work, alerts, session notices, greetings) wait while
// the owner is typing or using the mouse (idle < 30 s, focus-guard in main) so they never
// pop up under the pointer mid-work. Only the latest waits; re-checked every 30 s for up
// to 10 minutes, then dropped (the badge still counts it).
const NOTIFY_RECHECK_MS = 30000;
const NOTIFY_MAX_WAIT_MS = 10 * 60 * 1000;
let pendingNotice = null;
let pendingTimer = null;
async function notify(text, opts = {}) {
  if (state.mode === "open") return;
  pendingNotice = { text, opts, since: (pendingNotice && pendingNotice.since) || Date.now() };
  clearTimeout(pendingTimer);
  let busy = false;
  try { busy = await desk.userBusy(); } catch {}
  const n = pendingNotice;
  if (!n) return;
  if (!busy) {
    pendingNotice = null;
    showBubble(n.text, n.opts);
    return;
  }
  if (Date.now() - n.since > NOTIFY_MAX_WAIT_MS) { pendingNotice = null; return; }
  pendingTimer = setTimeout(() => { if (pendingNotice) notify(pendingNotice.text, pendingNotice.opts); }, NOTIFY_RECHECK_MS);
}

function hideBubble() {
  clearTimeout(state.bubbleTimer);
  ui.bubble.hidden = true;
  state.bubbleSticky = false;
  if (state.mode === "peek") desk.setMode("compact");
}

// ── cards ──
function addCard({ type, title, icon, question, warm = false }) {
  const card = h("article", { class: `card fresh ${warm ? "warm" : ""}`, "data-type": type });
  const close = h("button", { class: "card-x", type: "button", "aria-label": "Đóng thẻ", onclick: () => card.remove() }, "×");
  card.append(
    h("div", { class: "card-head" }, h("span", { class: "card-icon", "aria-hidden": "true" }, icon || "•"), h("span", { class: "card-title" }, title), question ? h("span", { class: "card-q", title: question }, `“${question}”`) : null, close),
    h("div", { class: "card-body" }, h("div", { class: "skeleton" })),
  );
  ui.cards.prepend(card);
  for (const old of ui.cards.querySelectorAll(".card.fresh")) if (old !== card) old.classList.remove("fresh");
  const extra = [...ui.cards.children].slice(MAX_CARDS);
  for (const el of extra) el.remove();
  ui.cards.scrollTop = 0;
  const fill = (...nodes) => card.querySelector(".card-body").replaceChildren(...nodes.filter(Boolean));
  return { card, fill };
}

const ctx = {
  openUrl: (url) => desk.openUrl(url),
  openAsk: (id) => showAskCard(id),
  localSessions: () => state.sessions,
  playAudio: (el) => {
    for (const m of document.querySelectorAll("audio,video")) if (m !== el) m.pause();
    el.play().catch(() => {});
  },
};

function errorView(err, retry) {
  if (err instanceof GatewayError && err.status === 401) {
    state.paired = false;
    updateLinkState();
    return h("div", {}, h("p", { class: "empty" }, err.code === "pairing_rejected" ? "JAVIS không nhận phiên của máy này nữa — cần kết nối lại." : "Máy này chưa kết nối JAVIS."),
      h("div", { class: "card-foot" }, h("button", { class: "btn primary", type: "button", onclick: showPairCard }, "Kết nối")));
  }
  if (err instanceof GatewayError && err.status === 403) {
    return h("div", {}, h("p", { class: "empty" }, err.code === "feature_denied" ? "Mục này chưa có quyền với tài khoản trên máy. Anh vẫn đang kết nối, thử lại sau nhé." : "Mục này chỉ chủ nhân xem được."),
      retry ? h("div", { class: "card-foot" }, h("button", { class: "btn", type: "button", onclick: retry }, "Thử lại")) : null);
  }
  const text = err instanceof GatewayError && err.status === 502
    ? "Chưa tới được gateway JAVIS (Tailscale tắt hoặc server đang bận)."
    : `Lỗi khi lấy dữ liệu (${err.message || "không rõ"}).`;
  return h("div", {}, h("p", { class: "empty" }, text), retry ? h("div", { class: "card-foot" }, h("button", { class: "btn", type: "button", onclick: retry }, "Thử lại")) : null);
}

async function showDataCard(type, params, question) {
  const [load, render] = LOADERS[type];
  const meta = CARD_META[type];
  const { fill } = addCard({ type, title: meta.title, icon: meta.icon, question });
  const run = async () => {
    state.busy++;
    refreshPhase();
    try {
      const data = await load(params);
      const view = render(data, ctx, params);
      fill(view.summary ? h("p", { class: "card-summary" }, view.summary) : null, view.body, view.foot ? h("div", { class: "card-foot" }, view.foot) : null);
      state.paired = true;
      updateLinkState();
      if (view.summary) say(view.speak || view.summary, { quiet: state.mode === "open" });
    } catch (err) {
      fill(errorView(err, run));
    } finally {
      state.busy--;
      refreshPhase();
    }
  };
  await run();
}

// ── "Cần anh duyệt": the shared <javis-ask-box> web component (same as JAVIS web) ──
// Tap a card → summary (việc gì, vì sao cần anh, đề xuất, hạn, nếu trễ, link nghe/xem) +
// choice buttons + message box + Gửi, answered via POST /fleet/tasklife/<id>/answer through
// the same-origin proxy. Only merged cards (group_ids) / approval slips open a deep link.
const ASKBOX_SRC = "ui/javis-ask-box.js";
function loadAskbox() {
  if (!document.querySelector("script[data-javis-askbox]")) {
    document.head.append(h("script", { type: "module", src: ASKBOX_SRC, "data-javis-askbox": "1" }));
  }
  return customElements.whenDefined("javis-ask-box");
}

// Open the card for `focusId` inside the component (it opens the first one by default).
function focusAsk(box, focusId) {
  if (!focusId) return;
  let done = false;
  const tryFocus = () => {
    const root = box.shadowRoot;
    const li = root && root.querySelector(`li[data-ask-id="${CSS.escape(String(focusId))}"]`);
    if (!li) return false;
    done = true;
    if (!li.classList.contains("open")) li.querySelector(".jab-head").click();
    setTimeout(() => {
      li.scrollIntoView({ block: "nearest" });
      const ta = li.querySelector("textarea");
      if (ta) ta.focus({ preventScroll: true });
    }, 60);
    return true;
  };
  const obs = new MutationObserver(() => { if (!done && tryFocus()) obs.disconnect(); });
  const watch = () => {
    if (tryFocus()) return;
    obs.observe(box.shadowRoot, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 10000);
  };
  if (box.shadowRoot) watch();
  else setTimeout(watch, 0);
}

let askCard = null;
function showAskCard(focusId) {
  if (state.mode !== "open") openBoard();
  if (askCard && askCard.card.isConnected) {
    // Already on the board: bring it to the top and open the asked card.
    ui.cards.prepend(askCard.card);
    ui.cards.scrollTop = 0;
    askCard.box.refresh();
    focusAsk(askCard.box, focusId);
    return askCard;
  }
  const { card, fill } = addCard({ type: "ask", title: "Trả lời ngay", icon: "✎", warm: true });
  const box = document.createElement("javis-ask-box");
  box.setAttribute("fleet", ""); // same origin javis-desk://app → the main process adds the token
  box.setAttribute("via", "desk");
  box.addEventListener("javis-ask-open-link", (e) => {
    // Merged cards / approval slips / "nghe · xem" links: system browser, never in-window.
    e.preventDefault();
    const u = String((e.detail && e.detail.url) || "");
    desk.openUrl(/^https?:\/\//.test(u) ? u : "https://javis.bumbee.asia" + (u.startsWith("/") ? u : "/" + u));
  });
  box.addEventListener("javis-ask-count", (e) => {
    state.waitingOwner = Number((e.detail && e.detail.n) || 0);
    refreshPhase();
  });
  box.addEventListener("javis-ask-answered", (e) => {
    const d = e.detail || {};
    say(`Dạ, em gửi rồi: ${d.label || "đã trả lời"}${d.text ? " (kèm lời nhắn)" : ""}.`, { quiet: true });
  });
  fill(box);
  askCard = { card, box };
  loadAskbox().then(() => focusAsk(box, focusId)).catch(() => {
    fill(h("p", { class: "empty" }, "Chưa mở được hộp trả lời — anh mở JAVIS web giúp em."),
      h("div", { class: "card-foot" }, h("button", { class: "chip-btn", type: "button", onclick: () => desk.openUrl("https://javis.bumbee.asia") }, "JAVIS web ↗")));
  });
  return askCard;
}

function showHelpCard(question) {
  const { fill } = addCard({ type: "help", title: "Em làm được gì", icon: "?", question });
  fill(h("p", { class: "card-summary" }, "Anh nói hoặc gõ tự nhiên, có dấu hay không đều được:"),
    h("ul", { class: "help-list" },
      h("li", {}, "“việc hôm nay”, “việc cần anh” → việc đang chờ anh"),
      h("li", {}, "“các máy sao rồi”, “GPU nóng không” → máy + tải"),
      h("li", {}, "“kho video mới”, “nghe nhạc mới” → kho tài sản, phát ngay"),
      h("li", {}, "“cảnh báo”, “số liệu kênh”, “dòng tiền”, “kết quả vừa làm”"),
      h("li", {}, "“kiểm tra hệ thống”, “mở youtube”, “mở bumbee.asia”"),
      h("li", {}, "Việc khác → em chuyển bộ não JAVIS làm luôn")));
}

function showLinkCard(params, question) {
  const { fill } = addCard({ type: "link", title: `Mở ${params.label}`, icon: "↗", question });
  desk.openUrl(params.url);
  fill(h("p", { class: "card-summary" }, `Đã mở ${params.label} trên trình duyệt.`), h("div", { class: "card-foot" }, h("button", { class: "chip-btn", type: "button", onclick: () => desk.openUrl(params.url) }, params.url.replace(/^https?:\/\//, ""), " ↗")));
  say(`Dạ, em mở ${params.label} rồi.`, { quiet: true });
}

async function ensureChatSession() {
  if (state.chatSid) return state.chatSid;
  try {
    const chat = await api("/fleet/chat");
    state.chatSid = chat.active || `s-${Date.now().toString(36)}`;
  } catch {
    state.chatSid = `s-${Date.now().toString(36)}`;
  }
  return state.chatSid;
}

async function showChatCard(text) {
  const { fill } = addCard({ type: "chat", title: "JAVIS", icon: "✦", question: null });
  const answer = h("div", { class: "rich typing" }, "…");
  fill(h("p", { class: "chat-q" }, "Anh: ", text), answer);
  state.busy++;
  refreshPhase();
  let out = "";
  try {
    const sid = await ensureChatSession();
    const now = Date.now();
    api("/fleet/chat/messages", { method: "POST", body: { session_id: sid, client_id: "desk", message: { id: `u-${now}`, role: "user", text, time: "", pending: false } } }).catch(() => {});
    const res = await fetch("/fleet/voice/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, session_id: sid, chat_session_id: sid, stream: true, execute: true, tools: true }),
    });
    if (!res.ok || !res.body) {
      let code = null;
      try { code = (await res.json()).error; } catch {}
      throw new GatewayError(res.status, code);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const cut = buf.lastIndexOf("\n\n");
      if (cut < 0) continue;
      for (const d of sseDeltas(buf.slice(0, cut))) out += d;
      buf = buf.slice(cut + 2);
      answer.replaceChildren(richText(out || "…"));
    }
    for (const d of sseDeltas(buf)) out += d;
    out = out.trim() || "Dạ anh!";
    answer.classList.remove("typing");
    answer.replaceChildren(richText(out));
    api("/fleet/chat/messages", { method: "POST", body: { session_id: sid, client_id: "desk", message: { id: `a-${now}`, role: "assistant", text: out, time: "" } } }).catch(() => {});
    state.paired = true;
    updateLinkState();
    say(out, { quiet: state.mode === "open" });
  } catch (err) {
    answer.classList.remove("typing");
    answer.replaceChildren(errorView(err, () => ask(text)));
  } finally {
    state.busy--;
    refreshPhase();
  }
}

function ask(raw) {
  const text = String(raw || "").trim();
  const intent = classifyIntent(text);
  for (const b of document.querySelectorAll("#quick button")) b.classList.toggle("on", b.dataset.ask === text);
  if (intent.type === "help") return showHelpCard(text);
  if (intent.type === "pair") return showPairCard();
  if (intent.type === "link") return showLinkCard(intent.params, text);
  if (intent.type === "chat") return showChatCard(text);
  return showDataCard(intent.type, intent.params, text);
}

ui.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = ui.input.value.trim();
  if (!text) return;
  ui.input.value = "";
  ask(text);
});
for (const b of document.querySelectorAll("#quick button")) b.addEventListener("click", () => ask(b.dataset.ask));

// ── voice in ──
ui.mic.addEventListener("click", async () => {
  if (state.recorder) { state.recorder.stop(); return; }
  if (state.speakingAudio) state.speakingAudio.pause();
  ui.mic.classList.add("on");
  ui.input.placeholder = "Em đang nghe…";
  state.recorder = recordUtterance({ onLevel: (l) => holo.setAudioLevel(l) });
  refreshPhase();
  try {
    const clip = await state.recorder.done;
    state.recorder = null;
    ui.mic.classList.remove("on");
    ui.input.placeholder = "Em đang nghe ra chữ…";
    refreshPhase();
    if (!clip.heardSpeech) {
      ui.input.placeholder = "Em chưa nghe thấy gì — anh bấm mic nói lại nhé";
      return;
    }
    const r = await desk.transcribe(clip.base64);
    if (r && r.ok && r.text) {
      ui.input.value = "";
      ask(r.text);
    } else {
      ui.input.placeholder = "Chưa nghe ra chữ — anh gõ giúp em nhé";
    }
  } catch (err) {
    ui.input.placeholder = err && err.name === "NotAllowedError" ? "Máy chưa cho JAVIS dùng micro" : "Mic lỗi — anh gõ giúp em nhé";
  } finally {
    state.recorder = null;
    ui.mic.classList.remove("on");
    refreshPhase();
    setTimeout(() => { ui.input.placeholder = "Nói hoặc gõ: việc hôm nay, máy, kho video, dòng tiền…"; }, 4000);
  }
});

// ── voice out ──
function say(text, { quiet = false } = {}) {
  const line = String(text || "").replace(/\*\*/g, "").split(/\n/)[0].slice(0, 220);
  if (!quiet && line) showBubble(line, { actions: [{ label: "Mở bảng", tone: "primary", run: openBoard }], ttl: 9000 });
  if (state.prefs.voiceReply && line) speak(line);
}

async function speak(text) {
  try {
    const res = await fetch("/fleet/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (!res.ok || (res.headers.get("Content-Type") || "").includes("json")) return;
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    const ac = new AudioContext();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 256;
    ac.createMediaElementSource(audio).connect(analyser);
    analyser.connect(ac.destination);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    state.speakingAudio = audio;
    refreshPhase();
    const tick = () => {
      if (state.speakingAudio !== audio) return;
      analyser.getByteFrequencyData(buf);
      holo.setAudioLevel(buf.reduce((a, b) => a + b, 0) / (buf.length * 160));
      requestAnimationFrame(tick);
    };
    const end = () => {
      if (state.speakingAudio === audio) state.speakingAudio = null;
      holo.setAudioLevel(0);
      URL.revokeObjectURL(url);
      ac.close().catch(() => {});
      refreshPhase();
    };
    audio.addEventListener("ended", end);
    audio.addEventListener("pause", end);
    await audio.play();
    tick();
  } catch {
    state.speakingAudio = null;
    refreshPhase();
  }
}

// ── connection: silent tailnet sign-in, pairing (QR / key) as the fallback ──
function updateLinkState() {
  ui.linkState.className = `link-state ${state.paired === true ? "ok" : state.paired === false ? "warn" : ""}`;
  ui.linkState.title = state.paired === true ? "Đã kết nối JAVIS" : state.autoSigningIn ? "Đang tự kết nối JAVIS…" : state.paired === false ? "Chưa kết nối JAVIS" : "Đang kiểm tra kết nối";
}

const PAIR_TEXT = {
  pending: "Đang chờ anh duyệt trên JAVIS web…",
  approved: "Kết nối xong. Em sẵn sàng!",
  denied: "Yêu cầu ghép đôi bị từ chối.",
  expired: "Mã hết hạn — bấm bắt đầu lại.",
  error: "Không tới được gateway JAVIS (đã thử 3 lần, dừng). Kiểm tra Tailscale rồi thử lại.",
};
let pairCard = null;
async function showPairCard() {
  if (pairCard && pairCard.card.isConnected) pairCard.card.remove();
  pairCard = addCard({ type: "pair", title: "Kết nối máy này với JAVIS", icon: "⌁", warm: true });
  const status = await desk.status();
  const paired = !!(status && status.paired && !status.authError);
  const auto = h("p", {}, paired
    ? `Máy đã kết nối${status.email ? ` với ${status.email}` : ""}${status.kind === "oauth" ? " (tự đăng nhập qua Tailscale)" : ""}.`
    : status && status.autoSigningIn ? "Đang tự đăng nhập máy của anh qua Tailscale…"
      : "Máy của anh trong Tailscale sẽ tự kết nối, không cần làm gì. Không tự vào được thì dùng cách dự phòng dưới đây.");
  const line = h("p", { class: "empty" }, "Dự phòng: quét mã QR bằng điện thoại hoặc mở link rồi bấm Duyệt.");
  const start = h("button", { class: "btn", type: "button" }, paired ? "Ghép đôi lại" : "Ghép đôi bằng mã QR");
  const keyInput = h("input", { type: "password", class: "key-input", placeholder: "hoặc dán khoá thiết bị", autocomplete: "off", spellcheck: "false" });
  const keyBtn = h("button", { class: "btn ghost", type: "button" }, "Dùng khoá");
  keyBtn.addEventListener("click", async () => {
    const r = await desk.pairPasteKey(keyInput.value);
    keyInput.value = "";
    line.textContent = r && r.ok ? "Đã dùng khoá thiết bị. Em sẵn sàng!" : "Khoá chưa đúng định dạng.";
    if (r && r.ok) onConnected("key");
  });
  pairCard.fill(h("div", {}, auto, line, h("div", { class: "card-foot" }, start), h("div", { class: "card-foot key-row" }, keyInput, keyBtn), h("p", { class: "empty" }, `Gateway: ${status ? status.gateway : "?"}`)));
  pairCard.auto = auto;
  start.addEventListener("click", async () => {
    start.disabled = true;
    const r = await desk.pairStart();
    if (!r || !r.ok) {
      line.textContent = `Chưa bắt đầu được (${(r && r.error) || "lỗi"}).`;
      start.disabled = false;
      return;
    }
    const pairLine = h("p", {}, PAIR_TEXT.pending);
    pairCard.fill(h("div", { class: "pair" },
      r.qr ? h("img", { src: r.qr, alt: "Mã QR ghép đôi" }) : h("div"),
      h("div", {}, h("p", {}, "Mã ghép đôi"), h("code", {}, r.userCode), pairLine,
        h("div", { class: "card-foot" }, h("button", { class: "btn", type: "button", onclick: () => desk.pairOpenBrowser(r.verifyUrl) }, "Mở trang duyệt ↗")))));
    pairCard.line = pairLine;
  });
}

let connectedOnce = false;
function onConnected(via) {
  state.paired = true;
  state.pairPromptPending = false;
  updateLinkState();
  if (ui.bubbleSticky) hideBubble();
  if (!connectedOnce) {
    connectedOnce = true;
    say(via === "tailnet" ? "Em tự kết nối JAVIS xong rồi anh. Anh muốn xem gì trước?" : "Kết nối xong rồi anh. Anh muốn xem gì trước?", { quiet: state.mode === "open" });
  }
  startStream();
  checkOwnerWork("pair");
}

function promptPairing() {
  if (state.mode === "open") { showPairCard(); return; }
  notify("Chào anh, em là JAVIS. Em chưa tự kết nối được máy này (Tailscale?). Anh bấm Kết nối để ghép đôi dự phòng nhé.", {
    sticky: true, actions: [{ label: "Kết nối", tone: "primary", run: () => { openBoard(); showPairCard(); } }, { label: "Để sau", tone: "ghost", run: () => {} }],
  });
}

desk.onPairUpdate((u) => {
  if (pairCard && pairCard.line) pairCard.line.textContent = PAIR_TEXT[u.status] || u.status;
  if (u.status === "approved") onConnected(u.via || "pair");
});
desk.onAuth((s) => {
  if (!s) return;
  state.autoSigningIn = !!s.autoSigningIn;
  if (s.paired && !s.authError) state.paired = true;
  else if (!s.autoSigningIn) state.paired = false;
  updateLinkState();
  if (pairCard && pairCard.auto && pairCard.card.isConnected && !s.paired) {
    pairCard.auto.textContent = s.autoSigningIn ? "Đang tự đăng nhập máy của anh qua Tailscale…" : "Chưa tự kết nối được. Anh dùng cách dự phòng dưới đây nhé.";
  }
  // The silent sign-in finished without success: now offer the pairing fallback once.
  if (!s.paired && !s.autoSigningIn && state.pairPromptPending) {
    state.pairPromptPending = false;
    promptPairing();
  }
});
desk.onAuthError(() => { state.paired = false; updateLinkState(); });

// ── local AI sessions + permission cards ──
desk.onSessions((s) => { state.sessions = s; refreshPhase(); });
desk.onSessionNotice((n) => {
  const who = n.agent === "codex" ? "Codex" : n.agent === "claude-code" ? "Claude" : n.agent || "Phiên làm việc";
  const where = n.where ? ` ở ${n.where}` : "";
  if (n.phase === "waiting") notify([h("b", {}, who), `${where} đang chờ anh trả lời.`], { warm: true, ttl: 20000, actions: [{ label: "Xem phiên", tone: "primary", run: () => { openBoard(); ask("phiên claude"); } }] });
  else if (n.phase === "error") notify([h("b", {}, who), `${where} vừa gặp lỗi.`], { warm: true, ttl: 15000 });
  else if (n.phase === "done") notify([h("b", {}, who), `${where} làm xong rồi anh.`], { ttl: 7000 });
  else if (n.phase === "notice") notify([h("b", {}, n.title || "Thông báo"), n.message ? ` ${n.message}` : ""], { warm: n.level === "error" || n.level === "warning" });
});

desk.onPermission((p) => {
  state.permissions.set(p.id, p);
  refreshPhase();
  const decide = (behavior) => desk.decide(p.id, behavior);
  const { card, fill } = addCard({ type: "permission", title: p.elicitation ? "Claude đang hỏi anh" : `Claude xin quyền chạy ${p.tool}`, icon: "!", warm: true });
  card.dataset.permission = p.id;
  fill(
    p.cwd ? h("p", { class: "card-summary" }, p.cwd) : null,
    h("pre", { class: "perm-cmd" }, p.summary || p.tool),
    h("div", { class: "card-foot" }, p.elicitation
      ? [h("button", { class: "btn primary", type: "button", onclick: () => decide("deny") }, "Trả lời trong terminal")]
      : [
        h("button", { class: "btn primary", type: "button", onclick: () => decide("allow") }, "Cho phép"),
        p.canAlways ? h("button", { class: "btn", type: "button", onclick: () => decide("always") }, "Luôn cho phép") : null,
        h("button", { class: "btn ghost", type: "button", onclick: () => decide("deny") }, "Từ chối"),
      ]),
  );
  if (state.mode !== "open") {
    notify([h("b", {}, "Claude"), p.elicitation ? " đang hỏi anh." : ` xin chạy ${p.tool}: `, p.elicitation ? "" : (p.summary || "").slice(0, 80)], {
      warm: true,
      sticky: true,
      actions: p.elicitation ? [{ label: "Xem", tone: "primary", run: openBoard }] : [
        { label: "Cho phép", tone: "primary", run: () => decide("allow") },
        { label: "Từ chối", run: () => decide("deny") },
        { label: "Mở bảng", tone: "ghost", run: openBoard },
      ],
    });
  }
});
desk.onPermissionGone((id) => {
  state.permissions.delete(id);
  const card = ui.cards.querySelector(`[data-permission="${CSS.escape(id)}"]`);
  if (card) card.remove();
  if (!state.permissions.size && state.bubbleSticky) hideBubble();
  refreshPhase();
});

// ── owner work: notice when something new needs the owner ──
// Runs at start-up and when the gateway stream says tasks/alerts changed — no
// timed polling loop.
let lastCheckAt = 0;
let checkTimer = null;
async function checkOwnerWork(reason) {
  const gap = Date.now() - lastCheckAt;
  if (gap < 60000 && reason !== "pair" && reason !== "start") {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => checkOwnerWork("debounced"), 60000 - gap);
    return;
  }
  lastCheckAt = Date.now();
  try {
    const [tasks, alerts] = await Promise.all([api("/fleet/home/tasks"), api("/fleet/alerts").catch(() => ({ data: [] }))]);
    state.paired = true;
    updateLinkState();
    const waiting = (tasks.waiting || []).length;
    const high = (alerts.data || []).filter((a) => !a.ack && (a.severity === "high" || a.severity === "critical")).length;
    const grewWaiting = waiting > state.waitingOwner;
    const grewAlerts = high > state.highAlerts;
    state.waitingOwner = waiting;
    state.highAlerts = high;
    refreshPhase();
    if (state.prefs.doNotDisturb || state.mode === "open") return;
    if (grewWaiting) {
      const first = (tasks.waiting || [])[0];
      // Tap the bubble → the answer box opens right here on that card (summary + choices).
      notify([`Có `, h("b", {}, `${waiting} việc`), ` đang chờ anh quyết.`, first ? ` Gấp nhất: ${String(first.title || "").slice(0, 70)}` : ""], {
        warm: true, ttl: 25000, actions: [{ label: "Trả lời ngay", tone: "warm", run: () => showAskCard(first ? first.id : null) }, { label: "Xem việc", tone: "primary", run: () => { openBoard(); ask("việc cần anh"); } }, { label: "Để sau", tone: "ghost", run: () => {} }],
      });
    } else if (grewAlerts) {
      notify([h("b", {}, `${high} cảnh báo`), " mức cao đang mở."], { warm: true, ttl: 20000, actions: [{ label: "Xem", tone: "primary", run: () => { openBoard(); ask("cảnh báo"); } }] });
    }
  } catch (err) {
    if (err instanceof GatewayError && err.status === 401) {
      state.paired = false;
      updateLinkState();
    }
  }
}

// Gateway event stream (/fleet/stream): at most 3 reconnects with growing back-off,
// then stop until the owner does something (owner rule: no endless retries).
let streamFailures = 0;
let streamAbort = null;
async function startStream() {
  if (streamAbort) return;
  streamAbort = new AbortController();
  try {
    const res = await fetch("/fleet/stream?v=2", { signal: streamAbort.signal, headers: { Accept: "text/event-stream" } });
    if (!res.ok || !res.body || res.status === 204) throw new Error(`stream_${res.status}`);
    streamFailures = 0;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("\n");
        if (!data) continue;
        let ev = null;
        try { ev = JSON.parse(data); } catch { continue; }
        onGatewayEvent(ev);
      }
    }
    throw new Error("stream_closed");
  } catch (err) {
    streamAbort = null;
    if (err && err.name === "AbortError") return;
    streamFailures++;
    if (streamFailures <= 3) setTimeout(startStream, 5000 * 2 ** streamFailures);
  }
}

function onGatewayEvent(ev) {
  const type = ev && ev.type;
  if (type === "task.updated" || type === "alert.changed" || type === "approval.created" || type === "ticket.created") checkOwnerWork(type);
  else if (type === "avatar.command" && ev.data && (ev.data.say || ev.data.text)) {
    const text = String(ev.data.say || ev.data.text).slice(0, 220);
    if (!state.prefs.doNotDisturb) notify(text, { ttl: 15000 });
    if (state.prefs.voiceReply) speak(text);
  }
}

// ── start ──
(async function start() {
  ui.greeting.textContent = greeting();
  const info = await desk.info();
  if (info) state.prefs = { ...state.prefs, ...info };
  const s = await desk.sessions();
  if (s) state.sessions = s;
  const status = await desk.status();
  state.paired = status ? !!(status.paired && !status.authError) : null;
  state.autoSigningIn = !!(status && status.autoSigningIn);
  updateLinkState();
  refreshPhase();
  setTimeout(() => {
    if (state.paired) {
      connectedOnce = true;
      notify(`${greeting()}, hôm nay mình làm gì?`, { ttl: 6000, actions: [{ label: "Việc hôm nay", tone: "primary", run: () => { openBoard(); ask("việc cần anh"); } }] });
      checkOwnerWork("start");
      startStream();
    } else if (state.paired === null || state.autoSigningIn) {
      // Silent tailnet sign-in still running: offer pairing only if it ends without success.
      state.pairPromptPending = true;
    } else {
      promptPairing();
    }
  }, 2800);
})();

window.__javisDesk = { ask, holo, state, ago };
