const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sceneAPI", {
  loadScene: (configPath) => ipcRenderer.invoke("scene:load-config", configPath),
  navigateToCheckpoint: (cpId) => ipcRenderer.invoke("scene:navigate-checkpoint", cpId),
  spawnCharacter: (vrmPath) => ipcRenderer.invoke("scene:spawn-character", vrmPath),
  getSceneList: () => ipcRenderer.invoke("scene:list"),
});
