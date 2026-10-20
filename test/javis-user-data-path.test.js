// JAVIS rename must not move userData: prefs, vocab, chat history and cookies stay put.
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveUserDataPath, pinUserDataPath, LEGACY_USER_DATA_DIR } = require("../src/user-data-path");

const tempDirs = [];
function tmpAppData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "javis-appdata-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe("JAVIS userData path", () => {
  it("is pinned to <appData>/clawd-on-desk, not the new product name", () => {
    const appData = tmpAppData();
    assert.strictEqual(LEGACY_USER_DATA_DIR, "clawd-on-desk");
    assert.strictEqual(resolveUserDataPath(appData), path.join(appData, "clawd-on-desk"));
    assert.notStrictEqual(resolveUserDataPath(appData), path.join(appData, "JAVIS"));
  });

  it("keeps existing prefs, vocab and chat history reachable at the same paths", () => {
    const appData = tmpAppData();
    const legacy = path.join(appData, "clawd-on-desk");
    fs.mkdirSync(path.join(legacy, "chat-history"), { recursive: true });
    fs.writeFileSync(path.join(legacy, "clawd-prefs.json"), '{"lang":"vi"}');
    fs.writeFileSync(path.join(legacy, "bumbee-english-vocab.json"), '{"words":[]}');
    fs.mkdirSync(path.join(appData, "JAVIS")); // even if a JAVIS folder appears, keep legacy
    const userData = resolveUserDataPath(appData);
    assert.strictEqual(userData, legacy);
    assert.ok(fs.existsSync(path.join(userData, "clawd-prefs.json")));
    assert.ok(fs.existsSync(path.join(userData, "bumbee-english-vocab.json")));
    assert.ok(fs.existsSync(path.join(userData, "chat-history")));
  });

  it("falls back to an old 'Clawd on Desk' folder only when it holds prefs and clawd-on-desk is absent", () => {
    const appData = tmpAppData();
    const alt = path.join(appData, "Clawd on Desk");
    fs.mkdirSync(alt);
    assert.strictEqual(resolveUserDataPath(appData), path.join(appData, "clawd-on-desk"));
    fs.writeFileSync(path.join(alt, "clawd-prefs.json"), "{}");
    assert.strictEqual(resolveUserDataPath(appData), alt);
  });

  it("calls app.setPath('userData') with the pinned folder", () => {
    const appData = tmpAppData();
    const calls = [];
    const fakeApp = {
      getPath: (name) => { assert.strictEqual(name, "appData"); return appData; },
      setPath: (name, value) => calls.push([name, value]),
    };
    const saved = process.env.CLAWD_USER_DATA_DIR;
    delete process.env.CLAWD_USER_DATA_DIR;
    try {
      pinUserDataPath(fakeApp);
    } finally {
      if (saved !== undefined) process.env.CLAWD_USER_DATA_DIR = saved;
    }
    assert.deepStrictEqual(calls, [["userData", path.join(appData, "clawd-on-desk")]]);
  });

  it("main.js pins userData before any other module or path lookup", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
    const pin = src.indexOf('require("./user-data-path").pinUserDataPath(app)');
    assert.ok(pin > 0);
    assert.ok(pin < src.indexOf('getPath("userData")'));
    assert.ok(pin < src.indexOf('require("./bumbee-system-bootstrap")'));
  });
});
