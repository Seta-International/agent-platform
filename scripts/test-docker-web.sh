#!/usr/bin/env bash
# Smoke test for the seta-web image:
#  1. docker build the image from infra/docker/web.Dockerfile
#  2. docker run it detached, mapped to a random host port
#  3. curl http://localhost:<port>/ and assert 200 + the Vite SPA shell
#  4. curl http://localhost:<port>/healthz and assert 200 "ok"
#  5. tear down
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_TAG="seta-web:smoke-$(date +%s)"
CONTAINER_NAME="seta-web-smoke-$$"

cleanup() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker rmi "${IMAGE_TAG}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> building ${IMAGE_TAG}"
docker build \
  --file "${REPO_ROOT}/infra/docker/web.Dockerfile" \
  --tag "${IMAGE_TAG}" \
  "${REPO_ROOT}"

echo "==> running container"
docker run -d --name "${CONTAINER_NAME}" -p 0:8080 "${IMAGE_TAG}" >/dev/null

HOST_PORT=$(docker port "${CONTAINER_NAME}" 8080/tcp | head -n1 | awk -F: '{print $NF}')
echo "==> container listening on host port ${HOST_PORT}"

for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "==> probing /healthz"
HEALTH=$(curl -fsS "http://127.0.0.1:${HOST_PORT}/healthz")
if [ "${HEALTH}" != "ok" ]; then
  echo "FAIL: /healthz returned: ${HEALTH}"
  exit 1
fi
echo "OK: /healthz -> ok"

echo "==> probing /"
BODY=$(curl -fsS "http://127.0.0.1:${HOST_PORT}/")
if ! echo "${BODY}" | grep -q '<div id="root"'; then
  echo "FAIL: / did not return the Vite SPA shell"
  echo "----- body -----"
  echo "${BODY}"
  echo "----- end -----"
  exit 1
fi
echo "OK: / -> contains <div id=\"root\">"

echo "==> verifying non-root user"
USER_ID=$(docker exec "${CONTAINER_NAME}" id -u)
if [ "${USER_ID}" = "0" ]; then
  echo "FAIL: container is running as root"
  exit 1
fi
echo "OK: container UID = ${USER_ID}"

echo "==> verifying CSP header is present"
CSP=$(curl -fsSI "http://127.0.0.1:${HOST_PORT}/" | tr -d '\r' | grep -i '^content-security-policy:' || true)
if [ -z "${CSP}" ]; then
  echo "FAIL: Content-Security-Policy header missing on /"
  exit 1
fi
echo "OK: CSP header present"

echo "ALL PASS"
