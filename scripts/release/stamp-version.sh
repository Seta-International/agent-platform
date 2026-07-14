#!/usr/bin/env bash
# Derive a release version from a release/* ref and stamp it into package.json.
#
# Prod only ever ships from a release/<X.Y.Z> branch (enforced by deploy.yml's
# authorize job), so the branch name is the source of truth for the version.
# This script extracts X.Y.Z, validates it as strict SemVer, and writes it into
# the root package.json via `npm pkg set`. deploy.yml's prod `tag` job then
# commits the bump, tags v<X.Y.Z>, and creates the GitHub Release.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: stamp-version.sh [--extract-only] <ref>

<ref> is a release branch ref, e.g. `release/2.4.0` or `refs/heads/release/2.4.0`.
Extracts the X.Y.Z version, validates it as strict SemVer (no v-prefix, no
prerelease/build metadata), and by default writes it into ./package.json via
`npm pkg set`. Prints the resolved version to stdout.

Flags:
  --extract-only   Print the validated version only; do not touch package.json.
  --help, -h       Show this help.
USAGE
}

EXTRACT_ONLY=0
REF=""
for arg in "$@"; do
  case "$arg" in
    --extract-only) EXTRACT_ONLY=1 ;;
    --help|-h) usage; exit 0 ;;
    -*) echo "unknown flag: $arg" >&2; usage >&2; exit 2 ;;
    *) REF="$arg" ;;
  esac
done

[[ -n "$REF" ]] || { echo "error: missing <ref>" >&2; usage >&2; exit 2; }

# Accept a fully-qualified ref (refs/heads/... , refs/tags/...) as well as a bare name.
REF="${REF#refs/heads/}"
REF="${REF#refs/tags/}"

case "$REF" in
  release/*) ;;
  *) echo "error: not a release branch: '$REF' (expected release/<X.Y.Z>)" >&2; exit 1 ;;
esac

VERSION="${REF#release/}"

# Strict SemVer core: MAJOR.MINOR.PATCH, digits only — no v-prefix, no
# prerelease/build metadata. Prod releases are always a clean X.Y.Z.
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: '$VERSION' is not a strict X.Y.Z version" >&2
  exit 1
fi

if [[ "$EXTRACT_ONLY" == "1" ]]; then
  echo "$VERSION"
  exit 0
fi

command -v npm >/dev/null || { echo "error: npm is required to write package.json" >&2; exit 1; }
# `npm pkg set` edits only the cwd package.json (not workspaces) and preserves formatting.
npm pkg set version="$VERSION" >/dev/null

echo "$VERSION"
