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

Persisted as JSON at `~/Library/Application Support/Draftflow/settings.json` (Electron `userData`). Key fields: `skillPaths`, `recentFiles`, `windowBounds`, `anthropic.apiKey`.

### Scratch pad

Persisted at `~/.claude/draftflow-scratch.md`. Separate from the main draft; survives sessions.

### Debug log

Written to `~/.claude/draftflow-debug.log` by the `dbg()` helper in `main.js`. Covers URL scheme events and bridge open/send flows. Useful when debugging the `/df` bridge.

### Token counting

Uses `@anthropic-ai/tokenizer` if installed; falls back to `length / 4` estimate.

## Distribution

Built with `electron-builder`. The Homebrew cask lives at `sameera207/homebrew-draftflow`. After building, upload the DMG to the GitHub release as `Draftflow-{version}.dmg` (without arch suffix) to match the cask URL. The repo must be public for Homebrew downloads to work.
