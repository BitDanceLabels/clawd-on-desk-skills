// src/preload-vocab-profile.js — contextBridge cho cửa sổ Hồ sơ đam mê
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bumbeeProfile", {
  get: () => ipcRenderer.invoke("vocab-profile:get"),
  save: (profile) => ipcRenderer.invoke("vocab-profile:save", profile || {}),
  curate: () => ipcRenderer.invoke("vocab-profile:curate"),
  close: () => ipcRenderer.invoke("vocab-profile:close"),
});
