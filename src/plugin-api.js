const path = require('path')
const os   = require('os')
const fs   = require('fs')

const PLUGIN_SETTINGS_PATH = path.join(os.homedir(), '.draftflow', 'settings.json')

function _readPluginSettings() {
  if (!fs.existsSync(PLUGIN_SETTINGS_PATH)) return {}
  try { return JSON.parse(fs.readFileSync(PLUGIN_SETTINGS_PATH, 'utf8')) } catch { return {} }
}

function _writePluginSettings(data) {
  fs.mkdirSync(path.dirname(PLUGIN_SETTINGS_PATH), { recursive: true })
  fs.writeFileSync(PLUGIN_SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8')
}

const VALID_EVENTS = new Set(['file:opened', 'file:saved', 'send:triggered', 'theme:changed', 'app:ready'])

class PluginAPI {

  // ── Tier 1: always available ──────────────────────────────────────────────

  editor = {
    insertAtCursor(text) {
      if (typeof text !== 'string') throw new TypeError('editor.insert: text must be a string')
      if (process.type === 'browser') {
        const { BrowserWindow } = require('electron')
        const win = BrowserWindow.getFocusedWindow()
        if (win) win.webContents.send('plugin:do-editor-insert', text)
      }
    },

    getSelection() {
      return ''
    },

    getDocument() {
      return ''
    },
  }

  commands = {
    register(id, handler, key) {
      if (!/^[^.\s/\\]+\.[^.\s/\\]+$/.test(id)) {
        throw new Error(`commands.register: id must be '<plugin-id>.<command-name>'`)
      }
    },
  }

  events = {
    on(eventName, handler) {
      if (!VALID_EVENTS.has(eventName)) throw new Error(`events.on: unknown event "${eventName}"`)
    },
    off(eventName, handler) {},
  }

  settings = {
    get(key) {
      return null
    },
    set(key, value) {
      try { JSON.stringify(value) } catch { throw new TypeError('settings.set: value must be JSON-serialisable') }
    },
  }

  // ── Tier 2: UI contributions (requires manifest declaration) ──────────────

  ui = {
    getPluginToolbarMount() {
      throw new Error('getPluginToolbarMount must be called from initRenderer (phase 2)')
    },

    getStatusBarMount() {
      throw new Error('getPluginToolbarMount must be called from initRenderer (phase 2)')
    },

    showModal({ title, content, actions }) {
      throw new Error('ui.modal permission not declared')
    },
  }

  // ── Tier 3: privileged (requires explicit permission in manifest) ──────────

  network = {
    fetch(url, options) {
      throw new Error('network.fetch permission not declared')
    },
  }

  fs = {
    read(filePath) {
      throw new Error('fs.read permission not declared')
    },
    write(filePath, content) {
      throw new Error('fs.write permission not declared')
    },
  }
}

function createScopedAPI(manifest, pluginId) {
  const api   = new PluginAPI()
  const perms = new Set(manifest.permissions ?? [])
  const cont  = manifest.contributes ?? {}

  // Wire settings with proper namespacing
  api.settings = {
    get(key) {
      const data = _readPluginSettings()
      return data[`${pluginId}.${key}`] ?? null
    },
    set(key, value) {
      try { JSON.stringify(value) } catch { throw new TypeError('settings.set: value must be JSON-serialisable') }
      const data = _readPluginSettings()
      data[`${pluginId}.${key}`] = value
      _writePluginSettings(data)
    },
  }

  // Wire network.fetch with origin check
  if (perms.has('network.fetch')) {
    const allowedOrigins = manifest.allowedOrigins || []
    api.network = {
      async fetch(url, options) {
        const origin = new URL(url).origin
        if (!allowedOrigins.includes(origin)) {
          throw new Error(`network.fetch: origin "${origin}" not in allowedOrigins`)
        }
        return globalThis.fetch(url, options)
      },
    }
  }

  // Wire fs with path checks
  if (perms.has('fs.read') || perms.has('fs.write')) {
    const expandTilde = p => p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
    const allowedPaths = (manifest.allowedPaths || []).map(expandTilde)
    const checkPath = (p) => {
      const expanded = expandTilde(p)
      if (!allowedPaths.some(a => expanded.startsWith(a))) {
        throw new Error(`fs.read: path not in allowedPaths`)
      }
      return expanded
    }
    api.fs = {}
    if (perms.has('fs.read')) {
      api.fs.read = (filePath) => {
        const expanded = checkPath(filePath)
        return fs.readFileSync(expanded, 'utf8')
      }
    }
    if (perms.has('fs.write')) {
      api.fs.write = (filePath, content) => {
        if (typeof content !== 'string') throw new TypeError('fs.write: content must be a string')
        const expanded = checkPath(filePath)
        fs.mkdirSync(path.dirname(expanded), { recursive: true })
        fs.writeFileSync(expanded, content, 'utf8')
      }
    }
  }

  // Tier 3 — delete unpermitted
  if (!perms.has('network.fetch'))                      delete api.network
  if (!perms.has('fs.read') && !perms.has('fs.write')) {
    delete api.fs
  }

  // Tier 2 — UI
  if (!cont.pluginToolbar)        delete api.ui.getPluginToolbarMount
  if (!cont.statusBar)            delete api.ui.getStatusBarMount
  if (!perms.has('ui.modal'))     delete api.ui.showModal

  // Tier 1 — editor
  if (!perms.has('editor.insert')) delete api.editor.insertAtCursor
  if (!perms.has('editor.read')) {
    delete api.editor.getSelection
    delete api.editor.getDocument
  }

  // Tier 1 — settings
  if (!perms.has('settings.readwrite') && !perms.has('settings.read')) {
    delete api.settings
  } else if (!perms.has('settings.readwrite')) {
    delete api.settings.set
  }

  return Object.freeze(api)
}

module.exports = { PluginAPI, createScopedAPI }
