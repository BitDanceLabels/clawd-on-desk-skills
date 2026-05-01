const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bumbeeChat", {
  send: (payload) => ipcRenderer.invoke("bumbee-chat:send", payload),
  status: () => ipcRenderer.invoke("bumbee-chat:status"),
  sessions: () => ipcRenderer.invoke("bumbee-chat:sessions"),
});
