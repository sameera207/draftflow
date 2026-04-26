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
if not (prompt == "/df" or prompt.lower().startswith("/df ") or prompt.lower().startswith("/df\n")):
    sys.exit(0)

bridge = pathlib.Path.home() / ".claude" / "editor-bridge"
bridge.mkdir(parents=True, exist_ok=True)

resp = bridge / "response.md"
if resp.exists():
    resp.unlink()

# Extract any content passed after /df
content = prompt[3:].strip() if len(prompt) > 3 else ""
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
