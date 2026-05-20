#!/usr/bin/env bash
# Asserts the root package.json declares the docker build scripts that
# Layer 0 contributes.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="${REPO_ROOT}/package.json"

REQUIRED=(
  "docker:build:server"
  "docker:build:web"
  "docker:build"
)

for s in "${REQUIRED[@]}"; do
  if ! grep -q "\"${s}\":" "${PKG}"; then
    echo "FAIL: script '${s}' missing from package.json"
    exit 1
  fi
  echo "OK: ${s} present"
done

echo "ALL PASS"
