# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start            # run the app (Electron)
npm run dev          # run with Node inspector enabled (chrome://inspect)
npm run dist         # build macOS DMG (electron-builder, both x64 and arm64)
npm run install-local  # build arm64 dir-only and replace /Applications/Draftflow.app in one step
```

There are no tests.

## Architecture

Draftflow is a single-window Electron app. All code lives in three files:

- **`main.js`** — Electron main process. Handles app lifecycle, IPC handlers, file I/O, skill scanning, settings persistence, and the Claude Code bridge protocol (`draftflow://`).
- **`preload.js`** — Context bridge. Exposes `window.api` to the renderer with a strict allowlist of IPC calls. No direct Node access in the renderer.
- **`index.html`** — The entire renderer: all UI, CSS (CSS variables for theming), and JavaScript in one file. Uses `marked` and `mermaid` from `node_modules` loaded via `<script>` tags.

## New features
When building new features, add them to the features.md file

### DO NOT DO 
We are building a product here, think of any changes that needs to be distributed with a newer version. 

DONOT directly change ~/.claude/ files or anything directly in this machine, becasue then it will not work when we distribute the project as a product. 

Always do the changes in the main codebase and find a way to install it again.

### IPC pattern

The renderer calls `window.api.<method>()` → preload forwards via `ipcRenderer.invoke` → main handles via `ipcMain.handle`. All renderer↔main communication goes through this channel.

### Renderer globals

Two globals are set by the renderer and read by `main.js` during the close flow:

- `window.__isDirty` — boolean; `true` when there are unsaved edits
- `window.__triggerSave()` — called by main to save before close

### Claude Code bridge (`/df`)

The bridge uses a custom URL scheme (`draftflow://`) and a shared directory (`~/.claude/editor-bridge/`):

- `request.md` — written by the hook, opened by Draftflow
- `response.md` — written by Draftflow on "Send back", read by Claude Code

**How `/df` works end-to-end:**

1. User types `/df` in Claude Code.
2. `hooks/df_bridge.py` (a `UserPromptSubmit` hook) intercepts it: creates the bridge dir, clears stale `response.md`, writes `request.md`, opens Draftflow via the URL scheme, then outputs `{"decision": "block"}` — which prevents any LLM call and prints nothing to the terminal.
3. User edits the draft in Draftflow and clicks "Send back".
4. Draftflow writes `~/.claude/editor-bridge/response.md`.
5. User says "done" in Claude Code; the `/df` command (`commands/df.md`) reads `response.md` and uses it as the result.

The `/df` command and hook are installed from the app bundle to `~/.claude/` via **Settings → Install /df command** (`install-df-command` IPC handler in `main.js`).

**Source files that get installed:**

| Source (in repo) | Installed to |
|---|---|
| `commands/df.md` | `~/.claude/commands/df.md` |
| `hooks/df_bridge.py` | `~/.claude/hooks/df_bridge.py` |

Always edit the source files; they are what gets distributed.

### Skill scanning

`scanSkillPaths` in `main.js` walks configured directories (up to depth 8) looking for subdirectories with a `SKILL.md` file. It reads `name:` and `description:` from front matter. Directories matching `/agent|builder|creator|comms/i` are classified as agents; everything else is a skill.

In the editor, `#foo` triggers skill autocomplete and `/foo` triggers agent autocomplete.

### Contextual skill suggestions

When `settings.anthropic.apiKey` is set, the renderer calls `window.api.suggestSkills()` after a debounce. The main process sends the prompt + skill index to `claude-haiku-4-5-20251001` via the Anthropic API and returns ranked suggestions with confidence scores. Results are cached per prompt within a session.

### Settings

Persisted as JSON at `~/Library/Application Support/Draftflow/settings.json` (Electron `userData`). Key fields: `skillPaths`, `recentFiles`, `windowBounds`, `anthropic.apiKey`, `pluginDevPaths`.

## Plugins

### Plugin system overview

- **`src/plugin-loader.js`** — loads plugins at startup from `~/.draftflow/plugins/` (installed) and from `settings.pluginDevPaths` (dev, in-place, no copy).
- **`src/plugin-api.js`** — creates the scoped `api` object injected into each plugin's `initMain`.
- **`preload.js`** (top section) — renderer-side plugin loading; runs `initRenderer` for each plugin that declares one.
- Plugin IPC handlers live in `main.js` under the `── Plugin IPC ──` section.

### Bundled example plugin

`plugins/df-plugin-tokencount-example/` — a minimal reference plugin that ships with the app. Always keep this working; it's the reference for plugin authors.

### External plugins (developed separately)

External plugins live outside this repo. To work on one from this Claude Code session, read and edit files directly by path. The dev loop is:

1. Edit the plugin files (paths below).
2. In Draftflow: **Settings → Plugins → Reload & Restart**.
3. The app reloads and picks up your changes from disk — no install step.

**Known external plugins:**

| Plugin | Directory | CLAUDE.md |
|---|---|---|
| Voice Mode | `/Users/sameera/workspace/draftflow-project/draftflow-voice-plugin/` | `…/draftflow-voice-plugin/CLAUDE.md` |
| Mermaid Diagrams | `/Users/sameera/workspace/draftflow-project/draftflow-mermaid-plugin/` | — |

Read the plugin's own `CLAUDE.md` for its API usage, file roles, and constraints before making changes.

### Adding a new IPC handler for a plugin

1. Add `ipcMain.handle('plugin:<id>:<name>', ...)` in `main.js`.
2. Expose it in `preload.js` via `api.ipc.invoke('<name>', ...)` — plugins call this automatically namespaced.
3. Declare any new permissions in the plugin's `plugin.json` and add them to `KNOWN_PERMISSIONS` in `src/plugin-loader.js` if new.

### Scratch pad

Persisted at `~/.claude/draftflow-scratch.md`. Separate from the main draft; survives sessions.

### Debug log

Written to `~/.claude/draftflow-debug.log` by the `dbg()` helper in `main.js`. Covers URL scheme events and bridge open/send flows. Useful when debugging the `/df` bridge.

### Token counting

Uses `@anthropic-ai/tokenizer` if installed; falls back to `length / 4` estimate.

## Distribution

### ALWAYS release via GitHub Actions — never `npm run dist`

`npm run dist` builds locally without notarization. Locally-built DMGs trigger a Gatekeeper warning on first launch and are not suitable for distribution.

**To cut a release:**
1. Go to **Actions → Release → Run workflow** on GitHub
2. Choose the bump type (`patch` / `minor` / `major`)
3. The workflow handles everything: signs, notarizes, renames the DMG, creates the GitHub release, and updates the Homebrew cask

`npm run dist` and `npm run install-local` are for **local development only** (testing the app on your own machine before releasing).

The Homebrew cask lives at `sameera207/homebrew-draftflow`. The workflow updates it automatically. The repo must be public for Homebrew downloads to work.
