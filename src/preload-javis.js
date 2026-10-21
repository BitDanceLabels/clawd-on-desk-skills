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
  onShowTab: (cb) => ipcRenderer.on("javis:show-tab", (_e, v) => cb(v)),
  // 401/403 on chat = the server does not let this machine chat yet (Home shows one plain line).
  onChatHealth: (cb) => ipcRenderer.on("javis:chat-health", (_e, v) => cb(v)),
});

// Trang chủ JAVIS: the same tool calls as the tool windows (preload-javis-tools.js) — sandboxed
// preloads cannot require a shared file, so the list is repeated here. No token crosses.
const call = (ch) => (...args) => ipcRenderer.invoke(`javis-tools:${ch}`, ...args);
const on = (ch) => (cb) => ipcRenderer.on(`javis-tools:${ch}`, (_e, v) => cb(v));
contextBridge.exposeInMainWorld("javisTools", {
  inboxGet: call("inbox-get"),
  inboxRefresh: call("inbox-refresh"),
  onInbox: on("inbox"),
  openWeb: call("open-web"),
  reportGet: call("report-get"),
  reportFetch: call("report-fetch"),
  reportRead: call("report-read"),
  reportStop: call("report-stop"),
  onReport: on("report"),
  onSpeech: on("speech"),
  clipStatus: call("clip-status"),
  clipSend: call("clip-send"),
  clipRecent: call("clip-recent"),
  clipReadSystem: call("clip-read-system"),
  clipCopy: call("clip-copy"),
  onClipChanged: on("clip-changed"),
});

// Local-only Home data (no gateway): vocab due count, hook-tracked sessions, open windows/pages.
const home = (ch) => (...args) => ipcRenderer.invoke(`javis-home:${ch}`, ...args);
contextBridge.exposeInMainWorld("javisHome", {
  vocab: home("vocab"),
  openVocab: home("open-vocab"),
  sessions: home("sessions"),
  focusSession: home("focus-session"),
  webPages: home("web-pages"),
  openWebPage: home("open-web-page"),
  openTool: home("open-tool"),
});
