const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clawdRabbit", {
  onShow: (cb) => ipcRenderer.on("rabbit-show", (_e, payload) => cb(payload)),
  requestClose: () => ipcRenderer.send("rabbit-close"),
});
