"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const createBootstrap = require("../src/bumbee-system-bootstrap");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bumbee-system-bootstrap-"));
}

test("Bumbee system bootstrap syncs required skills to Codex and Claude targets", async () => {
  const home = tmpDir();
  const calls = [];
  const execFile = (command, args, _opts, cb) => {
    calls.push({ command, args });
    if (command === "ssh") {
      cb(null, "ok", "");
      return;
    }
    if (command === "scp") {
      const remote = args[args.length - 2];
      const parent = args[args.length - 1];
      const skill = remote.split("/").pop();
      fs.mkdirSync(path.join(parent, skill), { recursive: true });
      fs.writeFileSync(path.join(parent, skill, "SKILL.md"), `---\nname: ${skill}\ndescription: test\n---\n`);
      cb(null, "", "");
      return;
    }
    cb(new Error(`unexpected command ${command}`), "", "");
  };

  const bootstrap = createBootstrap({ execFile, homeDir: home });
  const result = await bootstrap.sync();

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.synced.length, 6);
  assert.equal(fs.existsSync(path.join(home, ".codex", "skills", "bumbee-system-awareness", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(home, ".claude", "skills", "bumbee-encyclopedia", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(home, ".codex", "skills", "bumbee-project-viral-architecture-review", "SKILL.md")), true);
  assert.equal(calls.filter((call) => call.command === "ssh").length, 1);
  assert.equal(calls.filter((call) => call.command === "scp").length, 6);
});

test("Bumbee system bootstrap reports remote connection errors without throwing", async () => {
  const execFile = (_command, _args, _opts, cb) => {
    const err = new Error("ssh failed");
    cb(err, "", "no route");
  };
  const bootstrap = createBootstrap({ execFile, homeDir: tmpDir() });
  const result = await bootstrap.sync();

  assert.equal(result.ok, false);
  assert.equal(result.status, "error");
  assert.match(result.message, /Cannot reach Bumbee skills root/);
});
