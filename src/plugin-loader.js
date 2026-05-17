const path = require('path')
const os   = require('os')
const fs   = require('fs')
const { createScopedAPI } = require('./plugin-api')

const KNOWN_PERMISSIONS = new Set([
  'editor.insert', 'editor.read',
  'settings.read', 'settings.readwrite',
  'network.fetch',
  'fs.read', 'fs.write',
  'ui.pluginToolbar', 'ui.statusBar', 'ui.modal',
  'bridge.watch', 'bridge.send', 'app.setMode',
])

const KNOWN_CONTRIBUTES = new Set([
  'pluginToolbar', 'statusBar', 'commands',
])

function expandPath(p) {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
}

async function loadPlugins(options = {}) {
  const { devPaths = [] } = options
  const pluginDir = path.join(os.homedir(), '.draftflow', 'plugins')

  const loaded = []
  const loadedIds = new Set()

  // Installed plugins from ~/.draftflow/plugins/
  if (fs.existsSync(pluginDir)) {
    for (const entry of fs.readdirSync(pluginDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const plugin = await _loadPlugin(path.join(pluginDir, entry.name), entry.name, false)
      if (plugin && !loadedIds.has(plugin.id)) {
        loaded.push(plugin)
        loadedIds.add(plugin.id)
      }
    }
  }

  // Dev plugins loaded in-place from configured paths (id=dirname check relaxed)
  for (const devPath of devPaths) {
    const expanded = expandPath(devPath)
    if (!fs.existsSync(expanded)) {
      console.warn(`[plugins] dev path not found: ${expanded}`)
      continue
    }
    const plugin = await _loadPlugin(expanded, null, true)
    if (plugin && !loadedIds.has(plugin.id)) {
      loaded.push(plugin)
      loadedIds.add(plugin.id)
    }
  }

  return loaded
}

async function _loadPlugin(pluginPath, dirName, isDev) {
  const manifestPath = path.join(pluginPath, 'plugin.json')
  if (!fs.existsSync(manifestPath)) {
    if (dirName) console.warn(`[plugins] skipping "${dirName}": no plugin.json`)
    return null
  }

  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    console.warn(`[plugins] skipping "${dirName ?? pluginPath}": plugin.json is not valid JSON`)
    return null
  }

  const validation = validateManifest(manifest, dirName)
  if (!validation.ok) {
    console.warn(`[plugins] skipping "${dirName ?? manifest.id ?? pluginPath}": ${validation.error}`)
    return null
  }

  const entryFile = path.join(pluginPath, manifest.main ?? 'index.js')
  if (!fs.existsSync(entryFile)) {
    console.warn(`[plugins] skipping "${manifest.id}": entry file not found: ${entryFile}`)
    return null
  }

  let pluginExport
  try {
    pluginExport = require(entryFile)
  } catch (e) {
    console.error(`[plugins] failed to require "${manifest.id}":`, e.message)
    return null
  }

  const normalised = normaliseExport(pluginExport)
  const api        = createScopedAPI(manifest, manifest.id)

  if (normalised.initMain) {
    try {
      await normalised.initMain(api)
    } catch (e) {
      console.error(`[plugins] initMain failed for "${manifest.id}":`, e.message)
      return null
    }
  }

  console.log(`[plugins] loaded${isDev ? ' (dev)' : ''}: ${manifest.name} v${manifest.version}`)

  return {
    id:           manifest.id,
    name:         manifest.name,
    version:      manifest.version,
    isDev,
    pluginPath,
    manifest,
    initRenderer: normalised.initRenderer ?? null,
    api,
  }
}

function normaliseExport(exp) {
  if (typeof exp === 'function') {
    return { initMain: null, initRenderer: exp }
  }
  if (exp && typeof exp === 'object') {
    return {
      initMain:     typeof exp.initMain     === 'function' ? exp.initMain     : null,
      initRenderer: typeof exp.initRenderer === 'function' ? exp.initRenderer : null,
    }
  }
  return { initMain: null, initRenderer: null }
}

// dirName=null means skip the id-matches-dirname check (used for dev paths)
function validateManifest(manifest, dirName) {
  if (!manifest.id || typeof manifest.id !== 'string') {
    return { ok: false, error: 'manifest.id must be a non-empty string' }
  }
  if (/[\s/\\]/.test(manifest.id)) {
    return { ok: false, error: 'manifest.id must contain no spaces, slashes, or backslashes' }
  }
  if (dirName !== null && manifest.id !== dirName) {
    return { ok: false, error: `manifest.id "${manifest.id}" must match directory name "${dirName}"` }
  }
  if (!manifest.name || typeof manifest.name !== 'string') {
    return { ok: false, error: 'manifest.name must be a non-empty string' }
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    return { ok: false, error: `manifest.version "${manifest.version}" must match /^\\d+\\.\\d+\\.\\d+$/` }
  }
  if (manifest.main !== undefined && (typeof manifest.main !== 'string' || !manifest.main.endsWith('.js'))) {
    return { ok: false, error: 'manifest.main must be a string ending in ".js"' }
  }
  if (manifest.permissions !== undefined && !Array.isArray(manifest.permissions)) {
    return { ok: false, error: 'manifest.permissions must be an array' }
  }
  for (const perm of (manifest.permissions || [])) {
    if (!KNOWN_PERMISSIONS.has(perm)) {
      return { ok: false, error: `unknown permission: "${perm}"` }
    }
  }
  if (manifest.contributes !== undefined &&
      (typeof manifest.contributes !== 'object' || Array.isArray(manifest.contributes))) {
    return { ok: false, error: 'manifest.contributes must be a plain object' }
  }
  for (const key of Object.keys(manifest.contributes || {})) {
    if (!KNOWN_CONTRIBUTES.has(key)) {
      return { ok: false, error: `unknown contributes key: "${key}"` }
    }
  }
  if ((manifest.permissions || []).includes('network.fetch')) {
    const ao = manifest.allowedOrigins
    if (!Array.isArray(ao) || ao.length === 0 || !ao.every(o => typeof o === 'string' && o.startsWith('https://'))) {
      return { ok: false, error: 'network.fetch requires allowedOrigins (https:// strings)' }
    }
  }
  if ((manifest.permissions || []).some(p => p === 'fs.read' || p === 'fs.write')) {
    const ap = manifest.allowedPaths
    if (!Array.isArray(ap) || ap.length === 0) {
      return { ok: false, error: 'fs permissions require allowedPaths' }
    }
  }
  return { ok: true }
}

module.exports = { loadPlugins }
