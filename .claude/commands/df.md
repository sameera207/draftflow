Open the current selection or a new draft in Draftflow, wait for the user to edit it, then read back the result.

## Steps

1. Determine what to send:
   - If the user provided text or a file path as an argument, use that content.
   - Otherwise use the content of the most recently mentioned file, or ask the user what to draft.

2. Write the content to `~/.claude/editor-bridge/request.md`. The directory `~/.claude/editor-bridge/` is pre-created — do NOT run mkdir.

3. Open Draftflow via the bridge URL:
   ```
   open "draftflow://?file=~/.claude/editor-bridge/request.md"
   ```

4. Tell the user: "Opening in Draftflow — edit your draft and click **send back** when done."

5. Wait for the user to signal they are done (they will say something like "done", "sent back", or "ready"), then read `~/.claude/editor-bridge/response.md` and use its contents as the result.

## Notes

- The bridge directory is `~/.claude/editor-bridge/`.
- `request.md` is what Draftflow opens; `response.md` is what Draftflow writes when the user clicks "send back".
- Do not proceed to step 5 automatically — always wait for the user to confirm they have sent the content back.
