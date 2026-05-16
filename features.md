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
- `/df` command — open a draft in Draftflow directly from Claude Code, edit it, and send it back in one click
- `/df p` — open Claude's previous response (e.g. a plan) in the preview pane for review; type notes in the editor and send only the notes back; the plan is never re-sent
- Plan-edit mode — when `/df p` targets a plan-mode response, the plan loads into the preview but the editor stays fully writable for annotations
- "Send back" button — writes the editor content to the shared bridge file so Claude Code can read it; the hook picks it up automatically without the user needing to say "done"
- "Send to Claude" button — copies editor content to clipboard, ready to paste into Claude Code
- In-hook polling — the `df_bridge.py` hook polls for the response inside the hook process; for `/df p` (review mode), the edited content is injected directly into Claude's context via `additionalContext` so Claude acts on it immediately without any extra step
- Review mode send-back — includes both the original review content and any notes typed in the editor, so Claude sees the full picture

## Background Hooks (auto-installed)
- `df_bridge.py` (`UserPromptSubmit`) — intercepts `/df` commands in Claude Code; opens Draftflow, polls for the response, and injects the edited content back into the Claude Code session
- `save_last_response.py` (`Stop`) — runs after every Claude Code session stops; saves the last assistant response (including plan-mode output) to `~/.claude/editor-bridge/last-response.md` so `/df p` always has fresh content
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

## Plugin System
- First-class plugin architecture — plugins live in `~/.draftflow/plugins/<name>/` and declare capabilities via a `plugin.json` manifest
- Scoped `PluginAPI` — each plugin receives an API scoped to only the capabilities it declared; unpermitted methods are deleted at load time, not just blocked
- Two-phase lifecycle — `initMain` runs in the main process before the window opens; `initRenderer` runs in the renderer after DOM is ready
- Plugin toolbar — a dedicated toolbar strip (between the editor toolbar and content area) with one mount div per loaded plugin; hidden when no plugins are loaded
- Lifecycle events — plugins subscribe to `file:opened`, `file:saved`, `send:triggered`, `theme:changed`, and `app:ready`
- Namespaced settings — plugins read/write `~/.draftflow/settings.json` with keys automatically namespaced to `<pluginId>.<key>`
- Permission model — nine granular permissions (`editor.insert`, `editor.read`, `settings.read`, `settings.readwrite`, `network.fetch`, `fs.read`, `fs.write`, `ui.pluginToolbar`, `ui.modal`) with `allowedOrigins` and `allowedPaths` guards
- HTML modal API — `api.ui.showModal()` renders a Draftflow-managed modal with sanitized content (DOM whitelist: `p`, `strong`, `em`, `code`, `pre`, `br`)
- Keyboard command registration — plugins register commands with Electron accelerator shortcuts via `api.commands.register()`
- Silent failure isolation — a plugin that fails validation, load, or `initMain` is skipped with a console warning; other plugins continue normally
- `df-hello` smoke-test plugin bundled as a reference implementation

## Appearance
- Dark and light theme
- Three font-size levels (small / medium / large)
- macOS native title bar (hiddenInset style); custom window controls on Windows
