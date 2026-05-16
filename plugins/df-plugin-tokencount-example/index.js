// df-plugin-tokencount-example — Token Counter
//
// This is the reference plugin bundled with Draftflow.  Read it to understand
// how the plugin API works before writing your own.
//
// A plugin module exports an object with up to two lifecycle functions:
//
//   initMain(api)     — runs in the Electron main process before the window
//                       opens.  Use it to register IPC handlers, start
//                       background watchers, or do any Node-only setup.
//
//   initRenderer(api) — runs in the renderer (browser) context after the DOM
//                       is ready.  Use it to build UI and subscribe to events.
//
// The `api` object is scoped to your plugin and enforces the permissions you
// declared in plugin.json.  Calling a method your plugin didn't request will
// throw at runtime, so the manifest is the authoritative list of capabilities.

module.exports = {

  // ── Phase 1: main process ──────────────────────────────────────────────────

  async initMain(api) {
    // api.ipc.handle(name, fn) registers a main-process IPC handler that only
    // your plugin can call.  The channel is automatically namespaced to
    // `plugin:<your-id>:<name>` so it can never clash with Draftflow's own IPC
    // or with another plugin's handlers.
    //
    // This is the recommended pattern for any main-process work a plugin needs
    // to expose to its renderer phase.  The core plugin API never needs to grow
    // for plugin-specific functionality — each plugin owns its own IPC surface.
    api.ipc.handle('count-tokens', (text) => {
      // Try to load @anthropic-ai/tokenizer, which Draftflow ships in its
      // node_modules.  This gives an accurate token count for the Claude models.
      // If the package isn't available we fall back to the standard heuristic
      // of one token ≈ four characters.
      let tokenizer = null
      try { tokenizer = require('@anthropic-ai/tokenizer') } catch (_) {}
      if (tokenizer) {
        try { return tokenizer.countTokens(text) } catch (_) {}
      }
      return Math.ceil(text.length / 4)
    })

    console.log('[df-plugin-tokencount-example] initMain: count-tokens handler registered')
  },

  // ── Phase 2: renderer ──────────────────────────────────────────────────────

  async initRenderer(api) {
    // ── 1. Claim the toolbar mount ──────────────────────────────────────────
    //
    // api.ui.getPluginToolbarMount() returns the <div> that Draftflow reserved
    // for this plugin in the plugin toolbar strip.  Append whatever DOM you
    // need inside it.
    //
    // Requires "ui.pluginToolbar" in both `permissions` and
    // `contributes.pluginToolbar: true` in plugin.json.
    const mount = api.ui.getPluginToolbarMount()

    // ── 2. Build the badge element ──────────────────────────────────────────
    //
    // A plain <span> styled with Draftflow's CSS variables so it automatically
    // respects the active theme (dark / light).
    //
    // Available CSS variables are defined in src/plugin-styles.css:
    //   --df-text, --df-text-muted, --df-text-faint
    //   --df-accent  (warm highlight colour)
    //   --df-danger  (red warning colour)
    //   --df-font-mono, --df-plugin-btn-height
    const badge = document.createElement('span')
    badge.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'height:var(--df-plugin-btn-height)',
      'padding:0 6px',
      'font-size:0.68rem',
      'font-family:var(--df-font-mono)',
      'letter-spacing:0.03em',
      'user-select:none',
      '-webkit-user-select:none',
      'color:var(--df-text-faint)',  // start faint; updateCount() adjusts this
      'transition:color 0.2s',
    ].join(';')

    mount.appendChild(badge)

    // ── 3. Colour thresholds ────────────────────────────────────────────────
    //
    // Give the user a visual signal as the draft grows toward context limits.
    // Colours come from CSS variables so they work in both themes for free.
    function colorForTokens(n) {
      if (n === 0)    return 'var(--df-text-faint)'   // empty draft
      if (n < 1000)  return 'var(--df-text-muted)'   // small   — neutral
      if (n < 4000)  return 'var(--df-accent)'        // medium  — warm
      return                 'var(--df-danger)'        // large   — alert
    }

    // ── 4. Update function ──────────────────────────────────────────────────
    //
    // api.editor.getDocument() reads the editor textarea content.
    // Requires the "editor.read" permission in plugin.json.
    //
    // api.ipc.invoke(name, ...args) calls the handler your plugin registered
    // in initMain via api.ipc.handle().  It's async because it crosses the
    // main/renderer process boundary.  Fire-and-forget is fine for a badge —
    // a frame of lag is invisible to the user.
    async function updateCount() {
      const text   = api.editor.getDocument()
      const tokens = await api.ipc.invoke('count-tokens', text)

      badge.textContent = tokens === 0 ? '0 tok' : `~${tokens} tok`
      badge.style.color = colorForTokens(tokens)
    }

    // ── 5. Live updates while the user types ────────────────────────────────
    //
    // The plugin API has no "editor changed" event — it would fire hundreds of
    // times per second and most plugins don't need it.  Instead, attach
    // directly to the editor <textarea>'s native DOM `input` event, which
    // fires on every keystroke or paste.
    //
    // initRenderer runs in the preload script context, which has full DOM
    // access alongside Node.js access — direct document.getElementById() calls
    // are safe here even though they would be dangerous in untrusted web code.
    const editor = document.getElementById('editor')
    if (editor) {
      editor.addEventListener('input', updateCount)
    }

    // ── 6. Lifecycle events ─────────────────────────────────────────────────
    //
    // api.events.on(name, handler) subscribes to events emitted by the main
    // process.  Available event names:
    //
    //   'app:ready'       — fires once after all plugins have initialised
    //   'file:opened'     — fires when the user opens a file (payload: { path })
    //   'file:saved'      — fires after a successful save  (payload: { path })
    //   'send:triggered'  — fires when the user clicks Send (payload: { content })
    //   'theme:changed'   — fires when the theme switches   (payload: { theme })
    //
    // setTimeout(0) on file:opened gives the renderer one tick to update the
    // textarea before we read it, since the file content arrives via a separate
    // IPC message that may settle just after this event fires.
    api.events.on('file:opened', () => setTimeout(updateCount, 0))

    // Initial count so the badge is populated as soon as the toolbar appears.
    api.events.on('app:ready', updateCount)
  },
}
