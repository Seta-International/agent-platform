# Dev quickstart

Get from a fresh `git clone` to a running app with seeded data. On a machine that already has the prerequisites, this takes about five minutes.

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node | 24 LTS | `node --version` |
| pnpm | 11+ | `pnpm --version` (`corepack enable` if missing) |
| Docker | running | `docker info` |

Postgres, Redis, and the telemetry stack all run in Docker — you do not install them locally.

## 1. Clone and install

```bash
git clone https://github.com/Seta-International/agent-platform.git
cd agent-platform
pnpm install
```

## 2. Configure your environment

```bash
cp .env.example .env
```

The defaults already point at the local Docker stack, so you only need to fill in three secrets:

| Variable | How to generate |
|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `CRYPTO_LOCAL_MASTER_KEY` | `pnpm --filter @seta/shared-crypto crypto:gen-local-key` |
| `OPENAI_API_KEY` | Your OpenAI key. To use another provider, change `AGENT_MODELS` and `EMBED_MODEL` and set that provider's key — see the comments in `.env.example` §7–8. |

Everything else (SSO, mail, S3, telemetry, AV scanning) is optional for local dev. The `.env.example` comments mark which values change when you self-host.

## 3. Start Postgres and run migrations

```bash
pnpm db:up        # starts Postgres (host port 5442), Redis, telemetry
pnpm db:migrate   # applies all module migrations
```

> Postgres is exposed on `localhost:5442` (the dev stack offsets ports by +10 so it can run alongside other projects). That is why `DATABASE_URL` in `.env` uses port `5442`, not `5432`.

## 4. Load data — pick one

A fresh database has **zero tenants and zero users**, and there is no self-signup. The login page rejects every credential until you provision one. Both options below are idempotent and load `.env` automatically.

### Option A — demo dataset (recommended)

```bash
pnpm db:seed
```

Creates the `hackathon` tenant + admin, then loads `hackathon/data/*.csv` (≈300 users, plans, buckets, tasks, timesheet availability). Re-runs skip existing rows.

Sign in as the admin `admin@hackathon.com` (or any CSV user) with password `ChangeMe@2026`.

Useful flags: `--tenant <slug>`, `--admin-email <email>`, `--dir <path>`, `--only users,planner,availability`, `--password <pw>`.

### Option B — empty sandbox tenant (fastest)

```bash
bash scripts/tenant-bootstrap.sh                  # admin + 1 member
MEMBER_COUNT=5 bash scripts/tenant-bootstrap.sh   # admin + 5 members
SLUG=widgets bash scripts/tenant-bootstrap.sh     # custom slug
```

Sign in as `admin@sandbox.test` / `ChangeMe@2026`, or as a member `member1@sandbox.test` / `ChangeMe@2026`. Each member is seeded with `planner.contributor`, `knowledge.member`, and `agent.contributor`, so Planner, Knowledge, and Chat are usable out of the box (nav is permission-gated).

Overridable env vars: `SLUG`, `NAME`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `MEMBER_COUNT`, `MEMBER_DOMAIN`, `MEMBER_PASSWORD`, `MEMBER_ROLE` (the primary role; defaults to `planner.contributor`).

## 5. Run the app

```bash
pnpm dev
```

Open <http://localhost:5173/login> and sign in with the credentials from step 4.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ECONNREFUSED ... 5442` or migrations hang | Postgres isn't up. Run `pnpm db:up` and wait a few seconds, then retry. |
| Login page rejects valid-looking credentials | No tenant/user provisioned yet — run step 4. There is no self-signup. |
| Port `5442`/`6389`/`5173` already in use | Another stack is bound to it. Stop it, or change the host port in `infra/docker/compose.dev.yml`. |
| `BETTER_AUTH_SECRET`/`CRYPTO_LOCAL_MASTER_KEY` errors at boot | The secret is unset or too short — regenerate per step 2. |
| Cookies/redirects misbehave | Confirm `.env` has `NODE_ENV=development` and `PUBLIC_URL=http://localhost:5173` (the local defaults). |
| Start completely over | `pnpm db:reset` tears the volume down, re-migrates, and re-seeds. |

## Advanced — raw CLI

The CLI loads `.env` from the repo root, so no `source`/`export` is needed.

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

> Bootstrap my local dev environment. Assume Docker, Node 24, and pnpm 11 are installed. Run `pnpm install`, `cp .env.example .env` and fill `BETTER_AUTH_SECRET`, `CRYPTO_LOCAL_MASTER_KEY`, and `OPENAI_API_KEY`, then `pnpm db:up`, `pnpm db:migrate`, and `pnpm db:seed`. Verify by starting `pnpm dev` and reporting whether <http://localhost:5173/login> accepts `admin@hackathon.com` / `ChangeMe@2026`. Stop and ask before running anything destructive.
