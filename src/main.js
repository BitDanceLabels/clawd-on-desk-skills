const { app, BrowserWindow, screen, Menu, ipcMain, globalShortcut, session } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isWin = process.platform === "win32";
const LINUX_WINDOW_TYPE = "toolbar";


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

let lang = "en";

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
const DEFAULT_TOGGLE_SHORTCUT = "CommandOrControl+Shift+Alt+C";
const CHAT_AUTO_HIDE_MS = Number.parseInt(process.env.BUMBEE_CHAT_AUTO_HIDE_MS || "15000", 10);
const CHAT_DEVICE_ID = process.env.BUMBEE_DEVICE_ID || `${os.hostname()}-${process.platform}`;
const CHAT_SESSION_ID = `desk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const CHAT_AUTH_SERVER_URL = (process.env.BUMBEE_DESK_AUTH_URL || process.env.TOKEN_ADMIN_URL || "https://gateway.bumbee.asia/bumbee-desk-token-admin").replace(/\/$/, "");
const VOCAB_DB_PATH = path.join(app.getPath("userData"), "bumbee-english-vocab.json");
const LEARN_ON_START = process.env.BUMBEE_LEARN_ON_START !== "0";

const STARTER_VOCAB = [
  ["coherent argument", "IELTS", "A clear argument where ideas connect logically.", "My presentation needs a coherent argument, not just random opinions."],
  ["evaluate evidence", "IELTS", "To judge how strong or useful evidence is.", "Before we decide, we should evaluate the evidence."],
  ["balanced conclusion", "IELTS", "A conclusion that fairly considers both sides.", "A balanced conclusion makes your essay sound mature."],
  ["limited perspective", "IELTS", "A narrow way of looking at a problem.", "That plan has a limited perspective because it ignores customers."],
  ["follow up", "Work", "To contact someone again after a previous conversation.", "I will follow up with the client tomorrow."],
  ["align expectations", "Work", "To make sure everyone agrees on what should happen.", "Let's align expectations before we start the sprint."],
  ["clarify scope", "Work", "To make the boundaries of a task or project clear.", "Can we clarify the scope before quoting the price?"],
  ["action item", "Work", "A task someone agrees to do after a meeting.", "My action item is to send the proposal today."],
  ["catch up", "Social", "To talk with someone after not seeing them for a while.", "Let's catch up over coffee this weekend."],
  ["small talk", "Social", "Light conversation used to start social interaction.", "Small talk helps make meetings feel warmer."],
  ["awkward silence", "Social", "An uncomfortable moment when nobody speaks.", "I asked a funny question to break the awkward silence."],
  ["keep in touch", "Social", "To continue communicating with someone.", "It was great meeting you. Let's keep in touch."],
  ["plot twist", "Funny", "An unexpected change in a story or situation.", "Plot twist: the quiet intern fixed the whole system."],
  ["coffee-powered", "Funny", "Jokingly driven by coffee and energy.", "Our Monday meeting was completely coffee-powered."],
  ["tiny victory", "Funny", "A small win that still feels good.", "Remembering this word is today's tiny victory."],
  ["suspiciously productive", "Funny", "So productive that it feels surprising or funny.", "You finished all tasks before lunch. Suspiciously productive."],
];

const VOCAB_DIFFICULTY_RULES = {
  easy: { gain: 10, loss: 24, masterScore: 92, masterStreak: 5, correctHourBase: 4, wrongHours: 1 },
  medium: { gain: 8, loss: 22, masterScore: 94, masterStreak: 6, correctHourBase: 6, wrongHours: 2 },
  hard: { gain: 6, loss: 20, masterScore: 96, masterStreak: 8, correctHourBase: 8, wrongHours: 3 },
  expert: { gain: 5, loss: 18, masterScore: 98, masterStreak: 10, correctHourBase: 10, wrongHours: 4 },
};

function getVocabDifficultyRules(level) {
  return VOCAB_DIFFICULTY_RULES[level] || VOCAB_DIFFICULTY_RULES.medium;
}

function starterLesson(term, category, meaning, example) {
  return {
    meaning_vi: `${category}: ${meaning}`,
    pronunciation: "",
    examples: [
      example,
      `Can you make a natural sentence with "${term}"?`,
      `Use "${term}" in a ${category.toLowerCase()} conversation.`,
    ],
    quiz: [
      { type: "recall", prompt: `Make one natural sentence with "${term}".`, answer: example },
      { type: "meaning", prompt: `What does "${term}" mean in this context?`, answer: meaning },
    ],
  };
}

function buildStarterWords() {
  const now = new Date().toISOString();
  return STARTER_VOCAB.map(([term, category, meaning, example], index) => ({
    id: `starter-${index + 1}-${term.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    term,
    score: 0,
    streak: 0,
    mistake_count: 0,
    review_count: 0,
    mastered: false,
    level: category === "IELTS" ? "hard" : "medium",
    sources: [`starter-${category.toLowerCase()}`],
    lesson: starterLesson(term, category, meaning, example),
    created_at: now,
    updated_at: now,
    last_reviewed: null,
    next_review: now,
  }));
}

function ensureStarterVocab(db) {
  if (db.words && db.words.length > 0) return db;
  return { ...db, words: buildStarterWords() };
}

function getBumbeeTokenFilePath() {
  return path.join(app.getPath("userData"), "bumbee-gateway-token.txt");
}

function initBumbeeSmartLayer() {
  _smart = require("./intelligent-layer")({
    chatAuthTokenFile: getBumbeeTokenFilePath(),
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
    return { ok: true, email, tokenFile: tokenPath, expires_at: result.expires_at || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function logoutBumbeeChat() {
  try { fs.unlinkSync(getBumbeeTokenFilePath()); } catch {}
  reloadBumbeeSmartLayer();
  return { ok: true };
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
    version: 1,
    updated_at: new Date().toISOString(),
    settings: {
      nativeLanguage: "vi",
      targetLanguage: "en",
      goal: "business conversation",
      dailyWords: 8,
      difficulty: "medium",
      monthlyReset: true,
    },
    last_reset_month: new Date().toISOString().slice(0, 7),
    words: [],
  };
}

function readVocabDb() {
  try {
    const data = JSON.parse(fs.readFileSync(VOCAB_DB_PATH, "utf8"));
    const db = {
      ...defaultVocabDb(),
      ...data,
      settings: { ...defaultVocabDb().settings, ...(data.settings || {}) },
      words: Array.isArray(data.words) ? data.words : [],
    };
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
    }
    return ensureStarterVocab(db);
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

function fallbackLesson(term, settings) {
  const goal = settings.goal || "daily conversation";
  return {
    meaning_vi: `Từ/cụm từ cần học trong ngữ cảnh: ${goal}.`,
    pronunciation: "",
    examples: [
      `I want to use "${term}" in a real conversation.`,
      `Can you explain "${term}" with a simple example?`,
      `Let's practice "${term}" at work.`,
    ],
    quiz: [
      { type: "recall", prompt: `Nói một câu tiếng Anh có dùng "${term}".`, answer: term },
      { type: "meaning", prompt: `"${term}" dùng trong ngữ cảnh nào?`, answer: goal },
    ],
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
        "JSON shape: {\"meaning_vi\":\"...\",\"pronunciation\":\"...\",\"examples\":[\"easy sentence\",\"work sentence\",\"hard sentence\"],\"quiz\":[{\"type\":\"recall\",\"prompt\":\"...\",\"answer\":\"...\"},{\"type\":\"fill_blank\",\"prompt\":\"...\",\"answer\":\"...\"}]}",
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
      meaning_vi: String(parsed.meaning_vi || lesson.meaning_vi).slice(0, 500),
      pronunciation: String(parsed.pronunciation || "").slice(0, 120),
      examples: Array.isArray(parsed.examples) ? parsed.examples.slice(0, 6).map((x) => String(x).slice(0, 240)) : lesson.examples,
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
  for (const term of terms) {
    const key = term.toLowerCase();
    if (existing.has(key)) {
      const current = existing.get(key);
      current.updated_at = new Date().toISOString();
      current.sources = Array.from(new Set([...(current.sources || []), source])).slice(0, 8);
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
  }
  writeVocabDb(db);
  return { ok: true, created, total: db.words.length, db };
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

  const width = 440;
  const height = 660;
  const bounds = getChatBoundsNearPet(width, height);
  chatWin = new BrowserWindow({
    width,
    height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 380,
    minHeight: 520,
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

function sendToRenderer(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
  if (channel === "state-change" && _clawdbot) {
    try {
      const sid = _state ? _state.getActiveSessionId?.() : null;
      const sessionData = sid && sessions ? sessions.get(sid) : null;
      _clawdbot.onStateChange(args[0], sessionData ? { id: sid, ...sessionData } : null);
    } catch {}
  }
}
function sendToHitWin(channel, ...args) {
  if (hitWin && !hitWin.isDestroyed()) hitWin.webContents.send(channel, ...args);
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

// ── Terminal focus — delegated to src/focus.js ──
const _focus = require("./focus")({ _allowSetForeground });
const { initFocusHelper, killFocusHelper, focusTerminalWindow, clearMacFocusCooldownTimer } = _focus;

// ── HTTP server — delegated to src/server.js ──
const _serverCtx = {
  get autoStartWithClaude() { return autoStartWithClaude; },
  get doNotDisturb() { return doNotDisturb; },
  get hideBubbles() { return hideBubbles; },
  get pendingPermissions() { return pendingPermissions; },
  get PASSTHROUGH_TOOLS() { return PASSTHROUGH_TOOLS; },
  get STATE_SVGS() { return STATE_SVGS; },
  get sessions() { return sessions; },
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

// Expose to server context
_serverCtx.showExternalNotification = showExternalNotification;
Object.defineProperty(_serverCtx, "gateway", { get: () => _gateway, configurable: true });
Object.defineProperty(_serverCtx, "clawdbot", { get: () => _clawdbot, configurable: true });
Object.defineProperty(_serverCtx, "skills", { get: () => _skills, configurable: true });
Object.defineProperty(_serverCtx, "smart", { get: () => _smart, configurable: true });

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
  openBumbeeChat,
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
      win.webContents.reload();
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
      hitWin.webContents.reload();
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

  ipcMain.on("show-session-menu", () => {
    popupMenuAt(Menu.buildFromTemplate(buildSessionSubmenu()));
  });

  ipcMain.on("bubble-height", (event, height) => _perm.handleBubbleHeight(event, height));
  ipcMain.on("move-bubble-by", (event, dx, dy) => _perm.handleMoveBubble(event, dx, dy));
  ipcMain.on("permission-decide", (event, behavior) => _perm.handleDecide(event, behavior));
  ipcMain.handle("bumbee-chat:send", (_event, payload) => sendBumbeeChat(payload));
  ipcMain.on("bumbee-chat:activity", (_event, payload) => updateBumbeeChatActivity(payload));
  ipcMain.handle("bumbee-chat:status", () => getSmartStatusPayload());
  ipcMain.handle("bumbee-chat:sessions", () => ({ ok: true, sessions: getSessionPayload() }));
  ipcMain.handle("bumbee-chat:login-request", (_event, payload) => requestBumbeeLoginCode(payload));
  ipcMain.handle("bumbee-chat:login-verify", (_event, payload) => verifyBumbeeLoginCode(payload));
  ipcMain.handle("bumbee-chat:logout", () => logoutBumbeeChat());
  ipcMain.handle("bumbee-vocab:list", () => listVocabItems());
  ipcMain.handle("bumbee-vocab:add", (_event, payload) => addVocabItems(payload));
  ipcMain.handle("bumbee-vocab:review", (_event, payload) => reviewVocabItem(payload));
  ipcMain.handle("bumbee-vocab:reset", () => resetVocabScores());
  ipcMain.handle("bumbee-vocab:settings", (_event, payload) => updateVocabSettings(payload));
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
    win.webContents.reload();
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
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents.getURL() || "";
      const isLocalAppWindow = url.startsWith("file://");
      if (isLocalAppWindow && ["media", "microphone", "camera"].includes(permission)) {
        callback(true);
        return;
      }
      callback(false);
    });
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

    // Start rabbit popup scheduler (runs only if user enabled it via menu)
    _rabbit.start();

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
  });

  app.on("window-all-closed", () => {
    if (!isQuitting) return;
    app.quit();
  });
}
