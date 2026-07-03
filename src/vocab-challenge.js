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
  speakBtn: document.getElementById("speakBtn"),
  addInput: document.getElementById("addInput"),
  addBtn: document.getElementById("addBtn"),
  addMsg: document.getElementById("addMsg"),
};

let current = null;   // { round, word, player, dueCount }
let locked = false;   // true after an answer, until next round loads
let lastSpeakLine = ""; // câu tiếng Anh gần nhất để nghe lại

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
  el.game.classList.add("hidden");
  el.empty.classList.remove("hidden");
  el.meta.textContent = "";
  el.badge.textContent = "Bumbee";
}

function renderRound(data) {
  current = data;
  locked = false;
  lastSpeakLine = "";
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

  try {
    await api.answer({ id: current.word.id, correct, mode: round.mode });
  } catch {}

  // Auto-advance (chậm hơn chút để nghe kịp câu đọc)
  setTimeout(loadNext, correct ? 2200 : 3000);
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
    if (res && res.ok) {
      el.addMsg.className = "addmsg ok";
      el.addMsg.textContent = res.existed
        ? `✓ "${term}" đã có trong kho — sẽ ôn lại sớm.`
        : `✓ Đã thêm "${term}" (kho: ${res.total} từ). Sẽ xuất hiện trong game ngay!`;
      el.addInput.value = "";
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
// Chỉ đọc lại câu đã công bố sau khi trả lời — bấm trước lúc đó sẽ không đọc (tránh lộ đáp án)
el.speakBtn.addEventListener("click", () => speak(lastSpeakLine));
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

if (api && typeof api.onRefresh === "function") api.onRefresh(loadNext);

(async () => {
  await loadConfig();
  await loadNext();
})();
