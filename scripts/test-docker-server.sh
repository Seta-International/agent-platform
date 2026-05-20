#!/usr/bin/env bash
# Smoke test for the seta-server image. Verifies:
#  - image builds
#  - non-root UID 10001
#  - `health` subcommand exits 0 (proves bundle loads + env parses)
#  - unknown subcommand exits 64
#  - serve subcommand starts and at least dispatches to node
#
# Optional: set RUN_TRIVY=1 to additionally scan the image (HIGH gate).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_TAG="seta-server:smoke-$(date +%s)"

cleanup() {
  docker rmi "${IMAGE_TAG}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> building ${IMAGE_TAG}"
docker build \
  --file "${REPO_ROOT}/infra/docker/server.Dockerfile" \
  --tag "${IMAGE_TAG}" \
  "${REPO_ROOT}"

echo "==> verifying non-root UID"
UID_OUT=$(docker run --rm --entrypoint id "${IMAGE_TAG}" -u)
if [ "${UID_OUT}" != "10001" ]; then
  echo "FAIL: expected UID 10001, got ${UID_OUT}"
  exit 1
fi
echo "OK: UID = 10001"

COMMON_ENV=(
  -e "DATABASE_URL=postgres://x:x@localhost:5432/x"
  -e "BETTER_AUTH_SECRET=$(printf 'a%.0s' {1..32})"
)

echo "==> running 'health' subcommand"
docker run --rm "${COMMON_ENV[@]}" "${IMAGE_TAG}" health
echo "OK: health exit 0"

echo "==> running unknown subcommand — expect exit 64"
set +e
docker run --rm "${COMMON_ENV[@]}" "${IMAGE_TAG}" bogus
RC=$?
set -e
if [ "${RC}" != "64" ]; then
  echo "FAIL: expected exit 64 for unknown subcommand, got ${RC}"
  exit 1
fi
echo "OK: unknown subcommand exits 64"

echo "==> verifying entrypoint dispatch for 'serve'"
SERVE_OUT=$(docker run --rm "${COMMON_ENV[@]}" "${IMAGE_TAG}" serve 2>&1 || true)
if echo "${SERVE_OUT}" | grep -qE '(apps/server|ECONNREFUSED|ENOTFOUND|connect|migrations|listen|drizzle|pino|hono)'; then
  echo "OK: serve dispatched to node (output indicates server boot was attempted)"
else
  echo "FAIL: serve dispatch did not produce expected boot signals"
  echo "----- output -----"
  echo "${SERVE_OUT}"
  echo "----- end -----"
  exit 1
fi

if [ "${RUN_TRIVY:-0}" = "1" ]; then
  echo "==> running Trivy scan (HIGH gate)"
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy:latest \
    image --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed "${IMAGE_TAG}"
  echo "OK: Trivy scan passed"
fi

echo "ALL PASS"
