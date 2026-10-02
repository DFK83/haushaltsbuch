'use strict';
/* Sichere Brücke zwischen Renderer (index.html) und Node-Dateizugriff.
   Stellt window.hbNative bereit, wenn die App in Electron läuft. */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hbNative', {
  load: () => ipcRenderer.invoke('hb-load'),
  save: (text) => ipcRenderer.invoke('hb-save', text),
  path: () => ipcRenderer.invoke('hb-path'),
  // JSON-Datenbank exportieren/importieren
  exportJson: (text) => ipcRenderer.invoke('hb-export', text),
  importJson: () => ipcRenderer.invoke('hb-import'),
  // In-App-Update
  updateCheck: () => ipcRenderer.invoke('hb-update-check'),
  updateInstall: () => ipcRenderer.invoke('hb-update-install'),
  onUpdate: (cb) => ipcRenderer.on('hb-update', (_e, payload) => cb(payload))
});
