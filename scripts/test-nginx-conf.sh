#!/usr/bin/env bash
# Validates infra/docker/web-nginx.conf by asking nginx itself to parse it.
# Runs an nginx container with the file mounted; `nginx -t` exits non-zero
# on syntax errors.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF="${REPO_ROOT}/infra/docker/web-nginx.conf"

if [ ! -f "${CONF}" ]; then
  echo "FAIL: ${CONF} does not exist"
  exit 1
fi

docker run --rm \
  -v "${CONF}:/etc/nginx/conf.d/default.conf:ro" \
  nginxinc/nginx-unprivileged:alpine \
  nginx -t

echo "PASS"
