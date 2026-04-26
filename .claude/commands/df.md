Open the current selection or a new draft in Draftflow, wait for the user to edit it, then read back the result.

## Steps

**If the user typed `/df p`** (review previous):
1. Write your previous response verbatim to `~/.claude/editor-bridge/request.md` using a Bash heredoc — do not truncate or summarise it.
2. Open Draftflow in review mode:
   ```bash
   open "draftflow://?file=$HOME/.claude/editor-bridge/request.md&cwd=$(pwd)&mode=review"
   ```
3. Output nothing.

**Otherwise** (plain `/df` or `/df <content>`):
The hook has already run: it created the bridge directory, cleared any stale response.md, wrote request.md, and opened Draftflow. Output nothing.

**When the user says "done"**, read `~/.claude/editor-bridge/response.md` and use its contents as the result. In review mode this will be the user's notes, not the plan.
