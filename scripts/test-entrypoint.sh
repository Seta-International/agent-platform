#!/usr/bin/env bash
# Unit-tests the dispatch logic in infra/docker/entrypoint.sh by stubbing the
# per-app `tsx` binary so we can observe what the entrypoint *would* exec.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRYPOINT="${REPO_ROOT}/infra/docker/entrypoint.sh"

if [ ! -x "${ENTRYPOINT}" ]; then
  echo "FAIL: ${ENTRYPOINT} not executable"
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "${TMP}"' EXIT

export APP_HOME="${TMP}/app"
mkdir -p "${APP_HOME}/apps/server/node_modules/.bin" "${APP_HOME}/apps/cli/node_modules/.bin"

# Stub `tsx` in each app dir that echoes "tsx $args" + cwd to a log file.
make_tsx_stub() {
  local target="$1"
  cat >"${target}" <<EOF
#!/usr/bin/env bash
echo "tsx \$* (cwd=\$(pwd))" >>"\${TSX_LOG}"
EOF
  chmod +x "${target}"
}
make_tsx_stub "${APP_HOME}/apps/server/node_modules/.bin/tsx"
make_tsx_stub "${APP_HOME}/apps/cli/node_modules/.bin/tsx"

export TSX_LOG="${TMP}/tsx.log"

assert_dispatch() {
  local subcmd="$1" expected="$2"
  : >"${TSX_LOG}"
  "${ENTRYPOINT}" "${subcmd}"
  local got
  got=$(cat "${TSX_LOG}")
  if [ "${got}" != "${expected}" ]; then
    echo "FAIL: subcommand '${subcmd}' — expected: ${expected}  got: ${got}"
    exit 1
  fi
  echo "OK: ${subcmd} -> ${got}"
}

assert_dispatch "serve"   "tsx src/index.ts (cwd=${APP_HOME}/apps/server)"
assert_dispatch "migrate" "tsx src/index.ts migrate (cwd=${APP_HOME}/apps/cli)"
assert_dispatch "seed"    "tsx src/index.ts seed (cwd=${APP_HOME}/apps/cli)"
assert_dispatch "health"  "tsx src/index.ts health (cwd=${APP_HOME}/apps/cli)"

# Unknown subcommand should exit non-zero.
if "${ENTRYPOINT}" bogus 2>/dev/null; then
  echo "FAIL: unknown subcommand 'bogus' should have exited non-zero"
  exit 1
fi
echo "OK: bogus -> non-zero exit"

# Default (no arg) -> serve
: >"${TSX_LOG}"
"${ENTRYPOINT}"
got=$(cat "${TSX_LOG}")
if [ "${got}" != "tsx src/index.ts (cwd=${APP_HOME}/apps/server)" ]; then
  echo "FAIL: default — expected serve, got: ${got}"
  exit 1
fi
echo "OK: default -> serve"

echo "ALL PASS"
