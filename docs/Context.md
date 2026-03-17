# Draftflow — Landing Page Context

## What is Draftflow?

Draftflow is an open-source, macOS-only Electron-based markdown editor built as a companion tool for Claude Code workflows. It targets developers who write prompts, skills, and drafts in markdown before feeding them into Claude Code in the terminal.

- GitHub repo: https://github.com/sameera207/draftflow
- Domain: https://draftflow.dev
- License: MIT
- Stack: Electron, React, electron-builder, electron-updater

## Landing Page Goal

Build and maintain a clean, minimal static landing page served via GitHub Pages from the `/docs` folder of the main repo. The aesthetic is "paper & ink" — warm off-white background, serif headlines, monospace accents, forest green accent colour. Inspired by https://nanoclaw.dev/ but lighter.

## Current File Structure (inside /docs)

```
/docs
  index.html        ← main landing page (already written, see below)
  features.json     ← feature card data (TO BE CREATED)
  images/           ← feature images (TO BE ADDED later)
  CNAME             ← contains: draftflow.dev (TO BE CREATED)
```

## What Has Already Been Done

- `index.html` is written and copied into `/docs`. It includes:
  - Sticky nav with blinking cursor logo
  - Hero section with GitHub CTA button
  - Feature grid (6 cards, currently hardcoded)
  - How it works (4-step layout)
  - Terminal install block
  - FAQ accordion (JS-powered)
  - Footer

- Fonts used: Lora (serif, headlines), DM Sans (body), JetBrains Mono (code/labels)
- All loaded from Google Fonts

## What Needs To Be Done Next

### 1. Refactor features to load from `features.json`

The feature grid in `index.html` is currently hardcoded. Refactor it so:
- The page does `fetch('features.json')` on load
- It renders the feature cards dynamically from the JSON
- Each feature card supports an optional `image` field
- If `image` is present, render it above the title inside the card
- If `image` is absent, fall back to the existing `tag` label (e.g. `.md`, `#skill`)

### 2. Create `features.json`

Create `/docs/features.json` with this structure:

```json
[
  {
    "tag": ".md",
    "title": "Clean markdown editor",
    "description": "Distraction-free writing with live split-pane preview. No toolbars, no clutter — just text.",
    "image": null
  },
  {
    "tag": "#skill",
    "title": "Skill autocomplete",
    "description": "Type # to fuzzy-search your installed Claude Code skills inline as you write.",
    "image": null
  },
  {
    "tag": "/df",
    "title": "Claude Code bridge",
    "description": "Open files directly from Claude Code, edit them, and send the result back with one click.",
    "image": null
  },
  {
    "tag": "⌘C",
    "title": "Send to Claude",
    "description": "Copy your draft as a ready-to-paste prompt for Claude Code. No browser tabs, no friction.",
    "image": null
  },
  {
    "tag": "~/",
    "title": "File browser",
    "description": "Browse and preview existing markdown files — skills, CLAUDE.md, docs — without leaving the app.",
    "image": null
  },
  {
    "tag": "⌥",
    "title": "Light & dark themes",
    "description": "Follows your system preference, or toggle manually. Easy on the eyes either way.",
    "image": null
  }
]
```

When images are ready, update the relevant entries like:
```json
{ "image": "images/feature-editor.png" }
```

### 3. Create `CNAME` file

Create `/docs/CNAME` with a single line:
```
draftflow.dev
```

### 4. GitHub Pages setup (manual step — Sam to do in GitHub UI)

- Go to repo Settings → Pages
- Set source to "Deploy from branch"
- Branch: `main`, folder: `/docs`
- GitHub will serve the site at draftflow.dev once CNAME is in place

## Design Tokens (for reference if editing styles)

```css
--paper: #f7f4ef;        /* warm off-white background */
--paper-dark: #ede9e1;   /* slightly darker paper, hover state */
--ink: #1a1714;          /* near-black text */
--ink-muted: #6b6560;    /* secondary text */
--ink-faint: #a09890;    /* hints, labels */
--accent: #2d5a3d;       /* forest green */
--accent-light: #e8f0ea; /* green tint backgrounds */
--accent-mid: #4a8a60;   /* mid green */
--border: rgba(26,23,20,0.12);
--border-strong: rgba(26,23,20,0.22);
```

## Key Product Details (for copy accuracy)

- No Claude API key required — Draftflow is a local editor
- Integrates with Claude Code via `/df` slash command and a file bridge at `~/.claude/editor-bridge/`
- `#` triggers skill fuzzy autocomplete; `##` dismisses it (user is writing a heading)
- "Send to Claude" copies to clipboard — targets Claude Code in terminal, not Claude.ai
- macOS only at launch (Electron, so Linux/Windows may work but unsupported)
- Distribution via Homebrew Cask planned: `brew install --cask draftflow`
- Homebrew tap repo: https://github.com/sameera207/homebrew-draftflow

## Tone & Copy Style

- Minimal, confident, developer-focused
- Short sentences. No fluff.
- Use em dashes for asides
- Avoid "powerful", "seamless", "supercharge" and other AI-slop adjectives
