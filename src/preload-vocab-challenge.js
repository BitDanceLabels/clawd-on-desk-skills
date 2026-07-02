// src/preload-vocab-challenge.js — contextBridge for the auto-pop vocab challenge popup
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bumbeeChallenge", {
  next: (opts) => ipcRenderer.invoke("vocab-challenge:next", opts || {}),
  answer: (payload) => ipcRenderer.invoke("vocab-challenge:answer", payload || {}),
  snooze: (minutes) => ipcRenderer.invoke("vocab-challenge:snooze", minutes),
  close: () => ipcRenderer.invoke("vocab-challenge:close"),
  getConfig: () => ipcRenderer.invoke("vocab-challenge:get-config"),
  setConfig: (cfg) => ipcRenderer.invoke("vocab-challenge:set-config", cfg || {}),
  // main asks the popup to reload the current round (e.g. after scheduler re-show)
  onRefresh: (cb) => ipcRenderer.on("challenge-refresh", () => { try { cb(); } catch {} }),
});
