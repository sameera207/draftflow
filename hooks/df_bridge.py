#!/usr/bin/env python3
"""
UserPromptSubmit hook: intercepts /df, does setup, then lets Claude run the poller.
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

# /df p — review previous: let Claude write the previous response and open Draftflow.
after = prompt[3:].strip()
if after.lower() == "p":
    sys.exit(0)

# Plain /df [content]: write content to request.md and open Draftflow.
req = bridge / "request.md"
req.write_text(after)

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

# Setup done — let Claude through to run the response poller.
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": (
            "SYSTEM (df hook): request.md is written and Draftflow is open. "
            "Do not print anything. Run the response poller immediately."
        )
    }
}))
