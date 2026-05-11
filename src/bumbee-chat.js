const messagesEl = document.getElementById("messages");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const modeSelect = document.getElementById("modeSelect");
const statusLine = document.getElementById("statusLine");
const loginPanel = document.getElementById("loginPanel");
const emailInput = document.getElementById("emailInput");
const codeInput = document.getElementById("codeInput");
const requestCodeBtn = document.getElementById("requestCodeBtn");
const verifyCodeBtn = document.getElementById("verifyCodeBtn");
const loginStatus = document.getElementById("loginStatus");
const emailHint = document.getElementById("emailHint");
const chatTabBtn = document.getElementById("chatTabBtn");
const learnTabBtn = document.getElementById("learnTabBtn");
const settingsTabBtn = document.getElementById("settingsTabBtn");
const chatView = document.getElementById("chatView");
const learnView = document.getElementById("learnView");
const settingsView = document.getElementById("settingsView");
const dropZone = document.getElementById("dropZone");
const vocabInput = document.getElementById("vocabInput");
const addVocabBtn = document.getElementById("addVocabBtn");
const challengeBtn = document.getElementById("challengeBtn");
const resetScoresBtn = document.getElementById("resetScoresBtn");
const challengeCard = document.getElementById("challengeCard");
const vocabList = document.getElementById("vocabList");
const vocabStats = document.getElementById("vocabStats");
const gameStats = document.getElementById("gameStats");
const missionTitle = document.getElementById("missionTitle");
const levelMeterFill = document.getElementById("levelMeterFill");
const coachSpeech = document.getElementById("coachSpeech");
const modeButtons = document.getElementById("modeButtons");
const goalInput = document.getElementById("goalInput");
const difficultyInput = document.getElementById("difficultyInput");
const targetLanguageInput = document.getElementById("targetLanguageInput");
const nativeLanguageInput = document.getElementById("nativeLanguageInput");
const dailyWordsInput = document.getElementById("dailyWordsInput");
const monthlyResetInput = document.getElementById("monthlyResetInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const presetButtons = Array.from(document.querySelectorAll("[data-preset]"));

let vocabState = { settings: {}, words: [] };
let activeTab = "learn";
let currentChallengeId = null;
let challengeHistory = [];
let currentFocusSource = null;
let selectedGameMode = "meaning";
let activeRound = null;
let roundAnswered = false;
let roundReviewed = false;
let localCombo = 0;

const GameCore = window.EnglishGameCore;

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PRESET_TEXT = {
  ielts: "IELTS: evaluate evidence, coherent argument, significant factor, limited perspective, practical implication, long-term consequence, controversial issue, balanced conclusion",
  work: "Work conversation: follow up, align expectations, clarify scope, make progress, handle feedback, client requirement, deadline pressure, action item",
  social: "Social conversation: catch up, small talk, hang out, first impression, awkward silence, sense of humor, personal boundary, keep in touch",
  funny: "Funny random: plot twist, brain freeze, accidentally professional, chaotic meeting, coffee-powered, awkward but honest, tiny victory, suspiciously productive",
};

const KNOWN_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.vn",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "protonmail.com",
  "proton.me",
  "fpt.com.vn",
  "fpt.edu.vn",
];

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function validateEmailLocal(rawEmail) {
  const email = (rawEmail || "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "empty", message: "Vui lòng nhập email." };
  // Format chặt hơn regex backend: TLD phải có ít nhất 2 chữ cái, không có space, đúng 1 @
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) {
    return {
      ok: false,
      reason: "format",
      message: "Email chưa đúng định dạng. Ví dụ: ten@gmail.com",
    };
  }
  const at = email.indexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (KNOWN_EMAIL_DOMAINS.includes(domain)) return { ok: true, normalized: email };
  // Suggest fix nếu domain gần giống 1 known domain (Levenshtein ≤ 2)
  let bestSuggestion = null;
  let bestDistance = Infinity;
  for (const known of KNOWN_EMAIL_DOMAINS) {
    const dist = levenshtein(domain, known);
    if (dist > 0 && dist <= 2 && dist < bestDistance) {
      bestDistance = dist;
      bestSuggestion = `${local}@${known}`;
    }
  }
  if (bestSuggestion) {
    return {
      ok: false,
      reason: "typo",
      suggestion: bestSuggestion,
      message: `Có phải bạn định gõ ${bestSuggestion}?`,
    };
  }
  // Domain lạ (nhưng format chuẩn) — cho qua, để backend quyết định
  return { ok: true, normalized: email };
}

function explainAuthError(rawMessage) {
  const m = String(rawMessage || "");
  const lower = m.toLowerCase();
  if (/\b403\b|forbidden/i.test(m)) {
    return "Email chưa được cấp quyền vào Bumbee Gateway. Liên hệ admin để được thêm vào whitelist, hoặc kiểm tra lại email gõ có sai chính tả không.";
  }
  if (/\b401\b|unauthorized/i.test(m)) {
    return "Mã xác thực sai hoặc đã hết hạn. Bấm Get code để gửi mã mới.";
  }
  if (/\b429\b|too many/i.test(m)) {
    return "Bạn yêu cầu mã quá nhiều lần. Đợi vài phút rồi thử lại.";
  }
  if (lower.includes("timeout") || lower.includes("etimedout")) {
    return "Gateway phản hồi quá chậm. Kiểm tra mạng và thử lại.";
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("network")) {
    return "Không kết nối được Bumbee Gateway. Kiểm tra mạng rồi thử lại.";
  }
  return m || "Có lỗi không xác định.";
}

function setLoginStatus(text, kind) {
  loginStatus.textContent = text || "";
  if (kind) loginStatus.dataset.kind = kind;
  else delete loginStatus.dataset.kind;
}

function clearEmailHint() {
  while (emailHint.firstChild) emailHint.removeChild(emailHint.firstChild);
  emailHint.hidden = true;
}

function applyEmailSuggestion(suggestion) {
  emailInput.value = suggestion;
  clearEmailHint();
  emailInput.focus();
  emailInput.setSelectionRange(suggestion.length, suggestion.length);
}

function renderEmailHint() {
  const value = emailInput.value.trim();
  if (!value) {
    clearEmailHint();
    return;
  }
  const result = validateEmailLocal(value);
  if (result.ok) {
    clearEmailHint();
    return;
  }
  clearEmailHint();
  if (result.reason === "typo" && result.suggestion) {
    const prefix = document.createElement("span");
    prefix.textContent = "Có phải bạn định gõ";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "email-suggest-btn";
    btn.textContent = result.suggestion;
    btn.addEventListener("click", () => applyEmailSuggestion(result.suggestion));
    const tail = document.createElement("span");
    tail.textContent = "không?";
    emailHint.append(prefix, btn, tail);
  } else {
    emailHint.textContent = result.message;
  }
  emailHint.hidden = false;
}
const cameraBtn = document.getElementById("cameraBtn");
const voiceBtn = document.getElementById("voiceBtn");
const liveBtn = document.getElementById("liveBtn");
const visionBtn = document.getElementById("visionBtn");
const wikiSyncBtn = document.getElementById("wikiSyncBtn");
const refreshDevicesBtn = document.getElementById("refreshDevicesBtn");
const speakBtn = document.getElementById("speakBtn");
const cameraPanel = document.getElementById("cameraPanel");
const cameraPreview = document.getElementById("cameraPreview");
const cameraCanvas = document.getElementById("cameraCanvas");
const captureBtn = document.getElementById("captureBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const cameraDeviceSelect = document.getElementById("cameraDeviceSelect");
const micDeviceSelect = document.getElementById("micDeviceSelect");
const VISION_AUDIO_WS_URL = "wss://vision.bumbee.asia/ws/audio-stream";
const VISION_AUDIO_SAMPLE_RATE = 16000;

let cameraStream = null;
let cameraStarting = false;
let capturedFrame = null;
let micStream = null;
let mediaRecorder = null;
let audioChunks = [];
let capturedAudio = null;
let micAudioContext = null;
let micSourceNode = null;
let micProcessorNode = null;
let micSilentGain = null;
let micSpeechBuffers = [];
let liveStream = null;
let liveRecorder = null;
let liveChunks = [];
let liveAudioContext = null;
let liveSourceNode = null;
let liveProcessorNode = null;
let liveSilentGain = null;
let liveAnalyser = null;
let liveMonitorFrame = null;
let liveActive = false;
let liveSpeaking = false;
let liveSpeechStartedAt = 0;
let liveLastVoiceAt = 0;
let liveSpeechBuffers = [];
let liveVisionWs = null;
let liveVisionChunkId = 0;
let liveVisionTranscriptWaiter = null;
let liveVisionSourceId = `bumbee-live-${Date.now().toString(36)}`;
let speakingEnabled = true;
let voiceWanted = false;
let pendingRequest = false;
let chatRequestId = 0;
let cameraOpenId = 0;
let liveSessionId = 0;

function setActiveTab(tab) {
  activeTab = tab;
  for (const [name, btn, view] of [
    ["chat", chatTabBtn, chatView],
    ["learn", learnTabBtn, learnView],
    ["settings", settingsTabBtn, settingsView],
  ]) {
    btn.classList.toggle("active", name === tab);
    view.classList.toggle("active", name === tab);
  }
  const chatMode = tab === "chat";
  document.querySelector(".composer").hidden = !chatMode;
  if (tab === "learn") loadVocab();
  if (tab === "settings") renderSettings();
}

function pushActivityState() {
  window.bumbeeChat.activity({
    typing: document.activeElement === promptInput && promptInput.value.trim().length > 0,
    camera: cameraStarting || !!cameraStream,
    voice: voiceWanted || !!micStream || liveActive,
    pending: pendingRequest,
  });
}

function addMessage(role, text) {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  item.textContent = text;
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return item;
}

function escapeText(text) {
  return String(text || "");
}

function renderSettings() {
  const settings = vocabState.settings || {};
  goalInput.value = settings.goal || "business conversation";
  difficultyInput.value = settings.difficulty || "medium";
  targetLanguageInput.value = settings.targetLanguage || "en";
  nativeLanguageInput.value = settings.nativeLanguage || "vi";
  dailyWordsInput.value = settings.dailyWords || 8;
  monthlyResetInput.checked = settings.monthlyReset !== false;
}

function notifyCoach(type, message) {
  if (message) coachSpeech.textContent = message;
  coachSpeech.dataset.tone = type || "prompt";
  try {
    window.bumbeeChat.coachEvent({ type, message });
  } catch {}
}

function renderModeButtons() {
  modeButtons.replaceChildren();
  for (const mode of GameCore.GAME_MODES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-button";
    button.classList.toggle("active", mode.id === selectedGameMode);
    button.textContent = mode.label;
    button.addEventListener("click", () => {
      selectedGameMode = mode.id;
      renderModeButtons();
      notifyCoach("prompt", mode.coach);
      showChallenge(pickChallengeWord({ allowCurrent: true, source: currentFocusSource }));
    });
    modeButtons.appendChild(button);
  }
}

function renderVocab() {
  const words = vocabState.words || [];
  const due = words.filter((word) => !word.mastered).length;
  const player = GameCore.getPlayerLevel(words);
  const streak = words.reduce((max, word) => Math.max(max, word.streak || 0), 0);
  vocabStats.textContent = `${words.length} words · ${due} active`;
  missionTitle.textContent = `${player.title}: win 5 conversation rounds`;
  gameStats.textContent = `Lv ${player.level} · ${player.xp} XP · ${streak} streak · ${due} active`;
  levelMeterFill.style.width = `${player.progress}%`;
  vocabList.replaceChildren();
  if (!words.length) {
    const empty = document.createElement("div");
    empty.className = "message system";
    empty.textContent = "No words yet. Add any word, note, file or image to start.";
    vocabList.appendChild(empty);
    return;
  }
  for (const word of words.slice(0, 80)) {
    const card = document.createElement("article");
    card.className = "vocab-card";
    const header = document.createElement("header");
    const title = document.createElement("h3");
    title.textContent = word.term;
    const score = document.createElement("span");
    score.className = "score-pill";
    score.textContent = `${word.category || "General"} · ${word.level || vocabState.settings?.difficulty || "medium"} · ${word.score || 0}/100`;
    header.append(title, score);

    const meaning = document.createElement("p");
    meaning.textContent = word.lesson?.meaning_en || word.lesson?.meaning || "No lesson yet.";
    const examples = document.createElement("ul");
    examples.className = "examples";
    for (const ex of (word.lesson?.examples || []).slice(0, 3)) {
      const li = document.createElement("li");
      li.textContent = ex;
      examples.appendChild(li);
    }
    const actions = document.createElement("div");
    actions.className = "review-actions";
    const good = document.createElement("button");
    good.type = "button";
    good.className = "good";
    good.textContent = "I remembered";
    good.addEventListener("click", () => markReview(word.id, true));
    const bad = document.createElement("button");
    bad.type = "button";
    bad.className = "bad";
    bad.textContent = "Review again";
    bad.addEventListener("click", () => markReview(word.id, false));
    actions.append(good, bad);
    card.append(header, meaning, examples, actions);
    vocabList.appendChild(card);
  }
}

async function loadVocab() {
  try {
    const result = await window.bumbeeChat.vocabList();
    if (result.ok) {
      vocabState = { settings: result.settings || {}, words: result.words || [] };
      renderVocab();
      if (!vocabState.words.length) return;
      if (challengeCard.hidden || !challengeCard.textContent) showChallenge();
    }
  } catch (err) {
    vocabStats.textContent = `Vocab error: ${err.message}`;
  }
}

async function addVocabFromText(text, source) {
  const clean = String(text || "").trim();
  if (!clean) return;
  currentFocusSource = source || null;
  currentChallengeId = null;
  challengeHistory = [];
  addVocabBtn.disabled = true;
  addVocabBtn.textContent = "Adding...";
  try {
    const result = await window.bumbeeChat.vocabAdd({ text: clean, source });
    if (!result.ok) throw new Error(result.error || "Could not add words.");
    vocabState = { settings: result.db?.settings || vocabState.settings, words: result.db?.words || vocabState.words };
    vocabInput.value = "";
    renderVocab();
    showChallenge(result.created?.[0] || result.items?.[0] || pickChallengeWord({ allowCurrent: false, source: currentFocusSource }));
  } catch (err) {
    challengeCard.hidden = false;
    challengeCard.textContent = `Add failed: ${err.message}`;
  } finally {
    addVocabBtn.disabled = false;
    addVocabBtn.textContent = "Add & AI plan";
  }
}

function getWordDifficulty(word) {
  const value = word?.level || vocabState.settings?.difficulty || "medium";
  return DIFFICULTY_META[value] ? value : "medium";
}

function getReviewTime(word) {
  const time = Date.parse(word?.next_review || "");
  return Number.isFinite(time) ? time : 0;
}

function getChallengeRank(word, now = Date.now()) {
  const due = getReviewTime(word) <= now ? 0 : 1;
  const historyPenalty = challengeHistory.includes(word.id) ? 1 : 0;
  return [
    due,
    historyPenalty,
    word.review_count || 0,
    -(word.mistake_count || 0),
    word.score || 0,
    getReviewTime(word),
    String(word.term || ""),
  ];
}

function compareRank(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function pickChallengeWord(options = {}) {
  const source = options.source || currentFocusSource;
  let words = (vocabState.words || []).filter((word) => !word.mastered);
  if (source) {
    const sourceWords = words.filter((word) => Array.isArray(word.sources) && word.sources.includes(source));
    if (sourceWords.length) words = sourceWords;
  }
  if (!words.length) return null;
  const allowCurrent = options.allowCurrent !== false;
  const now = Date.now();
  const sorted = words.slice().sort((a, b) => {
    return compareRank(getChallengeRank(a, now), getChallengeRank(b, now));
  });
  if (!allowCurrent && currentChallengeId && sorted.length > 1) {
    return sorted.find((word) => word.id !== currentChallengeId) || sorted[0];
  }
  return sorted[0];
}

function getMeaning(word) {
  return word?.lesson?.meaning_en || word?.lesson?.meaning || "Use this naturally in a real conversation.";
}

function buildChoiceSet(word) {
  const correct = getMeaning(word);
  const seen = new Set([correct.trim().toLowerCase()]);
  const otherMeanings = (vocabState.words || [])
    .filter((item) => item.id !== word.id)
    .map((item) => {
      const meaning = getMeaning(item);
      return meaning === getMeaning({}) ? `${item.term}: ${meaning}` : meaning;
    })
    .filter((meaning) => {
      const key = String(meaning || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const difficulty = getWordDifficulty(word);
  const choiceCount = DIFFICULTY_META[difficulty].choiceCount || 4;
  const choices = [correct, ...otherMeanings.slice(0, choiceCount - 1)];
  const fallbackChoices = [
    `A phrase about planning or following up, not "${word.term}".`,
    `A general communication idea that is different from "${word.term}".`,
    `A workplace expression with a different meaning from "${word.term}".`,
    `A casual phrase that does not match "${word.term}".`,
  ];
  for (const fallback of fallbackChoices) {
    if (choices.length >= choiceCount) break;
    const key = fallback.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      choices.push(fallback);
    }
  }
  return choices
    .slice(0, choiceCount)
    .map((text) => ({ text, correct: text === correct }))
    .sort(() => Math.random() - 0.5);
}

function rememberChallenge(id) {
  if (!id) return;
  challengeHistory = [id, ...challengeHistory.filter((item) => item !== id)].slice(0, 6);
}

function showChallenge(word = pickChallengeWord()) {
  if (!word) {
    challengeCard.hidden = false;
    challengeCard.textContent = "Add words first, then Bumbee will challenge you.";
    coachSpeech.textContent = "Drop a note or choose a preset. I will turn it into a mini game.";
    return;
  }
  currentChallengeId = word.id;
  rememberChallenge(word.id);
  roundAnswered = false;
  roundReviewed = false;
  activeRound = GameCore.buildGameRound(word, vocabState.words || [], {
    mode: selectedGameMode,
    index: challengeHistory.length + (word.review_count || 0),
  });
  const examples = GameCore.getExamples(word);
  challengeCard.replaceChildren();
  challengeCard.hidden = false;
  const meta = document.createElement("div");
  meta.className = "game-meta";
  const level = document.createElement("span");
  level.textContent = activeRound.mode.toUpperCase();
  const score = document.createElement("span");
  score.textContent = `${word.score || 0}/100 XP`;
  const streak = document.createElement("span");
  streak.textContent = `${word.streak || 0} streak`;
  const combo = document.createElement("span");
  combo.textContent = `${localCombo} combo`;
  meta.append(level, score, streak, combo);

  const title = document.createElement("h3");
  title.textContent = activeRound.title;
  const prompt = document.createElement("p");
  prompt.className = "game-prompt";
  prompt.textContent = activeRound.prompt;
  const scene = document.createElement("div");
  scene.className = "scene-card";
  const sceneLabel = document.createElement("span");
  sceneLabel.textContent = activeRound.scene;
  const cue = document.createElement("strong");
  cue.textContent = activeRound.cue;
  scene.append(sceneLabel, cue);
  coachSpeech.textContent = activeRound.coach;
  coachSpeech.dataset.tone = "prompt";

  const choicesEl = document.createElement("div");
  choicesEl.className = "choice-grid";
  const feedback = document.createElement("div");
  feedback.className = "game-feedback";
  feedback.hidden = true;

  for (const choice of activeRound.choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice;
    button.addEventListener("click", () => answerRound(word, choice, choicesEl, feedback));
    choicesEl.appendChild(button);
  }

  const examplesEl = document.createElement("ul");
  examplesEl.className = "examples game-examples";
  for (const ex of examples.slice(0, 2)) {
    const li = document.createElement("li");
    li.textContent = ex;
    examplesEl.appendChild(li);
  }

  const actions = document.createElement("div");
  actions.className = "review-actions";
  const speakLine = document.createElement("button");
  speakLine.type = "button";
  speakLine.textContent = "Speak line";
  speakLine.addEventListener("click", () => speakEnglish(activeRound.speakLine || examples[0] || word.term));
  const good = document.createElement("button");
  good.type = "button";
  good.className = "good";
  good.textContent = "I said it";
  good.addEventListener("click", () => {
    notifyCoach("correct", `Nice. Say it again later: ${activeRound.speakLine || word.term}`);
    if (roundReviewed) {
      showChallenge(pickChallengeWord({ allowCurrent: false, source: currentFocusSource }));
      return;
    }
    roundReviewed = true;
    markReview(word.id, true);
  });
  const bad = document.createElement("button");
  bad.type = "button";
  bad.className = "bad";
  bad.textContent = "Train again";
  bad.addEventListener("click", () => {
    notifyCoach("wrong");
    if (roundReviewed) {
      showChallenge(word);
      return;
    }
    roundReviewed = true;
    markReview(word.id, false);
  });
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next";
  next.addEventListener("click", () => {
    notifyCoach("next");
    showChallenge(pickChallengeWord({ allowCurrent: false, source: currentFocusSource }));
  });
  actions.append(speakLine, good, bad, next);
  challengeCard.append(meta, title, prompt, scene, choicesEl, feedback, examplesEl, actions);
}

async function answerRound(word, choice, choicesEl, feedback) {
  if (!activeRound || roundAnswered) return;
  roundAnswered = true;
  const correct = GameCore.normalizeAnswer(choice) === GameCore.normalizeAnswer(activeRound.answer);
  for (const item of choicesEl.querySelectorAll("button")) {
    item.disabled = true;
    if (GameCore.normalizeAnswer(item.textContent) === GameCore.normalizeAnswer(activeRound.answer)) {
      item.classList.add("correct");
    }
  }
  const selected = Array.from(choicesEl.querySelectorAll("button"))
    .find((item) => item.textContent === choice);
  if (selected) selected.classList.add(correct ? "correct" : "wrong");
  localCombo = correct ? localCombo + 1 : 0;
  feedback.hidden = false;
  feedback.textContent = correct
    ? `Correct. Combo ${localCombo}. Say it: ${activeRound.speakLine || choice}`
    : `Not this one. Best line: ${activeRound.answer}`;
  notifyCoach(correct ? "correct" : "wrong", correct
    ? `Good hit. Now speak it out loud: ${activeRound.speakLine || choice}`
    : `Close. The natural line is: ${activeRound.answer}`);
  if (!roundReviewed) {
    roundReviewed = true;
    await markReview(word.id, correct, { stayOnCard: true });
  }
}

async function markReview(id, correct, options = {}) {
  const result = await window.bumbeeChat.vocabReview({ id, correct });
  if (result.ok) {
    vocabState = { settings: result.settings || vocabState.settings, words: result.words || [] };
    renderVocab();
    if (!options.stayOnCard) showChallenge(pickChallengeWord({ allowCurrent: false, source: currentFocusSource }));
  }
}

async function readDroppedFile(file) {
  if (!file) return "";
  if (file.type.startsWith("image/")) {
    return `Image source: ${file.name}. User dropped this image to extract vocabulary or describe visual context.`;
  }
  const maxBytes = 250000;
  const blob = file.slice(0, maxBytes);
  return await blob.text();
}

function setBusy(busy) {
  pendingRequest = !!busy;
  sendBtn.disabled = busy;
  sendBtn.textContent = busy ? "Sending..." : "Send";
  if (liveActive && !liveSpeaking) liveBtn.textContent = busy ? "Live: Thinking" : "Live: On";
  pushActivityState();
}

function speak(text) {
  if (!speakingEnabled || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 900));
  utterance.lang = "vi-VN";
  window.speechSynthesis.speak(utterance);
}

function speakEnglish(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text || "").slice(0, 500));
  utterance.lang = "en-US";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

async function refreshStatus() {
  try {
    const status = await window.bumbeeChat.status();
    const smart = status.smart || {};
    const skills = status.skills || {};
    const wiki = status.wiki || {};
    const chatHost = smart.gatewayUrl ? smart.gatewayUrl.replace(/^https?:\/\//, "") : "gateway not set";
    const authText = smart.authenticated ? "auth ok" : "login required";
    const wikiText = wiki.enabled ? `Wiki ${wiki.project || "project"} @ ${wiki.deviceId || "device"}` : "Wiki off";
    statusLine.textContent = `Smart ${smart.enabled ? "on" : "off"} | ${authText} | ${wikiText} | Chat ${chatHost}${smart.chatEndpoint || ""} | Skills ${skills.count || 0}`;
    loginPanel.hidden = !!smart.authenticated;
    if (!smart.authenticated && !loginStatus.textContent) {
      loginStatus.textContent = `Auth server: ${status.auth?.authServerUrl || "not set"}`;
    }
  } catch (err) {
    statusLine.textContent = `Status error: ${err.message}`;
  }
}

async function requestLoginCode() {
  const validation = validateEmailLocal(emailInput.value);
  if (!validation.ok) {
    setLoginStatus(validation.message, "error");
    renderEmailHint();
    emailInput.focus();
    return;
  }
  const email = validation.normalized;
  emailInput.value = email;
  clearEmailHint();
  requestCodeBtn.disabled = true;
  setLoginStatus("Đang gửi mã...", "info");
  try {
    const result = await window.bumbeeChat.loginRequest({ email });
    if (!result.ok) throw new Error(result.error || "Could not send code.");
    setLoginStatus(
      result.email_sent
        ? "Đã gửi mã. Kiểm tra hộp thư email."
        : "Mã đã tạo. Kiểm tra admin page hoặc server log (SMTP chưa cấu hình).",
      "ok",
    );
    codeInput.focus();
  } catch (err) {
    setLoginStatus(`Gửi mã thất bại: ${explainAuthError(err.message)}`, "error");
  } finally {
    requestCodeBtn.disabled = false;
  }
}

async function verifyLoginCode() {
  const validation = validateEmailLocal(emailInput.value);
  if (!validation.ok) {
    setLoginStatus(validation.message, "error");
    renderEmailHint();
    emailInput.focus();
    return;
  }
  const email = validation.normalized;
  const code = codeInput.value.trim();
  if (!code) {
    setLoginStatus("Vui lòng nhập mã 6 số đã nhận trong email.", "error");
    codeInput.focus();
    return;
  }
  emailInput.value = email;
  verifyCodeBtn.disabled = true;
  setLoginStatus("Đang xác thực...", "info");
  try {
    const result = await window.bumbeeChat.loginVerify({ email, code });
    if (!result.ok) throw new Error(result.error || "Invalid code.");
    setLoginStatus("Đăng nhập thành công. Token đã lưu trên máy này.", "ok");
    addMessage("system", "Bumbee Gateway login OK. You can chat now.");
    await refreshStatus();
  } catch (err) {
    setLoginStatus(`Xác thực thất bại: ${explainAuthError(err.message)}`, "error");
  } finally {
    verifyCodeBtn.disabled = false;
  }
}

async function sendPrompt(displayText) {
  if (pendingRequest) {
    addMessage("system", "Bumbee is still answering the previous turn. Please wait a moment.");
    return;
  }
  let query = promptInput.value.trim();
  if (!query && capturedAudio) query = "Hãy nghe đoạn ghi âm này và trả lời bằng tiếng Việt như trợ lý công việc.";
  if (!query && capturedFrame) query = "Hãy xem ảnh camera này và trả lời bằng tiếng Việt.";
  if (!query) return;
  const requestId = ++chatRequestId;
  promptInput.value = "";
  addMessage("user", displayText || query);
  setBusy(true);

  const context = {
    source: "clawd-on-desk",
    camera: capturedFrame ? {
      captured_at: capturedFrame.capturedAt,
      image_data_url: capturedFrame.dataUrl,
      note: "Snapshot included for multimodal gateways; text-only gateways may ignore it.",
    } : null,
    audio: capturedAudio ? {
      captured_at: capturedAudio.capturedAt,
      mime_type: capturedAudio.mimeType,
      audio_data_url: capturedAudio.dataUrl,
      note: "Microphone recording included for multimodal gateways; text-only gateways may ignore it.",
    } : null,
  };

  try {
    const result = await withTimeout(window.bumbeeChat.send({
      mode: modeSelect.value,
      query,
      context,
    }), 60_000, "Bumbee response timeout");
    if (requestId !== chatRequestId) return;
    const answer = result.answer || result.error || "No response.";
    addMessage(result.ok && !result.error ? "assistant" : "system", answer);
    if (result.ok && !result.error) speak(answer);
    if (result.ok && !result.error) {
      capturedAudio = null;
      capturedFrame = null;
    }
  } catch (err) {
    if (requestId !== chatRequestId) return;
    addMessage("system", `Chat failed: ${err.message}`);
  } finally {
    if (requestId === chatRequestId) setBusy(false);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    addMessage("system", "Camera is not available in this Electron runtime.");
    return;
  }
  const openId = ++cameraOpenId;
  cameraStarting = true;
  cameraBtn.disabled = true;
  cameraBtn.textContent = "Camera: Opening";
  pushActivityState();
  try {
    if (cameraStream) closeCameraStream();
    const videoInputs = await refreshMediaDevices({ silent: true, probe: false });
    if (openId !== cameraOpenId) return;
    const selected = cameraDeviceSelect.value;
    const iphoneCamera = videoInputs.cameras.find((device) => /iphone|continuity/i.test(device.label || ""));
    const deviceId = selected || iphoneCamera?.deviceId || "";
    const video = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };
    cameraStream = await getUserMediaWithTimeout({
      video,
      audio: false,
    }, 7000);
    if (openId !== cameraOpenId) {
      cameraStream.getTracks().forEach((track) => track.stop());
      return;
    }
    for (const track of cameraStream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        addMessage("system", "Camera device ended. Reopen Camera if you still want to use it.");
        stopCamera();
      });
    }
    cameraPreview.pause();
    cameraPreview.removeAttribute("src");
    cameraPreview.srcObject = cameraStream;
    cameraPreview.muted = true;
    cameraPreview.playsInline = true;
    cameraPanel.hidden = false;
    await playCameraPreview();
    if (openId !== cameraOpenId) return;
    const track = cameraStream.getVideoTracks()[0];
    const settings = track?.getSettings?.() || {};
    addMessage("system", `Camera connected: ${track?.label || "camera"}${settings.width && settings.height ? ` (${settings.width}x${settings.height})` : ""}.`);
    setTimeout(() => {
      if (cameraStream && !cameraPreview.videoWidth) {
        addMessage("system", "Camera connected but no video frame is visible yet. Unlock iPhone and keep Continuity Camera active, then press Stop and Camera again.");
      }
    }, 1500);
    cameraBtn.textContent = "Camera: On";
    pushActivityState();
  } catch (err) {
    if (openId !== cameraOpenId) return;
    addMessage("system", `Camera failed: ${err.message}`);
    addMessage("system", "Nếu muốn dùng iPhone, kiểm tra Continuity Camera trong macOS trước: FaceTime/QuickTime phải thấy iPhone Camera thì app mới thấy.");
    stopCamera();
  } finally {
    if (openId === cameraOpenId) {
      cameraStarting = false;
      cameraBtn.disabled = false;
      cameraBtn.textContent = cameraStream ? "Camera: On" : "Camera";
      pushActivityState();
    }
  }
}

async function playCameraPreview() {
  if (cameraPreview.readyState < 1) {
    await new Promise((resolve) => {
      const done = () => {
        cameraPreview.removeEventListener("loadedmetadata", done);
        resolve();
      };
      cameraPreview.addEventListener("loadedmetadata", done, { once: true });
      setTimeout(done, 1200);
    });
  }
  await cameraPreview.play().catch((err) => {
    addMessage("system", `Camera preview play warning: ${err.message}`);
  });
}

function stopCamera() {
  cameraOpenId += 1;
  cameraStarting = false;
  closeCameraStream();
  cameraBtn.disabled = false;
  cameraBtn.textContent = "Camera";
  pushActivityState();
}

function closeCameraStream() {
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
  }
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraPanel.hidden = true;
}

function getUserMediaWithTimeout(constraints, timeoutMs = 8000) {
  let timedOut = false;
  const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);
  mediaPromise.then((stream) => {
    if (timedOut) stream.getTracks().forEach((track) => track.stop());
  }).catch(() => {});
  return Promise.race([
    mediaPromise,
    new Promise((_, reject) => {
      setTimeout(() => {
        timedOut = true;
        reject(new Error("camera/mic open timeout"));
      }, timeoutMs);
    }),
  ]);
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function downsampleBuffer(buffer, inputRate, outputRate) {
  if (!buffer?.length) return new Float32Array();
  if (!inputRate || inputRate === outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const nextLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(nextLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function mergeAudioBuffers(buffers) {
  const total = buffers.reduce((sum, buffer) => sum + (buffer?.length || 0), 0);
  const result = new Float32Array(total);
  let offset = 0;
  for (const buffer of buffers) {
    if (!buffer?.length) continue;
    result.set(buffer, offset);
    offset += buffer.length;
  }
  return result;
}

function encodeWavFromFloat32(samples, sampleRate = VISION_AUDIO_SAMPLE_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

async function blobToBase64(blob) {
  const dataUrl = await blobToDataUrl(blob);
  return String(dataUrl).split(",")[1] || "";
}

function canUseMainVisionAudio() {
  return typeof window.bumbeeChat?.transcribeVisionAudio === "function";
}

async function transcribeVisionAudioInMain(data, sourceId, chunkId) {
  const result = await window.bumbeeChat.transcribeVisionAudio({
    data,
    source_id: sourceId,
    chunk_id: chunkId,
  });
  const text = String(result?.text || "").trim();
  if (text) addMessage("system", `Vision heard: ${text}`);
  return text;
}

function ensureVisionAudioWs() {
  if (liveVisionWs && liveVisionWs.readyState === WebSocket.OPEN) return Promise.resolve(liveVisionWs);
  if (liveVisionWs && liveVisionWs.readyState === WebSocket.CONNECTING) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Vision audio WebSocket timeout")), 6000);
      liveVisionWs.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(liveVisionWs);
      }, { once: true });
      liveVisionWs.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Vision audio WebSocket failed"));
      }, { once: true });
    });
  }
  liveVisionWs = new WebSocket(VISION_AUDIO_WS_URL);
  liveVisionWs.onmessage = (event) => {
    let msg = null;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === "transcript") {
      const text = String(msg.text || "").trim();
      if (text) addMessage("system", `Vision heard: ${text}`);
      if (liveVisionTranscriptWaiter && msg.chunk_id === liveVisionTranscriptWaiter.chunkId) {
        liveVisionTranscriptWaiter.resolve(text);
        liveVisionTranscriptWaiter = null;
      }
    } else if (msg.type === "summary" && msg.summary) {
      addMessage("system", `Vision summary: ${msg.summary}`);
    } else if (msg.type === "error") {
      const error = String(msg.error || "Vision audio error");
      addMessage("system", error);
      if (liveVisionTranscriptWaiter) {
        liveVisionTranscriptWaiter.reject(new Error(error));
        liveVisionTranscriptWaiter = null;
      }
    }
  };
  liveVisionWs.onclose = () => {
    liveVisionWs = null;
  };
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Vision audio WebSocket timeout")), 6000);
    liveVisionWs.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(liveVisionWs);
    }, { once: true });
    liveVisionWs.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Vision audio WebSocket failed"));
    }, { once: true });
  });
}

function closeVisionAudioWs() {
  if (liveVisionTranscriptWaiter) {
    liveVisionTranscriptWaiter.reject(new Error("Live mode stopped"));
    liveVisionTranscriptWaiter = null;
  }
  if (liveVisionWs) {
    try { liveVisionWs.close(); } catch {}
    liveVisionWs = null;
  }
}

async function transcribeLiveBuffersWithVision(buffers, sessionId) {
  const samples = mergeAudioBuffers(buffers);
  if (!samples.length || samples.length < VISION_AUDIO_SAMPLE_RATE * 0.2) return "";
  const ws = await ensureVisionAudioWs();
  if (!liveActive || sessionId !== liveSessionId || ws.readyState !== WebSocket.OPEN) return "";
  const chunkId = `${liveVisionSourceId}-${++liveVisionChunkId}`;
  const wavBlob = encodeWavFromFloat32(samples, VISION_AUDIO_SAMPLE_RATE);
  const data = await blobToBase64(wavBlob);
  if (canUseMainVisionAudio()) {
    return transcribeVisionAudioInMain(data, liveVisionSourceId, chunkId);
  }
  const transcriptPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (liveVisionTranscriptWaiter?.chunkId === chunkId) liveVisionTranscriptWaiter = null;
      reject(new Error("Vision transcript timeout"));
    }, 30_000);
    liveVisionTranscriptWaiter = {
      chunkId,
      resolve: (text) => {
        clearTimeout(timer);
        resolve(text);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    };
  });
  ws.send(JSON.stringify({
    type: "chunk",
    data,
    source_id: liveVisionSourceId,
    chunk_id: chunkId,
  }));
  return String(await transcriptPromise || "").trim();
}

async function sendLiveTranscript(transcript, sessionId) {
  const clean = String(transcript || "").trim();
  if (!clean || !liveActive || sessionId !== liveSessionId) return;
  promptInput.value = `Tôi vừa nói qua mic: "${clean}". Hãy trả lời tự nhiên, ngắn gọn, đúng ngữ cảnh như đang giao tiếp trực tiếp với tôi.`;
  await sendPrompt(`🎙️ ${clean}`);
}

async function transcribeBuffersWithVision(buffers, sourceIdPrefix = "bumbee-mic") {
  const samples = mergeAudioBuffers(buffers);
  if (!samples.length || samples.length < VISION_AUDIO_SAMPLE_RATE * 0.2) return "";
  const ws = await ensureVisionAudioWs();
  if (ws.readyState !== WebSocket.OPEN) return "";
  const chunkId = `${sourceIdPrefix}-${Date.now().toString(36)}-${++liveVisionChunkId}`;
  const wavBlob = encodeWavFromFloat32(samples, VISION_AUDIO_SAMPLE_RATE);
  const data = await blobToBase64(wavBlob);
  if (canUseMainVisionAudio()) {
    return transcribeVisionAudioInMain(data, sourceIdPrefix, chunkId);
  }
  const transcriptPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (liveVisionTranscriptWaiter?.chunkId === chunkId) liveVisionTranscriptWaiter = null;
      reject(new Error("Vision transcript timeout"));
    }, 30_000);
    liveVisionTranscriptWaiter = {
      chunkId,
      resolve: (text) => {
        clearTimeout(timer);
        resolve(text);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    };
  });
  ws.send(JSON.stringify({
    type: "chunk",
    data,
    source_id: sourceIdPrefix,
    chunk_id: chunkId,
  }));
  return String(await transcriptPromise || "").trim();
}

function captureFrame() {
  if (!cameraStream || !cameraPreview.videoWidth) {
    addMessage("system", "Camera is not ready yet.");
    return;
  }
  cameraCanvas.width = cameraPreview.videoWidth;
  cameraCanvas.height = cameraPreview.videoHeight;
  const ctx = cameraCanvas.getContext("2d");
  ctx.drawImage(cameraPreview, 0, 0, cameraCanvas.width, cameraCanvas.height);
  capturedFrame = {
    capturedAt: new Date().toISOString(),
    dataUrl: cameraCanvas.toDataURL("image/jpeg", 0.68),
  };
  addMessage("system", "Camera snapshot attached to the next message.");
}

async function refreshMediaDevices(options = {}) {
  if (!navigator.mediaDevices?.enumerateDevices) return { cameras: [], mics: [] };
  if (options.probe) await probeMediaPermissions(options);
  const previousCamera = cameraDeviceSelect.value;
  const previousMic = micDeviceSelect.value;
  const devices = await withTimeout(navigator.mediaDevices.enumerateDevices(), 3000, "device list timeout").catch((err) => {
    if (!options.silent) addMessage("system", `Device refresh failed: ${err.message}`);
    return [];
  });
  const cameras = devices.filter((device) => device.kind === "videoinput");
  const mics = devices.filter((device) => device.kind === "audioinput");

  cameraDeviceSelect.replaceChildren(new Option("Default camera", ""));
  cameras.forEach((device, index) => {
    cameraDeviceSelect.append(new Option(device.label || `Camera ${index + 1}`, device.deviceId));
  });
  if (previousCamera && cameras.some((device) => device.deviceId === previousCamera)) {
    cameraDeviceSelect.value = previousCamera;
  }

  micDeviceSelect.replaceChildren(new Option("Default mic", ""));
  mics.forEach((device, index) => {
    micDeviceSelect.append(new Option(device.label || `Microphone ${index + 1}`, device.deviceId));
  });
  if (previousMic && mics.some((device) => device.deviceId === previousMic)) {
    micDeviceSelect.value = previousMic;
  }

  if (!options.silent) {
    addMessage("system", cameras.length ? `Cameras: ${cameras.map((d, i) => d.label || `Camera ${i + 1}`).join(", ")}` : "No cameras found.");
    addMessage("system", mics.length ? `Microphones: ${mics.map((d, i) => d.label || `Mic ${i + 1}`).join(", ")}` : "No microphones found.");
  }
  return { cameras, mics };
}

async function probeMediaPermissions(options = {}) {
  if (!navigator.mediaDevices?.getUserMedia) return;
  const probes = [];
  if (!cameraStream) probes.push(["camera", { audio: false, video: true }]);
  if (!micStream && !liveStream) probes.push(["microphone", { audio: true, video: false }]);
  for (const [label, constraints] of probes) {
    try {
      const stream = await getUserMediaWithTimeout(constraints, 3500);
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      if (!options.silent) {
        const hint = label === "camera" && /notfound|requested device|not found/i.test(`${err.name} ${err.message}`)
          ? " Open FaceTime/QuickTime once to wake Continuity Camera, then press Refresh again."
          : "";
        addMessage("system", `${label} probe: ${err.name || "Error"}: ${err.message}.${hint}`);
      }
    }
  }
}

async function startVoice() {
  if (!navigator.mediaDevices?.getUserMedia) {
    addMessage("system", "Microphone is not available in this Electron runtime.");
    return;
  }
  voiceWanted = true;
  voiceBtn.disabled = true;
  voiceBtn.textContent = "Mic: Opening";
  pushActivityState();
  try {
    await refreshMediaDevices({ silent: true });
    const selected = micDeviceSelect.value;
    micStream = await getUserMediaWithTimeout({
      audio: selected ? { deviceId: { exact: selected }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
      video: false,
    }, 6000);
    const track = micStream.getAudioTracks()[0];
    addMessage("system", `Mic connected: ${track?.label || "microphone"}. Press Mic again to stop and send.`);
    audioChunks = [];
    micSpeechBuffers = [];
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    micAudioContext = new AudioCtx();
    await micAudioContext.resume();
    micSourceNode = micAudioContext.createMediaStreamSource(micStream);
    micProcessorNode = micAudioContext.createScriptProcessor(4096, 1, 1);
    micSilentGain = micAudioContext.createGain();
    micSilentGain.gain.value = 0;
    micProcessorNode.onaudioprocess = (event) => {
      if (!voiceWanted) return;
      const raw = event.inputBuffer.getChannelData(0);
      const copied = new Float32Array(raw.length);
      copied.set(raw);
      const downsampled = downsampleBuffer(copied, micAudioContext.sampleRate, VISION_AUDIO_SAMPLE_RATE);
      if (downsampled.length) micSpeechBuffers.push(downsampled);
    };
    micSourceNode.connect(micProcessorNode);
    micProcessorNode.connect(micSilentGain);
    micSilentGain.connect(micAudioContext.destination);
    if (!canUseMainVisionAudio()) await ensureVisionAudioWs();
    voiceBtn.textContent = "Mic: Recording";
  } catch (err) {
    addMessage("system", `Mic failed: ${err.message}`);
    stopVoice({ send: false });
  } finally {
    voiceBtn.disabled = false;
    pushActivityState();
  }
}

function stopVoice(options = {}) {
  const shouldSend = options.send !== false;
  const buffers = micSpeechBuffers.slice();
  micSpeechBuffers = [];
  voiceWanted = false;
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try { mediaRecorder.stop(); } catch {}
  }
  mediaRecorder = null;
  if (micProcessorNode) {
    try { micProcessorNode.disconnect(); } catch {}
  }
  micProcessorNode = null;
  if (micSourceNode) {
    try { micSourceNode.disconnect(); } catch {}
  }
  micSourceNode = null;
  if (micSilentGain) {
    try { micSilentGain.disconnect(); } catch {}
  }
  micSilentGain = null;
  if (micAudioContext) {
    try { micAudioContext.close(); } catch {}
  }
  micAudioContext = null;
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop();
  }
  micStream = null;
  voiceBtn.disabled = false;
  voiceBtn.textContent = shouldSend ? "Mic: Thinking" : "Mic";
  pushActivityState();
  if (!shouldSend) return;
  (async () => {
    try {
      const transcript = await transcribeBuffersWithVision(buffers, "bumbee-mic");
      if (!transcript) {
        addMessage("system", "Vision did not hear a clear sentence.");
        return;
      }
      promptInput.value = `Tôi vừa nói qua mic: "${transcript}". Hãy trả lời tự nhiên, ngắn gọn, đúng ngữ cảnh như đang giao tiếp trực tiếp với tôi.`;
      await sendPrompt(`🎙️ ${transcript}`);
    } catch (err) {
      addMessage("system", `Vision mic failed: ${err.message}`);
    } finally {
      if (!liveActive) closeVisionAudioWs();
      if (!voiceWanted && !micStream) voiceBtn.textContent = "Mic";
      pushActivityState();
    }
  })();
}

async function startLiveMode() {
  if (liveActive) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    addMessage("system", "Live mode needs microphone access.");
    return;
  }
  const sessionId = ++liveSessionId;
  liveBtn.disabled = true;
  liveBtn.textContent = "Live: Opening";
  try {
    await refreshMediaDevices({ silent: true });
    if (sessionId !== liveSessionId) return;
    const selected = micDeviceSelect.value;
    const stream = await getUserMediaWithTimeout({
      audio: selected ? { deviceId: { exact: selected }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
      video: false,
    }, 6000);
    if (sessionId !== liveSessionId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    liveStream = stream;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    liveAudioContext = new AudioCtx();
    await liveAudioContext.resume();
    liveSourceNode = liveAudioContext.createMediaStreamSource(liveStream);
    liveAnalyser = liveAudioContext.createAnalyser();
    liveAnalyser.fftSize = 1024;
    liveSourceNode.connect(liveAnalyser);
    liveProcessorNode = liveAudioContext.createScriptProcessor(4096, 1, 1);
    liveSilentGain = liveAudioContext.createGain();
    liveSilentGain.gain.value = 0;
    liveProcessorNode.onaudioprocess = (event) => {
      if (!liveActive || !liveSpeaking) return;
      const raw = event.inputBuffer.getChannelData(0);
      const copied = new Float32Array(raw.length);
      copied.set(raw);
      const downsampled = downsampleBuffer(copied, liveAudioContext.sampleRate, VISION_AUDIO_SAMPLE_RATE);
      if (downsampled.length) liveSpeechBuffers.push(downsampled);
    };
    liveSourceNode.connect(liveProcessorNode);
    liveProcessorNode.connect(liveSilentGain);
    liveSilentGain.connect(liveAudioContext.destination);
    if (!canUseMainVisionAudio()) {
      try { await ensureVisionAudioWs(); } catch (err) { addMessage("system", `Vision voice unavailable, live will not start: ${err.message}`); throw err; }
    }
    liveActive = true;
    liveSpeaking = false;
    liveBtn.textContent = "Live: On";
    addMessage("system", "Live mode on. Bumbee will listen with Vision voice, detect pauses, and reply in chat.");
    monitorLiveVoice();
    pushActivityState();
  } catch (err) {
    addMessage("system", `Live failed: ${err.message}`);
    stopLiveMode();
  } finally {
    liveBtn.disabled = false;
    if (!liveActive) liveBtn.textContent = "Live";
    pushActivityState();
  }
}

function stopLiveMode() {
  liveSessionId += 1;
  liveActive = false;
  liveSpeaking = false;
  if (liveMonitorFrame) cancelAnimationFrame(liveMonitorFrame);
  liveMonitorFrame = null;
  if (liveRecorder && liveRecorder.state !== "inactive") {
    try { liveRecorder.stop(); } catch {}
  }
  liveRecorder = null;
  liveSpeechBuffers = [];
  if (liveProcessorNode) {
    try { liveProcessorNode.disconnect(); } catch {}
  }
  liveProcessorNode = null;
  if (liveSourceNode) {
    try { liveSourceNode.disconnect(); } catch {}
  }
  liveSourceNode = null;
  if (liveSilentGain) {
    try { liveSilentGain.disconnect(); } catch {}
  }
  liveSilentGain = null;
  if (liveStream) liveStream.getTracks().forEach((track) => track.stop());
  liveStream = null;
  if (liveAudioContext) {
    try { liveAudioContext.close(); } catch {}
  }
  liveAudioContext = null;
  liveAnalyser = null;
  closeVisionAudioWs();
  if (pendingRequest) chatRequestId += 1;
  if (pendingRequest) setBusy(false);
  liveBtn.textContent = "Live";
  addMessage("system", "Live mode off.");
  pushActivityState();
}

function monitorLiveVoice() {
  if (!liveActive || !liveAnalyser) return;
  if (pendingRequest) {
    if (!liveSpeaking) liveBtn.textContent = "Live: Thinking";
    liveMonitorFrame = requestAnimationFrame(monitorLiveVoice);
    return;
  }
  const data = new Uint8Array(liveAnalyser.fftSize);
  liveAnalyser.getByteTimeDomainData(data);
  let sum = 0;
  for (const value of data) {
    const centered = value - 128;
    sum += centered * centered;
  }
  const rms = Math.sqrt(sum / data.length) / 128;
  const now = Date.now();
  const voiceThreshold = 0.035;
  const silenceMs = 900;
  const minSpeechMs = 450;

  if (rms > voiceThreshold) {
    liveLastVoiceAt = now;
    if (!liveSpeaking) {
      liveSpeaking = true;
      liveSpeechStartedAt = now;
      liveSpeechBuffers = [];
      startLiveRecorder();
      liveBtn.textContent = "Live: Listening";
      addMessage("system", "Live is listening...");
    }
  } else if (liveSpeaking && now - liveLastVoiceAt > silenceMs && now - liveSpeechStartedAt > minSpeechMs) {
    liveSpeaking = false;
    liveBtn.textContent = "Live: Thinking";
    stopLiveRecorderAndSend();
  }
  liveMonitorFrame = requestAnimationFrame(monitorLiveVoice);
}

function startLiveRecorder() {
  liveChunks = [];
}

function stopLiveRecorderAndSend() {
  const sessionId = liveSessionId;
  const buffers = liveSpeechBuffers.slice();
  liveSpeechBuffers = [];
  (async () => {
    try {
      const transcript = await transcribeLiveBuffersWithVision(buffers, sessionId);
      if (!transcript) {
        addMessage("system", "Vision did not hear a clear sentence.");
        return;
      }
      await sendLiveTranscript(transcript, sessionId);
    } catch (err) {
      addMessage("system", `Vision voice failed: ${err.message}`);
    } finally {
      if (liveActive && sessionId === liveSessionId) liveBtn.textContent = "Live: On";
    }
  })();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read audio."));
    reader.readAsDataURL(blob);
  });
}

sendBtn.addEventListener("click", sendPrompt);
chatTabBtn.addEventListener("click", () => setActiveTab("chat"));
learnTabBtn.addEventListener("click", () => setActiveTab("learn"));
settingsTabBtn.addEventListener("click", () => setActiveTab("settings"));

addVocabBtn.addEventListener("click", () => addVocabFromText(vocabInput.value, "manual"));
presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.preset;
    const source = `preset-${key}`;
    currentFocusSource = source;
    addVocabFromText(PRESET_TEXT[key] || "", source);
  });
});
challengeBtn.addEventListener("click", () => showChallenge(pickChallengeWord({ allowCurrent: false, source: currentFocusSource })));
resetScoresBtn.addEventListener("click", async () => {
  const result = await window.bumbeeChat.vocabReset();
  if (result.ok) {
    currentChallengeId = null;
    challengeHistory = [];
    currentFocusSource = null;
    vocabState = { settings: result.settings || vocabState.settings, words: result.words || [] };
    renderVocab();
    showChallenge();
  }
});
saveSettingsBtn.addEventListener("click", async () => {
  const result = await window.bumbeeChat.vocabSettings({
    goal: goalInput.value,
    difficulty: difficultyInput.value,
    targetLanguage: targetLanguageInput.value,
    nativeLanguage: nativeLanguageInput.value,
    dailyWords: dailyWordsInput.value,
    monthlyReset: monthlyResetInput.checked,
  });
  if (result.ok) {
    currentChallengeId = null;
    challengeHistory = [];
    currentFocusSource = null;
    vocabState = { settings: result.settings || {}, words: result.words || [] };
    renderSettings();
    renderVocab();
    showChallenge();
  }
});
for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove("dragging"));
}
dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  const files = Array.from(event.dataTransfer?.files || []);
  const chunks = [];
  for (const file of files.slice(0, 6)) {
    chunks.push(`--- ${file.name} ---\n${await readDroppedFile(file)}`);
  }
  const droppedText = event.dataTransfer?.getData("text/plain") || "";
  if (droppedText.trim()) chunks.push(droppedText.trim());
  const text = chunks.join("\n\n").trim();
  if (text) addVocabFromText(text, files.length ? "file-drop" : "drop");
});
promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    sendPrompt();
  }
});
promptInput.addEventListener("input", pushActivityState);
promptInput.addEventListener("focus", pushActivityState);
promptInput.addEventListener("blur", pushActivityState);

cameraBtn.addEventListener("click", () => {
  if (cameraStarting) return;
  if (cameraStream) stopCamera();
  else startCamera();
});
captureBtn.addEventListener("click", captureFrame);
stopCameraBtn.addEventListener("click", stopCamera);

voiceBtn.addEventListener("click", () => {
  if (liveActive) stopLiveMode();
  if (voiceWanted || micStream) stopVoice();
  else startVoice();
});
liveBtn.addEventListener("click", () => {
  if (voiceWanted || micStream) stopVoice({ send: false });
  if (liveActive) stopLiveMode();
  else startLiveMode();
});
visionBtn.addEventListener("click", () => {
  window.bumbeeChat.openVision();
});
wikiSyncBtn.addEventListener("click", async () => {
  wikiSyncBtn.disabled = true;
  wikiSyncBtn.textContent = "Syncing...";
  addMessage("system", "Syncing ~/Bumbee/bumbee-wiki to Bumbee Wiki...");
  try {
    const result = await window.bumbeeChat.wikiSync({ force: false });
    if (!result.ok && result.error) throw new Error(result.error);
    addMessage("system", `Wiki sync done: ${result.synced || 0} synced, ${result.skipped || 0} skipped. Folder: ${result.folder || ""}`);
    await refreshStatus();
  } catch (err) {
    addMessage("system", `Wiki sync failed: ${err.message}`);
  } finally {
    wikiSyncBtn.disabled = false;
    wikiSyncBtn.textContent = "Sync Wiki";
  }
});
refreshDevicesBtn.addEventListener("click", async () => {
  refreshDevicesBtn.disabled = true;
  refreshDevicesBtn.textContent = "Refreshing...";
  addMessage("system", "Refreshing camera and microphone devices...");
  try {
    await refreshMediaDevices({ silent: false, probe: true });
  } finally {
    refreshDevicesBtn.disabled = false;
    refreshDevicesBtn.textContent = "Refresh";
  }
});

speakBtn.addEventListener("click", () => {
  speakingEnabled = !speakingEnabled;
  speakBtn.textContent = `Speak: ${speakingEnabled ? "On" : "Off"}`;
  if (!speakingEnabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
});

requestCodeBtn.addEventListener("click", requestLoginCode);
verifyCodeBtn.addEventListener("click", verifyLoginCode);
emailInput.addEventListener("input", renderEmailHint);
emailInput.addEventListener("blur", renderEmailHint);
emailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    requestLoginCode();
  }
});
codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    verifyLoginCode();
  }
});

window.addEventListener("beforeunload", () => {
  stopCamera();
  stopVoice();
  stopLiveMode();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  window.bumbeeChat.activity({ typing: false, camera: false, voice: false, pending: false });
});

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    refreshMediaDevices({ silent: true, probe: false });
  });
}

refreshMediaDevices({ silent: true, probe: true });
renderModeButtons();
refreshStatus();
setActiveTab("chat");
loadVocab();
addMessage("assistant", "Bumbee chat is ready. Use Camera for a live preview, Mic for one recording, or Live for pause-detected voice conversation.");
