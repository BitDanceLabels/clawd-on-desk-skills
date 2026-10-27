// JAVIS branding + Live2D sample-data credit (required by the Live2D Free Material
// License whenever Hiyori / Haru — Live2D Inc. sample models — are shown).
"use strict";

const APP_NAME = "JAVIS";
const DEFAULT_CHARACTER_SKIN = "live2d:hiyori";
// Bundled Live2D Inc. sample models (unmodified). User-added models are not samples.
const LIVE2D_SAMPLE_MODELS = ["hiyori", "haru"];

const LIVE2D_CREDIT = "This content uses sample data owned and copyrighted by Live2D Inc. The sample data are utilized in accordance with terms and conditions set by Live2D Inc.";
const LIVE2D_CREDIT_SHORT = "This content uses sample data owned and copyrighted by Live2D Inc.";
const LIVE2D_CREDIT_VI = "Nhân vật mẫu © Live2D Inc.";

function isLive2DSampleSkin(skin) {
  if (!skin) return false;
  const id = typeof skin === "string" ? skin : skin.id;
  if (typeof id !== "string" || !id.startsWith("live2d:")) return false;
  if (skin && typeof skin === "object" && skin.userModel) return false;
  return LIVE2D_SAMPLE_MODELS.includes(id.slice("live2d:".length).toLowerCase());
}

function sampleDisplayName(name) {
  const n = String(name || "");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

module.exports = {
  APP_NAME,
  DEFAULT_CHARACTER_SKIN,
  LIVE2D_SAMPLE_MODELS,
  LIVE2D_CREDIT,
  LIVE2D_CREDIT_SHORT,
  LIVE2D_CREDIT_VI,
  isLive2DSampleSkin,
  sampleDisplayName,
};
