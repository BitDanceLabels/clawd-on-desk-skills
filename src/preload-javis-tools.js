// Preload for the 0.12.0 tool windows (Việc chờ anh, Thư ký, AI Clipboard) on javis-desk://app.
// Only these calls cross into the page; tokens (sign-in, clipboard key) stay in main.
const { contextBridge, ipcRenderer } = require("electron");

const call = (ch) => (...args) => ipcRenderer.invoke(`javis-tools:${ch}`, ...args);
const on = (ch) => (cb) => ipcRenderer.on(`javis-tools:${ch}`, (_e, v) => cb(v));

contextBridge.exposeInMainWorld("javisTools", {
  inboxGet: call("inbox-get"),
  inboxRefresh: call("inbox-refresh"),
  onInbox: on("inbox"),
  openWeb: call("open-web"),
  login: call("login"),
  reportGet: call("report-get"),
  reportRead: call("report-read"),
  reportStop: call("report-stop"),
  onReport: on("report"),
  onSpeech: on("speech"),
  clipStatus: call("clip-status"),
  clipCreate: call("clip-create"),
  clipLink: call("clip-link"),
  clipSend: call("clip-send"),
  clipRecent: call("clip-recent"),
  clipReadSystem: call("clip-read-system"),
  clipCopy: call("clip-copy"),
  clipOpenWeb: call("clip-open-web"),
  onClipChanged: on("clip-changed"),
});
