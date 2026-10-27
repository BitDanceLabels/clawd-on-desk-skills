// Preload for the JAVIS desk window (javis-desk://app). The device key never
// crosses into the renderer; the page only gets these narrow calls.
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload));

contextBridge.exposeInMainWorld("javisDesk", {
  // pairing / gateway
  status: () => ipcRenderer.invoke("javis:status"),
  setGateway: (url) => ipcRenderer.invoke("javis:set-gateway", url),
  pairStart: () => ipcRenderer.invoke("javis:pair-start"),
  pairCancel: () => ipcRenderer.invoke("javis:pair-cancel"),
  pairOpenBrowser: (url) => ipcRenderer.invoke("javis:pair-open-browser", url),
  pairPasteKey: (key) => ipcRenderer.invoke("javis:pair-paste-key", key),
  unpair: () => ipcRenderer.invoke("javis:unpair"),
  onPairUpdate: on("javis:pair-update"),
  onAuthError: on("javis:auth-error"),
  onAuth: on("javis:auth"),

  // window
  info: () => ipcRenderer.invoke("desk:info"),
  setMode: (mode) => ipcRenderer.invoke("desk:set-mode", mode),
  setInteractive: (on) => ipcRenderer.send("desk:set-interactive", !!on),
  moveBy: (dx, dy) => ipcRenderer.send("desk:move-by", dx, dy),
  moveEnd: () => ipcRenderer.send("desk:move-end"),
  showMenu: () => ipcRenderer.send("desk:menu"),
  openUrl: (url) => ipcRenderer.invoke("desk:open-url", url),
  setPrefs: (patch) => ipcRenderer.invoke("desk:set-prefs", patch),
  onLayout: on("desk:layout"),
  onCommand: on("desk:command"),
  onPrefs: on("desk:prefs"),
  // true while the owner is typing / moving the mouse (automatic bubbles wait)
  userBusy: () => ipcRenderer.invoke("desk:user-busy"),

  // voice
  transcribe: (base64Wav) => ipcRenderer.invoke("desk:stt", { data: base64Wav }),

  // local AI sessions (Claude Code / Codex hooks)
  sessions: () => ipcRenderer.invoke("desk:sessions"),
  decide: (id, behavior) => ipcRenderer.invoke("desk:decide", id, behavior),
  onSessions: on("desk:sessions"),
  onSessionNotice: on("desk:session-notice"),
  onPermission: on("desk:permission"),
  onPermissionGone: on("desk:permission-gone"),
});
