#!/usr/bin/env node
// scripts/build-renderer-bundles.js
// Bundles the desk page (src/desk/desk.js + three.js) into one IIFE the
// renderer loads via <script>. Output goes to src/bundles/ (build artifact).

"use strict";

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "bundles");

const targets = [
  {
    entry: path.join(ROOT, "src", "desk", "desk.js"),
    out: path.join(OUT, "desk.bundle.js"),
    globalName: "JavisDesk",
  },
];

async function build() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  for (const t of targets) {
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
