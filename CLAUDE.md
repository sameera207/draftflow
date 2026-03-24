# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # run the app (Electron)
npm run dev      # run with Node inspector enabled
npm run dist     # build macOS DMG (electron-builder)
```

There are no tests.

## Architecture

Draftflow is a single-window Electron app. All code lives in three files:

- **`main.js`** — Electron main process. Handles the app lifecycle, IPC handlers, file I/O, skill scanning, settings persistence, and the Claude Code bridge protocol (`draftflow://`).
- **`preload.js`** — Context bridge. Exposes `window.api` to the renderer with a strict allowlist of IPC calls. No direct Node access in the renderer.
- **`index.html`** — The entire renderer: all UI, CSS (CSS variables for theming), and JavaScript in one file. Uses `marked` and `mermaid` from `node_modules` loaded via `<script>` tags.

### IPC pattern

The renderer calls `window.api.<method>()` → preload forwards via `ipcRenderer.invoke` → main process handles via `ipcMain.handle`. All renderer↔main communication goes through this channel.

### Claude Code bridge (`/df`)

The bridge uses a custom URL scheme (`draftflow://`) and a shared directory (`~/.claude/editor-bridge/`):

- `request.md` — written by Claude Code, opened by Draftflow
- `response.md` — written by Draftflow on "Send back", read by Claude Code

The `/df` command is defined in `commands/df.md` and installed to `~/.claude/commands/df.md` via Settings.

### Skill scanning

`main.js:scanSkillPaths` walks configured directories looking for subdirectories containing a `SKILL.md` file. It reads `name:` and `description:` from front matter. Directories matching `/agent|builder|creator|comms/i` are classified as agents; everything else is a skill.

### Settings

Persisted as JSON at `~/Library/Application Support/Draftflow/settings.json` (Electron `userData`). Key fields: `skillPaths`, `recentFiles`, `windowBounds`, `anthropic.apiKey`.

### Contextual skill suggestions

When `settings.anthropic.apiKey` is set, the renderer calls `window.api.suggestSkills()` after a debounce. The main process sends the prompt + skill index to `claude-haiku-4-5-20251001` via the Anthropic API and returns ranked suggestions with confidence scores. Results are cached per prompt within a session.

### Token counting

Uses `@anthropic-ai/tokenizer` if installed; falls back to `length / 4` estimate.

## Distribution

Built with `electron-builder`. The Homebrew cask lives at `sameera207/homebrew-draftflow`. After building, upload the DMG to the GitHub release as `Draftflow-{version}.dmg` (without arch suffix) to match the cask URL. The repo must be public for Homebrew downloads to work.
