const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getHistory: () => ipcRenderer.invoke('get-history'),
  getContinuousState: () => ipcRenderer.invoke('get-continuous-state'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  recopy: (item) => ipcRenderer.send('recopy', item),
  setContinuousMode: (enabled) => ipcRenderer.send('set-continuous-mode', enabled),
  flushContinuousBuffer: () => ipcRenderer.send('flush-continuous-buffer'),
  clearHistory: () => ipcRenderer.send('clear-history'),
  deleteItem: (ts) => ipcRenderer.send('delete-item', ts),
  reorderHistory: (newOrder) => ipcRenderer.send('reorder-history', newOrder),
  saveSettings: (s) => ipcRenderer.send('save-settings', s),
  pickExportDir: () => ipcRenderer.invoke('pick-export-dir'),
  saveComposeMd: (opts) => ipcRenderer.invoke('save-compose-md', opts),
  writeClipboard: (text) => ipcRenderer.send('write-clipboard', text),
  fetchBibtex: (text) => ipcRenderer.invoke('fetch-bibtex', text),
  saveBibFile: (content) => ipcRenderer.invoke('save-bib-file', content),
  quitApp: () => ipcRenderer.send('quit-app'),
  setTrayIcon: (dataUrl) => ipcRenderer.send('set-tray-icon', dataUrl),
  onHistoryUpdate: (cb) => ipcRenderer.on('history-update', (_, data) => cb(data)),
  onContinuousBuffer: (cb) => ipcRenderer.on('continuous-buffer', (_, data) => cb(data)),
})
