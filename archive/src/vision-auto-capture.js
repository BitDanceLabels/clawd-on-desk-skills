// src/vision-auto-capture.js — Smart Vision Assistant
// Periodic screen capture + cursor dwell analysis + AI context for chat
const { desktopCapturer } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

module.exports = function initVisionAutoCapture(ctx) {
  let captureTimer = null;
  let captureCount = 0;
  let lastCaptureTime = null;
  let intervalMs = 30000;
  let lastScreenContext = null;
  let dwellHistory = [];
  const MAX_DWELL_HISTORY = 20;

  function getInboxPath() {
    const studioDir = ctx.getStudioFolder?.() || path.join(os.homedir(), "Bumbee", "bumbee-wiki-studio");
    const today = new Date().toISOString().slice(0, 10);
    const dir = path.join(studioDir, "content-inbox");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${today}.json`);
  }

  function readInbox(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
  }

  function appendToInbox(entry) {
    const fp = getInboxPath();
    let data = readInbox(fp);
    if (Array.isArray(data)) {
      data.push(entry);
    } else if (data && Array.isArray(data.items)) {
      data.items.push(entry);
    } else {
      data = { date: new Date().toISOString().slice(0, 10), items: [entry] };
    }
    fs.writeFileSync(fp, JSON.stringify(data, null, 2));
  }

  async function captureScreen() {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1920, height: 1080 },
      });
      if (!sources.length) return null;
      const primary = sources[0];
      return {
        base64: primary.thumbnail.toDataURL(),
        nativeImage: primary.thumbnail,
        displayId: primary.display_id,
        name: primary.name,
      };
    } catch (err) {
      console.warn("[vision-capture] screen capture failed:", err.message);
      return null;
    }
  }

  function cropAroundDwell(nativeImage, dwell, cropSize = 600) {
    if (!nativeImage || !dwell) return null;
    try {
      const size = nativeImage.getSize();
      const scale = size.width / (ctx.screenWidth?.() || 1920);
      const cx = Math.round(dwell.x * scale);
      const cy = Math.round(dwell.y * scale);
      const half = Math.round(cropSize * scale / 2);
      const x = Math.max(0, Math.min(cx - half, size.width - half * 2));
      const y = Math.max(0, Math.min(cy - half, size.height - half * 2));
      const w = Math.min(half * 2, size.width - x);
      const h = Math.min(half * 2, size.height - y);
      const cropped = nativeImage.crop({ x, y, width: w, height: h });
      return cropped.toDataURL();
    } catch {
      return null;
    }
  }

  function getActiveWindowTitle() {
    if (ctx.getActiveWindowTitle) return ctx.getActiveWindowTitle();
    return null;
  }

  async function runCaptureCycle() {
    const screenshot = await captureScreen();
    const dwell = ctx.getDwellInfo?.() || null;
    const windowTitle = getActiveWindowTitle();
    const dwellCrop = screenshot && dwell ? cropAroundDwell(screenshot.nativeImage, dwell) : null;

    const entry = {
      type: "vision_auto_capture",
      timestamp: new Date().toISOString(),
      windowTitle,
      dwell: dwell ? { x: dwell.x, y: dwell.y, durationMs: dwell.durationMs } : null,
      hasDwellCrop: !!dwellCrop,
      hasScreenshot: !!screenshot,
    };

    if (dwell && dwell.durationMs > 3000) {
      dwellHistory.push({
        timestamp: entry.timestamp,
        x: dwell.x, y: dwell.y,
        durationMs: dwell.durationMs,
        windowTitle,
      });
      if (dwellHistory.length > MAX_DWELL_HISTORY) dwellHistory.shift();
    }

    if (ctx.runGatewaySkill && screenshot) {
      try {
        const imageToAnalyze = dwellCrop || screenshot.base64;
        const result = await ctx.runGatewaySkill("activity_digest", {
          screenshot_base64: imageToAnalyze,
          full_screen_base64: screenshot.base64,
          cursor_dwell: dwell,
          window_title: windowTitle,
          capture_time: entry.timestamp,
          instruction: "Analyze what the user is looking at. Identify: active app, content type, key text/code visible near cursor, what the user might be working on. Reply in Vietnamese.",
        });
        if (result?.ok && result.execution?.response) {
          entry.aiAnalysis = result.execution.response;
        }
      } catch {}
    }

    lastScreenContext = {
      timestamp: entry.timestamp,
      windowTitle,
      dwell,
      dwellCropBase64: dwellCrop,
      fullScreenBase64: screenshot?.base64 || null,
      aiAnalysis: entry.aiAnalysis || null,
      recentDwells: dwellHistory.slice(-5),
    };

    appendToInbox(entry);
    captureCount++;
    lastCaptureTime = entry.timestamp;

    if (ctx.onCaptureComplete) ctx.onCaptureComplete(lastScreenContext);
  }

  function getScreenContext() {
    return lastScreenContext;
  }

  function getDwellSummary() {
    if (!dwellHistory.length) return "Chưa có dữ liệu cursor tracking.";
    const recent = dwellHistory.slice(-5);
    return recent.map(d =>
      `[${d.timestamp.slice(11, 19)}] Dừng ${Math.round(d.durationMs / 1000)}s tại (${d.x},${d.y})${d.windowTitle ? ` trong "${d.windowTitle}"` : ""}`
    ).join("\n");
  }

  async function captureNow() {
    await runCaptureCycle();
    return lastScreenContext;
  }

  function start(opts = {}) {
    if (captureTimer) return;
    intervalMs = opts.intervalMs || intervalMs;
    captureTimer = setInterval(runCaptureCycle, intervalMs);
    runCaptureCycle();
  }

  function stop() {
    if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
  }

  function isRunning() { return !!captureTimer; }

  function stats() {
    return {
      running: isRunning(), captureCount, lastCaptureTime, intervalMs,
      dwellHistoryCount: dwellHistory.length,
      lastWindowTitle: lastScreenContext?.windowTitle || null,
      hasScreenContext: !!lastScreenContext,
    };
  }

  function cleanup() { stop(); }

  return { start, stop, isRunning, stats, cleanup, getScreenContext, getDwellSummary, captureNow };
};
