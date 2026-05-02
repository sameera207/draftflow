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

  findProjectRoot: (filePath) => ipcRenderer.invoke('find-project-root', filePath),
  scanProjectTree: (root)     => ipcRenderer.invoke('scan-project-tree', root),

  countTokens:   (text) => ipcRenderer.invoke('count-tokens', text),
  readScratch:   ()      => ipcRenderer.invoke('read-scratch'),
  writeScratch:  (content) => ipcRenderer.invoke('write-scratch', content),
  saveScratchAs: (args)  => ipcRenderer.invoke('save-scratch-as', args),

  onMenuAction:      (cb) => ipcRenderer.on('menu-action',      (_e, action) => cb(action)),
  onBridgeOpen:      (cb) => ipcRenderer.on('bridge-open',      (_e, data)   => cb(data)),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_e, data) => cb(data)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_e, pct)  => cb(pct)),
  onDownloadDone:     (cb) => ipcRenderer.on('download-done',     ()         => cb()),
  onDownloadError:    (cb) => ipcRenderer.on('download-error',    (_e, msg)  => cb(msg)),
  openUrl:            (url)          => ipcRenderer.invoke('open-url', url),
  startDownload:      (downloadUrl, version) => ipcRenderer.invoke('start-download', { downloadUrl, version }),
  sendBack:       (content) => ipcRenderer.invoke('send-back', content),
  installDfCommand:   () => ipcRenderer.invoke('install-df-command'),
  dfCommandInstalled: () => ipcRenderer.invoke('df-command-installed'),
  suggestSkills:    (data)      => ipcRenderer.invoke('suggest-skills', data),
  readSkillContent: (skillPath) => ipcRenderer.invoke('read-skill-content', skillPath),
})
