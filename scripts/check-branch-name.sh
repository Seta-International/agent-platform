#!/usr/bin/env bash
# Enforce branch naming: <type>/<JIRA-KEY>-<slug>, e.g. feat/FUT-123-group-viewer.
# Protected/automation branches are exempt. Pass a branch name as $1 (CI),
# otherwise the current branch is used (local hook).
set -euo pipefail

branch="${1:-$(git rev-parse --abbrev-ref HEAD)}"

case "$branch" in
  main|develop|HEAD|release/*|dependabot/*)
    exit 0
    ;;
esac

pattern='^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)/[A-Z]+-[0-9]+(-[a-z0-9.]+)*$'

if [[ "$branch" =~ $pattern ]]; then
  exit 0
fi

cat >&2 <<EOF
✖ Branch name "$branch" is invalid.
  Expected: <type>/<JIRA-KEY>-<slug>
  Example:  feat/FUT-123-group-viewer
  Types:    feat fix chore docs refactor test ci build perf style revert
EOF
exit 1
