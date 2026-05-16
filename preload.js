const { contextBridge, ipcRenderer } = require('electron')
const { marked } = require('marked')
const path_m = require('path')
const os_m   = require('os')
const fs_m   = require('fs')

// ── Renderer-side plugin system ───────────────────────────────────────────────

// Plugins loaded for renderer phase (initRenderer)
const _preloadPlugins = (() => {
  const pluginDir = path_m.join(os_m.homedir(), '.draftflow', 'plugins')
  if (!fs_m.existsSync(pluginDir)) return []
  const result = []
  try {
    const entries = fs_m.readdirSync(pluginDir, { withFileTypes: true }).filter(e => e.isDirectory())
    for (const entry of entries) {
      const manifestPath = path_m.join(pluginDir, entry.name, 'plugin.json')
      if (!fs_m.existsSync(manifestPath)) continue
      let manifest
      try { manifest = JSON.parse(fs_m.readFileSync(manifestPath, 'utf8')) } catch { continue }
      if (!manifest.id || manifest.id !== entry.name) continue
      const entryFile = path_m.join(pluginDir, entry.name, manifest.main ?? 'index.js')
      if (!fs_m.existsSync(entryFile)) continue
      let pluginExport
      try { pluginExport = require(entryFile) } catch { continue }
      const initRenderer = typeof pluginExport === 'function' ? pluginExport
        : (pluginExport && typeof pluginExport.initRenderer === 'function' ? pluginExport.initRenderer : null)
      if (initRenderer) result.push({ id: manifest.id, manifest, initRenderer })
    }
  } catch {}
  return result
})()

// Global event handler registry shared across all plugin apis
const _globalEventHandlers = new Map()  // eventName → Set<handler>

// Api instances keyed by pluginId (populated when callInitRenderer runs)
const _pluginApis = {}

// Forward IPC plugin events to all registered handlers
ipcRenderer.on('plugin:event', (_e, name, payload) => {
  const handlers = _globalEventHandlers.get(name)
  if (handlers) {
    for (const h of handlers) { try { h(payload) } catch {} }
  }
})

const VALID_EVENTS = new Set(['file:opened', 'file:saved', 'send:triggered', 'theme:changed', 'app:ready'])

function _sanitizeHtml(content) {
  const allowed = new Set(['P', 'STRONG', 'EM', 'CODE', 'PRE', 'BR'])
  const tmp = document.createElement('div')
  tmp.innerHTML = content
  function walk(node) {
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      const child = node.childNodes[i]
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowed.has(child.tagName)) {
          node.replaceChild(document.createTextNode(child.textContent), child)
        } else {
          for (const attr of [...child.attributes]) {
            if (!(child.tagName === 'CODE' && attr.name === 'class')) child.removeAttribute(attr.name)
          }
          walk(child)
        }
      }
    }
  }
  walk(tmp)
  return tmp.innerHTML
}

function _matchAccelerator(event, accelerator) {
  if (!accelerator) return false
  const parts = accelerator.split('+')
  const key = parts[parts.length - 1]
  const needsCmd   = parts.some(p => p === 'Cmd' || p === 'Command')
  const needsCtrl  = parts.some(p => p === 'Ctrl' || p === 'Control')
  const needsShift = parts.includes('Shift')
  const needsAlt   = parts.includes('Alt')
  return (
    (!needsCmd   || event.metaKey)  &&
    (!needsCtrl  || event.ctrlKey)  &&
    (!needsShift || event.shiftKey) &&
    (!needsAlt   || event.altKey)   &&
    event.key.toLowerCase() === key.toLowerCase()
  )
}

function _createRendererApi(manifest, pluginId) {
  const perms = new Set(manifest.permissions ?? [])
  const cont  = manifest.contributes ?? {}
  const expandTilde = p => p.startsWith('~/') ? path_m.join(os_m.homedir(), p.slice(2)) : p

  const api = {
    editor: {
      insertAtCursor(text) {
        if (typeof text !== 'string') throw new TypeError('editor.insert: text must be a string')
        const el = document.getElementById('editor')
        if (!el) return
        const start = el.selectionStart, end = el.selectionEnd
        el.value = el.value.slice(0, start) + text + el.value.slice(end)
        el.selectionStart = el.selectionEnd = start + text.length
        el.dispatchEvent(new Event('input', { bubbles: true }))
      },
      getSelection() {
        const el = document.getElementById('editor')
        if (!el) return ''
        return el.value.substring(el.selectionStart, el.selectionEnd) || ''
      },
      getDocument() {
        const el = document.getElementById('editor')
        return el ? el.value : ''
      },
    },

    commands: {
      register(id, handler, key) {
        if (!/^[^.\s/\\]+\.[^.\s/\\]+$/.test(id)) {
          throw new Error(`commands.register: id must be '<plugin-id>.<command-name>'`)
        }
        if (key) {
          document.addEventListener('keydown', (e) => {
            if (_matchAccelerator(e, key)) { e.preventDefault(); handler() }
          })
        }
      },
    },

    events: {
      on(eventName, handler) {
        if (!VALID_EVENTS.has(eventName)) throw new Error(`events.on: unknown event "${eventName}"`)
        if (!_globalEventHandlers.has(eventName)) _globalEventHandlers.set(eventName, new Set())
        _globalEventHandlers.get(eventName).add(handler)
      },
      off(eventName, handler) {
        _globalEventHandlers.get(eventName)?.delete(handler)
      },
    },

    settings: {
      get(key) {
        return ipcRenderer.invoke('plugin:settings-get', pluginId, key)
      },
      set(key, value) {
        try { JSON.stringify(value) } catch { throw new TypeError('settings.set: value must be JSON-serialisable') }
        return ipcRenderer.invoke('plugin:settings-set', pluginId, key, value)
      },
    },

    ui: {
      getPluginToolbarMount() {
        if (!cont.pluginToolbar) throw new Error('ui.pluginToolbar not declared in contributes')
        const el = document.getElementById(`plugin-mount-${pluginId}`)
        if (!el) throw new Error(`plugin mount not found for "${pluginId}"`)
        return el
      },
      getStatusBarMount() {
        if (!cont.statusBar) throw new Error('ui.statusBar not declared in contributes')
        const el = document.getElementById(`plugin-status-${pluginId}`)
        if (!el) throw new Error(`status bar mount not found for "${pluginId}"`)
        return el
      },
      showModal({ title, content, actions }) {
        if (!Array.isArray(actions) || actions.length < 1 || actions.length > 4) {
          throw new Error('ui.showModal: actions must have 1–4 items')
        }
        return new Promise(resolve => {
          const backdrop = document.createElement('div')
          backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center'

          const modal = document.createElement('div')
          modal.style.cssText = 'background:var(--df-surface,#211f1c);border:1px solid var(--df-border,rgba(255,255,255,0.07));border-radius:8px;padding:20px;max-width:400px;min-width:280px;font-family:var(--df-font-mono,monospace)'

          const titleEl = document.createElement('div')
          titleEl.style.cssText = 'font-size:0.85rem;font-weight:500;color:var(--df-text,#e8e3dc);margin-bottom:12px'
          titleEl.textContent = title

          const contentEl = document.createElement('div')
          contentEl.style.cssText = 'font-size:0.75rem;color:var(--df-text-muted,#8a8278);margin-bottom:16px;line-height:1.5'
          contentEl.innerHTML = _sanitizeHtml(String(content))

          const actionsEl = document.createElement('div')
          actionsEl.style.cssText = 'display:flex;gap:8px;justify-content:flex-end'

          const close = (result) => {
            if (document.body.contains(backdrop)) document.body.removeChild(backdrop)
            document.removeEventListener('keydown', escHandler)
            resolve(result)
          }
          const escHandler = (e) => { if (e.key === 'Escape') close(null) }
          document.addEventListener('keydown', escHandler)
          backdrop.addEventListener('click', e => { if (e.target === backdrop) close(null) })

          for (const action of actions) {
            const btn = document.createElement('button')
            btn.className = 'df-plugin-btn'
            btn.textContent = action
            btn.addEventListener('click', () => close(action))
            actionsEl.appendChild(btn)
          }

          modal.appendChild(titleEl)
          modal.appendChild(contentEl)
          modal.appendChild(actionsEl)
          backdrop.appendChild(modal)
          document.body.appendChild(backdrop)
        })
      },
    },

    network: {
      async fetch(url, options) {
        const origin = new URL(url).origin
        const allowedOrigins = manifest.allowedOrigins || []
        if (!allowedOrigins.includes(origin)) {
          throw new Error(`network.fetch: origin "${origin}" not in allowedOrigins`)
        }
        return window.fetch(url, options)
      },
    },

    fs: {
      read(filePath) {
        const expanded = expandTilde(filePath)
        const allowedPaths = (manifest.allowedPaths || []).map(expandTilde)
        if (!allowedPaths.some(a => expanded.startsWith(a))) throw new Error('fs.read: path not in allowedPaths')
        return fs_m.readFileSync(expanded, 'utf8')
      },
      write(filePath, content) {
        if (typeof content !== 'string') throw new TypeError('fs.write: content must be a string')
        const expanded = expandTilde(filePath)
        const allowedPaths = (manifest.allowedPaths || []).map(expandTilde)
        if (!allowedPaths.some(a => expanded.startsWith(a))) throw new Error('fs.write: path not in allowedPaths')
        fs_m.mkdirSync(path_m.dirname(expanded), { recursive: true })
        fs_m.writeFileSync(expanded, content, 'utf8')
      },
    },

    // Generic IPC bridge — mirrors api.ipc.handle() registered in initMain.
    // Calls are automatically namespaced to `plugin:<id>:<name>` so plugins
    // can only reach their own handlers, never Draftflow's internal channels.
    ipc: {
      invoke(name, ...args) {
        return ipcRenderer.invoke(`plugin:${pluginId}:${name}`, ...args)
      },
    },
  }

  // Apply permission scoping
  if (!perms.has('network.fetch'))                      delete api.network
  if (!perms.has('fs.read') && !perms.has('fs.write')) {
    delete api.fs
  } else {
    if (!perms.has('fs.read'))  delete api.fs.read
    if (!perms.has('fs.write')) delete api.fs.write
  }
  if (!cont.pluginToolbar)        delete api.ui.getPluginToolbarMount
  if (!cont.statusBar)            delete api.ui.getStatusBarMount
  if (!perms.has('ui.modal'))     delete api.ui.showModal
  if (!perms.has('editor.insert')) delete api.editor.insertAtCursor
  if (!perms.has('editor.read')) {
    delete api.editor.getSelection
    delete api.editor.getDocument
  }
  if (!perms.has('settings.readwrite') && !perms.has('settings.read')) {
    delete api.settings
  } else if (!perms.has('settings.readwrite')) {
    delete api.settings.set
  }

  return api
}

// ── Context bridge ────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('api', {
  markedParse: (text) => marked.parse(text || ''),
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

  onMenuAction:        (cb) => ipcRenderer.on('menu-action',        (_e, action) => cb(action)),
  onBridgeOpen:        (cb) => ipcRenderer.on('bridge-open',        (_e, data)   => cb(data)),
  onIntegrationUpdated: (cb) => ipcRenderer.on('integration-updated', (_e, data)  => cb(data)),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_e, data) => cb(data)),
  onVersionCurrent:   (cb) => ipcRenderer.on('version-current',   (_e, data) => cb(data)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_e, pct)  => cb(pct)),
  onDownloadDone:     (cb) => ipcRenderer.on('download-done',     ()         => cb()),
  onDownloadError:    (cb) => ipcRenderer.on('download-error',    (_e, msg)  => cb(msg)),
  openUrl:            (url)          => ipcRenderer.invoke('open-url', url),
  openPluginsDir:     ()             => ipcRenderer.invoke('open-plugins-dir'),
  getVersion:         ()             => ipcRenderer.invoke('get-version'),
  startDownload:      (downloadUrl, version) => ipcRenderer.invoke('start-download', { downloadUrl, version }),
  sendBack:       (content) => ipcRenderer.invoke('send-back', content),
  installDfCommand:   () => ipcRenderer.invoke('install-df-command'),
  dfCommandInstalled: () => ipcRenderer.invoke('df-command-installed'),
  suggestSkills:    (data)      => ipcRenderer.invoke('suggest-skills', data),
  readSkillContent: (skillPath) => ipcRenderer.invoke('read-skill-content', skillPath),
  getDiagnostics:   ()          => ipcRenderer.invoke('get-diagnostics'),
  submitFeedback:   (payload)   => ipcRenderer.invoke('submit-feedback', payload),
  onShowWhatsNew:   (cb)        => ipcRenderer.on('show-whats-new', (_e, releases) => cb(releases)),

  plugins: {
    list:          ()                     => ipcRenderer.invoke('plugin:list'),
    settingsGet:   (pluginId, key)        => ipcRenderer.invoke('plugin:settings-get', pluginId, key),
    settingsSet:   (pluginId, key, value) => ipcRenderer.invoke('plugin:settings-set', pluginId, key, value),
    initRenderers: ()                     => ipcRenderer.invoke('plugin:init-renderers'),

    // Called by initPlugins() for each plugin with an initRenderer.
    // Runs initRenderer in the preload context so DOM APIs work.
    callInitRenderer: async (id) => {
      const plugin = _preloadPlugins.find(p => p.id === id)
      if (!plugin) {
        console.warn(`[plugins] no initRenderer found for "${id}" in preload`)
        return
      }
      const api = _createRendererApi(plugin.manifest, id)
      _pluginApis[id] = api
      await plugin.initRenderer(api)
    },

    // Fire an event on all registered plugin handlers (for renderer-originated events).
    fireLocalEvent: (name, payload) => {
      const handlers = _globalEventHandlers.get(name)
      if (handlers) {
        for (const h of handlers) { try { h(payload) } catch {} }
      }
    },

    // Subscribe to main-process plugin events.
    onEvent: (handler) => {
      ipcRenderer.on('plugin:event', (_e, name, payload) => handler(name, payload))
    },

    onEditorInsert: (handler) => {
      ipcRenderer.on('plugin:do-editor-insert', (_e, text) => handler(text))
    },
  },
})
