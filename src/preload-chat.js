const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bumbeeChat", {
  send: (payload) => ipcRenderer.invoke("bumbee-chat:send", payload),
  activity: (payload) => ipcRenderer.send("bumbee-chat:activity", payload),
  status: () => ipcRenderer.invoke("bumbee-chat:status"),
  sessions: () => ipcRenderer.invoke("bumbee-chat:sessions"),
  loginRequest: (payload) => ipcRenderer.invoke("bumbee-chat:login-request", payload),
  loginVerify: (payload) => ipcRenderer.invoke("bumbee-chat:login-verify", payload),
  logout: () => ipcRenderer.invoke("bumbee-chat:logout"),
});
