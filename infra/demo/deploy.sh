#!/usr/bin/env bash
# Idempotent demo deploy.
#
# Usage (from repo root):
#   ./infra/demo/deploy.sh         # pull → migrate → up
#   ./infra/demo/deploy.sh --seed  # also runs `seta-server seed` once
#
# Re-running on the same SETA_VERSION is safe: docker compose pull is a no-op,
# migrator exits cleanly on an up-to-date schema, and up -d only restarts
# containers whose config/image changed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f .env ]]; then
  echo "deploy.sh: .env not found at $REPO_ROOT/.env" >&2
  echo "           copy infra/demo/.env.example and fill it in first" >&2
  exit 1
fi

COMPOSE=(docker compose -f compose.yml -f infra/demo/compose.override.yml --env-file .env)

echo "==> pull images"
"${COMPOSE[@]}" pull

echo "==> run migrations"
"${COMPOSE[@]}" run --rm migrator

echo "==> start stack"
"${COMPOSE[@]}" up -d

if [[ "${1:-}" == "--seed" ]]; then
  echo "==> seed demo data"
  "${COMPOSE[@]}" run --rm server seed
fi

echo "==> status"
"${COMPOSE[@]}" ps
