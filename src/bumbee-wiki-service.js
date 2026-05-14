const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_PROJECT = "bumbee-desktop";
const DEFAULT_APP_ID = "bumbee-desktop";
const DEFAULT_STUDIO_PROJECT = "bumbee-wiki-studio";
const SUPPORTED_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".json", ".csv"]);
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const ACTION_QUEUE_PATH = path.join("07-actions", "action-queue.json");
const CONNECTOR_REGISTRY_PATH = path.join("08-connectors", "connectors.json");
const EXECUTION_LOG_PATH = path.join("07-actions", "execution-log.json");

const TAG_ACTION_RULES = {
  IDEA: { type: "analyze_idea", title: "Analyze and score idea", mode: "suggest_only" },
  CRM: { type: "crm_follow_up", title: "Draft CRM follow-up plan", mode: "confirm_required" },
  TICKET: { type: "create_ticket_checklist", title: "Create execution checklist", mode: "suggest_only" },
  PUBLISHER: { type: "prepare_publish_package", title: "Prepare publish package", mode: "confirm_required" },
  FINAL: { type: "final_review", title: "Review approved final content", mode: "confirm_required" },
  THAM_MUU: { type: "advisor_review", title: "Strategic advisor review", mode: "suggest_only" },
  TU_VAN: { type: "advisor_review", title: "Consulting review", mode: "suggest_only" },
  CHUP_ANH: { type: "collect_visual_assets", title: "Collect image assets", mode: "confirm_required" },
  VIDEO: { type: "video_script_plan", title: "Create video script plan", mode: "suggest_only" },
  RA_LENH: { type: "operator_command", title: "Prepare operator command", mode: "confirm_required" },
};

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

function writeFileIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

function writeJsonIfMissing(filePath, value) {
  return writeFileIfMissing(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function postJson(url, payload, opts = {}) {
  const http = require("http");
  const https = require("https");
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (err) { return reject(err); }
    const lib = parsed.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload);
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "User-Agent": "clawd-on-desk/studio-gateway-action",
      ...(opts.headers || {}),
    };
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers,
      timeout: opts.timeout || 20_000,
    }, (res) => {
      let raw = "";
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        reject(new Error(data?.error || data?.message || `HTTP ${res.statusCode}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function slugifyProjectName(name) {
  return String(name || DEFAULT_STUDIO_PROJECT)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || DEFAULT_STUDIO_PROJECT;
}

function extractTags(content) {
  const tags = new Set();
  const regex = /(^|[\s([{])#([A-Za-z0-9_\-À-ỹ]+)/gu;
  let match;
  while ((match = regex.exec(content || ""))) {
    tags.add(match[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/-/g, "_"));
  }
  return Array.from(tags).sort();
}

function extractTitle(content, fallback) {
  const line = String(content || "").split(/\r?\n/).find(item => /^#\s+/.test(item));
  return line ? line.replace(/^#\s+/, "").trim() : fallback;
}

function extractStatus(content) {
  const match = String(content || "").match(/^Status:\s*(.+)$/mi);
  return match ? match[1].trim() : "NEW";
}

function appendTextFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, content, "utf8");
}

function readProjectWork(root, project) {
  const workPath = path.join(root, "03-projects", project, "PROJECT.work.md");
  try {
    return fs.readFileSync(workPath, "utf8");
  } catch {
    return "";
  }
}

function writeWorkerOutput(root, action, markdown) {
  const date = new Date().toISOString().slice(0, 10);
  const outputDir = path.join(root, "03-projects", action.project, "worker-outputs");
  const outputPath = path.join(outputDir, `${date}-${action.type}.md`);
  writeFileIfMissing(outputPath, markdown);
  return safeRelativePath(root, outputPath);
}

function appendProgressLog(root, action, outputRelPath) {
  const progressPath = path.join(root, "03-projects", action.project, "PROJECT.progress.md");
  const stamp = new Date().toISOString();
  appendTextFile(progressPath, [
    "",
    `## Worker ${stamp}`,
    "",
    `- Action: ${action.title || action.type}`,
    `- Tag: ${action.tag}`,
    `- Mode: ${action.mode}`,
    `- Output: ${outputRelPath}`,
    `- Status: ${action.status}`,
    "",
  ].join("\n"));
}

function appendActionProgressLog(root, action, lines) {
  const progressPath = path.join(root, "03-projects", action.project, "PROJECT.progress.md");
  appendTextFile(progressPath, [
    "",
    `## Action ${new Date().toISOString()}`,
    "",
    ...lines,
    "",
  ].join("\n"));
}

function summarizeContent(content) {
  return String(content || "")
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function buildWorkerMarkdown(action, projectContent) {
  const date = new Date().toISOString();
  const summary = summarizeContent(projectContent) || "No project content available yet.";
  const commonHeader = [
    `# ${action.title || action.type}`,
    "",
    `Project: ${action.project}`,
    `Source: ${action.source}`,
    `Tag: ${action.tag}`,
    `Mode: ${action.mode}`,
    `Generated: ${date}`,
    "",
    "## Source Summary",
    "",
    summary,
    "",
  ];
  const sectionsByType = {
    analyze_idea: [
      "## Idea Score",
      "",
      "| Dimension | Score | Note |",
      "| --- | ---: | --- |",
      "| Money path | 7 | Clarify who pays and first offer. |",
      "| Speed to test | 8 | Can test with one landing note/proposal. |",
      "| Data readiness | 6 | Needs customer/example evidence. |",
      "| Reuse value | 8 | Can become template/worker/process. |",
      "",
      "## Recommended Next Step",
      "",
      "- Turn this idea into one demo package and one customer-facing pitch.",
      "- Add concrete target customer, expected result, and proof/assets.",
    ],
    advisor_review: [
      "## Advisor View",
      "",
      "- Keep the project simple: one outcome, one user, one money path.",
      "- Do not expand into more platform work until one workflow is tested.",
      "- Convert abstract ideas into a checklist that can be done in 1 day.",
    ],
    create_ticket_checklist: [
      "## Execution Checklist",
      "",
      "- [ ] Define target user/customer.",
      "- [ ] Define expected output/result.",
      "- [ ] Collect needed source files, links, and images.",
      "- [ ] Draft first deliverable.",
      "- [ ] Review with AI advisor.",
      "- [ ] Sync to Bumbee Wiki.",
      "- [ ] Package for demo/sales/tester nghiệm thu.",
    ],
    crm_follow_up: [
      "## CRM Draft",
      "",
      "- Identify customer status: cold/warm/active/waiting.",
      "- Draft message, but do not send automatically.",
      "- Add customer name, offer, next appointment, and attachment list.",
      "",
      "## Confirmation Needed",
      "",
      "This action should stay pending until the user confirms send/publish behavior.",
    ],
    prepare_publish_package: [
      "## Publish Package Draft",
      "",
      "- Hook/title.",
      "- Short post.",
      "- Long post.",
      "- Image/video asset list.",
      "- Platform checklist.",
      "",
      "Do not publish automatically without confirmation.",
    ],
    final_review: [
      "## Final Review",
      "",
      "- Check factual accuracy.",
      "- Check customer-sensitive data.",
      "- Check publish/send permission.",
      "- Mark ready only after user approval.",
    ],
    collect_visual_assets: [
      "## Visual Asset Plan",
      "",
      "- List required screenshots/images.",
      "- Put files under project `assets/`.",
      "- Add captions and usage purpose.",
    ],
    video_script_plan: [
      "## Video Script Plan",
      "",
      "- Opening hook.",
      "- Problem.",
      "- Demo/process.",
      "- Result/value.",
      "- Call to action.",
    ],
    operator_command: [
      "## Operator Command Draft",
      "",
      "- Intent.",
      "- Required gateway skill/API.",
      "- Payload draft.",
      "- Risk level.",
      "- Confirmation needed before execution.",
    ],
  };
  return [...commonHeader, ...(sectionsByType[action.type] || [
    "## Worker Output",
    "",
    "- Review project content.",
    "- Produce next safe action.",
  ]), ""].join("\n");
}

function defaultStudioConfig(opts = {}) {
  return {
    studio_id: opts.studioId || "bumbee-wiki-studio-local",
    edition: opts.edition || "pro",
    account_id: opts.accountId || "",
    device_id: opts.deviceId || "",
    default_project: opts.project || DEFAULT_STUDIO_PROJECT,
    wiki_api_url: opts.wikiApiUrl || "https://wiki.bumbee.asia/api",
    sync: {
      enabled: true,
      include: [".md", ".txt", ".json", ".csv"],
      exclude: [".DS_Store", "node_modules", ".git", ".env", "local-secrets.json"],
    },
    connectors: {
      obsidian: { enabled: true, status: "local_vault" },
      wiki: { enabled: true, status: "sync_ready" },
      gmail: { enabled: false, status: "planned" },
      notion: { enabled: false, status: "planned" },
      file_folder: { enabled: true, status: "local_folder" },
      crm: { enabled: false, status: "planned" },
      gateway_skills: { enabled: false, status: "planned" },
    },
    workers: {
      default_mode: "suggest_only",
      allowed_modes: ["suggest_only", "auto_safe", "confirm_required"],
    },
    permissions: {
      default_mode: "draft_action",
      destructive_actions: "confirm_required",
      publish_actions: "confirm_required",
      email_actions: "confirm_required",
    },
  };
}

function ensureObsidianSettings(root) {
  const obsidianDir = path.join(root, ".obsidian");
  fs.mkdirSync(obsidianDir, { recursive: true });
  writeJsonIfMissing(path.join(obsidianDir, "app.json"), {});
  writeJsonIfMissing(path.join(obsidianDir, "appearance.json"), {});
  writeJsonIfMissing(path.join(obsidianDir, "community-plugins.json"), ["omnisearch"]);
  writeJsonIfMissing(path.join(obsidianDir, "core-plugins.json"), {
    "file-explorer": true,
    "global-search": true,
    "switcher": true,
    "graph": true,
    "backlink": true,
    "canvas": true,
    "outgoing-link": true,
    "tag-pane": true,
    "properties": true,
    "page-preview": true,
    "daily-notes": true,
    "templates": true,
    "note-composer": true,
    "command-palette": true,
    "bookmarks": true,
    "outline": true,
    "word-count": true,
    "file-recovery": true,
  });
}

function ensureStudioTemplate(root, opts = {}) {
  fs.mkdirSync(root, { recursive: true });
  ensureObsidianSettings(root);
  const config = defaultStudioConfig(opts);
  writeJsonIfMissing(path.join(root, "bumbee.config.json"), config);
  writeFileIfMissing(path.join(root, "AI_README.md"), [
    "# Bumbee Wiki Studio",
    "",
    "This is an Obsidian-ready Bumbee Wiki Studio workspace.",
    "",
    "AI agents should read these files before work:",
    "",
    "1. `AI_README.md`",
    "2. `AGENTS.md`",
    "3. `CODEX.md` or `CLAUDE.md`",
    "4. current project `PROJECT.work.md`",
    "5. current project `PROJECT.progress.md`",
    "",
    "Main rule: one project = one `PROJECT.work.md` + one `PROJECT.progress.md`.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(root, "AGENTS.md"), [
    "# Agent Rules",
    "",
    "- Preserve the user's intent.",
    "- Keep the main project context in `PROJECT.work.md`.",
    "- Record progress, blockers, and decisions in `PROJECT.progress.md`.",
    "- Do not sync secrets or perform sensitive actions without permission.",
    "- Use tags: `#IDEA`, `#CRM`, `#TICKET`, `#PUBLISHER`, `#THAM_MUU`, `#FINAL`.",
    "- Sensitive gateway actions must be written into `07-actions/action-queue.json` first.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(root, "CODEX.md"), [
    "# Codex Instructions",
    "",
    "Read `AI_README.md`, `AGENTS.md`, then the current project work/progress files before editing.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(root, "CLAUDE.md"), [
    "# Claude Code Instructions",
    "",
    "Read `AI_README.md`, `AGENTS.md`, then the current project work/progress files before editing.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(root, "01-rules", "tag-command-rules.md"), [
    "# Tag Command Rules",
    "",
    "| Tag | Worker action | Safety mode |",
    "| --- | --- | --- |",
    "| `#IDEA` | Analyze and score the idea | suggest only |",
    "| `#CRM` | Draft customer/sales follow-up | confirm required |",
    "| `#TICKET` | Convert into execution checklist | suggest only |",
    "| `#PUBLISHER` | Prepare publish package | confirm required |",
    "| `#THAM_MUU` | Strategic advisor review | suggest only |",
    "| `#FINAL` | Final review before release | confirm required |",
    "| `#CHUP_ANH` | Collect image assets | confirm required |",
    "| `#VIDEO` | Draft video script plan | suggest only |",
    "| `#RA_LENH` | Prepare operator/gateway command | confirm required |",
    "",
    "Rule: workers may draft and analyze automatically, but email/publish/delete/sync-sensitive actions remain in the action queue until confirmed.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(root, "02-process-library", "daily-operator-review.md"), [
    "# Daily Operator Review",
    "",
    "## Morning",
    "",
    "- Review `03-projects/*/PROJECT.work.md`.",
    "- Check pending actions in `07-actions/action-queue.json`.",
    "- Choose 1 money-making priority for today.",
    "",
    "## Evening",
    "",
    "- Update `PROJECT.progress.md`.",
    "- Mark done/blocked actions.",
    "- Sync Studio to Bumbee Wiki.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(root, "02-process-library", "idea-analysis-workflow.md"), [
    "# Idea Analysis Workflow",
    "",
    "1. Capture raw idea with `#IDEA`.",
    "2. Score: market value, speed to test, required assets, risk, money path.",
    "3. Convert useful ideas into `#TICKET` checklist.",
    "4. Move approved content to `#FINAL` only after review.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(root, "04-skills", "worker-registry.md"), [
    "# Worker Registry",
    "",
    "| Worker | Trigger | Output |",
    "| --- | --- | --- |",
    "| Idea Analyst | `#IDEA` | score + next steps |",
    "| Project Operator | `#TICKET` | checklist |",
    "| CRM Assistant | `#CRM` | follow-up draft |",
    "| Publisher | `#PUBLISHER`, `#FINAL` | publish package |",
    "| Advisor | `#THAM_MUU`, `#TU_VAN` | strategic review |",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(root, "07-actions", "ACTION_QUEUE.md"), [
    "# Action Queue",
    "",
    "Bumbee On Desk writes suggested worker actions here. Sensitive execution stays pending until confirmed.",
    "",
    "Flow: pending -> waiting_confirmation -> approved -> ready_for_gateway/executed.",
    "",
  ].join("\n"));
  writeJsonIfMissing(path.join(root, ACTION_QUEUE_PATH), {
    version: 1,
    updated_at: null,
    actions: [],
  });
  writeJsonIfMissing(path.join(root, EXECUTION_LOG_PATH), {
    version: 1,
    updated_at: null,
    executions: [],
  });
  writeFileIfMissing(path.join(root, "08-connectors", "CONNECTORS.md"), [
    "# Connector Center",
    "",
    "| Connector | Purpose | Status |",
    "| --- | --- | --- |",
    "| Obsidian | Main editor/project UI | active |",
    "| Bumbee Wiki | Central source/index/chat | active |",
    "| Local folder | PC/Mac folder source | active |",
    "| Gmail | Mail notes/actions | planned |",
    "| Notion | Page sync | planned |",
    "| CRM/Odoo | Business objects | planned |",
    "| Gateway Skills | API/worker execution | planned |",
    "",
  ].join("\n"));
  writeJsonIfMissing(path.join(root, CONNECTOR_REGISTRY_PATH), defaultStudioConfig(opts).connectors);
  writeFileIfMissing(path.join(root, "09-templates", "PROJECT.template.md"), [
    "# {{project_name}}",
    "",
    "Tags: #IDEA #TICKET",
    "Status: NEW",
    "",
    "## Goal",
    "",
    "Describe the business/project outcome.",
    "",
    "## Context",
    "",
    "Links, images, source notes, customer info.",
    "",
    "## Current Decision",
    "",
    "- Pending.",
    "",
    "## Next Actions",
    "",
    "- [ ] Analyze value and money path.",
    "- [ ] Create checklist.",
    "- [ ] Sync to Bumbee Wiki.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(root, "09-templates", "PROJECT.progress.template.md"), [
    "# {{project_name}} Progress",
    "",
    `## ${new Date().toISOString().slice(0, 10)}`,
    "",
    "- Created project.",
    "",
  ].join("\n"));
  const sampleDir = path.join(root, "03-projects", "bumbee-wiki-studio");
  fs.mkdirSync(path.join(sampleDir, "assets"), { recursive: true });
  writeFileIfMissing(path.join(sampleDir, "PROJECT.work.md"), [
    "# Bumbee Wiki Studio",
    "",
    "Tags: #IDEA #TICKET #THAM_MUU",
    "Status: NEW",
    "",
    "## Goal",
    "",
    "Use Obsidian as the project editor while Bumbee On Desk syncs and assists in the background.",
    "",
    "## Next",
    "",
    "- Verify Obsidian vault setup.",
    "- Sync to Bumbee Wiki.",
    "- Ask Advisor for the next project step.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(sampleDir, "PROJECT.progress.md"), [
    "# Bumbee Wiki Studio Progress",
    "",
    `## ${new Date().toISOString().slice(0, 10)}`,
    "",
    "- Studio template created.",
    "- Pending: sync and advisor review.",
    "",
  ].join("\n"));
  return { ok: true, folder: root, config };
}

function readStudioConfig(root) {
  try {
    const configPath = path.join(root, "bumbee.config.json");
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

function deriveProjectForFile(root, file, fallbackProject) {
  const parts = file.relativePath.split("/");
  const projectIndex = parts.indexOf("03-projects");
  if (projectIndex >= 0 && parts[projectIndex + 1]) return parts[projectIndex + 1];
  const config = readStudioConfig(root);
  return config?.default_project || fallbackProject;
}

function readActionQueue(root) {
  const queuePath = path.join(root, ACTION_QUEUE_PATH);
  const queue = readJsonFile(queuePath, { version: 1, updated_at: null, actions: [] });
  if (!Array.isArray(queue.actions)) queue.actions = [];
  return queue;
}

function writeActionQueue(root, queue) {
  queue.version = queue.version || 1;
  queue.updated_at = new Date().toISOString();
  writeJsonFile(path.join(root, ACTION_QUEUE_PATH), queue);
}

function readExecutionLog(root) {
  const log = readJsonFile(path.join(root, EXECUTION_LOG_PATH), { version: 1, updated_at: null, executions: [] });
  if (!Array.isArray(log.executions)) log.executions = [];
  return log;
}

function writeExecutionLog(root, log) {
  log.version = log.version || 1;
  log.updated_at = new Date().toISOString();
  writeJsonFile(path.join(root, EXECUTION_LOG_PATH), log);
}

function readConnectors(root) {
  return readJsonFile(path.join(root, CONNECTOR_REGISTRY_PATH), defaultStudioConfig().connectors);
}

function analyzeStudioFiles(root) {
  const files = listSyncableFiles(root);
  const projects = new Map();
  const actions = [];
  for (const file of files) {
    if (!file.relativePath.startsWith("03-projects/")) continue;
    if (!/PROJECT\.work\.md$/i.test(file.relativePath)) continue;
    let content = "";
    try { content = fs.readFileSync(file.path, "utf8"); } catch { continue; }
    const parts = file.relativePath.split("/");
    const slug = parts[1] || DEFAULT_STUDIO_PROJECT;
    const tags = extractTags(content);
    const projectInfo = {
      slug,
      title: extractTitle(content, slug),
      status: extractStatus(content),
      tags,
      work_file: file.relativePath,
      progress_file: `03-projects/${slug}/PROJECT.progress.md`,
      updated_at: new Date(file.mtimeMs).toISOString(),
    };
    projects.set(slug, projectInfo);
    for (const tag of tags) {
      const rule = TAG_ACTION_RULES[tag];
      if (!rule) continue;
      actions.push({
        id: `${slug}:${rule.type}`,
        project: slug,
        title: rule.title,
        type: rule.type,
        tag: `#${tag}`,
        mode: rule.mode,
        status: "pending",
        source: file.relativePath,
        created_by: "bumbee-on-desk",
      });
    }
  }
  return { projects: Array.from(projects.values()), actions };
}

function refreshActionQueue(root) {
  ensureStudioTemplate(root);
  const scan = analyzeStudioFiles(root);
  const queue = readActionQueue(root);
  const existing = new Map(queue.actions.map(action => [action.id, action]));
  for (const action of scan.actions) {
    if (existing.has(action.id)) continue;
    queue.actions.push({ ...action, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }
  writeActionQueue(root, queue);
  return { ...scan, queue };
}

function runStudioWorkers(root, options = {}) {
  ensureStudioTemplate(root);
  const dashboard = refreshActionQueue(root);
  const queue = dashboard.queue;
  const includeConfirmRequired = options.includeConfirmRequired === true;
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 20;
  let ran = 0;
  const results = [];
  for (const action of queue.actions) {
    if (ran >= limit) break;
    if (action.status !== "pending") continue;
    if (action.mode === "confirm_required" && !includeConfirmRequired) {
      action.status = "waiting_confirmation";
      action.updated_at = new Date().toISOString();
      results.push({ id: action.id, project: action.project, status: action.status, skipped: true });
      continue;
    }
    const projectContent = readProjectWork(root, action.project);
    const markdown = buildWorkerMarkdown(action, projectContent);
    const outputRelPath = writeWorkerOutput(root, action, markdown);
    action.status = action.mode === "confirm_required" ? "draft_ready" : "completed";
    action.output = outputRelPath;
    action.updated_at = new Date().toISOString();
    appendProgressLog(root, action, outputRelPath);
    ran++;
    results.push({ id: action.id, project: action.project, status: action.status, output: outputRelPath });
  }
  writeActionQueue(root, queue);
  return { ok: true, ran, results, queue };
}

function findQueueAction(queue, actionId) {
  return queue.actions.find(action => action.id === actionId);
}

function approveStudioAction(root, actionId, options = {}) {
  ensureStudioTemplate(root);
  const queue = readActionQueue(root);
  const action = findQueueAction(queue, actionId);
  if (!action) return { ok: false, error: `Action not found: ${actionId}` };
  action.status = "approved";
  action.approved_at = new Date().toISOString();
  action.approved_by = options.approvedBy || "local-user";
  action.updated_at = action.approved_at;
  writeActionQueue(root, queue);
  appendActionProgressLog(root, action, [
    `- Approved action: ${action.title || action.type}`,
    `- Action ID: ${action.id}`,
    `- Approved by: ${action.approved_by}`,
  ]);
  return { ok: true, action };
}

function gatewayPayloadForAction(root, action) {
  const projectContent = readProjectWork(root, action.project);
  return {
    action_id: action.id,
    action_type: action.type,
    project: action.project,
    title: action.title,
    source: action.source,
    tag: action.tag,
    mode: action.mode,
    output: action.output || null,
    project_summary: summarizeContent(projectContent),
    requested_by: "bumbee-on-desk",
    created_at: new Date().toISOString(),
  };
}

async function executeStudioGatewayAction(root, actionId, options = {}) {
  ensureStudioTemplate(root);
  const queue = readActionQueue(root);
  const action = findQueueAction(queue, actionId);
  if (!action) return { ok: false, error: `Action not found: ${actionId}` };
  if (action.mode === "confirm_required" && action.status !== "approved" && options.confirm !== true) {
    return { ok: false, needsConfirmation: true, action };
  }
  if (options.confirm === true && action.status !== "approved") {
    action.status = "approved";
    action.approved_at = new Date().toISOString();
    action.approved_by = options.approvedBy || "local-user";
  }
  const payload = gatewayPayloadForAction(root, action);
  const endpoint = options.gatewayActionUrl || process.env.BUMBEE_GATEWAY_ACTION_URL || "";
  const log = readExecutionLog(root);
  const execution = {
    id: `${action.id}:${Date.now()}`,
    action_id: action.id,
    project: action.project,
    type: action.type,
    endpoint: endpoint || null,
    dry_run: !endpoint,
    payload,
    status: endpoint ? "executing" : "ready_for_gateway",
    created_at: new Date().toISOString(),
  };
  try {
    if (endpoint) {
      execution.response = await postJson(endpoint, payload, {
        headers: options.gatewayToken ? { Authorization: `Bearer ${options.gatewayToken}` } : {},
      });
      execution.status = "executed";
      action.status = "executed";
      action.executed_at = new Date().toISOString();
    } else {
      action.status = "ready_for_gateway";
      action.gateway_payload = payload;
    }
    action.updated_at = new Date().toISOString();
    log.executions.push(execution);
    writeExecutionLog(root, log);
    writeActionQueue(root, queue);
    appendActionProgressLog(root, action, [
      `- Gateway action: ${action.title || action.type}`,
      `- Action ID: ${action.id}`,
      `- Status: ${action.status}`,
      `- Endpoint: ${endpoint || "not configured; payload prepared only"}`,
      `- Execution log: ${EXECUTION_LOG_PATH}`,
    ]);
    return { ok: true, action, execution };
  } catch (err) {
    execution.status = "failed";
    execution.error = err.message;
    action.status = "execution_failed";
    action.error = err.message;
    action.updated_at = new Date().toISOString();
    log.executions.push(execution);
    writeExecutionLog(root, log);
    writeActionQueue(root, queue);
    return { ok: false, error: err.message, action, execution };
  }
}

function createStudioProject(root, options = {}) {
  ensureStudioTemplate(root, options);
  const title = String(options.title || options.name || "New Bumbee Project").trim();
  const slug = slugifyProjectName(options.slug || title);
  const projectDir = path.join(root, "03-projects", slug);
  fs.mkdirSync(path.join(projectDir, "assets"), { recursive: true });
  const tags = Array.isArray(options.tags) && options.tags.length ? options.tags : ["#IDEA", "#TICKET"];
  writeFileIfMissing(path.join(projectDir, "PROJECT.work.md"), [
    `# ${title}`,
    "",
    `Tags: ${tags.join(" ")}`,
    "Status: NEW",
    "",
    "## Goal",
    "",
    options.goal || "Describe the project outcome and money path.",
    "",
    "## Context",
    "",
    "Add links, images, files, customer notes, and source data here.",
    "",
    "## Decisions",
    "",
    "- Pending.",
    "",
    "## Next Actions",
    "",
    "- [ ] Analyze idea value.",
    "- [ ] Convert into execution checklist.",
    "- [ ] Sync to Bumbee Wiki.",
    "",
  ].join("\n"));
  writeFileIfMissing(path.join(projectDir, "PROJECT.progress.md"), [
    `# ${title} Progress`,
    "",
    `## ${new Date().toISOString().slice(0, 10)}`,
    "",
    "- Project created from Bumbee On Desk.",
    "",
  ].join("\n"));
  return { ok: true, slug, title, folder: projectDir };
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
  const studioFolder = opts.studioFolder || process.env.BUMBEE_STUDIO_DIR || path.join(os.homedir(), "Bumbee", "bumbee-wiki-studio");
  const libraryId = opts.libraryId || process.env.BUMBEE_WIKI_LIBRARY_ID || null;
  const tokenFile = opts.tokenFile || process.env.BUMBEE_WIKI_TOKEN_FILE || null;
  const client = opts.client || require("./bumbee-wiki-client")({
    baseUrl: opts.baseUrl,
    getToken: () => readTokenFile(tokenFile),
  });
  const enabled = opts.enabled !== false && process.env.BUMBEE_WIKI_ENABLE !== "0";

  let lastSyncAt = null;
  let lastStudioSyncAt = null;
  let lastError = null;
  let lastStudioError = null;
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

  async function setupStudio(options = {}) {
    const targetFolder = options.folder || studioFolder;
    const result = ensureStudioTemplate(targetFolder, {
      edition: options.edition || "pro",
      project: options.project || DEFAULT_STUDIO_PROJECT,
      deviceId,
      accountId: options.accountId || "",
      wikiApiUrl: client.baseUrl || "https://wiki.bumbee.asia/api",
    });
    const dashboard = refreshActionQueue(targetFolder);
    return { ...result, dashboard };
  }

  async function syncStudio(options = {}) {
    if (!enabled) return { ok: false, error: "Bumbee Wiki disabled", synced: 0, skipped: 0 };
    const targetFolder = options.folder || studioFolder;
    await setupStudio({ folder: targetFolder, edition: options.edition || "pro" });
    if (options.register !== false) await registerApp().catch(() => {});
    const files = listSyncableFiles(targetFolder, { maxFileBytes: options.maxFileBytes });
    let synced = 0;
    let skipped = 0;
    const errors = [];
    for (const file of files) {
      if (file.relativePath.includes("/.obsidian/") || file.relativePath.startsWith(".obsidian/")) {
        skipped++;
        continue;
      }
      const key = `studio:${makeSyncKey(file)}`;
      if (!options.force && syncedKeys.get(`studio:${file.relativePath}`) === key) {
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
      const fileProject = deriveProjectForFile(targetFolder, file, DEFAULT_STUDIO_PROJECT);
      const title = file.relativePath.replace(/\.[^.]+$/, "");
      const payload = {
        title,
        content,
        project: fileProject,
        source: `bumbee-studio://${deviceId}/${file.relativePath}`,
        source_kind: "bumbee-obsidian-studio",
        tags: ["bumbee-wiki-studio", "obsidian", `device:${deviceId}`, `app:${appId}`],
      };
      try {
        await client.ingestDocument(payload);
        syncedKeys.set(`studio:${file.relativePath}`, key);
        synced++;
      } catch (err) {
        errors.push({ file: file.relativePath, error: err.message });
      }
    }
    lastStudioSyncAt = new Date().toISOString();
    lastStudioError = errors.length ? errors.map(e => `${e.file}: ${e.error}`).join("; ") : null;
    const dashboard = refreshActionQueue(targetFolder);
    return { ok: errors.length === 0, folder: targetFolder, appId, project: DEFAULT_STUDIO_PROJECT, deviceId, synced, skipped, errors, dashboard };
  }

  async function studioDashboard(options = {}) {
    const targetFolder = options.folder || studioFolder;
    const dashboard = refreshActionQueue(targetFolder);
    const connectors = readConnectors(targetFolder);
    const pendingActions = dashboard.queue.actions.filter(action => action.status === "pending");
    return {
      ok: true,
      folder: targetFolder,
      deviceId,
      appId,
      projects: dashboard.projects,
      actions: dashboard.queue.actions,
      pendingActions: pendingActions.length,
      connectors,
      updated_at: dashboard.queue.updated_at,
    };
  }

  async function newStudioProject(options = {}) {
    const targetFolder = options.folder || studioFolder;
    const projectResult = createStudioProject(targetFolder, options);
    const dashboard = refreshActionQueue(targetFolder);
    return { ...projectResult, dashboard };
  }

  async function runWorkers(options = {}) {
    const targetFolder = options.folder || studioFolder;
    const result = runStudioWorkers(targetFolder, options);
    const dashboard = refreshActionQueue(targetFolder);
    return { ...result, dashboard };
  }

  async function approveAction(options = {}) {
    const targetFolder = options.folder || studioFolder;
    const result = approveStudioAction(targetFolder, options.actionId, options);
    const dashboard = refreshActionQueue(targetFolder);
    return { ...result, dashboard };
  }

  async function runGatewayAction(options = {}) {
    const targetFolder = options.folder || studioFolder;
    const result = await executeStudioGatewayAction(targetFolder, options.actionId, options);
    const dashboard = refreshActionQueue(targetFolder);
    return { ...result, dashboard };
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
      studioFolder,
      appId,
      project,
      deviceId,
      deviceName,
      libraryId,
      lastSyncAt,
      lastStudioSyncAt,
      lastRegisteredAt,
      lastError,
      lastStudioError,
    };
  }

  return { start, ensureFolder, setupStudio, syncStudio, studioDashboard, newStudioProject, runWorkers, approveAction, runGatewayAction, registerApp, syncOnce, ask, updates, status };
};

module.exports.listSyncableFiles = listSyncableFiles;
module.exports.makeSyncKey = makeSyncKey;
module.exports.ensureStudioTemplate = ensureStudioTemplate;
module.exports.extractTags = extractTags;
module.exports.createStudioProject = createStudioProject;
module.exports.runStudioWorkers = runStudioWorkers;
module.exports.approveStudioAction = approveStudioAction;
module.exports.executeStudioGatewayAction = executeStudioGatewayAction;
