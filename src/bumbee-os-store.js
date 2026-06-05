"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_DATA = {
  version: 2,
  workItems: [],
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
    for (const key of ["autoPublish", "realMoneyWallet", "cameraEnabled", "microphoneEnabled"]) {
      if (typeof payload?.[key] === "boolean") next[key] = payload[key];
    }
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
    write(data);
    return { ok: true, ...list() };
  }

  return {
    filePath,
    status,
    list,
    addWorkItem,
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
