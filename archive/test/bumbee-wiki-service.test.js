const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const initBumbeeWikiService = require("../src/bumbee-wiki-service");
const { ensureStudioTemplate, listSyncableFiles } = initBumbeeWikiService;

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bumbee-wiki-test-"));
}

test("Bumbee Wiki service creates folder and README", () => {
  const root = path.join(tempDir(), "Bumbee", "bumbee-wiki");
  const service = initBumbeeWikiService({
    folder: root,
    appId: "bumbee-desktop",
    project: "bumbee-desktop",
    deviceId: "test-device",
    client: {
      registerApp: async () => ({ ok: true }),
      ingestDocument: async () => ({ ok: true }),
      ask: async () => ({ answer: "ok", sources: [], context: "" }),
    },
  });

  service.ensureFolder();
  assert.equal(fs.existsSync(root), true);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /Project: bumbee-desktop/);
});

test("Bumbee Wiki service syncs supported changed files with project and device source", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "idea.md"), "# Idea\nSend mail later", "utf8");
  fs.writeFileSync(path.join(root, "ignore.png"), "nope", "utf8");
  const ingested = [];
  const service = initBumbeeWikiService({
    folder: root,
    appId: "bumbee-desktop",
    project: "pc-project",
    deviceId: "pc-1",
    client: {
      registerApp: async (payload) => ({ ok: true, payload }),
      ingestDocument: async (payload) => {
        ingested.push(payload);
        return { status: "ok" };
      },
      ask: async () => ({ answer: "ok", sources: [], context: "" }),
    },
  });

  const first = await service.syncOnce({ register: true });
  assert.equal(first.ok, true);
  assert.equal(first.synced, 2);
  assert.equal(first.skipped, 0);
  assert.equal(ingested.some(item => item.source === "bumbee-wiki://pc-1/idea.md"), true);
  assert.equal(ingested.every(item => item.project === "pc-project"), true);
  assert.equal(ingested.every(item => item.tags.includes("app:bumbee-desktop")), true);

  const second = await service.syncOnce({ register: false });
  assert.equal(second.synced, 0);
  assert.equal(second.skipped, 2);
});

test("Bumbee Wiki service creates Obsidian-ready studio template", () => {
  const root = path.join(tempDir(), "bumbee-wiki-studio");
  const result = ensureStudioTemplate(root, {
    edition: "pro",
    project: "bumbee-wiki-studio",
    deviceId: "pc-1",
  });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(root, ".obsidian", "core-plugins.json")), true);
  assert.equal(fs.existsSync(path.join(root, "AI_README.md")), true);
  assert.equal(fs.existsSync(path.join(root, "03-projects", "bumbee-wiki-studio", "PROJECT.work.md")), true);
  const config = JSON.parse(fs.readFileSync(path.join(root, "bumbee.config.json"), "utf8"));
  assert.equal(config.edition, "pro");
  assert.equal(config.default_project, "bumbee-wiki-studio");
});

test("Bumbee Wiki service syncs studio files with project derived from project folder", async () => {
  const root = path.join(tempDir(), "studio");
  const ingested = [];
  const service = initBumbeeWikiService({
    folder: tempDir(),
    studioFolder: root,
    appId: "bumbee-desktop",
    project: "pc-project",
    deviceId: "pc-1",
    client: {
      baseUrl: "https://wiki.bumbee.asia/api",
      registerApp: async () => ({ ok: true }),
      ingestDocument: async (payload) => {
        ingested.push(payload);
        return { status: "ok" };
      },
      ask: async () => ({ answer: "ok", sources: [], context: "" }),
    },
  });

  await service.setupStudio({ folder: root, edition: "pro" });
  fs.mkdirSync(path.join(root, "03-projects", "crm-demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "03-projects", "crm-demo", "PROJECT.work.md"), "# CRM\n#CRM", "utf8");
  const result = await service.syncStudio({ folder: root, register: false, force: true });

  assert.equal(result.ok, true);
  assert.equal(ingested.some(item => item.project === "crm-demo"), true);
  assert.equal(ingested.some(item => item.source === "bumbee-studio://pc-1/03-projects/crm-demo/PROJECT.work.md"), true);
  assert.equal(ingested.every(item => item.tags.includes("obsidian")), true);
});

test("Bumbee Wiki service builds project dashboard and action queue from tags", async () => {
  const root = path.join(tempDir(), "studio");
  const service = initBumbeeWikiService({
    folder: tempDir(),
    studioFolder: root,
    appId: "bumbee-desktop",
    project: "pc-project",
    deviceId: "pc-1",
    client: {
      registerApp: async () => ({ ok: true }),
      ingestDocument: async () => ({ ok: true }),
      ask: async () => ({ answer: "ok", sources: [], context: "" }),
    },
  });

  const created = await service.newStudioProject({
    title: "Idea CRM Money",
    goal: "Find customer follow-up workflow",
    tags: ["#IDEA", "#CRM", "#THAM_MUU"],
  });
  assert.equal(created.ok, true);
  assert.equal(created.slug, "idea-crm-money");

  const dashboard = await service.studioDashboard();
  assert.equal(dashboard.ok, true);
  assert.equal(dashboard.projects.some(item => item.slug === "idea-crm-money"), true);
  assert.equal(dashboard.actions.some(item => item.project === "idea-crm-money" && item.type === "analyze_idea"), true);
  assert.equal(dashboard.actions.some(item => item.project === "idea-crm-money" && item.mode === "confirm_required"), true);
  assert.equal(fs.existsSync(path.join(root, "07-actions", "action-queue.json")), true);
  assert.equal(dashboard.connectors.obsidian.enabled, true);
});

test("Bumbee Wiki service runs safe workers and leaves confirm actions waiting", async () => {
  const root = path.join(tempDir(), "studio");
  const service = initBumbeeWikiService({
    folder: tempDir(),
    studioFolder: root,
    appId: "bumbee-desktop",
    project: "pc-project",
    deviceId: "pc-1",
    client: {
      registerApp: async () => ({ ok: true }),
      ingestDocument: async () => ({ ok: true }),
      ask: async () => ({ answer: "ok", sources: [], context: "" }),
    },
  });

  await service.newStudioProject({
    title: "Publisher CRM",
    goal: "Prepare content and customer follow-up",
    tags: ["#IDEA", "#PUBLISHER", "#CRM"],
  });

  const result = await service.runWorkers({ includeConfirmRequired: false });
  assert.equal(result.ok, true);
  assert.equal(result.ran >= 1, true);

  const dashboard = await service.studioDashboard();
  const idea = dashboard.actions.find(action => action.project === "publisher-crm" && action.type === "analyze_idea");
  const crm = dashboard.actions.find(action => action.project === "publisher-crm" && action.type === "crm_follow_up");
  assert.equal(idea.status, "completed");
  assert.match(idea.output, /worker-outputs/);
  assert.equal(crm.status, "waiting_confirmation");
  assert.equal(fs.existsSync(path.join(root, idea.output)), true);
  assert.match(fs.readFileSync(path.join(root, "03-projects", "publisher-crm", "PROJECT.progress.md"), "utf8"), /Worker/);
});

test("Bumbee Wiki service approves and prepares gateway action payload", async () => {
  const root = path.join(tempDir(), "studio");
  const service = initBumbeeWikiService({
    folder: tempDir(),
    studioFolder: root,
    appId: "bumbee-desktop",
    project: "pc-project",
    deviceId: "pc-1",
    client: {
      registerApp: async () => ({ ok: true }),
      ingestDocument: async () => ({ ok: true }),
      ask: async () => ({ answer: "ok", sources: [], context: "" }),
    },
  });

  await service.newStudioProject({
    title: "CRM Send Draft",
    goal: "Draft a customer follow-up",
    tags: ["#CRM"],
  });
  await service.runWorkers({ includeConfirmRequired: false });
  const actionId = "crm-send-draft:crm_follow_up";

  const needsConfirm = await service.runGatewayAction({ actionId });
  assert.equal(needsConfirm.ok, false);
  assert.equal(needsConfirm.needsConfirmation, true);

  const approved = await service.approveAction({ actionId, approvedBy: "tester" });
  assert.equal(approved.ok, true);
  assert.equal(approved.action.status, "approved");

  const executed = await service.runGatewayAction({ actionId, dryRun: true });
  assert.equal(executed.ok, true);
  assert.equal(executed.execution.dry_run, true);
  assert.equal(executed.action.status, "ready_for_gateway");
  assert.equal(fs.existsSync(path.join(root, "07-actions", "execution-log.json")), true);
  const log = JSON.parse(fs.readFileSync(path.join(root, "07-actions", "execution-log.json"), "utf8"));
  assert.equal(log.executions.some(item => item.action_id === actionId), true);
});

test("Bumbee Wiki service posts approved action to configured gateway", async () => {
  const root = path.join(tempDir(), "studio");
  let received = null;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      received = { url: req.url, body: JSON.parse(raw || "{}") };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, run_id: "test-run" }));
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const service = initBumbeeWikiService({
    folder: tempDir(),
    studioFolder: root,
    appId: "bumbee-desktop",
    project: "pc-project",
    deviceId: "pc-1",
    client: {
      registerApp: async () => ({ ok: true }),
      ingestDocument: async () => ({ ok: true }),
      ask: async () => ({ answer: "ok", sources: [], context: "" }),
    },
  });

  try {
    await service.newStudioProject({ title: "Publisher Run", tags: ["#PUBLISHER"] });
    await service.runWorkers({ includeConfirmRequired: false });
    const actionId = "publisher-run:prepare_publish_package";
    await service.approveAction({ actionId, approvedBy: "tester" });
    const result = await service.runGatewayAction({
      actionId,
      gatewayBaseUrl: `http://127.0.0.1:${port}`,
    });
    assert.equal(result.ok, true);
    assert.equal(result.action.status, "executed");
    assert.equal(result.execution.response.run_id, "test-run");
    assert.equal(received.url, "/api/studio/runs");
    assert.equal(received.body.skill_name, "publisher_worker");
    assert.equal(received.body.input_data.action_type, "prepare_publish_package");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("listSyncableFiles ignores hidden files, unsupported extensions, and oversized files", () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "a.md"), "ok", "utf8");
  fs.writeFileSync(path.join(root, ".hidden.md"), "hidden", "utf8");
  fs.writeFileSync(path.join(root, "image.png"), "png", "utf8");
  fs.writeFileSync(path.join(root, "large.txt"), "x".repeat(20), "utf8");

  const files = listSyncableFiles(root, { maxFileBytes: 10 });
  assert.deepEqual(files.map(file => file.relativePath), ["a.md"]);
});

test("Bumbee Wiki service asks through app scope", async () => {
  let sent = null;
  const service = initBumbeeWikiService({
    folder: tempDir(),
    appId: "bumbee-desktop",
    project: "pc-project",
    deviceId: "pc-1",
    client: {
      registerApp: async () => ({ ok: true }),
      ingestDocument: async () => ({ ok: true }),
      ask: async (payload) => {
        sent = payload;
        return { answer: "Found it", sources: ["idea.md"], context: "Idea" };
      },
    },
  });

  const result = await service.ask("find my mail idea");
  assert.equal(result.answer, "Found it");
  assert.equal(sent.app_id, "bumbee-desktop");
  assert.equal(sent.project, "pc-project");
  assert.equal(sent.question, "find my mail idea");
});

test("Bumbee Wiki service falls back to search when app chat times out", async () => {
  const service = initBumbeeWikiService({
    folder: tempDir(),
    appId: "bumbee-desktop",
    project: "pc-project",
    deviceId: "pc-1",
    client: {
      registerApp: async () => ({ ok: true }),
      ingestDocument: async () => ({ ok: true }),
      ask: async () => {
        throw new Error("timeout");
      },
      search: async (params) => ({
        query: params.q,
        results: [
          {
            title: "mail-plan",
            snippet: "Send a follow-up mail with attached proposal.",
            source_path: "bumbee-wiki://pc-1/mail-plan.md",
          },
        ],
      }),
    },
  });

  const result = await service.ask("mail plan");
  assert.match(result.answer, /mail-plan/);
  assert.deepEqual(result.sources, ["bumbee-wiki://pc-1/mail-plan.md"]);
  assert.equal(result.provider_errors[0].fallback, "wiki/search");
});
