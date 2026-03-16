# Draftflow

A minimal Markdown editor built for Claude Code workflows. Write prompts, skills, and drafts with live preview, skill autocomplete, and a direct bridge back to Claude Code.

## Features

- **Markdown editor** with live split-pane preview
- **Skill & agent autocomplete** — type `#skill` or `/agent` to fuzzy-search your indexed skills, with descriptions shown inline
- **Claude Code bridge** — open files directly from Claude Code, edit them, and send the result back in one click
- **Light / dark theme** toggle
- **Recent files** panel
- Configurable scan paths for skills and agents

## Getting started

### Requirements

- [Node.js](https://nodejs.org) 18+
- macOS (primary target; Linux/Windows may work)

### Install & run

```bash
git clone https://github.com/sameera207/draftflow.git
cd draftflow
npm install
npm start
```

## Claude Code bridge (`/df`)

Draftflow integrates with Claude Code via a custom URL scheme and a shared file bridge, letting you round-trip content between Claude and the editor.

### How it works

```
/df in Claude Code
  → writes content to ~/.claude/editor-bridge/request.md
  → opens Draftflow via draftflow://?file=~/.claude/editor-bridge/request.md
  → you edit the draft in Draftflow
  → click "send back"
  → Draftflow writes ~/.claude/editor-bridge/response.md
  → Claude reads the result
```

### Install the `/df` command

1. Open Draftflow settings and click **Install /df command**
   (copies `commands/df.md` → `~/.claude/commands/df.md`)
2. In any Claude Code session, type `/df` to start a bridge session.

## Skill autocomplete

Draftflow scans directories you configure for Claude Code skill (`.md`) and agent files and indexes them for autocomplete.

| Trigger | Matches |
|---------|---------|
| `#foo`  | Skills  |
| `/foo`  | Agents  |

Default scan path: `~/.claude`
Add more paths in **Settings → Skill & Agent Paths**.

## Development

```bash
npm run dev   # run with Node inspector enabled
```

## License

MIT
