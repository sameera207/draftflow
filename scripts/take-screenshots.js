#!/usr/bin/env node
/**
 * Launches Draftflow via Playwright's Electron launcher, drives each feature
 * into the correct UI state, and saves a PNG to docs/screenshots/.
 *
 * Usage:
 *   node scripts/take-screenshots.js
 *
 * Requires:
 *   npm install --save-dev playwright
 */

const { _electron: electron } = require('playwright')
const path  = require('path')
const fs    = require('fs')
const os    = require('os')

const ROOT = path.join(__dirname, '..')
const OUT  = path.join(ROOT, 'docs', 'screenshots')

// Clear any stale screenshots from a previous run before starting
fs.mkdirSync(OUT, { recursive: true })
fs.readdirSync(OUT).filter(f => f.endsWith('.png')).forEach(f => fs.unlinkSync(path.join(OUT, f)))

// ── Sample content used across multiple shots ─────────────────────────────────

const SAMPLE_CONTENT = `# Sprint Review Notes

Reviewing the latest implementation plan before sending feedback to Claude.

## What's working
- Auth middleware is solid
- Token refresh handled correctly

## Concerns
- Rate limiting not yet tested under load
- Need to confirm DB migration order

## Questions for Claude
- Should we add a circuit breaker here?
- Is the caching layer optional or required?`

// Content that exercises Mermaid rendering and @agent badge rendering
const RICH_CONTENT = `# Architecture Overview

How the \`/df\` bridge connects Claude Code to Draftflow.

\`\`\`mermaid
sequenceDiagram
    participant CC as Claude Code
    participant DF as Draftflow
    participant U as User
    CC->>DF: /df (opens editor)
    U->>DF: edits draft
    DF->>CC: send back (response.md)
    CC-->>U: continues with edited content
\`\`\`

## Relevant skills

Use the @doc-coauthoring skill for structured docs.
Use the @pdf skill when working with PDF exports.`

const BRIDGE_CONTENT = `# Implementation Plan

## Phase 1 — Schema

Create the \`users\` and \`sessions\` tables with appropriate indexes.

## Phase 2 — Auth middleware

Add JWT validation middleware. Refresh tokens stored in Redis with a 7-day TTL.

## Phase 3 — Deploy

Set up the CI pipeline: lint → test → build → staging deploy on every PR.
Production deploy gated on manual approval.`

// ─────────────────────────────────────────────────────────────────────────────

async function shot (win, name) {
  await win.waitForTimeout(450)
  await win.screenshot({ path: path.join(OUT, name) })
  console.log(`  ✓  ${name}`)
}

async function setWindowSize (app, w, h) {
  await app.evaluate(({ BrowserWindow }, [width, height]) => {
    BrowserWindow.getAllWindows()[0].setSize(width, height)
  }, [w, h])
  await new Promise(r => setTimeout(r, 200))
}

async function loadContent (win, md) {
  await win.evaluate(md => {
    const el = document.getElementById('editor')
    el.value = md
    el.dispatchEvent(new Event('input'))
  }, md)
  await win.waitForTimeout(300)
}

async function main () {
  console.log('Launching Draftflow…')
  const app = await electron.launch({
    executablePath: require('electron'),
    // Force 1:1 pixel ratio so screenshots are exactly the logical size.
    // Without this, Retina displays produce 2x images (e.g. 2560px wide)
    // which exceed the Claude API multi-image 2000px dimension limit.
    args: ['.', '--force-device-scale-factor=1'],
    cwd: ROOT,
  })

  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(2000) // let skill scan and IPC init finish

  await setWindowSize(app, 1280, 820)
  await win.waitForTimeout(300)

  // ── 1. Default editor (empty, dark theme) ──────────────────────────────────
  await shot(win, '01-editor-default.png')

  // ── 2. Editor with content, split mode ─────────────────────────────────────
  await loadContent(win, SAMPLE_CONTENT)
  await win.click('[data-mode="split"]')
  await win.waitForTimeout(600)
  await shot(win, '02-split-mode.png')

  // ── 3. Preview only mode ────────────────────────────────────────────────────
  await win.click('[data-mode="preview"]')
  await win.waitForTimeout(400)
  await shot(win, '03-preview-mode.png')

  // ── 4. Mermaid diagram rendering ────────────────────────────────────────────
  await loadContent(win, RICH_CONTENT)
  await win.click('[data-mode="split"]')
  await win.waitForTimeout(1200) // Mermaid renders async — give it time
  await shot(win, '04-mermaid-preview.png')

  // ── 5. @agent badge rendering in preview ────────────────────────────────────
  // RICH_CONTENT already has @doc-coauthoring and @pdf — just show preview pane
  await win.click('[data-mode="preview"]')
  await win.waitForTimeout(400)
  await shot(win, '05-agent-badge-preview.png')

  // Back to edit
  await win.click('[data-mode="edit"]')
  await win.waitForTimeout(200)

  // ── 6. File panel (recent + project tree) ───────────────────────────────────
  const panelVisible = await win.evaluate(() =>
    !document.getElementById('file-panel').classList.contains('collapsed')
  )
  if (!panelVisible) await win.click('#btn-files')
  await loadContent(win, SAMPLE_CONTENT)
  await win.click('[data-mode="split"]')
  await win.waitForTimeout(500)
  await shot(win, '06-file-panel.png')

  // ── 7. Quick-open palette ───────────────────────────────────────────────────
  await win.keyboard.press('Meta+p')
  await win.waitForSelector('.palette-overlay.open')
  await win.type('#palette-input', 'features')
  await win.waitForTimeout(400)
  await shot(win, '07-palette-open.png')
  await win.keyboard.press('Escape')
  await win.waitForTimeout(200)

  // ── 8. Skill autocomplete (#) with hover preview pane ──────────────────────
  await win.click('[data-mode="edit"]')
  await win.click('#editor')
  await win.keyboard.press('Meta+End')
  await win.keyboard.press('Enter')
  await win.keyboard.press('Enter')
  await win.keyboard.type('#doc')
  await win.waitForTimeout(800)
  // Arrow-key to second result so the preview pane is populated with description
  await win.keyboard.press('ArrowDown')
  await win.waitForTimeout(400)
  await shot(win, '08-skill-autocomplete.png')
  await win.keyboard.press('Escape')
  await win.keyboard.press('Backspace')
  await win.keyboard.press('Backspace')
  await win.keyboard.press('Backspace')
  await win.keyboard.press('Backspace')

  // ── 9. Agent autocomplete (@) ───────────────────────────────────────────────
  await win.keyboard.type('@')
  await win.waitForTimeout(600)
  await shot(win, '09-agent-autocomplete.png')
  await win.keyboard.press('Escape')
  await win.keyboard.press('Backspace')
  await win.waitForTimeout(200)

  // ── 10. Scratchpad panel ────────────────────────────────────────────────────
  await win.evaluate(() => {
    const el = document.getElementById('scratch-textarea')
    if (el) el.value = '- check rate limiting PR\n- ask Claude about circuit breaker pattern\n- review DB migration order'
  })
  await win.keyboard.press('Meta+k')
  await win.waitForSelector('#scratchpad-pane.open')
  await win.waitForTimeout(400)
  await shot(win, '10-scratchpad.png')
  await win.keyboard.press('Meta+k')
  await win.waitForTimeout(300)

  // ── 11. Settings panel ──────────────────────────────────────────────────────
  await win.click('#btn-settings')
  await win.waitForSelector('#settings-overlay.visible')
  await win.waitForTimeout(500)
  await shot(win, '11-settings.png')
  await win.click('#settings-cancel')
  await win.waitForTimeout(300)

  // ── 12. Font size — large mode ──────────────────────────────────────────────
  await win.click('[data-fs="large"]')
  await win.click('[data-mode="split"]')
  await win.waitForTimeout(400)
  await shot(win, '12-font-size-large.png')
  await win.click('[data-fs="small"]') // restore default
  await win.waitForTimeout(200)

  // ── 13. Light theme ─────────────────────────────────────────────────────────
  await win.click('#btn-theme')
  await win.waitForTimeout(400)
  await win.click('[data-mode="split"]')
  await win.waitForTimeout(300)
  await shot(win, '13-light-theme.png')
  await win.click('#btn-theme') // restore dark
  await win.waitForTimeout(200)

  // ── 14. Status bar — word count, cursor position, Send to Claude button ─────
  await win.click('[data-mode="edit"]')
  await loadContent(win, SAMPLE_CONTENT)
  await win.click('#editor')
  await win.keyboard.press('Meta+End')
  await win.waitForTimeout(400)
  await shot(win, '14-status-bar.png')

  // ── 15. Review mode (/df p — non-plan response) ─────────────────────────────
  const bridgeDir  = path.join(os.homedir(), '.claude', 'editor-bridge')
  const reviewFile = path.join(bridgeDir, 'last-response.md')
  fs.mkdirSync(bridgeDir, { recursive: true })
  fs.writeFileSync(reviewFile, BRIDGE_CONTENT)

  await app.evaluate(({ BrowserWindow }, filePath) => {
    BrowserWindow.getAllWindows()[0].webContents.send('bridge-open', {
      file: filePath, mode: 'review', cwd: null,
    })
  }, reviewFile)
  await win.waitForTimeout(900)
  await shot(win, '15-review-mode.png')

  // ── 16. Plan-edit mode (/df p — plan response) ──────────────────────────────
  await app.evaluate(({ BrowserWindow }, filePath) => {
    BrowserWindow.getAllWindows()[0].webContents.send('bridge-open', {
      file: filePath, mode: 'plan-edit', cwd: null,
    })
  }, reviewFile)
  await win.waitForTimeout(900)
  await shot(win, '16-plan-edit-mode.png')

  await app.close()
  console.log(`\nDone — ${fs.readdirSync(OUT).length} screenshots in docs/screenshots/`)
}

main().catch(err => { console.error(err); process.exit(1) })
