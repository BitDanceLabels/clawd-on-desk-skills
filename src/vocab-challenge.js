// src/vocab-challenge.js — renderer for the auto-pop vocab challenge popup
"use strict";

const api = window.bumbeeChallenge;

const el = {
  card: document.getElementById("card"),
  badge: document.getElementById("badge"),
  meta: document.getElementById("meta"),
  game: document.getElementById("game"),
  empty: document.getElementById("empty"),
  scene: document.getElementById("scene"),
  cue: document.getElementById("cue"),
  choices: document.getElementById("choices"),
  feedback: document.getElementById("feedback"),
  reverse: document.getElementById("reverse"),
  auto: document.getElementById("auto"),
  gameType: document.getElementById("gameType"),
  closeBtn: document.getElementById("closeBtn"),
  snoozeBtn: document.getElementById("snoozeBtn"),
  skipBtn: document.getElementById("skipBtn"),
  addInput: document.getElementById("addInput"),
  addBtn: document.getElementById("addBtn"),
  addMsg: document.getElementById("addMsg"),
  spot: document.getElementById("spot"),
  spotTag: document.getElementById("spotTag"),
  spotTerm: document.getElementById("spotTerm"),
  spotIpa: document.getElementById("spotIpa"),
  spotVi: document.getElementById("spotVi"),
  spotEx: document.getElementById("spotEx"),
  spotSpeak: document.getElementById("spotSpeak"),
  wcue: document.getElementById("wcue"),
  wchoices: document.getElementById("wchoices"),
  wfeedback: document.getElementById("wfeedback"),
  wstreak: document.getElementById("wstreak"),
  suggBody: document.getElementById("suggBody"),
  suggSpeak: document.getElementById("suggSpeak"),
  suggNext: document.getElementById("suggNext"),
};

// ── 🧠 Game từ vựng siêu trí nhớ (chạy độc lập với game câu) ──
let wCurrent = null;  // { round, word }
let wLocked = false;
let suggPhrase = "";

async function loadWordRound() {
  wLocked = false;
  el.wfeedback.textContent = "";
  el.wfeedback.className = "wfeedback";
  try {
    const data = await api.nextWord({ excludeId: current && current.word ? current.word.id : "" });
    if (!data || !data.ok || !data.round) {
      el.wcue.textContent = "🎉 Hết từ đến hạn — thêm từ mới bên dưới nhé!";
      el.wchoices.replaceChildren();
      el.wstreak.textContent = "";
      wCurrent = null;
      return;
    }
    wCurrent = data;
    const vi = (data.word.meaning_vi || "").trim();
    el.wcue.textContent = vi ? `“${vi}” là từ nào?` : `“${data.word.meaning_en}” — pick the word:`;
    el.wstreak.textContent = data.word.streak > 0 ? `⚡ x${data.word.streak}` : "";
    el.wchoices.replaceChildren();
    (data.round.choices || []).slice(0, 4).forEach((choice) => {
      const b = document.createElement("button");
      b.className = "wchoice";
      b.textContent = choice;
      b.addEventListener("click", () => pickWord(choice, b));
      el.wchoices.appendChild(b);
    });
  } catch {
    el.wcue.textContent = "";
    el.wchoices.replaceChildren();
  }
}

async function pickWord(choice, btn) {
  if (wLocked || !wCurrent) return;
  wLocked = true;
  const answer = String(wCurrent.round.answer).trim().toLowerCase();
  const correct = String(choice).trim().toLowerCase() === answer;
  el.wchoices.querySelectorAll(".wchoice").forEach((b) => {
    b.setAttribute("disabled", "true");
    if (String(b.textContent).trim().toLowerCase() === answer) b.classList.add("correct");
    else if (b === btn && !correct) b.classList.add("wrong");
  });
  el.wfeedback.textContent = correct ? "✓ Đỉnh! Nhớ dai ghê 🐝" : `✗ Đáp án: ${wCurrent.round.answer}`;
  el.wfeedback.className = "wfeedback " + (correct ? "ok" : "bad");
  speak(wCurrent.word.term + (wCurrent.word.example ? ". " + wCurrent.word.example : ""));
  try { await api.answer({ id: wCurrent.word.id, correct, mode: "vi2en" }); } catch {}
  setTimeout(loadWordRound, correct ? 1600 : 2600);
}

// ── 💬 Gợi ý cụm giao tiếp mới ──
async function loadSuggestion() {
  try {
    const s = await api.suggest();
    if (!s || !s.ok) { el.suggBody.textContent = "Thêm từ mới để nhận gợi ý giao tiếp nhé!"; suggPhrase = ""; return; }
    suggPhrase = s.phrase;
    el.suggBody.replaceChildren();
    const p = document.createElement("span");
    p.className = "phrase";
    p.textContent = s.phrase;
    const note = document.createElement("span");
    note.className = "viNote";
    const vi = (s.meaning_vi || "").trim();
    note.textContent = ` — ${s.term}${vi ? ` · ${vi}` : ""}`;
    el.suggBody.append(p, note);
  } catch { suggPhrase = ""; }
}

// Hiện thẻ Từ vựng (recap sau khi trả lời / từ mới vừa thêm)
function showSpot(info, tag) {
  if (!info || !info.term) return;
  el.spotTag.textContent = tag || "Từ vựng";
  el.spotTerm.textContent = info.term;
  el.spotIpa.textContent = info.pronunciation || "";
  const vi = (info.meaning_vi || "").trim();
  el.spotVi.innerHTML = "";
  const b = document.createElement("b");
  b.textContent = vi || (info.meaning_en || "");
  el.spotVi.append(vi ? "Nghĩa: " : "Meaning: ", b);
  el.spotEx.textContent = info.example || "";
  el.spot.classList.remove("hidden");
}
function hideSpot() { el.spot.classList.add("hidden"); }

let current = null;   // { round, word, player, dueCount }
let locked = false;   // true after an answer, until next round loads
let lastSpeakLine = ""; // câu tiếng Anh gần nhất để nghe lại

function scrollCardToTop() {
  if (el.card) el.card.scrollTop = 0;
}

// ── TTS: đọc câu tiếng Anh để luyện nghe ──
function speak(text) {
  const line = String(text || "").trim();
  if (!line || !window.speechSynthesis) return;
  lastSpeakLine = line;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.lang = "en-US";
    u.rate = 0.95;
    const voice = speechSynthesis.getVoices().find((v) => /^en(-|_)/i.test(v.lang) && /female|samantha|zira|aria/i.test(v.name))
      || speechSynthesis.getVoices().find((v) => /^en(-|_)/i.test(v.lang));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch {}
}

function setConfigFromUI() {
  api.setConfig({ reverse: el.reverse.checked, auto: el.auto.checked, gameType: el.gameType.value });
}

async function loadConfig() {
  try {
    const cfg = await api.getConfig();
    if (cfg && cfg.ok) {
      el.reverse.checked = !!cfg.reverse;
      el.auto.checked = !!cfg.auto;
      if (cfg.gameType) el.gameType.value = cfg.gameType;
    }
  } catch {}
}

function renderEmpty() {
  scrollCardToTop();
  el.game.classList.add("hidden");
  el.empty.classList.remove("hidden");
  el.meta.textContent = "";
  el.badge.textContent = "Bumbee";
}

function renderRound(data) {
  scrollCardToTop();
  current = data;
  locked = false;
  lastSpeakLine = "";
  hideSpot(); // ẩn thẻ từ vựng khi đang hỏi — không lộ đáp án
  const { round, word, player, dueCount } = data;
  el.empty.classList.add("hidden");
  el.game.classList.remove("hidden");

  el.badge.textContent = round.title || "Challenge";
  const lv = player ? `Lv ${player.level} · ${player.xp} XP` : "";
  const due = Number.isFinite(dueCount) ? ` · ${dueCount} đến hạn` : "";
  el.meta.textContent = `${lv}${due}`;

  el.scene.textContent = round.scene || "";
  el.cue.textContent = round.cue || round.prompt || "";
  el.feedback.textContent = "";
  el.feedback.className = "feedback";

  el.choices.replaceChildren();
  (round.choices || []).forEach((choice, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.dataset.value = choice;
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = String(i + 1);
    const t = document.createElement("span");
    t.textContent = choice;
    b.append(k, t);
    b.addEventListener("click", () => pick(choice, b));
    el.choices.appendChild(b);
  });
}

async function pick(choice, btn) {
  if (locked || !current) return;
  locked = true;
  const round = current.round;
  const correct = String(choice).trim().toLowerCase() === String(round.answer).trim().toLowerCase();

  // Lock all buttons, mark correct/wrong
  const buttons = Array.from(el.choices.querySelectorAll(".choice"));
  buttons.forEach((b) => {
    b.setAttribute("disabled", "true");
    const val = String(b.dataset.value).trim().toLowerCase();
    if (val === String(round.answer).trim().toLowerCase()) b.classList.add("correct");
    else if (b === btn && !correct) b.classList.add("wrong");
  });

  el.feedback.textContent = correct
    ? `✓ Chuẩn! ${round.coach || ""}`.trim()
    : `✗ Đáp án: ${round.answer}`;
  el.feedback.className = "feedback " + (correct ? "ok" : "bad");

  // Luyện nghe: đọc to câu tiếng Anh chuẩn của round này
  speak(round.speakLine || round.answer);
  // Thẻ Từ vựng recap: từ + nghĩa VI + ví dụ
  showSpot(current.word, correct ? "✓ Từ vừa học" : "📖 Học lại từ này");

  try {
    await api.answer({ id: current.word.id, correct, mode: round.mode });
  } catch {}

  // Auto-advance (chậm hơn để kịp nghe + đọc thẻ từ vựng)
  setTimeout(loadNext, correct ? 3200 : 4500);
}

async function loadNext() {
  locked = false;
  try {
    const data = await api.next({ reverse: el.reverse.checked, gameType: el.gameType.value });
    if (!data || !data.ok || !data.round) { renderEmpty(); return; }
    renderRound(data);
  } catch {
    renderEmpty();
  }
}

// ── Thêm từ chưa biết → AI soạn bài học → vào game ──
async function addUnknownTerm() {
  const term = el.addInput.value.trim();
  if (!term) return;
  el.addBtn.setAttribute("disabled", "true");
  el.addMsg.className = "addmsg";
  el.addMsg.textContent = `⏳ Đang thêm "${term}" — AI soạn nghĩa + ví dụ…`;
  try {
    const res = await api.add({ term });
    if (res && res.ok && res.multi) {
      // Bản nháp nhiều từ: AI đã bóc tách từng từ + soạn thẻ câu chú giải
      el.addMsg.className = "addmsg ok";
      const names = (res.terms || []).map((t) => t.term).join(", ");
      el.addMsg.textContent = `✓ Đã tách ${res.terms.length} từ: ${names}`.slice(0, 160);
      el.addInput.value = "";
      showSpot({
        term: `📒 ${res.terms.length} từ mới`,
        pronunciation: "",
        meaning_vi: (res.terms || []).map((t) => `${t.term} = ${t.meaning_vi}`).join(" · "),
        example: res.annotated || "",
      }, "🆕 Câu học nhiều từ — đọc là nhớ luôn");
      speak(term);
      loadWordRound();
      loadSuggestion();
    } else if (res && res.ok) {
      el.addMsg.className = "addmsg ok";
      el.addMsg.textContent = res.existed
        ? `✓ "${term}" đã có trong kho — sẽ ôn lại sớm.`
        : `✓ Đã thêm "${term}" (kho: ${res.total} từ). Sẽ xuất hiện trong game ngay!`;
      el.addInput.value = "";
      // Từ mới nhảy ngay lên thẻ Từ vựng + đọc luôn cho quen tai + vào game siêu trí nhớ
      if (res.item) {
        showSpot(res.item, "🆕 Từ mới vào game");
        speak(res.item.term + ". " + (res.item.example || ""));
        loadWordRound();
        loadSuggestion();
      }
    } else {
      el.addMsg.textContent = `✗ Không thêm được: ${res && res.reason || "lỗi"}`;
    }
  } catch {
    el.addMsg.textContent = "✗ Lỗi kết nối, thử lại nhé.";
  }
  el.addBtn.removeAttribute("disabled");
  setTimeout(() => { el.addMsg.textContent = ""; }, 6000);
}

// ── Events ──
el.closeBtn.addEventListener("click", () => api.close());
el.skipBtn.addEventListener("click", () => { if (!locked) loadNext(); });
el.snoozeBtn.addEventListener("click", () => api.snooze(30));
el.reverse.addEventListener("change", () => { setConfigFromUI(); loadNext(); });
el.auto.addEventListener("change", setConfigFromUI);
el.gameType.addEventListener("change", () => { setConfigFromUI(); loadNext(); });
// Nghe lại: đọc từ trên thẻ + câu ví dụ (thẻ chỉ hiện sau khi trả lời nên không lộ đáp án)
el.spotSpeak.addEventListener("click", () => {
  const term = el.spotTerm.textContent || "";
  const ex = el.spotEx.textContent || "";
  speak(term && ex ? `${term}. ${ex}` : (lastSpeakLine || term));
});
el.addBtn.addEventListener("click", addUnknownTerm);
el.addInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addUnknownTerm();
  e.stopPropagation(); // đừng để phím 1-4/R trong ô nhập kích hoạt game
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { api.close(); return; }
  if (e.key === "r" || e.key === "R") { speak(lastSpeakLine); return; }
  if (/^[1-4]$/.test(e.key) && !locked) {
    const idx = Number(e.key) - 1;
    const btn = el.choices.querySelectorAll(".choice")[idx];
    if (btn) btn.click();
  }
});

el.suggSpeak.addEventListener("click", () => { if (suggPhrase) speak(suggPhrase); });
el.suggNext.addEventListener("click", loadSuggestion);

// ── Kéo thả cửa sổ: fallback JS khi -webkit-app-region không hoạt động ──
// (nếu native drag ăn thì mousedown không bao giờ tới đây — hai cơ chế không đụng nhau)
let dragMove = false, dragLX = 0, dragLY = 0;
document.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (e.target.closest("button, input, select, label, .choice, .wchoice, .speak, .btn, .x")) return;
  dragMove = true; dragLX = e.screenX; dragLY = e.screenY;
});
window.addEventListener("mousemove", (e) => {
  if (!dragMove) return;
  const dx = e.screenX - dragLX, dy = e.screenY - dragLY;
  if (dx || dy) { api.moveBy(dx, dy); dragLX = e.screenX; dragLY = e.screenY; }
});
window.addEventListener("mouseup", () => { dragMove = false; });
window.addEventListener("blur", () => { dragMove = false; });

if (api && typeof api.onRefresh === "function") api.onRefresh(() => { loadNext(); loadWordRound(); loadSuggestion(); });

(async () => {
  await loadConfig();
  await loadNext();
  await loadWordRound();
  await loadSuggestion();
})();
