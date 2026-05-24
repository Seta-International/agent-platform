# Dev quickstart — first tenant & accounts

A fresh DB has **zero tenants and zero users**. The login page rejects every credential until you provision one. There is no self-signup. Pick one of the two paths below — both are idempotent, both auto-load `.env` from the repo root.

## 1. Empty sandbox tenant (fastest)

```bash
bash scripts/tenant-bootstrap.sh                     # admin + 1 member
MEMBER_COUNT=5 bash scripts/tenant-bootstrap.sh      # admin + 5 members
SLUG=widgets bash scripts/tenant-bootstrap.sh        # custom slug
```

Sign in at <http://localhost:5173/login> as `admin@sandbox.test` / `ChangeMe@2026`.

Overridable env vars: `SLUG`, `NAME`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `MEMBER_COUNT`, `MEMBER_DOMAIN`, `MEMBER_PASSWORD`, `MEMBER_ROLE`.

## 2. SETA Future Org demo dataset (300 users + plans + tasks)

```bash
pnpm db:seed
```

That single command creates the `setafutureorg` tenant + admin if missing, then loads `data/planner/*.csv` (users, plans, buckets, tasks, timesheet availability). Re-runs are idempotent — existing users are skipped, the group is reused.

Sign in as any CSV user or the admin `thang.tran@setafutureorg.onmicrosoft.com` with password `ChangeMe@2026`.

Useful flags:

- `--tenant <slug>` — bootstrap a differently-named tenant (default `setafutureorg`)
- `--admin-email <email>` — different admin (default `thang.tran@setafutureorg.onmicrosoft.com`)
- `--dir <path>` — load CSVs from elsewhere (default `./data/planner`)
- `--only users,planner,availability` — run a subset of phases
- `--password <pw>` — password for created users (default `ChangeMe@2026`)

## 3. Advanced — raw CLI

The CLI loads `.env` from the repo root itself, so no `source` / `export` dance is needed.

```bash
pnpm -F @seta/cli exec tsx src/index.ts tenant-create \
  --name "Acme" --slug acme \
  --admin-email admin@acme.test --admin-password 'ChangeMe@2026'

pnpm -F @seta/cli exec tsx src/index.ts user-create \
  --tenant acme --email member@acme.test --name Member \
  --role planner.contributor --password 'ChangeMe@2026'
```

Full command list: `pnpm -F @seta/cli exec tsx src/index.ts --help`. Other useful commands: `role-grant`, `user-deactivate`, `integrations-mail-set`.

## Hand it to an agent

> Bootstrap my local dev environment. Assume Docker, Node 24, and pnpm 9 are installed and `.env` is populated. Run `pnpm install`, `pnpm db:up`, `pnpm db:migrate`, then `pnpm db:seed` to load the SETA Future Org demo data. Verify by starting `pnpm dev` and reporting whether <http://localhost:5173/login> accepts `thang.tran@setafutureorg.onmicrosoft.com` / `ChangeMe@2026`. Stop and ask before running anything destructive.
