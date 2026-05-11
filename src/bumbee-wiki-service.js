const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_PROJECT = "bumbee-desktop";
const DEFAULT_APP_ID = "bumbee-desktop";
const SUPPORTED_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".json", ".csv"]);
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

function readTokenFile(filePath) {
  if (!filePath) return "";
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function safeRelativePath(root, filePath) {
  const rel = path.relative(root, filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

function listSyncableFiles(root, opts = {}) {
  const maxFileBytes = opts.maxFileBytes || DEFAULT_MAX_FILE_BYTES;
  const out = [];
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.size <= 0 || stat.size > maxFileBytes) continue;
      const rel = safeRelativePath(root, full);
      if (!rel) continue;
      out.push({ path: full, relativePath: rel, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  walk(root);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

function makeSyncKey(file) {
  return `${file.relativePath}:${file.size}:${Math.round(file.mtimeMs)}`;
}

module.exports = function initBumbeeWikiService(opts = {}) {
  const appId = opts.appId || process.env.BUMBEE_WIKI_APP_ID || DEFAULT_APP_ID;
  const project = opts.project || process.env.BUMBEE_WIKI_PROJECT || DEFAULT_PROJECT;
  const deviceId = opts.deviceId || process.env.BUMBEE_DEVICE_ID || `${os.hostname()}-${process.platform}`;
  const deviceName = opts.deviceName || os.hostname();
  const folder = opts.folder || process.env.BUMBEE_WIKI_DIR || path.join(os.homedir(), "Bumbee", "bumbee-wiki");
  const libraryId = opts.libraryId || process.env.BUMBEE_WIKI_LIBRARY_ID || null;
  const tokenFile = opts.tokenFile || process.env.BUMBEE_WIKI_TOKEN_FILE || null;
  const client = opts.client || require("./bumbee-wiki-client")({
    baseUrl: opts.baseUrl,
    getToken: () => readTokenFile(tokenFile),
  });
  const enabled = opts.enabled !== false && process.env.BUMBEE_WIKI_ENABLE !== "0";

  let lastSyncAt = null;
  let lastError = null;
  let lastRegisteredAt = null;
  const syncedKeys = new Map();

  function ensureFolder() {
    fs.mkdirSync(folder, { recursive: true });
    const readmePath = path.join(folder, "README.md");
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, [
        "# Bumbee Wiki",
        "",
        "Drop project notes here. Bumbee On Desk syncs `.md`, `.txt`, `.json`, and `.csv` files to Bumbee Wiki.",
        "",
        `Project: ${project}`,
        `Device: ${deviceId}`,
        "",
      ].join("\n"), "utf8");
    }
    return folder;
  }

  async function registerApp() {
    if (!enabled) return { ok: false, disabled: true };
    const payload = {
      app_id: appId,
      name: "Bumbee On Desk",
      default_project: project,
      default_provider: "auto",
      default_limit: 6,
      libraries: libraryId ? [{ library_id: libraryId, name: project }] : [],
    };
    const result = await client.registerApp(payload);
    lastRegisteredAt = new Date().toISOString();
    return result;
  }

  async function syncOnce(options = {}) {
    if (!enabled) return { ok: false, disabled: true, synced: 0, skipped: 0 };
    ensureFolder();
    if (options.register !== false) await registerApp().catch(() => {});
    const files = listSyncableFiles(folder, { maxFileBytes: options.maxFileBytes });
    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const file of files) {
      const key = makeSyncKey(file);
      if (!options.force && syncedKeys.get(file.relativePath) === key) {
        skipped++;
        continue;
      }
      let content = "";
      try {
        content = fs.readFileSync(file.path, "utf8");
      } catch (err) {
        errors.push({ file: file.relativePath, error: err.message });
        continue;
      }
      const title = file.relativePath.replace(/\.[^.]+$/, "");
      const payload = {
        title,
        content,
        project,
        source: `bumbee-wiki://${deviceId}/${file.relativePath}`,
        source_kind: "bumbee-desktop-folder",
        tags: ["bumbee-desktop", `device:${deviceId}`, `app:${appId}`],
      };
      try {
        await client.ingestDocument(payload);
        syncedKeys.set(file.relativePath, key);
        synced++;
      } catch (err) {
        errors.push({ file: file.relativePath, error: err.message });
      }
    }

    lastSyncAt = new Date().toISOString();
    lastError = errors.length ? errors.map(e => `${e.file}: ${e.error}`).join("; ") : null;
    return { ok: errors.length === 0, folder, appId, project, deviceId, synced, skipped, errors };
  }

  async function ask(question, options = {}) {
    if (!enabled) return { ok: false, error: "Bumbee Wiki disabled" };
    if (!question || typeof question !== "string") return { ok: false, error: "missing question" };
    const payload = {
      app_id: appId,
      question,
      mode: options.mode || "auto",
      project: options.project || project,
      library_id: options.libraryId || libraryId || undefined,
      limit: options.limit || 6,
      provider: options.provider || "auto",
    };
    try {
      return await client.ask(payload);
    } catch (err) {
      if (!client.search) throw err;
      const search = await client.search({
        q: question,
        limit: options.limit || 6,
        project: options.project || project,
      });
      const results = Array.isArray(search?.results) ? search.results : [];
      if (!results.length) throw err;
      return {
        answer: results.slice(0, 3).map((item, idx) => {
          const title = item.title || item.slug || `source ${idx + 1}`;
          const snippet = String(item.snippet || "").replace(/\s+/g, " ").trim();
          return `${idx + 1}. ${title}: ${snippet.slice(0, 700)}`;
        }).join("\n"),
        sources: results.map(item => item.source_path || item.slug).filter(Boolean),
        context: "Fallback search result because Bumbee Wiki chat did not respond in time.",
        provider_errors: [{ error: err.message, fallback: "wiki/search" }],
        app_id: appId,
        mode: payload.mode,
        resolved_project: project,
        search,
      };
    }
  }

  async function updates(options = {}) {
    if (!enabled) return { ok: false, error: "Bumbee Wiki disabled" };
    return client.updates({
      since: options.since,
      project: options.project || project,
      app_id: appId,
      library_id: options.libraryId || libraryId || undefined,
      limit: options.limit || 50,
    });
  }

  function start() {
    if (!enabled) return;
    ensureFolder();
    registerApp().catch((err) => {
      lastError = err.message;
      console.warn(`Clawd: Bumbee Wiki app register failed: ${err.message}`);
    });
  }

  function status() {
    return {
      enabled,
      folder,
      appId,
      project,
      deviceId,
      deviceName,
      libraryId,
      lastSyncAt,
      lastRegisteredAt,
      lastError,
    };
  }

  return { start, ensureFolder, registerApp, syncOnce, ask, updates, status };
};

module.exports.listSyncableFiles = listSyncableFiles;
module.exports.makeSyncKey = makeSyncKey;
