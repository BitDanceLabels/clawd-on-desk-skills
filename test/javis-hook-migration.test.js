// JAVIS rebrand: hook paths are rewritten in place, other hooks untouched,
// settings backed up before write, WorktreeCreate never (re)installed.
// Uses only temp fake settings files — never the real ~/.claude/settings.json.
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { registerHooks, CORE_HOOKS, RETIRED_HOOKS } = require("../hooks/install");
const { registerGeminiHooks } = require("../hooks/gemini-install");
const { BACKUP_TAG } = require("../hooks/json-writer");

const tempDirs = [];
const KNOWN = { version: "2.1.90", source: "test", status: "known" };
const OLD_SCRIPT = "/Applications/Clawd on Desk.app/Contents/Resources/app.asar.unpacked/hooks/clawd-hook.js";
const THIRD_PARTY = { type: "command", command: "node /home/me/my-own-hook.js" };

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "javis-hooks-"));
  tempDirs.push(dir);
  return dir;
}

function oldSettings() {
  const hook = (event) => ({ matcher: "", hooks: [{ type: "command", command: `node "${OLD_SCRIPT}" ${event}` }] });
  return {
    model: "opus",
    permissions: { allow: ["Bash(ls:*)"] },
    hooks: {
      SessionStart: [hook("SessionStart"), { matcher: "", hooks: [THIRD_PARTY] }],
      Stop: [hook("Stop")],
      WorktreeCreate: [hook("WorktreeCreate"), { matcher: "", hooks: [THIRD_PARTY] }],
      PermissionRequest: [{ matcher: "", hooks: [{ type: "http", url: "http://127.0.0.1:23333/permission", timeout: 600 }] }],
    },
  };
}

function commandsOf(entries) {
  const out = [];
  for (const entry of entries || []) {
    if (typeof entry.command === "string") out.push(entry.command);
    for (const h of entry.hooks || []) if (typeof h.command === "string") out.push(h.command);
  }
  return out;
}

afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe("JAVIS hook migration", () => {
  it("never lists WorktreeCreate as a hook to install", () => {
    assert.ok(!CORE_HOOKS.includes("WorktreeCreate"));
    assert.ok(RETIRED_HOOKS.includes("WorktreeCreate"));
  });

  it("rewrites old clawd-hook.js paths in place and keeps every other hook", () => {
    const dir = tmpDir();
    const settingsPath = path.join(dir, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(oldSettings(), null, 2));

    const result = registerHooks({ silent: true, settingsPath, claudeVersionInfo: KNOWN });
    const after = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const newScript = path.resolve(__dirname, "..", "hooks", "clawd-hook.js").replace(/\\/g, "/");

    assert.ok(result.updated >= 2);
    assert.strictEqual(after.model, "opus");
    assert.deepStrictEqual(after.permissions, { allow: ["Bash(ls:*)"] });
    // Same position, new path.
    assert.strictEqual(after.hooks.Stop.length, 1);
    assert.strictEqual(commandsOf(after.hooks.Stop)[0], `node "${newScript}" Stop`);
    assert.strictEqual(commandsOf(after.hooks.SessionStart)[0], `node "${newScript}" SessionStart`);
    assert.ok(commandsOf(after.hooks.SessionStart).includes(THIRD_PARTY.command));
    // Nothing points at the old app any more.
    assert.ok(!JSON.stringify(after).includes("Clawd on Desk.app"));
    // Permission HTTP hook kept, not duplicated.
    assert.strictEqual(after.hooks.PermissionRequest.length, 1);
  });

  it("strips our WorktreeCreate entry but keeps third-party WorktreeCreate hooks", () => {
    const dir = tmpDir();
    const settingsPath = path.join(dir, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(oldSettings(), null, 2));

    registerHooks({ silent: true, settingsPath, claudeVersionInfo: KNOWN });
    const after = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.deepStrictEqual(commandsOf(after.hooks.WorktreeCreate), [THIRD_PARTY.command]);
  });

  it("does not add WorktreeCreate on a fresh settings file", () => {
    const dir = tmpDir();
    const settingsPath = path.join(dir, "settings.json");
    registerHooks({ silent: true, settingsPath, claudeVersionInfo: KNOWN });
    const after = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.strictEqual(after.hooks.WorktreeCreate, undefined);
  });

  it("backs up settings.json as settings.json.bak-javis-<stamp> before writing", () => {
    const dir = tmpDir();
    const settingsPath = path.join(dir, "settings.json");
    const original = JSON.stringify(oldSettings(), null, 2);
    fs.writeFileSync(settingsPath, original);

    registerHooks({ silent: true, settingsPath, claudeVersionInfo: KNOWN });
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith(`settings.json.${BACKUP_TAG}-`));
    assert.strictEqual(backups.length, 1);
    assert.match(backups[0], /^settings\.json\.bak-javis-\d{8}-\d{6}$/);
    assert.strictEqual(fs.readFileSync(path.join(dir, backups[0]), "utf8"), original);
    // No temp files left behind (atomic write).
    assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
  });

  it("does not write (or back up) when nothing changed", () => {
    const dir = tmpDir();
    const settingsPath = path.join(dir, "settings.json");
    registerHooks({ silent: true, settingsPath, claudeVersionInfo: KNOWN });
    const before = fs.readdirSync(dir).length;
    const result = registerHooks({ silent: true, settingsPath, claudeVersionInfo: KNOWN });
    assert.strictEqual(result.added, 0);
    assert.strictEqual(result.updated, 0);
    assert.strictEqual(fs.readdirSync(dir).length, before);
  });

  it("rewrites Gemini hook paths in place with a backup", () => {
    const dir = tmpDir();
    const settingsPath = path.join(dir, "settings.json");
    const oldGemini = "/Applications/Clawd on Desk.app/Contents/Resources/app.asar.unpacked/hooks/gemini-hook.js";
    fs.writeFileSync(settingsPath, JSON.stringify({
      theme: "dark",
      hooks: { SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: `node "${oldGemini}"`, name: "clawd" }] }] },
    }));
    registerGeminiHooks({ silent: true, settingsPath });
    const after = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.strictEqual(after.theme, "dark");
    assert.ok(!JSON.stringify(after).includes("Clawd on Desk.app"));
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith(`settings.json.${BACKUP_TAG}-`)));
  });
});
