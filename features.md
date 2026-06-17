# Draftflow Features

## Distribution & Updates
- Apple Developer ID code signing — no Gatekeeper warning on first launch
- Notarization — Apple-verified builds stapled to every DMG release
- Silent background auto-update via `electron-updater` — downloads on launch, installs on next restart with a native macOS notification

## Editor
- Markdown editor with live split-pane preview
- Edit / split / preview mode toggle
- Mermaid diagram rendering in preview
- Real-time word count and token count (powered by `@anthropic-ai/tokenizer`)
- Cursor position indicator (line / column)
- Unsaved-changes guard — prompts to save before closing
- Window bounds (size and position) persisted across sessions

## Claude Code Bridge
- `/df` — pulls Claude's last response into Draftflow for review or editing; if the response was a plan, it loads in plan-edit mode
- `/df n` — opens a new empty draft
- `/df [content]` — opens Draftflow pre-filled with the given text
- Plan-edit mode — when the last response was a plan, it loads into the editor for direct annotation or rewriting
- "Send back" button — writes the editor content to the shared bridge file; Claude Code picks it up immediately via `additionalContext`, no extra "done" step needed
- Send-back echo — the content sent back appears quoted in the Claude Code terminal so the user can see what was submitted
- "Send to Claude" button — copies editor content to clipboard, ready to paste into any Claude session
- Plan mode badge — shows whether Claude Code is currently in plan or normal mode; visible whenever the send back button is active
- Mode switching — click the badge to toggle plan/normal mode before sending back; the hook includes the mode switch instruction in Claude's context

## Background Hooks (auto-installed)
- `df_bridge.py` (`UserPromptSubmit`) — intercepts `/df` commands in Claude Code; opens Draftflow, polls for the response, and injects the edited content back into the session via `additionalContext`
- Both hooks are auto-installed (and kept up to date) every time Draftflow launches — no manual setup required after the first run

## Skill & Agent Autocomplete
- `#keyword` triggers fuzzy skill autocomplete inline
- `@keyword` triggers fuzzy agent autocomplete inline
- Hover preview — see a skill's full description without leaving the editor
- Skill name-only insert — copies just the skill reference, not the full content
- `@agentname` references in the preview pane render as styled badges

## Contextual Skill Suggestions
- As you type, Draftflow proactively surfaces relevant skills and agents as chips below the editor — no trigger character needed
- Powered by `claude-haiku-4-5-20251001` via the Anthropic API
- Suggestions include a confidence score and a brief reason
- Results are cached per prompt within a session to avoid redundant API calls
- Silently disabled when no API key is configured

## Project & File Management
- Open, save, and save-as for Markdown files
- Recent files panel — scoped to the current project directory; shows file name, relative time, and first-line preview
- Project tree — shows all files in the current project, rooted at the nearest `CLAUDE.md`
- File type icons in the project tree (Markdown, code, image, data/config, and generic)
- Non-Markdown files shown as dimmed and non-clickable in the tree

## Scratchpad
- Persistent scratchpad separate from the main editor — survives sessions
- Auto-saved to `~/.claude/draftflow-scratch.md`
- Can be exported to a file via "save as file…"

## Settings
- Configurable skill and agent scan paths with labels
- Anthropic API key field for contextual suggestions (show/hide toggle)
- Suggestion confidence threshold and max suggestions
- One-click re-install of the `/df` Claude Code command and hooks (also runs automatically on launch)

## What's New
- Modal shown automatically on first launch after an update, displaying new features for that version
- Carousel navigation when multiple features are in a release
- Revisit any time via Help → What's New
- Fetches live from `releases.json` — always up to date without an app update

## Feedback
- In-app feedback form — accessible from Help → Send Feedback or the `?` button in the status bar
- Category picker: Bug, Idea, or Question
- Collapsible diagnostics preview (app version, macOS, Node, bridge mode, last 20 error log lines)
- Opt-out checkbox to exclude diagnostic info from submission
- Submissions are POSTed to the `draftflow-feedback` proxy service, which creates a GitHub issue on the user's behalf — no GitHub account required
- Success state shows a direct link to the created GitHub issue

## Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `⌘P` | Open quick-open palette (files, recent, skills) |
| `⌘K` | Toggle scratchpad |
| `⌘S` | Save current file |
| `⌘⇧S` | Save as… |
| `⌘O` | Open file |
| `⌘N` | New file |

## Voice Mode
- Hands-free voice conversation loop — listen → transcribe → review → send → wait for Claude Code → display response → listen again
- OpenAI Whisper API transcription (API key stored locally in `~/.draftflow/settings.json`)
- Full-screen voice overlay replaces the editor while active; exit any time via Escape, the overlay exit button, or the toolbar button
- Review and edit the transcript before sending — or discard and re-record
- Bridge integration — sends prompts directly to Claude Code via the `editor-bridge` protocol; picks up responses automatically when `response.md` changes
- Activated via the plugin toolbar button or `Cmd+Shift+V`

## Plugin System
- First-class plugin architecture — plugins live in `~/.draftflow/plugins/<name>/` and declare capabilities via a `plugin.json` manifest
- Scoped `PluginAPI` — each plugin receives an API scoped to only the capabilities it declared; unpermitted methods are deleted at load time, not just blocked
- Two-phase lifecycle — `initMain` runs in the main process before the window opens; `initRenderer` runs in the renderer after DOM is ready
- Plugin toolbar — a dedicated toolbar strip (between the editor toolbar and content area) with one mount div per loaded plugin; hidden when no plugins are loaded
- Status bar mounts — plugins can also mount UI into the status bar via `contributes.statusBar` and `api.ui.getStatusBarMount()`
- Lifecycle events — plugins subscribe to `file:opened`, `file:saved`, `send:triggered`, `theme:changed`, `app:ready`, and `app:modeChanged`
- Namespaced settings — plugins read/write `~/.draftflow/settings.json` with keys automatically namespaced to `<pluginId>.<key>`
- Permission model — thirteen granular permissions (`editor.insert`, `editor.read`, `settings.read`, `settings.readwrite`, `network.fetch`, `fs.read`, `fs.write`, `ui.pluginToolbar`, `ui.statusBar`, `ui.modal`, `bridge.watch`, `bridge.send`, `app.setMode`) with `allowedOrigins` (for `network.fetch`) and `allowedPaths` (for `fs.*`) guards
- Editor read API — `api.editor.getSelection()` and `api.editor.getDocument()` expose the current selection and full document text (requires `editor.read`)
- HTML modal API — `api.ui.showModal()` renders a Draftflow-managed modal with sanitized content (DOM whitelist: `p`, `strong`, `em`, `code`, `pre`, `br`)
- Keyboard command registration — plugins register commands with Electron accelerator shortcuts via `api.commands.register()`
- Generic IPC bridge — `api.ipc.handle(name, fn)` in `initMain` and `api.ipc.invoke(name, ...args)` in `initRenderer` let plugins expose main-process logic to their renderer code; channels are auto-namespaced to `plugin:<id>:<name>`
- Bridge API — `api.bridge.watch/unwatch/read` (requires `bridge.watch`) and `api.bridge.send/clear` (requires `bridge.send`) give plugins direct access to the Claude Code editor-bridge protocol
- App mode API — `api.app.setMode(name)`, `api.app.exitMode(name)`, `api.app.getMode()` let plugins drive full-screen overlay modes like voice mode (requires `app.setMode`)
- Silent failure isolation — a plugin that fails validation, load, or `initMain` is skipped with a console warning; other plugins continue normally
- `df-plugin-tokencount-example` bundled as a reference implementation

## Appearance
- Dark and light theme
- Three font-size levels (small / medium / large)
- macOS native title bar (hiddenInset style); custom window controls on Windows
