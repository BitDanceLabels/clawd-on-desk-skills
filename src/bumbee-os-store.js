"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_DATA = {
  version: 3,
  workItems: [],
  ideaNotes: [],
  dailyDigests: [],
  jiraDrafts: [],
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
    jiraProjectUrl: "https://jira.bumbee.asia/bumbee-on-desk/projects/2bc56e64-4b21-4d1d-9126-11daa3a1d543/issues/",
    notionDailyJournalUrl: "https://www.notion.so/BUMBEE-STUDIO-IDEA-HO-N-THI-N-IDEA-356f8cb9fada80eabfe6cb6edca893cc",
    sourceFolders: [
      "~/Bumbee/bumbee-wiki-studio",
      "~/Bumbee/bumbee-wiki",
      "/home/bumbee_workspace/awesome-bumbee-skills/bumbee-studio-idea/nhutpham-task",
    ],
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
        jiraDrafts: Array.isArray(data.jiraDrafts) ? data.jiraDrafts : [],
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
        jiraDrafts: data.jiraDrafts.length,
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
      jiraDrafts: data.jiraDrafts.slice(0, 100),
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
      "CREATE TABLE IF NOT EXISTS bumbee_jira_drafts (id TEXT PRIMARY KEY, title TEXT, issue_type TEXT, project_url TEXT, source TEXT, priority TEXT, assignee TEXT, tester TEXT, deadline_date TEXT, status TEXT, tags_json TEXT, description TEXT, created_at TEXT);",
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
    for (const draft of data.jiraDrafts) {
      lines.push(`INSERT OR REPLACE INTO bumbee_jira_drafts VALUES (${sqlQuote(draft.id)}, ${sqlQuote(draft.title)}, ${sqlQuote(draft.issue_type)}, ${sqlQuote(draft.project_url)}, ${sqlQuote(draft.source)}, ${sqlQuote(draft.priority)}, ${sqlQuote(draft.assignee)}, ${sqlQuote(draft.tester)}, ${sqlQuote(draft.deadline_date)}, ${sqlQuote(draft.status)}, ${sqlQuote(JSON.stringify(draft.tags || []))}, ${sqlQuote(draft.description)}, ${sqlQuote(draft.created_at)});`);
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
    if (Array.isArray(payload?.sourceFolders)) next.sourceFolders = normalizeArray(payload.sourceFolders, 12, 800);
    for (const key of ["autoPublish", "realMoneyWallet", "cameraEnabled", "microphoneEnabled"]) {
      if (typeof payload?.[key] === "boolean") next[key] = payload[key];
    }
    if (typeof payload?.dailyIdeaScanEnabled === "boolean") next.dailyIdeaScanEnabled = payload.dailyIdeaScanEnabled;
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
    companionChat,
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
