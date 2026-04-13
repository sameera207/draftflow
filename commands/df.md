Open the current selection or a new draft in Draftflow, wait for the user to edit it, then read back the result.

## Steps

1. Determine what to send:
   - If the user provided text or a file path as an argument, use that content.
   - Otherwise use the content of the most recently mentioned file, or ask the user what to draft.

2. Prepare the bridge directory and clear any stale response:
   ```bash
   mkdir -p ~/.claude/editor-bridge && rm -f ~/.claude/editor-bridge/response.md
   ```

3. Write the content to `~/.claude/editor-bridge/request.md` using the **Write tool** (fast direct file write — do NOT use Bash/Python to embed content inline, that is slow).

4. Open Draftflow via the bridge URL:
   ```bash
   open "draftflow://?file=$HOME/.claude/editor-bridge/request.md&cwd=$(pwd)"
   ```

5. Tell the user:
   > "Opening in Draftflow — edit your draft, then click **Send back**. I'll pick it up automatically."

6. Poll for `response.md` to appear (up to 5 minutes), then read it automatically — no user input needed:
   ```bash
   python3 - <<'PYEOF'
   import pathlib, time
   resp = pathlib.Path.home() / '.claude' / 'editor-bridge' / 'response.md'
   for _ in range(300):
       if resp.exists():
           print(resp.read_text())
           raise SystemExit(0)
       time.sleep(1)
   print("TIMEOUT: response.md never appeared")
   PYEOF
   ```
   Use the output of that command as the result. If it timed out, let the user know.

## Notes

- The bridge directory is `~/.claude/editor-bridge/`.
- `request.md` is what Draftflow opens; `response.md` is what Draftflow writes when the user clicks "Send back".
- Always delete `response.md` before opening Draftflow (step 2) so there is no stale content from a previous session.
- Use the **Write tool** for writing content to `request.md` — never embed content inside a Bash/Python command, as generating large content inline as tokens is extremely slow.
