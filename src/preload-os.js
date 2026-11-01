// Preload for the JAVIS OS window (javis-desk://app/os.html). Narrow calls only; the
// device key / bearer never reaches the page.
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload));

contextBridge.exposeInMainWorld("javisOS", {
  info: () => ipcRenderer.invoke("os:info"),
  status: () => ipcRenderer.invoke("os:auth-status"),
  hide: () => ipcRenderer.send("os:hide"),
  minimize: () => ipcRenderer.send("os:minimize"),
  fullscreen: () => ipcRenderer.send("os:fullscreen"),
  quit: () => ipcRenderer.send("os:quit"),
  deskBoard: () => ipcRenderer.send("os:desk-board"),
  setUnread: (n) => ipcRenderer.send("os:unread", n),
  notify: (n) => ipcRenderer.invoke("os:notify", n),
  openExternal: (url) => ipcRenderer.invoke("os:open-external", url),
  transcribe: (base64Wav) => ipcRenderer.invoke("os:stt", { data: base64Wav }),
  onCommand: on("os:command"),
  onFocus: on("os:focus"),
  onAuth: on("os:auth"),
});
