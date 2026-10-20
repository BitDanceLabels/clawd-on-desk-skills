// JAVIS chat host: same-origin proxy, device-key store, sign-in — all with a fake
// gateway (no network, no real LLM, no real token).
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DEFAULT_GATEWAY, MAX_FAILURES, __test } = require("../src/javis-companion-host");
const { normalizeGateway, isPlausibleDeviceKey, resolveStaticPath, createKeyStore, createConfigStore, createFleetProxy } = __test;
const { createAuth, createSessionStore } = require("../src/javis-auth");

const FAKE_KEY = "jvk_" + "x".repeat(32);
const tempDirs = [];
function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "javis-host-"));
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

// Reversible fake of Electron safeStorage.
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s.split("").reverse().join(""), "utf8"),
  decryptString: (b) => b.toString("utf8").split("").reverse().join(""),
};

function setup() {
  const dir = tmpDir();
  const keyStore = createKeyStore({ userDataDir: dir, safeStorage: fakeSafeStorage });
  const configStore = createConfigStore({ userDataDir: dir });
  return { dir, keyStore, configStore };
}

// Sign-in state for the proxy, from whatever is stored (an old jvk_ key here).
function authFor(dir, keyStore, extra = {}) {
  const auth = createAuth({
    fetchImpl: async () => { throw new Error("no network in tests"); },
    getGateway: () => "http://gw.test",
    sessionStore: createSessionStore({ userDataDir: dir, safeStorage: fakeSafeStorage }),
    legacyStore: keyStore,
    ...extra,
  });
  auth.init();
  return auth;
}

describe("JAVIS gateway config", () => {
  it("defaults to the production gateway over Tailscale", () => {
    const { configStore } = setup();
    const saved = process.env.JAVIS_GATEWAY_URL;
    delete process.env.JAVIS_GATEWAY_URL;
    try {
      assert.strictEqual(configStore.getGateway(), "https://server-google-vscode.tail88b7de.ts.net:18110");
      assert.strictEqual(DEFAULT_GATEWAY, "https://server-google-vscode.tail88b7de.ts.net:18110");
      configStore.setGateway("https://example.test:8443/");
      assert.strictEqual(configStore.getGateway(), "https://example.test:8443");
    } finally {
      if (saved !== undefined) process.env.JAVIS_GATEWAY_URL = saved;
    }
  });

  it("rejects non-http(s) or credentialed gateway URLs", () => {
    assert.strictEqual(normalizeGateway("file:///etc/passwd"), null);
    assert.strictEqual(normalizeGateway("https://user:pw@host"), null);
    assert.strictEqual(normalizeGateway("nope"), null);
  });
});

describe("JAVIS device key store", () => {
  it("stores the key encrypted, never in plain text", () => {
    const { keyStore } = setup();
    keyStore.save(FAKE_KEY, { email: "owner@example.test" });
    const raw = fs.readFileSync(keyStore.file, "utf8");
    assert.ok(!raw.includes(FAKE_KEY));
    assert.strictEqual(keyStore.read().key, FAKE_KEY);
    assert.strictEqual(keyStore.read().email, "owner@example.test");
    keyStore.clear();
    assert.strictEqual(keyStore.read(), null);
  });

  it("validates pasted keys", () => {
    assert.ok(isPlausibleDeviceKey(FAKE_KEY));
    assert.ok(!isPlausibleDeviceKey("short"));
    assert.ok(!isPlausibleDeviceKey("has space in it 1234567890"));
    assert.ok(!isPlausibleDeviceKey(undefined));
  });
});

describe("javis-desk:// static files", () => {
  const roots = { src: "/app/src", assets: "/app/assets" };
  it("serves the chat page, companion bundle and Hiyori model only", () => {
    assert.strictEqual(resolveStaticPath("/", roots), "/app/src/javis-chat.html");
    assert.strictEqual(resolveStaticPath("/ui/javis-companion.js", roots), "/app/assets/javis-companion/ui/javis-companion.js");
    assert.strictEqual(resolveStaticPath("/live2d/live2dcubismcore.min.js", roots), "/app/assets/live2d/runtime/live2dcubismcore.min.js");
    assert.strictEqual(resolveStaticPath("/live2d/hiyori/Hiyori.model3.json", roots), "/app/assets/live2d/hiyori/Hiyori.model3.json");
  });
  it("refuses traversal and anything else", () => {
    assert.strictEqual(resolveStaticPath("/ui/../../src/main.js", roots), null);
    assert.strictEqual(resolveStaticPath("/live2d/hiyori/%2e%2e/%2e%2e/package.json", roots), null);
    assert.strictEqual(resolveStaticPath("/live2d/haru/Haru.moc3", roots), null);
    assert.strictEqual(resolveStaticPath("/main.js", roots), null);
  });
});

describe("JAVIS /fleet proxy", () => {
  function fakeGateway(handler) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return handler(url, init, calls.length);
    };
    return { calls, fetchImpl };
  }

  it("answers 401 locally (no gateway call) when not signed in", async () => {
    const { dir, keyStore, configStore } = setup();
    const gw = fakeGateway(() => new Response("{}"));
    const proxy = createFleetProxy({ auth: authFor(dir, keyStore), configStore, fetchImpl: gw.fetchImpl });
    const res = await proxy.handle(new Request("javis-desk://app/fleet/chat"));
    assert.strictEqual(res.status, 401);
    assert.strictEqual(gw.calls.length, 0);
  });

  it("adds the bearer key in main, strips page tokens, forwards body", async () => {
    const { dir, keyStore, configStore } = setup();
    keyStore.save(FAKE_KEY);
    const gw = fakeGateway(() => new Response(JSON.stringify({ active: "s1", sessions: [] }), { headers: { "Content-Type": "application/json" } }));
    const proxy = createFleetProxy({ auth: authFor(dir, keyStore), configStore, fetchImpl: gw.fetchImpl });
    const res = await proxy.handle(new Request("javis-desk://app/fleet/chat/messages?token=leak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "s1" }),
    }));
    assert.strictEqual(res.status, 200);
    const call = gw.calls[0];
    assert.ok(call.url.startsWith(configStore.getGateway() + "/fleet/chat/messages"));
    assert.ok(!call.url.includes("token="));
    assert.strictEqual(call.init.headers.get("authorization"), `Bearer ${FAKE_KEY}`);
    assert.strictEqual(Buffer.from(call.init.body).toString(), '{"session_id":"s1"}');
  });

  it("old key rejected → stops calling the gateway, login screen (circuit breaker)", async () => {
    const { dir, keyStore, configStore } = setup();
    keyStore.save(FAKE_KEY);
    let expired = 0;
    const gw = fakeGateway(() => new Response("{}", { status: 401 }));
    const auth = authFor(dir, keyStore, { onExpired: () => expired++ });
    const proxy = createFleetProxy({ auth, configStore, fetchImpl: gw.fetchImpl });
    assert.strictEqual((await proxy.handle(new Request("javis-desk://app/fleet/chat"))).status, 401);
    assert.strictEqual((await proxy.handle(new Request("javis-desk://app/fleet/chat"))).status, 401);
    assert.strictEqual(gw.calls.length, 1);
    assert.strictEqual(expired, 1);
    assert.strictEqual(auth.getState().state, "expired");
  });

  it("gives up on /fleet/stream after 3 failures (204 stops EventSource reconnects)", async () => {
    const { dir, keyStore, configStore } = setup();
    keyStore.save(FAKE_KEY);
    const gw = fakeGateway(() => { throw new Error("ECONNREFUSED"); });
    const proxy = createFleetProxy({ auth: authFor(dir, keyStore), configStore, fetchImpl: gw.fetchImpl });
    for (let i = 0; i < MAX_FAILURES; i++) {
      proxy.state.streamBlockedUntil = 0; // skip back-off wait in test
      await proxy.handle(new Request("javis-desk://app/fleet/stream?v=2"));
    }
    proxy.state.streamBlockedUntil = 0;
    const res = await proxy.handle(new Request("javis-desk://app/fleet/stream?v=2"));
    assert.strictEqual(res.status, 204);
    assert.strictEqual(gw.calls.length, MAX_FAILURES);
  });
});
