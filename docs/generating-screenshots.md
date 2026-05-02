# Generating the User Guide

This pipeline takes automated screenshots of Draftflow and feeds them — along with `features.md` — to Claude to produce a complete user guide.

## Prerequisites

- Node.js and `npm install` already run (installs `playwright` and `@anthropic-ai/sdk`)
- An Anthropic API key

## Step 1 — Close any running Draftflow instance

The screenshot script launches its own Draftflow process. If another instance is already running, close it first to avoid conflicts.

## Step 2 — Take the screenshots

```bash
npm run screenshots
```

This launches Draftflow in the background, drives it through 12 UI states, saves a PNG for each to `docs/screenshots/`, then quits. It takes about 20–30 seconds.

Screenshots produced:

| File | What it shows |
|---|---|
| `01-editor-default.png` | Default editor on launch |
| `02-split-mode.png` | Editor + live preview side by side |
| `03-preview-mode.png` | Preview-only mode |
| `04-file-panel.png` | File panel: recent files and project tree |
| `05-palette-open.png` | Quick-open palette (⌘P) with search active |
| `06-skill-autocomplete.png` | Inline `#` skill autocomplete popup |
| `07-agent-autocomplete.png` | Inline `@` agent autocomplete popup |
| `08-scratchpad.png` | Persistent scratchpad panel (⌘K) |
| `09-settings.png` | Settings panel |
| `10-light-theme.png` | Light theme |
| `11-review-mode.png` | Review mode: Claude's response in preview |
| `12-plan-edit-mode.png` | Plan-edit mode: plan in preview, editor writable |

## Step 3 — Generate the guide

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run guide
```

This reads `features.md` and all PNGs, sends them to `claude-opus-4-7` with vision, and writes the result to `docs/user-guide.md`. Takes 15–30 seconds and costs roughly 0.10–0.20 USD per run.

## Run both steps in one command

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run docs
```

## Regenerating after a feature change

1. Update `features.md` with the new feature.
2. If the UI changed, re-run `npm run screenshots` to refresh the relevant PNG.
3. Re-run `npm run guide` (or `npm run docs`) to regenerate the guide.

## Adding or updating a screenshot

Each screenshot is a named step in `scripts/take-screenshots.js`. To add a new one:

1. Find the right place in the sequence in `scripts/take-screenshots.js`.
2. Add the Playwright steps to reach the desired UI state.
3. Call `await shot(win, 'NN-feature-name.png')`.
4. Add a caption entry to the `CAPTIONS` map in `scripts/generate-guide.js`.

## Output files

Both output files are gitignored and regenerated on demand:

- `docs/screenshots/*.png` — raw screenshots
- `docs/user-guide.md` — the generated guide
