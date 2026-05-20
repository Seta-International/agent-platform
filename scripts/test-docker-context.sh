#!/usr/bin/env bash
# Asserts the .dockerignore is doing its job: the build context sent to the
# Docker daemon should be well under 50 MB. node_modules and .turbo are the
# usual culprits when this regresses.
set -euo pipefail

CTX_BYTES=$(tar --exclude-from=.dockerignore -cf - . 2>/dev/null | wc -c | tr -d ' ')
CTX_MB=$(( CTX_BYTES / 1024 / 1024 ))

echo "build context size: ${CTX_MB} MB"

if [ "${CTX_MB}" -gt 50 ]; then
  echo "FAIL: build context exceeds 50 MB — check .dockerignore"
  exit 1
fi

echo "PASS"
