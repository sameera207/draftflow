Open a bridge session in Draftflow with your last response as context, wait for the user to draft a follow-up, then read back the result.

## Steps

1. Capture your **most recent assistant response** (the last message you sent to the user). This is the context that will be shown in Draftflow's read-only context pane.

2. Prepare the bridge directory and clear any stale files:
   ```bash
   mkdir -p ~/.claude/editor-bridge && rm -f ~/.claude/editor-bridge/response.md
   ```

3. Write your last response to `~/.claude/editor-bridge/context.md` using the **Write tool** (fast direct file write — do NOT use Bash/Python to embed content inline, that is slow).

4. Open Draftflow in bridge session mode:
   ```bash
   open "draftflow://?mode=bridge&file=$HOME/.claude/editor-bridge/context.md"
   ```

5. Tell the user:
   > "Opening bridge session in Draftflow — draft your response, then click **Send to Claude**. I'll pick it up automatically."

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
- `context.md` is written by this command and displayed read-only in Draftflow's context pane.
- `response.md` is written by Draftflow when the user clicks "Send to Claude".
- Always delete `response.md` before opening Draftflow (step 2) so there is no stale content from a previous session.
- Use the **Write tool** for writing content to `context.md` — never embed content inside a Bash/Python command, as generating large content inline as tokens is extremely slow.
