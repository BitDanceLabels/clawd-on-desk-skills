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
  closeBtn: document.getElementById("closeBtn"),
  snoozeBtn: document.getElementById("snoozeBtn"),
  skipBtn: document.getElementById("skipBtn"),
};

let current = null;   // { round, word, player, dueCount }
let locked = false;   // true after an answer, until next round loads

function setConfigFromUI() {
  api.setConfig({ reverse: el.reverse.checked, auto: el.auto.checked });
}

async function loadConfig() {
  try {
    const cfg = await api.getConfig();
    if (cfg && cfg.ok) {
      el.reverse.checked = !!cfg.reverse;
      el.auto.checked = !!cfg.auto;
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

  try {
    await api.answer({ id: current.word.id, correct, mode: round.mode });
  } catch {}

  // Auto-advance
  setTimeout(loadNext, correct ? 900 : 1700);
}

async function loadNext() {
  locked = false;
  try {
    const data = await api.next({ reverse: el.reverse.checked });
    if (!data || !data.ok || !data.round) { renderEmpty(); return; }
    renderRound(data);
  } catch {
    renderEmpty();
  }
}

// ── Events ──
el.closeBtn.addEventListener("click", () => api.close());
el.skipBtn.addEventListener("click", () => { if (!locked) loadNext(); });
el.snoozeBtn.addEventListener("click", () => api.snooze(30));
el.reverse.addEventListener("change", () => { setConfigFromUI(); loadNext(); });
el.auto.addEventListener("change", setConfigFromUI);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { api.close(); return; }
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
