const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const initBumbeeWikiService = require("../src/bumbee-wiki-service");
const { listSyncableFiles } = initBumbeeWikiService;

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
