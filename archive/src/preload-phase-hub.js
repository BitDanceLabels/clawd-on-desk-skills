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

  // Gateway Live Execution
  gatewayExecuteLive: (payload) => ipcRenderer.invoke('gateway:execute-live', payload),
  executionHistory: () => ipcRenderer.invoke('bumbee-studio:execution-history'),

  // Vision Auto-Capture
  visionStartCapture: (opts) => ipcRenderer.invoke('vision:start-capture', opts),
  visionStopCapture: () => ipcRenderer.invoke('vision:stop-capture'),
  visionStatus: () => ipcRenderer.invoke('vision:status'),

  // Business Ops Pipeline
  pipelineStatus: (date) => ipcRenderer.invoke('pipeline:status', date),
  pipelineRunStep: (step, date) => ipcRenderer.invoke('pipeline:run-step', { step, date }),
  pipelineRunFull: (date) => ipcRenderer.invoke('pipeline:run-full', date),
  pipelineApprove: (date, reason) => ipcRenderer.invoke('pipeline:approve', { date, reason }),
  pipelineReject: (date, reason) => ipcRenderer.invoke('pipeline:reject', { date, reason }),

  // Scene Viewer
  openSceneViewer: () => ipcRenderer.invoke('scene:open-viewer'),
  sceneList: () => ipcRenderer.invoke('scene:list'),
});
