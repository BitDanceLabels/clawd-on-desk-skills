'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bumbeePhaseAPI', {
  status: () => ipcRenderer.invoke('phase:status'),
  seedAll: () => ipcRenderer.invoke('phase:seed-all'),
  seedBusinessArtifacts: () => ipcRenderer.invoke('phase:seed-business-artifacts'),
  gatewayDryRun: () => ipcRenderer.invoke('phase:gateway-dry-run'),
  syncStudio: () => ipcRenderer.invoke('phase:sync-studio'),
  openDonate: () => ipcRenderer.invoke('phase:open-donate'),
  openDonationSettings: () => ipcRenderer.invoke('phase:open-donation-settings'),
  emitEvent: (payload) => ipcRenderer.invoke('phase:emit-event', payload),
  addManualActivity: (payload) => ipcRenderer.invoke('phase:manual-activity', payload),
  openVocab: () => ipcRenderer.invoke('phase:open-vocab'),
  openVision: () => ipcRenderer.invoke('phase:open-vision'),
});
