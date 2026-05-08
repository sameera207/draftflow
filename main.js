const { app, BrowserWindow, ipcMain, dialog, Menu, clipboard, shell } = require('electron')
const path  = require('path')
const fs    = require('fs')
const os    = require('os')
const https = require('https')

const DEBUG_LOG = path.join(os.homedir(), '.claude', 'draftflow-debug.log')
function dbg (...args) { try { fs.appendFileSync(DEBUG_LOG, new Date().toISOString() + ' ' + args.join(' ') + '\n') } catch (_) {} }

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

if (app.isPackaged) {
  app.setAsDefaultProtocolClient('draftflow')
} else {
  app.setAsDefaultProtocolClient('draftflow', process.execPath, [path.resolve(process.argv[1])])
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  dbg('open-url received:', url)
  const bridgeData = parseBridgeUrl(url)
  dbg('parseBridgeUrl result:', JSON.stringify(bridgeData))
  if (!bridgeData) return
  let sent = false
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus()
      mainWindow.webContents.send('bridge-open', bridgeData)
      sent = true
      dbg('bridge-open sent to renderer')
    }
  } catch (e) { dbg('send error:', e.message) }
  if (!sent) { pendingBridgeUrl = url; dbg('stored as pendingBridgeUrl') }
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
  // Skip transient bridge files — they are not user documents
  const bridgeDir = path.join(os.homedir(), '.claude', 'editor-bridge')
  if (filePath.startsWith(bridgeDir)) return
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

const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv'])

function scanProjectTree (root) {
  const hasClaude = fs.existsSync(path.join(root, 'CLAUDE.md'))
  let entries
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch (_) { return { root, files: [], dirs: [], hasClaude } }
  const files = []
  const dirs  = []
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue
    if (ent.isDirectory()) {
      if (IGNORED_DIRS.has(ent.name)) continue
      let subEntries
      try { subEntries = fs.readdirSync(path.join(root, ent.name), { withFileTypes: true }) } catch (_) { subEntries = [] }
      const subFiles = subEntries
        .filter(e => !e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name)
        .sort()
      dirs.push({ name: ent.name, files: subFiles })
    } else if (ent.name !== 'CLAUDE.md') {
      files.push(ent.name)
    }
  }
  files.sort()
  dirs.sort((a, b) => a.name.localeCompare(b.name))
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
    const cwd  = u.searchParams.get('cwd')  || null
    const mode = u.searchParams.get('mode') || null
    return { file: expandPath(file), cwd: cwd ? expandPath(cwd) : null, mode }
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
      // Electron 20+ sandboxes renderers by default, which blocks require()
      // of non-builtin modules in the preload (we need `marked`). Keep the
      // renderer un-sandboxed so the preload can load node_modules.
      sandbox:          false,
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
    dbg('did-finish-load, pendingBridgeUrl=', pendingBridgeUrl)
    if (pendingBridgeUrl) {
      const bridgeData = parseBridgeUrl(pendingBridgeUrl)
      pendingBridgeUrl = null
      dbg('sending bridge-open from pending:', JSON.stringify(bridgeData))
      if (bridgeData) mainWindow.webContents.send('bridge-open', bridgeData)
    }
    // Check for updates after a short delay so it never blocks startup
    setTimeout(() => checkForUpdate(mainWindow), 5000)
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.once('destroyed', () => { mainWindow = null })

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
  let updatedIntegrationFiles = []
  try { updatedIntegrationFiles = installIntegration() || [] } catch (e) { dbg('installIntegration failed:', e.message) }
  createWindow()
  if (updatedIntegrationFiles.length && mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('integration-updated', {
          files:   updatedIntegrationFiles,
          version: app.getVersion(),
        })
      }
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Update checker ────────────────────────────────────────────────────────────

const GITHUB_REPO = 'sameera207/draftflow'

function isNewerVersion (latest, current) {
  const parse = v => v.replace(/^v/, '').split('.').map(Number)
  const [la, lb, lc] = parse(latest)
  const [ca, cb, cc] = parse(current)
  return la > ca || (la === ca && (lb > cb || (lb === cb && lc > cc)))
}

function isHomebrew () {
  try { return app.getPath('exe').includes('Caskroom') } catch (_) { return false }
}

async function checkForUpdate (win) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Draftflow' },
    })
    if (!res.ok) return
    const data = await res.json()
    const latest = data.tag_name          // e.g. "v0.2.0"
    const current = app.getVersion()      // e.g. "0.1.0"
    const homebrew = isHomebrew()
    if (!latest || !isNewerVersion(latest, current)) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('version-current', { version: current })
      }
      return
    }
    const asset = homebrew ? null : (data.assets || []).find(a => a.name.endsWith('.dmg'))
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-available', {
        version:     latest,
        url:         data.html_url,
        downloadUrl: asset ? asset.browser_download_url : null,
        size:        asset ? asset.size : 0,
        homebrew,
      })
    }
  } catch (_) {}  // network errors are silent — never bother the user
}

// Streams a URL to destPath, calling onProgress(0–100) as bytes arrive.
// Follows up to 5 redirects (GitHub asset URLs redirect to S3).
function downloadFile (url, destPath, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('Too many redirects')); return }
    https.get(url, { headers: { 'User-Agent': 'Draftflow' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location, destPath, onProgress, redirects + 1)
          .then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      const total    = parseInt(res.headers['content-length'] || '0', 10)
      let received   = 0
      const file     = fs.createWriteStream(destPath)
      res.on('data', chunk => {
        received += chunk.length
        if (total) onProgress(Math.round(received / total * 100))
      })
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error',  reject)
    }).on('error', reject)
  })
}

async function runDownload (downloadUrl, version) {
  const dest = path.join(os.tmpdir(), `Draftflow-${version}.dmg`)
  const send = (ch, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data)
  }
  try {
    await downloadFile(downloadUrl, dest, pct => send('download-progress', pct))
    await shell.openPath(dest)   // mounts the DMG — Finder opens automatically
    send('download-done')
  } catch (err) {
    send('download-error', err.message)
  }
}

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

// Writes a file from the app bundle to dest, works inside an asar archive.
// fs.copyFileSync cannot read from inside asar — read+write always works.
// Returns true if the destination content actually changed.
function installFile (src, dest) {
  const content = fs.readFileSync(src, 'utf8')
  let existing = null
  try { existing = fs.readFileSync(dest, 'utf8') } catch (_) {}
  if (existing === content) return false
  fs.writeFileSync(dest, content, { encoding: 'utf8', mode: 0o755 })
  dbg('installFile:', src, '→', dest)
  return true
}

function installIntegration () {
  const updated = []

  // 1. Install /df command
  const cmdSrc  = path.join(__dirname, 'commands', 'df.md')
  const cmdDest = path.join(os.homedir(), '.claude', 'commands', 'df.md')
  fs.mkdirSync(path.dirname(cmdDest), { recursive: true })
  if (installFile(cmdSrc, cmdDest)) updated.push('df.md')

  // 2. Install hook scripts (always overwrite so updates stay in sync)
  const hooksDir = path.join(os.homedir(), '.claude', 'hooks')
  fs.mkdirSync(hooksDir, { recursive: true })

  const hookFiles = ['df_bridge.py', 'save_last_response.py']
  for (const fname of hookFiles) {
    const src  = path.join(__dirname, 'hooks', fname)
    const dest = path.join(hooksDir, fname)
    if (installFile(src, dest)) updated.push(fname)
  }

  const hookDest         = path.join(hooksDir, 'df_bridge.py')
  const saveRespHookDest = path.join(hooksDir, 'save_last_response.py')

  // 3. Register hooks in ~/.claude/settings.json
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  let claudeSettings = {}
  try { claudeSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch (_) {}

  if (!claudeSettings.hooks) claudeSettings.hooks = {}

  // UserPromptSubmit: df_bridge
  if (!claudeSettings.hooks.UserPromptSubmit) claudeSettings.hooks.UserPromptSubmit = []
  // 610 s timeout: /df p polls in-hook for up to 10 min while the user edits
  const bridgeEntry  = { type: 'command', command: `python3 ${hookDest}`, timeout: 610000 }
  const bridgeExists = claudeSettings.hooks.UserPromptSubmit.some(h =>
    Array.isArray(h.hooks) && h.hooks.some(e => e.command && e.command.includes('df_bridge.py'))
  )
  if (!bridgeExists) {
    claudeSettings.hooks.UserPromptSubmit.push({ hooks: [bridgeEntry] })
  } else {
    claudeSettings.hooks.UserPromptSubmit = claudeSettings.hooks.UserPromptSubmit.map(h => {
      if (!Array.isArray(h.hooks)) return h
      return { ...h, hooks: h.hooks.map(e => e.command && e.command.includes('df_bridge.py') ? bridgeEntry : e) }
    })
  }

  // Stop: save_last_response
  if (!claudeSettings.hooks.Stop) claudeSettings.hooks.Stop = []
  const saveEntry  = { type: 'command', command: `python3 ${saveRespHookDest}` }
  const saveExists = claudeSettings.hooks.Stop.some(h =>
    Array.isArray(h.hooks) && h.hooks.some(e => e.command && e.command.includes('save_last_response.py'))
  )
  if (!saveExists) {
    claudeSettings.hooks.Stop.push({ hooks: [saveEntry] })
  } else {
    claudeSettings.hooks.Stop = claudeSettings.hooks.Stop.map(h => {
      if (!Array.isArray(h.hooks)) return h
      return { ...h, hooks: h.hooks.map(e => e.command && e.command.includes('save_last_response.py') ? saveEntry : e) }
    })
  }

  fs.writeFileSync(settingsPath, JSON.stringify(claudeSettings, null, 2))

  return updated
}

ipcMain.handle('install-df-command', async () => {
  try {
    installIntegration()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('df-command-installed', async () => {
  const cmdDest      = path.join(os.homedir(), '.claude', 'commands', 'df.md')
  const hookDest     = path.join(os.homedir(), '.claude', 'hooks', 'df_bridge.py')
  const saveRespDest = path.join(os.homedir(), '.claude', 'hooks', 'save_last_response.py')

  if (!fs.existsSync(cmdDest) || !fs.existsSync(hookDest) || !fs.existsSync(saveRespDest)) {
    return { ok: false, reason: 'Hook files not found in ~/.claude/hooks/' }
  }

  // Files exist — also verify the hook is registered in ~/.claude/settings.json
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  try {
    const cs = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    const registered = (cs.hooks?.UserPromptSubmit || []).some(h =>
      Array.isArray(h.hooks) && h.hooks.some(e => e.command?.includes('df_bridge.py'))
    )
    if (!registered) return { ok: false, reason: 'Hook not registered in ~/.claude/settings.json' }
  } catch (_) {
    return { ok: false, reason: 'Could not read ~/.claude/settings.json' }
  }

  return { ok: true }
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
ipcMain.handle('open-url',       async (_e, url)      => { await shell.openExternal(url); return true })
ipcMain.handle('get-version',    async ()             => app.getVersion())
ipcMain.handle('start-download', async (_e, { downloadUrl, version }) => {
  runDownload(downloadUrl, version)   // fire-and-forget; progress via events
  return { ok: true }
})
