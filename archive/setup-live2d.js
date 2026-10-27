#!/usr/bin/env node
// scripts/setup-live2d.js
// Downloads the Live2D Cubism Core JS runtime and prepares the assets/live2d/
// directory layout. The Cubism Core file is copyright Live2D Inc and not
// redistributed in this repo — the user must accept Live2D's license terms
// before downloading.

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets", "live2d");
const RUNTIME_DIR = path.join(ASSETS_DIR, "runtime");
const CORE_FILE = path.join(RUNTIME_DIR, "live2dcubismcore.min.js");
const CUBISM_CORE_URL = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";

const LICENSE_NOTE = `
Live2D Cubism SDK License Notice
================================
The file live2dcubismcore.min.js is distributed by Live2D Inc and is NOT
included in this repository. To use Live2D characters, you must:

1. Read & accept the Cubism Core License:
   https://www.live2d.com/en/sdk/license/

2. Register for a free Cubism Release License (required even for free use)
   if you intend to publish / distribute / commercialize an app embedding
   Cubism Core. Indie developers (annual revenue thresholds apply) can use
   it for free; enterprise users must purchase a commercial license.

3. This script will fetch live2dcubismcore.min.js from the official URL:
   ${CUBISM_CORE_URL}

By proceeding, you confirm you have read and agree to comply with the
Live2D Cubism SDK license terms.
`;

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

function ensureDirs() {
  for (const dir of [ASSETS_DIR, RUNTIME_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  // Placeholder readme so the dir is committed
  const readme = path.join(ASSETS_DIR, "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, [
      "# Live2D characters",
      "",
      "Drop each character into its own subfolder, e.g.:",
      "",
      "```",
      "assets/live2d/",
      "├── runtime/",
      "│   └── live2dcubismcore.min.js   (downloaded by `npm run setup:live2d`)",
      "├── hiyori/",
      "│   ├── hiyori.model3.json",
      "│   ├── hiyori.moc3",
      "│   ├── textures/",
      "│   └── motions/",
      "└── another-character/",
      "    └── another.model3.json",
      "```",
      "",
      "The app auto-detects subfolders containing a `*.model3.json` file and",
      "lists them in the Character menu.",
      "",
      "License: each character is your responsibility. Source from Booth.pm",
      "with `商用利用可` (commercial OK) or commission your own. The Cubism",
      "Core runtime requires a free Live2D Release License — see",
      "https://www.live2d.com/en/sdk/license/",
    ].join("\n"), "utf8");
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = dest + ".part";
    const file = fs.createWriteStream(tmp);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tmp, dest);
          resolve();
        });
      });
    }).on("error", (err) => {
      try { fs.unlinkSync(tmp); } catch {}
      reject(err);
    });
  });
}

(async () => {
  ensureDirs();
  if (fs.existsSync(CORE_FILE)) {
    console.log(`Cubism Core already present at ${CORE_FILE}`);
    process.exit(0);
  }
  console.log(LICENSE_NOTE);
  const auto = process.argv.includes("--yes") || process.env.LIVE2D_ACCEPT_LICENSE === "1";
  const answer = auto ? "y" : await ask("Type 'y' to accept and download, anything else to abort: ");
  if (answer !== "y") {
    console.log("Aborted. No file downloaded.");
    process.exit(1);
  }
  console.log(`Downloading from ${CUBISM_CORE_URL} ...`);
  try {
    await download(CUBISM_CORE_URL, CORE_FILE);
    const size = fs.statSync(CORE_FILE).size;
    console.log(`Saved ${CORE_FILE} (${(size / 1024).toFixed(1)} KB)`);
    console.log("Done.");
  } catch (err) {
    console.error("Download failed:", err.message);
    console.error("You can manually download from:", CUBISM_CORE_URL);
    console.error("and save it to:", CORE_FILE);
    process.exit(2);
  }
})();
