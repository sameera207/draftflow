#!/usr/bin/env python3
"""
UserPromptSubmit hook: intercepts /df, opens Draftflow, and blocks the LLM call.
No output is printed to the terminal.
"""
import sys, json, pathlib, subprocess, os
from urllib.parse import quote

data = json.load(sys.stdin)
prompt = data.get("prompt", "").strip()
cwd = data.get("cwd") or os.getcwd()

# Only act on /df commands
if not (prompt == "/df" or prompt.lower().startswith("/df ")):
    sys.exit(0)

bridge = pathlib.Path.home() / ".claude" / "editor-bridge"
bridge.mkdir(parents=True, exist_ok=True)

resp = bridge / "response.md"
if resp.exists():
    resp.unlink()

# /df p — review previous: let Claude extract and write the previous response,
# then open Draftflow in review mode. Just clean up and exit without blocking.
after = prompt[3:].strip()
if after.lower() == "p":
    sys.exit(0)

# Plain /df [content]: write content to request.md and open Draftflow.
content = after
req = bridge / "request.md"
req.write_text(content)

result = subprocess.run(
    ["open", "-a", "Draftflow", f"draftflow://?file={quote(str(req))}&cwd={quote(str(cwd))}"],
    capture_output=True, text=True
)
if result.returncode != 0:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": (
                "SYSTEM (df hook): Could not open Draftflow. "
                "It may not be installed. Tell the user: 'Draftflow doesn\\'t appear to be installed. "
                "Download it from https://github.com/sameera207/draftflow and install it first.'"
            )
        }
    }))
    sys.exit(0)

print(json.dumps({"decision": "block", "reason": ""}))
