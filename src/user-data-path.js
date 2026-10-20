// JAVIS keeps using the userData folder of the old "Clawd on Desk / Bumbee On Desk"
// app, so prefs (clawd-prefs.json), vocab (bumbee-english-vocab.json), chat history,
// cookies and localStorage survive the rename and in-place update.
//
// Electron derives userData from the package name; renaming the product to "JAVIS"
// would otherwise move it to <appData>/JAVIS and the user would start from zero.
// Must run before app "ready" and before anything calls app.getPath("userData").

const path = require("path");
const fs = require("fs");

const LEGACY_USER_DATA_DIR = "clawd-on-desk";
// Very old builds could have used the product name as folder; only used if it
// holds prefs and the canonical folder does not exist yet.
const LEGACY_ALT_DIRS = ["Clawd on Desk"];
const PREFS_FILE = "clawd-prefs.json";

function resolveUserDataPath(appDataDir, fsImpl = fs) {
  const primary = path.join(appDataDir, LEGACY_USER_DATA_DIR);
  if (fsImpl.existsSync(primary)) return primary;
  for (const name of LEGACY_ALT_DIRS) {
    const alt = path.join(appDataDir, name);
    if (fsImpl.existsSync(path.join(alt, PREFS_FILE))) return alt;
  }
  return primary;
}

function pinUserDataPath(app) {
  if (process.env.CLAWD_USER_DATA_DIR) {
    app.setPath("userData", process.env.CLAWD_USER_DATA_DIR);
    return process.env.CLAWD_USER_DATA_DIR;
  }
  const target = resolveUserDataPath(app.getPath("appData"));
  app.setPath("userData", target);
  return target;
}

module.exports = { pinUserDataPath, resolveUserDataPath, LEGACY_USER_DATA_DIR };
