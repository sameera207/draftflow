#!/usr/bin/env python3
"""
Stop hook: saves the last assistant text response to last-response.md for /df p
Transcript format: each line is JSON with type="assistant"|"user"|...
  assistant entries: { "type": "assistant", "message": { "content": [...blocks] } }
"""
import sys, json, pathlib

data = json.load(sys.stdin)
transcript_path = data.get("transcript_path")
if not transcript_path:
    sys.exit(0)

try:
    transcript_file = pathlib.Path(transcript_path)
    if not transcript_file.exists():
        sys.exit(0)

    lines = transcript_file.read_text().strip().splitlines()
    last_text = ""

    for line in reversed(lines):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("type") != "assistant":
            continue
        message = obj.get("message", {})
        if not isinstance(message, dict):
            continue
        content = message.get("content", [])
        if not isinstance(content, list):
            continue
        parts = [b.get("text", "") for b in content
                 if isinstance(b, dict) and b.get("type") == "text"]
        # Plan mode stores content in ExitPlanMode tool_use input, not text blocks
        if not any(parts):
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "ExitPlanMode":
                    plan = b.get("input", {}).get("plan", "")
                    if plan:
                        parts.append(plan)
                    break
        text = "\n".join(p for p in parts if p).strip()
        if text:
            last_text = text
            break

    if last_text:
        bridge = pathlib.Path.home() / ".claude" / "editor-bridge"
        bridge.mkdir(parents=True, exist_ok=True)
        (bridge / "last-response.md").write_text(last_text)

except Exception:
    pass

sys.exit(0)
