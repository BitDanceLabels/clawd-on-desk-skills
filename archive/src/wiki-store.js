// src/wiki-store.js — Local knowledge store (append-only JSONL)
// Lưu kiến thức/nghiên cứu vào ~/.clawd/wiki-knowledge.jsonl
// Push từ bất kỳ đâu: Bumbee on Desk, gateway, curl, etc.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const STORE_DIR = path.join(os.homedir(), ".clawd");
const STORE_FILE = path.join(STORE_DIR, "wiki-knowledge.jsonl");

const VALID_CATEGORIES = new Set([
  "research", "skill", "workflow", "tool", "config",
  "idea", "note", "reference", "higgsfield", "ai", "general",
]);

function ensureStore() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, "", "utf8");
  }
}

function genId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Add a knowledge entry.
 * @param {{ title, content, category, tags, source, session_id, meta }} entry
 * @returns saved record with id + created_at
 */
function add(entry) {
  ensureStore();
  const category = VALID_CATEGORIES.has(entry.category) ? entry.category : "general";
  const record = {
    id: genId(),
    title: String(entry.title || "Untitled").slice(0, 300),
    content: String(entry.content || "").slice(0, 20000),
    category,
    tags: Array.isArray(entry.tags)
      ? entry.tags.slice(0, 30).map(t => String(t).slice(0, 80).toLowerCase().trim()).filter(Boolean)
      : [],
    source: String(entry.source || "api").slice(0, 100),
    session_id: String(entry.session_id || "").slice(0, 100),
    meta: entry.meta && typeof entry.meta === "object" ? entry.meta : {},
    created_at: new Date().toISOString(),
  };
  fs.appendFileSync(STORE_FILE, JSON.stringify(record) + "\n", "utf8");
  return record;
}

/**
 * List entries with optional filters.
 * @param {{ category, tag, search, limit, offset }} opts
 */
function list(opts = {}) {
  ensureStore();
  let raw;
  try { raw = fs.readFileSync(STORE_FILE, "utf8"); }
  catch { return []; }

  const entries = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { entries.push(JSON.parse(t)); } catch { /* skip corrupt line */ }
  }

  let out = entries;
  if (opts.category) out = out.filter(e => e.category === opts.category);
  if (opts.tag) {
    const tag = String(opts.tag).toLowerCase().trim();
    out = out.filter(e => Array.isArray(e.tags) && e.tags.includes(tag));
  }
  if (opts.search) {
    const q = String(opts.search).toLowerCase();
    out = out.filter(e =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.content || "").toLowerCase().includes(q) ||
      (Array.isArray(e.tags) && e.tags.some(t => t.includes(q)))
    );
  }

  // Newest first
  out.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));

  const offset = Math.max(0, Number(opts.offset) || 0);
  const limit = Math.min(500, Math.max(1, Number(opts.limit) || 100));
  return out.slice(offset, offset + limit);
}

/** Total entry count */
function count() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    return raw.split("\n").filter(l => l.trim()).length;
  } catch { return 0; }
}

/** Clear all entries (backup first) */
function clear() {
  ensureStore();
  const backup = STORE_FILE + `.bak.${Date.now()}`;
  if (fs.existsSync(STORE_FILE)) {
    fs.copyFileSync(STORE_FILE, backup);
  }
  fs.writeFileSync(STORE_FILE, "", "utf8");
  return { cleared: true, backup };
}

/** Get a single entry by id */
function getById(id) {
  const entries = list({ limit: 500 });
  return entries.find(e => e.id === id) || null;
}

function status() {
  return {
    enabled: true,
    store_file: STORE_FILE,
    count: count(),
    categories: [...VALID_CATEGORIES],
  };
}

module.exports = { add, list, count, clear, getById, status, STORE_FILE, VALID_CATEGORIES };
