// Bumbee Vocab Tinder preload — exposes safe IPC to the renderer.
// Wire in main.js with: new BrowserWindow({ webPreferences: { preload: 'preload-vocab.js' } }).
//
// Renderer accesses: window.bumbeeVocabAPI.*  and  window.bumbeeSettingsAPI.*

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bumbeeVocabAPI', {
  extract: (text) => ipcRenderer.invoke('vocab:extract', text),
  recordSwipe: (swipe) => ipcRenderer.invoke('vocab:swipe', swipe),
  getReviewTasks: () => ipcRenderer.invoke('vocab:review-tasks'),
  gradeReview: (args) => ipcRenderer.invoke('vocab:grade', args),
  listLibrary: () => ipcRenderer.invoke('vocab:list'),
  openSettings: (section) => ipcRenderer.invoke('vocab:open-settings', section),
  openDonate: () => ipcRenderer.invoke('vocab:open-donate'),
});

contextBridge.exposeInMainWorld('bumbeeSettingsAPI', {
  loadDonationSettings: () => ipcRenderer.invoke('settings:donation:load'),
  saveDonationSettings: (payload) => ipcRenderer.invoke('settings:donation:save', payload),
});
