#!/usr/bin/env bash
set -euo pipefail

# Create a tenant + admin + one member via apps/cli.
# Overridable via env vars; defaults are dev-only placeholders.

SLUG="${SLUG:-sandbox}"
NAME="${NAME:-Sandbox Org}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@sandbox.test}"
ADMIN_NAME="${ADMIN_NAME:-Sandbox Admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ChangeMe@2026}"
MEMBER_COUNT="${MEMBER_COUNT:-1}"
MEMBER_PASSWORD="${MEMBER_PASSWORD:-$ADMIN_PASSWORD}"
MEMBER_ROLE="${MEMBER_ROLE:-planner.contributor}"
MEMBER_DOMAIN="${MEMBER_DOMAIN:-${SLUG}.test}"

if ! [[ "$MEMBER_COUNT" =~ ^[0-9]+$ ]]; then
  echo "MEMBER_COUNT must be a non-negative integer (got '${MEMBER_COUNT}')" >&2
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "→ creating tenant ${SLUG} (admin ${ADMIN_EMAIL})"
pnpm -F @seta/cli exec tsx src/index.ts tenant-create \
  --name "$NAME" --slug "$SLUG" \
  --admin-email "$ADMIN_EMAIL" \
  --admin-name "$ADMIN_NAME" \
  --admin-password "$ADMIN_PASSWORD"

for ((i = 1; i <= MEMBER_COUNT; i++)); do
  email="member${i}@${MEMBER_DOMAIN}"
  name="Member ${i}"
  echo "→ creating member ${email} (role ${MEMBER_ROLE})"
  pnpm -F @seta/cli exec tsx src/index.ts user-create \
    --tenant "$SLUG" \
    --email "$email" \
    --name "$name" \
    --role "$MEMBER_ROLE" \
    --password "$MEMBER_PASSWORD"
  pnpm -F @seta/cli exec tsx src/index.ts role-grant \
    --user "$email" --tenant "$SLUG" --role knowledge.member --scope tenant --action grant
  pnpm -F @seta/cli exec tsx src/index.ts role-grant \
    --user "$email" --tenant "$SLUG" --role agent.contributor --scope tenant --action grant
done

cat <<EOF

Tenant ready. Sign in at http://localhost:5173/login

  Admin    : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
  Members  : ${MEMBER_COUNT} × member{1..${MEMBER_COUNT}}@${MEMBER_DOMAIN} / ${MEMBER_PASSWORD}
EOF
