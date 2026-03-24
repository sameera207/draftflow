const { app, BrowserWindow, ipcMain, dialog, Menu, clipboard } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

let _tokenizer = null
function getTokenizer () {
  if (_tokenizer) return _tokenizer
  try { _tokenizer = require('@anthropic-ai/tokenizer'); return _tokenizer } catch (_) { return null }
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'Edit', submenu: [
    { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
    { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
  ]},
  { label: 'View', submenu: [
    { label: 'Toggle Developer Tools', accelerator: 'Alt+CmdOrCtrl+I',
      click: (_, win) => win && win.webContents.toggleDevTools() },
  ]},
]))

let mainWindow
let settings = {}
let pendingBridgeUrl = null

app.setAsDefaultProtocolClient('draftflow')

app.on('open-url', (event, url) => {
  event.preventDefault()
  const filePath = parseBridgeUrl(url)
  if (!filePath) return
  if (mainWindow) {
    mainWindow.focus()
    mainWindow.webContents.send('bridge-open', filePath)
  } else {
    pendingBridgeUrl = url
  }
})

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
  let preview = ''
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const firstLine = content.split('\n').find(l => l.trim().length > 0) || ''
    preview = firstLine.trim().slice(0, 80)
  } catch (_) {}
  const entry = { path: filePath, openedAt: new Date().toISOString(), preview }
  settings.recentFiles = [
    entry,
    ...settings.recentFiles.filter(f => (typeof f === 'string' ? f : f.path) !== filePath)
  ].slice(0, 8)
  settings.lastOpenFile = filePath
  persistSettings(settings)
}

function findProjectRoot (filePath) {
  let dir = path.dirname(filePath)
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'CLAUDE.md'))) return { root: dir, found: true }
    dir = path.dirname(dir)
  }
  return { root: path.dirname(filePath), found: false }
}

function scanProjectTree (root) {
  const hasClaude = fs.existsSync(path.join(root, 'CLAUDE.md'))
  let entries
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch (_) { return { root, files: [], dirs: [], hasClaude } }
  const files = []
  const dirs  = []
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ent.name === 'node_modules') continue
    if (ent.isDirectory()) {
      let subEntries
      try { subEntries = fs.readdirSync(path.join(root, ent.name), { withFileTypes: true }) } catch (_) { subEntries = [] }
      const subFiles = subEntries
        .filter(e => !e.isDirectory() && /\.md$/i.test(e.name))
        .map(e => e.name)
      if (subFiles.length) dirs.push({ name: ent.name, files: subFiles })
    } else if (/\.md$/i.test(ent.name) && ent.name !== 'CLAUDE.md') {
      files.push(ent.name)
    }
  }
  return { root, files, dirs, hasClaude }
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function expandPath (p) {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
}

function parseBridgeUrl (url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'draftflow:') return null
    const file = u.searchParams.get('file')
    if (!file) return null
    return expandPath(file)
  } catch (_) { return null }
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

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingBridgeUrl) {
      const filePath = parseBridgeUrl(pendingBridgeUrl)
      pendingBridgeUrl = null
      if (filePath) mainWindow.webContents.send('bridge-open', filePath)
    }
  })

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
    const content = fs.readFileSync(filePath, 'utf8')
    addRecentFile(filePath)
    return { filePath, content }
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

ipcMain.handle('suggest-skills', async (_e, { prompt, skills, agents, apiKey }) => {
  if (!apiKey) return []
  try {
    const system = 'You are a skill routing assistant. Given a user\'s prompt and a list of available skills and agents, return the most relevant ones as a JSON array. Only include items genuinely useful for the prompt. Return an empty array if nothing is relevant.'

    const skillLines  = (skills  || []).map(s => `- id: "${s.dirName}" | name: "${s.name}" | description: "${s.desc || ''}"`)
    const agentLines  = (agents  || []).map(a => `- id: "${a.dirName}" | name: "${a.name}" | description: "${a.desc || ''}"`)
    const userMessage = `User prompt: "${prompt}"

Available skills:
${skillLines.join('\n')}

Available agents:
${agentLines.join('\n')}

Return a JSON array. Each item: { type: "skill"|"agent", id, name, confidence: 0.0-1.0, reason: "max 6 words" }
Example: [{"type":"skill","id":"xlsx","name":"Excel / Spreadsheet","confidence":0.92,"reason":"Spreadsheet data extraction task"}]
Return only valid JSON. No explanation, no markdown.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    const data = await response.json()
    let text = data?.content?.[0]?.text || '[]'

    // Strip markdown fences if the model wraps output in ```json ... ```
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    return JSON.parse(text)
  } catch (_) {
    return []
  }
})

ipcMain.handle('read-skill-content', async (_e, skillPath) => {
  try { return fs.readFileSync(path.join(skillPath, 'SKILL.md'), 'utf8') } catch (_) { return '' }
})

ipcMain.handle('send-back', async (_e, content) => {
  const bridgeDir   = path.join(os.homedir(), '.claude', 'editor-bridge')
  const responsePath = path.join(bridgeDir, 'response.md')
  try {
    fs.mkdirSync(bridgeDir, { recursive: true })
    fs.writeFileSync(responsePath, content, 'utf8')
    return { ok: true, path: responsePath }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('install-df-command', async () => {
  const src  = path.join(__dirname, 'commands', 'df.md')
  const dest = path.join(os.homedir(), '.claude', 'commands', 'df.md')
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    return { ok: true, path: dest }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('df-command-installed', async () => {
  const dest = path.join(os.homedir(), '.claude', 'commands', 'df.md')
  return fs.existsSync(dest)
})
ipcMain.handle('count-tokens', async (_e, text) => {
  const t = getTokenizer()
  if (t) { try { return t.countTokens(text) } catch (_) {} }
  return Math.ceil((text || '').length / 4)
})

const SCRATCH_PATH = path.join(os.homedir(), '.claude', 'draftflow-scratch.md')

ipcMain.handle('read-scratch', async () => {
  try { return fs.existsSync(SCRATCH_PATH) ? fs.readFileSync(SCRATCH_PATH, 'utf8') : '' } catch (_) { return '' }
})

ipcMain.handle('write-scratch', async (_e, content) => {
  try {
    fs.mkdirSync(path.dirname(SCRATCH_PATH), { recursive: true })
    fs.writeFileSync(SCRATCH_PATH, content, 'utf8')
    return true
  } catch (_) { return false }
})

ipcMain.handle('save-scratch-as', async (_e, { content, defaultDir }) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(defaultDir || os.homedir(), 'scratchpad.md'),
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  })
  if (r.canceled || !r.filePath) return null
  fs.writeFileSync(r.filePath, content, 'utf8')
  return { filePath: r.filePath }
})

ipcMain.handle('find-project-root', async (_e, filePath) => findProjectRoot(filePath))
ipcMain.handle('scan-project-tree', async (_e, root)    => scanProjectTree(root))

ipcMain.handle('load-settings',  async ()             => loadSettings())
ipcMain.handle('save-settings',  async (_e, s)        => persistSettings(s))
ipcMain.handle('copy-to-clipboard',   async (_e, text) => { clipboard.writeText(text); return true })
ipcMain.handle('read-from-clipboard', async ()         => clipboard.readText())
ipcMain.handle('minimize',       async ()             => mainWindow.minimize())
ipcMain.handle('maximize',       async ()             => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.handle('close',          async ()             => mainWindow.close())
