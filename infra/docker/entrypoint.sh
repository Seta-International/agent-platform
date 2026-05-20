#!/usr/bin/env sh
# seta-server image entrypoint.
#
# Dispatch on the first positional arg:
#   serve   (default) — start the Hono server (apps/server)
#   migrate          — run Drizzle migrations via the CLI
#   seed             — seed demo data via the CLI
#   health           — quick connectivity check via the CLI
#
# The image runs TypeScript source directly via tsx (matching dev runtime).
# APP_HOME is set by the Dockerfile and points at the deploy tree containing
# apps/server/{src,node_modules}/ and apps/cli/{src,node_modules}/.
set -eu

: "${APP_HOME:?APP_HOME must be set by the Dockerfile}"

SERVER_DIR="${APP_HOME}/apps/server"
CLI_DIR="${APP_HOME}/apps/cli"

CMD="${1:-serve}"

case "${CMD}" in
  serve)
    cd "${SERVER_DIR}"
    exec "${SERVER_DIR}/node_modules/.bin/tsx" src/index.ts
    ;;
  migrate|seed|health)
    cd "${CLI_DIR}"
    exec "${CLI_DIR}/node_modules/.bin/tsx" src/index.ts "${CMD}"
    ;;
  *)
    echo "entrypoint: unknown subcommand: ${CMD}" >&2
    echo "usage: serve | migrate | seed | health" >&2
    exit 64
    ;;
esac
