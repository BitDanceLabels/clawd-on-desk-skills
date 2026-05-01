const messagesEl = document.getElementById("messages");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const modeSelect = document.getElementById("modeSelect");
const statusLine = document.getElementById("statusLine");
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

function addMessage(role, text) {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  item.textContent = text;
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return item;
}

function setBusy(busy) {
  sendBtn.disabled = busy;
  sendBtn.textContent = busy ? "Sending..." : "Send";
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
    statusLine.textContent = `Smart ${smart.enabled ? "on" : "off"} | Chat ${chatHost}${smart.chatEndpoint || ""} | Skills ${skills.count || 0}`;
  } catch (err) {
    statusLine.textContent = `Status error: ${err.message}`;
  }
}

async function sendPrompt() {
  const query = promptInput.value.trim();
  if (!query) return;
  promptInput.value = "";
  addMessage("user", query);
  setBusy(true);

  const context = {
    source: "bumbee-chat-window",
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
  };
  recognition.onend = () => {
    recognizing = false;
    voiceBtn.textContent = "Voice";
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

window.addEventListener("beforeunload", () => {
  stopCamera();
  if (recognition && recognizing) recognition.stop();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
});

initVoice();
refreshStatus();
addMessage("assistant", "Bumbee chat is ready. Use Camera to attach a snapshot, Voice to dictate, and Speak to hear replies.");
