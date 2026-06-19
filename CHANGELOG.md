# Changelog

All notable changes to Draftflow are documented here.
Bold entries are highlighted on the website as featured changes.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.5.0] - 2026-06-19

### Added
- **Send-back echo — what you type in Draftflow appears quoted in the Claude Code terminal before Claude responds** *(fix shipping in 0.5.1)*
- **Plan mode badge — shows whether Claude Code is in plan or normal mode; visible whenever the send back button is active**
- **Mode switching — click the badge to toggle between plan and normal mode before sending back**

### Changed
- **`/df` now opens the last Claude response for review/editing; `/df n` opens a new empty draft**

### Fixed
- Homebrew cask upgrade failed with 404 — DMG now uploaded without arch suffix to match the cask URL

---

## [0.4.4] - 2026-06-17

### Fixed
- Mermaid rendering — orphaned temp containers left in `<body>` after each render are now cleaned up
- Mermaid v10 error SVGs (bomb icons) are now detected and replaced with a clean `⚠ Invalid Mermaid syntax` message
- `mermaid` is now a direct dependency

---

## [0.4.3] - 2026-05-26

### Fixed
- Support `.claude-plugin/` manifest location for dev plugins
- `/df p` falls through to blank draft when no prior response exists

---

## [0.4.2] - 2026-05-26

### Added
- **Plugin system — install and develop plugins that extend Draftflow's editor and main process**
- **Voice mode plugin — record voice and send the transcript directly to Claude Code**
- External plugin dev paths — point Draftflow at a local plugin directory; reload without reinstalling

---

## [0.4.1] - 2026-05-16

### Added
- **Contextual skill suggestions — as you type, Draftflow surfaces relevant skills as chips below the editor (powered by claude-haiku)**
- Skill suggestion confidence scores and caching per session

---

## [0.4.0] - 2026-05-16

### Added
- **`/df p` — open Claude's last response in Draftflow for review or plan editing**
- Plan-edit mode — when the last response was a plan, it loads into the editor for direct editing
- In-hook polling — the bridge hook polls inside the hook process; no "done" step needed
- Session-aware last-response tracking via transcript path

---

## [0.3.0] - 2026-05-10

### Added
- **Scratch pad — a persistent scratchpad (`~/.claude/draftflow-scratch.md`) that survives sessions**
- Window bounds persistence across restarts

---

## [0.2.0] - 2026-04-20

### Added
- **Skill & agent autocomplete — `#keyword` for skills, `/keyword` for agents, with hover preview**
- Fuzzy match with inline preview before inserting
- Agent badge rendering in preview pane

---

## [0.1.x] - 2026-03-01

### Added
- Initial release — markdown editor with live preview, Mermaid support, and the `/df` Claude Code bridge
- Edit / split / preview mode toggle
- Word count, token count, cursor position in statusbar
- Unsaved-changes guard
- Auto-update via `electron-updater`
