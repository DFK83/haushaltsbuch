'use strict';
/* Sichere Brücke zwischen Renderer (index.html) und Node-Dateizugriff.
   Stellt window.hbNative bereit, wenn die App in Electron läuft. */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hbNative', {
  load: () => ipcRenderer.invoke('hb-load'),
  save: (text) => ipcRenderer.invoke('hb-save', text),
  path: () => ipcRenderer.invoke('hb-path')
});
