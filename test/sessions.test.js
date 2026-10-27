// Session tracker + local hook server (fake Claude hooks, no network beyond 127.0.0.1).
const { describe, it } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const { createSessionTracker, shortCwd, STALE_MS } = require("../src/sessions");
const { createHookServer, describeToolInput, normalizeSuggestion } = require("../src/hook-server");

describe("session tracker", () => {
  it("reduces sessions to one mode: waiting > error > working > idle", () => {
    const t = createSessionTracker();
    assert.strictEqual(t.summary().mode, "idle");
    t.update({ id: "a", state: "working", event: "PreToolUse" });
    assert.strictEqual(t.summary().mode, "working");
    t.update({ id: "b", state: "error", event: "PostToolUseFailure" });
    assert.strictEqual(t.summary().mode, "error");
    t.update({ id: "c", state: "notification", event: "Notification" });
    const s = t.summary();
    assert.strictEqual(s.mode, "waiting");
    assert.deepStrictEqual([s.working, s.errors, s.waiting, s.total], [1, 1, 1, 3]);
  });

  it("reports owner-worthy transitions once", () => {
    const t = createSessionTracker();
    assert.strictEqual(t.update({ id: "a", state: "thinking" }).transition, null);
    assert.strictEqual(t.update({ id: "a", state: "working" }).transition, null);
    assert.strictEqual(t.update({ id: "a", state: "attention", event: "Stop" }).transition, "done");
    assert.strictEqual(t.update({ id: "a", state: "attention", event: "Stop" }).transition, null);
    assert.strictEqual(t.update({ id: "a", state: "notification" }).transition, "waiting");
  });

  it("never pings the owner for headless workers", () => {
    const t = createSessionTracker();
    t.update({ id: "w", state: "working", headless: true });
    assert.strictEqual(t.update({ id: "w", state: "notification", headless: true }).transition, null);
  });

  it("drops ended and stale sessions, rejects unknown states", () => {
    let now = 1000;
    const t = createSessionTracker({ now: () => now });
    t.update({ id: "a", state: "working" });
    t.update({ id: "b", state: "working" });
    t.update({ id: "a", state: "sleeping", event: "SessionEnd" });
    assert.deepStrictEqual(t.list().map((s) => s.id), ["b"]);
    now += STALE_MS + 1;
    assert.strictEqual(t.list().length, 0);
    assert.strictEqual(t.update({ id: "x", state: "dancing" }).ok, false);
  });

  it("shows only the last two folders of cwd", () => {
    assert.strictEqual(shortCwd("/home/a/work/javis-toi-gian/app"), "javis-toi-gian/app");
    assert.strictEqual(shortCwd("C:\\Users\\PC\\proj"), "PC/proj");
    assert.strictEqual(shortCwd(""), "");
  });
});

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers: { "Content-Type": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("hook server", () => {
  async function boot(extra = {}) {
    const seen = { states: [], cards: [], gone: [] };
    const server = createHookServer({
      onState: (s) => seen.states.push(s),
      onPermission: (c) => seen.cards.push(c),
      onPermissionGone: (id) => seen.gone.push(id),
      ...extra,
    });
    const port = await server.start({ ports: [0], sync: false });
    return { server, port, seen };
  }

  it("answers the hooks' health probe and forwards state updates", async () => {
    const { server, port, seen } = await boot();
    try {
      const probe = await request(port, "GET", "/state");
      assert.strictEqual(probe.status, 200);
      assert.ok(JSON.parse(probe.body).ok);
      const r = await request(port, "POST", "/state", { state: "working", session_id: "s1", event: "PreToolUse", cwd: "/x/y", agent_id: "claude-code" });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(seen.states[0], { id: "s1", state: "working", event: "PreToolUse", agent: "claude-code", cwd: "/x/y", host: null, headless: false });
    } finally {
      server.stop();
    }
  });

  it("holds a permission request until the owner decides on the card", async () => {
    const { server, port, seen } = await boot();
    try {
      const pending = request(port, "POST", "/permission", {
        tool_name: "Bash",
        tool_input: { command: "rm -rf build" },
        session_id: "s1",
        permission_suggestions: [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "rm -rf build" }] }],
      });
      while (!seen.cards.length) await new Promise((r) => setTimeout(r, 10));
      const card = seen.cards[0];
      assert.strictEqual(card.tool, "Bash");
      assert.strictEqual(card.summary, "rm -rf build");
      assert.strictEqual(card.canAlways, true);
      assert.strictEqual(server.decide(card.id, "always"), true);
      const decision = JSON.parse((await pending).body).hookSpecificOutput.decision;
      assert.strictEqual(decision.behavior, "allow");
      assert.strictEqual(decision.updatedPermissions[0].type, "addRules");
      assert.deepStrictEqual(seen.gone, [card.id]);
      assert.strictEqual(server.decide(card.id, "allow"), false);
    } finally {
      server.stop();
    }
  });

  it("auto-denies in do-not-disturb and lets Claude's own task tools through", async () => {
    let dnd = true;
    const { server, port, seen } = await boot({ isDoNotDisturb: () => dnd });
    try {
      let r = await request(port, "POST", "/permission", { tool_name: "Bash", tool_input: {} });
      assert.strictEqual(JSON.parse(r.body).hookSpecificOutput.decision.behavior, "deny");
      dnd = false;
      r = await request(port, "POST", "/permission", { tool_name: "TaskList", tool_input: {} });
      assert.strictEqual(JSON.parse(r.body).hookSpecificOutput.decision.behavior, "allow");
      assert.strictEqual(seen.cards.length, 0);
    } finally {
      server.stop();
    }
  });

  it("summarises tool input and normalises suggestions", () => {
    assert.strictEqual(describeToolInput("Read", { file_path: "/a/b.txt" }), "/a/b.txt");
    assert.deepStrictEqual(normalizeSuggestion({ type: "setMode", mode: "acceptEdits" }), { type: "setMode", mode: "acceptEdits", destination: "localSettings" });
    assert.strictEqual(normalizeSuggestion({ type: "weird" }), null);
  });
});
