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
const speakBtn = document.getElementById("speakBtn");
const cameraPanel = document.getElementById("cameraPanel");
const cameraPreview = document.getElementById("cameraPreview");
const cameraCanvas = document.getElementById("cameraCanvas");
const captureBtn = document.getElementById("captureBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");

let cameraStream = null;
let capturedFrame = null;
let speakingEnabled = true;
let recognition = null;
let recognizing = false;
let pendingRequest = false;

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
    camera: !!cameraStream,
    voice: recognizing,
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

function renderVocab() {
  const words = vocabState.words || [];
  const due = words.filter((word) => !word.mastered).length;
  const xp = words.reduce((sum, word) => sum + (word.score || 0), 0);
  const streak = words.reduce((max, word) => Math.max(max, word.streak || 0), 0);
  vocabStats.textContent = `${words.length} words · ${due} active`;
  gameStats.textContent = `${xp} XP · ${streak} streak · ${due} active`;
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
    score.textContent = `${word.score || 0}/100`;
    header.append(title, score);

    const meaning = document.createElement("p");
    meaning.textContent = word.lesson?.meaning_vi || "No lesson yet.";
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
  addVocabBtn.disabled = true;
  addVocabBtn.textContent = "Adding...";
  try {
    const result = await window.bumbeeChat.vocabAdd({ text: clean, source });
    if (!result.ok) throw new Error(result.error || "Could not add words.");
    vocabState = { settings: result.db?.settings || vocabState.settings, words: result.db?.words || vocabState.words };
    vocabInput.value = "";
    renderVocab();
    showChallenge(result.created?.[0] || vocabState.words[0]);
  } catch (err) {
    challengeCard.hidden = false;
    challengeCard.textContent = `Add failed: ${err.message}`;
  } finally {
    addVocabBtn.disabled = false;
    addVocabBtn.textContent = "Add & AI plan";
  }
}

function pickChallengeWord() {
  const words = (vocabState.words || []).filter((word) => !word.mastered);
  if (!words.length) return null;
  const sorted = words.slice().sort((a, b) => {
    const scoreDiff = (a.score || 0) - (b.score || 0);
    if (scoreDiff) return scoreDiff;
    return String(a.next_review || "").localeCompare(String(b.next_review || ""));
  });
  if (currentChallengeId && sorted.length > 1) {
    return sorted.find((word) => word.id !== currentChallengeId) || sorted[0];
  }
  return sorted[0];
}

function getMeaning(word) {
  return word?.lesson?.meaning_vi || "Use this naturally in a real conversation.";
}

function buildChoiceSet(word) {
  const otherMeanings = (vocabState.words || [])
    .filter((item) => item.id !== word.id)
    .map((item) => getMeaning(item))
    .filter(Boolean);
  const choices = [getMeaning(word), ...otherMeanings.slice(0, 5)];
  while (choices.length < 4) {
    choices.push([
      "A polite phrase for keeping a conversation moving.",
      "A useful idea for meetings, essays or daily communication.",
      "A natural expression for describing a situation clearly.",
    ][choices.length - 1] || word.term);
  }
  return choices
    .slice(0, 4)
    .map((text) => ({ text, correct: text === getMeaning(word) }))
    .sort(() => Math.random() - 0.5);
}

function showChallenge(word = pickChallengeWord()) {
  if (!word) {
    challengeCard.hidden = false;
    challengeCard.textContent = "Add words first, then Bumbee will challenge you.";
    return;
  }
  currentChallengeId = word.id;
  const examples = word.lesson?.examples || [];
  const choices = buildChoiceSet(word);
  challengeCard.replaceChildren();
  challengeCard.hidden = false;
  const meta = document.createElement("div");
  meta.className = "game-meta";
  const level = document.createElement("span");
  level.textContent = (word.level || "medium").toUpperCase();
  const score = document.createElement("span");
  score.textContent = `${word.score || 0}/100 XP`;
  const streak = document.createElement("span");
  streak.textContent = `${word.streak || 0} streak`;
  meta.append(level, score, streak);

  const title = document.createElement("h3");
  title.textContent = word.term;
  const prompt = document.createElement("p");
  prompt.className = "game-prompt";
  prompt.textContent = "Pick the closest meaning, then say one sentence out loud.";
  const choicesEl = document.createElement("div");
  choicesEl.className = "choice-grid";
  const feedback = document.createElement("div");
  feedback.className = "game-feedback";
  feedback.hidden = true;
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice.text;
    button.addEventListener("click", () => {
      for (const item of choicesEl.querySelectorAll("button")) item.disabled = true;
      button.classList.add(choice.correct ? "correct" : "wrong");
      const correctButton = Array.from(choicesEl.querySelectorAll("button"))
        .find((item) => item.textContent === getMeaning(word));
      if (correctButton) correctButton.classList.add("correct");
      feedback.hidden = false;
      feedback.textContent = choice.correct
        ? `Good. Try this: ${examples[0] || `I can use "${word.term}" naturally today.`}`
        : `Review it: ${getMeaning(word)}`;
    });
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
  const good = document.createElement("button");
  good.type = "button";
  good.className = "good";
  good.textContent = "I can use it";
  good.addEventListener("click", () => markReview(word.id, true));
  const bad = document.createElement("button");
  bad.type = "button";
  bad.className = "bad";
  bad.textContent = "Train again";
  bad.addEventListener("click", () => markReview(word.id, false));
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next";
  next.addEventListener("click", () => showChallenge());
  actions.append(good, bad, next);
  challengeCard.append(meta, title, prompt, choicesEl, feedback, examplesEl, actions);
}

async function markReview(id, correct) {
  const result = await window.bumbeeChat.vocabReview({ id, correct });
  if (result.ok) {
    vocabState = { settings: result.settings || vocabState.settings, words: result.words || [] };
    renderVocab();
    showChallenge();
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
  pushActivityState();
}

function speak(text) {
  if (!speakingEnabled || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 900));
  utterance.lang = "vi-VN";
  window.speechSynthesis.speak(utterance);
}

async function refreshStatus() {
  try {
    const status = await window.bumbeeChat.status();
    const smart = status.smart || {};
    const skills = status.skills || {};
    const chatHost = smart.gatewayUrl ? smart.gatewayUrl.replace(/^https?:\/\//, "") : "gateway not set";
    const authText = smart.authenticated ? "auth ok" : "login required";
    statusLine.textContent = `Smart ${smart.enabled ? "on" : "off"} | ${authText} | Chat ${chatHost}${smart.chatEndpoint || ""} | Skills ${skills.count || 0}`;
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

async function sendPrompt() {
  const query = promptInput.value.trim();
  if (!query) return;
  promptInput.value = "";
  addMessage("user", query);
  setBusy(true);

  const context = {
    source: "clawd-on-desk",
    camera: capturedFrame ? {
      captured_at: capturedFrame.capturedAt,
      image_data_url: capturedFrame.dataUrl.slice(0, 50000),
      note: "Snapshot included for multimodal gateways; text-only gateways may ignore it.",
    } : null,
  };

  try {
    const result = await window.bumbeeChat.send({
      mode: modeSelect.value,
      query,
      context,
    });
    const answer = result.answer || result.error || "No response.";
    addMessage(result.ok && !result.error ? "assistant" : "system", answer);
    if (result.ok && !result.error) speak(answer);
  } catch (err) {
    addMessage("system", `Chat failed: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    addMessage("system", "Camera is not available in this Electron runtime.");
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    cameraPreview.srcObject = cameraStream;
    cameraPanel.hidden = false;
    pushActivityState();
  } catch (err) {
    addMessage("system", `Camera failed: ${err.message}`);
  }
}

function stopCamera() {
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
  }
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraPanel.hidden = true;
  pushActivityState();
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

function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.disabled = true;
    voiceBtn.textContent = "Voice: N/A";
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "vi-VN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onstart = () => {
    recognizing = true;
    voiceBtn.textContent = "Voice: On";
    pushActivityState();
  };
  recognition.onend = () => {
    recognizing = false;
    voiceBtn.textContent = "Voice";
    pushActivityState();
  };
  recognition.onerror = (event) => {
    addMessage("system", `Voice input error: ${event.error || "unknown"}`);
  };
  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0]?.transcript || "";
      if (event.results[i].isFinal) finalText += text;
      else interimText += text;
    }
    if (finalText) {
      const prefix = promptInput.value.trim();
      promptInput.value = `${prefix}${prefix ? " " : ""}${finalText.trim()}`;
      pushActivityState();
    } else if (interimText) {
      promptInput.placeholder = interimText.trim();
    }
  };
}

sendBtn.addEventListener("click", sendPrompt);
chatTabBtn.addEventListener("click", () => setActiveTab("chat"));
learnTabBtn.addEventListener("click", () => setActiveTab("learn"));
settingsTabBtn.addEventListener("click", () => setActiveTab("settings"));

addVocabBtn.addEventListener("click", () => addVocabFromText(vocabInput.value, "manual"));
presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.preset;
    addVocabFromText(PRESET_TEXT[key] || "", `preset-${key}`);
  });
});
challengeBtn.addEventListener("click", () => showChallenge());
resetScoresBtn.addEventListener("click", async () => {
  const result = await window.bumbeeChat.vocabReset();
  if (result.ok) {
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
    vocabState = { settings: result.settings || {}, words: result.words || [] };
    renderSettings();
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
  if (cameraStream) stopCamera();
  else startCamera();
});
captureBtn.addEventListener("click", captureFrame);
stopCameraBtn.addEventListener("click", stopCamera);

voiceBtn.addEventListener("click", () => {
  if (!recognition) return;
  if (recognizing) recognition.stop();
  else recognition.start();
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
  if (recognition && recognizing) recognition.stop();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  window.bumbeeChat.activity({ typing: false, camera: false, voice: false, pending: false });
});

initVoice();
refreshStatus();
setActiveTab("learn");
addMessage("assistant", "Bumbee chat is ready. Use Camera to attach a snapshot, Voice to dictate, and Speak to hear replies.");
