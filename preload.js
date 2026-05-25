const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getHistory: () => ipcRenderer.invoke('get-history'),
  getContinuousState: () => ipcRenderer.invoke('get-continuous-state'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  recopy: (item) => ipcRenderer.send('recopy', item),
  setContinuousMode: (enabled) => ipcRenderer.send('set-continuous-mode', enabled),
  flushContinuousBuffer: () => ipcRenderer.send('flush-continuous-buffer'),
  discardContinuousBuffer: () => ipcRenderer.send('discard-continuous-buffer'),
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
  openSpeechWindow: () => ipcRenderer.send('open-speech-window'),
  newSpeechWindow: (initData) => ipcRenderer.send('new-speech-window', initData),
  recognizeImage: (dataUrl) => ipcRenderer.invoke('recognize-image', dataUrl),
  ocrImage: (dataUrl) => ipcRenderer.invoke('ocr-image', dataUrl),
  aiAskImage: (dataUrl, question) => ipcRenderer.invoke('ai-ask-image', dataUrl, question),
  aiAskStream: (dataUrl, question) => ipcRenderer.send('ai-ask-stream', dataUrl, question),
  aiTextStream: (contextText, question) => ipcRenderer.send('ai-text-stream', contextText, question),
  aiMixedStream: (contentBlocks, question) => ipcRenderer.send('ai-mixed-stream', contentBlocks, question),
  aiAskAbort: () => ipcRenderer.send('ai-ask-abort'),
  onAiAskChunk: (cb) => ipcRenderer.on('ai-ask-chunk', (_, text) => cb(text)),
  onAiAskDone: (cb) => ipcRenderer.on('ai-ask-done', () => cb()),
  onAiAskError: (cb) => ipcRenderer.on('ai-ask-error', (_, msg) => cb(msg)),
  removeAiAskListeners: () => {
    ipcRenderer.removeAllListeners('ai-ask-chunk')
    ipcRenderer.removeAllListeners('ai-ask-done')
    ipcRenderer.removeAllListeners('ai-ask-error')
  },
  saveOcrResult: (ts, ocrText) => ipcRenderer.send('save-ocr-result', ts, ocrText),
  saveChatHistory: (ts, messages) => ipcRenderer.send('save-chat-history', ts, messages),
  exportAiMd: (text) => ipcRenderer.invoke('export-ai-md', text),
  setPreviewMode: (enabled) => ipcRenderer.send('set-preview-mode', enabled),
  openImageViewer: (data) => ipcRenderer.send('open-image-viewer', data),
  openImageFull: (dataUrl) => ipcRenderer.send('open-image-full', dataUrl),
  openTextChat: (data) => ipcRenderer.send('open-text-chat', data),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeAllAiWindows: () => ipcRenderer.send('close-all-ai-windows'),
  closeOtherAiWindows: () => ipcRenderer.send('close-other-ai-windows'),
  setAlwaysOnTop: (flag) => ipcRenderer.send('set-always-on-top', flag),
  showPreviewPopup: (data) => ipcRenderer.send('show-preview-popup', data),
  hidePreviewPopup: () => ipcRenderer.send('hide-preview-popup'),
  onHistoryUpdate: (cb) => ipcRenderer.on('history-update', (_, data) => cb(data)),
  onContinuousBuffer: (cb) => ipcRenderer.on('continuous-buffer', (_, data) => cb(data)),
})

contextBridge.exposeInMainWorld('speechApi', {
  startGenerate: (content, stylePrompt, refText) => ipcRenderer.send('claude-speech-stream', content, stylePrompt, refText),
  abort: () => ipcRenderer.send('claude-speech-abort'),
  onChunk: (cb) => ipcRenderer.on('speech-chunk', (_, text) => cb(text)),
  onDone: (cb) => ipcRenderer.on('speech-done', () => cb()),
  onError: (cb) => ipcRenderer.on('speech-error', (_, msg) => cb(msg)),
  removeListeners: () => {
    ipcRenderer.removeAllListeners('speech-chunk')
    ipcRenderer.removeAllListeners('speech-done')
    ipcRenderer.removeAllListeners('speech-error')
  },
  newWindow: (initData) => ipcRenderer.send('new-speech-window', initData),
  setCollapsed: (collapsed) => ipcRenderer.send('speech-set-collapsed', collapsed),
  close: () => ipcRenderer.send('close-speech-window'),
})
