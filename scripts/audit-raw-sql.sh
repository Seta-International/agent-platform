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
# Scope: all feature modules + matching server route files. Per-module, we scan src/
# and drizzle/, and the apps/server/src/routes/<module>-*.ts route shards. A reference
# to the module's own schema is always permitted (intra-schema reads). A reference to
# another module's schema must carry one of the markers above.

set -eu

fail() { echo "❌ $1" >&2; exit 1; }

MODULES=(
  "identity"
  "planner"
  "knowledge"
  "notifications"
  "integrations"
  "staffing"
)

# All known schemas (extend as new modules land).
ALL_SCHEMAS_RE='identity|core|copilot|integrations|planner|knowledge|notifications|staffing'

violations=""

check_file() {
  local file="$1"
  local own_schema="$2"
  local pattern='(FROM|JOIN)[[:space:]]+('"${ALL_SCHEMAS_RE}"')\.'
  local matches
  matches=$(grep -nE "${pattern}" "${file}" 2>/dev/null || true)
  [[ -z "${matches}" ]] && return 0
  while IFS= read -r entry; do
    [[ -z "${entry}" ]] && continue
    local schema
    schema=$(printf '%s' "${entry}" \
      | { sed -nE 's/.*(FROM|JOIN)[[:space:]]+('"${ALL_SCHEMAS_RE}"')\..*/\2/p' || true; } \
      | head -1)
    if [[ -n "${own_schema}" && "${schema}" = "${own_schema}" ]]; then
      continue
    fi
    if printf '%s' "${entry}" | grep -qE -- '-- (hand-written|cross-schema-read):' 2>/dev/null; then
      continue
    fi
    local header
    header="$(head -n 5 "${file}" 2>/dev/null || true)"
    if printf '%s' "${header}" | grep -qE -- '-- (hand-written|cross-schema-read):' 2>/dev/null; then
      continue
    fi
    violations+="${file}:${entry}"$'\n'
  done <<< "${matches}"
}

for mod in "${MODULES[@]}"; do
  for root in "packages/${mod}/src" "packages/${mod}/drizzle"; do
    [[ -d "${root}" ]] || continue
    files=$(grep -rlE '(FROM|JOIN)[[:space:]]+('"${ALL_SCHEMAS_RE}"')\.' "${root}" \
              --include='*.ts' --include='*.sql' --include='*.tsx' 2>/dev/null || true)
    [[ -z "${files}" ]] && continue
    while IFS= read -r f; do
      [[ -z "${f}" ]] && continue
      check_file "${f}" "${mod}"
    done <<< "${files}"
  done

  for f in apps/server/src/routes/"${mod}"-*.ts; do
    [[ -f "${f}" ]] || continue
    check_file "${f}" "${mod}"
  done
done

if [[ -n "${violations}" ]]; then
  printf 'Unmarked cross-module SQL references:\n%s' "${violations}" >&2
  fail "Each cross-module SQL reference must be allowlisted with a '-- hand-written:' or '-- cross-schema-read:' header comment."
fi

echo "✓ raw-SQL audit: ${#MODULES[@]} modules scanned, every cross-module reference has an allowlist marker"
