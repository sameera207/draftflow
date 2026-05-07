#!/usr/bin/env python3
"""
UserPromptSubmit hook: intercepts /df commands.
All polling happens inside the hook — the LLM is never called while the user is editing.

- /df [content]  — writes content to request.md, opens Draftflow, polls in-hook.
                   When done, injects result via additionalContext so Claude can use it.
- /df p|-p       — opens last-response.md in review mode, polls in-hook, blocks LLM.
"""
import sys, json, pathlib, subprocess, os, time
from urllib.parse import quote

data = json.load(sys.stdin)
prompt = data.get("prompt", "").strip()
cwd = data.get("cwd") or os.getcwd()
transcript_path = data.get("transcript_path", "")

# Only act on /df commands
if not (prompt == "/df" or prompt.lower().startswith("/df ")):
    sys.exit(0)

bridge = pathlib.Path.home() / ".claude" / "editor-bridge"
bridge.mkdir(parents=True, exist_ok=True)

resp = bridge / "response.md"
if resp.exists():
    resp.unlink()

after = prompt[3:].strip()


def poll(resp_path, timeout=600):
    for _ in range(timeout):
        if resp_path.exists():
            return resp_path.read_text()
        time.sleep(1)
    return None


# /df p or /df -p — review previous response from THIS session, block LLM entirely.
if after.lower() in ("p", "-p"):
    # Read last assistant text from the current session's transcript.
    last_text = ""
    last_is_plan = False
    if transcript_path and pathlib.Path(transcript_path).exists():
        lines = pathlib.Path(transcript_path).read_text().strip().splitlines()
        for line in reversed(lines):
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if obj.get("type") != "assistant":
                continue
            message = obj.get("message", {})
            content_blocks = message.get("content", []) if isinstance(message, dict) else []
            parts = [b.get("text", "") for b in content_blocks
                     if isinstance(b, dict) and b.get("type") == "text"]
            # Plan mode stores content in ExitPlanMode tool_use input, not text blocks
            is_plan = False
            if not any(parts):
                for b in content_blocks:
                    if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "ExitPlanMode":
                        plan = b.get("input", {}).get("plan", "")
                        if plan:
                            parts.append(plan)
                            is_plan = True
                        break
            text = "\n".join(p for p in parts if p).strip()
            if text:
                last_text = text
                last_is_plan = is_plan
                break

    if not last_text:
        print(json.dumps({
            "decision": "block",
            "reason": "No previous response to review yet."
        }))
        sys.exit(0)

    review_file = bridge / "last-response.md"
    review_file.write_text(last_text)

    bridge_mode = "plan-edit" if last_is_plan else "review"
    result = subprocess.run(
        ["open", "-a", "Draftflow",
         f"draftflow://?file={quote(str(review_file))}&cwd={quote(str(cwd))}&mode={bridge_mode}"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(json.dumps({
            "decision": "block",
            "reason": "Could not open Draftflow. Make sure it is installed."
        }))
        sys.exit(0)

    content = poll(resp)
    if content is None:
        print(json.dumps({"decision": "block", "reason": "Timed out waiting for Draftflow."}))
    else:
        print(json.dumps({"decision": "block", "reason": f"✓ Draft received. Press Enter or add additional thoughts to continue."}))
    sys.exit(0)


# Plain /df [content]: write request.md, open Draftflow, poll in-hook.
req = bridge / "request.md"
req.write_text(after)

result = subprocess.run(
    ["open", "-a", "Draftflow", f"draftflow://?file={quote(str(req))}&cwd={quote(str(cwd))}"],
    capture_output=True, text=True
)
if result.returncode != 0:
    print(json.dumps({
        "decision": "block",
        "reason": (
            "Could not open Draftflow. It may not be installed. "
            "Download it from https://github.com/sameera207/draftflow and install it first."
        )
    }))
    sys.exit(0)

content = poll(resp)
if content is None:
    print(json.dumps({"decision": "block", "reason": "Timed out waiting for Draftflow."}))
    sys.exit(0)

# Inject the user's edited content so Claude can act on it.
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": (
            f"SYSTEM (df hook): The user edited content in Draftflow and sent it back. "
            f"Here is their content — use it as the result of the /df command:\n\n{content}"
        )
    }
}))
