const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  checkForUpdate: () => ipcRenderer.invoke('check-update'),
  /** Raise a real Windows toast. Fire-and-forget by design. */
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  setBadge: (count) => ipcRenderer.send('badge', count),
  platform: process.platform,
});