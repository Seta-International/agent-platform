#!/usr/bin/env bash
# Sanity tests for release-check.sh. Run with: bash scripts/release-check.test.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/release-check.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

[[ -x "$SCRIPT" ]] || fail "release-check.sh is missing or not executable"
pass "script exists"

out=$("$SCRIPT" --help)
for needle in "build" "smoke" "scan" "skip-push"; do
  echo "$out" | grep -q "$needle" || fail "--help missing mention of $needle"
done
pass "--help documents stages"

out=$("$SCRIPT" --no-build)
echo "$out" | grep -q "would build seta-server" || fail "dry-run missing seta-server line"
echo "$out" | grep -q "would build seta-web"    || fail "dry-run missing seta-web line"
pass "dry-run reports both images"

out=$("$SCRIPT" --no-build 2>&1)
echo "$out" | grep -q "push disabled" || fail "script must print 'push disabled' in local mode"
pass "local mode disables push"

echo "all release-check.sh sanity tests passed"
