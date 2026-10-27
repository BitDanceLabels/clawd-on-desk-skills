"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const createStore = require("../src/bumbee-os-store");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bumbee-os-store-"));
}

test("Bumbee OS store saves work, clip, and vocabulary locally", () => {
  const dir = tmpDir();
  const store = createStore(dir);

  const work = store.addWorkItem({
    title: "Owner guide launch",
    type: "article",
    note: "Draft only",
    tags: ["owner-guide"],
  });
  assert.equal(work.ok, true);
  assert.equal(work.item.status, "draft");

  const clip = store.addClip({
    title: "Daily leadership clip",
    source_type: "manual",
    topic: "leadership",
    transcript: "Stay focused and explain clearly.",
  });
  assert.equal(clip.ok, true);
  assert.equal(clip.clip.topic, "leadership");

  const vocab = store.addVocabulary({
    word_or_phrase: "resilient",
    meaning_vi: "ben bi",
    category: "daily_clip",
  });
  assert.equal(vocab.ok, true);
  assert.equal(vocab.vocabulary.review_status, "new");

  const data = store.list();
  assert.equal(data.counts.workItems, 1);
  assert.equal(data.counts.clips, 1);
  assert.equal(data.counts.vocabulary, 1);
});

test("Bumbee OS settings keep live-publish and real-money wallet disabled", () => {
  const store = createStore(tmpDir());
  const result = store.updateSettings({
    workMode: "sleep_mode",
    autoPublish: true,
    realMoneyWallet: true,
    cameraEnabled: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.settings.workMode, "sleep_mode");
  assert.equal(result.settings.autoPublish, false);
  assert.equal(result.settings.realMoneyWallet, false);
  assert.equal(result.settings.cameraEnabled, true);
});

test("Bumbee OS store captures profiles, publisher setup, review queue, and SQL export", () => {
  const store = createStore(tmpDir());

  const profile = store.addUserProfile({
    display_name: "Customer A",
    role: "customer_viewer",
    workspace: "Customer workspace",
    data_sources: ["folder", "notion mcp"],
  });
  assert.equal(profile.ok, true);
  assert.equal(profile.profile.permission_level, "local_only");

  const publisher = store.addPublisherProfile({
    name: "BitDanceGroup Publisher",
    platforms: ["BitDanceGroup", "Telegram"],
    audience: "owners",
  });
  assert.equal(publisher.ok, true);
  assert.equal(publisher.profile.auto_post_enabled, false);
  assert.equal(publisher.profile.review_policy, "owner_review_required");

  const action = store.queueAction({
    title: "Review before publishing",
    priority: "urgent",
    note: "No public posting before approval.",
  });
  assert.equal(action.ok, true);
  assert.equal(action.action.status, "waiting_owner_review");

  const data = store.list();
  assert.equal(data.counts.userProfiles, 1);
  assert.equal(data.counts.publisherProfiles, 1);
  assert.equal(data.counts.actionQueue, 1);
  assert.ok(data.counts.servicePackages >= 4);
  assert.ok(data.counts.integrations >= 8);

  const dump = store.exportSqlDump();
  assert.equal(dump.ok, true);
  assert.match(dump.sql, /CREATE TABLE IF NOT EXISTS bumbee_user_profiles/);
  assert.match(dump.sql, /INSERT OR REPLACE INTO bumbee_publisher_profiles/);
});

test("Bumbee OS store creates SePay QR intents and records idempotent notifications", () => {
  const store = createStore(tmpDir());
  const intent = store.createSepayPaymentIntent({
    environment: "sandbox",
    bank: "VietinBank",
    account: "0123456789",
    amount: 100000,
    description: "INV-001",
  });
  assert.equal(intent.ok, true);
  assert.equal(intent.intent.provider, "sepay");
  assert.match(intent.intent.qr_url, /https:\/\/qr\.sepay\.vn\/img/);
  assert.match(intent.intent.qr_url, /SEVQR/);

  const notification = store.recordSepayNotification({
    notification_type: "ORDER_PAID",
    order: {
      order_invoice_number: "INV-001",
      order_amount: "100000.00",
    },
    transaction: {
      transaction_id: "TX-001",
      transaction_status: "APPROVED",
      transaction_amount: "100000",
    },
  });
  assert.equal(notification.ok, true);
  assert.equal(notification.notification.duplicate, false);
  assert.equal(store.list().paymentIntents[0].status, "paid");

  const duplicate = store.recordSepayNotification({
    notification_type: "ORDER_PAID",
    order: { order_invoice_number: "INV-001" },
    transaction: { transaction_id: "TX-001", transaction_status: "APPROVED" },
  });
  assert.equal(duplicate.notification.duplicate, true);
});

test("Bumbee OS companion captures ideas and prepares daily Jira drafts", () => {
  const dir = tmpDir();
  const sourceRoot = path.join(dir, "daily-notes");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, "owner-idea.md"),
    [
      "# Wiki trợ lý AI mỗi ngày",
      "",
      "Bumbee cần scan wiki, phân tích idea, tạo Jira draft và chờ chủ nhân duyệt. #IDEA #TICKET",
      "Deadline gấp cho MVP làm việc mỗi ngày.",
    ].join("\n"),
    "utf8",
  );

  const store = createStore(dir);
  const chat = store.companionChat({
    message: "Tui cần Bumbee chủ động nhắc việc và gom nháp thành task Jira.",
  });
  assert.equal(chat.ok, true);
  assert.equal(store.list().counts.ideaNotes, 1);
  assert.equal(store.list().counts.workItems, 1);
  assert.equal(store.list().counts.actionQueue, 1);

  const digest = store.buildDailyDigest({ sourceFolders: [sourceRoot], limit: 5, maxAgeHours: 24 });
  assert.equal(digest.ok, true);
  assert.equal(digest.digest.status, "waiting_owner_review");
  assert.equal(digest.jiraDrafts.length >= 1, true);
  assert.equal(digest.jiraDrafts[0].status, "draft_waiting_owner_review");
  assert.match(digest.jiraDrafts[0].description, /No live publish/);

  const data = store.list();
  assert.equal(data.counts.dailyDigests, 1);
  assert.equal(data.counts.jiraDrafts >= 1, true);
  assert.equal(data.counts.companionMessages, 2);

  const dump = store.exportSqlDump();
  assert.match(dump.sql, /CREATE TABLE IF NOT EXISTS bumbee_daily_digests/);
  assert.match(dump.sql, /INSERT OR REPLACE INTO bumbee_jira_drafts/);
});

test("Bumbee OS daily memory review prepares and approves wiki candidates", () => {
  const dir = tmpDir();
  const sourceRoot = path.join(dir, "daily-journal");
  const wikiInbox = path.join(dir, "wiki-inbox");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, "remote-job-scout.md"),
    [
      "# AI tìm job remote và cơ hội dự án",
      "",
      "Cần lưu list web tìm job toàn cầu, repo nghiên cứu, link API, và cách viết quảng cáo để kinh doanh. #remote-job #lead",
      "Bumbee phải nhớ để sau này chủ nhân tìm lại trong wiki.",
    ].join("\n"),
    "utf8",
  );

  const store = createStore(dir);
  const command = store.addCommandMessage({
    message: "Nhớ task AI tìm job remote, chạy quảng cáo, CRM lead và tạo Jira draft để tui không quên.",
  });
  assert.equal(command.ok, true);

  const review = store.buildDailyMemoryReview({
    sourceFolders: [sourceRoot],
    localWikiInboxFolder: wikiInbox,
    limit: 8,
    maxAgeHours: 24,
  });
  assert.equal(review.ok, true);
  assert.equal(review.review.status, "waiting_owner_approval");
  assert.equal(review.candidates.length >= 1, true);
  assert.equal(review.candidates.some((candidate) => candidate.category === "sales-growth"), true);

  const candidate = review.candidates.find((item) => item.category === "sales-growth") || review.candidates[0];
  const approved = store.approveWikiCandidate({
    candidate_id: candidate.id,
    target_folder: wikiInbox,
  });
  assert.equal(approved.ok, true);
  assert.equal(fs.existsSync(approved.filePath), true);
  assert.match(fs.readFileSync(approved.filePath, "utf8"), /AI tìm job remote/);
  assert.equal(store.list().wikiCandidates.find((item) => item.id === candidate.id).status, "approved_local_inbox");

  const dump = store.exportSqlDump();
  assert.match(dump.sql, /CREATE TABLE IF NOT EXISTS bumbee_daily_memory_reviews/);
  assert.match(dump.sql, /INSERT OR REPLACE INTO bumbee_wiki_candidates/);
});

test("Bumbee OS prepares skill research and gateway API capability upgrades", () => {
  const store = createStore(tmpDir());
  const result = store.proposeCapabilityUpgrade({
    title: "Self-improving gateway skills",
    goal: "Research new skills, add gateway API drafts, and sync knowledge into final skills after owner review.",
    skills: ["notion daily journal skill", "gateway skill registry scanner"],
    apis: ["skill research intake", "gateway api sync status"],
    knowledge_sources: ["final-skills-mcps", "Bumbee Wiki"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.skillResearchItems.length, 2);
  assert.equal(result.gatewayApiDrafts.length, 2);
  assert.equal(result.knowledgeSyncPlan.status, "draft_waiting_owner_review");
  assert.equal(result.action.status, "waiting_owner_review");
  assert.equal(result.gatewayApiDrafts[0].auth_required, true);
  assert.match(result.gatewayApiDrafts[0].path, /\/api\/bumbee\/capabilities\//);

  const data = store.list();
  assert.equal(data.counts.skillResearchItems, 2);
  assert.equal(data.counts.gatewayApiDrafts, 2);
  assert.equal(data.counts.knowledgeSyncPlans, 1);
  assert.equal(data.counts.workItems, 1);

  const dump = store.exportSqlDump();
  assert.match(dump.sql, /CREATE TABLE IF NOT EXISTS bumbee_skill_research_items/);
  assert.match(dump.sql, /INSERT OR REPLACE INTO bumbee_gateway_api_drafts/);
});

test("Bumbee OS stores workspace connectors, team members, and ops dashboard metrics", () => {
  const dir = tmpDir();
  const localWork = path.join(dir, "daily-work");
  fs.mkdirSync(localWork, { recursive: true });
  const store = createStore(dir);

  const folder = store.addWorkspaceConnection({
    name: "Daily work folder",
    type: "local_folder",
    location: localWork,
    owner: "owner",
  });
  assert.equal(folder.ok, true);
  assert.equal(folder.connection.status, "ready_to_scan");

  const wiki = store.addWorkspaceConnection({
    name: "Brain Ops Wiki",
    type: "wiki_url",
    location: "https://wiki.bumbee.asia/brain-ops",
  });
  assert.equal(wiki.connection.status, "api_or_mcp_connector_needed");

  const member = store.addTeamMember({
    name: "Sales Agent",
    role: "Customer follow-up",
    member_type: "agent",
    work_sources: ["Jira", "Odoo CRM", "Email report"],
  });
  assert.equal(member.ok, true);
  assert.equal(member.member.daily_report_expected, true);

  const dashboard = store.buildOpsDashboard();
  assert.equal(dashboard.ok, true);
  assert.equal(dashboard.dashboard.metrics.workspace_connections, 2);
  assert.equal(dashboard.dashboard.metrics.ready_local_sources, 1);
  assert.equal(dashboard.dashboard.metrics.remote_connector_drafts, 1);
  assert.equal(dashboard.dashboard.metrics.team_members, 1);

  const data = store.list();
  assert.equal(data.counts.workspaceConnections, 2);
  assert.equal(data.counts.teamMembers, 1);
  assert.equal(data.counts.opsDashboards, 1);

  const dump = store.exportSqlDump();
  assert.match(dump.sql, /CREATE TABLE IF NOT EXISTS bumbee_workspace_connections/);
  assert.match(dump.sql, /INSERT OR REPLACE INTO bumbee_ops_dashboards/);
});

test("Bumbee OS command chat remembers questions and drafts executable work", () => {
  const store = createStore(tmpDir());
  const session = store.createCommandSession({
    title: "CEO daily command",
    purpose: "Ask questions, analyze, and command Bumbee work.",
  });
  assert.equal(session.ok, true);

  const result = store.addCommandMessage({
    session_id: session.session.id,
    message: "Tạo Jira task và workspace để team làm sản phẩm đăng trang chủ, social, rồi báo cáo doanh thu Odoo CRM hằng ngày.",
  });
  assert.equal(result.ok, true);
  assert.equal(result.message.message_type, "crm_revenue_report");
  assert.equal(result.reply.role, "bumbee");
  assert.equal(result.workItem.approval_required, true);
  assert.equal(result.jiraDraft.status, "draft_waiting_owner_review");
  assert.equal(result.action.status, "waiting_owner_review");

  const data = store.list();
  assert.equal(data.counts.commandSessions, 1);
  assert.equal(data.counts.commandMessages, 2);
  assert.equal(data.counts.workItems, 1);
  assert.equal(data.counts.jiraDrafts, 1);

  const dump = store.exportSqlDump();
  assert.match(dump.sql, /CREATE TABLE IF NOT EXISTS bumbee_command_sessions/);
  assert.match(dump.sql, /INSERT OR REPLACE INTO bumbee_command_messages/);
});

test("Bumbee OS project review worker scores projects and creates review artifacts", () => {
  const store = createStore(tmpDir());
  const result = store.runProjectReviewWorker({
    title: "Biên tập idea thơ và hoàn thiện Suno music content",
    project_type: "music-content",
    body: [
      "Cần skill biên tập thơ, lyric, mood, story arc, hook viral, CTA và content package.",
      "Kết quả phải lưu wiki, tạo Jira draft, có worker ổn định, database, test, owner approval.",
      "Có đường bán hàng cho gói music content và social campaign.",
    ].join("\n"),
    source: "test",
    tags: ["music", "suno", "content"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.review.project_type, "music-content");
  assert.equal(result.review.scores.overall >= 6, true);
  assert.equal(result.review.worker_suggestions.some((worker) => worker.name === "music-content-editor-worker"), true);
  assert.equal(result.jiraDraft.issue_type, "Review");
  assert.equal(result.wikiCandidate.category, "project-review");
  assert.equal(result.action.action_type, "project_review_score_comment");

  const data = store.list();
  assert.equal(data.counts.projectReviews, 1);
  assert.equal(data.counts.jiraDrafts, 1);
  assert.equal(data.counts.wikiCandidates, 1);
  assert.equal(data.counts.actionQueue, 1);

  const dump = store.exportSqlDump();
  assert.match(dump.sql, /CREATE TABLE IF NOT EXISTS bumbee_project_reviews/);
  assert.match(dump.sql, /INSERT OR REPLACE INTO bumbee_project_reviews/);
});
