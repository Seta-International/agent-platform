#!/usr/bin/env bash
set -euo pipefail

pnpm tsx apps/cli/src/index.ts tenant-create \
  --name "Demo Inc" --slug demo \
  --admin-email admin@demo.local --admin-password 'ChangeMe@2026'

pnpm tsx apps/cli/src/index.ts user-create \
  --tenant demo --email alice@demo.local --name Alice \
  --password 'ChangeMe@2026' --role planner.contributor

pnpm tsx apps/cli/src/index.ts user-create \
  --tenant demo --email bob@demo.local --name Bob \
  --password 'ChangeMe@2026' --role planner.viewer

echo "Demo tenant ready. Sign in at http://localhost:5173/login as admin@demo.local"
