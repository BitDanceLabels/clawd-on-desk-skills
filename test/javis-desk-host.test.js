// JAVIS desk host: same-origin proxy, device-key store, pairing — all with a fake
// gateway (no network, no real LLM, no real token).
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DEFAULT_GATEWAY, MAX_FAILURES, __test } = require("../src/javis-desk-host");
const { normalizeGateway, isPlausibleDeviceKey, isGatewayPath, resolveStaticPath, createKeyStore, createConfigStore, createFleetProxy, createPairing } = __test;

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
  it("serves the desk page, its bundle and the hologram character only", () => {
    assert.strictEqual(resolveStaticPath("/", roots), "/app/src/desk/index.html");
    assert.strictEqual(resolveStaticPath("/desk.bundle.js", roots), "/app/src/bundles/desk.bundle.js");
    assert.strictEqual(resolveStaticPath("/desk.css", roots), "/app/src/desk/desk.css");
    assert.strictEqual(resolveStaticPath("/hologram/character.jpg", roots), "/app/assets/hologram/character.jpg");
  });
  it("refuses traversal and anything else", () => {
    assert.strictEqual(resolveStaticPath("/desk/../../src/main.js", roots), null);
    assert.strictEqual(resolveStaticPath("/hologram/%2e%2e/%2e%2e/package.json", roots), null);
    assert.strictEqual(resolveStaticPath("/main.js", roots), null);
    assert.strictEqual(resolveStaticPath("/javis-chat.html", roots), null);
  });
  it("routes /fleet/* and /asset-files/* to the gateway, nothing else", () => {
    assert.strictEqual(isGatewayPath("/fleet/home/tasks"), true);
    assert.strictEqual(isGatewayPath("/asset-files/media/a.mp4"), true);
    assert.strictEqual(isGatewayPath("/desk.css"), false);
    assert.strictEqual(isGatewayPath("/fleetx/a"), false);
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

  it("answers 401 locally (no gateway call) when not paired", async () => {
    const { keyStore, configStore } = setup();
    const gw = fakeGateway(() => new Response("{}"));
    const proxy = createFleetProxy({ keyStore, configStore, fetchImpl: gw.fetchImpl });
    const res = await proxy.handle(new Request("javis-desk://app/fleet/chat"));
    assert.strictEqual(res.status, 401);
    assert.strictEqual(gw.calls.length, 0);
  });

  it("adds the bearer key in main, strips page tokens, forwards body", async () => {
    const { keyStore, configStore } = setup();
    keyStore.save(FAKE_KEY);
    const gw = fakeGateway(() => new Response(JSON.stringify({ active: "s1", sessions: [] }), { headers: { "Content-Type": "application/json" } }));
    const proxy = createFleetProxy({ keyStore, configStore, fetchImpl: gw.fetchImpl });
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

  it("stops calling the gateway after it rejects the key (circuit breaker)", async () => {
    const { keyStore, configStore } = setup();
    keyStore.save(FAKE_KEY);
    let authErrors = 0;
    const gw = fakeGateway(() => new Response("{}", { status: 401 }));
    const proxy = createFleetProxy({ keyStore, configStore, fetchImpl: gw.fetchImpl, onAuthError: () => authErrors++ });
    assert.strictEqual((await proxy.handle(new Request("javis-desk://app/fleet/chat"))).status, 401);
    assert.strictEqual((await proxy.handle(new Request("javis-desk://app/fleet/chat"))).status, 401);
    assert.strictEqual(gw.calls.length, 1);
    assert.strictEqual(authErrors, 1);
    proxy.reset();
    await proxy.handle(new Request("javis-desk://app/fleet/chat"));
    assert.strictEqual(gw.calls.length, 2);
  });

  it("gives up on /fleet/stream after 3 failures (204 stops EventSource reconnects)", async () => {
    const { keyStore, configStore } = setup();
    keyStore.save(FAKE_KEY);
    const gw = fakeGateway(() => { throw new Error("ECONNREFUSED"); });
    const proxy = createFleetProxy({ keyStore, configStore, fetchImpl: gw.fetchImpl });
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

describe("JAVIS pairing (device code)", () => {
  function manualTimers() {
    const queue = [];
    return {
      setTimer: (fn, ms) => { const t = { fn, ms }; queue.push(t); return t; },
      clearTimer: (t) => { const i = queue.indexOf(t); if (i >= 0) queue.splice(i, 1); },
      async runNext() { const t = queue.shift(); if (t) await t.fn(); return t; },
      queue,
    };
  }

  it("start → pending → approved saves the key and never returns it to the page", async () => {
    const { keyStore, configStore } = setup();
    const timers = manualTimers();
    const updates = [];
    let paired = 0;
    let polls = 0;
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body);
      if (url.endsWith("/fleet/auth/device/start")) {
        assert.match(body.client_name, /^JAVIS Desktop/);
        return new Response(JSON.stringify({ device_code: "dc1", user_code: "ABCD-EFGH", expires_in: 600, interval: 3, verify_url: "/auth/device.html?code=ABCD-EFGH" }));
      }
      polls++;
      assert.strictEqual(body.device_code, "dc1");
      return new Response(JSON.stringify(polls < 2 ? { status: "pending" } : { status: "approved", key: FAKE_KEY, email: "o@example.test" }));
    };
    const pairing = createPairing({ keyStore, configStore, fetchImpl, clientName: "JAVIS Desktop · test", onUpdate: (u) => updates.push(u), onPaired: () => paired++, ...timers });
    const info = await pairing.start();
    assert.strictEqual(info.userCode, "ABCD-EFGH");
    assert.strictEqual(info.verifyUrl, configStore.getGateway() + "/auth/device.html?code=ABCD-EFGH");
    assert.ok(!JSON.stringify(info).includes(FAKE_KEY));
    await timers.runNext();
    await timers.runNext();
    assert.deepStrictEqual(updates.map((u) => u.status), ["pending", "approved"]);
    assert.ok(!JSON.stringify(updates).includes(FAKE_KEY));
    assert.strictEqual(keyStore.read().key, FAKE_KEY);
    assert.strictEqual(paired, 1);
    assert.strictEqual(timers.queue.length, 0);
  });

  it("stops after 3 network failures instead of polling forever", async () => {
    const { keyStore, configStore } = setup();
    const timers = manualTimers();
    const updates = [];
    const fetchImpl = async (url) => {
      if (url.endsWith("/start")) return new Response(JSON.stringify({ device_code: "dc", user_code: "X", interval: 3 }));
      throw new Error("offline");
    };
    const pairing = createPairing({ keyStore, configStore, fetchImpl, clientName: "t", onUpdate: (u) => updates.push(u), onPaired: () => {}, ...timers });
    await pairing.start();
    const delays = [];
    for (let i = 0; i < 5; i++) {
      const t = await timers.runNext();
      if (!t) break;
      delays.push(t.ms);
    }
    assert.strictEqual(delays.length, MAX_FAILURES);
    assert.ok(delays[1] > delays[0] && delays[2] > delays[1], "back-off grows");
    assert.deepStrictEqual(updates.map((u) => u.status), ["error"]);
    assert.strictEqual(pairing.isActive(), false);
    assert.strictEqual(keyStore.read(), null);
  });
});
