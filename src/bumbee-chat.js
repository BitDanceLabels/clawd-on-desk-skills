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
  const email = emailInput.value.trim();
  requestCodeBtn.disabled = true;
  loginStatus.textContent = "Sending code...";
  try {
    const result = await window.bumbeeChat.loginRequest({ email });
    if (!result.ok) throw new Error(result.error || "Could not send code.");
    loginStatus.textContent = result.email_sent
      ? "Code sent. Check your email."
      : "Code created. Check admin page/server log because SMTP is not configured.";
    codeInput.focus();
  } catch (err) {
    loginStatus.textContent = `Login request failed: ${err.message}`;
  } finally {
    requestCodeBtn.disabled = false;
  }
}

async function verifyLoginCode() {
  const email = emailInput.value.trim();
  const code = codeInput.value.trim();
  verifyCodeBtn.disabled = true;
  loginStatus.textContent = "Verifying...";
  try {
    const result = await window.bumbeeChat.loginVerify({ email, code });
    if (!result.ok) throw new Error(result.error || "Invalid code.");
    loginStatus.textContent = "Login OK. Token saved on this device.";
    addMessage("system", "Bumbee Gateway login OK. You can chat now.");
    await refreshStatus();
  } catch (err) {
    loginStatus.textContent = `Verify failed: ${err.message}`;
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
