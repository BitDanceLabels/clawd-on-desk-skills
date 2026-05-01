const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bumbeeChat", {
  send: (payload) => ipcRenderer.invoke("bumbee-chat:send", payload),
  activity: (payload) => ipcRenderer.send("bumbee-chat:activity", payload),
  status: () => ipcRenderer.invoke("bumbee-chat:status"),
  sessions: () => ipcRenderer.invoke("bumbee-chat:sessions"),
});
