Open the current selection or a new draft in Draftflow, wait for the user to edit it, then read back the result.

## Steps

1. Determine what to send:
   - If the user provided text or a file path as an argument, use that content.
   - Otherwise use the content of the most recently mentioned file, or ask the user what to draft.

2. Write the content to `~/.claude/editor-bridge/request.md` using a **Bash command** (NEVER use the Write tool — it is slow and shows the file content in the UI, which is confusing). Also delete any stale `response.md` first:
   ```bash
   python3 - <<'PYEOF'
   import os, pathlib
   bridge = pathlib.Path.home() / '.claude' / 'editor-bridge'
   bridge.mkdir(parents=True, exist_ok=True)
   resp = bridge / 'response.md'
   if resp.exists(): resp.unlink()
   (bridge / 'request.md').write_text("""CONTENT""")
   PYEOF
   ```
   Replace `CONTENT` with the actual text. Do not print anything — keep it silent.

3. Open Draftflow via the bridge URL:
   ```bash
   open "draftflow://?file=$HOME/.claude/editor-bridge/request.md"
   ```

4. Tell the user exactly this:
   > "Opening in Draftflow — edit your draft, then click **Send back**. Once you've clicked it, come back here and say **done** so I can read it."

5. Wait for the user to say "done" (or "sent back" / "ready"), then read `~/.claude/editor-bridge/response.md` and use its contents as the result.

## Notes

- The bridge directory is `~/.claude/editor-bridge/`.
- `request.md` is what Draftflow opens; `response.md` is what Draftflow writes when the user clicks "Send back".
- Always delete `response.md` before opening Draftflow (step 2) so there is no stale content from a previous session.
- Do NOT proceed to step 5 automatically — always wait for the user to confirm they clicked "Send back".
- Use `Bash` to write the file, never the `Write` tool.
