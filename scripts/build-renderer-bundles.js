#!/usr/bin/env node
// scripts/build-renderer-bundles.js
// Bundles renderer-side ES modules (pixi-live2d-display, three, three-vrm)
// into single IIFE files the Electron renderer can load via <script>.
// Output goes to src/bundles/ — committed during release builds.

"use strict";

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "renderer-bundles");
const OUT = path.join(ROOT, "src", "bundles");

const targets = [
  {
    entry: path.join(SRC, "live2d-entry.js"),
    out: path.join(OUT, "live2d.bundle.js"),
    globalName: "ClawdLive2D",
  },
  {
    entry: path.join(SRC, "vrm-entry.js"),
    out: path.join(OUT, "vrm.bundle.js"),
    globalName: "ClawdVRM",
  },
];

async function build() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  for (const t of targets) {
    if (!fs.existsSync(t.entry)) {
      console.warn(`[skip] entry missing: ${t.entry}`);
      continue;
    }
    console.log(`[bundle] ${path.relative(ROOT, t.entry)} -> ${path.relative(ROOT, t.out)}`);
    await esbuild.build({
      entryPoints: [t.entry],
      bundle: true,
      format: "iife",
      globalName: t.globalName,
      outfile: t.out,
      platform: "browser",
      target: "es2020",
      minify: true,
      sourcemap: false,
      logLevel: "warning",
      // Pixi/three reference globals like `self` / `window` heavily; let the
      // bundler keep them as runtime references rather than try to resolve
      // them at build time.
      define: {
        "process.env.NODE_ENV": "\"production\"",
      },
    });
  }
  console.log("[done] renderer bundles built");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
