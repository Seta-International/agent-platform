#!/usr/bin/env bash
# Sanity tests for stamp-version.sh. Run with: bash scripts/release/stamp-version.test.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/stamp-version.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

[[ -x "$SCRIPT" ]] || fail "stamp-version.sh is missing or not executable"
pass "script exists"

out=$("$SCRIPT" --help)
echo "$out" | grep -q "release/" || fail "--help should document the release/ ref format"
pass "--help documents usage"

# --- extraction / validation (no write) ---
expect_version() { # <ref> <expected>
  local got
  got=$("$SCRIPT" --extract-only "$1") || fail "extract failed for '$1'"
  [[ "$got" == "$2" ]] || fail "extract '$1' => '$got', expected '$2'"
  pass "extract $1 => $2"
}
expect_reject() { # <ref>
  if "$SCRIPT" --extract-only "$1" >/dev/null 2>&1; then
    fail "expected rejection for '$1'"
  fi
  pass "reject $1"
}

expect_version "release/2.4.0" "2.4.0"
expect_version "refs/heads/release/2.4.0" "2.4.0"
expect_version "release/10.20.30" "10.20.30"

expect_reject "release/2.4"          # not X.Y.Z
expect_reject "release/2.4.0.1"      # too many parts
expect_reject "release/v2.4.0"       # leading v
expect_reject "release/2.4.0-rc.1"   # prerelease not allowed
expect_reject "feat/FUT-1-thing"     # not a release branch
expect_reject "main"                 # not a release branch
expect_reject ""                     # empty

# no-arg => usage error
if "$SCRIPT" >/dev/null 2>&1; then fail "expected usage error with no ref"; fi
pass "no-arg errors"

# --- write path (bumps ./package.json) ---
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf '{\n  "name": "fixture",\n  "version": "0.0.0"\n}\n' > "$tmp/package.json"

got=$( cd "$tmp" && "$SCRIPT" release/9.9.9 )
[[ "$got" == "9.9.9" ]] || fail "write path should print the version"
grep -q '"version": "9.9.9"' "$tmp/package.json" || fail "package.json version not bumped to 9.9.9"
pass "bumps package.json version"

# idempotent: same version again is still a success printing the same version
got=$( cd "$tmp" && "$SCRIPT" release/9.9.9 )
[[ "$got" == "9.9.9" ]] || fail "re-run should still print the version"
pass "re-run is idempotent"

echo "all stamp-version.sh sanity tests passed"
