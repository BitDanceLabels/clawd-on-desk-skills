// src/preload-vocab-profile.js — contextBridge cho cửa sổ Hồ sơ đam mê
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("bumbeeProfile", {
  get: () => ipcRenderer.invoke("vocab-profile:get"),
  save: (profile) => ipcRenderer.invoke("vocab-profile:save", profile || {}),
  curate: () => ipcRenderer.invoke("vocab-profile:curate"),
  close: () => ipcRenderer.invoke("vocab-profile:close"),
  pickFile: () => ipcRenderer.invoke("vocab-profile:pick-file"),
  onRefresh: (cb) => ipcRenderer.on("profile-refresh", () => { try { cb(); } catch {} }),
  connectMisskey: (token) => ipcRenderer.invoke("vocab-profile:connect-misskey", token),
  // File kéo-thả: Electron mới bỏ file.path — phải lấy qua webUtils trong preload
  attachDropped: (file) => {
    try {
      const p = webUtils.getPathForFile(file);
      return ipcRenderer.invoke("vocab-profile:attach-path", p);
    } catch (e) {
      return Promise.resolve({ ok: false, reason: "Không lấy được đường dẫn file" });
    }
  },
});
