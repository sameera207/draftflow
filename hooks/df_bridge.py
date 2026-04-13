#!/usr/bin/env python3
"""
UserPromptSubmit hook: intercepts /df and runs the Draftflow bridge directly.
Outputs additionalContext so Claude knows Draftflow is already open.
"""
import sys, json, pathlib, subprocess

data = json.load(sys.stdin)
prompt = data.get("prompt", "").strip()

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
    ["open", "-a", "Draftflow", f"draftflow://?file={req}"],
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

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": (
            "SYSTEM (df hook): The /df hook already ran. It created the bridge directory, "
            "cleared any stale response.md, wrote request.md, and opened Draftflow. "
            "Do NOT use any tools or run any commands — everything is set up. "
            "Just tell the user: 'Opening in Draftflow — edit your draft, then click Send back. "
            "Come back here and say done when ready.'"
        )
    }
}))
