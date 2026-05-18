const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gatewayAPI", {
  onShowPayload: (cb) => ipcRenderer.on("gateway-show", (_, data) => cb(data)),
  decide: (approved) => ipcRenderer.send("gateway-decide", approved),
  reportHeight: (h) => ipcRenderer.send("gateway-confirm-height", h),
});
