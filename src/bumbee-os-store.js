"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_DATA = {
  version: 4,
  workItems: [],
  ideaNotes: [],
  dailyDigests: [],
  dailyMemoryReviews: [],
  wikiCandidates: [],
  jiraDrafts: [],
  skillResearchItems: [],
  gatewayApiDrafts: [],
  knowledgeSyncPlans: [],
  workspaceConnections: [],
  teamMembers: [],
  opsDashboards: [],
  commandSessions: [],
  commandMessages: [],
  companionMessages: [],
  clips: [],
  vocabulary: [],
  learningSessions: [],
  userProfiles: [],
  publisherProfiles: [],
  servicePackages: [],
  integrations: [],
  actionQueue: [],
  paymentIntents: [],
  paymentNotifications: [],
  settings: {
    workMode: "prepare_for_review",
    autoPublish: false,
    realMoneyWallet: false,
    cameraEnabled: false,
    microphoneEnabled: false,
    sepayEnvironment: "sandbox",
    sepayBankCode: "",
    sepayAccountNumber: "",
    sepayAccountName: "",
    sepayQrTemplate: "compact",
    companionMode: "daily_work_companion",
    dailyIdeaScanEnabled: true,
    dailyWikiReviewEnabled: true,
    capabilityLearningEnabled: true,
    jiraProjectUrl: "https://jira.bumbee.asia/bumbee-on-desk/projects/2bc56e64-4b21-4d1d-9126-11daa3a1d543/issues/",
    notionDailyJournalUrl: "https://www.notion.so/BUMBEE-STUDIO-IDEA-HO-N-THI-N-IDEA-356f8cb9fada80eabfe6cb6edca893cc",
    sourceFolders: [
      "~/Bumbee/bumbee-wiki-studio",
      "~/Bumbee/bumbee-wiki",
      "/home/bumbee_workspace/awesome-bumbee-skills/bumbee-studio-idea/nhutpham-task",
    ],
    localWikiInboxFolder: "~/Bumbee/bumbee-wiki-studio/02-wiki-inbox",
    defaultWorkspaceScanMode: "local_first_connector_drafts",
    commandChatMode: "remember_analyze_draft_actions",
  },
};

const DEFAULT_SERVICE_PACKAGES = [
  {
    id: "pkg_personal_ai",
    name: "Bumbee Personal AI",
    segment: "personal",
    status: "draft_pricing",
    features: ["owner guide", "local wiki", "English trailer mode", "idea capture", "draft publisher"],
    pricing_note: "Owner approval required before public pricing.",
  },
  {
    id: "pkg_agency_publisher",
    name: "Bumbee Agency Publisher",
    segment: "agency",
    status: "draft_pricing",
    features: ["publisher profiles", "multi-platform draft queue", "content review", "customer demo docs"],
    pricing_note: "Draft package. No auto publish until connector approval.",
  },
  {
    id: "pkg_business_os",
    name: "Bumbee Business OS",
    segment: "business",
    status: "draft_pricing",
    features: ["team setup", "Jira skills", "Odoo CRM handoff", "local wiki", "workflow recipes"],
    pricing_note: "Needs Odoo product mapping.",
  },
  {
    id: "pkg_iot_full",
    name: "Bumbee IoT Full Package",
    segment: "iot",
    status: "draft_pricing",
    features: ["IoT setup", "monitoring", "AI assistant", "customer training", "support handoff"],
    pricing_note: "Needs hardware bill of materials before public pricing.",
  },
];

const DEFAULT_INTEGRATIONS = [
  { id: "int_gateway", name: "Bumbee API Gateway", type: "gateway", status: "metadata_ready", mode: "read_write_local" },
  { id: "int_wiki", name: "Bumbee Wiki Local", type: "wiki", status: "ready_for_sync", mode: "local_first" },
  { id: "int_jira", name: "Bumbee Jira Skills", type: "tasks", status: "ready_for_handoff", mode: "draft_ticket" },
  { id: "int_odoo", name: "BitDanceGroup Odoo", type: "crm", status: "handoff_ready", mode: "no_live_write" },
  { id: "int_publisher", name: "Social Publisher", type: "publisher", status: "draft_only", mode: "review_required" },
  { id: "int_sepay", name: "SePay", type: "payment", status: "sandbox_ready", mode: "secret_config_required" },
  { id: "int_sqlite", name: "SQLite Export", type: "database", status: "sql_dump_ready", mode: "export_only" },
  { id: "int_qdrant", name: "Qdrant Lite", type: "vector", status: "schema_ready", mode: "future_runtime" },
  { id: "int_skill_research", name: "Skill Research Backlog", type: "learning", status: "draft_ready", mode: "owner_review_required" },
  { id: "int_gateway_api_lab", name: "Gateway API Lab", type: "gateway", status: "draft_ready", mode: "no_live_deploy" },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeString(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max || 4000);
}

function normalizeArray(value, maxItems, maxString) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item, maxString || 120)).filter(Boolean).slice(0, maxItems || 20);
}

function normalizePath(value) {
  const raw = normalizeString(value, 800);
  if (!raw) return "";
  if (raw === "~") return process.env.HOME || "";
  if (raw.startsWith("~/")) return path.join(process.env.HOME || "", raw.slice(2));
  return raw;
}

function extractHashtags(text) {
  const tags = new Set();
  const regex = /(^|[\s([{])#([A-Za-z0-9_\-À-ỹ]+)/gu;
  let match;
  while ((match = regex.exec(String(text || "")))) {
    tags.add(match[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/-/g, "_"));
  }
  return Array.from(tags).slice(0, 12);
}

function extractTitleFromText(text, fallback) {
  const firstHeading = String(text || "").split(/\r?\n/).find((line) => /^#\s+/.test(line));
  if (firstHeading) return normalizeString(firstHeading.replace(/^#\s+/, ""), 160);
  const firstLine = String(text || "").split(/\r?\n/).find((line) => line.trim());
  return normalizeString(firstLine, 160) || fallback;
}

function summarizeText(text, max) {
  return normalizeString(String(text || "").replace(/^---[\s\S]*?---/m, "").replace(/\s+/g, " "), max || 900);
}

function estimatePriority(text) {
  const value = String(text || "").toLowerCase();
  if (/urgent|gấp|ngay|deadline|khẩn|prod|payment|webhook|bug|lỗi/.test(value)) return "high";
  if (/jira|task|khách|customer|doanh thu|bán|money|payment|odoo/.test(value)) return "normal";
  return "low";
}

function addDaysIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function classifyCommandIntent(text) {
  const value = String(text || "").toLowerCase();
  if (/doanh thu|revenue|crm|khách|customer|cơ hội|opportunit|odoo/.test(value)) return "crm_revenue_report";
  if (/đăng|publish|social|trang chủ|homepage|sản phẩm|product/.test(value)) return "publisher_work";
  if (/jira|task|việc|deadline|nhân sự|team|giao việc/.test(value)) return "jira_workspace";
  if (/phân tích|đánh giá|idea|ý tưởng|analysis|analyze/.test(value)) return "analysis";
  if (/làm|triển khai|ra lệnh|command|chạy|tạo/.test(value)) return "command";
  return "question";
}

function ensureSeedData(data) {
  if (!Array.isArray(data.servicePackages) || data.servicePackages.length === 0) {
    data.servicePackages = clone(DEFAULT_SERVICE_PACKAGES);
  }
  if (!Array.isArray(data.integrations) || data.integrations.length === 0) {
    data.integrations = clone(DEFAULT_INTEGRATIONS);
  }
  return data;
}

function sqlQuote(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

module.exports = function createBumbeeOsStore(userDataPath) {
  const filePath = path.join(userDataPath, "bumbee-os", "store.json");

  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return ensureSeedData({
        ...clone(DEFAULT_DATA),
        ...data,
        settings: { ...DEFAULT_DATA.settings, ...(data.settings || {}) },
        workItems: Array.isArray(data.workItems) ? data.workItems : [],
        ideaNotes: Array.isArray(data.ideaNotes) ? data.ideaNotes : [],
        dailyDigests: Array.isArray(data.dailyDigests) ? data.dailyDigests : [],
        dailyMemoryReviews: Array.isArray(data.dailyMemoryReviews) ? data.dailyMemoryReviews : [],
        wikiCandidates: Array.isArray(data.wikiCandidates) ? data.wikiCandidates : [],
        jiraDrafts: Array.isArray(data.jiraDrafts) ? data.jiraDrafts : [],
        skillResearchItems: Array.isArray(data.skillResearchItems) ? data.skillResearchItems : [],
        gatewayApiDrafts: Array.isArray(data.gatewayApiDrafts) ? data.gatewayApiDrafts : [],
        knowledgeSyncPlans: Array.isArray(data.knowledgeSyncPlans) ? data.knowledgeSyncPlans : [],
        workspaceConnections: Array.isArray(data.workspaceConnections) ? data.workspaceConnections : [],
        teamMembers: Array.isArray(data.teamMembers) ? data.teamMembers : [],
        opsDashboards: Array.isArray(data.opsDashboards) ? data.opsDashboards : [],
        commandSessions: Array.isArray(data.commandSessions) ? data.commandSessions : [],
        commandMessages: Array.isArray(data.commandMessages) ? data.commandMessages : [],
        companionMessages: Array.isArray(data.companionMessages) ? data.companionMessages : [],
        clips: Array.isArray(data.clips) ? data.clips : [],
        vocabulary: Array.isArray(data.vocabulary) ? data.vocabulary : [],
        learningSessions: Array.isArray(data.learningSessions) ? data.learningSessions : [],
        userProfiles: Array.isArray(data.userProfiles) ? data.userProfiles : [],
        publisherProfiles: Array.isArray(data.publisherProfiles) ? data.publisherProfiles : [],
        servicePackages: Array.isArray(data.servicePackages) ? data.servicePackages : [],
        integrations: Array.isArray(data.integrations) ? data.integrations : [],
        actionQueue: Array.isArray(data.actionQueue) ? data.actionQueue : [],
        paymentIntents: Array.isArray(data.paymentIntents) ? data.paymentIntents : [],
        paymentNotifications: Array.isArray(data.paymentNotifications) ? data.paymentNotifications : [],
      });
    } catch {
      return ensureSeedData(clone(DEFAULT_DATA));
    }
  }

  function write(data) {
    ensureDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(ensureSeedData(data), null, 2));
    return data;
  }

  function status() {
    const data = read();
    return {
      ok: true,
      filePath,
      version: data.version,
      counts: {
        workItems: data.workItems.length,
        ideaNotes: data.ideaNotes.length,
        dailyDigests: data.dailyDigests.length,
        dailyMemoryReviews: data.dailyMemoryReviews.length,
        wikiCandidates: data.wikiCandidates.length,
        jiraDrafts: data.jiraDrafts.length,
        skillResearchItems: data.skillResearchItems.length,
        gatewayApiDrafts: data.gatewayApiDrafts.length,
        knowledgeSyncPlans: data.knowledgeSyncPlans.length,
        workspaceConnections: data.workspaceConnections.length,
        teamMembers: data.teamMembers.length,
        opsDashboards: data.opsDashboards.length,
        commandSessions: data.commandSessions.length,
        commandMessages: data.commandMessages.length,
        companionMessages: data.companionMessages.length,
        clips: data.clips.length,
        vocabulary: data.vocabulary.length,
        learningSessions: data.learningSessions.length,
        userProfiles: data.userProfiles.length,
        publisherProfiles: data.publisherProfiles.length,
        servicePackages: data.servicePackages.length,
        integrations: data.integrations.length,
        actionQueue: data.actionQueue.length,
        paymentIntents: data.paymentIntents.length,
        paymentNotifications: data.paymentNotifications.length,
      },
      settings: data.settings,
      readiness: {
        ownerGuide: "ready_for_mvp",
        dailyCompanion: "local_digest_and_jira_drafts",
        capabilityLearning: "research_backlog_and_gateway_api_drafts",
        workspaceOps: "local_sources_now_remote_connectors_draft",
        commandChat: "remember_questions_analyze_and_draft_work",
        wikiMemoryReview: "daily_candidates_waiting_owner_approval",
        socialPublisher: "draft_and_review_queue",
        englishTrailer: "local_first",
        gatewayScan: "metadata_ready",
        odooTheme: "handoff_ready_no_live_write",
        databaseDump: "sql_export_ready",
        qdrantLite: "schema_ready_future_runtime",
        ewallet: "sepay_sandbox_ready",
      },
    };
  }

  function list() {
    const data = read();
    return {
      ok: true,
      ...status(),
      workItems: data.workItems.slice(0, 100),
      ideaNotes: data.ideaNotes.slice(0, 100),
      dailyDigests: data.dailyDigests.slice(0, 50),
      dailyMemoryReviews: data.dailyMemoryReviews.slice(0, 50),
      wikiCandidates: data.wikiCandidates.slice(0, 100),
      jiraDrafts: data.jiraDrafts.slice(0, 100),
      skillResearchItems: data.skillResearchItems.slice(0, 100),
      gatewayApiDrafts: data.gatewayApiDrafts.slice(0, 100),
      knowledgeSyncPlans: data.knowledgeSyncPlans.slice(0, 100),
      workspaceConnections: data.workspaceConnections.slice(0, 100),
      teamMembers: data.teamMembers.slice(0, 100),
      opsDashboards: data.opsDashboards.slice(0, 50),
      commandSessions: data.commandSessions.slice(0, 100),
      commandMessages: data.commandMessages.slice(0, 200),
      companionMessages: data.companionMessages.slice(0, 100),
      clips: data.clips.slice(0, 100),
      vocabulary: data.vocabulary.slice(0, 200),
      learningSessions: data.learningSessions.slice(0, 100),
      userProfiles: data.userProfiles.slice(0, 100),
      publisherProfiles: data.publisherProfiles.slice(0, 100),
      servicePackages: data.servicePackages.slice(0, 100),
      integrations: data.integrations.slice(0, 100),
      actionQueue: data.actionQueue.slice(0, 100),
      paymentIntents: data.paymentIntents.slice(0, 100),
      paymentNotifications: data.paymentNotifications.slice(0, 100),
    };
  }

  function addWorkItem(payload) {
    const data = read();
    const title = normalizeString(payload?.title, 180);
    if (!title) return { ok: false, error: "missing title" };
    const now = new Date().toISOString();
    const item = {
      id: makeId("work"),
      title,
      type: normalizeString(payload?.type, 40) || "idea",
      status: "draft",
      channelDrafts: Array.isArray(payload?.channelDrafts) ? payload.channelDrafts.slice(0, 8) : [],
      tags: normalizeArray(payload?.tags, 12, 40),
      owner_profile_id: normalizeString(payload?.owner_profile_id, 80),
      publisher_profile_id: normalizeString(payload?.publisher_profile_id, 80),
      approval_required: true,
      note: normalizeString(payload?.note, 2000),
      created_at: now,
      updated_at: now,
    };
    data.workItems.unshift(item);
    write(data);
    return { ok: true, item };
  }

  function addIdeaNote(payload) {
    const data = read();
    const body = normalizeString(payload?.body || payload?.note || payload?.message, 8000);
    const title = normalizeString(payload?.title, 180) || extractTitleFromText(body, "Bumbee idea note");
    if (!body && !title) return { ok: false, error: "missing idea note" };
    const now = new Date().toISOString();
    const source = normalizeString(payload?.source, 180) || "bumbee_on_desk_chat";
    const tags = normalizeArray(payload?.tags, 12, 40);
    const autoTags = extractHashtags(body);
    const note = {
      id: makeId("idea"),
      title,
      body,
      source,
      source_url: normalizeString(payload?.source_url, 800),
      tags: Array.from(new Set([...tags, ...autoTags, "idea"])).slice(0, 12),
      priority: ["low", "normal", "high", "urgent"].includes(payload?.priority) ? payload.priority : estimatePriority(`${title}\n${body}`),
      status: "captured",
      created_at: now,
      updated_at: now,
    };
    data.ideaNotes.unshift(note);
    data.workItems.unshift({
      id: makeId("work"),
      title,
      type: "idea",
      status: "draft",
      channelDrafts: ["Bumbee Wiki", "Jira draft", "Owner review"],
      tags: note.tags,
      owner_profile_id: "",
      publisher_profile_id: "",
      approval_required: true,
      note: body,
      created_at: now,
      updated_at: now,
    });
    data.actionQueue.unshift({
      id: makeId("action"),
      title: `Analyze idea: ${title}`,
      action_type: "analyze_idea",
      target_type: "idea_note",
      target_id: note.id,
      priority: note.priority === "low" ? "normal" : note.priority,
      status: "waiting_owner_review",
      note: "Daily companion captured this idea. Review before creating Jira/live work.",
      created_at: now,
    });
    write(data);
    return { ok: true, idea: note };
  }

  function listCandidateFiles(root, opts = {}) {
    const maxFiles = opts.maxFiles || 40;
    const maxAgeHours = opts.maxAgeHours || 72;
    const minMtime = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const supported = new Set([".md", ".markdown", ".txt"]);
    const found = [];
    function walk(dir, depth) {
      if (found.length >= maxFiles || depth > 4) return;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (found.length >= maxFiles) break;
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        let stat = null;
        try { stat = fs.statSync(full); } catch { continue; }
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.isFile() && supported.has(path.extname(entry.name).toLowerCase()) && stat.size <= 512 * 1024 && stat.mtimeMs >= minMtime) {
          found.push({ path: full, mtime: stat.mtime.toISOString(), size: stat.size });
        }
      }
    }
    walk(root, 0);
    return found.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime))).slice(0, maxFiles);
  }

  function collectIdeaSources(payload, data) {
    const sources = [];
    const directNotes = Array.isArray(payload?.notes) ? payload.notes : [];
    for (const note of directNotes.slice(0, 30)) {
      const body = normalizeString(note?.body || note?.content || note, 8000);
      if (!body) continue;
      sources.push({
        title: normalizeString(note?.title, 180) || extractTitleFromText(body, "Inline note"),
        source: normalizeString(note?.source, 300) || "inline",
        body,
        tags: extractHashtags(body),
      });
    }
    for (const note of data.ideaNotes.slice(0, 30)) {
      sources.push({
        title: note.title,
        source: note.source || "idea_note",
        body: note.body || note.note || "",
        tags: note.tags || [],
      });
    }
    const folders = normalizeArray(payload?.sourceFolders, 12, 800);
    const configuredFolders = folders.length ? folders : normalizeArray(data.settings.sourceFolders, 12, 800);
    for (const rawFolder of configuredFolders) {
      const folder = normalizePath(rawFolder);
      if (!folder || !fs.existsSync(folder)) continue;
      for (const file of listCandidateFiles(folder, { maxFiles: 24, maxAgeHours: Number(payload?.maxAgeHours) || 96 })) {
        let body = "";
        try { body = fs.readFileSync(file.path, "utf8"); } catch { continue; }
        if (!body.trim()) continue;
        sources.push({
          title: extractTitleFromText(body, path.basename(file.path)),
          source: file.path,
          body,
          tags: extractHashtags(body),
          mtime: file.mtime,
        });
      }
    }
    return sources.slice(0, 80);
  }

  function buildJiraDraft(source, settings) {
    const title = normalizeString(source.title, 140) || "Bumbee daily task";
    const body = source.body || "";
    const priority = estimatePriority(`${title}\n${body}`);
    const tags = Array.from(new Set([...(source.tags || []), ...extractHashtags(body)])).slice(0, 10);
    return {
      id: makeId("jira"),
      title,
      issue_type: "Task",
      project_url: normalizeString(settings.jiraProjectUrl, 800),
      source: normalizeString(source.source, 800),
      source_title: title,
      priority,
      assignee: "owner_or_selected_teammate",
      tester: "AI tester + owner review",
      deadline_date: addDaysIso(priority === "high" ? 1 : 3),
      status: "draft_waiting_owner_review",
      tags,
      description: [
        `Source: ${source.source}`,
        "",
        "Goal:",
        summarizeText(body, 360) || title,
        "",
        "Acceptance criteria:",
        "- Owner can understand the task without reading the raw note.",
        "- Inputs/data sources are linked or named.",
        "- Output is demoable or reviewable.",
        "- No live publish/send/payment action without explicit approval.",
      ].join("\n"),
      created_at: new Date().toISOString(),
    };
  }

  function inferWikiCategory(text) {
    const value = String(text || "").toLowerCase();
    if (/job|remote|lead|khách|customer|crm|doanh thu|sales|quảng cáo|ads|marketing/.test(value)) return "sales-growth";
    if (/skill|api|gateway|mcp|repo|github|codex|claude/.test(value)) return "skills-api";
    if (/jira|task|deadline|team|nhân sự|report|báo cáo/.test(value)) return "operations";
    if (/english|tiếng anh|trailer|vocab|học/.test(value)) return "learning";
    if (/payment|sepay|vietqr|odoo|sản phẩm|product/.test(value)) return "commerce";
    return "owner-memory";
  }

  function buildWikiCandidate(source, reviewId, settings) {
    const title = extractTitleFromText(source.body || source.title, source.title || "Bumbee wiki memory");
    const body = source.body || "";
    const category = inferWikiCategory(`${title}\n${body}`);
    const tags = Array.from(new Set([category, ...(source.tags || []), ...extractHashtags(body)])).slice(0, 12);
    const summary = summarizeText(body, 700) || title;
    const sourcePath = normalizeString(source.source, 1000);
    return {
      id: makeId("wikicandidate"),
      review_id: reviewId,
      title,
      category,
      summary,
      source: sourcePath,
      source_title: normalizeString(source.title, 180),
      source_mtime: normalizeString(source.mtime, 80),
      tags,
      proposed_wiki_path: normalizeString(settings.localWikiInboxFolder, 800),
      confidence: /https?:\/\/|\/|\.md|notion|jira|odoo|wiki/i.test(sourcePath) ? "medium" : "low",
      reason: "Daily memory review found a reusable idea, source link, workflow, customer/opportunity note, or task context that should be searchable later.",
      owner_question: "Đưa nội dung này vào Bumbee Wiki local inbox để sau này tìm lại không?",
      status: "waiting_owner_approval",
      created_at: new Date().toISOString(),
      approved_at: "",
      wiki_file_path: "",
    };
  }

  function buildDailyMemoryReview(payload = {}) {
    const data = read();
    const now = new Date().toISOString();
    const sources = collectIdeaSources(payload, data);
    const commandSources = data.commandMessages
      .filter((message) => message.role === "owner")
      .slice(0, 30)
      .map((message) => ({
        title: extractTitleFromText(message.message, `Command ${message.message_type}`),
        source: `command-session:${message.session_id}`,
        body: message.message,
        tags: ["command_chat", message.message_type],
        mtime: message.created_at,
      }));
    const companionSources = data.companionMessages
      .filter((message) => message.role === "owner")
      .slice(0, 30)
      .map((message) => ({
        title: extractTitleFromText(message.message, "Companion note"),
        source: message.source || "companion_chat",
        body: message.message,
        tags: ["daily_journal", "companion"],
        mtime: message.created_at,
      }));
    const allSources = [...commandSources, ...companionSources, ...sources];
    const worthRemembering = allSources.filter((source) => {
      const text = `${source.title}\n${source.body}`.toLowerCase();
      return /job|remote|lead|khách|customer|crm|doanh thu|quảng cáo|ads|skill|api|gateway|repo|link|https?:\/\/|wiki|notion|jira|odoo|task|ý tưởng|idea|nhật ký|daily|báo cáo|team|sản phẩm|product/.test(text);
    });
    const selected = (worthRemembering.length ? worthRemembering : allSources).slice(0, Number(payload.limit) || 12);
    const review = {
      id: makeId("memoryreview"),
      date: now.slice(0, 10),
      title: normalizeString(payload.title, 180) || `Bumbee daily wiki memory review ${now.slice(0, 10)}`,
      source_count: allSources.length,
      candidate_count: selected.length,
      summary: selected.length
        ? `Bumbee found ${selected.length} item(s) that may belong in the wiki for future search.`
        : "No strong wiki candidate found from current local notes and chat memory.",
      suggested_questions: [
        "Cái nào cần đưa vào Bumbee Wiki để sau này tìm lại?",
        "Cái nào cần tạo Jira task hoặc CRM lead?",
        "Cái nào cần bổ sung link/repo/API trước khi lưu chính thức?",
      ],
      status: "waiting_owner_approval",
      created_candidate_ids: [],
      created_at: now,
    };
    const candidates = selected.map((source) => buildWikiCandidate(source, review.id, data.settings));
    review.created_candidate_ids = candidates.map((candidate) => candidate.id);
    data.dailyMemoryReviews.unshift(review);
    data.wikiCandidates.unshift(...candidates);
    data.companionMessages.unshift({
      id: makeId("chat"),
      role: "bumbee",
      message: candidates.length
        ? `Bumbee thấy ${candidates.length} kiến thức/note nên đưa vào wiki. Vui lòng duyệt Wiki candidates để lưu vào local wiki inbox.`
        : "Bumbee đã rà nhật ký hôm nay nhưng chưa thấy kiến thức đủ rõ để đưa vào wiki.",
      source: "daily_wiki_memory_review",
      created_at: now,
    });
    data.actionQueue.unshift({
      id: makeId("action"),
      title: `Approve wiki memory review: ${review.date}`,
      action_type: "wiki_memory_review",
      target_type: "daily_memory_review",
      target_id: review.id,
      priority: candidates.some((candidate) => ["sales-growth", "skills-api", "commerce"].includes(candidate.category)) ? "high" : "normal",
      status: "waiting_owner_review",
      note: `${candidates.length} wiki candidate(s) prepared locally. Owner can approve candidates into the local wiki inbox.`,
      created_at: now,
    });
    write(data);
    return { ok: true, review, candidates };
  }

  function safeSlug(value) {
    return normalizeString(value, 120)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "bumbee-memory";
  }

  function approveWikiCandidate(payload = {}) {
    const data = read();
    const id = normalizeString(payload.id || payload.candidate_id, 120);
    const candidate = data.wikiCandidates.find((item) => item.id === id);
    if (!candidate) return { ok: false, error: "wiki candidate not found" };
    const now = new Date().toISOString();
    const inbox = normalizePath(payload.target_folder || candidate.proposed_wiki_path || data.settings.localWikiInboxFolder);
    if (!inbox) return { ok: false, error: "missing local wiki inbox folder" };
    fs.mkdirSync(inbox, { recursive: true });
    const filename = `${now.slice(0, 10)}-${safeSlug(candidate.title)}-${candidate.id.slice(-6)}.md`;
    const filePath = path.join(inbox, filename);
    const markdown = [
      "---",
      `title: ${candidate.title}`,
      `category: ${candidate.category}`,
      `status: approved_local_inbox`,
      `created_at: ${candidate.created_at}`,
      `approved_at: ${now}`,
      `source: ${candidate.source}`,
      `tags: ${(candidate.tags || []).join(", ")}`,
      "---",
      "",
      `# ${candidate.title}`,
      "",
      "## Summary",
      "",
      candidate.summary,
      "",
      "## Why Bumbee saved this",
      "",
      candidate.reason,
      "",
      "## Source",
      "",
      `- ${candidate.source || "bumbee-os-local-memory"}`,
      "",
      "## Owner question",
      "",
      candidate.owner_question,
      "",
    ].join("\n");
    fs.writeFileSync(filePath, markdown, { encoding: "utf8", flag: "wx" });
    candidate.status = "approved_local_inbox";
    candidate.approved_at = now;
    candidate.wiki_file_path = filePath;
    data.actionQueue.unshift({
      id: makeId("action"),
      title: `Wiki memory approved: ${candidate.title}`,
      action_type: "wiki_memory_approved",
      target_type: "wiki_candidate",
      target_id: candidate.id,
      priority: "normal",
      status: "completed_local",
      note: `Saved to ${filePath}. Remote wiki sync/publish still requires connector approval.`,
      created_at: now,
    });
    write(data);
    return { ok: true, candidate, filePath };
  }

  function buildDailyDigest(payload = {}) {
    const data = read();
    const now = new Date().toISOString();
    const sources = collectIdeaSources(payload, data);
    const ideaLikeSources = sources.filter((source) => {
      const text = `${source.title}\n${source.body}`.toLowerCase();
      return /idea|task|jira|bumbee|khách|customer|odoo|wiki|notion|publisher|video|english|học|sales|payment|iot|#/.test(text);
    });
    const selected = (ideaLikeSources.length ? ideaLikeSources : sources).slice(0, Number(payload.limit) || 10);
    const jiraDrafts = selected.map((source) => buildJiraDraft(source, data.settings));
    const digest = {
      id: makeId("digest"),
      date: now.slice(0, 10),
      title: normalizeString(payload.title, 180) || `Bumbee daily idea digest ${now.slice(0, 10)}`,
      source_count: sources.length,
      idea_count: selected.length,
      sources: selected.map((source) => ({
        title: source.title,
        source: source.source,
        tags: source.tags || [],
        summary: summarizeText(source.body, 320),
      })),
      recommendations: selected.slice(0, 5).map((source) => ({
        title: source.title,
        priority: estimatePriority(`${source.title}\n${source.body}`),
        next_action: "Review, then create Jira task or ask Bumbee to refine scope.",
      })),
      risks: [
        "Draft-only: Jira/Notion/live assignment still requires owner approval.",
        "Idea quality depends on available local notes and synced wiki files.",
      ],
      created_jira_draft_ids: jiraDrafts.map((draft) => draft.id),
      status: "waiting_owner_review",
      created_at: now,
    };
    data.dailyDigests.unshift(digest);
    data.jiraDrafts.unshift(...jiraDrafts);
    data.actionQueue.unshift({
      id: makeId("action"),
      title: `Review daily digest: ${digest.date}`,
      action_type: "daily_digest_review",
      target_type: "daily_digest",
      target_id: digest.id,
      priority: selected.some((source) => estimatePriority(`${source.title}\n${source.body}`) === "high") ? "high" : "normal",
      status: "waiting_owner_review",
      note: `${selected.length} candidate idea/task notes, ${jiraDrafts.length} Jira drafts prepared locally.`,
      created_at: now,
    });
    write(data);
    return { ok: true, digest, jiraDrafts };
  }

  function companionChat(payload) {
    const data = read();
    const message = normalizeString(payload?.message || payload?.text, 8000);
    if (!message) return { ok: false, error: "missing message" };
    const now = new Date().toISOString();
    const msg = {
      id: makeId("chat"),
      role: "owner",
      message,
      source: normalizeString(payload?.source, 120) || "bumbee_os_companion",
      created_at: now,
    };
    const ideaResult = addIdeaNote({
      title: extractTitleFromText(message, "Captured from companion chat"),
      body: message,
      source: msg.source,
      tags: ["companion_chat"],
    });
    const reply = {
      id: makeId("chat"),
      role: "bumbee",
      message: [
        "Đã ghi nhận idea/note vào Bumbee OS.",
        "Bumbee đã queue bước phân tích idea và có thể gom vào daily digest để tạo Jira draft.",
        "Chưa có hành động live nào được thực hiện.",
      ].join(" "),
      source: "local_rule",
      created_at: now,
    };
    const nextData = read();
    nextData.companionMessages.unshift(reply, msg);
    write(nextData);
    return { ok: true, captured: ideaResult.idea, reply };
  }

  function proposeCapabilityUpgrade(payload) {
    const data = read();
    const title = normalizeString(payload?.title, 180) || "Bumbee capability upgrade";
    const goal = normalizeString(payload?.goal || payload?.description || payload?.note, 4000);
    if (!goal) return { ok: false, error: "missing goal" };
    const now = new Date().toISOString();
    const requestedSkills = normalizeArray(payload?.skills || payload?.requested_skills, 12, 120);
    const requestedApis = normalizeArray(payload?.apis || payload?.requested_apis, 12, 120);
    const knowledgeSources = normalizeArray(payload?.knowledge_sources || payload?.sources, 20, 300);
    const tags = Array.from(new Set(["capability_learning", "gateway", "skills", ...extractHashtags(`${title}\n${goal}`)])).slice(0, 12);

    const skillItems = (requestedSkills.length ? requestedSkills : ["research new skill", "update final skill docs"]).map((skill) => ({
      id: makeId("skillresearch"),
      title: skill,
      goal,
      source: normalizeString(payload?.source, 160) || "bumbee_os_capability_upgrade",
      status: "research_draft",
      priority: estimatePriority(`${title}\n${goal}\n${skill}`),
      expected_output: [
        "SKILL.md or final-skill update proposal",
        "Usage examples and guardrails",
        "Test checklist before enabling in gateway",
      ],
      tags,
      created_at: now,
    }));

    const apiDrafts = (requestedApis.length ? requestedApis : ["gateway capability registry endpoint"]).map((apiName) => ({
      id: makeId("gatewayapi"),
      name: apiName,
      method: "POST",
      path: `/api/bumbee/capabilities/${apiName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "new-capability"}`,
      purpose: goal,
      auth_required: true,
      status: "draft_no_live_deploy",
      request_schema: {
        title: "string",
        goal: "string",
        sources: "string[]",
        approval: "owner_required",
      },
      response_schema: {
        ok: "boolean",
        draft_id: "string",
        next_review_action: "string",
      },
      risks: [
        "Do not deploy gateway API until owner approves implementation.",
        "Do not execute external write actions without explicit review.",
      ],
      created_at: now,
    }));

    const syncPlan = {
      id: makeId("syncplan"),
      title: `Knowledge sync plan: ${title}`,
      goal,
      sources: knowledgeSources.length ? knowledgeSources : data.settings.sourceFolders,
      targets: [
        "Bumbee OS local store",
        "final-skills-mcps",
        "Bumbee Wiki",
        "Gateway capability registry draft",
      ],
      cadence: "daily_review_or_manual_scan",
      status: "draft_waiting_owner_review",
      created_at: now,
    };

    const workItem = {
      id: makeId("work"),
      title,
      type: "capability_upgrade",
      status: "draft",
      channelDrafts: ["Bumbee Wiki", "Gateway API draft", "Final skills proposal", "Jira draft"],
      tags,
      owner_profile_id: "",
      publisher_profile_id: "",
      approval_required: true,
      note: goal,
      created_at: now,
      updated_at: now,
    };

    const action = {
      id: makeId("action"),
      title: `Review capability upgrade: ${title}`,
      action_type: "capability_upgrade_review",
      target_type: "capability_upgrade",
      target_id: workItem.id,
      priority: skillItems.some((item) => item.priority === "high") ? "high" : "normal",
      status: "waiting_owner_review",
      note: `${skillItems.length} skill research item(s), ${apiDrafts.length} gateway API draft(s), 1 knowledge sync plan prepared locally.`,
      created_at: now,
    };

    data.skillResearchItems.unshift(...skillItems);
    data.gatewayApiDrafts.unshift(...apiDrafts);
    data.knowledgeSyncPlans.unshift(syncPlan);
    data.workItems.unshift(workItem);
    data.actionQueue.unshift(action);
    write(data);
    return { ok: true, workItem, skillResearchItems: skillItems, gatewayApiDrafts: apiDrafts, knowledgeSyncPlan: syncPlan, action };
  }

  function addWorkspaceConnection(payload) {
    const data = read();
    const name = normalizeString(payload?.name, 180);
    if (!name) return { ok: false, error: "missing workspace connection name" };
    const type = normalizeString(payload?.type, 80) || "local_folder";
    const location = normalizeString(payload?.location || payload?.url || payload?.path, 1000);
    const now = new Date().toISOString();
    const localTypes = new Set(["local_folder", "obsidian", "file_folder"]);
    const isLocal = localTypes.has(type);
    const normalizedPath = isLocal ? normalizePath(location) : "";
    const exists = isLocal && normalizedPath ? fs.existsSync(normalizedPath) : false;
    const connection = {
      id: makeId("workspace"),
      name,
      type,
      location,
      normalized_path: normalizedPath,
      scan_mode: isLocal ? "scan_local_files" : "connector_draft",
      status: isLocal ? (exists ? "ready_to_scan" : "path_missing") : "api_or_mcp_connector_needed",
      owner: normalizeString(payload?.owner, 120) || "owner",
      cadence: normalizeString(payload?.cadence, 80) || "daily",
      tags: normalizeArray(payload?.tags, 12, 40),
      notes: normalizeString(payload?.notes, 1200),
      created_at: now,
      updated_at: now,
    };
    data.workspaceConnections.unshift(connection);
    if (isLocal && normalizedPath && !data.settings.sourceFolders.includes(location)) {
      data.settings.sourceFolders = Array.from(new Set([location, ...data.settings.sourceFolders])).slice(0, 12);
    }
    data.actionQueue.unshift({
      id: makeId("action"),
      title: `Review workspace connector: ${name}`,
      action_type: "workspace_connector_review",
      target_type: "workspace_connection",
      target_id: connection.id,
      priority: connection.status === "ready_to_scan" ? "normal" : "high",
      status: "waiting_owner_review",
      note: isLocal
        ? `Local source ${connection.status}. Bumbee can include it in daily scans.`
        : `Remote source stored as connector draft. Needs API/MCP credentials before live scan.`,
      created_at: now,
    });
    write(data);
    return { ok: true, connection };
  }

  function addTeamMember(payload) {
    const data = read();
    const name = normalizeString(payload?.name || payload?.display_name, 160);
    if (!name) return { ok: false, error: "missing team member name" };
    const now = new Date().toISOString();
    const member = {
      id: makeId("member"),
      name,
      role: normalizeString(payload?.role, 120) || "operator",
      member_type: normalizeString(payload?.member_type, 80) || "human",
      email: normalizeString(payload?.email, 180),
      owner_area: normalizeString(payload?.owner_area, 180),
      work_sources: normalizeArray(payload?.work_sources, 20, 200),
      status: normalizeString(payload?.status, 80) || "active",
      daily_report_expected: payload?.daily_report_expected !== false,
      created_at: now,
      updated_at: now,
    };
    data.teamMembers.unshift(member);
    data.actionQueue.unshift({
      id: makeId("action"),
      title: `Setup daily reporting for ${name}`,
      action_type: "team_reporting_setup",
      target_type: "team_member",
      target_id: member.id,
      priority: "normal",
      status: "waiting_owner_review",
      note: "Map Jira/Odoo/email/reporting sources for this person or agent.",
      created_at: now,
    });
    write(data);
    return { ok: true, member };
  }

  function buildOpsDashboard(payload = {}) {
    const data = read();
    const now = new Date().toISOString();
    const readyLocalSources = data.workspaceConnections.filter((item) => item.status === "ready_to_scan").length;
    const remoteDraftSources = data.workspaceConnections.filter((item) => item.status === "api_or_mcp_connector_needed").length;
    const activeMembers = data.teamMembers.filter((item) => item.status !== "inactive").length;
    const waitingActions = data.actionQueue.filter((item) => item.status === "waiting_owner_review").length;
    const dashboard = {
      id: makeId("opsdash"),
      date: now.slice(0, 10),
      title: normalizeString(payload.title, 180) || `Bumbee daily ops dashboard ${now.slice(0, 10)}`,
      metrics: {
        workspace_connections: data.workspaceConnections.length,
        ready_local_sources: readyLocalSources,
        remote_connector_drafts: remoteDraftSources,
        team_members: activeMembers,
        open_actions: waitingActions,
        jira_drafts: data.jiraDrafts.length,
        skill_research_items: data.skillResearchItems.length,
        gateway_api_drafts: data.gatewayApiDrafts.length,
        payment_intents: data.paymentIntents.length,
        paid_payment_intents: data.paymentIntents.filter((item) => item.status === "paid").length,
      },
      sections: [
        {
          name: "Work sources",
          items: data.workspaceConnections.slice(0, 12).map((item) => `${item.name}: ${item.type} / ${item.status}`),
        },
        {
          name: "Team and agents",
          items: data.teamMembers.slice(0, 12).map((item) => `${item.name}: ${item.role} / ${item.member_type} / ${item.status}`),
        },
        {
          name: "Review queue",
          items: data.actionQueue.slice(0, 12).map((item) => `${item.priority}: ${item.title}`),
        },
      ],
      status: "generated_local",
      created_at: now,
    };
    data.opsDashboards.unshift(dashboard);
    write(data);
    return { ok: true, dashboard };
  }

  function createCommandSession(payload = {}) {
    const data = read();
    const now = new Date().toISOString();
    const title = normalizeString(payload.title, 180) || `Bumbee command session ${now.slice(0, 10)}`;
    const session = {
      id: makeId("cmdsession"),
      title,
      purpose: normalizeString(payload.purpose, 800) || "Remember chat, analyze commands, and prepare draft work.",
      status: "active",
      workspace_connection_ids: normalizeArray(payload.workspace_connection_ids, 20, 120),
      team_member_ids: normalizeArray(payload.team_member_ids, 20, 120),
      created_at: now,
      updated_at: now,
    };
    data.commandSessions.unshift(session);
    write(data);
    return { ok: true, session };
  }

  function ensureCommandSession(data, payload = {}) {
    const requested = normalizeString(payload.session_id, 120);
    const existing = requested ? data.commandSessions.find((item) => item.id === requested) : data.commandSessions[0];
    if (existing) return existing;
    const now = new Date().toISOString();
    const session = {
      id: makeId("cmdsession"),
      title: normalizeString(payload.session_title, 180) || `Bumbee command session ${now.slice(0, 10)}`,
      purpose: "Remember chat, analyze commands, and prepare draft work.",
      status: "active",
      workspace_connection_ids: [],
      team_member_ids: [],
      created_at: now,
      updated_at: now,
    };
    data.commandSessions.unshift(session);
    return session;
  }

  function buildCommandAnalysis(text, intent) {
    const summary = summarizeText(text, 420);
    const nextByIntent = {
      crm_revenue_report: "Prepare CRM/revenue report draft from Odoo/customer sources, then owner reviews.",
      publisher_work: "Prepare product/publisher work draft for homepage/social, then owner reviews before publish.",
      jira_workspace: "Create Jira draft and workspace action so owner/team can join execution.",
      analysis: "Capture idea and prepare analysis checklist before turning it into work.",
      command: "Convert command into safe draft action; no live execution until approved.",
      question: "Save question and answer context so future sessions can reference it.",
    };
    return {
      summary,
      intent,
      next_step: nextByIntent[intent] || nextByIntent.question,
      guardrail: "Draft-only. No live Jira, publish, payment, email, or customer update without owner approval.",
    };
  }

  function addCommandMessage(payload = {}) {
    const data = read();
    const text = normalizeString(payload.message || payload.text, 12000);
    if (!text) return { ok: false, error: "missing command message" };
    const now = new Date().toISOString();
    const session = ensureCommandSession(data, payload);
    const intent = classifyCommandIntent(text);
    const analysis = buildCommandAnalysis(text, intent);
    const ownerMessage = {
      id: makeId("cmdmsg"),
      session_id: session.id,
      role: normalizeString(payload.role, 40) || "owner",
      message_type: intent,
      message: text,
      analysis,
      created_at: now,
    };
    const reply = {
      id: makeId("cmdmsg"),
      session_id: session.id,
      role: "bumbee",
      message_type: "analysis_reply",
      message: `${analysis.next_step} ${analysis.guardrail}`,
      analysis,
      created_at: now,
    };
    const title = extractTitleFromText(text, analysis.next_step);
    const work = {
      id: makeId("work"),
      title,
      type: intent === "publisher_work" ? "publisher" : intent === "crm_revenue_report" ? "crm_report" : "command",
      status: "draft",
      channelDrafts: ["Command Chat", "Jira draft", "Workspace", "Owner review"],
      tags: Array.from(new Set(["command_chat", intent, ...extractHashtags(text)])).slice(0, 12),
      owner_profile_id: "",
      publisher_profile_id: "",
      approval_required: true,
      note: text,
      created_at: now,
      updated_at: now,
    };
    const jiraDraft = buildJiraDraft({
      title,
      source: `command-session:${session.id}`,
      body: text,
      tags: work.tags,
    }, data.settings);
    jiraDraft.status = "draft_waiting_owner_review";
    jiraDraft.assignee = "owner_or_team_member";
    jiraDraft.tester = "owner + AI tester";
    const action = {
      id: makeId("action"),
      title: `Review command: ${title}`,
      action_type: intent,
      target_type: "command_session",
      target_id: session.id,
      priority: estimatePriority(text),
      status: "waiting_owner_review",
      note: analysis.next_step,
      created_at: now,
    };
    data.commandMessages.unshift(reply, ownerMessage);
    data.workItems.unshift(work);
    data.jiraDrafts.unshift(jiraDraft);
    data.actionQueue.unshift(action);
    session.updated_at = now;
    write(data);
    return { ok: true, session, message: ownerMessage, reply, workItem: work, jiraDraft, action };
  }

  function addClip(payload) {
    const data = read();
    const title = normalizeString(payload?.title, 180) || "Daily English clip";
    const now = new Date().toISOString();
    const clip = {
      id: makeId("clip"),
      title,
      source_type: ["youtube", "local_file", "manual"].includes(payload?.source_type) ? payload.source_type : "manual",
      source_url: normalizeString(payload?.source_url, 800),
      local_path: normalizeString(payload?.local_path, 800),
      speaker: normalizeString(payload?.speaker, 120),
      topic: normalizeString(payload?.topic, 120) || "general English",
      transcript: normalizeString(payload?.transcript, 12000),
      license_note: normalizeString(payload?.license_note, 400) || "Personal study only. Do not redistribute without rights.",
      created_at: now,
      updated_at: now,
    };
    data.clips.unshift(clip);
    write(data);
    return { ok: true, clip };
  }

  function addVocabulary(payload) {
    const data = read();
    const word = normalizeString(payload?.word_or_phrase || payload?.word, 140);
    if (!word) return { ok: false, error: "missing word_or_phrase" };
    const vocab = {
      id: makeId("vocab"),
      clip_id: normalizeString(payload?.clip_id, 80),
      word_or_phrase: word,
      meaning_vi: normalizeString(payload?.meaning_vi, 500),
      meaning_en: normalizeString(payload?.meaning_en, 500),
      example_sentence: normalizeString(payload?.example_sentence, 600),
      timestamp_seconds: Number.isFinite(payload?.timestamp_seconds) ? Math.max(0, Math.floor(payload.timestamp_seconds)) : null,
      category: normalizeString(payload?.category, 80) || "unknown",
      review_status: "new",
      created_at: new Date().toISOString(),
    };
    data.vocabulary.unshift(vocab);
    write(data);
    return { ok: true, vocabulary: vocab };
  }

  function addUserProfile(payload) {
    const data = read();
    const displayName = normalizeString(payload?.display_name || payload?.name, 160);
    if (!displayName) return { ok: false, error: "missing display_name" };
    const now = new Date().toISOString();
    const profile = {
      id: makeId("profile"),
      display_name: displayName,
      role: normalizeString(payload?.role, 80) || "owner",
      workspace: normalizeString(payload?.workspace, 160) || "default",
      interests: normalizeArray(payload?.interests, 30, 80),
      skills: normalizeArray(payload?.skills, 30, 80),
      data_sources: normalizeArray(payload?.data_sources, 30, 200),
      permission_level: normalizeString(payload?.permission_level, 80) || "local_only",
      created_at: now,
      updated_at: now,
    };
    data.userProfiles.unshift(profile);
    write(data);
    return { ok: true, profile };
  }

  function addPublisherProfile(payload) {
    const data = read();
    const name = normalizeString(payload?.name, 160);
    if (!name) return { ok: false, error: "missing name" };
    const now = new Date().toISOString();
    const profile = {
      id: makeId("publisher"),
      name,
      platforms: normalizeArray(payload?.platforms, 12, 80),
      tone: normalizeString(payload?.tone, 160) || "clear and useful",
      audience: normalizeString(payload?.audience, 260),
      review_policy: "owner_review_required",
      auto_post_enabled: false,
      created_at: now,
      updated_at: now,
    };
    data.publisherProfiles.unshift(profile);
    write(data);
    return { ok: true, profile };
  }

  function queueAction(payload) {
    const data = read();
    const title = normalizeString(payload?.title, 180);
    if (!title) return { ok: false, error: "missing title" };
    const action = {
      id: makeId("action"),
      title,
      action_type: normalizeString(payload?.action_type, 80) || "review",
      target_type: normalizeString(payload?.target_type, 80) || "work_item",
      target_id: normalizeString(payload?.target_id, 100),
      priority: ["low", "normal", "high", "urgent"].includes(payload?.priority) ? payload.priority : "normal",
      status: "waiting_owner_review",
      note: normalizeString(payload?.note, 1000),
      created_at: new Date().toISOString(),
    };
    data.actionQueue.unshift(action);
    write(data);
    return { ok: true, action };
  }

  function buildSepayQrUrl(config, amount, description) {
    const bank = normalizeString(config.bank || config.bankCode || config.sepayBankCode, 80);
    const acc = normalizeString(config.account || config.accountNumber || config.sepayAccountNumber, 80);
    if (!bank || !acc) return "";
    let des = normalizeString(description, 160);
    if (bank.toLowerCase() === "vietinbank" && !des.toUpperCase().includes("SEVQR")) {
      des = `SEVQR ${des}`;
    }
    const params = new URLSearchParams();
    params.set("acc", acc);
    params.set("bank", bank);
    if (amount > 0) params.set("amount", String(Math.floor(amount)));
    if (des) params.set("des", des);
    params.set("template", normalizeString(config.template || config.sepayQrTemplate, 20) || "compact");
    return `https://qr.sepay.vn/img?${params.toString()}`;
  }

  function createSepayPaymentIntent(payload) {
    const data = read();
    const amount = Math.max(0, Math.floor(Number(payload?.amount || 0)));
    if (!amount) return { ok: false, error: "missing amount" };
    const now = new Date().toISOString();
    const paymentCode = normalizeString(payload?.payment_code, 80) || `BOS${Date.now().toString(36).toUpperCase()}`;
    const config = {
      bank: payload?.bank || data.settings.sepayBankCode,
      account: payload?.account || data.settings.sepayAccountNumber,
      template: payload?.template || data.settings.sepayQrTemplate,
    };
    const description = normalizeString(payload?.description, 160) || paymentCode;
    const intent = {
      id: makeId("pay"),
      provider: "sepay",
      environment: payload?.environment === "production" ? "production" : "sandbox",
      payment_code: paymentCode,
      amount,
      currency: "VND",
      description,
      bank: normalizeString(config.bank, 80),
      account: normalizeString(config.account, 80),
      account_name: normalizeString(payload?.account_name || data.settings.sepayAccountName, 160),
      qr_url: buildSepayQrUrl(config, amount, description),
      status: "pending",
      source: normalizeString(payload?.source, 80) || "bumbee_os",
      created_at: now,
      updated_at: now,
    };
    data.paymentIntents.unshift(intent);
    write(data);
    return { ok: true, intent };
  }

  function recordSepayNotification(payload) {
    const data = read();
    const order = payload?.order && typeof payload.order === "object" ? payload.order : {};
    const transaction = payload?.transaction && typeof payload.transaction === "object" ? payload.transaction : {};
    const transactionId = normalizeString(transaction.transaction_id || transaction.id || payload?.referenceCode, 120);
    const invoice = normalizeString(order.order_invoice_number || order.order_id || payload?.code, 120);
    const duplicate = transactionId && data.paymentNotifications.some((item) => item.transaction_id === transactionId);
    const notification = {
      id: makeId("sepay"),
      provider: "sepay",
      duplicate,
      notification_type: normalizeString(payload?.notification_type || "BANK_WEBHOOK", 80),
      order_invoice_number: invoice,
      transaction_id: transactionId,
      transaction_status: normalizeString(transaction.transaction_status || payload?.transferType, 80),
      amount: Math.floor(Number(transaction.transaction_amount || order.order_amount || payload?.transferAmount || 0)),
      raw_payload: payload || {},
      received_at: new Date().toISOString(),
    };
    data.paymentNotifications.unshift(notification);
    if (!duplicate && invoice) {
      const intent = data.paymentIntents.find((item) => item.payment_code === invoice || item.description.includes(invoice));
      if (intent && (notification.notification_type === "ORDER_PAID" || notification.transaction_status === "APPROVED" || payload?.transferType === "in")) {
        intent.status = "paid";
        intent.updated_at = notification.received_at;
      }
    }
    write(data);
    return { ok: true, notification };
  }

  function exportSqlDump() {
    const data = read();
    const lines = [
      "-- Bumbee OS local-first SQL export",
      "BEGIN TRANSACTION;",
      "CREATE TABLE IF NOT EXISTS bumbee_work_items (id TEXT PRIMARY KEY, title TEXT, type TEXT, status TEXT, tags_json TEXT, note TEXT, approval_required INTEGER, created_at TEXT, updated_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_idea_notes (id TEXT PRIMARY KEY, title TEXT, body TEXT, source TEXT, source_url TEXT, tags_json TEXT, priority TEXT, status TEXT, created_at TEXT, updated_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_daily_digests (id TEXT PRIMARY KEY, date TEXT, title TEXT, source_count INTEGER, idea_count INTEGER, sources_json TEXT, recommendations_json TEXT, status TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_daily_memory_reviews (id TEXT PRIMARY KEY, date TEXT, title TEXT, source_count INTEGER, candidate_count INTEGER, summary TEXT, suggested_questions_json TEXT, created_candidate_ids_json TEXT, status TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_wiki_candidates (id TEXT PRIMARY KEY, review_id TEXT, title TEXT, category TEXT, summary TEXT, source TEXT, source_title TEXT, tags_json TEXT, proposed_wiki_path TEXT, confidence TEXT, reason TEXT, owner_question TEXT, status TEXT, approved_at TEXT, wiki_file_path TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_jira_drafts (id TEXT PRIMARY KEY, title TEXT, issue_type TEXT, project_url TEXT, source TEXT, priority TEXT, assignee TEXT, tester TEXT, deadline_date TEXT, status TEXT, tags_json TEXT, description TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_skill_research_items (id TEXT PRIMARY KEY, title TEXT, goal TEXT, source TEXT, status TEXT, priority TEXT, expected_output_json TEXT, tags_json TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_gateway_api_drafts (id TEXT PRIMARY KEY, name TEXT, method TEXT, path TEXT, purpose TEXT, auth_required INTEGER, status TEXT, request_schema_json TEXT, response_schema_json TEXT, risks_json TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_knowledge_sync_plans (id TEXT PRIMARY KEY, title TEXT, goal TEXT, sources_json TEXT, targets_json TEXT, cadence TEXT, status TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_workspace_connections (id TEXT PRIMARY KEY, name TEXT, type TEXT, location TEXT, normalized_path TEXT, scan_mode TEXT, status TEXT, owner TEXT, cadence TEXT, tags_json TEXT, notes TEXT, created_at TEXT, updated_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_team_members (id TEXT PRIMARY KEY, name TEXT, role TEXT, member_type TEXT, email TEXT, owner_area TEXT, work_sources_json TEXT, status TEXT, daily_report_expected INTEGER, created_at TEXT, updated_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_ops_dashboards (id TEXT PRIMARY KEY, date TEXT, title TEXT, metrics_json TEXT, sections_json TEXT, status TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_command_sessions (id TEXT PRIMARY KEY, title TEXT, purpose TEXT, status TEXT, workspace_connection_ids_json TEXT, team_member_ids_json TEXT, created_at TEXT, updated_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_command_messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, message_type TEXT, message TEXT, analysis_json TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_companion_messages (id TEXT PRIMARY KEY, role TEXT, message TEXT, source TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_clips (id TEXT PRIMARY KEY, title TEXT, source_type TEXT, source_url TEXT, local_path TEXT, speaker TEXT, topic TEXT, transcript TEXT, license_note TEXT, created_at TEXT, updated_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_vocabulary (id TEXT PRIMARY KEY, clip_id TEXT, word_or_phrase TEXT, meaning_vi TEXT, meaning_en TEXT, example_sentence TEXT, timestamp_seconds INTEGER, category TEXT, review_status TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_user_profiles (id TEXT PRIMARY KEY, display_name TEXT, role TEXT, workspace TEXT, interests_json TEXT, skills_json TEXT, data_sources_json TEXT, permission_level TEXT, created_at TEXT, updated_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_publisher_profiles (id TEXT PRIMARY KEY, name TEXT, platforms_json TEXT, tone TEXT, audience TEXT, review_policy TEXT, auto_post_enabled INTEGER, created_at TEXT, updated_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_service_packages (id TEXT PRIMARY KEY, name TEXT, segment TEXT, status TEXT, features_json TEXT, pricing_note TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_integrations (id TEXT PRIMARY KEY, name TEXT, type TEXT, status TEXT, mode TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_action_queue (id TEXT PRIMARY KEY, title TEXT, action_type TEXT, target_type TEXT, target_id TEXT, priority TEXT, status TEXT, note TEXT, created_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_payment_intents (id TEXT PRIMARY KEY, provider TEXT, environment TEXT, payment_code TEXT, amount INTEGER, currency TEXT, description TEXT, bank TEXT, account TEXT, qr_url TEXT, status TEXT, created_at TEXT, updated_at TEXT);",
      "CREATE TABLE IF NOT EXISTS bumbee_payment_notifications (id TEXT PRIMARY KEY, provider TEXT, duplicate INTEGER, notification_type TEXT, order_invoice_number TEXT, transaction_id TEXT, transaction_status TEXT, amount INTEGER, received_at TEXT, raw_payload_json TEXT);",
    ];
    for (const item of data.workItems) {
      lines.push(`INSERT OR REPLACE INTO bumbee_work_items VALUES (${sqlQuote(item.id)}, ${sqlQuote(item.title)}, ${sqlQuote(item.type)}, ${sqlQuote(item.status)}, ${sqlQuote(JSON.stringify(item.tags || []))}, ${sqlQuote(item.note)}, ${item.approval_required === false ? 0 : 1}, ${sqlQuote(item.created_at)}, ${sqlQuote(item.updated_at)});`);
    }
    for (const note of data.ideaNotes) {
      lines.push(`INSERT OR REPLACE INTO bumbee_idea_notes VALUES (${sqlQuote(note.id)}, ${sqlQuote(note.title)}, ${sqlQuote(note.body)}, ${sqlQuote(note.source)}, ${sqlQuote(note.source_url)}, ${sqlQuote(JSON.stringify(note.tags || []))}, ${sqlQuote(note.priority)}, ${sqlQuote(note.status)}, ${sqlQuote(note.created_at)}, ${sqlQuote(note.updated_at)});`);
    }
    for (const digest of data.dailyDigests) {
      lines.push(`INSERT OR REPLACE INTO bumbee_daily_digests VALUES (${sqlQuote(digest.id)}, ${sqlQuote(digest.date)}, ${sqlQuote(digest.title)}, ${sqlQuote(digest.source_count)}, ${sqlQuote(digest.idea_count)}, ${sqlQuote(JSON.stringify(digest.sources || []))}, ${sqlQuote(JSON.stringify(digest.recommendations || []))}, ${sqlQuote(digest.status)}, ${sqlQuote(digest.created_at)});`);
    }
    for (const review of data.dailyMemoryReviews) {
      lines.push(`INSERT OR REPLACE INTO bumbee_daily_memory_reviews VALUES (${sqlQuote(review.id)}, ${sqlQuote(review.date)}, ${sqlQuote(review.title)}, ${sqlQuote(review.source_count)}, ${sqlQuote(review.candidate_count)}, ${sqlQuote(review.summary)}, ${sqlQuote(JSON.stringify(review.suggested_questions || []))}, ${sqlQuote(JSON.stringify(review.created_candidate_ids || []))}, ${sqlQuote(review.status)}, ${sqlQuote(review.created_at)});`);
    }
    for (const candidate of data.wikiCandidates) {
      lines.push(`INSERT OR REPLACE INTO bumbee_wiki_candidates VALUES (${sqlQuote(candidate.id)}, ${sqlQuote(candidate.review_id)}, ${sqlQuote(candidate.title)}, ${sqlQuote(candidate.category)}, ${sqlQuote(candidate.summary)}, ${sqlQuote(candidate.source)}, ${sqlQuote(candidate.source_title)}, ${sqlQuote(JSON.stringify(candidate.tags || []))}, ${sqlQuote(candidate.proposed_wiki_path)}, ${sqlQuote(candidate.confidence)}, ${sqlQuote(candidate.reason)}, ${sqlQuote(candidate.owner_question)}, ${sqlQuote(candidate.status)}, ${sqlQuote(candidate.approved_at)}, ${sqlQuote(candidate.wiki_file_path)}, ${sqlQuote(candidate.created_at)});`);
    }
    for (const draft of data.jiraDrafts) {
      lines.push(`INSERT OR REPLACE INTO bumbee_jira_drafts VALUES (${sqlQuote(draft.id)}, ${sqlQuote(draft.title)}, ${sqlQuote(draft.issue_type)}, ${sqlQuote(draft.project_url)}, ${sqlQuote(draft.source)}, ${sqlQuote(draft.priority)}, ${sqlQuote(draft.assignee)}, ${sqlQuote(draft.tester)}, ${sqlQuote(draft.deadline_date)}, ${sqlQuote(draft.status)}, ${sqlQuote(JSON.stringify(draft.tags || []))}, ${sqlQuote(draft.description)}, ${sqlQuote(draft.created_at)});`);
    }
    for (const item of data.skillResearchItems) {
      lines.push(`INSERT OR REPLACE INTO bumbee_skill_research_items VALUES (${sqlQuote(item.id)}, ${sqlQuote(item.title)}, ${sqlQuote(item.goal)}, ${sqlQuote(item.source)}, ${sqlQuote(item.status)}, ${sqlQuote(item.priority)}, ${sqlQuote(JSON.stringify(item.expected_output || []))}, ${sqlQuote(JSON.stringify(item.tags || []))}, ${sqlQuote(item.created_at)});`);
    }
    for (const draft of data.gatewayApiDrafts) {
      lines.push(`INSERT OR REPLACE INTO bumbee_gateway_api_drafts VALUES (${sqlQuote(draft.id)}, ${sqlQuote(draft.name)}, ${sqlQuote(draft.method)}, ${sqlQuote(draft.path)}, ${sqlQuote(draft.purpose)}, ${draft.auth_required ? 1 : 0}, ${sqlQuote(draft.status)}, ${sqlQuote(JSON.stringify(draft.request_schema || {}))}, ${sqlQuote(JSON.stringify(draft.response_schema || {}))}, ${sqlQuote(JSON.stringify(draft.risks || []))}, ${sqlQuote(draft.created_at)});`);
    }
    for (const plan of data.knowledgeSyncPlans) {
      lines.push(`INSERT OR REPLACE INTO bumbee_knowledge_sync_plans VALUES (${sqlQuote(plan.id)}, ${sqlQuote(plan.title)}, ${sqlQuote(plan.goal)}, ${sqlQuote(JSON.stringify(plan.sources || []))}, ${sqlQuote(JSON.stringify(plan.targets || []))}, ${sqlQuote(plan.cadence)}, ${sqlQuote(plan.status)}, ${sqlQuote(plan.created_at)});`);
    }
    for (const item of data.workspaceConnections) {
      lines.push(`INSERT OR REPLACE INTO bumbee_workspace_connections VALUES (${sqlQuote(item.id)}, ${sqlQuote(item.name)}, ${sqlQuote(item.type)}, ${sqlQuote(item.location)}, ${sqlQuote(item.normalized_path)}, ${sqlQuote(item.scan_mode)}, ${sqlQuote(item.status)}, ${sqlQuote(item.owner)}, ${sqlQuote(item.cadence)}, ${sqlQuote(JSON.stringify(item.tags || []))}, ${sqlQuote(item.notes)}, ${sqlQuote(item.created_at)}, ${sqlQuote(item.updated_at)});`);
    }
    for (const member of data.teamMembers) {
      lines.push(`INSERT OR REPLACE INTO bumbee_team_members VALUES (${sqlQuote(member.id)}, ${sqlQuote(member.name)}, ${sqlQuote(member.role)}, ${sqlQuote(member.member_type)}, ${sqlQuote(member.email)}, ${sqlQuote(member.owner_area)}, ${sqlQuote(JSON.stringify(member.work_sources || []))}, ${sqlQuote(member.status)}, ${member.daily_report_expected === false ? 0 : 1}, ${sqlQuote(member.created_at)}, ${sqlQuote(member.updated_at)});`);
    }
    for (const dashboard of data.opsDashboards) {
      lines.push(`INSERT OR REPLACE INTO bumbee_ops_dashboards VALUES (${sqlQuote(dashboard.id)}, ${sqlQuote(dashboard.date)}, ${sqlQuote(dashboard.title)}, ${sqlQuote(JSON.stringify(dashboard.metrics || {}))}, ${sqlQuote(JSON.stringify(dashboard.sections || []))}, ${sqlQuote(dashboard.status)}, ${sqlQuote(dashboard.created_at)});`);
    }
    for (const session of data.commandSessions) {
      lines.push(`INSERT OR REPLACE INTO bumbee_command_sessions VALUES (${sqlQuote(session.id)}, ${sqlQuote(session.title)}, ${sqlQuote(session.purpose)}, ${sqlQuote(session.status)}, ${sqlQuote(JSON.stringify(session.workspace_connection_ids || []))}, ${sqlQuote(JSON.stringify(session.team_member_ids || []))}, ${sqlQuote(session.created_at)}, ${sqlQuote(session.updated_at)});`);
    }
    for (const message of data.commandMessages) {
      lines.push(`INSERT OR REPLACE INTO bumbee_command_messages VALUES (${sqlQuote(message.id)}, ${sqlQuote(message.session_id)}, ${sqlQuote(message.role)}, ${sqlQuote(message.message_type)}, ${sqlQuote(message.message)}, ${sqlQuote(JSON.stringify(message.analysis || {}))}, ${sqlQuote(message.created_at)});`);
    }
    for (const message of data.companionMessages) {
      lines.push(`INSERT OR REPLACE INTO bumbee_companion_messages VALUES (${sqlQuote(message.id)}, ${sqlQuote(message.role)}, ${sqlQuote(message.message)}, ${sqlQuote(message.source)}, ${sqlQuote(message.created_at)});`);
    }
    for (const clip of data.clips) {
      lines.push(`INSERT OR REPLACE INTO bumbee_clips VALUES (${sqlQuote(clip.id)}, ${sqlQuote(clip.title)}, ${sqlQuote(clip.source_type)}, ${sqlQuote(clip.source_url)}, ${sqlQuote(clip.local_path)}, ${sqlQuote(clip.speaker)}, ${sqlQuote(clip.topic)}, ${sqlQuote(clip.transcript)}, ${sqlQuote(clip.license_note)}, ${sqlQuote(clip.created_at)}, ${sqlQuote(clip.updated_at)});`);
    }
    for (const vocab of data.vocabulary) {
      lines.push(`INSERT OR REPLACE INTO bumbee_vocabulary VALUES (${sqlQuote(vocab.id)}, ${sqlQuote(vocab.clip_id)}, ${sqlQuote(vocab.word_or_phrase)}, ${sqlQuote(vocab.meaning_vi)}, ${sqlQuote(vocab.meaning_en)}, ${sqlQuote(vocab.example_sentence)}, ${sqlQuote(vocab.timestamp_seconds)}, ${sqlQuote(vocab.category)}, ${sqlQuote(vocab.review_status)}, ${sqlQuote(vocab.created_at)});`);
    }
    for (const profile of data.userProfiles) {
      lines.push(`INSERT OR REPLACE INTO bumbee_user_profiles VALUES (${sqlQuote(profile.id)}, ${sqlQuote(profile.display_name)}, ${sqlQuote(profile.role)}, ${sqlQuote(profile.workspace)}, ${sqlQuote(JSON.stringify(profile.interests || []))}, ${sqlQuote(JSON.stringify(profile.skills || []))}, ${sqlQuote(JSON.stringify(profile.data_sources || []))}, ${sqlQuote(profile.permission_level)}, ${sqlQuote(profile.created_at)}, ${sqlQuote(profile.updated_at)});`);
    }
    for (const profile of data.publisherProfiles) {
      lines.push(`INSERT OR REPLACE INTO bumbee_publisher_profiles VALUES (${sqlQuote(profile.id)}, ${sqlQuote(profile.name)}, ${sqlQuote(JSON.stringify(profile.platforms || []))}, ${sqlQuote(profile.tone)}, ${sqlQuote(profile.audience)}, ${sqlQuote(profile.review_policy)}, ${profile.auto_post_enabled ? 1 : 0}, ${sqlQuote(profile.created_at)}, ${sqlQuote(profile.updated_at)});`);
    }
    for (const pkg of data.servicePackages) {
      lines.push(`INSERT OR REPLACE INTO bumbee_service_packages VALUES (${sqlQuote(pkg.id)}, ${sqlQuote(pkg.name)}, ${sqlQuote(pkg.segment)}, ${sqlQuote(pkg.status)}, ${sqlQuote(JSON.stringify(pkg.features || []))}, ${sqlQuote(pkg.pricing_note)});`);
    }
    for (const integration of data.integrations) {
      lines.push(`INSERT OR REPLACE INTO bumbee_integrations VALUES (${sqlQuote(integration.id)}, ${sqlQuote(integration.name)}, ${sqlQuote(integration.type)}, ${sqlQuote(integration.status)}, ${sqlQuote(integration.mode)});`);
    }
    for (const action of data.actionQueue) {
      lines.push(`INSERT OR REPLACE INTO bumbee_action_queue VALUES (${sqlQuote(action.id)}, ${sqlQuote(action.title)}, ${sqlQuote(action.action_type)}, ${sqlQuote(action.target_type)}, ${sqlQuote(action.target_id)}, ${sqlQuote(action.priority)}, ${sqlQuote(action.status)}, ${sqlQuote(action.note)}, ${sqlQuote(action.created_at)});`);
    }
    for (const intent of data.paymentIntents) {
      lines.push(`INSERT OR REPLACE INTO bumbee_payment_intents VALUES (${sqlQuote(intent.id)}, ${sqlQuote(intent.provider)}, ${sqlQuote(intent.environment)}, ${sqlQuote(intent.payment_code)}, ${sqlQuote(intent.amount)}, ${sqlQuote(intent.currency)}, ${sqlQuote(intent.description)}, ${sqlQuote(intent.bank)}, ${sqlQuote(intent.account)}, ${sqlQuote(intent.qr_url)}, ${sqlQuote(intent.status)}, ${sqlQuote(intent.created_at)}, ${sqlQuote(intent.updated_at)});`);
    }
    for (const notification of data.paymentNotifications) {
      lines.push(`INSERT OR REPLACE INTO bumbee_payment_notifications VALUES (${sqlQuote(notification.id)}, ${sqlQuote(notification.provider)}, ${notification.duplicate ? 1 : 0}, ${sqlQuote(notification.notification_type)}, ${sqlQuote(notification.order_invoice_number)}, ${sqlQuote(notification.transaction_id)}, ${sqlQuote(notification.transaction_status)}, ${sqlQuote(notification.amount)}, ${sqlQuote(notification.received_at)}, ${sqlQuote(JSON.stringify(notification.raw_payload || {}))});`);
    }
    lines.push("COMMIT;");
    return { ok: true, filename: "bumbee-os-export.sql", sql: `${lines.join("\n")}\n` };
  }

  function updateSettings(payload) {
    const data = read();
    const next = { ...data.settings };
    if (typeof payload?.workMode === "string") next.workMode = normalizeString(payload.workMode, 80);
    if (typeof payload?.sepayEnvironment === "string") next.sepayEnvironment = payload.sepayEnvironment === "production" ? "production" : "sandbox";
    if (typeof payload?.sepayBankCode === "string") next.sepayBankCode = normalizeString(payload.sepayBankCode, 80);
    if (typeof payload?.sepayAccountNumber === "string") next.sepayAccountNumber = normalizeString(payload.sepayAccountNumber, 80);
    if (typeof payload?.sepayAccountName === "string") next.sepayAccountName = normalizeString(payload.sepayAccountName, 160);
    if (typeof payload?.sepayQrTemplate === "string") next.sepayQrTemplate = normalizeString(payload.sepayQrTemplate, 20) || "compact";
    if (typeof payload?.companionMode === "string") next.companionMode = normalizeString(payload.companionMode, 80);
    if (typeof payload?.jiraProjectUrl === "string") next.jiraProjectUrl = normalizeString(payload.jiraProjectUrl, 800);
    if (typeof payload?.notionDailyJournalUrl === "string") next.notionDailyJournalUrl = normalizeString(payload.notionDailyJournalUrl, 800);
    if (typeof payload?.localWikiInboxFolder === "string") next.localWikiInboxFolder = normalizeString(payload.localWikiInboxFolder, 800);
    if (Array.isArray(payload?.sourceFolders)) next.sourceFolders = normalizeArray(payload.sourceFolders, 12, 800);
    for (const key of ["autoPublish", "realMoneyWallet", "cameraEnabled", "microphoneEnabled"]) {
      if (typeof payload?.[key] === "boolean") next[key] = payload[key];
    }
    if (typeof payload?.dailyIdeaScanEnabled === "boolean") next.dailyIdeaScanEnabled = payload.dailyIdeaScanEnabled;
    if (typeof payload?.dailyWikiReviewEnabled === "boolean") next.dailyWikiReviewEnabled = payload.dailyWikiReviewEnabled;
    if (typeof payload?.capabilityLearningEnabled === "boolean") next.capabilityLearningEnabled = payload.capabilityLearningEnabled;
    // Guardrails: these remain false until explicit future implementation.
    next.autoPublish = false;
    next.realMoneyWallet = false;
    data.settings = next;
    write(data);
    return { ok: true, settings: next };
  }

  function seedDemo() {
    const data = read();
    if (data.workItems.length === 0) {
      data.workItems.push({
        id: makeId("work"),
        title: "Bumbee OS Owner Guide preview",
        type: "service",
        status: "draft",
        channelDrafts: ["BitDanceGroup website", "Bumbee Wiki", "Telegram draft"],
        tags: ["owner-guide", "publisher", "demo"],
        note: "Draft only. Owner approval required before publishing.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (data.clips.length === 0) {
      data.clips.push({
        id: makeId("clip"),
        title: "Steve Jobs style leadership speech",
        source_type: "manual",
        source_url: "",
        local_path: "",
        speaker: "Example speaker",
        topic: "leadership and product thinking",
        transcript: "Stay hungry. Stay focused. Explain your product clearly and build with taste.",
        license_note: "Demo transcript for personal study only.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (data.userProfiles.length === 0) {
      data.userProfiles.push({
        id: makeId("profile"),
        display_name: "Owner",
        role: "owner",
        workspace: "Bumbee",
        interests: ["AI business", "English learning", "publisher", "IoT"],
        skills: ["product", "sales", "automation"],
        data_sources: ["local folders", "Obsidian", "Notion MCP", "Codex", "Claude"],
        permission_level: "local_only",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (data.publisherProfiles.length === 0) {
      data.publisherProfiles.push({
        id: makeId("publisher"),
        name: "BitDanceGroup Publisher",
        platforms: ["BitDanceGroup", "Bumbee Wiki", "Telegram draft"],
        tone: "simple, useful, product-focused",
        audience: "owners, customers, builders",
        review_policy: "owner_review_required",
        auto_post_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (data.actionQueue.length === 0) {
      data.actionQueue.push({
        id: makeId("action"),
        title: "Review Bumbee OS Owner Guide before public posting",
        action_type: "review",
        target_type: "work_item",
        target_id: "",
        priority: "high",
        status: "waiting_owner_review",
        note: "Sleep mode can prepare this, but owner must approve before publish.",
        created_at: new Date().toISOString(),
      });
    }
    if (data.ideaNotes.length === 0) {
      data.ideaNotes.push({
        id: makeId("idea"),
        title: "Bumbee daily companion MVP",
        body: "Scan local wiki and idea folders each day, summarize notes, draft Jira tasks, and wait for owner approval.",
        source: "seed_demo",
        source_url: "",
        tags: ["idea", "daily_companion", "jira"],
        priority: "normal",
        status: "captured",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (data.wikiCandidates.length === 0) {
      const review = {
        id: makeId("memoryreview"),
        date: new Date().toISOString().slice(0, 10),
        title: "Bumbee wiki memory review demo",
        source_count: 1,
        candidate_count: 1,
        summary: "Demo candidate showing how daily notes become searchable wiki inbox pages after owner approval.",
        suggested_questions: [
          "Đưa skill/job/lead note này vào wiki không?",
          "Có cần bổ sung link web/repo/API trước khi lưu không?",
        ],
        status: "waiting_owner_approval",
        created_candidate_ids: [],
        created_at: new Date().toISOString(),
      };
      const candidate = {
        id: makeId("wikicandidate"),
        review_id: review.id,
        title: "AI tìm job remote và cơ hội dự án",
        category: "sales-growth",
        summary: "Skill tìm job remote, lead khách hàng, cơ hội dự án, viết pitch/quảng cáo và tạo CRM/Jira draft chờ chủ nhân duyệt.",
        source: "seed_demo",
        source_title: "Remote job opportunity scout",
        source_mtime: "",
        tags: ["sales-growth", "remote-job", "lead-generation", "skills"],
        proposed_wiki_path: data.settings.localWikiInboxFolder,
        confidence: "medium",
        reason: "This is reusable business knowledge that owner may forget and should find later from Bumbee Wiki.",
        owner_question: "Đưa note AI tìm job remote vào Bumbee Wiki local inbox không?",
        status: "waiting_owner_approval",
        created_at: new Date().toISOString(),
        approved_at: "",
        wiki_file_path: "",
      };
      review.created_candidate_ids = [candidate.id];
      data.dailyMemoryReviews.push(review);
      data.wikiCandidates.push(candidate);
    }
    if (data.skillResearchItems.length === 0) {
      const now = new Date().toISOString();
      const goal = "Research new skills and API drafts, sync useful knowledge into final skills, and prepare owner-reviewed gateway upgrades.";
      data.skillResearchItems.push({
        id: makeId("skillresearch"),
        title: "skill discovery and final-skill proposal",
        goal,
        source: "seed_demo",
        status: "research_draft",
        priority: "normal",
        expected_output: ["SKILL.md update proposal", "Usage examples", "Gateway enablement checklist"],
        tags: ["capability_learning", "gateway", "skills"],
        created_at: now,
      });
      data.gatewayApiDrafts.push({
        id: makeId("gatewayapi"),
        name: "capability proposal intake",
        method: "POST",
        path: "/api/bumbee/capabilities/capability-proposal-intake",
        purpose: goal,
        auth_required: true,
        status: "draft_no_live_deploy",
        request_schema: { title: "string", goal: "string", approval: "owner_required" },
        response_schema: { ok: "boolean", draft_id: "string" },
        risks: ["Owner approval required before implementation."],
        created_at: now,
      });
      data.knowledgeSyncPlans.push({
        id: makeId("syncplan"),
        title: "Knowledge sync plan: Bumbee self-improving skills",
        goal,
        sources: data.settings.sourceFolders,
        targets: ["Bumbee OS local store", "final-skills-mcps", "Bumbee Wiki", "Gateway capability registry draft"],
        cadence: "daily_review_or_manual_scan",
        status: "draft_waiting_owner_review",
        created_at: now,
      });
      data.actionQueue.push({
        id: makeId("action"),
        title: "Review capability upgrade: Bumbee self-improving skills",
        action_type: "capability_upgrade_review",
        target_type: "capability_upgrade",
        target_id: "",
        priority: "normal",
        status: "waiting_owner_review",
        note: "Seeded skill research, gateway API draft, and knowledge sync plan.",
        created_at: now,
      });
    }
    if (data.workspaceConnections.length === 0) {
      const now = new Date().toISOString();
      data.workspaceConnections.push(
        {
          id: makeId("workspace"),
          name: "Bumbee Brain Ops Wiki",
          type: "wiki_url",
          location: "https://wiki.bumbee.asia/brain-ops",
          normalized_path: "",
          scan_mode: "connector_draft",
          status: "api_or_mcp_connector_needed",
          owner: "owner",
          cadence: "daily",
          tags: ["wiki", "brain_ops"],
          notes: "Remote wiki source. Needs API/wiki connector before live scan.",
          created_at: now,
          updated_at: now,
        },
        {
          id: makeId("workspace"),
          name: "Daily task folders",
          type: "local_folder",
          location: "/home/bumbee_workspace/awesome-bumbee-skills/bumbee-studio-idea/nhutpham-task",
          normalized_path: "/home/bumbee_workspace/awesome-bumbee-skills/bumbee-studio-idea/nhutpham-task",
          scan_mode: "scan_local_files",
          status: fs.existsSync("/home/bumbee_workspace/awesome-bumbee-skills/bumbee-studio-idea/nhutpham-task") ? "ready_to_scan" : "path_missing",
          owner: "owner",
          cadence: "daily",
          tags: ["local_folder", "task"],
          notes: "Local folder scan source for owner notes, task docs, and daily work drafts.",
          created_at: now,
          updated_at: now,
        },
        {
          id: makeId("workspace"),
          name: "BitDanceGroup Odoo CRM",
          type: "odoo_crm",
          location: "https://bitdancegroup.com",
          normalized_path: "",
          scan_mode: "connector_draft",
          status: "api_or_mcp_connector_needed",
          owner: "owner",
          cadence: "daily",
          tags: ["odoo", "crm", "revenue"],
          notes: "Customer opportunities, revenue, products, and delivery status source.",
          created_at: now,
          updated_at: now,
        },
      );
    }
    if (data.teamMembers.length === 0) {
      const now = new Date().toISOString();
      data.teamMembers.push({
        id: makeId("member"),
        name: "Owner",
        role: "CEO / operator",
        member_type: "human",
        email: "nhutpham@bitdancegroup.com",
        owner_area: "Bumbee operations",
        work_sources: ["Jira", "Notion", "Email report", "Odoo CRM", "Local folders"],
        status: "active",
        daily_report_expected: true,
        created_at: now,
        updated_at: now,
      });
    }
    if (data.commandSessions.length === 0) {
      const now = new Date().toISOString();
      data.commandSessions.push({
        id: makeId("cmdsession"),
        title: "Owner daily command session",
        purpose: "Chat here to save questions, analysis, and commands for Bumbee to draft workspace/Jira/publisher/report actions.",
        status: "active",
        workspace_connection_ids: [],
        team_member_ids: [],
        created_at: now,
        updated_at: now,
      });
    }
    write(data);
    return { ok: true, ...list() };
  }

  return {
    filePath,
    status,
    list,
    addWorkItem,
    addIdeaNote,
    buildDailyDigest,
    buildDailyMemoryReview,
    approveWikiCandidate,
    companionChat,
    proposeCapabilityUpgrade,
    addWorkspaceConnection,
    addTeamMember,
    buildOpsDashboard,
    createCommandSession,
    addCommandMessage,
    addClip,
    addVocabulary,
    addUserProfile,
    addPublisherProfile,
    queueAction,
    createSepayPaymentIntent,
    recordSepayNotification,
    exportSqlDump,
    updateSettings,
    seedDemo,
  };
};
