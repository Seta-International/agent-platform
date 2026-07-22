#!/usr/bin/env bash
# Status line: "Model | ctx: N% | 5h: N% | 7d: N%"
# Reads the Claude Code status JSON on stdin (see `statusLine` in .claude/settings.json).
# rate_limits is absent for non-subscription accounts and context_window.used_percentage
# is null before the first message, so each segment is emitted only when present.
set -uo pipefail

input=$(cat)

# Degrade to the model name rather than a blank status line when jq is missing.
if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' "${input#*\"display_name\":\"}" | cut -d'"' -f1
  exit 0
fi

printf '%s' "$input" | jq -r '
  [ .model.display_name // empty ]
  + (if .context_window.used_percentage        != null then ["ctx: \(.context_window.used_percentage        | round)%"] else [] end)
  + (if .rate_limits.five_hour.used_percentage != null then ["5h: \(.rate_limits.five_hour.used_percentage  | round)%"] else [] end)
  + (if .rate_limits.seven_day.used_percentage != null then ["7d: \(.rate_limits.seven_day.used_percentage  | round)%"] else [] end)
  | join(" | ")
'
