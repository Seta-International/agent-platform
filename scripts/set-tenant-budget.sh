#!/usr/bin/env bash
set -euo pipefail

# Set per-tenant AI budget caps (operator-only; requires DB access).
# Usage: scripts/set-tenant-budget.sh <tenant-slug-or-id> [--daily N] [--monthly N] [--currency USD]
# Omit a flag to leave that limit unlimited (NULL).

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

TENANT_REF="${1:-}"
shift || true
DAILY="NULL"
MONTHLY="NULL"
CURRENCY="USD"

while [ $# -gt 0 ]; do
  case "$1" in
    --daily) DAILY="$2"; shift 2 ;;
    --monthly) MONTHLY="$2"; shift 2 ;;
    --currency) CURRENCY="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$TENANT_REF" ]; then
  echo "usage: scripts/set-tenant-budget.sh <tenant-slug-or-id> [--daily N] [--monthly N] [--currency USD]" >&2
  exit 1
fi

PSQL=(psql "${DATABASE_URL:?DATABASE_URL not set}")

# Resolve slug -> id (accepts a uuid directly too).
TENANT_ID="$("${PSQL[@]}" -tA -c \
  "SELECT id FROM core.tenants WHERE id::text = '${TENANT_REF}' OR slug = '${TENANT_REF}' LIMIT 1")"

if [ -z "$TENANT_ID" ]; then
  echo "tenant not found: ${TENANT_REF}" >&2
  exit 1
fi

"${PSQL[@]}" -c "
  INSERT INTO billing.tenant_budgets (tenant_id, daily_limit, monthly_limit, currency, updated_at)
  VALUES ('${TENANT_ID}', ${DAILY}, ${MONTHLY}, '${CURRENCY}', now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    daily_limit = EXCLUDED.daily_limit,
    monthly_limit = EXCLUDED.monthly_limit,
    currency = EXCLUDED.currency,
    updated_at = now();
"

echo "→ budget set for ${TENANT_REF} (${TENANT_ID}): daily=${DAILY} monthly=${MONTHLY} ${CURRENCY}"
