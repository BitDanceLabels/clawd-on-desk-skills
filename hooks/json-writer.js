// Shared JSON writer for hook installers (Claude / Gemini / Cursor settings).
// Backs up the existing file before every write, then writes atomically
// (temp file + rename) so a crash never leaves a half-written settings.json.

const fs = require("fs");
const path = require("path");

const BACKUP_TAG = "bak-javis";

function backupStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-`
    + `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

// Copy <file> to <file>.bak-javis-<YYYYMMDD-HHMMSS> (never overwrites an existing backup).
// Returns the backup path, or null when there was nothing to back up.
function backupFile(filePath, now = new Date()) {
  if (!fs.existsSync(filePath)) return null;
  let backupPath = `${filePath}.${BACKUP_TAG}-${backupStamp(now)}`;
  for (let i = 1; fs.existsSync(backupPath); i++) {
    backupPath = `${filePath}.${BACKUP_TAG}-${backupStamp(now)}-${i}`;
  }
  fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
  return backupPath;
}

function writeJsonAtomic(filePath, data, options = {}) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  fs.mkdirSync(dir, { recursive: true });
  if (options.backup !== false) backupFile(filePath, options.now);
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

module.exports = { writeJsonAtomic, backupFile, backupStamp, BACKUP_TAG };
