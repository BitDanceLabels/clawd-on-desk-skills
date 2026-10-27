// src/skills-loader.js — Load Bumbee skill catalog tu thu muc final-skills-mcps/
// Moi skill la 1 thu muc chua SKILL.md voi YAML frontmatter (name + description).
// Loader cache lai mot lan khi khoi dong, expose list/get/trigger.
//
// trigger() khong tu chay logic skill (skills la prompt/playbook cho LLM agent).
// Thay vao do, trigger forward toi clawdbot bridge de bot relay len Telegram chat,
// hoac return metadata cho client tu xu ly.

const fs = require("fs");
const path = require("path");

const DEFAULT_SKILLS_DIR = "/home/bumbee_workspace/awesome-bumbee-skills/final-skills-mcps";
const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/;

function parseFrontmatter(text) {
  const m = text.match(FRONTMATTER_RE);
  if (!m) return { meta: {}, body: text };
  const lines = m[1].split(/\r?\n/);
  const meta = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: m[2] };
}

function categorize(description) {
  if (!description) return "general";
  const d = description.toLowerCase();
  if (/payment|billing|sepay|stripe|thanh toan/.test(d)) return "payments";
  if (/security|auth|tailscale|\bssh\b|bao mat/.test(d)) return "security";
  if (/marketing|content|social|youtube|tiktok|facebook|instagram|posting/.test(d)) return "marketing";
  if (/notion|trello|plane|kanban|task|project|du an|quan ly/.test(d)) return "project";
  if (/video|audio|image|design|logo|thumbnail|capcut|sang tao|thiet ke/.test(d)) return "creative";
  if (/api|gateway|microservice|router|proxy|nginx|hestia/.test(d)) return "infra";
  if (/skill|claude|codex|hook|\bcli\b|telegram|bot|worker/.test(d)) return "dev";
  if (/research|nghien cuu|hoc|study|english|tieng anh|wiki/.test(d)) return "learning";
  return "general";
}

module.exports = function initSkillsLoader(opts) {
  const config = opts || {};
  const skillsDir = config.dir || process.env.BUMBEE_SKILLS_DIR || DEFAULT_SKILLS_DIR;
  const enabled = config.enabled !== false && (process.env.SKILLS_ENABLE !== "0");
  const clawdbot = config.clawdbot || null; // optional: clawdbot bridge handle for triggering

  const cache = new Map();
  let loadedAt = 0;
  let loadError = null;

  function loadSync() {
    if (!enabled) return;
    cache.clear();
    loadError = null;
    if (!fs.existsSync(skillsDir)) {
      loadError = `skills dir not found: ${skillsDir}`;
      console.warn(`Clawd: ${loadError}`);
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    } catch (e) {
      loadError = e.message;
      console.warn(`Clawd: skills loader failed: ${e.message}`);
      return;
    }
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidates = [
        "SKILL.md",
        "skill.md",
        `${entry.name}.md`,
      ];
      let skillFile = null;
      for (const cand of candidates) {
        const p = path.join(skillsDir, entry.name, cand);
        if (fs.existsSync(p)) { skillFile = p; break; }
      }
      if (!skillFile) continue;
      try {
        const text = fs.readFileSync(skillFile, "utf-8");
        const { meta, body } = parseFrontmatter(text);
        const name = meta.name || entry.name;
        const description = meta.description || "";
        cache.set(name, {
          name,
          slug: entry.name,
          description,
          category: categorize(description),
          path: skillFile,
          bodyPreview: body.slice(0, 500),
        });
        count++;
      } catch (e) {
        // skip unreadable skills
      }
    }
    loadedAt = Date.now();
    console.log(`Clawd: loaded ${count} bumbee skills from ${skillsDir}`);
  }

  function list(filter) {
    const out = [];
    for (const skill of cache.values()) {
      if (filter && filter.category && skill.category !== filter.category) continue;
      if (filter && filter.q) {
        const q = filter.q.toLowerCase();
        if (!skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q)) continue;
      }
      out.push({
        name: skill.name,
        slug: skill.slug,
        description: skill.description,
        category: skill.category,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function get(name) {
    return cache.get(name) || null;
  }

  async function trigger(name, args) {
    const skill = get(name);
    if (!skill) throw new Error(`unknown skill: ${name}`);
    const payload = {
      skill: skill.name,
      slug: skill.slug,
      description: skill.description,
      args: args || {},
      triggered_at: new Date().toISOString(),
    };
    // If clawdbot bridge is connected, forward to bot for Telegram relay (so user co the
    // chap hanh skill tu phone bang cach reply).
    if (clawdbot && typeof clawdbot.pushNotification === "function") {
      await clawdbot.pushNotification({
        title: `Skill triggered: ${skill.name}`,
        message: skill.description.slice(0, 800),
        level: "info",
        sessionId: "skill-trigger",
        agentId: "clawd-on-desk",
      }).catch(() => {});
    }
    return payload;
  }

  function count() {
    return cache.size;
  }

  function reload() {
    loadSync();
    return { count: cache.size, loadedAt, loadError };
  }

  function start() {
    if (!enabled) {
      console.log("Clawd: skills loader disabled (SKILLS_ENABLE=0)");
      return;
    }
    loadSync();
  }

  function status() {
    return { enabled, dir: skillsDir, count: cache.size, loadedAt, loadError };
  }

  return { start, list, get, trigger, count, reload, status };
};
