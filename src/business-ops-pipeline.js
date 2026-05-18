// src/business-ops-pipeline.js — Orchestrates B0→B2→B3.5→B4→B6.5 content pipeline
const fs = require("fs");
const path = require("path");

const STEPS = ["B0", "B2", "B3_5", "B4", "B6_5"];

const STEP_META = {
  B0:   { name: "Idea Engine",         skill: "idea_engine",          file: "B0-idea-engine.md" },
  B2:   { name: "Demo Video Factory",  skill: "demo_video_factory",   file: "B2-demo-video-factory.request.json" },
  B3_5: { name: "Human Review Gate",   skill: null,                   file: "B3_5-human-review-gate.json" },
  B4:   { name: "Manual TikTok Tray",  skill: null,                   file: "B4-manual-tiktok-tray.md" },
  B6_5: { name: "Performance Analyzer", skill: "performance_analyzer", file: "B6_5-performance-analyzer.md" },
};

function today() { return new Date().toISOString().slice(0, 10); }

function opsDir(studioRoot, date) {
  return path.join(studioRoot, "business-ops", date || today());
}

function readJson(fp, fallback) {
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return fallback; }
}

function readText(fp) {
  try { return fs.readFileSync(fp, "utf8"); } catch { return ""; }
}

function writeJson(fp, data) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));
}

function writeText(fp, text) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, text);
}

function getStepStatus(studioRoot, date) {
  const dir = opsDir(studioRoot, date);
  const statuses = {};
  for (const step of STEPS) {
    const meta = STEP_META[step];
    const fp = path.join(dir, meta.file);
    if (!fs.existsSync(fp)) {
      statuses[step] = { status: "pending", name: meta.name };
      continue;
    }
    if (step === "B3_5") {
      const data = readJson(fp, {});
      statuses[step] = {
        status: data.status === "approved" ? "done" : data.status === "rejected" ? "rejected" : "blocked",
        name: meta.name, data,
      };
    } else if (meta.file.endsWith(".json")) {
      const data = readJson(fp, {});
      statuses[step] = {
        status: data.status === "executed" ? "done" : data.status === "failed" ? "failed" : "ready",
        name: meta.name, data,
      };
    } else {
      const content = readText(fp);
      const hasResult = content.includes("## Result") || content.includes("## Verdict");
      statuses[step] = { status: hasResult ? "done" : "ready", name: meta.name };
    }
  }
  return statuses;
}

async function runStep(studioRoot, step, ctx, date) {
  const meta = STEP_META[step];
  if (!meta) return { ok: false, error: `Unknown step: ${step}` };
  const dir = opsDir(studioRoot, date);
  fs.mkdirSync(dir, { recursive: true });

  if (step === "B3_5") {
    return { ok: false, needsHumanReview: true, message: "B3.5 requires human approval. Use approvePipeline() to approve." };
  }

  if (step === "B4") {
    const b35 = readJson(path.join(dir, "B3_5-human-review-gate.json"), {});
    if (b35.status !== "approved") return { ok: false, error: "B3.5 not approved yet" };
    const ideaContent = readText(path.join(dir, "B0-idea-engine.md"));
    const scripts = ideaContent.match(/^\d+\..+$/gm) || [];
    const caption = scripts[0] || "Học tiếng Anh mỗi ngày cùng Bumbee #hoctienganh #solofounder #bumbee";
    const tray = [
      "# B4 Manual TikTok Tray", "",
      "## Caption", "", caption, "",
      "## Assets", "",
      "- [ ] Screen recording of Vocab Tinder", "- [ ] B-roll from gateway", "- [ ] Thumbnail", "",
      "## Post Rule", "", "Manual post only. Founder reviews and posts to TikTok.", "",
    ].join("\n");
    writeText(path.join(dir, meta.file), tray);
    return { ok: true, step, status: "ready" };
  }

  if (!meta.skill) return { ok: false, error: `Step ${step} has no gateway skill` };
  if (!ctx.runGatewaySkill) return { ok: false, error: "Gateway execution not available" };

  let inputData = {};
  if (step === "B0") {
    inputData = {
      project: "bumbee-vocab-tinder",
      mode: "draft_scripts",
      prompt: "Generate 3 short-form video scripts about Vocab Tinder for TikTok. Vietnamese audience, solo founder angle.",
    };
  } else if (step === "B2") {
    const ideaContent = readText(path.join(dir, "B0-idea-engine.md"));
    inputData = {
      script_content: ideaContent,
      render_mode: "manual_screen_record_plus_gateway_broll",
      prompt: "Create a vertical Vocab Tinder demo package from the approved scripts.",
    };
  } else if (step === "B6_5") {
    const metricsContent = readText(path.join(dir, meta.file));
    inputData = {
      metrics_raw: metricsContent,
      prompt: "Analyze performance metrics. Verdict: hot/mid/flop, why, next action.",
    };
  }

  const result = await ctx.runGatewaySkill(meta.skill, inputData);
  if (result?.ok && result.execution?.response) {
    const response = result.execution.response;
    if (meta.file.endsWith(".json")) {
      const existing = readJson(path.join(dir, meta.file), {});
      existing.status = "executed";
      existing.result = response;
      existing.executed_at = new Date().toISOString();
      writeJson(path.join(dir, meta.file), existing);
    } else {
      const existing = readText(path.join(dir, meta.file));
      const resultSection = `\n\n## Result\n\n${typeof response === "string" ? response : JSON.stringify(response, null, 2)}\n\nExecuted: ${new Date().toISOString()}\n`;
      writeText(path.join(dir, meta.file), existing + resultSection);
    }
    return { ok: true, step, status: "done", response };
  }
  return { ok: false, step, error: result?.error || "Gateway execution failed", result };
}

function approvePipeline(studioRoot, date, reason) {
  const fp = path.join(opsDir(studioRoot, date), "B3_5-human-review-gate.json");
  const data = readJson(fp, { status: "waiting_human_review" });
  data.status = "approved";
  data.approved_at = new Date().toISOString();
  data.approved_by = "founder";
  data.reason = reason || "Manual approval from Bumbee Phase Hub";
  writeJson(fp, data);
  return { ok: true, status: "approved" };
}

function rejectPipeline(studioRoot, date, reason) {
  const fp = path.join(opsDir(studioRoot, date), "B3_5-human-review-gate.json");
  const data = readJson(fp, { status: "waiting_human_review" });
  data.status = "rejected";
  data.rejected_at = new Date().toISOString();
  data.reason = reason || "Rejected by founder";
  writeJson(fp, data);
  return { ok: true, status: "rejected" };
}

async function runFullPipeline(studioRoot, ctx, date) {
  date = date || today();
  const results = {};
  for (const step of STEPS) {
    const stepStatus = getStepStatus(studioRoot, date);
    if (stepStatus[step]?.status === "done") {
      results[step] = { ok: true, skipped: true, reason: "already done" };
      continue;
    }
    if (step === "B3_5") {
      const data = readJson(path.join(opsDir(studioRoot, date), "B3_5-human-review-gate.json"), {});
      if (data.status !== "approved") {
        results[step] = { ok: false, blocked: true, message: "Waiting for human approval" };
        break;
      }
      results[step] = { ok: true, status: "approved" };
      continue;
    }
    const result = await runStep(studioRoot, step, ctx, date);
    results[step] = result;
    if (!result.ok) break;
  }
  return { ok: true, date, steps: results };
}

module.exports = {
  STEPS, STEP_META,
  getStepStatus, runStep, runFullPipeline,
  approvePipeline, rejectPipeline,
};
