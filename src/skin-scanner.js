// src/skin-scanner.js — Main-process: scan asset folders for Live2D / VRM
// characters the user has dropped in. Returns a list the menu can render.
//
// Live2D character is any subfolder under assets/live2d/ that contains a
// *.model3.json file. VRM character is any *.vrm file under assets/vrm/.

"use strict";

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function getAssetRoot() {
  // In packaged app, assets live next to app.asar.unpacked
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "assets");
  }
  return path.resolve(__dirname, "..", "assets");
}

function safeReadDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

function scanLive2D() {
  const root = path.join(getAssetRoot(), "live2d");
  const out = [];
  for (const entry of safeReadDir(root)) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "runtime") continue;
    const dir = path.join(root, entry.name);
    let modelFile = null;
    for (const f of safeReadDir(dir)) {
      if (f.isFile() && f.name.endsWith(".model3.json")) {
        modelFile = path.join(dir, f.name);
        break;
      }
    }
    if (modelFile) {
      out.push({
        id: `live2d:${entry.name}`,
        type: "live2d",
        name: entry.name,
        modelPath: modelFile,
      });
    }
  }
  return out;
}

function scanVRM() {
  const root = path.join(getAssetRoot(), "vrm");
  const out = [];
  for (const entry of safeReadDir(root)) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".vrm")) {
      const id = entry.name.replace(/\.vrm$/i, "");
      out.push({
        id: `vrm:${id}`,
        type: "vrm",
        name: id,
        modelPath: path.join(root, entry.name),
      });
    } else if (entry.isDirectory()) {
      const dir = path.join(root, entry.name);
      for (const f of safeReadDir(dir)) {
        if (f.isFile() && f.name.toLowerCase().endsWith(".vrm")) {
          out.push({
            id: `vrm:${entry.name}`,
            type: "vrm",
            name: entry.name,
            modelPath: path.join(dir, f.name),
          });
          break;
        }
      }
    }
  }
  return out;
}

function scanAll() {
  return {
    live2d: scanLive2D(),
    vrm: scanVRM(),
  };
}

function findById(skinId) {
  if (!skinId || typeof skinId !== "string") return null;
  if (skinId === "clawd" || skinId === "bunny") {
    return { id: skinId, type: "svg" };
  }
  const all = scanAll();
  for (const item of [...all.live2d, ...all.vrm]) {
    if (item.id === skinId) return item;
  }
  return null;
}

module.exports = { scanAll, scanLive2D, scanVRM, findById, getAssetRoot };
