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
])

const KNOWN_CONTRIBUTES = new Set([
  'pluginToolbar', 'statusBar', 'commands',
])

async function loadPlugins() {
  const pluginDir = path.join(os.homedir(), '.draftflow', 'plugins')

  if (!fs.existsSync(pluginDir)) {
    console.log('[plugins] directory not found:', pluginDir)
    return []
  }

  const entries = fs.readdirSync(pluginDir, { withFileTypes: true })
    .filter(e => e.isDirectory())

  const loaded = []

  for (const entry of entries) {
    const pluginPath   = path.join(pluginDir, entry.name)
    const manifestPath = path.join(pluginPath, 'plugin.json')

    if (!fs.existsSync(manifestPath)) {
      console.warn(`[plugins] skipping "${entry.name}": no plugin.json`)
      continue
    }

    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      console.warn(`[plugins] skipping "${entry.name}": plugin.json is not valid JSON`)
      continue
    }

    const validation = validateManifest(manifest, entry.name)
    if (!validation.ok) {
      console.warn(`[plugins] skipping "${entry.name}": ${validation.error}`)
      continue
    }

    const entryFile = path.join(pluginPath, manifest.main ?? 'index.js')

    if (!fs.existsSync(entryFile)) {
      console.warn(`[plugins] skipping "${entry.name}": entry file not found: ${entryFile}`)
      continue
    }

    let pluginExport
    try {
      pluginExport = require(entryFile)
    } catch (e) {
      console.error(`[plugins] failed to require "${entry.name}":`, e.message)
      continue
    }

    const normalised = normaliseExport(pluginExport)
    const api        = createScopedAPI(manifest, manifest.id)

    if (normalised.initMain) {
      try {
        await normalised.initMain(api)
      } catch (e) {
        console.error(`[plugins] initMain failed for "${manifest.id}":`, e.message)
        continue
      }
    }

    loaded.push({
      id:           manifest.id,
      name:         manifest.name,
      version:      manifest.version,
      manifest,
      initRenderer: normalised.initRenderer ?? null,
      api,
    })

    console.log(`[plugins] loaded: ${manifest.name} v${manifest.version}`)
  }

  return loaded
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

function validateManifest(manifest, dirName) {
  if (!manifest.id || typeof manifest.id !== 'string') {
    return { ok: false, error: 'manifest.id must be a non-empty string' }
  }
  if (/[\s/\\]/.test(manifest.id)) {
    return { ok: false, error: 'manifest.id must contain no spaces, slashes, or backslashes' }
  }
  if (manifest.id !== dirName) {
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
