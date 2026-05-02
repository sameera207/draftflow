# Draftflow Features

## Editor
- Markdown editor with live split-pane preview
- Edit / split / preview mode toggle
- Mermaid diagram rendering in preview
- Real-time word count and token count (powered by `@anthropic-ai/tokenizer`)
- Cursor position indicator (line / column)
- Unsaved-changes guard — prompts to save before closing

## Claude Code Bridge
- `/df` command — open a draft in Draftflow directly from Claude Code, edit it, and send it back in one click
- `/df p` — open Claude's previous response (e.g. a plan) in the preview pane for review; type notes in the editor and send only the notes back; the plan is never re-sent
- "Send back" button — writes the editor content to the shared bridge file so Claude Code can read it
- "Send to Claude" button — copies editor content to clipboard, ready to paste into Claude Code

## Skill & Agent Autocomplete
- `#keyword` triggers fuzzy skill autocomplete inline
- `/keyword` triggers fuzzy agent autocomplete inline
- Hover preview — see a skill's full description without leaving the editor
- Skill name-only insert — copies just the skill reference, not the full content

## Contextual Skill Suggestions
- As you type, Draftflow proactively surfaces relevant skills and agents as chips below the editor — no trigger character needed
- Powered by `claude-haiku-4-5-20251001` via the Anthropic API
- Suggestions include a confidence score and a brief reason
- Results are cached per prompt within a session to avoid redundant API calls
- Silently disabled when no API key is configured

## Project & File Management
- Open, save, and save-as for Markdown files
- Recent files panel — scoped to the current project directory
- Project tree — shows all files in the current project, rooted at the nearest `CLAUDE.md`
- File type icons in the project tree (Markdown, code, image, data/config, and generic)
- Non-Markdown files shown as dimmed and non-clickable in the tree

## Scratchpad
- Persistent scratchpad separate from the main editor — survives sessions
- Auto-saved to `~/.claude/draftflow-scratch.md`
- Can be exported to a file via "save as file…"

## Settings
- Configurable skill and agent scan paths with labels
- Anthropic API key field for contextual suggestions
- Suggestion confidence threshold and max suggestions
- One-click install of the `/df` Claude Code command and hook

## Appearance
- Dark and light theme
- Three font-size levels (small / medium / large)
- macOS native title bar (hiddenInset style)
- Quick-open palette (⌘P) for files, recent items, and skills
