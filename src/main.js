const { app, BrowserWindow, screen, Menu, ipcMain, globalShortcut, session, systemPreferences, desktopCapturer, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const createBumbeeSystemBootstrap = require("./bumbee-system-bootstrap");

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isWin = process.platform === "win32";
const LINUX_WINDOW_TYPE = "toolbar";
const VISION_AUDIO_WS_URL = "wss://vision.bumbee.asia/ws/audio-stream";

function installSafeConsoleStreams() {
  const ignoredCodes = new Set(["EIO", "EPIPE", "EBADF"]);
  for (const stream of [process.stdout, process.stderr]) {
    if (!stream || stream.__clawdSafeConsole) continue;
    stream.__clawdSafeConsole = true;
    stream.on("error", (err) => {
      if (!ignoredCodes.has(err?.code)) throw err;
    });
  }
  for (const method of ["log", "info", "warn", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      try {
        original(...args);
      } catch (err) {
        if (!ignoredCodes.has(err?.code)) throw err;
      }
    };
  }
}

installSafeConsoleStreams();


// ── Windows: AllowSetForegroundWindow via FFI ──
let _allowSetForeground = null;
if (isWin) {
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    _allowSetForeground = user32.func("bool __stdcall AllowSetForegroundWindow(int dwProcessId)");
  } catch (err) {
    console.warn("Clawd: koffi/AllowSetForegroundWindow not available:", err.message);
  }
}


// ── Window size presets ──
const SIZES = {
  S: { width: 200, height: 200 },
  M: { width: 280, height: 280 },
  L: { width: 360, height: 360 },
};
const BUMBEE_VISION_URL = "https://vision.bumbee.asia/login";

let lang = "en";

async function websocketDataToText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data && typeof data.text === "function") return data.text();
  return String(data || "");
}

function transcribeVisionAudio(payload) {
  const data = typeof payload?.data === "string" ? payload.data : "";
  if (!data) return Promise.reject(new Error("missing audio data"));
  if (typeof WebSocket !== "function") return Promise.reject(new Error("WebSocket is not available in main process"));
  const sourceId = typeof payload?.source_id === "string" && payload.source_id ? payload.source_id : "bumbee-mic";
  const chunkId = typeof payload?.chunk_id === "string" && payload.chunk_id ? payload.chunk_id : `${sourceId}-${Date.now().toString(36)}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    let ws = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); } catch {}
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("Vision transcript timeout")), 30_000);
    try {
      ws = new WebSocket(VISION_AUDIO_WS_URL);
    } catch (err) {
      finish(reject, err);
      return;
    }
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "chunk", data, source_id: sourceId, chunk_id: chunkId }));
    }, { once: true });
    ws.addEventListener("message", async (event) => {
      let msg = null;
      try { msg = JSON.parse(await websocketDataToText(event.data)); } catch { return; }
      if (msg.type === "transcript" && (!msg.chunk_id || msg.chunk_id === chunkId)) {
        finish(resolve, {
          ok: true,
          text: String(msg.text || "").trim(),
          language: msg.language || null,
          duration_sec: msg.duration_sec || null,
          elapsed_ms: msg.elapsed_ms || null,
        });
      } else if (msg.type === "error") {
        finish(reject, new Error(String(msg.error || "Vision audio error")));
      }
    });
    ws.addEventListener("error", () => finish(reject, new Error("Vision audio WebSocket failed")), { once: true });
    ws.addEventListener("close", () => {
      if (!settled) finish(reject, new Error("Vision audio WebSocket closed"));
    }, { once: true });
  });
}

// ── Position persistence ──
const PREFS_PATH = path.join(app.getPath("userData"), "clawd-prefs.json");

function loadPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    // Validate miniEdge allowlist
    if (raw.miniEdge !== "left" && raw.miniEdge !== "right") raw.miniEdge = "right";
    // Sanitize numeric fields — corrupted JSON can feed NaN into window positioning
    for (const key of ["x", "y", "preMiniX", "preMiniY"]) {
      if (key in raw && (typeof raw[key] !== "number" || !isFinite(raw[key]))) {
        raw[key] = 0;
      }
    }
    return raw;
  } catch {
    return null;
  }
}

function savePrefs() {
  if (!win || win.isDestroyed()) return;
  const { x, y } = win.getBounds();
  const data = {
    x, y, size: currentSize,
    miniMode: _mini.getMiniMode(), miniEdge: _mini.getMiniEdge(), preMiniX: _mini.getPreMiniX(), preMiniY: _mini.getPreMiniY(), lang,
    showTray, showDock,
    autoStartWithClaude, bubbleFollowPet, hideBubbles, showSessionId,
    ghostMode, assistantMode24x7,
    rabbitEnabled: _rabbit ? _rabbit.getEnabled() : rabbitEnabled,
    rabbitIntervalMin: _rabbit ? _rabbit.getIntervalMin() : rabbitIntervalMin,
    characterSkin,
    vocabAutoChallenge, vocabChallengeIntervalMin, vocabReverseMode,
    vocabGameType, challengeWinPos,
    vocabAutoSource, vocabAutoSourceIntervalSec,
  };
  try { fs.writeFileSync(PREFS_PATH, JSON.stringify(data)); } catch {}
}

let _codexMonitor = null;          // Codex CLI JSONL log polling instance

// ── CSS <object> sizing (mirrors styles.css #clawd) ──
const OBJ_SCALE_W = 1.9;   // width: 190%
const OBJ_SCALE_H = 1.3;   // height: 130%
const OBJ_OFF_X   = -0.45; // left: -45%
const OBJ_OFF_Y   = -0.25; // top: -25%

function getObjRect(bounds) {
  return {
    x: bounds.x + bounds.width * OBJ_OFF_X,
    y: bounds.y + bounds.height * OBJ_OFF_Y,
    w: bounds.width * OBJ_SCALE_W,
    h: bounds.height * OBJ_SCALE_H,
  };
}

let win;
let hitWin;  // input window — small opaque rect over hitbox, receives all pointer events
let chatWin;
let visionWin;
let vocabWin;
let challengeWin;  // auto-pop vocab challenge popup
let phaseHubWin;
let bumbeeOsWin;
let donationSettingsWin;
let sceneViewerWin;
let chatAutoHideTimer = null;
let chatActivityState = { typing: false, camera: false, voice: false, pending: false };
let tray = null;
let contextMenuOwner = null;
let currentSize = "S";
let contextMenu;
let doNotDisturb = false;
let isQuitting = false;
let showTray = true;
let showDock = true;
let autoStartWithClaude = false;
let bubbleFollowPet = false;
let hideBubbles = false;
let showSessionId = false;
let ghostMode = true;
let assistantMode24x7 = false;
let petHidden = false;
let rabbitEnabled = false;
let rabbitIntervalMin = 60;
let characterSkin = "clawd";  // "clawd" | "bunny" — switches the pet character
// ── Vocab auto-challenge (Phase 1) ──
let vocabAutoChallenge = true;         // scheduler pops challenges on an interval (default ON)
let vocabChallengeIntervalMin = 20;    // minutes between auto-pops
let vocabReverseMode = false;          // true → Vietnamese→English direction
let vocabGameType = "mix";             // mix | sentence | vocab — vocab = word-pick rounds
let challengeWinPos = null;            // {x,y} — persisted position after user drags the popup
let challengeTimer = null;
let challengeSnoozeUntil = 0;
// ── Vocab auto-source (Phase 2) ──
let vocabAutoSource = false;           // watch clipboard and auto-mine vocab
let vocabAutoSourceIntervalSec = 45;   // clipboard poll cadence
let _autoSource = null;
const DEFAULT_TOGGLE_SHORTCUT = "CommandOrControl+Shift+Alt+C";
const CHAT_AUTO_HIDE_MS = Number.parseInt(process.env.BUMBEE_CHAT_AUTO_HIDE_MS || "15000", 10);
const CHAT_DEVICE_ID = process.env.BUMBEE_DEVICE_ID || `${os.hostname()}-${process.platform}`;
const CHAT_SESSION_ID = `desk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const CHAT_AUTH_SERVER_URL = (process.env.BUMBEE_DESK_AUTH_URL || process.env.TOKEN_ADMIN_URL || "https://gateway.bumbee.asia/bumbee-desk-token-admin").replace(/\/$/, "");
const VOCAB_DB_PATH = path.join(app.getPath("userData"), "bumbee-english-vocab.json");
const DONATION_SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");
const VOCAB_METRICS_PATH = path.join(app.getPath("userData"), "vocab-metrics.json");
const EVENTS_SOCK_PATH = path.join(app.getPath("userData"), "events.sock");
const EVENTS_JSONL_PATH = path.join(app.getPath("userData"), "events.jsonl");
const EVENT_ROUTER_PATH = path.join(app.getPath("userData"), "event_router.json");
const AVATAR_REACTIONS_PATH = path.join(app.getPath("userData"), "avatar-reactions.jsonl");
const DEFAULT_DONATION_URL = "https://bitdancegroup.com/bumbee-vocab-tinder/checkout";
const DONATION_STATUS_URL = (process.env.BUMBEE_DONATION_STATUS_URL || "https://bitdancegroup.com/payment/bumbee/status").replace(/\/$/, "");
const PROXYCLI_CHAT_URL = (process.env.BUMBEE_PROXYCLI_CHAT_URL || process.env.PROXYCLI_CHAT_URL || process.env.OPENAI_BASE_URL || "https://gateway.bumbee.asia/v1").replace(/\/$/, "");
const PROXYCLI_API_KEY = process.env.BUMBEE_PROXYCLI_API_KEY || process.env.PROXYCLI_API_KEY || process.env.OPENAI_API_KEY || "bumbee-proxy-key-2024";
const PROXYCLI_MODEL = process.env.BUMBEE_PROXYCLI_MODEL || process.env.PROXYCLI_MODEL || process.env.OPENAI_MODEL || "codex-cli-local";
const DONATION_ALLOWED_HOSTS = [
  /^buymeacoffee\.com$/i,
  /^(www\.)?ko-fi\.com$/i,
  /^patreon\.com$/i,
  /^paypal\.me$/i,
  /^(www\.)?tipeee\.com$/i,
  /^donate\.stripe\.com$/i,
  /^bitdancegroup\.com$/i,
];
const LEARN_ON_START = process.env.BUMBEE_LEARN_ON_START !== "0";

const STARTER_VOCAB_VERSION = 7;
const STARTER_VOCAB = [
  {
    term: "follow up",
    category: "Work",
    level: "easy",
    meaning: "To contact someone again after a previous conversation so you can update, confirm, or finish an open issue.",
    examples: [
      "I will follow up with the client this afternoon.",
      "Could you follow up after the demo and confirm the next step?",
      "Thanks for the meeting. I will follow up with a short proposal.",
    ],
    collocations: ["follow up with a client", "follow up after a meeting", "follow up by email"],
  },
  {
    term: "clarify scope",
    category: "Work",
    level: "medium",
    meaning: "To make the boundaries of the work clear before committing to time, cost, or responsibility.",
    examples: [
      "Before we quote the price, we need to clarify scope.",
      "Let's clarify scope so the team knows exactly what to deliver.",
      "The project will run smoother if we clarify scope today.",
    ],
    collocations: ["clarify scope before quoting", "clarify scope with the client", "clarify project scope"],
  },
  {
    term: "align expectations",
    category: "Work",
    level: "medium",
    meaning: "To make sure everyone shares the same understanding of goals, timing, and expected results.",
    examples: [
      "Let's align expectations before the team starts building.",
      "I want to align expectations on budget, timeline, and quality.",
      "The kickoff meeting helped us align expectations with the partner.",
    ],
    collocations: ["align expectations with a partner", "align expectations on timeline", "align expectations early"],
  },
  {
    term: "action item",
    category: "Work",
    level: "easy",
    meaning: "A specific task agreed after a meeting, usually with an owner and a deadline.",
    examples: [
      "My action item is to send the updated contract today.",
      "Let's close the meeting with three clear action items.",
      "Who owns this action item before Friday?",
    ],
    collocations: ["own an action item", "clear action items", "meeting action item"],
  },
  {
    term: "decision maker",
    category: "Sales",
    level: "medium",
    meaning: "The person who has authority to approve a purchase, contract, or budget.",
    examples: [
      "We should identify the decision maker before the second demo.",
      "The decision maker wants a simple cost comparison.",
      "Can you invite the decision maker to the proposal call?",
    ],
    collocations: ["identify the decision maker", "reach the decision maker", "decision maker in the deal"],
  },
  {
    term: "pain point",
    category: "Sales",
    level: "medium",
    meaning: "A problem that creates frustration or cost and makes a customer need a solution.",
    examples: [
      "Their biggest pain point is slow inventory reporting.",
      "Start the pitch by confirming the customer's pain point.",
      "This feature solves a real pain point for store managers.",
    ],
    collocations: ["customer pain point", "solve a pain point", "confirm the pain point"],
  },
  {
    term: "value proposition",
    category: "Sales",
    level: "hard",
    meaning: "A clear reason why a product is valuable and why someone should choose it.",
    examples: [
      "Our value proposition is faster deployment with lower training cost.",
      "The value proposition must be clear in the first two minutes.",
      "A strong value proposition connects the product to business results.",
    ],
    collocations: ["clear value proposition", "strong value proposition", "value proposition for partners"],
  },
  {
    term: "proof of concept",
    category: "Product",
    level: "hard",
    meaning: "A small test used to prove that an idea or technology can work before full investment.",
    examples: [
      "We will run a proof of concept with one retail branch first.",
      "The proof of concept should validate accuracy and operating cost.",
      "After the proof of concept, we can plan full deployment.",
    ],
    collocations: ["run a proof of concept", "validate a proof of concept", "proof of concept phase"],
  },
  {
    term: "rollout plan",
    category: "Operations",
    level: "medium",
    meaning: "A step-by-step plan for launching a product, process, or system into real operation.",
    examples: [
      "The rollout plan starts with training the first partner group.",
      "We need a rollout plan before launching in all stores.",
      "A good rollout plan reduces confusion during implementation.",
    ],
    collocations: ["prepare a rollout plan", "regional rollout plan", "rollout plan for partners"],
  },
  {
    term: "quality assurance",
    category: "Operations",
    level: "hard",
    meaning: "A checking process that makes sure a product or service meets standards before delivery.",
    examples: [
      "Quality assurance must happen before we send the product to customers.",
      "The team created a quality assurance checklist for every batch.",
      "Strong quality assurance protects the brand during scale-up.",
    ],
    collocations: ["quality assurance checklist", "quality assurance process", "quality assurance before launch"],
  },
  {
    term: "coherent argument",
    category: "IELTS",
    level: "hard",
    meaning: "A clear line of reasoning where ideas connect logically and support one position.",
    examples: [
      "A coherent argument is more persuasive than a list of separate ideas.",
      "Your essay needs a coherent argument with clear evidence.",
      "The conclusion should reinforce the coherent argument from the body paragraphs.",
    ],
    collocations: ["build a coherent argument", "present a coherent argument", "coherent argument in an essay"],
  },
  {
    term: "evaluate evidence",
    category: "IELTS",
    level: "hard",
    meaning: "To judge how reliable, relevant, and persuasive the evidence is.",
    examples: [
      "Students should evaluate evidence before accepting a claim.",
      "The report evaluates evidence from interviews and sales data.",
      "A strong essay can evaluate evidence instead of just listing facts.",
    ],
    collocations: ["evaluate evidence carefully", "evaluate evidence in an essay", "evaluate evidence before deciding"],
  },
  {
    term: "balanced conclusion",
    category: "IELTS",
    level: "medium",
    meaning: "A conclusion that fairly considers the main sides of an issue while giving a clear final view.",
    examples: [
      "A balanced conclusion shows that you understand both sides of the debate.",
      "End the essay with a balanced conclusion, not a sudden opinion.",
      "The examiner expects a balanced conclusion in discussion essays.",
    ],
    collocations: ["write a balanced conclusion", "balanced conclusion for IELTS", "clear balanced conclusion"],
  },
  {
    term: "keep in touch",
    category: "Social",
    level: "easy",
    meaning: "To continue communicating with someone after meeting or working together.",
    examples: [
      "It was great meeting you. Let's keep in touch.",
      "We should keep in touch after the conference.",
      "Please keep in touch if you need support with the setup.",
    ],
    collocations: ["keep in touch after a meeting", "keep in touch with partners", "let's keep in touch"],
  },
  {
    term: "break the ice",
    category: "Social",
    level: "medium",
    meaning: "To start a conversation so the situation feels less tense or awkward.",
    examples: [
      "A simple question can break the ice at the start of a meeting.",
      "The host used a quick story to break the ice.",
      "Small talk helps break the ice with new partners.",
    ],
    collocations: ["break the ice with a question", "break the ice at a meeting", "break the ice with partners"],
  },
];

const VOCAB_DIFFICULTY_RULES = {
  easy: { gain: 10, loss: 24, masterScore: 92, masterStreak: 5, correctHourBase: 4, wrongHours: 1 },
  medium: { gain: 8, loss: 22, masterScore: 94, masterStreak: 6, correctHourBase: 6, wrongHours: 2 },
  hard: { gain: 6, loss: 20, masterScore: 96, masterStreak: 8, correctHourBase: 8, wrongHours: 3 },
  expert: { gain: 5, loss: 18, masterScore: 98, masterStreak: 10, correctHourBase: 10, wrongHours: 4 },
};

const ENGLISH_LESSON_LIBRARY = {
  "make progress": {
    meaning: "To move forward and improve, even if the work is not finished yet.",
    examples: [
      "We made progress on the proposal, but we still need the final numbers.",
      "I want to make progress on this feature before the next meeting.",
      "The team is making steady progress with the new customer workflow.",
    ],
    collocations: ["make steady progress", "make progress on a task", "make progress toward a goal"],
  },
  "handle feedback": {
    meaning: "To receive comments or criticism professionally and use them to improve the work.",
    examples: [
      "She handled the feedback well and updated the design the same day.",
      "I want to handle feedback calmly, even when the client is direct.",
      "A good manager helps the team handle feedback without losing momentum.",
    ],
    collocations: ["handle feedback well", "handle client feedback", "handle feedback professionally"],
  },
  "client requirement": {
    meaning: "Something a customer needs or expects the product, service, or team to deliver.",
    examples: [
      "This client requirement affects the timeline and the budget.",
      "We should confirm every client requirement before development starts.",
      "The new dashboard was added because of a clear client requirement.",
    ],
    collocations: ["confirm client requirements", "document client requirements", "meet a client requirement"],
  },
  "deadline pressure": {
    meaning: "Stress or urgency caused by having limited time to finish important work.",
    examples: [
      "The team is under deadline pressure, so we need to protect focus time.",
      "Deadline pressure can create mistakes if the scope is not clear.",
      "I work better under deadline pressure when the priorities are simple.",
    ],
    collocations: ["under deadline pressure", "manage deadline pressure", "reduce deadline pressure"],
  },
  "catch up": {
    meaning: "To talk with someone and learn what has happened since you last spoke.",
    examples: [
      "Let's catch up after lunch and compare notes.",
      "I caught up with an old partner at the event.",
      "We should catch up this week before the project gets busy.",
    ],
    collocations: ["catch up with a friend", "catch up after work", "quick catch-up"],
  },
  "small talk": {
    meaning: "Light, polite conversation about simple topics before or between serious discussions.",
    examples: [
      "A little small talk helped everyone feel comfortable before the meeting.",
      "I use small talk to start conversations with new partners.",
      "Good small talk should feel natural, not forced.",
    ],
    collocations: ["make small talk", "start with small talk", "natural small talk"],
  },
  "hang out": {
    meaning: "To spend relaxed time with someone without a formal plan.",
    examples: [
      "We might hang out after work if the schedule is clear.",
      "I like to hang out with friends on Sunday evening.",
      "The team hung out after the event and shared ideas.",
    ],
    collocations: ["hang out with friends", "hang out after work", "casually hang out"],
  },
  "first impression": {
    meaning: "The opinion someone forms when they first meet a person, see a product, or experience a situation.",
    examples: [
      "Your first impression matters when you meet a new client.",
      "The homepage creates the first impression of the product.",
      "I want to make a strong first impression in tomorrow's interview.",
    ],
    collocations: ["make a first impression", "strong first impression", "first impression of a product"],
  },
  "awkward silence": {
    meaning: "An uncomfortable pause in a conversation when nobody knows what to say.",
    examples: [
      "There was an awkward silence after the pricing question.",
      "A simple follow-up question can break an awkward silence.",
      "I smiled and changed the topic to avoid an awkward silence.",
    ],
    collocations: ["avoid an awkward silence", "break an awkward silence", "long awkward silence"],
  },
  "sense of humor": {
    meaning: "The ability to understand jokes and enjoy funny situations in a natural way.",
    examples: [
      "A good sense of humor can make a difficult conversation easier.",
      "She has a dry sense of humor that the whole team enjoys.",
      "Use your sense of humor carefully in a professional meeting.",
    ],
    collocations: ["good sense of humor", "dry sense of humor", "share a sense of humor"],
  },
  "personal boundary": {
    meaning: "A limit someone sets to protect their time, privacy, energy, or comfort.",
    examples: [
      "It's healthy to set a personal boundary around work messages at night.",
      "He explained his personal boundary politely and clearly.",
      "Respecting a personal boundary builds trust in a relationship.",
    ],
    collocations: ["set a personal boundary", "respect a personal boundary", "clear personal boundary"],
  },
  "significant factor": {
    meaning: "An important cause or influence that affects a result or decision.",
    examples: [
      "Cost is a significant factor in the customer's decision.",
      "Location became a significant factor in the research results.",
      "A significant factor should be explained with evidence.",
    ],
    collocations: ["a significant factor in", "consider a significant factor", "identify a significant factor"],
  },
  "limited perspective": {
    meaning: "A narrow way of seeing an issue because some information or viewpoints are missing.",
    examples: [
      "The report has a limited perspective because it only uses one data source.",
      "A limited perspective can lead to a weak business decision.",
      "We need customer interviews to avoid a limited perspective.",
    ],
    collocations: ["from a limited perspective", "avoid a limited perspective", "broaden a limited perspective"],
  },
  "practical implication": {
    meaning: "The real-world effect or consequence of an idea, decision, or result.",
    examples: [
      "The practical implication is that we need more support staff.",
      "Every recommendation should include a practical implication.",
      "This research has a practical implication for product training.",
    ],
    collocations: ["practical implication of", "explain the practical implication", "clear practical implication"],
  },
  "long-term consequence": {
    meaning: "An effect that appears or continues far into the future.",
    examples: [
      "A poor onboarding process can have long-term consequences for retention.",
      "The long-term consequence of this policy is hard to measure.",
      "We should consider the long-term consequence before cutting quality checks.",
    ],
    collocations: ["consider long-term consequences", "serious long-term consequence", "long-term consequence of a decision"],
  },
  "controversial issue": {
    meaning: "A topic that people strongly disagree about because it involves competing values or interests.",
    examples: [
      "Remote work remains a controversial issue in some companies.",
      "The essay discusses a controversial issue with balanced evidence.",
      "Pricing data can become a controversial issue during partner negotiations.",
    ],
    collocations: ["discuss a controversial issue", "debate a controversial issue", "controversial issue in society"],
  },
  "plot twist": {
    meaning: "A surprising change in a story or situation that makes people rethink what happened.",
    examples: [
      "The plot twist is that the quietest customer became our biggest buyer.",
      "That meeting had a plot twist when the investor asked to join the pilot.",
      "I did not expect that plot twist in the negotiation.",
    ],
    collocations: ["unexpected plot twist", "funny plot twist", "plot twist in the story"],
  },
  "brain freeze": {
    meaning: "A short moment when your mind goes blank, especially while speaking or answering quickly.",
    examples: [
      "I had a brain freeze during the presentation and forgot the next slide.",
      "Take a breath if you get a brain freeze in English conversation.",
      "The question was simple, but I had a complete brain freeze.",
    ],
    collocations: ["get brain freeze", "complete brain freeze", "avoid brain freeze"],
  },
  "accidentally professional": {
    meaning: "Funny or informal: doing something in a surprisingly polished or competent way without planning to.",
    examples: [
      "I was accidentally professional when I turned my messy notes into a clear proposal.",
      "The quick demo looked accidentally professional, so the client asked for a pilot.",
      "He sounded accidentally professional even though he joined the meeting late.",
    ],
    collocations: ["look accidentally professional", "sound accidentally professional", "accidentally professional presentation"],
  },
  "chaotic meeting": {
    meaning: "A meeting that feels disorganized, noisy, or hard to control.",
    examples: [
      "That chaotic meeting needed a clear agenda and one decision owner.",
      "We turned a chaotic meeting into three simple action items.",
      "A chaotic meeting can still be useful if someone summarizes the next steps.",
    ],
    collocations: ["chaotic meeting agenda", "survive a chaotic meeting", "turn a chaotic meeting around"],
  },
  "coffee-powered": {
    meaning: "Funny or informal: full of energy because of drinking coffee.",
    examples: [
      "Our Monday meeting was completely coffee-powered.",
      "I finished the report in one coffee-powered morning.",
      "The team looked tired but coffee-powered before launch.",
    ],
    collocations: ["coffee-powered morning", "coffee-powered meeting", "coffee-powered energy"],
  },
  "awkward but honest": {
    meaning: "Uncomfortable to say, but truthful and direct in a useful way.",
    examples: [
      "The feedback was awkward but honest, and it helped us improve the product.",
      "This is awkward but honest: the launch plan is not ready yet.",
      "An awkward but honest conversation can save a partnership from bigger problems.",
    ],
    collocations: ["awkward but honest feedback", "awkward but honest conversation", "awkward but honest answer"],
  },
  "tiny victory": {
    meaning: "A small success that still feels encouraging or worth celebrating.",
    examples: [
      "Fixing that bug was a tiny victory after a long day.",
      "Every new sentence you can say naturally is a tiny victory.",
      "The first customer reply felt like a tiny victory for the team.",
    ],
    collocations: ["celebrate a tiny victory", "small tiny victory", "tiny victory today"],
  },
  "suspiciously productive": {
    meaning: "Funny or informal: so productive that it feels surprising or almost unbelievable.",
    examples: [
      "This morning was suspiciously productive; I finished three tasks before lunch.",
      "The meeting was suspiciously productive and ended early.",
      "I get suspiciously productive when my calendar is empty.",
    ],
    collocations: ["suspiciously productive morning", "suspiciously productive meeting", "feel suspiciously productive"],
  },
};

function getVocabDifficultyRules(level) {
  return VOCAB_DIFFICULTY_RULES[level] || VOCAB_DIFFICULTY_RULES.medium;
}

function starterLesson(item) {
  return {
    meaning_en: item.meaning,
    meaning_vi: "",
    pronunciation: "",
    examples: item.examples,
    collocations: item.collocations || [],
    quiz: [
      { type: "recall", prompt: `Say one natural sentence with "${item.term}".`, answer: item.examples[0] },
      { type: "meaning", prompt: `What does "${item.term}" mean in this context?`, answer: item.meaning },
    ],
  };
}

function buildStarterWords() {
  const now = new Date().toISOString();
  return STARTER_VOCAB.map((item, index) => ({
    id: `starter-${index + 1}-${item.term.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    term: item.term,
    category: item.category,
    score: 0,
    streak: 0,
    mistake_count: 0,
    review_count: 0,
    mastered: false,
    level: item.level,
    sources: [`starter-${item.category.toLowerCase()}`],
    lesson: starterLesson(item),
    created_at: now,
    updated_at: now,
    last_reviewed: null,
    next_review: now,
  }));
}

function ensureStarterVocab(db) {
  const starterWords = buildStarterWords();
  const normalizedWords = (Array.isArray(db.words) ? db.words : [])
    .map((word) => normalizeStoredVocabItem(word, db.settings))
    .filter((word) => word && word.term);
  if (!db.words || db.words.length === 0) {
    return { ...db, version: STARTER_VOCAB_VERSION, words: starterWords };
  }
  if ((Number(db.version) || 1) >= STARTER_VOCAB_VERSION) return db;
  const customWords = normalizedWords.filter((word) => !String(word.id || "").startsWith("starter-"));
  return { ...db, version: STARTER_VOCAB_VERSION, words: [...starterWords, ...customWords] };
}

function getBumbeeTokenFilePath() {
  return path.join(app.getPath("userData"), "bumbee-gateway-token.txt");
}

function readTokenFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function getBumbeeWikiTokenFilePath() {
  return process.env.BUMBEE_WIKI_TOKEN_FILE || path.join(app.getPath("userData"), "bumbee-wiki-token.txt");
}

function getBumbeeWikiFolderPath() {
  return process.env.BUMBEE_WIKI_DIR || path.join(os.homedir(), "Bumbee", "bumbee-wiki");
}

function getBumbeeStudioFolderPath() {
  return process.env.BUMBEE_STUDIO_DIR || path.join(os.homedir(), "Bumbee", "bumbee-wiki-studio");
}

function initBumbeeSmartLayer() {
  _smart = require("./intelligent-layer")({
    chatAuthTokenFile: getBumbeeTokenFilePath(),
    bumbeeWiki: _wiki,
    proxycliUrl: PROXYCLI_CHAT_URL,
    proxycliApiKey: PROXYCLI_API_KEY,
    proxycliModel: PROXYCLI_MODEL,
    userName: "anh Nhựt",
    studioDir: getBumbeeStudioFolderPath(),
  });
}

function reloadBumbeeSmartLayer() {
  try {
    initBumbeeSmartLayer();
    return true;
  } catch (err) {
    console.warn("Clawd: intelligent layer reload failed:", err.message);
    return false;
  }
}

function isTrustedVisionUrl(url) {
  try {
    const parsed = new URL(url || "");
    return parsed.protocol === "https:" && parsed.hostname === "vision.bumbee.asia";
  } catch {
    return false;
  }
}

function isTrustedVisionOrigin(origin) {
  try {
    const parsed = new URL(origin || "");
    return parsed.protocol === "https:" && parsed.hostname === "vision.bumbee.asia";
  } catch {
    return false;
  }
}

function canGrantMediaPermission(webContents, permission) {
  const allowedPermissions = ["media", "microphone", "camera", "display-capture", "fullscreen", "window-management"];
  if (!allowedPermissions.includes(permission)) return false;
  try {
    const url = webContents?.getURL?.() || "";
    return url.startsWith("file://") || isTrustedVisionUrl(url);
  } catch {
    return false;
  }
}

function pickPrimaryDisplaySource(sources) {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const preferredIds = [primary.id, ...displays.map((display) => display.id)].map(String);
  for (const displayId of preferredIds) {
    const source = sources.find((item) => String(item.display_id || "") === displayId);
    if (source) return source;
  }
  return sources.find((item) => String(item.id || "").startsWith("screen:")) || sources[0] || null;
}

function configureDisplayCapturePermissions(defaultSession) {
  if (!defaultSession?.setDisplayMediaRequestHandler) return;
  defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isTrustedVisionOrigin(request.securityOrigin)) {
      callback({});
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      const source = pickPrimaryDisplaySource(sources);
      if (!source || !request.videoRequested) {
        callback({});
        return;
      }
      const streams = {
        video: { id: source.id, name: source.name },
      };
      if (request.audioRequested && isWin) streams.audio = "loopback";
      callback(streams);
    } catch (err) {
      console.warn("Clawd: display capture request failed:", err.message);
      callback({});
    }
  }, { useSystemPicker: true });
}

function requestJson(url, body) {
  const parsed = new URL(url);
  const lib = parsed.protocol === "https:" ? require("https") : require("http");
  const payload = JSON.stringify(body || {});
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "User-Agent": "clawd-on-desk/bumbee-auth",
      },
      timeout: 15000,
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = { error: raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data || {});
        } else {
          const message = data?.error || data?.message || `HTTP ${res.statusCode}`;
          reject(new Error(message));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function requestBumbeeLoginCode(payload) {
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email không hợp lệ." };
  }
  try {
    const result = await requestJson(`${CHAT_AUTH_SERVER_URL}/api/login/request`, {
      email,
      device_id: CHAT_DEVICE_ID,
      device_name: os.hostname(),
      source: "clawd-on-desk",
    });
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function verifyBumbeeLoginCode(payload) {
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const code = typeof payload?.code === "string" ? payload.code.trim() : "";
  if (!email || !code) return { ok: false, error: "Thiếu email hoặc mã xác thực." };
  try {
    const result = await requestJson(`${CHAT_AUTH_SERVER_URL}/api/login/verify`, {
      email,
      code,
      device_id: CHAT_DEVICE_ID,
      device_name: os.hostname(),
      source: "clawd-on-desk",
    });
    if (!result?.token) return { ok: false, error: "Server không trả token." };
    const tokenPath = getBumbeeTokenFilePath();
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    fs.writeFileSync(tokenPath, String(result.token).trim(), { mode: 0o600 });
    try { fs.chmodSync(tokenPath, 0o600); } catch {}
    reloadBumbeeSmartLayer();
    setChatUserId(email); // Switch chat history to this user
    return { ok: true, email, tokenFile: tokenPath, expires_at: result.expires_at || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function logoutBumbeeChat() {
  try { fs.unlinkSync(getBumbeeTokenFilePath()); } catch {}
  reloadBumbeeSmartLayer();
  setChatUserId("local");
  return { ok: true };
}

async function syncBumbeeWiki(options) {
  if (!_wiki) return { ok: false, error: "Bumbee Wiki service is not available yet" };
  try {
    return await _wiki.syncOnce(options || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function setupBumbeeStudio(options) {
  if (!_wiki) return { ok: false, error: "Bumbee Wiki service is not available yet" };
  try {
    return await _wiki.setupStudio(options || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function syncBumbeeStudio(options) {
  if (!_wiki) return { ok: false, error: "Bumbee Wiki service is not available yet" };
  try {
    return await _wiki.syncStudio(options || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function getBumbeeStudioDashboard(options) {
  if (!_wiki) return { ok: false, error: "Bumbee Wiki service is not available yet" };
  try {
    return await _wiki.studioDashboard(options || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function createBumbeeStudioProject(options) {
  if (!_wiki) return { ok: false, error: "Bumbee Wiki service is not available yet" };
  try {
    return await _wiki.newStudioProject(options || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function runBumbeeStudioWorkers(options) {
  if (!_wiki) return { ok: false, error: "Bumbee Wiki service is not available yet" };
  try {
    return await _wiki.runWorkers(options || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function approveBumbeeStudioAction(options) {
  if (!_wiki) return { ok: false, error: "Bumbee Wiki service is not available yet" };
  try {
    return await _wiki.approveAction(options || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function runBumbeeStudioGatewayAction(options) {
  if (!_wiki) return { ok: false, error: "Bumbee Wiki service is not available yet" };
  try {
    const payload = options || {};
    return await _wiki.runGatewayAction({
      ...payload,
      gatewayToken: payload.gatewayToken || readTokenFile(getBumbeeTokenFilePath()),
      gatewayBaseUrl: payload.gatewayBaseUrl || process.env.BUMBEE_GATEWAY_URL || "https://gateway.bumbee.asia",
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function showGatewayConfirmation(action, payload, endpoint) {
  return new Promise((resolve) => {
    const { BrowserWindow } = require("electron");
    const confirmWin = new BrowserWindow({
      width: 520, height: 480,
      resizable: true, minimizable: false,
      title: "Gateway Execution",
      show: false,
      backgroundColor: "#0b0f14",
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, "preload-gateway-confirm.js"),
        contextIsolation: true, nodeIntegration: false, sandbox: false,
      },
    });
    confirmWin.loadFile(path.join(__dirname, "gateway-confirm.html"));
    let decided = false;
    confirmWin.webContents.once("did-finish-load", () => {
      const token = readTokenFile(getBumbeeTokenFilePath());
      confirmWin.webContents.send("gateway-show", {
        action, payload, endpoint,
        skillName: payload?.skill_name || action?.type || "unknown",
        tokenStatus: token ? "valid" : "missing",
      });
    });
    confirmWin.once("ready-to-show", () => confirmWin.show());
    ipcMain.once("gateway-decide", (_e, approved) => {
      decided = true;
      if (confirmWin && !confirmWin.isDestroyed()) confirmWin.close();
      resolve({ approved });
    });
    ipcMain.once("gateway-confirm-height", (_e, h) => {
      if (confirmWin && !confirmWin.isDestroyed()) confirmWin.setContentSize(520, Math.min(700, Math.max(320, h)));
    });
    confirmWin.on("closed", () => { if (!decided) resolve({ approved: false }); });
  });
}

async function runBumbeeStudioGatewayActionLive(options) {
  if (!_wiki) return { ok: false, error: "Bumbee Wiki service is not available yet" };
  const payload = options || {};
  const token = payload.gatewayToken || readTokenFile(getBumbeeTokenFilePath());
  const baseUrl = payload.gatewayBaseUrl || process.env.BUMBEE_GATEWAY_URL || "https://gateway.bumbee.asia";
  const dryResult = await _wiki.runGatewayAction({ ...payload, dryRun: true, gatewayToken: token, gatewayBaseUrl: baseUrl });
  if (!dryResult.ok) return dryResult;
  const { approved } = await showGatewayConfirmation(
    dryResult.action, dryResult.execution?.payload, dryResult.execution?.endpoint || `${baseUrl}/api/studio/runs`
  );
  if (!approved) return { ok: false, cancelled: true };
  return await _wiki.runGatewayAction({ ...payload, dryRun: false, confirm: true, gatewayToken: token, gatewayBaseUrl: baseUrl });
}

function getSmartStatusPayload() {
  return {
    smart: _smart ? _smart.status() : { enabled: false },
    auth: {
      authServerUrl: CHAT_AUTH_SERVER_URL,
      tokenFile: getBumbeeTokenFilePath(),
    },
    gateway: _gateway ? _gateway.status() : { enabled: false, registered: false },
    clawdbot: _clawdbot ? _clawdbot.status() : { enabled: false, connected: false },
    skills: _skills ? _skills.status() : { enabled: false, count: 0 },
    wiki: _wiki ? _wiki.status() : { enabled: false, folder: getBumbeeWikiFolderPath(), studioFolder: getBumbeeStudioFolderPath() },
  };
}

function getSessionPayload() {
  return Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    state: s.state || "idle",
    agent_id: s.agentId || s.agent_id || "claude-code",
    cwd: s.cwd || "",
    event: s.event || s.lastEvent || null,
    updated_at: s.updatedAt || s.lastUpdate || null,
    host: s.host || null,
    headless: !!s.headless,
  }));
}

// ── Local Agent Dispatch (Codex / Claude Code) ──
const { spawn } = require("child_process");
const _localAgentProcesses = new Map(); // taskId → { proc, output, status, agent }

function findLocalAgent() {
  const candidates = {
    codex: [
      process.env.CODEX_PATH,
      path.join(os.homedir(), ".local", "bin", "codex"),
      "/usr/local/bin/codex",
    ].filter(Boolean),
    claude: [
      process.env.CLAUDE_CODE_PATH,
      path.join(os.homedir(), ".claude", "bin", "claude"),
      "/usr/local/bin/claude",
      // VS Code extension bundled binary (find latest version)
      ...(() => {
        try {
          const extDir = path.join(os.homedir(), ".vscode", "extensions");
          const dirs = fs.readdirSync(extDir).filter(d => d.startsWith("anthropic.claude-code-")).sort().reverse();
          return dirs.map(d => path.join(extDir, d, "resources", "native-binary", "claude"));
        } catch { return []; }
      })(),
      // Claude desktop app
      path.join(os.homedir(), "Library", "Application Support", "Claude", "claude-code-vm"),
    ].filter(Boolean),
  };
  const found = {};
  for (const [name, paths] of Object.entries(candidates)) {
    for (const p of paths) {
      try { if (fs.statSync(p).isFile()) { found[name] = p; break; } } catch {}
    }
  }
  return found;
}

async function dispatchLocalAgent(payload) {
  const { agent, prompt, cwd } = payload || {};
  if (!prompt) return { ok: false, error: "missing prompt" };
  const agents = findLocalAgent();
  const agentName = agent || (agents.codex ? "codex" : agents.claude ? "claude" : null);
  if (!agentName || !agents[agentName]) return { ok: false, error: `${agentName || "No AI agent"} not found on this machine` };

  const taskId = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const agentPath = agents[agentName];
  const files = Array.isArray(payload.files) ? payload.files : [];
  const args = agentName === "codex"
    ? ["exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", ...files.flatMap(f => ["-i", f]), prompt]
    : ["--print", "--dangerously-skip-permissions", ...files.flatMap(f => ["--add-dir", path.dirname(f)]), prompt];
  const workDir = cwd || process.cwd();

  return new Promise((resolve) => {
    let output = "";
    let status = "running";
    const proc = spawn(agentPath, args, {
      cwd: workDir,
      env: { ...process.env, TERM: "dumb" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    });

    _localAgentProcesses.set(taskId, { proc, output: "", status: "running", agent: agentName, prompt, cwd: workDir, startedAt: Date.now() });

    proc.stdout.on("data", (d) => {
      output += d.toString();
      const entry = _localAgentProcesses.get(taskId);
      if (entry) entry.output = output;
    });
    proc.stderr.on("data", (d) => {
      output += d.toString();
      const entry = _localAgentProcesses.get(taskId);
      if (entry) entry.output = output;
    });
    proc.on("close", (code) => {
      status = code === 0 ? "done" : "error";
      const entry = _localAgentProcesses.get(taskId);
      if (entry) { entry.status = status; entry.output = output; entry.exitCode = code; }
      // Notify chat window
      if (chatWin && !chatWin.isDestroyed()) {
        chatWin.webContents.send("local-agent:update", { taskId, status, output: output.slice(-2000), agent: agentName });
      }
    });
    proc.on("error", (err) => {
      status = "error";
      output += `\nProcess error: ${err.message}`;
      const entry = _localAgentProcesses.get(taskId);
      if (entry) { entry.status = status; entry.output = output; }
    });

    resolve({ ok: true, taskId, agent: agentName, cwd: workDir, status: "running" });
  });
}

function getLocalAgentStatus(taskId) {
  if (taskId) {
    const entry = _localAgentProcesses.get(taskId);
    if (!entry) return { ok: false, error: "task not found" };
    return { ok: true, taskId, agent: entry.agent, status: entry.status, output: entry.output.slice(-3000), cwd: entry.cwd };
  }
  // List all
  const tasks = [];
  for (const [id, e] of _localAgentProcesses) {
    tasks.push({ taskId: id, agent: e.agent, status: e.status, prompt: (e.prompt || "").slice(0, 100), cwd: e.cwd, startedAt: e.startedAt });
  }
  return { ok: true, tasks };
}

function stopLocalAgent(taskId) {
  const entry = _localAgentProcesses.get(taskId);
  if (!entry) return { ok: false, error: "task not found" };
  if (entry.status !== "running") return { ok: true, status: entry.status };
  try { entry.proc.kill("SIGTERM"); } catch {}
  entry.status = "stopped";
  return { ok: true, status: "stopped" };
}

// ── Multi-session Chat State (persisted to disk, per-user) ──
const CHAT_HISTORY_DIR = path.join(app.getPath("userData"), "chat-history");
const _chatSessions = new Map();
const MAX_CHAT_SESSIONS = 20;
const MAX_MESSAGES_PER_SESSION = 500;
let _chatUserId = "local"; // default for non-logged-in users

function getChatHistoryPath() {
  const safeId = String(_chatUserId || "local").replace(/[^a-zA-Z0-9._@-]/g, "_").slice(0, 80);
  return path.join(CHAT_HISTORY_DIR, `${safeId}.json`);
}

function setChatUserId(email) {
  const newId = email || "local";
  if (newId === _chatUserId) return;
  saveChatHistory(); // save current user first
  _chatSessions.clear();
  _chatUserId = newId;
  loadChatHistory();
}

function loadChatHistory() {
  try { fs.mkdirSync(CHAT_HISTORY_DIR, { recursive: true }); } catch {}
  try {
    const raw = JSON.parse(fs.readFileSync(getChatHistoryPath(), "utf8"));
    if (raw && typeof raw === "object") {
      for (const [key, session] of Object.entries(raw)) {
        if (session && Array.isArray(session.messages)) {
          session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
          _chatSessions.set(key, session);
        }
      }
    }
  } catch {}
  if (!_chatSessions.has("default")) {
    _chatSessions.set("default", { messages: [], mode: "general", createdAt: Date.now(), title: "Chat 1" });
  }
}

function saveChatHistory() {
  try {
    fs.mkdirSync(CHAT_HISTORY_DIR, { recursive: true });
    const data = {};
    for (const [key, s] of _chatSessions) {
      data[key] = { ...s, messages: (s.messages || []).slice(-MAX_MESSAGES_PER_SESSION) };
    }
    fs.writeFileSync(getChatHistoryPath(), JSON.stringify(data));
  } catch (err) {
    console.warn("Clawd: failed to save chat history:", err.message);
  }
}

function saveChatHistoryDebounced() {
  if (saveChatHistoryDebounced._timer) clearTimeout(saveChatHistoryDebounced._timer);
  saveChatHistoryDebounced._timer = setTimeout(saveChatHistory, 2000);
}

loadChatHistory();

function getChatSessionKey(key) { return key || "default"; }

function ensureChatSession(key) {
  const k = getChatSessionKey(key);
  if (!_chatSessions.has(k)) {
    if (_chatSessions.size >= MAX_CHAT_SESSIONS) {
      return { ok: false, error: `Max ${MAX_CHAT_SESSIONS} sessions reached` };
    }
    _chatSessions.set(k, { messages: [], mode: "general", createdAt: Date.now(), title: `Chat ${_chatSessions.size + 1}` });
    saveChatHistoryDebounced();
  }
  return { ok: true, session: _chatSessions.get(k), key: k };
}

function listChatSessions() {
  const list = [];
  for (const [key, s] of _chatSessions) {
    list.push({ key, title: s.title, mode: s.mode, messageCount: (s.messages || []).length, createdAt: s.createdAt });
  }
  return { ok: true, sessions: list };
}

function createChatSession(payload) {
  const key = `s-${Date.now().toString(36)}`;
  const title = payload?.title || `Chat ${_chatSessions.size + 1}`;
  if (_chatSessions.size >= MAX_CHAT_SESSIONS) return { ok: false, error: `Max ${MAX_CHAT_SESSIONS} sessions` };
  _chatSessions.set(key, { messages: [], mode: payload?.mode || "general", createdAt: Date.now(), title });
  saveChatHistoryDebounced();
  return { ok: true, key, title };
}

function closeChatSession(key) {
  if (key === "default") return { ok: false, error: "cannot close default session" };
  _chatSessions.delete(key);
  saveChatHistoryDebounced();
  return { ok: true };
}

function renameChatSession(key, newTitle) {
  const s = _chatSessions.get(key);
  if (!s) return { ok: false, error: "session not found" };
  s.title = String(newTitle || "").trim().slice(0, 60) || s.title;
  saveChatHistoryDebounced();
  return { ok: true, title: s.title };
}

function appendChatMessage(sessionKey, role, content) {
  const k = getChatSessionKey(sessionKey);
  const s = _chatSessions.get(k);
  if (!s) return;
  s.messages.push({ role, content, ts: Date.now() });
  if (s.messages.length > MAX_MESSAGES_PER_SESSION) s.messages = s.messages.slice(-MAX_MESSAGES_PER_SESSION);
  saveChatHistoryDebounced();
}

function getChatSessionMessages(sessionKey) {
  const k = getChatSessionKey(sessionKey);
  const s = _chatSessions.get(k);
  return { ok: true, key: k, messages: s ? s.messages : [] };
}

async function sendBumbeeChat(payload) {
  if (!_smart) return { ok: false, error: "Bumbee smart layer is not available yet" };
  const query = typeof payload?.query === "string" ? payload.query.trim() : "";
  if (!query) return { ok: false, error: "missing query" };
  const mode = typeof payload?.mode === "string" ? payload.mode : "general";
  const baseContext = payload?.context && typeof payload.context === "object" ? payload.context : {};
  const context = {
    ...baseContext,
    source: baseContext.source || "clawd-on-desk",
    device_id: baseContext.device_id || CHAT_DEVICE_ID,
    session_id: baseContext.session_id || CHAT_SESSION_ID,
  };
  try {
    const result = await _smart.chat({
      mode,
      query,
      context,
    });
    return { ok: true, mode, ...result };
  } catch (err) {
    return { ok: false, mode, error: err.message };
  }
}

function defaultVocabDb() {
  return {
    version: STARTER_VOCAB_VERSION,
    updated_at: new Date().toISOString(),
    settings: {
      nativeLanguage: "vi",
      targetLanguage: "en",
      goal: "business conversation",
      dailyWords: 8,
      difficulty: "medium",
      monthlyReset: false,
    },
    last_reset_month: new Date().toISOString().slice(0, 7),
    words: [],
  };
}

function readVocabDb() {
  try {
    const data = JSON.parse(fs.readFileSync(VOCAB_DB_PATH, "utf8"));
    let db = {
      ...defaultVocabDb(),
      ...data,
      settings: { ...defaultVocabDb().settings, ...(data.settings || {}) },
      words: Array.isArray(data.words) ? data.words : [],
    };
    db = ensureStarterVocab(db);
    const thisMonth = new Date().toISOString().slice(0, 7);
    if (db.settings.monthlyReset !== false && db.last_reset_month !== thisMonth) {
      for (const item of db.words) {
        item.score = 0;
        item.streak = 0;
        item.mastered = false;
        item.next_review = new Date().toISOString();
        item.updated_at = new Date().toISOString();
      }
      db.last_reset_month = thisMonth;
      writeVocabDb(db);
    } else if ((Number(data.version) || 1) < STARTER_VOCAB_VERSION) {
      writeVocabDb(db);
    }
    return db;
  } catch {
    return ensureStarterVocab(defaultVocabDb());
  }
}

function writeVocabDb(db) {
  const next = { ...db, updated_at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(VOCAB_DB_PATH), { recursive: true });
  fs.writeFileSync(VOCAB_DB_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  try { fs.chmodSync(VOCAB_DB_PATH, 0o600); } catch {}
  return next;
}

function normalizeVocabTerm(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[A-Za-z][A-Za-z ]{1,24}:\s+/, "")
    .replace(/^[,.;:!?'"`]+|[,.;:!?'"`]+$/g, "")
    .slice(0, 90);
}

function extractVocabTerms(input) {
  const text = String(input || "");
  const explicit = text
    .split(/[\n,;|]+/)
    .map(normalizeVocabTerm)
    .filter((term) => term.length >= 2 && term.length <= 90);
  if (explicit.length > 1) return Array.from(new Set(explicit)).slice(0, 60);

  const matches = text.match(/[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,3}/g) || [];
  const stop = new Set(["the", "and", "for", "you", "with", "that", "this", "from", "have", "will", "are", "was", "were", "been"]);
  return Array.from(new Set(matches
    .map(normalizeVocabTerm)
    .filter((term) => term.length >= 3 && !stop.has(term.toLowerCase()))))
    .slice(0, 30);
}

function cloneLessonTemplate(template) {
  return {
    meaning_en: String(template.meaning || "").trim(),
    meaning_vi: "",
    pronunciation: "",
    examples: (Array.isArray(template.examples) ? template.examples : []).map(String).filter(Boolean).slice(0, 6),
    collocations: (Array.isArray(template.collocations) ? template.collocations : []).map(String).filter(Boolean).slice(0, 8),
    quiz: [],
  };
}

function knownFallbackLesson(term) {
  const key = normalizeVocabTerm(term).toLowerCase();
  const template = ENGLISH_LESSON_LIBRARY[key] || STARTER_VOCAB.find((item) => item.term.toLowerCase() === key);
  if (!template) return null;
  const lesson = cloneLessonTemplate(template);
  lesson.quiz = [
    { type: "recall", prompt: `Say one natural sentence with "${term}".`, answer: lesson.examples[0] || term },
    { type: "meaning", prompt: `What does "${term}" mean in this context?`, answer: lesson.meaning_en },
  ];
  return lesson;
}

function fallbackLesson(term, settings) {
  const goal = settings.goal || "daily conversation";
  const known = knownFallbackLesson(term);
  if (known) return known;
  return {
    meaning_en: `A useful English expression for ${goal}; learn the exact meaning before using it in a real conversation.`,
    meaning_vi: "",
    pronunciation: "",
    examples: [
      `I want to use "${term}" correctly in a real conversation.`,
      `Let's check the context before we use "${term}".`,
      `Can you give me a natural example with "${term}"?`,
    ],
    collocations: [`use "${term}" correctly`, `practice "${term}" in context`, `say "${term}" clearly`],
    quiz: [
      { type: "recall", prompt: `Say one natural English sentence with "${term}".`, answer: term },
      { type: "meaning", prompt: `What situation is "${term}" useful for?`, answer: goal },
    ],
  };
}

function normalizeStoredLesson(term, lesson, settings) {
  const next = lesson && typeof lesson === "object" ? { ...lesson } : fallbackLesson(term, settings);
  const oldMeaning = String(next.meaning_en || next.meaning || next.meaning_vi || "");
  const genericMeaning = /^Từ\/cụm từ cần học trong ngữ cảnh:|^Cụm từ cần luyện trong ngữ cảnh|^A phrase to practi[cs]e in |^A useful English expression for |^Use this naturally in a real conversation/i.test(oldMeaning);
  const hasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(oldMeaning);
  next.meaning_en = String(next.meaning_en || next.meaning || "")
    .replace(/^(IELTS|Work|Funny|Social|Sales|Product|Operations):\s*/i, "")
    .trim();
  if (!next.meaning_en || genericMeaning || hasVietnamese) next.meaning_en = fallbackLesson(term, settings).meaning_en;
  next.meaning_vi = "";

  const cleanExamples = (Array.isArray(next.examples) ? next.examples : [])
    .map((item) => String(item || "").trim())
    .filter((item) => item && !/^Can you explain|^Can you make|^Use ".+" in a|^Let's practice/i.test(item));
  const genericExamples = cleanExamples.filter((item) => {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^I want to use ["']?${escapedTerm}["']? naturally in a real conversation\\.?$`, "i").test(item)
      || new RegExp(`^I want to use ["']?${escapedTerm}["']? correctly in a real conversation\\.?$`, "i").test(item)
      || new RegExp(`^This phrase helps me explain my idea more clearly:\\s*["']?${escapedTerm}["']?\\.?$`, "i").test(item)
      || new RegExp(`^Let's use ["']?${escapedTerm}["']? when we talk about the next step\\.?$`, "i").test(item)
      || new RegExp(`^Let's check the context before we use ["']?${escapedTerm}["']?\\.?$`, "i").test(item)
      || new RegExp(`^Can you give me a natural example with ["']?${escapedTerm}["']?\\??$`, "i").test(item);
  });
  next.examples = cleanExamples.length >= 2 && genericExamples.length === 0
    ? cleanExamples.slice(0, 6)
    : fallbackLesson(term, settings).examples;

  const cleanCollocations = (Array.isArray(next.collocations) ? next.collocations : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  next.collocations = cleanCollocations.length ? cleanCollocations.slice(0, 8) : fallbackLesson(term, settings).collocations;
  next.quiz = Array.isArray(next.quiz) ? next.quiz : fallbackLesson(term, settings).quiz;
  return next;
}

function normalizeStoredVocabItem(word, settings) {
  const term = normalizeVocabTerm(word?.term || "");
  if (!term) return word;
  return {
    ...word,
    term,
    category: word.category || "General",
    level: VOCAB_DIFFICULTY_RULES[word.level] ? word.level : (settings.difficulty || "medium"),
    lesson: normalizeStoredLesson(term, word.lesson, settings),
  };
}

async function enrichVocabTerm(term, settings, sourceNote) {
  const lesson = fallbackLesson(term, settings);
  if (!_smart) return lesson;
  try {
    const result = await _smart.chat({
      mode: "english",
      query: [
        "Create a compact vocabulary learning card as strict JSON only.",
        `Target language: ${settings.targetLanguage || "en"}. Native language: ${settings.nativeLanguage || "vi"}.`,
        `Learning goal: ${settings.goal || "business conversation"}. Difficulty: ${settings.difficulty || "medium"}.`,
        `Term: ${term}`,
        sourceNote ? `Source note: ${sourceNote.slice(0, 500)}` : "",
        "Return professional learning content. Do not create silly distractors. Examples must be natural full English sentences.",
        "JSON shape: {\"meaning_en\":\"...\",\"meaning_vi\":\"nghĩa tiếng Việt ngắn gọn, tự nhiên\",\"pronunciation\":\"...\",\"examples\":[\"easy sentence\",\"work sentence\",\"hard sentence\"],\"collocations\":[\"common phrase\",\"common phrase\"],\"quiz\":[{\"type\":\"recall\",\"prompt\":\"...\",\"answer\":\"...\"},{\"type\":\"fill_blank\",\"prompt\":\"...\",\"answer\":\"...\"}]}",
      ].filter(Boolean).join("\n"),
      context: {
        source: "bumbee-english-vocab",
        device_id: CHAT_DEVICE_ID,
        session_id: CHAT_SESSION_ID,
      },
    });
    const raw = String(result.answer || result.reply || "").trim();
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
    const parsed = jsonText ? JSON.parse(jsonText) : null;
    if (!parsed || typeof parsed !== "object") return lesson;
    return {
      meaning_en: String(parsed.meaning_en || parsed.meaning || lesson.meaning_en).slice(0, 500),
      meaning_vi: String(parsed.meaning_vi || "").slice(0, 300),
      pronunciation: String(parsed.pronunciation || "").slice(0, 120),
      examples: Array.isArray(parsed.examples) ? parsed.examples.slice(0, 6).map((x) => String(x).slice(0, 240)) : lesson.examples,
      collocations: Array.isArray(parsed.collocations) ? parsed.collocations.slice(0, 8).map((x) => String(x).slice(0, 120)) : lesson.collocations,
      quiz: Array.isArray(parsed.quiz) ? parsed.quiz.slice(0, 6).map((q) => ({
        type: String(q.type || "recall").slice(0, 40),
        prompt: String(q.prompt || "").slice(0, 260),
        answer: String(q.answer || "").slice(0, 180),
      })).filter((q) => q.prompt) : lesson.quiz,
    };
  } catch {
    return lesson;
  }
}

async function addVocabItems(payload) {
  const db = readVocabDb();
  const source = String(payload?.source || "manual").slice(0, 80);
  const sourceNote = String(payload?.text || payload?.note || "").trim();
  const rawTerms = Array.isArray(payload?.terms) ? payload.terms : extractVocabTerms(sourceNote);
  const terms = Array.from(new Set(rawTerms.map(normalizeVocabTerm).filter(Boolean))).slice(0, 60);
  const existing = new Map(db.words.map((item) => [item.term.toLowerCase(), item]));
  const created = [];
  const items = [];
  for (const term of terms) {
    const key = term.toLowerCase();
    if (existing.has(key)) {
      const current = existing.get(key);
      current.updated_at = new Date().toISOString();
      current.sources = Array.from(new Set([...(current.sources || []), source])).slice(0, 8);
      items.push(current);
      continue;
    }
    const lesson = await enrichVocabTerm(term, db.settings, sourceNote);
    const item = {
      id: `vocab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      term,
      score: 0,
      streak: 0,
      mistake_count: 0,
      review_count: 0,
      mastered: false,
      level: db.settings.difficulty || "medium",
      sources: [source],
      lesson,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_reviewed: null,
      next_review: new Date().toISOString(),
    };
    db.words.unshift(item);
    existing.set(key, item);
    created.push(item);
    items.push(item);
  }
  writeVocabDb(db);
  return { ok: true, created, items, total: db.words.length, db };
}

function listVocabItems() {
  const db = readVocabDb();
  return { ok: true, dbPath: VOCAB_DB_PATH, settings: db.settings, words: db.words };
}

function reviewVocabItem(payload) {
  const db = readVocabDb();
  const id = String(payload?.id || "");
  const correct = !!payload?.correct;
  const item = db.words.find((word) => word.id === id);
  if (!item) return { ok: false, error: "word_not_found" };
  item.review_count = (item.review_count || 0) + 1;
  item.last_reviewed = new Date().toISOString();
  item.streak = correct ? (item.streak || 0) + 1 : 0;
  item.mistake_count = correct ? (item.mistake_count || 0) : (item.mistake_count || 0) + 1;
  if (!VOCAB_DIFFICULTY_RULES[item.level]) item.level = db.settings.difficulty || "medium";
  const rules = getVocabDifficultyRules(item.level);
  item.score = Math.max(0, Math.min(100, (item.score || 0) + (correct ? rules.gain : -rules.loss)));
  item.mastered = item.score >= rules.masterScore && item.streak >= rules.masterStreak;
  const delayHours = correct ? Math.min(168, rules.correctHourBase * Math.max(1, item.streak)) : rules.wrongHours;
  item.next_review = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
  item.updated_at = new Date().toISOString();
  writeVocabDb(db);
  return { ok: true, item, settings: db.settings, words: db.words };
}

function resetVocabScores() {
  const db = readVocabDb();
  for (const item of db.words) {
    item.score = 0;
    item.streak = 0;
    item.mastered = false;
    item.next_review = new Date().toISOString();
    item.updated_at = new Date().toISOString();
  }
  writeVocabDb(db);
  return { ok: true, settings: db.settings, words: db.words };
}

function updateVocabSettings(payload) {
  const db = readVocabDb();
  const nextDifficulty = ["easy", "medium", "hard", "expert"].includes(payload?.difficulty) ? payload.difficulty : db.settings.difficulty;
  db.settings = {
    ...db.settings,
    nativeLanguage: String(payload?.nativeLanguage || db.settings.nativeLanguage || "vi").slice(0, 20),
    targetLanguage: String(payload?.targetLanguage || db.settings.targetLanguage || "en").slice(0, 20),
    goal: String(payload?.goal || db.settings.goal || "business conversation").slice(0, 180),
    dailyWords: Math.max(1, Math.min(60, Number.parseInt(payload?.dailyWords || db.settings.dailyWords || 8, 10))),
    difficulty: nextDifficulty,
    monthlyReset: payload?.monthlyReset === undefined ? db.settings.monthlyReset : !!payload.monthlyReset,
  };
  for (const item of db.words) {
    if (!item.mastered) {
      item.level = nextDifficulty;
      item.updated_at = new Date().toISOString();
    }
  }
  writeVocabDb(db);
  return { ok: true, settings: db.settings, words: db.words };
}

function emitSemanticEvent(type, payload = {}) {
  const event = {
    type,
    ts: new Date().toISOString(),
    payload: payload && typeof payload === "object" ? payload : { value: payload },
  };
  try {
    const router = require("./bumbee-event-router");
    router.ensureDefaultRouter(EVENT_ROUTER_PATH);
    const reactions = router.routeEvent(router.loadRouter(EVENT_ROUTER_PATH), event);
    router.writeReactions(AVATAR_REACTIONS_PATH, reactions);
  } catch (err) {
    console.warn("Bumbee event router failed:", err.message);
  }
  const line = `${JSON.stringify(event)}\n`;
  fs.mkdirSync(path.dirname(EVENTS_JSONL_PATH), { recursive: true });
  let fallbackWritten = false;
  const writeFallback = () => {
    if (fallbackWritten) return;
    fallbackWritten = true;
    fs.appendFile(EVENTS_JSONL_PATH, line, () => {});
  };

  if (fs.existsSync(EVENTS_SOCK_PATH)) {
    const client = net.createConnection(EVENTS_SOCK_PATH);
    client.setTimeout(250);
    client.on("connect", () => {
      client.end(line);
    });
    client.on("timeout", () => {
      client.destroy();
      writeFallback();
    });
    client.on("error", writeFallback);
    return { ok: true, target: "socket", event };
  }

  writeFallback();
  return { ok: true, target: "jsonl", event };
}

function loadDonationSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(DONATION_SETTINGS_PATH, "utf8"));
    return {
      creator_donation_url: String(data.creator_donation_url || ""),
      creator_display_name: String(data.creator_display_name || ""),
      creator_donation_intent: String(data.creator_donation_intent || ""),
    };
  } catch {
    return { creator_donation_url: "", creator_display_name: "", creator_donation_intent: "" };
  }
}

function validateDonationUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, empty: true, url: "" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "https_required" };
  if (!DONATION_ALLOWED_HOSTS.some((rule) => rule.test(url.host))) {
    return { ok: false, error: "host_not_allowed" };
  }
  if (
    /^bitdancegroup\.com$/i.test(url.host) &&
    !(
      url.pathname.startsWith("/payment/") ||
      url.pathname.startsWith("/shop/") ||
      url.pathname.startsWith("/bumbee-vocab-tinder")
    )
  ) {
    return { ok: false, error: "bitdance_path_not_allowed" };
  }
  return { ok: true, url: url.toString() };
}

function saveDonationSettings(payload = {}) {
  const current = loadDonationSettings();
  const checkedUrl = validateDonationUrl(payload.creator_donation_url);
  if (!checkedUrl.ok) return { ok: false, error: checkedUrl.error };
  const next = {
    ...current,
    creator_donation_url: checkedUrl.empty ? "" : checkedUrl.url.slice(0, 500),
    creator_display_name: String(payload.creator_display_name || "").trim().slice(0, 80),
    creator_donation_intent: String(payload.creator_donation_intent || "").trim().slice(0, 240),
    updated_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(DONATION_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(DONATION_SETTINGS_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  try { fs.chmodSync(DONATION_SETTINGS_PATH, 0o600); } catch {}
  return { ok: true, settings: next };
}

function extractVocabCandidates(text) {
  const { extract } = require("./vocab-extractor");
  const { listLibrary } = require("./vocab-library");
  const knownWords = new Set(listLibrary().map(item => String(item.word || "").toLowerCase()).filter(Boolean));
  return extract(String(text || ""), { source_app: "Bumbee Vocab Tinder", knownWords });
}

async function syncStudioAfterVocabChange() {
  if (!_wiki || typeof _wiki.syncStudio !== "function") return { ok: false, skipped: true, reason: "wiki_unavailable" };
  try {
    return await _wiki.syncStudio({ force: true, register: false });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function recordVocabSwipe(payload = {}) {
  const action = String(payload.action || "").toLowerCase();
  const word = normalizeVocabTerm(payload.word || "");
  if (!word) return { ok: false, error: "missing_word" };
  if (!["keep", "skip", "known"].includes(action)) return { ok: false, error: "invalid_action" };
  if (action === "skip") {
    emitSemanticEvent("vocab.swipe.skipped", { word });
    return { ok: true, action, skipped: true };
  }

  const { upsertWord } = require("./vocab-library");
  const sm2 = require("./sm2");
  const sm2State = action === "known" ? sm2.update({ repetition: 2, interval_days: 6 }, 5) : {};
  const result = upsertWord({
    word,
    ipa: payload.ipa || "",
    context: String(payload.context || "").slice(0, 1000),
    source_app: String(payload.source_app || "Bumbee Vocab Tinder").slice(0, 120),
    status: action === "known" ? "known" : "kept",
    sm2: sm2State,
  });
  const library = require("./vocab-library");
  const streak = library.getStreakDays(library.listLibrary());
  emitSemanticEvent(action === "known" ? "vocab.swipe.known" : "vocab.swipe.kept", {
    word,
    source_app: String(payload.source_app || "Bumbee Vocab Tinder").slice(0, 120),
  });
  if (streak.days > 0 && streak.today_count === 1 && action !== "known") {
    emitSemanticEvent("vocab.streak.day", { day_count: streak.days });
  }
  const sync = await syncStudioAfterVocabChange();
  return { ok: true, action, word, page: result.path, streak, sync };
}

function buildHeuristicReviewTask(item) {
  return {
    word: item.word,
    prompt: `Type the word that fits this context: ${item.context_sentence || item.word}`,
    answer: item.word,
    expected: item.word,
    kind: "recall-from-context",
    context: item.context_sentence || "",
    source_app: item.source_app || "Bumbee Vocab Tinder",
    sm2: {
      ease_factor: Number(item.ease_factor) || 2.5,
      interval_days: Number(item.interval_days) || 0,
      repetition: Number(item.repetition) || 0,
    },
  };
}

async function callProxyCliJson(prompt, timeoutMs = 8000) {
  if (!PROXYCLI_CHAT_URL) return null;
  const endpoint = PROXYCLI_CHAT_URL.endsWith("/chat/completions")
    ? PROXYCLI_CHAT_URL
    : `${PROXYCLI_CHAT_URL}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { "Content-Type": "application/json" };
    if (PROXYCLI_API_KEY) headers.Authorization = `Bearer ${PROXYCLI_API_KEY}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: PROXYCLI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return strict JSON only. No markdown." },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`proxycli_http_${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || data?.content || "";
    if (!content) return null;
    return typeof content === "string" ? JSON.parse(content) : content;
  } catch (err) {
    console.warn("Bumbee Vocab: proxycli JSON call failed:", err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function buildLlmReviewTask(item) {
  const context = String(item.context_sentence || item.word || "").slice(0, 500);
  const prompt = [
    "Cho từ tiếng Anh và câu ngữ cảnh người dùng đã thấy.",
    "Hãy sinh 1 bài ôn tập ngắn dạng fill-blank hoặc recall-from-definition.",
    "Trả về JSON đúng dạng:",
    '{"kind":"fill-blank|recall-from-definition","prompt":"...","expected":"...","hint":"..."}',
    `Word: ${item.word}`,
    `Context: ${context}`,
  ].join("\n");
  const generated = await callProxyCliJson(prompt);
  if (!generated?.prompt || !generated?.expected) return null;
  return {
    ...buildHeuristicReviewTask(item),
    kind: String(generated.kind || "llm-review").slice(0, 80),
    prompt: String(generated.prompt || "").slice(0, 600),
    answer: String(generated.expected || item.word).slice(0, 120),
    expected: String(generated.expected || item.word).slice(0, 120),
    hint: String(generated.hint || "").slice(0, 240),
    generated_by: "proxycli",
  };
}

async function getVocabReviewTasks() {
  const { listLibrary } = require("./vocab-library");
  const sm2 = require("./sm2");
  const due = sm2.dueWords(listLibrary()).slice(0, 7);
  const tasks = [];
  for (const item of due) {
    const llmTask = tasks.length < 5 ? await buildLlmReviewTask(item) : null;
    tasks.push(llmTask || buildHeuristicReviewTask(item));
  }
  return tasks;
}

function normalizeReviewText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s'-]/gu, "")
    .replace(/\s+/g, " ");
}

async function gradeVocabReview(payload = {}) {
  const task = payload.task || {};
  const expected = normalizeReviewText(task.expected || task.answer || task.word || "");
  const answer = normalizeReviewText(payload.answer || "");
  let correct = !!expected && answer === expected;
  let hint = task.hint || "";
  if (PROXYCLI_CHAT_URL && expected && answer) {
    const prompt = [
      "Chấm câu trả lời ôn từ vựng tiếng Anh.",
      "Đúng nếu answer trùng nghĩa hoặc chấp nhận biến thể nhỏ của expected.",
      "Trả về JSON đúng dạng: {\"correct\":true|false,\"hint\":\"gợi ý tiếng Việt ngắn\"}",
      `Prompt: ${task.prompt || ""}`,
      `Expected: ${expected}`,
      `Answer: ${answer}`,
    ].join("\n");
    const graded = await callProxyCliJson(prompt, 6000);
    if (typeof graded?.correct === "boolean") {
      correct = graded.correct;
      hint = String(graded.hint || hint || "").slice(0, 240);
    }
  }
  const sm2 = require("./sm2");
  const { upsertWord } = require("./vocab-library");
  const nextSm2 = sm2.update(task.sm2 || {}, correct ? 4 : 2);
  const result = upsertWord({
    word: expected || task.word,
    context: task.context || task.prompt || "",
    source_app: task.source_app || "Bumbee Vocab Tinder review",
    status: nextSm2.mastery_score >= 5 ? "mastered" : "kept",
    sm2: nextSm2,
  });
  emitSemanticEvent(correct ? "vocab.review.correct" : "vocab.review.wrong", {
    word: expected || task.word || "",
    task_kind: task.kind || "review",
    expected,
    got: answer,
  });
  if (nextSm2.mastery_score >= 5) {
    emitSemanticEvent("vocab.word.mastered", { word: expected || task.word || "" });
  }
  const sync = await syncStudioAfterVocabChange();
  return { ok: true, correct, hint, word: expected, sm2: nextSm2, page: result.path, sync, dashboard: getVocabDashboard() };
}

function getVocabDashboard() {
  const metrics = require("./vocab-metrics");
  const library = require("./vocab-library").listLibrary();
  return metrics.buildDashboard(library, metrics.loadMetrics(VOCAB_METRICS_PATH));
}

async function openBumbeeDonate() {
  const { shell } = require("electron");
  const metrics = require("./vocab-metrics");
  const creator = loadDonationSettings().creator_donation_url;
  const checkedCreator = validateDonationUrl(creator);
  metrics.recordSupportClick(VOCAB_METRICS_PATH);
  if (checkedCreator.ok && checkedCreator.url) {
    await shell.openExternal(checkedCreator.url);
    return {
      ok: true,
      url: checkedCreator.url,
      source: "creator",
      dashboard: getVocabDashboard(),
      message: "Bumbee đã mở link ủng hộ riêng của bạn. Sau khi khách thanh toán, bạn có thể kiểm tra đơn trong dashboard.",
    };
  }
  try {
    await shell.openExternal(DEFAULT_DONATION_URL);
    return {
      ok: true,
      url: DEFAULT_DONATION_URL,
      source: "bitdancegroup",
      dashboard: getVocabDashboard(),
      message: "Bumbee đã mở checkout BitDance. Nếu khách thanh toán xong, dùng nút kiểm tra đơn để xác nhận và ghi event donation.",
    };
  } catch (err) {
    const fallback = "https://buymeacoffee.com/chrispham";
    await shell.openExternal(fallback);
    return {
      ok: false,
      fallback: true,
      url: fallback,
      error: err.message,
      dashboard: getVocabDashboard(),
      message: "Checkout BitDance chưa mở được nên Bumbee chuyển sang Buy Me a Coffee fallback.",
    };
  }
}

async function checkDonationStatus(payload = {}) {
  const metrics = require("./vocab-metrics");
  const orderId = String(payload.order_id || payload.orderId || "").trim();
  if (!orderId) return { ok: false, error: "missing_order_id", dashboard: getVocabDashboard() };
  metrics.recordDonationCheck(VOCAB_METRICS_PATH);
  const url = new URL(DONATION_STATUS_URL);
  url.searchParams.set("order_id", orderId);
  try {
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`donation_status_http_${res.status}`);
    const status = metrics.normalizeDonationStatus(await res.json());
    status.order_id = status.order_id || orderId;
    if (status.confirmed) {
      const recorded = metrics.recordConfirmedDonation(VOCAB_METRICS_PATH, status.order_id);
      emitSemanticEvent("business.donation.confirmed", {
        order_id: status.order_id,
        amount_vnd: status.amount_vnd,
        donor_name: status.donor_name,
      });
      if (recorded.firstDonation) {
        emitSemanticEvent("business.first_donation", {
          order_id: status.order_id,
          amount_vnd: status.amount_vnd,
        });
      }
      return { ...status, dashboard: getVocabDashboard() };
    }
    return { ...status, dashboard: getVocabDashboard() };
  } catch (err) {
    return { ok: false, error: err.message, dashboard: getVocabDashboard() };
  }
}

function getChatBoundsNearPet(width, height) {
  const fallbackPoint = screen.getCursorScreenPoint();
  const petBounds = win && !win.isDestroyed() ? win.getBounds() : null;
  const display = petBounds
    ? screen.getDisplayNearestPoint({
        x: Math.round(petBounds.x + petBounds.width / 2),
        y: Math.round(petBounds.y + petBounds.height / 2),
      })
    : screen.getDisplayNearestPoint(fallbackPoint);
  const { workArea } = display;
  const margin = 16;
  if (!petBounds) {
    return {
      x: Math.round(workArea.x + workArea.width - width - 28),
      y: Math.round(workArea.y + workArea.height - height - 28),
    };
  }

  let x = Math.round(petBounds.x + petBounds.width + margin);
  if (x + width > workArea.x + workArea.width - margin) {
    x = Math.round(petBounds.x - width - margin);
  }
  if (x < workArea.x + margin) {
    x = Math.round(workArea.x + workArea.width - width - margin);
  }

  const anchorY = Math.round(petBounds.y + petBounds.height - height);
  const y = Math.max(
    workArea.y + margin,
    Math.min(anchorY, workArea.y + workArea.height - height - margin),
  );
  return { x, y };
}

function positionBumbeeChat() {
  if (!chatWin || chatWin.isDestroyed()) return;
  const bounds = chatWin.getBounds();
  const next = getChatBoundsNearPet(bounds.width || 440, bounds.height || 660);
  chatWin.setBounds({ ...bounds, ...next });
}

function clearChatAutoHide() {
  if (chatAutoHideTimer) {
    clearTimeout(chatAutoHideTimer);
    chatAutoHideTimer = null;
  }
}

function isChatActivityBlockingHide() {
  return !!(
    chatActivityState.typing ||
    chatActivityState.camera ||
    chatActivityState.voice ||
    chatActivityState.pending
  );
}

function scheduleChatAutoHide(delayMs = CHAT_AUTO_HIDE_MS) {
  clearChatAutoHide();
  if (!chatWin || chatWin.isDestroyed() || !chatWin.isVisible()) return;
  chatAutoHideTimer = setTimeout(() => {
    chatAutoHideTimer = null;
    if (!chatWin || chatWin.isDestroyed() || !chatWin.isVisible() || chatWin.isFocused()) return;
    if (isChatActivityBlockingHide()) {
      scheduleChatAutoHide(5000);
      return;
    }
    chatWin.hide();
  }, Math.max(1000, delayMs));
}

function updateBumbeeChatActivity(payload) {
  chatActivityState = {
    ...chatActivityState,
    typing: !!payload?.typing,
    camera: !!payload?.camera,
    voice: !!payload?.voice,
    pending: !!payload?.pending,
  };
  if (chatWin && !chatWin.isDestroyed() && chatWin.isVisible() && !chatWin.isFocused()) {
    if (isChatActivityBlockingHide()) clearChatAutoHide();
    else scheduleChatAutoHide();
  }
}

function openBumbeeChat() {
  if (chatWin && !chatWin.isDestroyed()) {
    clearChatAutoHide();
    if (!chatWin.isVisible()) positionBumbeeChat();
    chatWin.show();
    chatWin.focus();
    return;
  }

  const width = 460;
  const height = 740;
  const bounds = getChatBoundsNearPet(width, height);
  chatWin = new BrowserWindow({
    width,
    height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 380,
    minHeight: 560,
    title: "Bumbee English Coach",
    show: false,
    backgroundColor: "#111318",
    webPreferences: {
      preload: path.join(__dirname, "preload-chat.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  chatWin.loadFile(path.join(__dirname, "bumbee-chat.html"));
  chatWin.once("ready-to-show", () => {
    if (chatWin && !chatWin.isDestroyed()) chatWin.show();
  });
  chatWin.on("focus", clearChatAutoHide);
  chatWin.on("blur", () => scheduleChatAutoHide());
  chatWin.on("closed", () => {
    clearChatAutoHide();
    chatActivityState = { typing: false, camera: false, voice: false, pending: false };
    chatWin = null;
  });
}

function openBumbeeVision() {
  if (visionWin && !visionWin.isDestroyed()) {
    visionWin.show();
    visionWin.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1180, Math.max(860, primary.width - 120));
  const height = Math.min(820, Math.max(620, primary.height - 100));
  visionWin = new BrowserWindow({
    width,
    height,
    minWidth: 760,
    minHeight: 560,
    title: "Bumbee Vision",
    show: false,
    backgroundColor: "#0f1117",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  visionWin.loadURL(BUMBEE_VISION_URL);
  visionWin.once("ready-to-show", () => {
    if (visionWin && !visionWin.isDestroyed()) visionWin.show();
  });
  visionWin.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedVisionUrl(url)) return { action: "allow" };
    return { action: "deny" };
  });
  visionWin.on("closed", () => {
    visionWin = null;
  });
}

function openVocabTinder() {
  if (vocabWin && !vocabWin.isDestroyed()) {
    vocabWin.show();
    vocabWin.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay().workArea;
  vocabWin = new BrowserWindow({
    width: Math.min(920, Math.max(760, primary.width - 180)),
    height: Math.min(760, Math.max(620, primary.height - 140)),
    minWidth: 700,
    minHeight: 560,
    title: "Bumbee Vocab Tinder",
    show: false,
    backgroundColor: "#10151f",
    webPreferences: {
      preload: path.join(__dirname, "preload-vocab.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  vocabWin.loadFile(path.join(__dirname, "vocab-tinder.html"));
  vocabWin.once("ready-to-show", () => {
    if (vocabWin && !vocabWin.isDestroyed()) vocabWin.show();
  });
  vocabWin.on("closed", () => {
    vocabWin = null;
  });
}

// ── Vocab auto-challenge popup (Phase 1) ─────────────────────────────────────
// Reuses the bumbee-english-vocab.json store + english-game-core.buildGameRound.
function pickDueVocab(db, now, strict) {
  const words = (db.words || []).filter((w) => w && !w.mastered && String(w.term || "").trim());
  if (!words.length) return null;
  const due = words.filter((w) => !w.next_review || new Date(w.next_review).getTime() <= now);
  const pool = due.length ? due : (strict ? [] : words);
  if (!pool.length) return null;
  pool.sort((a, b) => {
    const at = a.next_review ? new Date(a.next_review).getTime() : 0;
    const bt = b.next_review ? new Date(b.next_review).getTime() : 0;
    return at - bt || (a.score || 0) - (b.score || 0);
  });
  return pool[0];
}

function countDueVocab(db, now) {
  return (db.words || []).filter(
    (w) => w && !w.mastered && (!w.next_review || new Date(w.next_review).getTime() <= now),
  ).length;
}

function buildChallengeRound(opts = {}) {
  const core = require("./english-game-core");
  const db = readVocabDb();
  const now = Date.now();
  const word = pickDueVocab(db, now, !!opts.strict);
  if (!word) return null;
  const reverse = opts.reverse === undefined ? vocabReverseMode : !!opts.reverse;
  const gameType = ["mix", "sentence", "vocab"].includes(opts.gameType) ? opts.gameType : vocabGameType;
  const index = Number(word.review_count) || 0;
  // vocab → word-pick rounds (choices are English terms); sentence → sentence rounds; mix → default rotation
  // (game chọn từ vựng có khung RIÊNG chạy song song — xem buildWordMemoryRound)
  let forcedMode = null;
  if (gameType === "vocab") forcedMode = index % 2 ? "fill" : "vi2en";
  else if (gameType === "sentence") forcedMode = index % 2 ? "dialogue" : "translate";
  else if (reverse) forcedMode = "vi2en";
  const round = core.buildGameRound(word, db.words, forcedMode ? { index, mode: forcedMode } : { index });
  if (!round) return null;
  return {
    ok: true,
    round,
    word: {
      id: word.id, term: word.term, level: word.level, score: word.score || 0,
      // dữ liệu cho thẻ "Từ vựng" recap sau khi trả lời (không đưa lên UI trước khi trả lời!)
      meaning_vi: word.lesson?.meaning_vi || "",
      meaning_en: core.getMeaning(word),
      pronunciation: word.lesson?.pronunciation || "",
      example: core.getExamples(word)[0] || "",
    },
    player: core.getPlayerLevel(db.words),
    dueCount: countDueVocab(db, now),
  };
}

// ── Game từ vựng "siêu trí nhớ" (khung riêng, chạy song song game câu) ──────
// Nhìn nghĩa → chọn từ đúng. Ưu tiên từ đến hạn ôn, tránh trùng từ của game câu.
function buildWordMemoryRound(opts = {}) {
  const core = require("./english-game-core");
  const db = readVocabDb();
  const excludeId = String(opts.excludeId || "");
  const pool = (db.words || []).filter((w) => w && !w.mastered && String(w.term || "").trim() && w.id !== excludeId);
  if (!pool.length) return null;
  const now = Date.now();
  const due = pool.filter((w) => !w.next_review || new Date(w.next_review).getTime() <= now);
  const pick = (due.length ? due : pool).sort((a, b) => {
    const at = a.next_review ? new Date(a.next_review).getTime() : 0;
    const bt = b.next_review ? new Date(b.next_review).getTime() : 0;
    return at - bt || (a.score || 0) - (b.score || 0);
  })[0];
  const round = core.buildGameRound(pick, db.words, { mode: "vi2en", index: Number(pick.review_count) || 0 });
  if (!round) return null;
  return {
    ok: true,
    round,
    word: {
      id: pick.id, term: pick.term, score: pick.score || 0, streak: pick.streak || 0,
      meaning_vi: pick.lesson?.meaning_vi || "",
      meaning_en: core.getMeaning(pick),
      pronunciation: pick.lesson?.pronunciation || "",
      example: core.getExamples(pick)[0] || "",
    },
  };
}

// ── Gợi ý cụm giao tiếp mới: lấy collocation/câu ví dụ từ kho, xoay vòng ──
let _suggestCursor = 0;
function buildPhraseSuggestion() {
  const core = require("./english-game-core");
  const db = readVocabDb();
  const cands = [];
  for (const w of db.words || []) {
    if (!w || !w.term) continue;
    for (const c of core.getCollocations(w)) cands.push({ phrase: c, term: w.term, meaning_vi: w.lesson?.meaning_vi || "", meaning_en: core.getMeaning(w) });
    const ex = core.getExamples(w)[0];
    if (ex) cands.push({ phrase: ex, term: w.term, meaning_vi: w.lesson?.meaning_vi || "", meaning_en: core.getMeaning(w) });
  }
  if (!cands.length) return null;
  const item = cands[_suggestCursor % cands.length];
  _suggestCursor += 1;
  return { ok: true, ...item };
}

function openVocabChallenge() {
  if (challengeWin && !challengeWin.isDestroyed()) {
    challengeWin.showInactive();
    try { challengeWin.webContents.send("challenge-refresh"); } catch {}
    return;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  const w = 380;
  const h = 780; // đủ chỗ: game siêu trí nhớ 🧠 + gợi ý 💬 + thẻ Từ vựng 🐝 + game câu
  // Reuse the position the user dragged it to last time (clamped to a visible screen)
  let px = wa.x + wa.width - w - 16;
  let py = wa.y + wa.height - h - 16;
  if (challengeWinPos) {
    const near = screen.getDisplayNearestPoint(challengeWinPos).workArea;
    px = Math.min(Math.max(challengeWinPos.x, near.x), near.x + near.width - w);
    py = Math.min(Math.max(challengeWinPos.y, near.y), near.y + near.height - h);
  }
  challengeWin = new BrowserWindow({
    width: w,
    height: h,
    x: px,
    y: py,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    title: "Bumbee Challenge",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload-vocab-challenge.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  challengeWin.setAlwaysOnTop(true, "floating");
  challengeWin.loadFile(path.join(__dirname, "vocab-challenge.html"));
  challengeWin.once("ready-to-show", () => {
    if (challengeWin && !challengeWin.isDestroyed()) challengeWin.showInactive();
  });
  challengeWin.on("moved", () => {
    if (!challengeWin || challengeWin.isDestroyed()) return;
    const b = challengeWin.getBounds();
    challengeWinPos = { x: b.x, y: b.y };
    try { savePrefs(); } catch {}
  });
  challengeWin.on("closed", () => { challengeWin = null; });
}

function closeVocabChallenge() {
  if (challengeWin && !challengeWin.isDestroyed()) challengeWin.close();
  challengeWin = null;
}

function startChallengeScheduler() {
  if (challengeTimer) clearInterval(challengeTimer);
  challengeTimer = setInterval(() => {
    if (!vocabAutoChallenge) return;
    if (Date.now() < challengeSnoozeUntil) return;
    if (doNotDisturb) return;
    if (challengeWin && !challengeWin.isDestroyed()) return;  // already showing
    // Only pop when there is something actually due
    const db = readVocabDb();
    if (countDueVocab(db, Date.now()) <= 0) return;
    openVocabChallenge();
    // Space out the next auto-pop by the configured interval
    challengeSnoozeUntil = Date.now() + Math.max(1, vocabChallengeIntervalMin) * 60 * 1000;
  }, 30000); // check every 30s; actual cadence gated by snooze/due
}

function setVocabChallengeConfig(cfg = {}) {
  if (typeof cfg.auto === "boolean") vocabAutoChallenge = cfg.auto;
  if (typeof cfg.reverse === "boolean") vocabReverseMode = cfg.reverse;
  if (typeof cfg.gameType === "string" && ["mix", "sentence", "vocab"].includes(cfg.gameType)) {
    vocabGameType = cfg.gameType;
  }
  if (Number.isFinite(cfg.intervalMin)) {
    vocabChallengeIntervalMin = Math.max(1, Math.min(240, Math.round(cfg.intervalMin)));
  }
  if (vocabAutoChallenge) challengeSnoozeUntil = 0;
  try { savePrefs(); } catch {}
  return { ok: true, auto: vocabAutoChallenge, reverse: vocabReverseMode, gameType: vocabGameType, intervalMin: vocabChallengeIntervalMin };
}

// ── Vocab auto-source (Phase 2) ──────────────────────────────────────────────
// Mines candidate words from raw text (clipboard/url/screen) using the vendored
// 3000-word stop list (vocab-extractor), then enriches + stores via addVocabItems.
async function addVocabFromText(text, source, maxTerms = 6) {
  const raw = String(text || "").trim();
  if (raw.length < 12) return { ok: false, reason: "too_short" };
  let terms;
  try {
    const { extract } = require("./vocab-extractor");
    const db = readVocabDb();
    const known = new Set((db.words || []).map((w) => String(w.term || "").toLowerCase()));
    terms = extract(raw, { source_app: source || "auto", knownWords: known })
      .map((c) => c.word)
      .slice(0, maxTerms);
  } catch (e) {
    return { ok: false, reason: "extract_failed", error: e.message };
  }
  if (!terms.length) return { ok: false, reason: "no_new_terms" };
  const res = await addVocabItems({ terms, text: raw.slice(0, 500), source: source || "auto" });
  try { emitSemanticEvent("vocab.auto_source", { source, added: (res.created || []).length }); } catch {}
  return { ok: true, source, terms, added: (res.created || []).length };
}

function ensureAutoSource() {
  if (_autoSource) return _autoSource;
  _autoSource = require("./vocab-auto-source")({
    addFromText: (t, s) => addVocabFromText(t, s),
    isEnabled: () => vocabAutoSource,
    getIntervalSec: () => vocabAutoSourceIntervalSec,
    log: (m) => console.warn("[vocab-auto-source]", m),
  });
  return _autoSource;
}

function setVocabAutoSource(enabled) {
  vocabAutoSource = !!enabled;
  try { savePrefs(); } catch {}
  return { ok: true, auto: vocabAutoSource };
}

function openPhaseHub() {
  if (phaseHubWin && !phaseHubWin.isDestroyed()) {
    phaseHubWin.show();
    phaseHubWin.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay().workArea;
  phaseHubWin = new BrowserWindow({
    width: Math.min(1120, Math.max(900, primary.width - 120)),
    height: Math.min(820, Math.max(650, primary.height - 120)),
    minWidth: 820,
    minHeight: 600,
    title: "Bumbee Phase Hub",
    show: false,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload-phase-hub.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  phaseHubWin.loadFile(path.join(__dirname, "bumbee-phase-hub.html"));
  phaseHubWin.once("ready-to-show", () => {
    if (phaseHubWin && !phaseHubWin.isDestroyed()) phaseHubWin.show();
  });
  phaseHubWin.on("closed", () => {
    phaseHubWin = null;
  });
}

function openBumbeeOs() {
  if (bumbeeOsWin && !bumbeeOsWin.isDestroyed()) {
    bumbeeOsWin.show();
    bumbeeOsWin.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay().workArea;
  bumbeeOsWin = new BrowserWindow({
    width: Math.min(1180, Math.max(920, primary.width - 120)),
    height: Math.min(840, Math.max(680, primary.height - 120)),
    minWidth: 840,
    minHeight: 620,
    title: "Bumbee OS",
    show: false,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload-bumbee-os.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  bumbeeOsWin.loadFile(path.join(__dirname, "bumbee-os.html"));
  bumbeeOsWin.once("ready-to-show", () => {
    if (bumbeeOsWin && !bumbeeOsWin.isDestroyed()) bumbeeOsWin.show();
  });
  bumbeeOsWin.on("closed", () => {
    bumbeeOsWin = null;
  });
}

function openSceneViewer() {
  if (sceneViewerWin && !sceneViewerWin.isDestroyed()) {
    sceneViewerWin.show();
    sceneViewerWin.focus();
    return;
  }
  const primary = screen.getPrimaryDisplay().workArea;
  sceneViewerWin = new BrowserWindow({
    width: Math.min(1200, primary.width - 80),
    height: Math.min(800, primary.height - 80),
    minWidth: 800, minHeight: 600,
    title: "Bumbee 3D Scene Viewer",
    show: false,
    backgroundColor: "#0a0e14",
    webPreferences: {
      preload: path.join(__dirname, "preload-scene.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  sceneViewerWin.loadFile(path.join(__dirname, "scene-viewer.html"));
  sceneViewerWin.once("ready-to-show", () => {
    if (sceneViewerWin && !sceneViewerWin.isDestroyed()) sceneViewerWin.show();
  });
  sceneViewerWin.on("closed", () => { sceneViewerWin = null; });
}

function openDonationSettings() {
  if (donationSettingsWin && !donationSettingsWin.isDestroyed()) {
    donationSettingsWin.show();
    donationSettingsWin.focus();
    return;
  }
  donationSettingsWin = new BrowserWindow({
    width: 720,
    height: 640,
    minWidth: 620,
    minHeight: 520,
    title: "Bumbee Donation Settings",
    show: false,
    backgroundColor: "#10151f",
    webPreferences: {
      preload: path.join(__dirname, "preload-vocab.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  donationSettingsWin.loadFile(path.join(__dirname, "settings-donation.html"));
  donationSettingsWin.once("ready-to-show", () => {
    if (donationSettingsWin && !donationSettingsWin.isDestroyed()) donationSettingsWin.show();
  });
  donationSettingsWin.on("closed", () => {
    donationSettingsWin = null;
  });
}

function togglePetVisibility() {
  if (!win || win.isDestroyed()) return;
  if (_mini.getMiniTransitioning()) return;
  if (petHidden) {
    win.showInactive();
    if (isLinux) win.setSkipTaskbar(true);
    if (hitWin && !hitWin.isDestroyed()) {
      hitWin.showInactive();
      if (isLinux) hitWin.setSkipTaskbar(true);
    }
    // Restore any permission bubbles that were hidden
    for (const perm of pendingPermissions) {
      if (perm.bubble && !perm.bubble.isDestroyed()) {
        perm.bubble.showInactive();
        if (isLinux) perm.bubble.setSkipTaskbar(true);
      }
    }
    reapplyMacVisibility();
    petHidden = false;
  } else {
    win.hide();
    if (hitWin && !hitWin.isDestroyed()) hitWin.hide();
    // Also hide any permission bubbles
    for (const perm of pendingPermissions) {
      if (perm.bubble && !perm.bubble.isDestroyed()) perm.bubble.hide();
    }
    petHidden = true;
  }
  buildTrayMenu();
  buildContextMenu();
}

function registerToggleShortcut() {
  try {
    globalShortcut.register(DEFAULT_TOGGLE_SHORTCUT, togglePetVisibility);
  } catch (err) {
    console.warn("Clawd: failed to register global shortcut:", err.message);
  }
}

function unregisterToggleShortcut() {
  try {
    globalShortcut.unregister(DEFAULT_TOGGLE_SHORTCUT);
  } catch {}
}

function canUseWebContents(browserWindow) {
  return !!(
    browserWindow &&
    !browserWindow.isDestroyed() &&
    browserWindow.webContents &&
    !browserWindow.webContents.isDestroyed()
  );
}

function sendToRenderer(channel, ...args) {
  if (canUseWebContents(win)) win.webContents.send(channel, ...args);
  if (channel === "state-change" && _clawdbot) {
    try {
      const sid = _state ? _state.getActiveSessionId?.() : null;
      const sessionData = sid && sessions ? sessions.get(sid) : null;
      _clawdbot.onStateChange(args[0], sessionData ? { id: sid, ...sessionData } : null);
    } catch {}
  }
}
function sendToHitWin(channel, ...args) {
  if (canUseWebContents(hitWin)) hitWin.webContents.send(channel, ...args);
}

function sendAppearance() {
  sendToRenderer("appearance-change", {
    theme: ghostMode ? "matrix-glam" : "solid",
    ghostMode,
  });
}

function setGhostMode(enabled) {
  ghostMode = !!enabled;
  sendAppearance();
  savePrefs();
}

function setAssistantMode24x7(enabled) {
  assistantMode24x7 = !!enabled;
  if (assistantMode24x7) {
    autoStartWithClaude = true;
    hideBubbles = false;
    bubbleFollowPet = false;
    try {
      const { registerHooks } = require("../hooks/install.js");
      registerHooks({ silent: true, autoStart: true, port: getHookServerPort() });
    } catch (err) {
      console.warn("Clawd: failed to enable 24/7 hook startup:", err.message);
    }
    try {
      app.setLoginItemSettings({ openAtLogin: true });
    } catch (err) {
      console.warn("Clawd: failed to enable login startup:", err.message);
    }
  } else {
    autoStartWithClaude = false;
    try {
      const { unregisterAutoStart } = require("../hooks/install.js");
      unregisterAutoStart();
    } catch (err) {
      console.warn("Clawd: failed to disable 24/7 hook startup:", err.message);
    }
    try {
      app.setLoginItemSettings({ openAtLogin: false });
    } catch (err) {
      console.warn("Clawd: failed to disable login startup:", err.message);
    }
  }
  buildTrayMenu();
  buildContextMenu();
  savePrefs();
}

// Sync input window position to match render window's hitbox.
// Called manually after every win position/size change + event-level safety net.
let _lastHitW = 0, _lastHitH = 0;
function syncHitWin() {
  if (!hitWin || hitWin.isDestroyed() || !win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const hit = getHitRectScreen(bounds);
  const x = Math.round(hit.left);
  const y = Math.round(hit.top);
  const w = Math.round(hit.right - hit.left);
  const h = Math.round(hit.bottom - hit.top);
  if (w <= 0 || h <= 0) return;
  hitWin.setBounds({ x, y, width: w, height: h });
  // Update shape if hitbox dimensions changed (e.g. after resize)
  if (w !== _lastHitW || h !== _lastHitH) {
    _lastHitW = w; _lastHitH = h;
    hitWin.setShape([{ x: 0, y: 0, width: w, height: h }]);
  }
}

let mouseOverPet = false;
let dragLocked = false;
let menuOpen = false;
let idlePaused = false;
let forceEyeResend = false;

// ── Mini Mode — delegated to src/mini.js ──
// Initialized after state module (needs applyState, resolveDisplayState, etc.)
// See _mini initialization below


// ── Permission bubble — delegated to src/permission.js ──
const _permCtx = {
  get win() { return win; },
  get lang() { return lang; },
  get bubbleFollowPet() { return bubbleFollowPet; },
  get permDebugLog() { return permDebugLog; },
  get doNotDisturb() { return doNotDisturb; },
  getNearestWorkArea,
  getHitRectScreen,
  guardAlwaysOnTop,
  reapplyMacVisibility,
  focusTerminalForSession: (sessionId) => {
    const s = sessions.get(sessionId);
    if (s && s.sourcePid) focusTerminalWindow(s.sourcePid, s.cwd, s.editor, s.pidChain);
  },
  openBumbeeChat: () => openBumbeeChat(),
};
const _perm = require("./permission")(_permCtx);
const { showPermissionBubble, resolvePermissionEntry, sendPermissionResponse, repositionBubbles, permLog, PASSTHROUGH_TOOLS, showCodexNotifyBubble, showCoachNotifyBubble, clearCodexNotifyBubbles } = _perm;
const pendingPermissions = _perm.pendingPermissions;
let permDebugLog = null; // set after app.whenReady()
let updateDebugLog = null; // set after app.whenReady()

// ── macOS fullscreen visibility helper ──
// Re-apply visibleOnAllWorkspaces + alwaysOnTop to all windows after events
// that may reset NSWindowCollectionBehavior (showInactive, dock.hide, etc.)
function reapplyMacVisibility() {
  if (!isMac) return;
  const opts = { visibleOnFullScreen: true };
  if (!showDock) opts.skipTransformProcessType = true;
  const apply = (w) => {
    if (w && !w.isDestroyed()) {
      w.setVisibleOnAllWorkspaces(true, opts);
      w.setAlwaysOnTop(true, MAC_TOPMOST_LEVEL);
    }
  };
  apply(win);
  apply(hitWin);
  for (const perm of pendingPermissions) apply(perm.bubble);
  apply(contextMenuOwner);
}

// ── State machine — delegated to src/state.js ──
const _stateCtx = {
  get win() { return win; },
  get hitWin() { return hitWin; },
  get doNotDisturb() { return doNotDisturb; },
  set doNotDisturb(v) { doNotDisturb = v; },
  get miniMode() { return _mini.getMiniMode(); },
  get miniTransitioning() { return _mini.getMiniTransitioning(); },
  get mouseOverPet() { return mouseOverPet; },
  get miniSleepPeeked() { return _mini.getMiniSleepPeeked(); },
  set miniSleepPeeked(v) { _mini.setMiniSleepPeeked(v); },
  get idlePaused() { return idlePaused; },
  set idlePaused(v) { idlePaused = v; },
  get forceEyeResend() { return forceEyeResend; },
  set forceEyeResend(v) { forceEyeResend = v; },
  get mouseStillSince() { return _tick ? _tick._mouseStillSince : Date.now(); },
  get pendingPermissions() { return pendingPermissions; },
  get showSessionId() { return showSessionId; },
  sendToRenderer,
  sendToHitWin,
  syncHitWin,
  getCharacterSkin: () => characterSkin,
  t: (key) => t(key),
  focusTerminalWindow: (...args) => focusTerminalWindow(...args),
  resolvePermissionEntry: (...args) => resolvePermissionEntry(...args),
  miniPeekIn: () => miniPeekIn(),
  miniPeekOut: () => miniPeekOut(),
  buildContextMenu: () => buildContextMenu(),
  buildTrayMenu: () => buildTrayMenu(),
};
const _state = require("./state")(_stateCtx);
const { setState, applyState, updateSession, resolveDisplayState, getSvgOverride,
        enableDoNotDisturb, disableDoNotDisturb, startStaleCleanup, stopStaleCleanup,
        startWakePoll, stopWakePoll, detectRunningAgentProcesses, buildSessionSubmenu,
        repaintCurrentSkin,
        startStartupRecovery: _startStartupRecovery } = _state;

const _skinScanner = require("./skin-scanner");

function setCharacterSkin(skinId) {
  if (typeof skinId !== "string" || skinId === characterSkin) return;
  characterSkin = skinId;
  // Resolve skin descriptor and notify renderer (Live2D/VRM use IPC, SVG repaints state)
  const descriptor = _skinScanner.findById(skinId) || { id: "clawd", type: "svg" };
  sendToRenderer("skin-change", descriptor);
  if (descriptor.type === "svg") {
    repaintCurrentSkin();
  }
  savePrefs();
}

function listAvailableSkins() {
  const builtin = [
    { id: "clawd", type: "svg", name: "Clawd" },
    { id: "bunny", type: "svg", name: "Bunny" },
  ];
  const scanned = _skinScanner.scanAll();
  return { builtin, live2d: scanned.live2d, vrm: scanned.vrm };
}
const sessions = _state.sessions;
const STATE_SVGS = _state.STATE_SVGS;
const STATE_PRIORITY = _state.STATE_PRIORITY;

// ── Hit-test: SVG bounding box → screen coordinates ──
function getHitRectScreen(bounds) {
  const obj = getObjRect(bounds);
  const scale = Math.min(obj.w, obj.h) / 45;
  const offsetX = obj.x + (obj.w - 45 * scale) / 2;
  const offsetY = obj.y + (obj.h - 45 * scale) / 2;
  const hb = _state.getCurrentHitBox();
  return {
    left:   offsetX + (hb.x + 15) * scale,
    top:    offsetY + (hb.y + 25) * scale,
    right:  offsetX + (hb.x + 15 + hb.w) * scale,
    bottom: offsetY + (hb.y + 25 + hb.h) * scale,
  };
}

// ── Main tick — delegated to src/tick.js ──
const _tickCtx = {
  get win() { return win; },
  get currentState() { return _state.getCurrentState(); },
  get currentSvg() { return _state.getCurrentSvg(); },
  get miniMode() { return _mini.getMiniMode(); },
  get miniTransitioning() { return _mini.getMiniTransitioning(); },
  get dragLocked() { return dragLocked; },
  get menuOpen() { return menuOpen; },
  get idlePaused() { return idlePaused; },
  get isAnimating() { return _mini.getIsAnimating(); },
  get miniSleepPeeked() { return _mini.getMiniSleepPeeked(); },
  set miniSleepPeeked(v) { _mini.setMiniSleepPeeked(v); },
  get mouseOverPet() { return mouseOverPet; },
  set mouseOverPet(v) { mouseOverPet = v; },
  get forceEyeResend() { return forceEyeResend; },
  set forceEyeResend(v) { forceEyeResend = v; },
  get startupRecoveryActive() { return _state.getStartupRecoveryActive(); },
  sendToRenderer,
  sendToHitWin,
  setState,
  applyState,
  miniPeekIn: () => miniPeekIn(),
  miniPeekOut: () => miniPeekOut(),
  getObjRect,
  getHitRectScreen,
};
const _tick = require("./tick")(_tickCtx);
const { startMainTick, resetIdleTimer } = _tick;

// ── Vision Auto-Capture ──
const _visionCapture = require("./vision-auto-capture")({
  getStudioFolder: () => getBumbeeStudioFolderPath(),
  getDwellInfo: () => _tick.getDwellInfo(),
  screenWidth: () => {
    const primary = screen.getPrimaryDisplay();
    return primary ? primary.workAreaSize.width : 1920;
  },
  getActiveWindowTitle: () => {
    const focused = BrowserWindow.getFocusedWindow();
    return focused ? focused.getTitle() : null;
  },
  runGatewaySkill: async (skillName, inputData) => {
    if (!_wiki) return null;
    const wikiMod = require("./bumbee-wiki-service");
    return wikiMod.runRawGatewaySkill(getBumbeeStudioFolderPath(), skillName, inputData, {
      gatewayToken: readTokenFile(getBumbeeTokenFilePath()),
      gatewayBaseUrl: process.env.BUMBEE_GATEWAY_URL || "https://gateway.bumbee.asia",
    });
  },
});

// ── Terminal focus — delegated to src/focus.js ──
const _focus = require("./focus")({ _allowSetForeground });
const { initFocusHelper, killFocusHelper, focusTerminalWindow, clearMacFocusCooldownTimer } = _focus;

// ── Wiki Knowledge Store ──────────────────────────────────────────────────
const _wikiStore = require("./wiki-store");
const _bumbeeOsStore = require("./bumbee-os-store")(app.getPath("userData"));

// ── HTTP server — delegated to src/server.js ──
const _serverCtx = {
  get autoStartWithClaude() { return autoStartWithClaude; },
  get doNotDisturb() { return doNotDisturb; },
  get hideBubbles() { return hideBubbles; },
  get pendingPermissions() { return pendingPermissions; },
  get PASSTHROUGH_TOOLS() { return PASSTHROUGH_TOOLS; },
  get STATE_SVGS() { return STATE_SVGS; },
  get sessions() { return sessions; },
  wikiStore: _wikiStore,
  bumbeeOsStore: _bumbeeOsStore,
  setState,
  updateSession,
  resolvePermissionEntry,
  sendPermissionResponse,
  showPermissionBubble,
  permLog,
};
const _server = require("./server")(_serverCtx);
const { startHttpServer, getHookServerPort, syncClawdHooks } = _server;

// ── Bumbee gateway / clawdbot / skills / intelligent-layer integration ──
let _clawdbot = null;
let _gateway = null;
let _skills = null;
let _smart = null;
let _wiki = null;
let coachReminderTimer = null;
let coachLastInteractionAt = 0;

const COACH_FIRST_PROMPT_MS = 4500;
const COACH_IDLE_PROMPT_MS = 20 * 60 * 1000;

const COACH_LINES = {
  welcome: [
    "Em chuẩn bị sẵn vài thử thách tiếng Anh rồi. Chơi 3 câu làm nóng não nha?",
    "Hôm nay mình giữ streak tiếng Anh nha. Bấm Play, em hỏi câu đầu liền.",
  ],
  prompt: [
    "Một câu nhanh thôi. Nếu đúng em cộng XP, nếu sai em nhắc lại nhẹ nhàng.",
    "Từ này hay gặp trong công việc đó. Anh thử chọn nghĩa đúng nha.",
  ],
  correct: [
    "Đúng rồi. Giờ nói lớn một câu với từ này để não nhớ lâu hơn.",
    "Good. Câu này dùng đi gặp khách là rất tự nhiên.",
  ],
  wrong: [
    "Không sao. Từ này hơi dễ nhầm, em bắt lại bằng ví dụ dễ hơn nha.",
    "Sai một lần là dữ liệu tốt. Em sẽ cho từ này ôn lại sớm hơn.",
  ],
  next: [
    "Câu tiếp theo nha. 5 phút mỗi ngày là đủ tạo thói quen.",
    "Tiếp tục giữ nhịp. Em chọn câu vừa sức hơn một chút.",
  ],
  idle: [
    "Nghỉ hơi lâu rồi. Chơi 1 câu tiếng Anh để giữ streak không anh?",
    "Em có một mini challenge 30 giây. Bấm Play để lấy XP nhanh.",
  ],
};

function pickCoachLine(type) {
  const list = COACH_LINES[type] || COACH_LINES.prompt;
  return list[Math.floor(Math.random() * list.length)];
}

function triggerCoachInteraction(type = "prompt", payload = {}) {
  coachLastInteractionAt = Date.now();
  if (doNotDisturb || hideBubbles) return;
  const message = payload.message || pickCoachLine(type);
  const reaction = {
    welcome: ["clawd-wake.svg", 3000],
    prompt: ["clawd-notification.svg", 3000],
    correct: ["clawd-happy.svg", 3200],
    wrong: ["clawd-react-annoyed.svg", 3200],
    next: ["clawd-idle-reading.svg", 2800],
    idle: ["clawd-notification.svg", 3200],
  }[type] || ["clawd-notification.svg", 3000];
  try {
    sendToRenderer("play-click-reaction", reaction[0], reaction[1]);
  } catch {}
  try {
    showCoachNotifyBubble({ message, timeoutMs: payload.timeoutMs || 14000 });
  } catch (e) {
    console.warn("Clawd: failed to show Bumbee coach bubble:", e.message);
  }
}

function scheduleCoachReminder(delayMs = COACH_IDLE_PROMPT_MS) {
  if (coachReminderTimer) clearTimeout(coachReminderTimer);
  coachReminderTimer = setTimeout(() => {
    coachReminderTimer = null;
    const idleLongEnough = Date.now() - coachLastInteractionAt >= Math.min(delayMs, COACH_IDLE_PROMPT_MS);
    const chatActive = chatWin && !chatWin.isDestroyed() && chatWin.isVisible() && chatWin.isFocused();
    if (LEARN_ON_START && idleLongEnough && !chatActive) triggerCoachInteraction("idle");
    scheduleCoachReminder(COACH_IDLE_PROMPT_MS);
  }, Math.max(3000, delayMs));
}

function showExternalNotification({ sessionId, title, message, level, timeoutMs }) {
  // Reuse Codex notify bubble pattern (no Allow/Deny, auto-expire)
  try {
    if (typeof showCodexNotifyBubble === "function") {
      showCodexNotifyBubble({
        sessionId: sessionId || "external",
        command: `${title}\n${message}`.slice(0, 500),
        timeoutMs: timeoutMs || 8000,
      });
    }
  } catch (e) {
    console.warn("Clawd: failed to show external notification:", e.message);
  }
}

// ── Save Knowledge prompt (triggered after Stop event) ───────────────────
// Track session working durations to decide if worth prompting
const _sessionWorkStartAt = new Map();
const SAVE_KNOWLEDGE_MIN_WORKING_MS = 45 * 1000; // only prompt if session worked 45s+
const SAVE_KNOWLEDGE_COOLDOWN_MS = 5 * 60 * 1000; // don't prompt twice in 5 min
let _lastSaveKnowledgePromptAt = 0;

function onSessionStop(sessionId) {
  const startedAt = _sessionWorkStartAt.get(sessionId);
  _sessionWorkStartAt.delete(sessionId);
  if (!startedAt) return;
  const workingMs = Date.now() - startedAt;
  if (workingMs < SAVE_KNOWLEDGE_MIN_WORKING_MS) return; // session quá ngắn
  if (Date.now() - _lastSaveKnowledgePromptAt < SAVE_KNOWLEDGE_COOLDOWN_MS) return; // vừa nhắc rồi
  if (doNotDisturb || hideBubbles) return;
  _lastSaveKnowledgePromptAt = Date.now();
  // Delay 1.5s cho attention animation chạy xong rồi mới nhắc
  setTimeout(() => {
    try {
      const port = getHookServerPort();
      showExternalNotification({
        sessionId: "save-knowledge",
        title: "💾 Lưu kiến thức hôm nay?",
        message: `Vừa làm việc ${Math.round(workingMs / 60000)}p. Mở Skills UI để push notes:\nlocalhost:${port}/skills-ui`,
        level: "info",
        timeoutMs: 15000,
      });
    } catch (e) {
      console.warn("Clawd: failed to show save-knowledge prompt:", e.message);
    }
  }, 1500);
}

// Patch updateSession để track session working time + trigger Stop prompt
const _originalUpdateSession = updateSession;
function updateSessionWithKnowledgeTrack(sessionId, state, event, ...rest) {
  // Track khi session bắt đầu working
  if ((state === "working" || state === "thinking") && !_sessionWorkStartAt.has(sessionId)) {
    _sessionWorkStartAt.set(sessionId, Date.now());
  }
  // Trigger save prompt khi Stop
  if (event === "Stop" || event === "PostCompact") {
    onSessionStop(sessionId);
  }
  return _originalUpdateSession(sessionId, state, event, ...rest);
}
// Monkey-patch serverCtx to use the wrapped version
_serverCtx.updateSession = updateSessionWithKnowledgeTrack;

// Expose to server context
_serverCtx.showExternalNotification = showExternalNotification;
Object.defineProperty(_serverCtx, "gateway", { get: () => _gateway, configurable: true });
Object.defineProperty(_serverCtx, "clawdbot", { get: () => _clawdbot, configurable: true });
Object.defineProperty(_serverCtx, "skills", { get: () => _skills, configurable: true });
Object.defineProperty(_serverCtx, "smart", { get: () => _smart, configurable: true });
Object.defineProperty(_serverCtx, "wiki", { get: () => _wiki, configurable: true });

// ── alwaysOnTop recovery (Windows DWM / Shell can strip TOPMOST flag) ──
// The "always-on-top-changed" event only fires from Electron's own SetAlwaysOnTop
// path — it does NOT fire when Explorer/Start menu/Gallery silently reorder windows.
// So we keep the event listener for the cases it does catch (Alt/Win key), and add
// a slow watchdog (20s) to recover from silent shell-initiated z-order drops.
const WIN_TOPMOST_LEVEL = "pop-up-menu";  // above taskbar-level UI
const MAC_TOPMOST_LEVEL = "screen-saver"; // above fullscreen apps on macOS
const TOPMOST_WATCHDOG_MS = 5_000;
let topmostWatchdog = null;
let hwndRecoveryTimer = null;

// Reinitialize HWND input routing after DWM z-order disruptions.
// showInactive() (ShowWindow SW_SHOWNOACTIVATE) is the same call that makes
// the right-click context menu restore drag capability — it forces Windows to
// fully recalculate the transparent window's input target region.
function scheduleHwndRecovery() {
  if (!isWin) return;
  if (hwndRecoveryTimer) clearTimeout(hwndRecoveryTimer);
  hwndRecoveryTimer = setTimeout(() => {
    hwndRecoveryTimer = null;
    if (!win || win.isDestroyed()) return;
    // Just restore z-order — input routing is handled by hitWin now
    win.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    if (hitWin && !hitWin.isDestroyed()) hitWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    forceEyeResend = true;
  }, 1000);
}

function guardAlwaysOnTop(w) {
  if (!isWin) return;
  w.on("always-on-top-changed", (_, isOnTop) => {
    if (!isOnTop && w && !w.isDestroyed()) {
      w.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
      if (w === win && !dragLocked && !_mini.getIsAnimating()) {
        forceEyeResend = true;
        const { x, y } = win.getBounds();
        win.setPosition(x + 1, y);
        win.setPosition(x, y);
        syncHitWin();
        scheduleHwndRecovery();
      }
    }
  });
}

function startTopmostWatchdog() {
  if (!isWin || topmostWatchdog) return;
  topmostWatchdog = setInterval(() => {
    if (win && !win.isDestroyed()) {
      win.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    }
    // Keep hitWin topmost too
    if (hitWin && !hitWin.isDestroyed()) {
      hitWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    }
    for (const perm of pendingPermissions) {
      if (perm.bubble && !perm.bubble.isDestroyed() && perm.bubble.isVisible()) perm.bubble.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    }
  }, TOPMOST_WATCHDOG_MS);
}

function stopTopmostWatchdog() {
  if (topmostWatchdog) { clearInterval(topmostWatchdog); topmostWatchdog = null; }
}

function updateLog(msg) {
  if (!updateDebugLog) return;
  const { rotatedAppend } = require("./log-rotate");
  rotatedAppend(updateDebugLog, `[${new Date().toISOString()}] ${msg}\n`);
}

// ── Menu — delegated to src/menu.js ──
const _menuCtx = {
  get win() { return win; },
  get sessions() { return sessions; },
  get currentSize() { return currentSize; },
  set currentSize(v) { currentSize = v; },
  get doNotDisturb() { return doNotDisturb; },
  get lang() { return lang; },
  set lang(v) { lang = v; },
  get showTray() { return showTray; },
  set showTray(v) { showTray = v; },
  get showDock() { return showDock; },
  set showDock(v) { showDock = v; },
  get autoStartWithClaude() { return autoStartWithClaude; },
  set autoStartWithClaude(v) { autoStartWithClaude = v; },
  get bubbleFollowPet() { return bubbleFollowPet; },
  set bubbleFollowPet(v) { bubbleFollowPet = v; },
  get hideBubbles() { return hideBubbles; },
  set hideBubbles(v) { hideBubbles = v; },
  get showSessionId() { return showSessionId; },
  set showSessionId(v) { showSessionId = v; },
  get ghostMode() { return ghostMode; },
  setGhostMode: (v) => setGhostMode(v),
  get assistantMode24x7() { return assistantMode24x7; },
  setAssistantMode24x7: (v) => setAssistantMode24x7(v),
  get pendingPermissions() { return pendingPermissions; },
  repositionBubbles: () => repositionBubbles(),
  get petHidden() { return petHidden; },
  togglePetVisibility: () => togglePetVisibility(),
  get isQuitting() { return isQuitting; },
  set isQuitting(v) { isQuitting = v; },
  get menuOpen() { return menuOpen; },
  set menuOpen(v) { menuOpen = v; },
  get tray() { return tray; },
  set tray(v) { tray = v; },
  get contextMenuOwner() { return contextMenuOwner; },
  set contextMenuOwner(v) { contextMenuOwner = v; },
  get contextMenu() { return contextMenu; },
  set contextMenu(v) { contextMenu = v; },
  enableDoNotDisturb: () => enableDoNotDisturb(),
  disableDoNotDisturb: () => disableDoNotDisturb(),
  enterMiniViaMenu: () => enterMiniViaMenu(),
  exitMiniMode: () => exitMiniMode(),
  getMiniMode: () => _mini.getMiniMode(),
  getMiniTransitioning: () => _mini.getMiniTransitioning(),
  miniHandleResize: (sizeKey) => _mini.handleResize(sizeKey),
  focusTerminalWindow: (...args) => focusTerminalWindow(...args),
  checkForUpdates: (...args) => checkForUpdates(...args),
  getUpdateMenuItem: () => getUpdateMenuItem(),
  buildSessionSubmenu: () => buildSessionSubmenu(),
  savePrefs,
  getHookServerPort: () => getHookServerPort(),
  clampToScreen,
  getNearestWorkArea,
  reapplyMacVisibility,
  getRabbitEnabled: () => _rabbit.getEnabled(),
  getRabbitIntervalMin: () => _rabbit.getIntervalMin(),
  setRabbitEnabled: (v) => _rabbit.setEnabled(v),
  setRabbitIntervalMin: (v) => _rabbit.setIntervalMin(v),
  get rabbitAllowedIntervals() { return _rabbit.ALLOWED_INTERVALS; },
  rabbitShowNow: () => _rabbit.showNow(),
  getCharacterSkin: () => characterSkin,
  setCharacterSkin,
  listAvailableSkins: () => listAvailableSkins(),
  openSkinAssetsFolder: (kind) => {
    const { shell } = require("electron");
    const root = _skinScanner.getAssetRoot();
    const target = kind === "vrm"
      ? path.join(root, "vrm")
      : path.join(root, "live2d");
    try { fs.mkdirSync(target, { recursive: true }); } catch {}
    shell.openPath(target);
  },
  // Bumbee integration accessors for menu
  getGateway: () => _gateway,
  getClawdbot: () => _clawdbot,
  getSkills: () => _skills,
  getSmart: () => _smart,
  getWiki: () => _wiki,
  openBumbeeChat,
  openBumbeeVocab: openVocabTinder,
  openBumbeeChallenge: openVocabChallenge,
  getVocabAutoChallenge: () => vocabAutoChallenge,
  setVocabAutoChallenge: (v) => setVocabChallengeConfig({ auto: !!v }),
  getVocabAutoSource: () => vocabAutoSource,
  setVocabAutoSource: (v) => setVocabAutoSource(!!v),
  grabVocabClipboard: () => ensureAutoSource().grabClipboard(true),
  openBumbeePhaseHub: openPhaseHub,
  openBumbeeOs,
  visionCaptureRunning: () => _visionCapture.isRunning(),
  toggleVisionCapture: () => {
    if (_visionCapture.isRunning()) _visionCapture.stop();
    else _visionCapture.start();
  },
};
const _menu = require("./menu")(_menuCtx);
const { t, buildContextMenu, buildTrayMenu, rebuildAllMenus, createTray,
        showPetContextMenu, popupMenuAt, ensureContextMenuOwner,
        requestAppQuit, resizeWindow, applyDockVisibility } = _menu;

// ── Auto-updater — delegated to src/updater.js ──
const _updaterCtx = {
  get doNotDisturb() { return doNotDisturb; },
  get miniMode() { return _mini.getMiniMode(); },
  t, rebuildAllMenus, updateLog,
};
const _updater = require("./updater")(_updaterCtx);
const { setupAutoUpdater, checkForUpdates, getUpdateMenuItem, getUpdateMenuLabel } = _updater;

// ── Rabbit periodic popup — delegated to src/rabbit.js ──
const _rabbitCtx = {
  isDoNotDisturb: () => doNotDisturb,
  getLang: () => lang,
  savePrefs,
  initialEnabled: rabbitEnabled,
  initialIntervalMin: rabbitIntervalMin,
};
const _rabbit = require("./rabbit")(_rabbitCtx);
const _bumbeeSystemBootstrap = createBumbeeSystemBootstrap({
  logger: (message) => console.log(`Clawd: ${message}`),
});

function notifyBumbeeSystemBootstrap(result) {
  if (!result) return;
  try {
    const syncedCount = Array.isArray(result.synced) ? result.synced.length : 0;
    const awarenessCount = Array.isArray(result.installedAwarenessFiles) ? result.installedAwarenessFiles.length : 0;
    const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;
    const title = result.ok
      ? "Bumbee skills synced"
      : result.status === "partial"
        ? "Bumbee skills partially synced"
        : "Bumbee skills sync failed";
    const body = result.ok
      ? `Codex + Claude are ready: ${syncedCount} skill copies and ${awarenessCount} awareness files installed.`
      : `${errorCount} error(s). Open Bumbee OS > System bootstrap for details.`;
    new Notification({ title, body }).show();
  } catch (err) {
    console.warn("Clawd: failed to show Bumbee bootstrap notification:", err.message);
  }
}

function createWindow() {
  const prefs = loadPrefs();
  if (prefs && SIZES[prefs.size]) currentSize = prefs.size;
  if (prefs && (prefs.lang === "en" || prefs.lang === "zh")) lang = prefs.lang;
  // macOS: restore tray/dock visibility from prefs
  if (isMac && prefs) {
    if (typeof prefs.showTray === "boolean") showTray = prefs.showTray;
    if (typeof prefs.showDock === "boolean") showDock = prefs.showDock;
  }
  if (prefs && typeof prefs.autoStartWithClaude === "boolean") autoStartWithClaude = prefs.autoStartWithClaude;
  if (prefs && typeof prefs.bubbleFollowPet === "boolean") bubbleFollowPet = prefs.bubbleFollowPet;
  if (prefs && typeof prefs.hideBubbles === "boolean") hideBubbles = prefs.hideBubbles;
  if (prefs && typeof prefs.showSessionId === "boolean") showSessionId = prefs.showSessionId;
  if (prefs && typeof prefs.ghostMode === "boolean") ghostMode = prefs.ghostMode;
  if (prefs && typeof prefs.assistantMode24x7 === "boolean") assistantMode24x7 = prefs.assistantMode24x7;
  if (prefs && typeof prefs.rabbitEnabled === "boolean") rabbitEnabled = prefs.rabbitEnabled;
  if (prefs && typeof prefs.rabbitIntervalMin === "number") rabbitIntervalMin = prefs.rabbitIntervalMin;
  if (prefs && typeof prefs.characterSkin === "string") characterSkin = prefs.characterSkin;
  if (prefs && typeof prefs.vocabAutoChallenge === "boolean") vocabAutoChallenge = prefs.vocabAutoChallenge;
  if (prefs && typeof prefs.vocabReverseMode === "boolean") vocabReverseMode = prefs.vocabReverseMode;
  if (prefs && Number.isFinite(prefs.vocabChallengeIntervalMin)) {
    vocabChallengeIntervalMin = Math.max(1, Math.min(240, prefs.vocabChallengeIntervalMin));
  }
  if (prefs && typeof prefs.vocabGameType === "string" && ["mix", "sentence", "vocab"].includes(prefs.vocabGameType)) {
    vocabGameType = prefs.vocabGameType;
  }
  if (prefs && prefs.challengeWinPos && Number.isFinite(prefs.challengeWinPos.x) && Number.isFinite(prefs.challengeWinPos.y)) {
    challengeWinPos = { x: prefs.challengeWinPos.x, y: prefs.challengeWinPos.y };
  }
  if (prefs && typeof prefs.vocabAutoSource === "boolean") vocabAutoSource = prefs.vocabAutoSource;
  if (prefs && Number.isFinite(prefs.vocabAutoSourceIntervalSec)) {
    vocabAutoSourceIntervalSec = Math.max(15, Math.min(600, prefs.vocabAutoSourceIntervalSec));
  }
  // Apply persisted rabbit prefs without triggering savePrefs recursion
  _rabbit.configure({ enabled: rabbitEnabled, intervalMin: rabbitIntervalMin });
  // macOS: apply dock visibility (default hidden)
  if (isMac) {
    applyDockVisibility();
  }
  const size = SIZES[currentSize];

  // Restore saved position, or default to bottom-right of primary display
  let startX, startY;
  if (prefs && prefs.miniMode) {
    // Restore mini mode
    const miniPos = _mini.restoreFromPrefs(prefs, size);
    startX = miniPos.x;
    startY = miniPos.y;
  } else if (prefs) {
    const clamped = clampToScreen(prefs.x, prefs.y, size.width, size.height);
    startX = clamped.x;
    startY = clamped.y;
  } else {
    const { workArea } = screen.getPrimaryDisplay();
    startX = workArea.x + workArea.width - size.width - 20;
    startY = workArea.y + workArea.height - size.height - 20;
  }

  win = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
    ...(isMac ? { type: "panel", roundedCorners: false } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
    },
  });

  win.setFocusable(false);

  // Watchdog (Linux only): prevent accidental window close.
  // render-process-gone is handled by the global crash-recovery handler below.
  // On macOS/Windows the WM handles window lifecycle differently.
  if (isLinux) {
    win.on("close", (event) => {
      if (!isQuitting) {
        event.preventDefault();
        if (!win.isVisible()) win.showInactive();
      }
    });
    win.on("unresponsive", () => {
      if (isQuitting) return;
      console.warn("Clawd: renderer unresponsive — reloading");
      if (canUseWebContents(win)) win.webContents.reload();
    });
  }

  if (isWin) {
    // Windows: use pop-up-menu level to stay above taskbar/shell UI
    win.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
  }
  win.loadFile(path.join(__dirname, "index.html"));
  // Dev mode: auto-open DevTools when CLAWD_DEVTOOLS=1 or running unpackaged.
  // The Detached mode keeps DevTools in its own window so the transparent
  // pet window stays interactive.
  if (process.env.CLAWD_DEVTOOLS === "1" || (!app.isPackaged && process.env.CLAWD_DEVTOOLS !== "0")) {
    try { win.webContents.openDevTools({ mode: "detach" }); } catch {}
  }
  win.showInactive();
  // Linux WMs may reset skipTaskbar after showInactive — re-apply explicitly
  if (isLinux) win.setSkipTaskbar(true);
  // macOS: apply after showInactive() — it resets NSWindowCollectionBehavior
  reapplyMacVisibility();

  // macOS: startup-time dock state can be overridden during app/window activation.
  // Re-apply once on next tick so persisted showDock reliably takes effect.
  if (isMac) {
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      applyDockVisibility();
    }, 0);
  }

  buildContextMenu();
  if (!isMac || showTray) createTray();
  ensureContextMenuOwner();



  // ── Create input window (hitWin) — small rect over hitbox, receives all pointer events ──
  {
    const initBounds = win.getBounds();
    const initHit = getHitRectScreen(initBounds);
    const hx = Math.round(initHit.left), hy = Math.round(initHit.top);
    const hw = Math.round(initHit.right - initHit.left);
    const hh = Math.round(initHit.bottom - initHit.top);

    hitWin = new BrowserWindow({
      width: hw, height: hh, x: hx, y: hy,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      fullscreenable: false,
      enableLargerThanScreen: true,
      ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
      ...(isMac ? { type: "panel", roundedCorners: false } : {}),
      focusable: !isLinux,  // KEY EXPERIMENT: allow activation to avoid WS_EX_NOACTIVATE input routing bugs (Windows-only issue)
      webPreferences: {
        preload: path.join(__dirname, "preload-hit.js"),
        backgroundThrottling: false,
      },
    });
    // setShape: native hit region, no per-pixel alpha dependency.
    // hitWin has no visual content — clipping is irrelevant.
    hitWin.setShape([{ x: 0, y: 0, width: hw, height: hh }]);
    hitWin.setIgnoreMouseEvents(false);  // PERMANENT — never toggle
    if (isMac) hitWin.setFocusable(false);
    hitWin.showInactive();
    // Linux WMs may reset skipTaskbar after showInactive — re-apply explicitly
    if (isLinux) hitWin.setSkipTaskbar(true);
    if (isWin) {
      hitWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    }
    // macOS: apply after showInactive() — it resets NSWindowCollectionBehavior
    reapplyMacVisibility();
    hitWin.loadFile(path.join(__dirname, "hit.html"));
    if (isWin) guardAlwaysOnTop(hitWin);

    // Event-level safety net for position sync
    win.on("move", syncHitWin);
    win.on("resize", syncHitWin);

    // Send initial state to hitWin once it's ready
    hitWin.webContents.on("did-finish-load", () => {
      sendToHitWin("hit-state-sync", {
        currentSvg: _state.getCurrentSvg(), miniMode: _mini.getMiniMode(), dndEnabled: doNotDisturb,
      });
    });

    // Crash recovery for hitWin
    hitWin.webContents.on("render-process-gone", (_event, details) => {
      console.error("hitWin renderer crashed:", details.reason);
      if (canUseWebContents(hitWin)) hitWin.webContents.reload();
    });
  }

  ipcMain.on("show-context-menu", showPetContextMenu);

  ipcMain.on("move-window-by", (event, dx, dy) => {
    if (_mini.getMiniMode() || _mini.getMiniTransitioning()) return;
    const { x, y } = win.getBounds();
    const size = SIZES[currentSize];
    const clamped = clampToScreen(x + dx, y + dy, size.width, size.height);
    win.setBounds({ ...clamped, width: size.width, height: size.height });
    syncHitWin();
    if (bubbleFollowPet && pendingPermissions.length) repositionBubbles();
  });

  ipcMain.on("pause-cursor-polling", () => { idlePaused = true; });
  ipcMain.on("resume-from-reaction", () => {
    idlePaused = false;
    if (_mini.getMiniTransitioning()) return;
    sendToRenderer("state-change", _state.getCurrentState(), _state.getCurrentSvg());
  });

  ipcMain.on("drag-lock", (event, locked) => {
    dragLocked = !!locked;
    if (locked) mouseOverPet = true;
  });

  // Reaction relay: hitWin → main → renderWin
  ipcMain.on("start-drag-reaction", () => sendToRenderer("start-drag-reaction"));
  ipcMain.on("end-drag-reaction", () => sendToRenderer("end-drag-reaction"));
  ipcMain.on("play-click-reaction", (_, svg, duration) => {
    sendToRenderer("play-click-reaction", svg, duration);
  });

  ipcMain.on("drag-end", () => {
    if (!_mini.getMiniMode() && !_mini.getMiniTransitioning()) {
      checkMiniModeSnap();
    }
  });

  ipcMain.on("exit-mini-mode", () => {
    if (_mini.getMiniMode()) exitMiniMode();
  });

  ipcMain.on("focus-terminal", () => {
    // Find the best session to focus: prefer highest priority (non-idle), then most recent
    let best = null, bestTime = 0, bestPriority = -1;
    for (const [, s] of sessions) {
      if (!s.sourcePid) continue;
      const pri = STATE_PRIORITY[s.state] || 0;
      if (pri > bestPriority || (pri === bestPriority && s.updatedAt > bestTime)) {
        best = s;
        bestTime = s.updatedAt;
        bestPriority = pri;
      }
    }
    if (best) focusTerminalWindow(best.sourcePid, best.cwd, best.editor, best.pidChain);
  });
  ipcMain.on("open-bumbee-chat", openBumbeeChat);
  ipcMain.on("open-bumbee-vision", openBumbeeVision);
  ipcMain.on("open-bumbee-vocab", openVocabTinder);
  ipcMain.on("open-bumbee-phase-hub", openPhaseHub);
  ipcMain.on("open-bumbee-os", openBumbeeOs);

  ipcMain.on("show-session-menu", () => {
    popupMenuAt(Menu.buildFromTemplate(buildSessionSubmenu()));
  });

  ipcMain.on("bubble-height", (event, height) => _perm.handleBubbleHeight(event, height));
  ipcMain.on("move-bubble-by", (event, dx, dy) => _perm.handleMoveBubble(event, dx, dy));
  ipcMain.on("permission-decide", (event, behavior) => _perm.handleDecide(event, behavior));
  ipcMain.handle("bumbee-chat:send", (_event, payload) => sendBumbeeChat(payload));
  ipcMain.on("bumbee-chat:activity", (_event, payload) => updateBumbeeChatActivity(payload));
  // Multi-session chat (persisted)
  ipcMain.handle("bumbee-chat:list-sessions", () => listChatSessions());
  ipcMain.handle("bumbee-chat:create-session", (_event, payload) => createChatSession(payload));
  ipcMain.handle("bumbee-chat:close-session", (_event, key) => closeChatSession(key));
  ipcMain.handle("bumbee-chat:save-message", (_event, sessionKey, role, content) => {
    appendChatMessage(sessionKey, role, content);
    return { ok: true };
  });
  ipcMain.handle("bumbee-chat:get-messages", (_event, sessionKey) => getChatSessionMessages(sessionKey));
  ipcMain.handle("bumbee-chat:rename-session", (_event, key, title) => renameChatSession(key, title));
  // Save pasted/dropped file to temp and return path for agent use
  ipcMain.handle("bumbee-chat:save-attachment", async (_event, payload) => {
    try {
      const { name, dataUrl, mimeType } = payload || {};
      if (!dataUrl) return { ok: false, error: "no data" };
      const attachDir = path.join(app.getPath("userData"), "chat-attachments");
      fs.mkdirSync(attachDir, { recursive: true });
      const safeName = String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
      const filePath = path.join(attachDir, `${Date.now()}-${safeName}`);
      const base64 = String(dataUrl).split(",")[1] || "";
      fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
      return { ok: true, filePath, name: safeName, mimeType };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  // Local agent dispatch
  ipcMain.handle("local-agent:dispatch", (_event, payload) => dispatchLocalAgent(payload));
  ipcMain.handle("local-agent:status", (_event, taskId) => getLocalAgentStatus(taskId));
  ipcMain.handle("local-agent:stop", (_event, taskId) => stopLocalAgent(taskId));
  ipcMain.handle("local-agent:find", () => ({ ok: true, agents: findLocalAgent() }));
  ipcMain.handle("bumbee-chat:status", () => getSmartStatusPayload());
  ipcMain.handle("bumbee-chat:sessions", () => ({ ok: true, sessions: getSessionPayload() }));
  ipcMain.handle("bumbee-chat:login-request", (_event, payload) => requestBumbeeLoginCode(payload));
  ipcMain.handle("bumbee-chat:login-verify", (_event, payload) => verifyBumbeeLoginCode(payload));
  ipcMain.handle("bumbee-chat:logout", () => logoutBumbeeChat());
  ipcMain.handle("bumbee-wiki:sync", (_event, payload) => syncBumbeeWiki(payload));
  ipcMain.handle("bumbee-studio:setup", (_event, payload) => setupBumbeeStudio(payload));
  ipcMain.handle("bumbee-studio:sync", (_event, payload) => syncBumbeeStudio(payload));
  ipcMain.handle("bumbee-studio:dashboard", (_event, payload) => getBumbeeStudioDashboard(payload));
  ipcMain.handle("bumbee-studio:new-project", (_event, payload) => createBumbeeStudioProject(payload));
  ipcMain.handle("bumbee-studio:run-workers", (_event, payload) => runBumbeeStudioWorkers(payload));
  ipcMain.handle("bumbee-studio:approve-action", (_event, payload) => approveBumbeeStudioAction(payload));
  ipcMain.handle("bumbee-studio:run-gateway-action", (_event, payload) => runBumbeeStudioGatewayAction(payload));
  ipcMain.handle("gateway:execute-live", (_event, payload) => runBumbeeStudioGatewayActionLive(payload));
  ipcMain.handle("bumbee-studio:execution-history", () => {
    const wikiMod = require("./bumbee-wiki-service");
    return wikiMod.getExecutionHistory(getBumbeeStudioFolderPath());
  });
  ipcMain.handle("bumbee-wiki:status", () => _wiki ? { ok: true, ..._wiki.status() } : { ok: false, error: "Bumbee Wiki service is not available yet" });
  ipcMain.handle("bumbee-os:status", () => _bumbeeOsStore.status());
  ipcMain.handle("bumbee-os:list", () => _bumbeeOsStore.list());
  ipcMain.handle("bumbee-os:seed-demo", () => _bumbeeOsStore.seedDemo());
  ipcMain.handle("bumbee-os:add-work-item", (_event, payload) => _bumbeeOsStore.addWorkItem(payload));
  ipcMain.handle("bumbee-os:add-idea-note", (_event, payload) => _bumbeeOsStore.addIdeaNote(payload));
  ipcMain.handle("bumbee-os:build-daily-digest", (_event, payload) => _bumbeeOsStore.buildDailyDigest(payload));
  ipcMain.handle("bumbee-os:build-daily-memory-review", (_event, payload) => _bumbeeOsStore.buildDailyMemoryReview(payload));
  ipcMain.handle("bumbee-os:approve-wiki-candidate", (_event, payload) => _bumbeeOsStore.approveWikiCandidate(payload));
  ipcMain.handle("bumbee-os:run-project-review-worker", (_event, payload) => _bumbeeOsStore.runProjectReviewWorker(payload));
  ipcMain.handle("bumbee-os:companion-chat", (_event, payload) => _bumbeeOsStore.companionChat(payload));
  ipcMain.handle("bumbee-os:propose-capability-upgrade", (_event, payload) => _bumbeeOsStore.proposeCapabilityUpgrade(payload));
  ipcMain.handle("bumbee-os:add-workspace-connection", (_event, payload) => _bumbeeOsStore.addWorkspaceConnection(payload));
  ipcMain.handle("bumbee-os:add-team-member", (_event, payload) => _bumbeeOsStore.addTeamMember(payload));
  ipcMain.handle("bumbee-os:build-ops-dashboard", (_event, payload) => _bumbeeOsStore.buildOpsDashboard(payload));
  ipcMain.handle("bumbee-os:create-command-session", (_event, payload) => _bumbeeOsStore.createCommandSession(payload));
  ipcMain.handle("bumbee-os:add-command-message", (_event, payload) => _bumbeeOsStore.addCommandMessage(payload));
  ipcMain.handle("bumbee-os:add-clip", (_event, payload) => _bumbeeOsStore.addClip(payload));
  ipcMain.handle("bumbee-os:add-vocabulary", (_event, payload) => _bumbeeOsStore.addVocabulary(payload));
  ipcMain.handle("bumbee-os:add-user-profile", (_event, payload) => _bumbeeOsStore.addUserProfile(payload));
  ipcMain.handle("bumbee-os:add-publisher-profile", (_event, payload) => _bumbeeOsStore.addPublisherProfile(payload));
  ipcMain.handle("bumbee-os:queue-action", (_event, payload) => _bumbeeOsStore.queueAction(payload));
  ipcMain.handle("bumbee-os:create-sepay-payment-intent", (_event, payload) => _bumbeeOsStore.createSepayPaymentIntent(payload));
  ipcMain.handle("bumbee-os:record-sepay-notification", (_event, payload) => _bumbeeOsStore.recordSepayNotification(payload));
  ipcMain.handle("bumbee-os:export-sql-dump", () => _bumbeeOsStore.exportSqlDump());
  ipcMain.handle("bumbee-os:update-settings", (_event, payload) => _bumbeeOsStore.updateSettings(payload));
  ipcMain.handle("bumbee-system:bootstrap-status", () => _bumbeeSystemBootstrap.status());
  ipcMain.handle("bumbee-system:sync-skills", async (_event, payload) => {
    const result = await _bumbeeSystemBootstrap.sync(payload || {});
    notifyBumbeeSystemBootstrap(result);
    return result;
  });
  ipcMain.handle("bumbee-chat:vision-audio", (_event, payload) => transcribeVisionAudio(payload));
  ipcMain.handle("bumbee-vocab:list", () => listVocabItems());
  ipcMain.handle("bumbee-vocab:add", (_event, payload) => addVocabItems(payload));
  ipcMain.handle("bumbee-vocab:review", (_event, payload) => reviewVocabItem(payload));
  ipcMain.handle("bumbee-vocab:reset", () => resetVocabScores());
  ipcMain.handle("bumbee-vocab:settings", (_event, payload) => updateVocabSettings(payload));
  ipcMain.handle("vocab:extract", (_event, text) => extractVocabCandidates(text));
  ipcMain.handle("vocab:swipe", (_event, payload) => recordVocabSwipe(payload));
  ipcMain.handle("vocab:review-tasks", () => getVocabReviewTasks());
  ipcMain.handle("vocab:grade", (_event, payload) => gradeVocabReview(payload));
  ipcMain.handle("vocab:list", () => require("./vocab-library").listLibrary());
  ipcMain.handle("vocab:dashboard", () => getVocabDashboard());
  ipcMain.handle("vocab:donation-status", (_event, payload) => checkDonationStatus(payload));
  ipcMain.handle("vocab:open-settings", () => {
    openDonationSettings();
    return { ok: true };
  });
  ipcMain.handle("vocab:open-donate", () => openBumbeeDonate());
  // ── Vocab auto-challenge popup (Phase 1) ──
  ipcMain.handle("vocab-challenge:next", (_event, opts = {}) => {
    const round = buildChallengeRound({ reverse: opts.reverse, gameType: opts.gameType, strict: false });
    return round || { ok: false, empty: true };
  });
  // Khung game từ vựng siêu trí nhớ (song song game câu)
  ipcMain.handle("vocab-challenge:next-word", (_event, opts = {}) => {
    const round = buildWordMemoryRound({ excludeId: opts.excludeId });
    return round || { ok: false, empty: true };
  });
  // Dải gợi ý cụm giao tiếp mới
  ipcMain.handle("vocab-challenge:suggest", () => buildPhraseSuggestion() || { ok: false });
  // User types an unknown word/phrase in the popup → AI enriches it into the vocab db
  ipcMain.handle("vocab-challenge:add", async (_event, payload = {}) => {
    const term = String(payload.term || "").trim().slice(0, 80);
    if (!term) return { ok: false, reason: "empty" };
    try {
      const res = await addVocabItems({ terms: [term], source: "challenge-popup", text: String(payload.note || "") });
      const item = res.items && res.items[0];
      return {
        ok: true, created: res.created.length, existed: res.created.length === 0, total: res.total,
        item: item ? {
          term: item.term,
          meaning_vi: item.lesson?.meaning_vi || "",
          meaning_en: item.lesson?.meaning_en || item.lesson?.meaning || "",
          pronunciation: item.lesson?.pronunciation || "",
          example: (Array.isArray(item.lesson?.examples) && item.lesson.examples[0]) || "",
        } : null,
      };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e).slice(0, 120) };
    }
  });
  ipcMain.handle("vocab-challenge:answer", (_event, payload = {}) => {
    const res = reviewVocabItem({ id: payload.id, correct: !!payload.correct });
    const core = require("./english-game-core");
    return { ok: !!res.ok, player: res.ok ? core.getPlayerLevel(res.words) : null };
  });
  ipcMain.handle("vocab-challenge:snooze", (_event, minutes) => {
    const m = Number.isFinite(minutes) ? Math.max(1, Math.min(240, minutes)) : 30;
    challengeSnoozeUntil = Date.now() + m * 60 * 1000;
    closeVocabChallenge();
    return { ok: true, snoozeMin: m };
  });
  ipcMain.handle("vocab-challenge:close", () => { closeVocabChallenge(); return { ok: true }; });
  ipcMain.handle("vocab-challenge:get-config", () => ({
    ok: true, auto: vocabAutoChallenge, reverse: vocabReverseMode, gameType: vocabGameType, intervalMin: vocabChallengeIntervalMin,
  }));
  ipcMain.handle("vocab-challenge:set-config", (_event, cfg = {}) => setVocabChallengeConfig(cfg));
  ipcMain.on("open-vocab-challenge", () => openVocabChallenge());
  // ── Vocab auto-source (Phase 2) ──
  ipcMain.handle("vocab-source:grab-clipboard", () => ensureAutoSource().grabClipboard(true));
  ipcMain.handle("vocab-source:add-url", (_event, url) => ensureAutoSource().addFromUrl(url));
  ipcMain.handle("vocab-source:add-text", (_event, text) => addVocabFromText(text, "manual"));
  ipcMain.handle("vocab-source:get-config", () => ({ ok: true, auto: vocabAutoSource, intervalSec: vocabAutoSourceIntervalSec }));
  ipcMain.handle("vocab-source:set-config", (_event, cfg = {}) => {
    if (typeof cfg.auto === "boolean") setVocabAutoSource(cfg.auto);
    if (Number.isFinite(cfg.intervalSec)) { vocabAutoSourceIntervalSec = Math.max(15, Math.min(600, Math.round(cfg.intervalSec))); savePrefs(); }
    return { ok: true, auto: vocabAutoSource, intervalSec: vocabAutoSourceIntervalSec };
  });
  ipcMain.handle("vision:start-capture", (_event, opts) => { _visionCapture.start(opts); return { ok: true }; });
  ipcMain.handle("vision:stop-capture", () => { _visionCapture.stop(); return { ok: true }; });
  ipcMain.handle("vision:status", () => _visionCapture.stats());
  ipcMain.handle("vision:capture-now", () => _visionCapture.captureNow());
  ipcMain.handle("vision:screen-context", () => _visionCapture.getScreenContext());
  ipcMain.handle("vision:dwell-summary", () => _visionCapture.getDwellSummary());

  // ── Business Ops Pipeline ──
  const _pipeline = require("./business-ops-pipeline");
  const _pipelineCtx = {
    runGatewaySkill: async (skillName, inputData) => {
      const wikiMod = require("./bumbee-wiki-service");
      return wikiMod.runRawGatewaySkill(getBumbeeStudioFolderPath(), skillName, inputData, {
        gatewayToken: readTokenFile(getBumbeeTokenFilePath()),
        gatewayBaseUrl: process.env.BUMBEE_GATEWAY_URL || "https://gateway.bumbee.asia",
      });
    },
  };
  ipcMain.handle("pipeline:status", (_event, date) => _pipeline.getStepStatus(getBumbeeStudioFolderPath(), date));
  ipcMain.handle("pipeline:run-step", (_event, { step, date }) => _pipeline.runStep(getBumbeeStudioFolderPath(), step, _pipelineCtx, date));
  ipcMain.handle("pipeline:run-full", (_event, date) => _pipeline.runFullPipeline(getBumbeeStudioFolderPath(), _pipelineCtx, date));
  ipcMain.handle("pipeline:approve", (_event, { date, reason }) => _pipeline.approvePipeline(getBumbeeStudioFolderPath(), date, reason));
  ipcMain.handle("pipeline:reject", (_event, { date, reason }) => _pipeline.rejectPipeline(getBumbeeStudioFolderPath(), date, reason));

  // ── Scene Viewer ──
  ipcMain.handle("scene:load-config", () => {
    const studioRoot = getBumbeeStudioFolderPath();
    const configPath = path.join(studioRoot, "scenes", "sample-scene", "scene.config.json");
    try { return JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { return null; }
  });
  ipcMain.handle("scene:list", () => {
    const studioRoot = getBumbeeStudioFolderPath();
    const scenesDir = path.join(studioRoot, "scenes");
    try {
      return fs.readdirSync(scenesDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
          const cfgPath = path.join(scenesDir, d.name, "scene.config.json");
          try { const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); return { id: d.name, ...cfg }; } catch { return { id: d.name }; }
        });
    } catch { return []; }
  });
  ipcMain.handle("scene:open-viewer", () => { openSceneViewer(); return { ok: true }; });

  ipcMain.handle("phase:status", () => require("./phase-runtime").phaseStatus(app.getPath("userData")));
  ipcMain.handle("phase:seed-all", () => {
    const runtime = require("./phase-runtime");
    const router = require("./bumbee-event-router");
    const seeded = runtime.seedFullSystem(app.getPath("userData"));
    seeded.router = router.ensureDefaultRouter(EVENT_ROUTER_PATH);
    return { ok: true, seeded, status: runtime.phaseStatus(app.getPath("userData")) };
  });
  ipcMain.handle("phase:gateway-dry-run", () => {
    const runtime = require("./phase-runtime");
    const result = runtime.seedGatewayDryRun();
    emitSemanticEvent("digest.money_todo.ready", {
      item_count: result.count,
      source: "phase-hub-gateway-dry-run",
    });
    return result;
  });
  ipcMain.handle("phase:seed-business-artifacts", () => {
    const runtime = require("./phase-runtime");
    const result = runtime.seedBusinessArtifacts();
    emitSemanticEvent("business.video.render.done", {
      source: "phase-hub-business-artifact-fixture",
      dry_run: true,
    });
    return result;
  });
  ipcMain.handle("phase:sync-studio", async () => syncBumbeeStudio({ force: true }));
  ipcMain.handle("phase:open-donate", () => openBumbeeDonate());
  ipcMain.handle("phase:open-donation-settings", () => {
    openDonationSettings();
    return { ok: true };
  });
  ipcMain.handle("phase:emit-event", (_event, payload) => emitSemanticEvent(payload?.type || "digest.money_todo.ready", payload?.payload || {}));
  ipcMain.handle("phase:manual-activity", (_event, payload) => {
    const result = require("./phase-runtime").appendManualActivity(undefined, payload || {});
    emitSemanticEvent("idea_matrix.entry.created", {
      tag: payload?.tag || "co_hoi",
      title: payload?.title || "Manual watcher signal",
      priority_boost: !!payload?.priority_boost,
    });
    return result;
  });
  ipcMain.handle("phase:open-vocab", () => {
    openVocabTinder();
    return { ok: true };
  });
  ipcMain.handle("phase:open-vision", () => {
    openBumbeeVision();
    return { ok: true };
  });
  ipcMain.handle("settings:donation:load", () => loadDonationSettings());
  ipcMain.handle("settings:donation:save", (_event, payload) => saveDonationSettings(payload));
  ipcMain.on("bumbee-coach:event", (_event, payload) => {
    const type = typeof payload?.type === "string" ? payload.type : "prompt";
    triggerCoachInteraction(type, payload || {});
    scheduleCoachReminder(COACH_IDLE_PROMPT_MS);
  });

  initFocusHelper();
  startMainTick();
  startHttpServer();
  startStaleCleanup();
  // Wait for renderer to be ready before sending initial state
  // If hooks arrived during startup, respect them instead of forcing idle
  // Also handles crash recovery (render-process-gone → reload)
  win.webContents.on("did-finish-load", () => {
    sendAppearance();
    // Restore Live2D / VRM skin if user had one selected last session
    const restored = _skinScanner.findById(characterSkin) || { id: "clawd", type: "svg" };
    sendToRenderer("skin-change", restored);
    if (_mini.getMiniMode()) {
      sendToRenderer("mini-mode-change", true, _mini.getMiniEdge());
    sendToHitWin("hit-state-sync", { miniMode: true });
    }
    if (doNotDisturb) {
      sendToRenderer("dnd-change", true);
    sendToHitWin("hit-state-sync", { dndEnabled: true });
      if (_mini.getMiniMode()) {
        applyState("mini-sleep");
      } else {
        applyState("sleeping");
      }
    } else if (_mini.getMiniMode()) {
      applyState("mini-idle");
    } else if (sessions.size > 0) {
      const resolved = resolveDisplayState();
      applyState(resolved, getSvgOverride(resolved));
    } else {
      applyState("idle", "clawd-idle-follow.svg");
      // Startup recovery: delay 5s to let HWND/z-order/drag systems stabilize,
      // then detect running Claude Code processes → suppress sleep sequence
      setTimeout(() => {
        if (sessions.size > 0 || doNotDisturb) return; // hook arrived during wait
        detectRunningAgentProcesses((found) => {
          if (found && sessions.size === 0 && !doNotDisturb) {
            _startStartupRecovery();
            resetIdleTimer();
          }
        });
      }, 5000);
    }
  });

  // ── Crash recovery: renderer process can die from <object> churn ──
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer crashed:", details.reason);
    dragLocked = false;
    idlePaused = false;
    mouseOverPet = false;
    if (canUseWebContents(win)) win.webContents.reload();
  });

  guardAlwaysOnTop(win);
  startTopmostWatchdog();

  // ── Display change: re-clamp window to prevent off-screen ──
  screen.on("display-metrics-changed", () => {
    reapplyMacVisibility();
    if (!win || win.isDestroyed()) return;
    if (_mini.getMiniMode()) {
      _mini.handleDisplayChange();
      return;
    }
    const { x, y, width, height } = win.getBounds();
    const clamped = clampToScreen(x, y, width, height);
    if (clamped.x !== x || clamped.y !== y) {
      win.setBounds({ ...clamped, width, height });
    }
  });
  screen.on("display-removed", () => {
    reapplyMacVisibility();
    if (!win || win.isDestroyed()) return;
    if (_mini.getMiniMode()) {
      exitMiniMode();
      return;
    }
    const { x, y, width, height } = win.getBounds();
    const clamped = clampToScreen(x, y, width, height);
    win.setBounds({ ...clamped, width, height });
  });
  screen.on("display-added", () => {
    reapplyMacVisibility();
  });
}

function getNearestWorkArea(cx, cy) {
  const displays = screen.getAllDisplays();
  let nearest = displays[0].workArea;
  let minDist = Infinity;
  for (const d of displays) {
    const wa = d.workArea;
    const dx = Math.max(wa.x - cx, 0, cx - (wa.x + wa.width));
    const dy = Math.max(wa.y - cy, 0, cy - (wa.y + wa.height));
    const dist = dx * dx + dy * dy;
    if (dist < minDist) { minDist = dist; nearest = wa; }
  }
  return nearest;
}

function clampToScreen(x, y, w, h) {
  const nearest = getNearestWorkArea(x + w / 2, y + h / 2);
  const mLeft  = Math.round(w * 0.25);
  const mRight = Math.round(w * 0.25);
  const mTop   = Math.round(h * 0.6);
  const mBot   = Math.round(h * 0.04);
  return {
    x: Math.max(nearest.x - mLeft, Math.min(x, nearest.x + nearest.width - w + mRight)),
    y: Math.max(nearest.y - mTop,  Math.min(y, nearest.y + nearest.height - h + mBot)),
  };
}

// ── Mini Mode — initialized here after state module ──
const _miniCtx = {
  get win() { return win; },
  get currentSize() { return currentSize; },
  get doNotDisturb() { return doNotDisturb; },
  set doNotDisturb(v) { doNotDisturb = v; },
  SIZES,
  sendToRenderer,
  sendToHitWin,
  syncHitWin,
  applyState,
  resolveDisplayState,
  getSvgOverride,
  stopWakePoll,
  clampToScreen,
  getNearestWorkArea,
  get bubbleFollowPet() { return bubbleFollowPet; },
  get pendingPermissions() { return pendingPermissions; },
  repositionBubbles: () => repositionBubbles(),
  buildContextMenu: () => buildContextMenu(),
  buildTrayMenu: () => buildTrayMenu(),
};
const _mini = require("./mini")(_miniCtx);
const { enterMiniMode, exitMiniMode, enterMiniViaMenu, miniPeekIn, miniPeekOut,
        checkMiniModeSnap, cancelMiniTransition, animateWindowX, animateWindowParabola } = _mini;

// Convenience getters for mini state (used throughout main.js)
Object.defineProperties(this || {}, {}); // no-op placeholder
// Mini state is accessed via _mini getters in ctx objects below

// ── Auto-install VS Code / Cursor terminal-focus extension ──
const EXT_ID = "clawd.clawd-terminal-focus";
const EXT_VERSION = "0.1.0";
const EXT_DIR_NAME = `${EXT_ID}-${EXT_VERSION}`;

function installTerminalFocusExtension() {
  const os = require("os");
  const home = os.homedir();

  // Extension source — in dev: ../extensions/vscode/, in packaged: app.asar.unpacked/
  let extSrc = path.join(__dirname, "..", "extensions", "vscode");
  extSrc = extSrc.replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);

  if (!fs.existsSync(extSrc)) {
    console.log("Clawd: terminal-focus extension source not found, skipping auto-install");
    return;
  }

  const targets = [
    path.join(home, ".vscode", "extensions"),
    path.join(home, ".cursor", "extensions"),
  ];

  const filesToCopy = ["package.json", "extension.js"];
  let installed = 0;

  for (const extRoot of targets) {
    if (!fs.existsSync(extRoot)) continue; // editor not installed
    const dest = path.join(extRoot, EXT_DIR_NAME);
    // Skip if already installed (check package.json exists)
    if (fs.existsSync(path.join(dest, "package.json"))) continue;
    try {
      fs.mkdirSync(dest, { recursive: true });
      for (const file of filesToCopy) {
        fs.copyFileSync(path.join(extSrc, file), path.join(dest, file));
      }
      installed++;
      console.log(`Clawd: installed terminal-focus extension to ${dest}`);
    } catch (err) {
      console.warn(`Clawd: failed to install extension to ${dest}:`, err.message);
    }
  }
  if (installed > 0) {
    console.log(`Clawd: terminal-focus extension installed to ${installed} editor(s). Restart VS Code/Cursor to activate.`);
  }
}

// ── Single instance lock ──
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // Another instance is already running — quit silently
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      win.showInactive();
      if (isLinux) win.setSkipTaskbar(true);
    }
    if (hitWin && !hitWin.isDestroyed()) {
      hitWin.showInactive();
      if (isLinux) hitWin.setSkipTaskbar(true);
    }
    reapplyMacVisibility();
  });

  // macOS: hide dock icon early if user previously disabled it
  if (isMac && app.dock) {
    const prefs = loadPrefs();
    if (prefs && prefs.showDock === false) {
      app.dock.hide();
    }
  }

  app.whenReady().then(() => {
    permDebugLog = path.join(app.getPath("userData"), "permission-debug.log");
    updateDebugLog = path.join(app.getPath("userData"), "update-debug.log");
    if (isMac && systemPreferences?.askForMediaAccess) {
      systemPreferences.askForMediaAccess("microphone").catch(() => {});
      systemPreferences.askForMediaAccess("camera").catch(() => {});
    }
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      return canGrantMediaPermission(webContents, permission);
    });
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (canGrantMediaPermission(webContents, permission)) {
        callback(true);
        return;
      }
      callback(false);
    });
    configureDisplayCapturePermissions(session.defaultSession);
    createWindow();
    if (LEARN_ON_START) {
      setTimeout(() => {
        if (!app.isQuitting) openBumbeeChat();
      }, 900);
      setTimeout(() => {
        if (!isQuitting) triggerCoachInteraction("welcome");
      }, COACH_FIRST_PROMPT_MS);
      scheduleCoachReminder(COACH_IDLE_PROMPT_MS);
    }

    // Register global shortcut for toggling pet visibility
    registerToggleShortcut();

    // Auto-register Claude Code hooks on every launch (dedup-safe)
    syncClawdHooks();
    if (assistantMode24x7) {
      setAssistantMode24x7(true);
    }

    // Start Codex CLI JSONL log monitor
    try {
      const CodexLogMonitor = require("../agents/codex-log-monitor");
      const codexAgent = require("../agents/codex");
      _codexMonitor = new CodexLogMonitor(codexAgent, (sid, state, event, extra) => {
        if (state === "codex-permission") {
          updateSession(sid, "notification", event, null, extra.cwd, null, null, null, "codex");
          showCodexNotifyBubble({
            sessionId: sid,
            command: extra.permissionDetail?.command || "",
          });
          return;
        }
        // Non-permission event — clear any lingering Codex notify bubbles
        clearCodexNotifyBubbles(sid);
        updateSession(sid, state, event, null, extra.cwd, null, null, null, "codex");
      });
      _codexMonitor.start();
    } catch (err) {
      console.warn("Clawd: Codex log monitor not started:", err.message);
    }

    // Auto-install VS Code/Cursor terminal-focus extension
    try { installTerminalFocusExtension(); } catch (err) {
      console.warn("Clawd: failed to auto-install terminal-focus extension:", err.message);
    }

    // Auto-updater: setup event handlers + silent check after 5s
    setupAutoUpdater();
    setTimeout(() => checkForUpdates(false), 5000);
    setTimeout(() => {
      _bumbeeSystemBootstrap.sync({ reason: "app-startup" })
        .then((result) => {
          console.log(`Clawd: Bumbee system bootstrap ${result.status}`);
          notifyBumbeeSystemBootstrap(result);
        })
        .catch((err) => console.warn("Clawd: Bumbee system bootstrap failed:", err.message));
    }, 2500);

    // Start rabbit popup scheduler (runs only if user enabled it via menu)
    _rabbit.start();

    // Start vocab auto-challenge scheduler (pops only if user enabled it)
    startChallengeScheduler();

    // Start vocab auto-source watcher (mines clipboard only if user enabled it)
    ensureAutoSource().start();

    // ── Bumbee integration: skills loader + clawdbot bridge + gateway register + smart layer ──
    try {
      _clawdbot = require("./clawdbot-bridge")({});
      _clawdbot.start();
    } catch (e) {
      console.warn("Clawd: clawdbot bridge init failed:", e.message);
    }
    try {
      _skills = require("./skills-loader")({ clawdbot: _clawdbot });
      _skills.start();
    } catch (e) {
      console.warn("Clawd: skills loader init failed:", e.message);
    }
    try {
      _wiki = require("./bumbee-wiki-service")({
        folder: getBumbeeWikiFolderPath(),
        studioFolder: getBumbeeStudioFolderPath(),
        tokenFile: getBumbeeWikiTokenFilePath(),
        deviceId: CHAT_DEVICE_ID,
        deviceName: os.hostname(),
      });
      _wiki.start();
    } catch (e) {
      console.warn("Clawd: Bumbee Wiki init failed:", e.message);
    }
    try {
      initBumbeeSmartLayer();
    } catch (e) {
      console.warn("Clawd: intelligent layer init failed:", e.message);
    }
    try {
      _gateway = require("./gateway-client")({ upstreamPort: getHookServerPort() });
      // Defer 2s to ensure local HTTP server is listening before announcing to gateway
      setTimeout(() => _gateway.start(), 2000);
    } catch (e) {
      console.warn("Clawd: gateway client init failed:", e.message);
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (coachReminderTimer) clearTimeout(coachReminderTimer);
    savePrefs();
    unregisterToggleShortcut();
    globalShortcut.unregisterAll();
    _perm.cleanup();
    _server.cleanup();
    _state.cleanup();
    _tick.cleanup();
    _visionCapture.cleanup();
    _mini.cleanup();
    _rabbit.cleanup();
    if (_codexMonitor) _codexMonitor.stop();
    if (_gateway) { try { _gateway.cleanup(); } catch {} }
    if (_clawdbot) { try { _clawdbot.cleanup(); } catch {} }
    stopTopmostWatchdog();
    if (hwndRecoveryTimer) { clearTimeout(hwndRecoveryTimer); hwndRecoveryTimer = null; }
    _focus.cleanup();
    if (hitWin && !hitWin.isDestroyed()) hitWin.destroy();
    if (chatWin && !chatWin.isDestroyed()) chatWin.destroy();
    if (visionWin && !visionWin.isDestroyed()) visionWin.destroy();
    if (vocabWin && !vocabWin.isDestroyed()) vocabWin.destroy();
    if (phaseHubWin && !phaseHubWin.isDestroyed()) phaseHubWin.destroy();
    if (bumbeeOsWin && !bumbeeOsWin.isDestroyed()) bumbeeOsWin.destroy();
  });

  app.on("window-all-closed", () => {
    if (!isQuitting) return;
    app.quit();
  });
}
