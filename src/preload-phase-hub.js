'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bumbeePhaseAPI', {
  status: () => ipcRenderer.invoke('phase:status'),
  seedAll: () => ipcRenderer.invoke('phase:seed-all'),
  seedBusinessArtifacts: () => ipcRenderer.invoke('phase:seed-business-artifacts'),
  gatewayDryRun: () => ipcRenderer.invoke('phase:gateway-dry-run'),
  emitEvent: (payload) => ipcRenderer.invoke('phase:emit-event', payload),
  addManualActivity: (payload) => ipcRenderer.invoke('phase:manual-activity', payload),
  openVocab: () => ipcRenderer.invoke('phase:open-vocab'),
  openVision: () => ipcRenderer.invoke('phase:open-vision'),
});
