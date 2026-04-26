Open the current selection or a new draft in Draftflow, wait for the user to edit it, then read back the result.

## Steps

The hook has already run: it created the bridge directory, cleared any stale response.md, wrote request.md, and opened Draftflow. Output nothing.

When the user says "done", read `~/.claude/editor-bridge/response.md` and use its contents as the result.
