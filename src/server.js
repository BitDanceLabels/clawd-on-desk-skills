// src/server.js — HTTP server + routes (/state, /permission, /health, /notification, /sessions, /skills, /skills/trigger, /chat)
// Extracted from main.js L1337-1528

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_VERSION = (() => {
  try { return require("../package.json").version || "0.0.0"; } catch { return "0.0.0"; }
})();

function readJson(req, limit, cb) {
  let body = "";
  let size = 0;
  let tooLarge = false;
  req.on("data", (chunk) => {
    if (tooLarge) return;
    size += chunk.length;
    if (size > limit) { tooLarge = true; return; }
    body += chunk;
  });
  req.on("end", () => {
    if (tooLarge) return cb(new Error("payload too large"));
    if (!body) return cb(null, {});
    try { cb(null, JSON.parse(body)); }
    catch { cb(new Error("bad json")); }
  });
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(body);
}
const {
  CLAWD_SERVER_HEADER,
  CLAWD_SERVER_ID,
  DEFAULT_SERVER_PORT,
  clearRuntimeConfig,
  getPortCandidates,
  readRuntimePort,
  writeRuntimeConfig,
} = require("../hooks/server-config");

// ── Skills HTML UI builder ─────────────────────────────────────────────────
const CATEGORY_BADGE = {
  payments:  { bg: "#1a3a2a", color: "#63f2a5", icon: "💳" },
  security:  { bg: "#3a1a1a", color: "#f26363", icon: "🔒" },
  marketing: { bg: "#2a2a3a", color: "#a563f2", icon: "📣" },
  project:   { bg: "#1a2a3a", color: "#63b5f2", icon: "📋" },
  creative:  { bg: "#3a2a1a", color: "#f2c063", icon: "🎨" },
  infra:     { bg: "#1a3a3a", color: "#63f2f2", icon: "⚙️" },
  dev:       { bg: "#2a1a3a", color: "#c063f2", icon: "💻" },
  learning:  { bg: "#2a3a1a", color: "#a5f263", icon: "📚" },
  higgsfield:{ bg: "#3a1a2a", color: "#f263a5", icon: "🎬" },
  general:   { bg: "#2a2a2a", color: "#aaaaaa", icon: "📌" },
};

function buildSkillsHtml(skills, wikiCount) {
  const byCategory = {};
  for (const s of skills) {
    const cat = s.category || "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(s);
  }

  const categoryCards = Object.entries(byCategory).map(([cat, items]) => {
    const badge = CATEGORY_BADGE[cat] || CATEGORY_BADGE.general;
    const skillCards = items.map(s => `
      <div class="skill-card" data-name="${escHtml(s.name)}" data-cat="${escHtml(cat)}">
        <div class="skill-header">
          <span class="skill-name">${escHtml(s.name)}</span>
          <span class="skill-badge" style="background:${badge.bg};color:${badge.color}">${badge.icon} ${escHtml(cat)}</span>
        </div>
        <p class="skill-desc">${escHtml((s.description || "").slice(0, 200))}</p>
        <div class="skill-footer">
          <span class="skill-slug">${escHtml(s.slug || s.name)}</span>
          <button class="btn-trigger" onclick="triggerSkill('${escHtml(s.name)}')">▶ Run</button>
        </div>
      </div>`).join("");
    return `
      <div class="cat-section">
        <h3 class="cat-title">${badge.icon} ${escHtml(cat)} <span class="cat-count">${items.length}</span></h3>
        <div class="skill-grid">${skillCards}</div>
      </div>`;
  }).join("");

  const emptyMsg = skills.length === 0
    ? `<div class="empty-state">
        <div style="font-size:48px;margin-bottom:16px">📭</div>
        <div>Chưa có skill nào được load.</div>
        <div style="opacity:.6;margin-top:8px">Kiểm tra <code>BUMBEE_SKILLS_DIR</code> hoặc thư mục skills của bạn.</div>
      </div>` : categoryCards;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bumbee Skills — ${skills.length} skills</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0d0d0d;--panel:#161616;--line:#222;--text:#e0e0e0;--muted:#666;--accent:#63f2a5;--red:#f26363;--font:'SF Mono','Fira Code','Consolas',monospace}
  body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;min-height:100vh}
  header{background:var(--panel);border-bottom:1px solid var(--line);padding:16px 24px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:10}
  .logo{font-size:24px}
  .header-title{font-size:18px;font-weight:600;color:var(--accent)}
  .header-meta{font-size:12px;color:var(--muted);margin-left:auto;display:flex;gap:16px;align-items:center}
  .badge-count{background:#1a3a2a;color:var(--accent);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
  .wiki-count{background:#1a1a3a;color:#63b5f2;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
  .search-bar{background:var(--bg);border:1px solid var(--line);color:var(--text);padding:8px 14px;border-radius:8px;font-size:13px;width:280px;outline:none;transition:border .2s}
  .search-bar:focus{border-color:var(--accent)}
  main{max-width:1200px;margin:0 auto;padding:24px}
  .wiki-push-box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:28px}
  .wiki-push-box h2{font-size:14px;color:var(--accent);margin-bottom:12px;display:flex;align-items:center;gap:8px}
  .push-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .push-form input,.push-form textarea,.push-form select{background:var(--bg);border:1px solid var(--line);color:var(--text);padding:8px 12px;border-radius:6px;font-size:13px;font-family:inherit;outline:none;transition:border .2s}
  .push-form input:focus,.push-form textarea:focus,.push-form select:focus{border-color:var(--accent)}
  .push-form textarea{grid-column:1/-1;height:80px;resize:vertical}
  .push-form .push-row{grid-column:1/-1;display:flex;gap:10px;align-items:center}
  .btn-push{background:var(--accent);color:#0d0d0d;border:none;padding:9px 22px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s}
  .btn-push:hover{opacity:.85}
  .btn-push:disabled{opacity:.4;cursor:not-allowed}
  .push-status{font-size:12px;color:var(--muted);margin-left:8px}
  .push-status.ok{color:var(--accent)}
  .push-status.err{color:var(--red)}
  .cat-section{margin-bottom:32px}
  .cat-title{font-size:15px;font-weight:600;color:var(--text);margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}
  .cat-count{background:var(--line);color:var(--muted);padding:2px 8px;border-radius:12px;font-size:11px;font-weight:400}
  .skill-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
  .skill-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;transition:border-color .2s,transform .1s;display:flex;flex-direction:column;gap:10px}
  .skill-card:hover{border-color:#444;transform:translateY(-1px)}
  .skill-card.hidden{display:none}
  .skill-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
  .skill-name{font-size:13px;font-weight:600;color:var(--text);font-family:var(--font);word-break:break-all}
  .skill-badge{font-size:10px;padding:2px 8px;border-radius:12px;white-space:nowrap;flex-shrink:0}
  .skill-desc{font-size:12px;color:var(--muted);line-height:1.5;flex:1}
  .skill-footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto}
  .skill-slug{font-size:10px;color:#444;font-family:var(--font)}
  .btn-trigger{background:#1a3a2a;color:var(--accent);border:1px solid #2a5a3a;padding:4px 12px;border-radius:5px;font-size:11px;cursor:pointer;transition:background .15s;font-weight:600}
  .btn-trigger:hover{background:#2a5a3a}
  .empty-state{text-align:center;padding:60px 20px;color:var(--muted)}
  .wiki-entries-box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;margin-top:32px}
  .wiki-entries-box h2{font-size:14px;color:#63b5f2;margin-bottom:16px;display:flex;align-items:center;gap:8px}
  .entry-list{display:flex;flex-direction:column;gap:8px}
  .entry-item{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px 14px}
  .entry-item-header{display:flex;align-items:center;gap:8px;margin-bottom:4px}
  .entry-title{font-size:13px;font-weight:600;color:var(--text)}
  .entry-cat{font-size:10px;color:#63b5f2;background:#1a1a3a;padding:1px 7px;border-radius:10px}
  .entry-date{font-size:10px;color:var(--muted);margin-left:auto}
  .entry-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
  .entry-tag{font-size:10px;color:var(--muted);background:var(--line);padding:1px 6px;border-radius:8px}
  .entry-content{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5;white-space:pre-wrap;max-height:80px;overflow:hidden;position:relative}
  .entry-content.expanded{max-height:none}
  .entries-empty{text-align:center;padding:24px;color:var(--muted);font-size:13px}
  footer{text-align:center;padding:24px;font-size:11px;color:var(--muted);border-top:1px solid var(--line);margin-top:40px}
  @media(max-width:600px){.push-form{grid-template-columns:1fr}.header-meta{display:none}.skill-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <span class="logo">🐝</span>
  <span class="header-title">Bumbee Skills</span>
  <div class="header-meta">
    <span class="badge-count">${skills.length} skills</span>
    <span class="wiki-count">📚 ${wikiCount} entries</span>
    <input class="search-bar" type="text" placeholder="🔍 Tìm skill..." id="searchInput" oninput="filterSkills(this.value)">
  </div>
</header>
<main>

  <!-- Wiki Push Box -->
  <div class="wiki-push-box">
    <h2>💾 Lưu kiến thức → Wiki</h2>
    <div class="push-form">
      <input type="text" id="pushTitle" placeholder="Tiêu đề (vd: Higgsfield Soul CLI commands)">
      <select id="pushCategory">
        <option value="general">📌 general</option>
        <option value="research">🔬 research</option>
        <option value="skill">⚡ skill</option>
        <option value="workflow">🔄 workflow</option>
        <option value="tool">🛠 tool</option>
        <option value="higgsfield">🎬 higgsfield</option>
        <option value="ai">🤖 ai</option>
        <option value="config">⚙️ config</option>
        <option value="note">📝 note</option>
        <option value="reference">📖 reference</option>
      </select>
      <textarea id="pushContent" placeholder="Nội dung, ghi chú, lệnh CLI, kết quả nghiên cứu...&#10;Ví dụ: higgsfield soul-id create --soul-2 --image photo.jpg → returns ref_id dùng cho generate"></textarea>
      <div class="push-row">
        <input type="text" id="pushTags" placeholder="Tags (cách nhau bởi dấu phẩy): higgsfield, cli, video">
        <button class="btn-push" onclick="pushKnowledge()" id="btnPush">💾 Lưu</button>
        <span class="push-status" id="pushStatus"></span>
      </div>
    </div>
  </div>

  <!-- Skills list -->
  <div id="skillsContainer">${emptyMsg}</div>

  <!-- Wiki Entries -->
  <div class="wiki-entries-box" id="entriesBox">
    <h2>📚 Knowledge Entries <button class="btn-trigger" onclick="loadEntries()" style="font-size:11px;margin-left:8px">Refresh</button></h2>
    <div id="entriesList"><div class="entries-empty">Bấm Refresh để load entries...</div></div>
  </div>
</main>
<footer>Bumbee on Desk — Skills &amp; Wiki Knowledge Store • <a href="/health" style="color:#444">health</a> • <a href="/wiki/entries" style="color:#444">API</a></footer>

<script>
const PORT = location.port || 23333;
const BASE = location.origin;

function escHtml(s){ const d=document.createElement('div');d.textContent=s;return d.innerHTML; }

function filterSkills(q) {
  q = q.toLowerCase().trim();
  document.querySelectorAll('.skill-card').forEach(card => {
    const name = card.dataset.name.toLowerCase();
    const cat = card.dataset.cat.toLowerCase();
    card.classList.toggle('hidden', q && !name.includes(q) && !cat.includes(q));
  });
}

async function triggerSkill(name) {
  const r = await fetch(BASE + '/skills/trigger', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ skill: name })
  });
  const j = await r.json();
  alert(j.ok ? '✅ Triggered: ' + name : '❌ Error: ' + (j.error || 'unknown'));
}

async function pushKnowledge() {
  const title = document.getElementById('pushTitle').value.trim();
  const content = document.getElementById('pushContent').value.trim();
  const category = document.getElementById('pushCategory').value;
  const tagsRaw = document.getElementById('pushTags').value.trim();
  const tags = tagsRaw ? tagsRaw.split(',').map(t=>t.trim()).filter(Boolean) : [];
  const status = document.getElementById('pushStatus');
  const btn = document.getElementById('btnPush');
  if (!title && !content) { status.textContent = '⚠️ Cần nhập title hoặc content'; status.className='push-status err'; return; }
  btn.disabled = true; status.textContent = 'Đang lưu...'; status.className='push-status';
  try {
    const r = await fetch(BASE + '/wiki/push', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ title, content, category, tags, source: 'skills-ui' })
    });
    const j = await r.json();
    if (j.ok) {
      status.textContent = '✅ Đã lưu! ID: ' + j.id.slice(0,8) + '...';
      status.className = 'push-status ok';
      document.getElementById('pushTitle').value = '';
      document.getElementById('pushContent').value = '';
      document.getElementById('pushTags').value = '';
      loadEntries();
    } else {
      status.textContent = '❌ ' + (j.error || 'Error');
      status.className = 'push-status err';
    }
  } catch(e) {
    status.textContent = '❌ ' + e.message;
    status.className = 'push-status err';
  }
  btn.disabled = false;
}

async function loadEntries() {
  const el = document.getElementById('entriesList');
  el.innerHTML = '<div class="entries-empty">Loading...</div>';
  try {
    const r = await fetch(BASE + '/wiki/entries?limit=30');
    const j = await r.json();
    if (!j.ok || !j.entries.length) {
      el.innerHTML = '<div class="entries-empty">Chưa có entries nào. Hãy lưu kiến thức đầu tiên! 💡</div>';
      return;
    }
    el.innerHTML = j.entries.map(e => {
      const date = new Date(e.created_at).toLocaleString('vi-VN');
      const tags = (e.tags||[]).map(t=>'<span class="entry-tag">#'+escHtml(t)+'</span>').join('');
      const preview = (e.content||'').slice(0,200);
      return '<div class="entry-item">'
        + '<div class="entry-item-header"><span class="entry-title">'+escHtml(e.title)+'</span><span class="entry-cat">'+escHtml(e.category)+'</span><span class="entry-date">'+date+'</span></div>'
        + (tags ? '<div class="entry-tags">'+tags+'</div>' : '')
        + (preview ? '<div class="entry-content">'+escHtml(preview)+(e.content.length>200?'…':'')+'</div>' : '')
        + '</div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="entries-empty">Error: '+e.message+'</div>'; }
}

// Auto-load entries on page load
loadEntries();
</script>
</body>
</html>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = function initServer(ctx) {

let httpServer = null;
let activeServerPort = null;

function getHookServerPort() {
  return activeServerPort || readRuntimePort() || DEFAULT_SERVER_PORT;
}

function syncClawdHooks() {
  try {
    const { registerHooks } = require("../hooks/install.js");
    const { added, updated, removed } = registerHooks({
      silent: true,
      autoStart: ctx.autoStartWithClaude,
      port: getHookServerPort(),
    });
    if (added > 0 || updated > 0 || removed > 0) {
      console.log(`Clawd: synced hooks (added ${added}, updated ${updated}, removed ${removed})`);
    }
  } catch (err) {
    console.warn("Clawd: failed to sync hooks:", err.message);
  }
}

function syncGeminiHooks() {
  try {
    const { registerGeminiHooks } = require("../hooks/gemini-install.js");
    const { added, updated } = registerGeminiHooks({ silent: true });
    if (added > 0 || updated > 0) {
      console.log(`Clawd: synced Gemini hooks (added ${added}, updated ${updated})`);
    }
  } catch (err) {
    console.warn("Clawd: failed to sync Gemini hooks:", err.message);
  }
}

function syncCursorHooks() {
  try {
    const { registerCursorHooks } = require("../hooks/cursor-install.js");
    const { added, updated } = registerCursorHooks({ silent: true });
    if (added > 0 || updated > 0) {
      console.log(`Clawd: synced Cursor hooks (added ${added}, updated ${updated})`);
    }
  } catch (err) {
    console.warn("Clawd: failed to sync Cursor hooks:", err.message);
  }
}

function sendStateHealthResponse(res) {
  const body = JSON.stringify({ ok: true, app: CLAWD_SERVER_ID, port: getHookServerPort() });
  res.writeHead(200, {
    "Content-Type": "application/json",
    [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID,
  });
  res.end(body);
}

// Truncate large string values in objects (recursive) — bubble only needs a preview
const PREVIEW_MAX = 500;
function truncateDeep(obj, depth) {
  if ((depth || 0) > 10) return obj;
  if (Array.isArray(obj)) return obj.map(v => truncateDeep(v, (depth || 0) + 1));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = truncateDeep(v, (depth || 0) + 1);
    return out;
  }
  return typeof obj === "string" && obj.length > PREVIEW_MAX
    ? obj.slice(0, PREVIEW_MAX) + "\u2026" : obj;
}

// Watch ~/.claude/ directory for settings.json overwrites (e.g. CC-Switch)
// that wipe our hooks. Re-register when hooks disappear.
// Watch the directory (not the file) because atomic rename replaces the inode
// and fs.watch on the old file silently stops firing on Windows.
let settingsWatcher = null;
const HOOK_MARKER = "clawd-hook.js";
const SETTINGS_FILENAME = "settings.json";
function watchSettingsForHookLoss() {
  const settingsDir = path.join(os.homedir(), ".claude");
  const settingsPath = path.join(settingsDir, SETTINGS_FILENAME);
  let debounceTimer = null;
  let lastSyncTime = 0;
  try {
    settingsWatcher = fs.watch(settingsDir, (_event, filename) => {
      if (filename && filename !== SETTINGS_FILENAME) return;
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        // Rate-limit: don't re-sync within 5s to avoid write wars with CC-Switch
        if (Date.now() - lastSyncTime < 5000) return;
        try {
          const raw = fs.readFileSync(settingsPath, "utf-8");
          if (!raw.includes(HOOK_MARKER)) {
            console.log("Clawd: hooks wiped from settings.json — re-registering");
            lastSyncTime = Date.now();
            syncClawdHooks();
          }
        } catch {}
      }, 1000);
    });
    settingsWatcher.on("error", (err) => {
      console.warn("Clawd: settings watcher error:", err.message);
    });
  } catch (err) {
    console.warn("Clawd: failed to watch settings directory:", err.message);
  }
}

function startHttpServer() {
  httpServer = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/state") {
      sendStateHealthResponse(res);
    } else if (req.method === "POST" && req.url === "/state") {
      let body = "";
      let bodySize = 0;
      let tooLarge = false;
      req.on("data", (chunk) => {
        if (tooLarge) return;
        bodySize += chunk.length;
        if (bodySize > 1024) { tooLarge = true; return; }
        body += chunk;
      });
      req.on("end", () => {
        if (tooLarge) {
          res.writeHead(413);
          res.end("state payload too large");
          return;
        }
        try {
          const data = JSON.parse(body);
          const { state, svg, session_id, event } = data;
          let display_svg;
          if (data.display_svg === null) display_svg = null;
          else if (typeof data.display_svg === "string") display_svg = path.basename(data.display_svg);
          else display_svg = undefined;
          const source_pid = Number.isFinite(data.source_pid) && data.source_pid > 0 ? Math.floor(data.source_pid) : null;
          const cwd = typeof data.cwd === "string" ? data.cwd : "";
          const editor = (data.editor === "code" || data.editor === "cursor") ? data.editor : null;
          const pidChain = Array.isArray(data.pid_chain) ? data.pid_chain.filter(n => Number.isFinite(n) && n > 0) : null;
          const rawAgentPid = data.agent_pid ?? data.claude_pid ?? data.cursor_pid;
          const agentPid = Number.isFinite(rawAgentPid) && rawAgentPid > 0 ? Math.floor(rawAgentPid) : null;
          const agentId = typeof data.agent_id === "string" ? data.agent_id : "claude-code";
          const host = typeof data.host === "string" ? data.host : null;
          const headless = data.headless === true;
          if (ctx.STATE_SVGS[state]) {
            const sid = session_id || "default";
            if (state.startsWith("mini-") && !svg) {
              res.writeHead(400);
              res.end("mini states require svg override");
              return;
            }
            if (event === "PostToolUse" || event === "PostToolUseFailure" || event === "Stop") {
              for (const perm of [...ctx.pendingPermissions]) {
                if (perm.sessionId === sid) {
                  ctx.resolvePermissionEntry(perm, "deny", "User answered in terminal");
                }
              }
            }
            if (svg) {
              const safeSvg = path.basename(svg);
              ctx.setState(state, safeSvg);
            } else {
              ctx.updateSession(sid, state, event, source_pid, cwd, editor, pidChain, agentPid, agentId, host, headless, display_svg);
            }
            res.writeHead(200, { [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID });
            res.end("ok");
          } else {
            res.writeHead(400);
            res.end("unknown state");
          }
        } catch {
          res.writeHead(400);
          res.end("bad json");
        }
      });
    } else if (req.method === "POST" && req.url === "/permission") {
      ctx.permLog(`/permission hit | DND=${ctx.doNotDisturb} pending=${ctx.pendingPermissions.length}`);
      let body = "";
      let bodySize = 0;
      let tooLarge = false;
      req.on("data", (chunk) => {
        if (tooLarge) return;
        bodySize += chunk.length;
        if (bodySize > 524288) { tooLarge = true; return; }
        body += chunk;
      });
      req.on("end", () => {
        if (tooLarge) {
          ctx.permLog("SKIPPED: permission payload too large");
          ctx.sendPermissionResponse(res, "deny", "Permission request too large for Clawd bubble; answer in terminal");
          return;
        }

        if (ctx.doNotDisturb) {
          ctx.permLog("SKIPPED: DND mode");
          ctx.sendPermissionResponse(res, "deny", "Clawd is in Do Not Disturb mode");
          return;
        }

        try {
          const data = JSON.parse(body);
          const toolName = typeof data.tool_name === "string" ? data.tool_name : "Unknown";
          const rawInput = data.tool_input && typeof data.tool_input === "object" ? data.tool_input : {};
          const toolInput = truncateDeep(rawInput);
          const sessionId = data.session_id || "default";
          const rawSuggestions = Array.isArray(data.permission_suggestions) ? data.permission_suggestions : [];
          // Merge multiple addRules suggestions (e.g. piped commands) into one button
          const addRulesItems = rawSuggestions.filter(s => s && s.type === "addRules");
          const suggestions = addRulesItems.length > 1
            ? [
                ...rawSuggestions.filter(s => s && s.type !== "addRules"),
                {
                  type: "addRules",
                  destination: addRulesItems[0].destination || "localSettings", // CC sends uniform destination per request
                  behavior: addRulesItems[0].behavior || "allow",
                  rules: addRulesItems.flatMap(s =>
                    Array.isArray(s.rules) ? s.rules : [{ toolName: s.toolName, ruleContent: s.ruleContent }]
                  ),
                },
              ]
            : rawSuggestions;

          const existingSession = ctx.sessions.get(sessionId);
          if (existingSession && existingSession.headless) {
            ctx.permLog(`SKIPPED: headless session=${sessionId}`);
            ctx.sendPermissionResponse(res, "deny", "Non-interactive session; auto-denied");
            return;
          }

          if (ctx.PASSTHROUGH_TOOLS.has(toolName)) {
            ctx.permLog(`PASSTHROUGH: tool=${toolName} session=${sessionId}`);
            ctx.sendPermissionResponse(res, "allow");
            return;
          }

          // Elicitation (AskUserQuestion) — show notification bubble, not permission bubble.
          // User clicks "Go to Terminal" → deny → Claude Code falls back to terminal.
          if (toolName === "AskUserQuestion") {
            ctx.permLog(`ELICITATION: tool=${toolName} session=${sessionId}`);
            ctx.updateSession(sessionId, "notification", "Elicitation", null, "", null, null, null, "claude-code");

            const permEntry = { res, abortHandler: null, suggestions: [], sessionId, bubble: null, hideTimer: null, toolName, toolInput, resolvedSuggestion: null, createdAt: Date.now(), isElicitation: true };
            const abortHandler = () => {
              if (res.writableFinished) return;
              ctx.permLog("abortHandler fired (elicitation)");
              ctx.resolvePermissionEntry(permEntry, "deny", "Client disconnected");
            };
            permEntry.abortHandler = abortHandler;
            res.on("close", abortHandler);
            ctx.pendingPermissions.push(permEntry);
            if (!ctx.hideBubbles) ctx.showPermissionBubble(permEntry);
            return;
          }

          const permEntry = { res, abortHandler: null, suggestions, sessionId, bubble: null, hideTimer: null, toolName, toolInput, resolvedSuggestion: null, createdAt: Date.now() };
          const abortHandler = () => {
            if (res.writableFinished) return;
            ctx.permLog("abortHandler fired");
            ctx.resolvePermissionEntry(permEntry, "deny", "Client disconnected");
          };
          permEntry.abortHandler = abortHandler;
          res.on("close", abortHandler);

          ctx.pendingPermissions.push(permEntry);

          if (ctx.hideBubbles) {
            ctx.permLog(`bubble hidden: tool=${toolName} session=${sessionId} — terminal only`);
          } else {
            ctx.permLog(`showing bubble: tool=${toolName} session=${sessionId} suggestions=${suggestions.length} stack=${ctx.pendingPermissions.length}`);
            ctx.showPermissionBubble(permEntry);
          }
        } catch {
          res.writeHead(400);
          res.end("bad json");
        }
      });
    } else if (req.method === "GET" && req.url === "/health") {
      const sessionList = ctx.sessions ? Array.from(ctx.sessions.keys()) : [];
      jsonResponse(res, 200, {
        ok: true,
        app: CLAWD_SERVER_ID,
        version: APP_VERSION,
        port: getHookServerPort(),
        sessions: sessionList.length,
        gateway: ctx.gateway ? ctx.gateway.status() : { registered: false },
        clawdbot: ctx.clawdbot ? ctx.clawdbot.status() : { connected: false },
        skills: ctx.skills ? ctx.skills.count() : 0,
        wiki: ctx.wiki ? ctx.wiki.status() : { enabled: false },
        bumbee_os: ctx.bumbeeOsStore ? ctx.bumbeeOsStore.status() : { ok: false, enabled: false },
      });
    } else if (req.method === "GET" && req.url === "/bumbee-os/status") {
      if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
      jsonResponse(res, 200, ctx.bumbeeOsStore.status());
    } else if (req.method === "GET" && req.url === "/bumbee-os/data") {
      if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
      jsonResponse(res, 200, ctx.bumbeeOsStore.list());
    } else if (req.method === "POST" && req.url === "/bumbee-os/work") {
      readJson(req, 128 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
        const result = ctx.bumbeeOsStore.addWorkItem(data || {});
        jsonResponse(res, result.ok ? 201 : 400, result);
      });
    } else if (req.method === "POST" && req.url === "/bumbee-os/clip") {
      readJson(req, 256 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
        const result = ctx.bumbeeOsStore.addClip(data || {});
        jsonResponse(res, result.ok ? 201 : 400, result);
      });
    } else if (req.method === "POST" && req.url === "/bumbee-os/vocab") {
      readJson(req, 128 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
        const result = ctx.bumbeeOsStore.addVocabulary(data || {});
        jsonResponse(res, result.ok ? 201 : 400, result);
      });
    } else if (req.method === "POST" && req.url === "/bumbee-os/user-profile") {
      readJson(req, 128 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
        const result = ctx.bumbeeOsStore.addUserProfile(data || {});
        jsonResponse(res, result.ok ? 201 : 400, result);
      });
    } else if (req.method === "POST" && req.url === "/bumbee-os/publisher-profile") {
      readJson(req, 128 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
        const result = ctx.bumbeeOsStore.addPublisherProfile(data || {});
        jsonResponse(res, result.ok ? 201 : 400, result);
      });
    } else if (req.method === "POST" && req.url === "/bumbee-os/action") {
      readJson(req, 128 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
        const result = ctx.bumbeeOsStore.queueAction(data || {});
        jsonResponse(res, result.ok ? 201 : 400, result);
      });
    } else if (req.method === "GET" && req.url === "/bumbee-os/sql-dump") {
      if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
      jsonResponse(res, 200, ctx.bumbeeOsStore.exportSqlDump());
    } else if (req.method === "POST" && req.url === "/bumbee-os/sepay/payment-intent") {
      readJson(req, 128 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { ok: false, error: "Bumbee OS store not available" });
        const result = ctx.bumbeeOsStore.createSepayPaymentIntent(data || {});
        jsonResponse(res, result.ok ? 201 : 400, result);
      });
    } else if (req.method === "POST" && req.url === "/bumbee-os/sepay/webhook") {
      readJson(req, 256 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { success: false, error: err.message });
        if (!ctx.bumbeeOsStore) return jsonResponse(res, 503, { success: false, error: "Bumbee OS store not available" });
        const result = ctx.bumbeeOsStore.recordSepayNotification(data || {});
        jsonResponse(res, result.ok ? 200 : 400, { success: result.ok, ...result });
      });
    } else if (req.method === "POST" && req.url === "/notification") {
      readJson(req, 64 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        const title = typeof data.title === "string" ? data.title.slice(0, 200) : "Notification";
        const message = typeof data.message === "string" ? data.message.slice(0, 2000) : "";
        const level = ["info", "success", "warning", "error"].includes(data.level) ? data.level : "info";
        const sessionId = typeof data.session_id === "string" ? data.session_id : "external";
        const timeoutMs = Number.isFinite(data.timeout_ms) ? Math.min(60000, Math.max(1000, data.timeout_ms)) : 8000;
        const targetState = level === "error" ? "error" : "notification";
        try {
          ctx.updateSession(sessionId, targetState, "Notification", null, "", null, null, null, "external", null, false, null);
          if (typeof ctx.showExternalNotification === "function") {
            ctx.showExternalNotification({ sessionId, title, message, level, timeoutMs });
          }
          jsonResponse(res, 200, { ok: true });
        } catch (e) {
          jsonResponse(res, 500, { ok: false, error: e.message });
        }
      });
    } else if (req.method === "GET" && req.url === "/sessions") {
      const out = [];
      if (ctx.sessions) {
        for (const [id, s] of ctx.sessions.entries()) {
          out.push({
            id,
            state: s.state || "idle",
            agent_id: s.agentId || s.agent_id || "claude-code",
            cwd: s.cwd || "",
            event: s.event || s.lastEvent || null,
            updated_at: s.updatedAt || s.lastUpdate || null,
            host: s.host || null,
            headless: !!s.headless,
          });
        }
      }
      jsonResponse(res, 200, { ok: true, count: out.length, sessions: out });
    } else if (req.method === "GET" && req.url === "/skills") {
      if (!ctx.skills) return jsonResponse(res, 200, { ok: true, count: 0, skills: [] });
      const list = ctx.skills.list();
      jsonResponse(res, 200, { ok: true, count: list.length, skills: list });
    } else if (req.method === "POST" && req.url === "/skills/trigger") {
      readJson(req, 64 * 1024, async (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.skills) return jsonResponse(res, 503, { ok: false, error: "skills loader not available" });
        const skill = typeof data.skill === "string" ? data.skill : null;
        if (!skill) return jsonResponse(res, 400, { ok: false, error: "missing skill name" });
        try {
          const result = await ctx.skills.trigger(skill, data.args || {});
          jsonResponse(res, 200, { ok: true, skill, result });
        } catch (e) {
          jsonResponse(res, 500, { ok: false, error: e.message });
        }
      });
    } else if (req.method === "POST" && req.url === "/chat") {
      readJson(req, 128 * 1024, async (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.smart) return jsonResponse(res, 503, { ok: false, error: "intelligent layer not available" });
        const mode = typeof data.mode === "string" ? data.mode : "general";
        const query = typeof data.query === "string" ? data.query.trim() : "";
        if (!query) return jsonResponse(res, 400, { ok: false, error: "missing query" });
        try {
          const result = await ctx.smart.chat({ mode, query, context: data.context || null });
          jsonResponse(res, 200, { ok: true, mode, ...result });
        } catch (e) {
          jsonResponse(res, 500, { ok: false, error: e.message });
        }
      });
    } else if (req.method === "GET" && req.url === "/wiki/status") {
      if (!ctx.wiki) return jsonResponse(res, 503, { ok: false, error: "Bumbee Wiki service not available" });
      jsonResponse(res, 200, { ok: true, ...ctx.wiki.status() });
    } else if (req.method === "POST" && req.url === "/wiki/sync") {
      readJson(req, 64 * 1024, async (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.wiki) return jsonResponse(res, 503, { ok: false, error: "Bumbee Wiki service not available" });
        try {
          const result = await ctx.wiki.syncOnce(data || {});
          jsonResponse(res, 200, result);
        } catch (e) {
          jsonResponse(res, 500, { ok: false, error: e.message });
        }
      });
    } else if (req.method === "POST" && req.url === "/wiki/ask") {
      readJson(req, 64 * 1024, async (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.wiki) return jsonResponse(res, 503, { ok: false, error: "Bumbee Wiki service not available" });
        const question = typeof data.question === "string" ? data.question.trim() : "";
        if (!question) return jsonResponse(res, 400, { ok: false, error: "missing question" });
        try {
          const result = await ctx.wiki.ask(question, data || {});
          jsonResponse(res, 200, { ok: true, ...result });
        } catch (e) {
          jsonResponse(res, 500, { ok: false, error: e.message });
        }
      });

    // ── Wiki Knowledge Store ──────────────────────────────────────────────
    } else if (req.method === "POST" && req.url === "/wiki/push") {
      readJson(req, 256 * 1024, (err, data) => {
        if (err) return jsonResponse(res, 400, { ok: false, error: err.message });
        if (!ctx.wikiStore) return jsonResponse(res, 503, { ok: false, error: "wiki store not available" });
        const title = typeof data.title === "string" ? data.title.trim() : "";
        const content = typeof data.content === "string" ? data.content.trim() : "";
        if (!title && !content) return jsonResponse(res, 400, { ok: false, error: "missing title or content" });
        try {
          const record = ctx.wikiStore.add({
            title: title || "(untitled)",
            content,
            category: data.category,
            tags: data.tags,
            source: data.source || "api",
            session_id: data.session_id,
            meta: data.meta,
          });
          jsonResponse(res, 201, { ok: true, id: record.id, created_at: record.created_at });
        } catch (e) {
          jsonResponse(res, 500, { ok: false, error: e.message });
        }
      });

    } else if (req.method === "GET" && (req.url === "/wiki/entries" || req.url.startsWith("/wiki/entries?"))) {
      if (!ctx.wikiStore) return jsonResponse(res, 503, { ok: false, error: "wiki store not available" });
      const qp = new URLSearchParams(req.url.includes("?") ? req.url.split("?")[1] : "");
      try {
        const entries = ctx.wikiStore.list({
          category: qp.get("category") || undefined,
          tag: qp.get("tag") || undefined,
          search: qp.get("q") || undefined,
          limit: qp.get("limit") || 50,
          offset: qp.get("offset") || 0,
        });
        jsonResponse(res, 200, { ok: true, count: entries.length, total: ctx.wikiStore.count(), entries });
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message });
      }

    } else if (req.method === "POST" && req.url === "/wiki/clear") {
      if (!ctx.wikiStore) return jsonResponse(res, 503, { ok: false, error: "wiki store not available" });
      try {
        const result = ctx.wikiStore.clear();
        jsonResponse(res, 200, { ok: true, ...result });
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message });
      }

    // ── Skills HTML UI ────────────────────────────────────────────────────
    } else if (req.method === "GET" && req.url === "/skills-ui") {
      const skills = ctx.skills ? ctx.skills.list() : [];
      const wikiCount = ctx.wikiStore ? ctx.wikiStore.count() : 0;
      const html = buildSkillsHtml(skills, wikiCount);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);

    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const listenPorts = getPortCandidates();
  let listenIndex = 0;
  httpServer.on("error", (err) => {
    if (!activeServerPort && err.code === "EADDRINUSE" && listenIndex < listenPorts.length - 1) {
      listenIndex++;
      httpServer.listen(listenPorts[listenIndex], "127.0.0.1");
      return;
    }
    if (!activeServerPort && err.code === "EADDRINUSE") {
      const firstPort = listenPorts[0];
      const lastPort = listenPorts[listenPorts.length - 1];
      console.warn(`Ports ${firstPort}-${lastPort} are occupied — state sync and permission bubbles are disabled`);
    } else {
      console.error("HTTP server error:", err.message);
    }
  });

  httpServer.on("listening", () => {
    activeServerPort = listenPorts[listenIndex];
    writeRuntimeConfig(activeServerPort);
    console.log(`Clawd state server listening on 127.0.0.1:${activeServerPort}`);
    syncClawdHooks();
    syncGeminiHooks();
    syncCursorHooks();
    watchSettingsForHookLoss();
  });

  httpServer.listen(listenPorts[listenIndex], "127.0.0.1");
}

function cleanup() {
  clearRuntimeConfig();
  if (settingsWatcher) settingsWatcher.close();
  if (httpServer) httpServer.close();
}

return { startHttpServer, getHookServerPort, syncClawdHooks, syncGeminiHooks, syncCursorHooks, cleanup };

};
