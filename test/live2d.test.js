// 0.15.0 — nhân vật Live2D VTuber (Mao): file đóng gói đủ, đường phục vụ chặt, giấy phép ghi đủ, nhẹ máy.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { __test } = require("../src/javis-desk-host");

const ROOT = path.join(__dirname, "..");
const roots = { src: path.join(ROOT, "src"), assets: path.join(ROOT, "assets") };

test.describe("Live2D · model + Core", () => {
  test.it("Mao.model3.json trỏ tới file có thật, texture ≤ 2048", () => {
    const dir = path.join(ROOT, "assets", "live2d", "mao");
    const m = JSON.parse(fs.readFileSync(path.join(dir, "Mao.model3.json"), "utf8"));
    const refs = m.FileReferences;
    const files = [refs.Moc, refs.Physics, refs.Pose, ...refs.Textures, ...refs.Expressions.map((e) => e.File), ...Object.values(refs.Motions).flat().map((x) => x.File)];
    for (const f of files) assert.ok(fs.existsSync(path.join(dir, f)), f);
    for (const t of refs.Textures) {
      const b = fs.readFileSync(path.join(dir, t));
      const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      assert.ok(w <= 2048 && h <= 2048, `${t} ${w}x${h}`);
    }
    const phys = JSON.parse(fs.readFileSync(path.join(dir, refs.Physics), "utf8"));
    assert.ok(phys.Meta.PhysicsSettingCount >= 10, "vật lý tóc/áo đủ nhiều nhóm");
    assert.ok(m.Groups.some((g) => g.Name === "LipSync") && m.Groups.some((g) => g.Name === "EyeBlink"));
  });

  test.it("phục vụ đúng file Live2D, chặn đường lạ", () => {
    const r = (p) => __test.resolveStaticPath(p, roots);
    assert.strictEqual(r("/live2d/core/live2dcubismcore.min.js"), path.join(roots.assets, "live2d", "core", "live2dcubismcore.min.js"));
    assert.strictEqual(r("/live2d/mao/Mao.model3.json"), path.join(roots.assets, "live2d", "mao", "Mao.model3.json"));
    assert.strictEqual(r("/live2d/mao/Mao.2048/texture_00.png"), path.join(roots.assets, "live2d", "mao", "Mao.2048", "texture_00.png"));
    assert.strictEqual(r("/live2d/mao/motions/mtn_02.motion3.json"), path.join(roots.assets, "live2d", "mao", "motions", "mtn_02.motion3.json"));
    assert.strictEqual(r("/live2d/mao/../../package.json"), null);
    assert.strictEqual(r("/live2d/core/other.js"), null);
    assert.strictEqual(r("/live2d/haru/Haru.moc3"), null);
    assert.strictEqual(r("/live2d/mao/x/y/z.json"), null);
    for (const p of ["/live2d/core/live2dcubismcore.min.js", "/live2d/mao/Mao.moc3"]) assert.ok(fs.existsSync(r(p)), p);
  });

  test.it("đóng gói: assets/live2d có trong app, mã nguồn TS framework không bị chép thừa", () => {
    const pkg = require("../package.json");
    assert.ok(pkg.build.files.includes("assets/live2d/**/*"));
    assert.ok(pkg.build.files.includes("!src/desk/live2d/**/*"));
  });

  test.it("giấy phép + credit Live2D ghi trong LICENSES.md", () => {
    const lic = fs.readFileSync(path.join(ROOT, "LICENSES.md"), "utf8");
    assert.match(lic, /This content uses sample data owned and copyrighted by Live2D Inc\./);
    assert.match(lic, /Free Material License/);
    assert.match(lic, /Cubism Core/);
    assert.match(lic, /Live2D Open Software License/);
  });
});

test.describe("Live2D · nhẹ máy", () => {
  const src = fs.readFileSync(path.join(ROOT, "src", "desk", "live2d", "live2d-desk.ts"), "utf8");
  const main = fs.readFileSync(path.join(ROOT, "src", "main.js"), "utf8");
  test.it("mặc định 30 FPS, chỉ cho 24/30/60", () => {
    assert.match(src, /: 30;/);
    assert.match(src, /\[24, 30, 60\]\.includes/);
    assert.match(main, /const FPS_CHOICES = \[24, 30, 60\]/);
  });
  test.it("dừng vẽ khi ẩn/khoá/ngủ, mặc định nhân vật mao + menu hiện/ẩn có phím tắt", () => {
    assert.match(src, /visibilitychange/);
    for (const ev of ["lock-screen", "unlock-screen", "suspend", "resume"]) assert.ok(main.includes(`powerMonitor.on("${ev}"`), ev);
    assert.match(main, /character: "mao"/);
    assert.match(main, /"Ẩn nhân vật" : "Hiện nhân vật", accelerator: TOGGLE_SHORTCUT/);
    assert.match(main, /visibleOnFullScreen: false/);
  });
});

test.describe("Live2D · không phát tán file gốc", () => {
  test.it("model + Core bị .gitignore (repo công khai), tải bằng scripts/fetch-live2d.js có sha256", () => {
    const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.match(gi, /^assets\/live2d\/\*\/$/m);
    assert.doesNotMatch(gi, /^!assets\/live2d\/(mao|hiyori|core)/m);
    const { FILES, urlFor } = require("../scripts/fetch-live2d.js");
    assert.ok(FILES.length >= 30);
    for (const [rel, sum] of FILES) assert.match(sum, /^[0-9a-f]{64}$/, rel);
    assert.match(urlFor("mao/Mao.moc3"), /^https:\/\/raw\.githubusercontent\.com\/Live2D\/CubismWebSamples\/[0-9a-f]{40}\/Samples\/Resources\/Mao\/Mao\.moc3$/);
    assert.strictEqual(urlFor("core/live2dcubismcore.min.js"), "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js");
  });
});
