const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,

  openFile:      ()              => ipcRenderer.invoke('open-file'),
  saveFile:      (args)          => ipcRenderer.invoke('save-file', args),
  saveFileAs:    (args)          => ipcRenderer.invoke('save-file-as', args),
  newFile:       ()              => ipcRenderer.invoke('new-file'),
  readFile:      (filePath)      => ipcRenderer.invoke('read-file', filePath),
  browseDirectory: ()            => ipcRenderer.invoke('browse-directory'),
  scanDirectory: (dirPath)       => ipcRenderer.invoke('scan-directory', dirPath),
  scanSkills:    (paths)         => ipcRenderer.invoke('scan-skills', paths),
  loadSettings:  ()              => ipcRenderer.invoke('load-settings'),
  saveSettings:  (settings)      => ipcRenderer.invoke('save-settings', settings),
  minimize:      ()              => ipcRenderer.invoke('minimize'),
  maximize:      ()              => ipcRenderer.invoke('maximize'),
  close:         ()              => ipcRenderer.invoke('close'),
  copyToClipboard:   (text)      => ipcRenderer.invoke('copy-to-clipboard', text),
  readFromClipboard: ()          => ipcRenderer.invoke('read-from-clipboard'),

  onMenuAction: (cb) => ipcRenderer.on('menu-action', (_e, action) => cb(action)),
})
