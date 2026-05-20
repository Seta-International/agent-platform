#!/usr/bin/env bash
# Architecture §A5 / CLAUDE.md "Architectural rules that are enforced": every feature
# module talks to its own schema only. Cross-schema reads must be marked with a header
# comment naming the architectural permission.
#
# Allowlist markers (placed in the file header within the first 5 lines, or on the
# same line as the SQL reference):
#   -- hand-written:        one-time backfills (architecture §F.4.2)
#   -- cross-schema-read:   derived-from-events reads (architecture §F.4.1)
#
# Scope: planner module + planner-named server routes. Other modules will be brought
# under this audit in their own PRs (each requires marker backfill on existing reads).

set -eu

fail() { echo "❌ $1" >&2; exit 1; }

PATTERN='FROM[[:space:]]+(identity|core|copilot|integrations)\.|JOIN[[:space:]]+(identity|core|copilot|integrations)\.'

declare -a SCAN_ROOTS=(
  "packages/planner/src"
  "packages/planner/drizzle"
)
declare -a SERVER_ROUTE_GLOB=(apps/server/src/routes/planner-*.ts)

violations=""

check_file() {
  local file="$1"
  local matches
  matches=$(grep -nE "$PATTERN" "$file" 2>/dev/null || true)
  [ -z "$matches" ] && return 0
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    if printf '%s' "$entry" | grep -qE -- '-- (hand-written|cross-schema-read):' 2>/dev/null; then
      continue
    fi
    local header
    header="$(head -n 5 "$file" 2>/dev/null || true)"
    if printf '%s' "$header" | grep -qE -- '-- (hand-written|cross-schema-read):' 2>/dev/null; then
      continue
    fi
    violations+="${file}:${entry}"$'\n'
  done <<< "$matches"
}

for root in "${SCAN_ROOTS[@]}"; do
  [ -d "$root" ] || continue
  files=$(grep -rlE "$PATTERN" "$root" --include='*.ts' --include='*.sql' --include='*.tsx' 2>/dev/null || true)
  [ -z "$files" ] && continue
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    check_file "$file"
  done <<< "$files"
done

for file in "${SERVER_ROUTE_GLOB[@]}"; do
  [ -f "$file" ] || continue
  check_file "$file"
done

if [ -n "$violations" ]; then
  printf 'Unmarked cross-module SQL references:\n%s' "$violations"
  fail "Each cross-module SQL reference must be allowlisted with a '-- hand-written:' or '-- cross-schema-read:' header comment."
fi

echo "✓ raw-SQL audit: every cross-module reference has an allowlist marker"
