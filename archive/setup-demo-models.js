#!/usr/bin/env node
// scripts/setup-demo-models.js
// Downloads official Live2D sample characters (Hiyori, Haru) from
// Live2D Inc's CubismWebSamples GitHub repo into assets/live2d/.
//
// LICENSE: Live2D Cubism sample data is distributed under the
// "Live2D Free Material License Agreement":
//   https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html
// In short — free for personal, educational, and non-commercial use; if you
// plan to ship these models inside a paid product or distribute them as
// part of commercial software, request a license from Live2D Inc first
// or replace them with your own/commercially-licensed models.
//
// The samples are NOT bundled in this repo; this script fetches them from
// the upstream Live2D Inc repo on user opt-in only.

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets", "live2d");

// Live2D Inc's official Web Samples repository
const REPO_BASE = "https://raw.githubusercontent.com/Live2D/CubismWebSamples/develop/Samples/Resources";

// Curated list of free demo characters that ship in CubismWebSamples
const DEMO_MODELS = [
  { id: "hiyori", name: "Hiyori", remoteName: "Hiyori" },
  { id: "haru", name: "Haru", remoteName: "Haru" },
];

const LICENSE_NOTE = `
Live2D Sample Models — Free Material License
=============================================
The demo characters (Hiyori, Haru) are © Live2D Inc and are distributed
under the Live2D Free Material License Agreement:

  https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html

PERMITTED (free):
  - Personal use, learning, prototyping
  - Non-commercial demos, screenshots, social posts
  - Embedding in free / open-source software

NOT PERMITTED without a separate Live2D license:
  - Selling / distributing the models inside a paid product
  - Selling / distributing them as standalone assets
  - Modifying for commercial derivative works

If you intend to commercialize Clawd on Desk including these models,
either purchase a commercial license from Live2D Inc, or replace these
demos with characters you own (commission art, buy from Booth.pm with
"商用利用可" tag, or build your own in VRoid Studio).

This script will fetch the model files from:
  ${REPO_BASE}/<character>/...

By proceeding, you confirm you have read and will comply with the
Live2D Free Material License terms.
`;

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (err) { reject(new Error(`Invalid JSON from ${url}: ${err.message}`)); }
      });
    }).on("error", reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + ".part";
    const file = fs.createWriteStream(tmp);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(tmp); } catch {}
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(tmp); } catch {}
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => {
        fs.renameSync(tmp, dest);
        resolve();
      }));
    }).on("error", (err) => {
      try { file.close(); fs.unlinkSync(tmp); } catch {}
      reject(err);
    });
  });
}

function collectReferencedFiles(modelJson) {
  const refs = modelJson && modelJson.FileReferences;
  if (!refs) return [];
  const files = new Set();
  const add = (p) => { if (p && typeof p === "string") files.add(p.replace(/^\.\//, "")); };

  add(refs.Moc);
  add(refs.Physics);
  add(refs.Pose);
  add(refs.DisplayInfo);
  add(refs.UserData);

  if (Array.isArray(refs.Textures)) refs.Textures.forEach(add);
  if (Array.isArray(refs.Expressions)) {
    refs.Expressions.forEach((e) => add(e && e.File));
  }
  if (refs.Motions && typeof refs.Motions === "object") {
    for (const group of Object.values(refs.Motions)) {
      if (!Array.isArray(group)) continue;
      for (const motion of group) {
        if (motion) { add(motion.File); add(motion.Sound); }
      }
    }
  }
  return Array.from(files);
}

async function downloadModel(model) {
  const destDir = path.join(ASSETS_DIR, model.id);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const modelJsonName = `${model.remoteName}.model3.json`;
  const modelJsonUrl = `${REPO_BASE}/${model.remoteName}/${modelJsonName}`;
  const modelJsonDest = path.join(destDir, modelJsonName);

  console.log(`\n[${model.name}] downloading manifest...`);
  await downloadFile(modelJsonUrl, modelJsonDest);
  const manifest = JSON.parse(fs.readFileSync(modelJsonDest, "utf8"));

  const referenced = collectReferencedFiles(manifest);
  console.log(`[${model.name}] ${referenced.length} files to fetch`);

  let done = 0;
  for (const rel of referenced) {
    const url = `${REPO_BASE}/${model.remoteName}/${rel}`;
    const dest = path.join(destDir, rel);
    if (fs.existsSync(dest)) { done++; continue; }
    try {
      await downloadFile(url, dest);
      done++;
      process.stdout.write(`\r[${model.name}] ${done}/${referenced.length}`);
    } catch (err) {
      console.error(`\n[${model.name}] failed ${rel}: ${err.message}`);
    }
  }
  console.log(`\n[${model.name}] done -> ${destDir}`);
}

(async () => {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

  console.log(LICENSE_NOTE);
  const auto = process.argv.includes("--yes") || process.env.LIVE2D_ACCEPT_LICENSE === "1";
  const answer = auto ? "y" : await ask("Type 'y' to accept and download demo models, anything else to abort: ");
  if (answer !== "y") {
    console.log("Aborted. No files downloaded.");
    process.exit(1);
  }

  for (const m of DEMO_MODELS) {
    try { await downloadModel(m); }
    catch (err) {
      console.error(`Failed to fetch ${m.name}: ${err.message}`);
    }
  }

  console.log("\nAll demo characters fetched.");
  console.log("Restart the app — they will appear under Character → Live2D Characters.");
  console.log("\nReminder: replace these with your own commercially-licensed models");
  console.log("before selling the app to end users.");
})();
