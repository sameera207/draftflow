const { app, BrowserWindow, ipcMain, dialog, Menu, clipboard } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'Edit', submenu: [
    { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
    { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
  ]},
]))

let mainWindow
let settings = {}

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

// ── Settings ──────────────────────────────────────────────────────────────────

function loadSettings () {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
    }
  } catch (_) { settings = {} }
  if (!settings.skillPaths)  settings.skillPaths  = [{ path: '~/.claude', tag: 'claude' }]
  if (!settings.recentFiles) settings.recentFiles = []
  return settings
}

function persistSettings (s) {
  settings = s
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8')
  } catch (_) {}
  return true
}

function addRecentFile (filePath) {
  if (!settings.recentFiles) settings.recentFiles = []
  settings.recentFiles = [
    filePath,
    ...settings.recentFiles.filter(f => f !== filePath)
  ].slice(0, 10)
  settings.lastOpenFile = filePath
  persistSettings(settings)
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function expandPath (p) {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
}

// ── Skill scanning ────────────────────────────────────────────────────────────

function scanSkillPaths (paths) {
  const skills = [], agents = [], seen = new Set()
  for (const entry of paths) {
    try {
      walkDir(expandPath(entry.path), 0, 8, skills, agents, seen, entry.tag)
    } catch (_) {}
  }
  return { skills, agents }
}

function walkDir (dir, depth, maxDepth, skills, agents, seen, tag) {
  if (depth > maxDepth) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (_) { return }

  for (const ent of entries) {
    const isDir = ent.isDirectory() || (ent.isSymbolicLink() && (() => {
      try { return fs.statSync(path.join(dir, ent.name)).isDirectory() } catch (_) { return false }
    })())
    if (!isDir) continue
    const fullPath = path.join(dir, ent.name)
    let name = ent.name

    // Parse SKILL.md front matter for name and description
    const skillMd = path.join(fullPath, 'SKILL.md')
    let desc = ''
    if (fs.existsSync(skillMd)) {
      try {
        const content = fs.readFileSync(skillMd, 'utf8')
        const nameMatch = content.match(/^name:\s*(.+)$/m)
        if (nameMatch) name = nameMatch[1].trim()
        const descMatch = content.match(/^description:\s*(.+)$/m)
        if (descMatch) desc = descMatch[1].trim().slice(0, 120)
      } catch (_) {}
    }

    if (fs.existsSync(skillMd) && !seen.has(name)) {
      seen.add(name)
      const isAgent = /agent|builder|creator|comms/i.test(ent.name)
      ;(isAgent ? agents : skills).push({ name, dirName: ent.name, path: fullPath, tag, desc })
    }

    walkDir(fullPath, depth + 1, maxDepth, skills, agents, seen, tag)
  }
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow () {
  loadSettings()
  const b = settings.windowBounds || {}

  const opts = {
    width:      b.width  || 1200,
    height:     b.height || 800,
    x:          b.x,
    y:          b.y,
    minWidth:   700,
    minHeight:  500,
    backgroundColor: '#0c0c0c',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    show: false,
  }

  if (process.platform === 'darwin') {
    opts.titleBarStyle = 'hiddenInset'
  } else {
    opts.frame = false
  }

  mainWindow = new BrowserWindow(opts)
  mainWindow.loadFile('index.html')

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Warn on dirty close
  mainWindow.on('close', async (e) => {
    e.preventDefault()
    try {
      const dirty = await mainWindow.webContents.executeJavaScript('window.__isDirty || false')
      if (dirty) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          type:      'warning',
          buttons:   ['Save', "Don't Save", 'Cancel'],
          defaultId: 0,
          cancelId:  2,
          message:   'You have unsaved changes.',
          detail:    'Do you want to save before closing?',
        })
        if (response === 2) return          // Cancel
        if (response === 0) {               // Save
          await mainWindow.webContents.executeJavaScript('window.__triggerSave()')
          await new Promise(r => setTimeout(r, 600))
        }
      }
    } catch (_) {}

    // Save window bounds
    const bounds = mainWindow.getBounds()
    settings.windowBounds = bounds
    persistSettings(settings)
    mainWindow.destroy()
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('open-file', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  })
  if (r.canceled || !r.filePaths.length) return null
  const filePath = r.filePaths[0]
  const content  = fs.readFileSync(filePath, 'utf8')
  addRecentFile(filePath)
  return { filePath, content }
})

ipcMain.handle('save-file', async (_e, { content, filePath }) => {
  if (!filePath) return null
  fs.writeFileSync(filePath, content, 'utf8')
  addRecentFile(filePath)
  return { filePath }
})

ipcMain.handle('save-file-as', async (_e, { content }) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'untitled.md',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  })
  if (r.canceled || !r.filePath) return null
  fs.writeFileSync(r.filePath, content, 'utf8')
  addRecentFile(r.filePath)
  return { filePath: r.filePath }
})

ipcMain.handle('new-file',  async () => true)

ipcMain.handle('read-file', async (_e, filePath) => {
  try {
    return { filePath, content: fs.readFileSync(filePath, 'utf8') }
  } catch (_) { return null }
})

ipcMain.handle('browse-directory', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.handle('scan-directory', async (_e, dirPath) => {
  const results = []
  const walk = (dir, depth) => {
    if (depth > 4) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (_) { return }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      results.push({ name: ent.name, path: full, type: ent.isDirectory() ? 'dir' : 'file' })
      if (ent.isDirectory()) walk(full, depth + 1)
    }
  }
  try { walk(expandPath(dirPath), 0) } catch (_) {}
  return results
})

ipcMain.handle('scan-skills',    async (_e, paths)    => scanSkillPaths(paths))
ipcMain.handle('load-settings',  async ()             => loadSettings())
ipcMain.handle('save-settings',  async (_e, s)        => persistSettings(s))
ipcMain.handle('copy-to-clipboard',   async (_e, text) => { clipboard.writeText(text); return true })
ipcMain.handle('read-from-clipboard', async ()         => clipboard.readText())
ipcMain.handle('minimize',       async ()             => mainWindow.minimize())
ipcMain.handle('maximize',       async ()             => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.handle('close',          async ()             => mainWindow.close())
