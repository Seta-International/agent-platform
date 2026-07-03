#!/usr/bin/env bash
# One-time provisioning of the load-test tenant + standing read corpus (PRG-1).
# Usage (against a live env):
#   BASE_URL=https://uat.example.com LOADTEST_ADMIN_PASSWORD=... LOADTEST_MEMBER_PASSWORD=... \
#     MEMBER_COUNT=100 bash scripts/loadtest-bootstrap.sh
# Requires: DATABASE_URL pointing at the same env's DB (CLI role-grant is direct-DB).
set -euo pipefail

export SLUG="${SLUG:-loadtest}"
export NAME="${NAME:-Load Test}"
export ADMIN_EMAIL="${LOADTEST_ADMIN_EMAIL:-admin@loadtest.test}"
export ADMIN_NAME="Load Admin"
export ADMIN_PASSWORD="${LOADTEST_ADMIN_PASSWORD:?LOADTEST_ADMIN_PASSWORD required}"
export MEMBER_COUNT="${MEMBER_COUNT:-100}"
export MEMBER_PASSWORD="${LOADTEST_MEMBER_PASSWORD:?LOADTEST_MEMBER_PASSWORD required}"
export MEMBER_ROLE="planner.member"
export MEMBER_DOMAIN="${MEMBER_DOMAIN:-loadtest.test}"

bash "$(dirname "$0")/tenant-bootstrap.sh"

# Read journeys need people/pm read access on top of planner.member.
for i in $(seq 1 "$MEMBER_COUNT"); do
  email="member${i}@${MEMBER_DOMAIN}"
  for role in people.viewer pm.viewer; do
    pnpm -F @seta/cli exec tsx src/index.ts role-grant \
      --user "$email" --tenant "$SLUG" --role "$role" --scope tenant --action grant
  done
done

BASE_URL="${BASE_URL:?BASE_URL required (e.g. https://uat.example.com)}" \
LOADTEST_ADMIN_EMAIL="$ADMIN_EMAIL" LOADTEST_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
MEMBER_COUNT="$MEMBER_COUNT" MEMBER_DOMAIN="$MEMBER_DOMAIN" \
  node "$(dirname "$0")/loadtest-corpus.mjs"

echo "✅ loadtest tenant + corpus ready (members: $MEMBER_COUNT)"
