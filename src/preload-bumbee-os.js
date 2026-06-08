"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bumbeeOsAPI", {
  status: () => ipcRenderer.invoke("bumbee-os:status"),
  list: () => ipcRenderer.invoke("bumbee-os:list"),
  seedDemo: () => ipcRenderer.invoke("bumbee-os:seed-demo"),
  addWorkItem: (payload) => ipcRenderer.invoke("bumbee-os:add-work-item", payload),
  addIdeaNote: (payload) => ipcRenderer.invoke("bumbee-os:add-idea-note", payload),
  buildDailyDigest: (payload) => ipcRenderer.invoke("bumbee-os:build-daily-digest", payload),
  companionChat: (payload) => ipcRenderer.invoke("bumbee-os:companion-chat", payload),
  addClip: (payload) => ipcRenderer.invoke("bumbee-os:add-clip", payload),
  addVocabulary: (payload) => ipcRenderer.invoke("bumbee-os:add-vocabulary", payload),
  addUserProfile: (payload) => ipcRenderer.invoke("bumbee-os:add-user-profile", payload),
  addPublisherProfile: (payload) => ipcRenderer.invoke("bumbee-os:add-publisher-profile", payload),
  queueAction: (payload) => ipcRenderer.invoke("bumbee-os:queue-action", payload),
  createSepayPaymentIntent: (payload) => ipcRenderer.invoke("bumbee-os:create-sepay-payment-intent", payload),
  recordSepayNotification: (payload) => ipcRenderer.invoke("bumbee-os:record-sepay-notification", payload),
  exportSqlDump: () => ipcRenderer.invoke("bumbee-os:export-sql-dump"),
  updateSettings: (payload) => ipcRenderer.invoke("bumbee-os:update-settings", payload),
  gatewayStatus: () => ipcRenderer.invoke("bumbee-chat:status"),
  wikiStatus: () => ipcRenderer.invoke("bumbee-wiki:status"),
  openVocab: () => ipcRenderer.invoke("phase:open-vocab"),
  openVision: () => ipcRenderer.invoke("phase:open-vision"),
});
