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
fs.mkdirSync(OUT, { recursive: true })

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

async function main () {
  console.log('Launching Draftflow…')
  const app = await electron.launch({
    executablePath: require('electron'),
    args: ['.'],
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
  await win.evaluate(md => {
    const el = document.getElementById('editor')
    el.value = md
    el.dispatchEvent(new Event('input'))
  }, SAMPLE_CONTENT)
  await win.click('[data-mode="split"]')
  await win.waitForTimeout(600)
  await shot(win, '02-split-mode.png')

  // ── 3. Preview only mode ────────────────────────────────────────────────────
  await win.click('[data-mode="preview"]')
  await win.waitForTimeout(400)
  await shot(win, '03-preview-mode.png')

  // Back to edit for subsequent shots
  await win.click('[data-mode="edit"]')
  await win.waitForTimeout(200)

  // ── 4. File panel (recent + project tree) ──────────────────────────────────
  // Ensure file panel is open
  const panelVisible = await win.evaluate(() =>
    !document.getElementById('file-panel').classList.contains('collapsed')
  )
  if (!panelVisible) await win.click('#btn-files')
  await win.click('[data-mode="split"]')
  await win.waitForTimeout(500)
  await shot(win, '04-file-panel.png')

  // ── 5. Quick-open palette ───────────────────────────────────────────────────
  await win.keyboard.press('Meta+p')
  await win.waitForSelector('.palette-overlay.open')
  await win.type('#palette-input', 'features')
  await win.waitForTimeout(400)
  await shot(win, '05-palette-open.png')
  await win.keyboard.press('Escape')
  await win.waitForTimeout(200)

  // ── 6. Skill autocomplete (#) ───────────────────────────────────────────────
  await win.click('[data-mode="edit"]')
  await win.click('#editor')
  await win.keyboard.press('Meta+End')
  await win.keyboard.press('Enter')
  await win.keyboard.press('Enter')
  await win.keyboard.type('#doc')
  await win.waitForTimeout(700)
  await shot(win, '06-skill-autocomplete.png')
  await win.keyboard.press('Escape')
  // Clean up the typed trigger
  await win.keyboard.press('Backspace')
  await win.keyboard.press('Backspace')
  await win.keyboard.press('Backspace')
  await win.keyboard.press('Backspace')

  // ── 7. Agent autocomplete (@) ───────────────────────────────────────────────
  await win.keyboard.type('@')
  await win.waitForTimeout(600)
  await shot(win, '07-agent-autocomplete.png')
  await win.keyboard.press('Escape')
  await win.keyboard.press('Backspace')
  await win.waitForTimeout(200)

  // ── 8. Scratchpad panel ─────────────────────────────────────────────────────
  // Pre-fill scratchpad via IPC so it looks non-empty
  await win.evaluate(() => {
    const el = document.getElementById('scratch-textarea')
    if (el) {
      el.value = '- check rate limiting PR\n- ask Claude about circuit breaker pattern\n- review DB migration order'
    }
  })
  await win.keyboard.press('Meta+k')
  await win.waitForSelector('#scratchpad-pane.open')
  await win.waitForTimeout(400)
  await shot(win, '08-scratchpad.png')
  await win.keyboard.press('Meta+k') // close
  await win.waitForTimeout(300)

  // ── 9. Settings panel ──────────────────────────────────────────────────────
  await win.click('#btn-settings')
  await win.waitForSelector('#settings-overlay.visible')
  await win.waitForTimeout(500)
  await shot(win, '09-settings.png')
  await win.click('#settings-cancel')
  await win.waitForTimeout(300)

  // ── 10. Light theme ────────────────────────────────────────────────────────
  await win.click('#btn-theme')
  await win.waitForTimeout(400)
  await win.click('[data-mode="split"]')
  await win.waitForTimeout(300)
  await shot(win, '10-light-theme.png')
  // Restore dark
  await win.click('#btn-theme')
  await win.waitForTimeout(200)

  // ── 11. Review mode (bridge-open IPC) ──────────────────────────────────────
  const bridgeDir  = path.join(os.homedir(), '.claude', 'editor-bridge')
  const reviewFile = path.join(bridgeDir, 'last-response.md')
  fs.mkdirSync(bridgeDir, { recursive: true })
  fs.writeFileSync(reviewFile, `# Implementation Plan

## Phase 1 — Schema

Create the \`users\` and \`sessions\` tables with appropriate indexes.

## Phase 2 — Auth middleware

Add JWT validation middleware. Refresh tokens stored in Redis with a 7-day TTL.

## Phase 3 — Deploy

Set up the CI pipeline: lint → test → build → staging deploy on every PR.
Production deploy gated on manual approval.`)

  await app.evaluate(({ BrowserWindow }, filePath) => {
    BrowserWindow.getAllWindows()[0].webContents.send('bridge-open', {
      file: filePath,
      mode: 'review',
      cwd: null,
    })
  }, reviewFile)
  await win.waitForTimeout(900)
  await shot(win, '11-review-mode.png')

  // ── 12. Plan-edit mode ─────────────────────────────────────────────────────
  await app.evaluate(({ BrowserWindow }, filePath) => {
    BrowserWindow.getAllWindows()[0].webContents.send('bridge-open', {
      file: filePath,
      mode: 'plan-edit',
      cwd: null,
    })
  }, reviewFile)
  await win.waitForTimeout(900)
  await shot(win, '12-plan-edit-mode.png')

  await app.close()
  console.log(`\nDone — ${fs.readdirSync(OUT).length} screenshots in docs/screenshots/`)
}

main().catch(err => { console.error(err); process.exit(1) })
