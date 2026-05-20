#!/usr/bin/env bash
# Locally simulate the release.yml build + scan stages.
# Pushes are always disabled here; CI is the only thing that pushes.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: release-check.sh [--no-build] [--help]

Runs the same build + smoke + scan stages release.yml runs, with push disabled.
Intended for fast local feedback before pushing a tag.

Flags:
  --no-build   Skip the docker build step (just report what would run).
  --help       Show this help.

Stages simulated:
  1. build      buildx --load (single-arch, host's native).
  2. smoke      run the resulting seta-server image with `health` subcommand.
  3. scan       Trivy on seta-server, fail on HIGH/CRITICAL.

Push is always skip-push in this script. CI is the only thing allowed to push.
USAGE
}

NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    --help|-h)  usage; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

VERSION="${SETA_VERSION:-v0.0.0-local}"
SERVER_IMG="seta-server:${VERSION}"
WEB_IMG="seta-web:${VERSION}"

echo "[release-check] push disabled (local mode)"
echo "[release-check] version=${VERSION}"

if [[ "$NO_BUILD" == "1" ]]; then
  echo "[release-check] would build ${SERVER_IMG} (Dockerfile: infra/docker/server.Dockerfile)"
  echo "[release-check] would build ${WEB_IMG} (Dockerfile: infra/docker/web.Dockerfile)"
  echo "[release-check] would smoke-test ${SERVER_IMG}"
  echo "[release-check] would scan ${SERVER_IMG} with Trivy"
  exit 0
fi

require() { command -v "$1" >/dev/null || { echo "missing tool: $1" >&2; exit 1; }; }
require docker

echo "[release-check] build seta-server"
docker buildx build --load \
  -f infra/docker/server.Dockerfile \
  -t "${SERVER_IMG}" \
  .

echo "[release-check] build seta-web"
docker buildx build --load \
  -f infra/docker/web.Dockerfile \
  -t "${WEB_IMG}" \
  .

echo "[release-check] smoke seta-server"
docker run --rm "${SERVER_IMG}" health || {
  echo "smoke test failed" >&2; exit 1;
}

echo "[release-check] scan seta-server with Trivy"
require trivy
trivy image \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --exit-code 1 \
  "${SERVER_IMG}"

echo "[release-check] all stages green"
