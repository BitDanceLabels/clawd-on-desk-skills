// Preload for the JAVIS chat window (javis-desk://app). Exposes sign-in/status only —
// tokens (access, refresh, old device key) never cross into the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("javisDesk", {
  status: () => ipcRenderer.invoke("javis:status"),
  login: () => ipcRenderer.invoke("javis:login"),
  loginReopen: () => ipcRenderer.invoke("javis:login-reopen"),
  loginCancel: () => ipcRenderer.invoke("javis:login-cancel"),
  emailStart: (email) => ipcRenderer.invoke("javis:email-start", email),
  emailVerify: (code) => ipcRenderer.invoke("javis:email-verify", code),
  emailResend: () => ipcRenderer.invoke("javis:email-resend"),
  logout: () => ipcRenderer.invoke("javis:logout"),
  useKey: (key) => ipcRenderer.invoke("javis:use-key", key),
  setGateway: (url) => ipcRenderer.invoke("javis:set-gateway", url),
  onAuth: (cb) => ipcRenderer.on("javis:auth", (_e, s) => cb(s)),
  onShowView: (cb) => ipcRenderer.on("javis:show-view", (_e, v) => cb(v)),
});
