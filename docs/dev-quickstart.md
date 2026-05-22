# Dev quickstart — first tenant & accounts

After `pnpm db:migrate`, the database has **zero tenants and zero users** (`pnpm db:seed` is a no-op today). The login page rejects every credential until you provision a tenant. There is no self-signup — admin pre-provisioning is the only path.

## One-shot script

```bash
bash scripts/tenant-bootstrap.sh                      # defaults: slug=sandbox, 1 member
MEMBER_COUNT=5 bash scripts/tenant-bootstrap.sh       # + member1..member5@sandbox.test
SLUG=widgets MEMBER_COUNT=3 bash scripts/tenant-bootstrap.sh
```

Sign in at http://localhost:5173/login with `admin@sandbox.test` / `ChangeMe@2026`.

Overridable env vars: `SLUG`, `NAME`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `MEMBER_COUNT`, `MEMBER_DOMAIN`, `MEMBER_PASSWORD`, `MEMBER_ROLE`.

## Raw CLI (when the script isn't enough)

```bash
set -a && source .env && set +a

pnpm -F @seta/cli exec tsx src/index.ts tenant-create \
  --name "Sandbox Org" --slug sandbox \
  --admin-email admin@sandbox.test \
  --admin-name "Sandbox Admin" \
  --admin-password 'ChangeMe@2026'

pnpm -F @seta/cli exec tsx src/index.ts user-create \
  --tenant sandbox \
  --email member@sandbox.test \
  --name "Sandbox Member" \
  --role org.member \
  --password 'ChangeMe@2026'
```

- Omit `--password` to have one generated and printed as JSON.
- `--role` is repeatable: `org.admin`, `org.member`, `planner.contributor`, `planner.viewer`, …
- Other commands: `role-grant`, `user-deactivate`, `integrations-mail-set`. Full list via `pnpm -F @seta/cli exec tsx src/index.ts --help`.

## Bulk import from CSV (SETA Future Org mock data)

The `mock/planner/` directory contains 300 pre-built users plus plans, tasks, and timesheet data for the `setafutureorg` tenant. Use `pnpm db:import-csv` to load it all in one shot.

### First run (tenant does not exist yet)

Create the tenant and its admin account first:

```bash
export $(grep -v '^#' .env | xargs)

pnpm -F @seta/cli exec tsx src/index.ts tenant-create \
  --name "SETA Future Org" \
  --slug setafutureorg \
  --admin-email thang.tran@setafutureorg.onmicrosoft.com \
  --admin-password "Seta2026@"
```

### Import all CSV data

```bash
export $(grep -v '^#' .env | xargs)

pnpm db:import-csv \
  --tenant setafutureorg \
  --dir ./mock/planner \
  --as thang.tran@setafutureorg.onmicrosoft.com \
  --password "Seta2026@"
```

All 300 users are created with password **`Seta2026@`**. The command is idempotent — re-running it skips users that already exist and reuses the existing group.

### Import only specific modules

Use `--only` to limit which phases run (comma-separated: `users`, `planner`, `availability`):

```bash
# Users only — skip planner data and timesheet availability
pnpm db:import-csv \
  --tenant setafutureorg \
  --dir ./mock/planner \
  --as thang.tran@setafutureorg.onmicrosoft.com \
  --password "Seta2026@" \
  --only users

# Users + planner data, skip availability/timesheet
pnpm db:import-csv \
  --tenant setafutureorg \
  --dir ./mock/planner \
  --as thang.tran@setafutureorg.onmicrosoft.com \
  --password "Seta2026@" \
  --only users,planner
```

Sign in at http://localhost:5173/login with any CSV user email and password `Seta2026@`, or use the admin account `thang.tran@setafutureorg.onmicrosoft.com`.

## Hand it to an agent

Paste this into Claude Code (or any AGENTS.md-aware CLI) from the repo root:

> Bootstrap my local dev environment. Assume Docker, Node 24, and pnpm 9 are installed and `.env` is populated. Run `pnpm install`, `pnpm db:up`, `pnpm db:migrate`. Then run `bash scripts/tenant-bootstrap.sh` with `MEMBER_COUNT=3` to create the `sandbox` tenant with admin `admin@sandbox.test` and three members. Verify by starting `pnpm dev` and reporting whether http://localhost:5173/login accepts the admin credentials (password `ChangeMe@2026`). Stop and ask before running anything destructive.
