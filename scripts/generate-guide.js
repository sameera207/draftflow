#!/usr/bin/env node
/**
 * Reads features.md + all screenshots in docs/screenshots/, sends them to
 * Claude (with vision), and writes a complete user guide to docs/user-guide.md.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-guide.js
 */

const { Anthropic } = require('@anthropic-ai/sdk')
const fs   = require('fs')
const path = require('path')

const ROOT            = path.join(__dirname, '..')
const SCREENSHOTS_DIR = path.join(ROOT, 'docs', 'screenshots')
const FEATURES_MD     = path.join(ROOT, 'features.md')
const OUT             = path.join(ROOT, 'docs', 'user-guide.md')

// Human-readable captions matched to screenshot filenames.
// Claude uses these as context when writing the guide.
const CAPTIONS = {
  // ── Editor
  '01-editor-default.png':       'The default Draftflow editor on launch — clean, dark, ready to write',
  '02-split-mode.png':           'Split mode: Markdown editor on the left, live rendered preview on the right',
  '03-preview-mode.png':         'Preview-only mode for reading the rendered output without distractions',
  '04-mermaid-preview.png':      'Mermaid diagrams render live in the preview pane — write the fenced code block, see the diagram instantly',
  '14-status-bar.png':           'Status bar: real-time word count, token count, cursor position (Ln/Col), and the Send to Claude button',

  // ── Project & File Management
  '06-file-panel.png':           'The file panel: recent files at the top (with first-line preview), project tree below, skills and agents listed',
  '07-palette-open.png':         'The quick-open palette (⌘P) — fuzzy searches files, recent items, skills, and agents simultaneously',

  // ── Skill & Agent Autocomplete
  '08-skill-autocomplete.png':   'Inline skill autocomplete triggered by # — fuzzy matches with the skill description shown in the right-hand preview pane',
  '09-agent-autocomplete.png':   'Inline agent autocomplete triggered by @ — fuzzy matches with description preview',
  '05-agent-badge-preview.png':  '@agentname references in the preview pane render as styled green badges',

  // ── Scratchpad
  '10-scratchpad.png':           'The persistent scratchpad (⌘K) — separate from the main draft, auto-saved across sessions',

  // ── Settings
  '11-settings.png':             'Settings panel: skill scan paths with labels, Anthropic API key (show/hide toggle), token warning thresholds, and /df reinstall',

  // ── Appearance
  '12-font-size-large.png':      'Large font size mode — toggle between S / M / L using the buttons in the toolbar',
  '13-light-theme.png':          'Light theme in split mode',

  // ── Claude Code Bridge
  '15-review-mode.png':          "Review mode (/df p): Claude's last response loaded read-only in the preview; editor is free for notes; Send back button sends only the notes",
  '16-plan-edit-mode.png':       "Plan-edit mode (/df p on a plan): the plan loads directly into the editor for annotation or rewriting; Send back sends the full edited plan",
}

async function main () {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.')
    process.exit(1)
  }

  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    console.error('Error: docs/screenshots/ not found. Run `npm run screenshots` first.')
    process.exit(1)
  }

  const featuresMd = fs.readFileSync(FEATURES_MD, 'utf8')

  const screenshots = fs.readdirSync(SCREENSHOTS_DIR)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => ({
      filename: f,
      caption:  CAPTIONS[f] || f.replace(/^\d+-/, '').replace(/-/g, ' ').replace('.png', ''),
      base64:   fs.readFileSync(path.join(SCREENSHOTS_DIR, f)).toString('base64'),
    }))

  if (!screenshots.length) {
    console.error('Error: no PNGs found in docs/screenshots/. Run `npm run screenshots` first.')
    process.exit(1)
  }

  console.log(`Loaded ${screenshots.length} screenshots. Calling Claude…`)

  const client = new Anthropic({ apiKey })

  // Build the message content: system context, then interleaved
  // screenshot label + image blocks, then the writing instruction.
  const content = [
    {
      type: 'text',
      text: [
        'You are writing the official user guide for **Draftflow**, a focused Markdown editor built for Claude Code workflows.',
        '',
        'Below is the full feature specification, followed by annotated screenshots of the app.',
        '',
        '---',
        featuresMd,
        '---',
        '',
        'Screenshots follow. Each is labeled with its filename and a one-line caption.',
      ].join('\n'),
    },

    // Interleave label → image for each screenshot
    ...screenshots.flatMap(s => [
      {
        type: 'text',
        text: `**Screenshot: ${s.filename}**\n${s.caption}`,
      },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: s.base64 },
      },
    ]),

    {
      type: 'text',
      text: [
        'Now write a complete user guide for Draftflow. Guidelines:',
        '',
        '- Organise by **user task** (e.g. "Writing a draft", "Using skills", "Working with Claude Code"), not by technical subsystem.',
        '- Introduce features in the order a new user would discover them.',
        '- Embed each screenshot using `![caption](screenshots/filename.png)` exactly where it is most relevant — not all at the end.',
        '- Write clearly and concisely. No marketing language.',
        '- Use second person ("you") throughout.',
        '- Start with a one-paragraph introduction that explains what Draftflow is and who it is for.',
        '- End with a "Keyboard shortcuts" reference table.',
        '- Output valid GitHub-flavoured Markdown only — no preamble, no explanation, just the guide.',
      ].join('\n'),
    },
  ]

  const response = await client.messages.create({
    model:      'claude-opus-4-7',
    max_tokens: 4096,
    messages:   [{ role: 'user', content }],
  })

  const guide = response.content[0].text
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, guide, 'utf8')

  const lines = guide.split('\n').length
  console.log(`\nUser guide written to docs/user-guide.md (${lines} lines)`)
  console.log(`Usage: ${response.usage.input_tokens} input tokens, ${response.usage.output_tokens} output tokens`)
}

main().catch(err => { console.error(err); process.exit(1) })
