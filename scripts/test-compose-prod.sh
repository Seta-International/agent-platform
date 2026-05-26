#!/usr/bin/env bash
# Smoke test for the production compose.yml.
# Brings the stack up against locally-built images, waits for healthchecks,
# asserts the public endpoints respond, tears down.
#
# Env overrides:
#   PLATFORM_IMAGE_SERVER (default: seta-server:local)
#   PLATFORM_IMAGE_WEB    (default: seta-web:local)
#   PLATFORM_SMOKE_DOMAIN (default: localhost)
#
# Requires: docker compose v2, curl.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$here/.." && pwd)"
cd "$repo_root"

PLATFORM_IMAGE_SERVER="${PLATFORM_IMAGE_SERVER:-seta-server:local}"
PLATFORM_IMAGE_WEB="${PLATFORM_IMAGE_WEB:-seta-web:local}"
PLATFORM_SMOKE_DOMAIN="${PLATFORM_SMOKE_DOMAIN:-localhost}"

cleanup() {
  echo "--- smoke: tearing down ---"
  docker compose -f compose.yml --env-file .env.smoke down -v --remove-orphans || true
  rm -f .env.smoke
}
trap cleanup EXIT

echo "--- smoke: rendering .env.smoke ---"
cp .env.example .env.smoke
{
  echo "PLATFORM_IMAGE_SERVER=$PLATFORM_IMAGE_SERVER"
  echo "PLATFORM_IMAGE_WEB=$PLATFORM_IMAGE_WEB"
  echo "PLATFORM_DOMAIN=$PLATFORM_SMOKE_DOMAIN"
  echo "PLATFORM_ACME_EMAIL=smoke@example.invalid"
  echo "PLATFORM_TLS_MODE=self-signed"
  echo "POSTGRES_PASSWORD=smoke-postgres-pw"
  echo "DATABASE_URL=postgres://seta:smoke-postgres-pw@postgres:5432/seta"
  echo "BETTER_AUTH_SECRET=$(printf 'smoke-secret-%032d' 0)"
  echo "PUBLIC_URL=https://$PLATFORM_SMOKE_DOMAIN"
} >> .env.smoke

echo "--- smoke: docker compose up -d ---"
docker compose -f compose.yml --env-file .env.smoke up -d

echo "--- smoke: waiting for postgres healthy ---"
bash scripts/lib/compose-wait.sh compose.yml postgres healthy 60

echo "--- smoke: waiting for migrator to exit 0 ---"
bash scripts/lib/compose-wait.sh compose.yml migrator exited:0 120

echo "--- smoke: waiting for server healthy ---"
bash scripts/lib/compose-wait.sh compose.yml server healthy 60

echo "--- smoke: waiting for proxy running ---"
bash scripts/lib/compose-wait.sh compose.yml proxy running 30

echo "--- smoke: probing https://$PLATFORM_SMOKE_DOMAIN/ ---"
curl --fail --silent --show-error --insecure --max-time 10 \
  --output /dev/null --write-out 'web: HTTP %{http_code}\n' \
  "https://$PLATFORM_SMOKE_DOMAIN/"

echo "--- smoke: probing https://$PLATFORM_SMOKE_DOMAIN/health/live ---"
curl --fail --silent --show-error --insecure --max-time 10 \
  --output /dev/null --write-out 'api: HTTP %{http_code}\n' \
  "https://$PLATFORM_SMOKE_DOMAIN/health/live"

echo "--- smoke: PASS ---"
