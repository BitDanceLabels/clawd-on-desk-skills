#!/usr/bin/env node
// Regenerate JAVIS app icons from build/javis-icon-source.png (copied from javis-g1
// apps/desktop/build/icon.png). Needs ImageMagick (`magick` or `convert`) on PATH.
// Outputs (committed): assets/icon.png, assets/icon.ico, build/icon.icns,
// assets/icons/<n>x<n>.png, tray icons.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "build", "javis-icon-source.png");
const IM = (() => {
  for (const bin of ["magick", "convert"]) {
    try { execFileSync(bin, ["-version"], { stdio: "ignore" }); return bin; } catch {}
  }
  throw new Error("ImageMagick not found");
})();

function im(args) { execFileSync(IM, args, { stdio: "inherit" }); }
function resize(size, out) { im([SRC, "-resize", `${size}x${size}`, "-depth", "8", out]); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "javis-icons-"));
try {
  resize(1024, path.join(ROOT, "assets", "icon.png"));
  for (const n of [16, 32, 48, 64, 128, 256, 512]) resize(n, path.join(ROOT, "assets", "icons", `${n}x${n}.png`));

  // Windows .ico (multi-size)
  const icoParts = [16, 24, 32, 48, 64, 128, 256].map((n) => {
    const p = path.join(tmp, `ico-${n}.png`); resize(n, p); return p;
  });
  im([...icoParts, path.join(ROOT, "assets", "icon.ico")]);

  // macOS .icns — PNG-embedded entries (supported since 10.7)
  const ICNS_TYPES = [["icp4", 16], ["icp5", 32], ["icp6", 64], ["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024], ["ic11", 32], ["ic12", 64], ["ic13", 256], ["ic14", 512]];
  const chunks = ICNS_TYPES.map(([type, n]) => {
    const p = path.join(tmp, `icns-${type}.png`); resize(n, p);
    const data = fs.readFileSync(p);
    const head = Buffer.alloc(8); head.write(type, 0, "ascii"); head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8); header.write("icns", 0, "ascii"); header.writeUInt32BE(body.length + 8, 4);
  fs.writeFileSync(path.join(ROOT, "build", "icon.icns"), Buffer.concat([header, body]));

  // Tray: colour icon (Windows/Linux) and monochrome template ring (macOS menu bar)
  resize(32, path.join(ROOT, "assets", "tray-icon.png"));
  const ring = (size, out) => {
    const c = size / 2, r = size * 0.36, w = Math.max(1.5, size * 0.11);
    im(["-size", `${size}x${size}`, "xc:none", "-fill", "none", "-stroke", "black", "-strokewidth", String(w),
      "-draw", `circle ${c},${c} ${c + r},${c}`, "-fill", "black", "-stroke", "none",
      "-draw", `circle ${c},${c} ${c + r * 0.38},${c}`, out]);
  };
  ring(16, path.join(ROOT, "assets", "tray-iconTemplate.png"));
  ring(32, path.join(ROOT, "assets", "tray-iconTemplate@2x.png"));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log("JAVIS icons regenerated");
