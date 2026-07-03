#!/usr/bin/env bash
# Regenerates docs/reference/review-schema.sql from a freshly migrated dev DB.
# Run after: pnpm db:reset
set -euo pipefail
docker exec seta-ap-postgres-dev pg_dump -U seta -d seta --schema-only --no-owner --no-privileges \
  -N public -N drizzle \
  > docs/reference/review-schema.sql
echo "review-schema.sql regenerated ($(grep -c 'CREATE TABLE' docs/reference/review-schema.sql) tables)"
