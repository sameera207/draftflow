Open the current selection or a new draft in Draftflow, wait for the user to edit it, then use the result.

## Steps

**If the user typed `/df p`** (review previous):
1. Write your previous response verbatim to `~/.claude/editor-bridge/request.md` using a Bash heredoc — do not truncate or summarise it.
2. Open Draftflow in review mode:
   ```bash
   open "draftflow://?file=$HOME/.claude/editor-bridge/request.md&cwd=$(pwd)&mode=review"
   ```

**Otherwise** (plain `/df` or `/df <content>`):
The hook has already run: request.md is written and Draftflow is open.

**In both cases**, immediately run this poller — output nothing before or after:
```bash
python3 - <<'PYEOF'
import pathlib, time, sys
resp = pathlib.Path.home() / '.claude' / 'editor-bridge' / 'response.md'
for _ in range(600):
    if resp.exists():
        print(resp.read_text(), end='')
        sys.exit(0)
    time.sleep(1)
print('TIMEOUT: no response received after 10 minutes')
PYEOF
```

Use the output as the result. If it timed out, let the user know.
