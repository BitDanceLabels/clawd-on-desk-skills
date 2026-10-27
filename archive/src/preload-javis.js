// Preload for the JAVIS chat window (javis-desk://app). Exposes pairing/status only —
// the device key itself never crosses into the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("javisDesk", {
  status: () => ipcRenderer.invoke("javis:status"),
  setGateway: (url) => ipcRenderer.invoke("javis:set-gateway", url),
  pairStart: () => ipcRenderer.invoke("javis:pair-start"),
  pairCancel: () => ipcRenderer.invoke("javis:pair-cancel"),
  pairOpenBrowser: (url) => ipcRenderer.invoke("javis:pair-open-browser", url),
  pairPasteKey: (key) => ipcRenderer.invoke("javis:pair-paste-key", key),
  unpair: () => ipcRenderer.invoke("javis:unpair"),
  onPairUpdate: (cb) => ipcRenderer.on("javis:pair-update", (_e, u) => cb(u)),
  onAuthError: (cb) => ipcRenderer.on("javis:auth-error", (_e, u) => cb(u)),
  onShowView: (cb) => ipcRenderer.on("javis:show-view", (_e, v) => cb(v)),
});
