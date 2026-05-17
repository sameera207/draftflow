const { startRecording, stopRecording } = require('./recorder')
const { transcribe }                    = require('./transcribe')

let _recording = false

module.exports = {
  initRenderer(api) {
    console.log('[vm] initRenderer v0.2')

    const mount = api.ui.getPluginToolbarMount()

    const btn = document.createElement('button')
    btn.id        = 'voice-mode-btn'
    btn.className = 'df-plugin-btn'
    btn.title     = 'Record voice — transcript appends to editor'
    btn.innerHTML = micIcon() + ' voice'
    btn.addEventListener('click', () => _handleClick(api))
    mount.appendChild(btn)

    const settingsBtn = document.createElement('button')
    settingsBtn.id        = 'voice-mode-settings-btn'
    settingsBtn.className = 'df-plugin-btn'
    settingsBtn.title     = 'Voice mode settings (OpenAI API key)'
    settingsBtn.innerHTML = '⚙'
    settingsBtn.addEventListener('click', () => _showSettings(api))
    mount.appendChild(settingsBtn)
  },
}

async function _handleClick(api) {
  if (_recording) {
    console.log('[vm] stopping recording')
    stopRecording()
    return
  }

  let apiKey = await api.settings.get('openaiApiKey')
  console.log('[vm] apiKey present:', !!apiKey)
  if (!apiKey) {
    apiKey = await _showApiKeyDialog()
    if (!apiKey) return
    await api.settings.set('openaiApiKey', apiKey)
  }

  _record(api, apiKey)
}

async function _record(api, apiKey) {
  _recording = true
  _setBtn('recording')
  console.log('[vm] recording...')

  let blob
  try {
    blob = await startRecording()
    console.log('[vm] blob size:', blob?.size)
  } catch (e) {
    console.error('[vm] mic error:', e.message)
    _recording = false
    _setBtn('idle')
    return
  }

  _recording = false
  _setBtn('transcribing')
  console.log('[vm] transcribing...')

  try {
    const transcript = await transcribe(blob, apiKey, api)
    console.log('[vm] transcript:', JSON.stringify(transcript))
    if (transcript) {
      api.editor.insertAtCursor(transcript)
      console.log('[vm] inserted into editor')
    }
  } catch (e) {
    console.error('[vm] error after recording:', e.message)
  } finally {
    _setBtn('idle')
  }
}

function _setBtn(state) {
  const btn = document.getElementById('voice-mode-btn')
  if (!btn) return
  if (state === 'recording') {
    btn.className = 'df-plugin-btn df-plugin-btn--danger'
    btn.innerHTML = stopIcon() + ' stop'
  } else if (state === 'transcribing') {
    btn.className = 'df-plugin-btn'
    btn.innerHTML = '… voice'
    btn.disabled  = true
  } else {
    btn.className = 'df-plugin-btn'
    btn.innerHTML = micIcon() + ' voice'
    btn.disabled  = false
  }
}

async function _showSettings(api) {
  const key = await _showApiKeyDialog()
  if (key) await api.settings.set('openaiApiKey', key)
}

function _showApiKeyDialog() {
  if (document.getElementById('vm-apikey-input')) {
    document.getElementById('vm-apikey-input').focus()
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const backdrop = document.createElement('div')
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center'

    const box = document.createElement('div')
    box.style.cssText = [
      'background:var(--df-surface,#211f1c)',
      'border:1px solid var(--df-border-strong,rgba(255,255,255,0.13))',
      'border-radius:8px', 'padding:20px', 'max-width:440px', 'min-width:320px',
      'width:90%', 'font-family:var(--df-font-mono,monospace)',
      'display:flex', 'flex-direction:column', 'gap:12px',
    ].join(';')

    box.innerHTML = `
      <div style="font-size:0.82rem;font-weight:500;color:var(--df-text,#e8e3dc)">OpenAI API Key</div>
      <div style="font-size:0.72rem;color:var(--df-text-muted,#8a8278);line-height:1.5">
        Required for Whisper transcription.<br>Stored locally in ~/.draftflow/settings.json.
      </div>
      <input id="vm-apikey-input" type="password" placeholder="sk-..."
        style="background:var(--df-surface-2,#2a2724);border:1px solid var(--df-border-strong,rgba(255,255,255,0.13));border-radius:4px;padding:8px 10px;font-family:var(--df-font-mono,monospace);font-size:0.78rem;color:var(--df-text,#e8e3dc);outline:none;width:100%;box-sizing:border-box">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="vm-apikey-cancel" class="df-plugin-btn">Cancel</button>
        <button id="vm-apikey-save"   class="df-plugin-btn df-plugin-btn--active">Save</button>
      </div>
    `

    backdrop.appendChild(box)
    document.body.appendChild(backdrop)

    const input = document.getElementById('vm-apikey-input')
    setTimeout(() => input.focus(), 50)

    const close = (result) => { document.body.removeChild(backdrop); resolve(result) }
    document.getElementById('vm-apikey-save').addEventListener('click', () => close(input.value.trim() || null))
    document.getElementById('vm-apikey-cancel').addEventListener('click', () => close(null))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); close(input.value.trim() || null) }
      if (e.key === 'Escape') { e.preventDefault(); close(null) }
    })
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null) })
  })
}

function micIcon() {
  return `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"
    stroke="currentColor" stroke-width="1.6">
    <rect x="5" y="1" width="6" height="9" rx="3"/>
    <path d="M2 8c0 3.3 2.7 6 6 6s6-2.7 6-6"/>
    <line x1="8" y1="14" x2="8" y2="16"/>
  </svg>`
}

function stopIcon() {
  return `<svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="3" width="10" height="10" rx="1"/>
  </svg>`
}
