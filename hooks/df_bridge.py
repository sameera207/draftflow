#!/usr/bin/env python3
"""
UserPromptSubmit hook: intercepts /df commands.
All polling happens inside the hook — the LLM is never called while the user is editing.

- /df          — picks up the last Claude response and opens it in Draftflow for review/edit.
- /df n        — opens a new empty draft in Draftflow.
- /df [content] — writes content to request.md and opens Draftflow.
"""
import sys, json, pathlib, subprocess, os, time, re
from urllib.parse import quote


def detect_plan_mode(transcript_path):
    """Return True if recent Claude Code turns show plan-mode activity."""
    if not transcript_path or not pathlib.Path(transcript_path).exists():
        return False
    try:
        lines = pathlib.Path(transcript_path).read_text().strip().splitlines()
    except Exception:
        return False
    checked = 0
    for line in reversed(lines):
        if checked >= 5:
            break
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("type") != "assistant":
            continue
        checked += 1
        for b in (obj.get("message") or {}).get("content", []):
            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") in ("EnterPlanMode", "ExitPlanMode"):
                return True
    return False


def parse_mode_request(content):
    """Strip optional <!-- df:request-mode:plan|normal --> header from response.md."""
    m = re.match(r'^<!--\s*df:request-mode:(plan|normal)\s*-->\n?', content)
    if m:
        return m.group(1), content[m.end():]
    return None, content


def mode_context(requested_mode, is_plan):
    """Return an extra instruction to prepend to additionalContext when mode differs."""
    if requested_mode == 'plan' and not is_plan:
        return "The user wants to switch to plan mode for this response. Enter plan mode.\n\n"
    if requested_mode == 'normal' and is_plan:
        return "The user wants to exit plan mode and respond normally, without generating a plan.\n\n"
    return ""


def read_last_response(transcript_path):
    """Return (text, is_plan) for the most recent assistant turn, or ('', False)."""
    if not transcript_path or not pathlib.Path(transcript_path).exists():
        return "", False
    try:
        lines = pathlib.Path(transcript_path).read_text().strip().splitlines()
    except Exception:
        return "", False
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
            return text, is_plan
    return "", False


def poll(resp_path, timeout=600):
    for _ in range(timeout):
        if resp_path.exists():
            return resp_path.read_text()
        time.sleep(1)
    return None


def open_in_draftflow(file_path, cwd, mode, session_mode):
    params = f"file={quote(str(file_path))}&cwd={quote(str(cwd))}&session_mode={session_mode}"
    if mode:
        params += f"&mode={mode}"
    return subprocess.run(
        ["open", "-a", "Draftflow", f"draftflow://?{params}"],
        capture_output=True, text=True
    )


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
req   = bridge / "request.md"

# ── Voice mode: request.md pre-written by the voice plugin ──────────────────
# Must run before the "no args → pick up last response" check.
if not after and req.exists():
    req_text = req.read_text()
    if "<!-- df:ready -->" in req_text:
        transcript = req_text.replace("<!-- df:ready -->", "").strip()
        req.write_text("")  # clear so it won't re-trigger on next /df
        if transcript:
            (bridge / "voice-mode-active").write_text("")
            print('\n> ' + '\n> '.join(transcript.splitlines()) + '\n', file=sys.stderr)
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": (
                        f"SYSTEM (df hook): The user sent this via voice mode in Draftflow. "
                        f"Use it as their message:\n\n{transcript}"
                    )
                }
            }))
            sys.exit(0)

# ── /df (no args) → pick up last assistant response ─────────────────────────
if not after:
    last_text, last_is_plan = read_last_response(transcript_path)

    if last_text:
        review_file = bridge / "last-response.md"
        review_file.write_text(last_text)

        bridge_mode  = "plan-edit" if last_is_plan else "review"
        is_plan      = detect_plan_mode(transcript_path)
        session_mode = 'plan' if is_plan else 'normal'

        result = open_in_draftflow(review_file, cwd, bridge_mode, session_mode)
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
            requested_mode, content = parse_mode_request(content)
            extra = mode_context(requested_mode, is_plan)
            print('\n> ' + '\n> '.join(content.splitlines()) + '\n', file=sys.stderr)
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": (
                        f"SYSTEM (df hook): {extra}The user reviewed/edited the last Claude response "
                        f"in Draftflow and sent it back. Use it as their message:\n\n{content}"
                    )
                }
            }))
        sys.exit(0)
    # No prior response — fall through to open an empty draft.

# ── /df n → new empty draft (normalise to empty content) ────────────────────
if after.lower() in ("n", "-n"):
    after = ""

# ── /df [content] or empty fallthrough → open Draftflow ─────────────────────
req.write_text(after)

is_plan      = detect_plan_mode(transcript_path)
session_mode = 'plan' if is_plan else 'normal'

result = open_in_draftflow(req, cwd, None, session_mode)
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

requested_mode, content = parse_mode_request(content)
extra = mode_context(requested_mode, is_plan)
print('\n> ' + '\n> '.join(content.splitlines()) + '\n', file=sys.stderr)

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": (
            f"SYSTEM (df hook): {extra}The user edited content in Draftflow and sent it back. "
            f"Here is their content — use it as the result of the /df command:\n\n{content}"
        )
    }
}))
