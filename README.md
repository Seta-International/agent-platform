# Seta — Agent Platform

A multi-tenant, AI-first work-management platform. Modular monolith on
Node 24, Hono, Postgres, Drizzle, and Mastra; React 19 + TanStack
Router + assistant-ui on the front end.

## Quickstart

Requires Node 24, pnpm 9, Docker, and a POSIX shell.

```bash
pnpm install
pnpm db:up                          # local Postgres via docker compose
pnpm db:migrate                     # apply Drizzle + hand-written migrations
bash scripts/tenant-bootstrap.sh    # create the `sandbox` tenant + admin
pnpm dev                            # all apps via Turborepo
```

Web client → http://localhost:5173 · API server → http://localhost:3000 · admin login `admin@sandbox.test` / `ChangeMe@2026`.

A fresh DB has **no tenants and no users** (`db:seed` is a no-op today); the login page rejects everything until `tenant-bootstrap.sh` runs. See [`docs/dev-quickstart.md`](docs/dev-quickstart.md) for `MEMBER_COUNT=N`, raw-CLI usage, and an agent-ready prompt.

## Workspace

| Package | Purpose |
|---|---|
| [`apps/web`](apps/web) | React 19 SPA — planner views and copilot chat |
| [`apps/server`](apps/server) | Hono API + dispatcher + graphile-worker host |
| [`apps/cli`](apps/cli) | Operational CLI — migrate, seed, provision |
| [`packages/core`](packages/core) | Outbox, event bus, dispatcher, workers |
| [`packages/identity`](packages/identity) | Users, orgs, sessions, SSO, RBAC bindings |
| [`packages/planner`](packages/planner) | Plans, buckets, tasks; Microsoft Planner sync |
| [`packages/copilot`](packages/copilot) | Mastra agents + AI SDK tools with HITL approvals |
| [`packages/integrations`](packages/integrations) | Credential store, mail config, MS Graph |
| [`packages/shared-ui`](packages/shared-ui) | Design system — tokens, primitives, the only `.css` |
| [`packages/shared-db`](packages/shared-db) | Postgres + Drizzle primitives |
| [`packages/shared-rbac`](packages/shared-rbac) | Role and permission primitives |
| [`packages/shared-crypto`](packages/shared-crypto) | KMS envelope encryption |
| [`packages/shared-mailer`](packages/shared-mailer) | Transactional mail + React Email |
| [`packages/shared-testing`](packages/shared-testing) | Postgres testcontainers |
| [`packages/shared-types`](packages/shared-types) | Cross-module type contracts |
| [`packages/shared-config`](packages/shared-config) | Base tsconfig + ESLint boundaries |
| [`sdks/module`](sdks/module) | `@seta/module-sdk` — frontend nav-manifest contract |
| [`sdks/copilot`](sdks/copilot) | `@seta/copilot-sdk` — agent-tool contract (`defineCopilotTool`) |

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Run every app with HMR |
| `pnpm build` | Production build across the workspace |
| `pnpm typecheck` | TypeScript project references |
| `pnpm test` | Vitest, against real Postgres via testcontainers (DB-test parallelism capped — see `packages/shared-config/vitest/db-test-defaults.ts`) |
| `pnpm lint` | Biome + dep-cruiser + style + raw-SQL + boundaries |
| `pnpm db:reset` | Drop, recreate, migrate, and reseed the dev DB |

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — agent-facing project guidance (also linked as `AGENTS.md`)
- [`DESIGN.md`](DESIGN.md) — design tokens and front-end style guide
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute

## License

[MIT](LICENSE) © Seta International
