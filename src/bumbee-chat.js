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
addMessage("assistant", "Bumbee chat is ready. Use Camera to attach a snapshot, Voice to dictate, and Speak to hear replies.");
