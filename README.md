# Seta — Agent Platform

A multi-tenant, AI-first work-management platform. Modular monolith on Node 24, Hono, Postgres, Drizzle, and Mastra; React 19 + TanStack Router + assistant-ui on the front end.

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

A fresh DB has **no tenants and no users**; the login page rejects everything until `tenant-bootstrap.sh` runs. See [`docs/dev-quickstart.md`](docs/dev-quickstart.md) for `MEMBER_COUNT=N`, raw-CLI usage, the `pnpm db:seed` path for the SETA Future Org demo dataset, and an agent-ready prompt.

## Workspace

| Package | Purpose |
|---|---|
| [`apps/web`](apps/web) | React 19 SPA — planner, copilot chat, console admin |
| [`apps/server`](apps/server) | Hono API; dev also runs the dispatcher + worker pool |
| [`apps/worker`](apps/worker) | Production graphile-worker pool + LISTEN/NOTIFY dispatcher |
| [`apps/cli`](apps/cli) | Operational CLI — migrate, seed, provision, embedding backfill |
| [`packages/core`](packages/core) | Outbox, event bus, dispatcher, runtime composition |
| [`packages/identity`](packages/identity) | Users, sessions, SSO, role grants |
| [`packages/planner`](packages/planner) | Plans, buckets, tasks; Microsoft Planner sync |
| [`packages/integrations`](packages/integrations) | M365 boot, mail-transport config, MCP clients |
| [`packages/knowledge`](packages/knowledge) | Tenant knowledge corpus + RAG pipeline |
| [`packages/notifications`](packages/notifications) | In-app + email prefs, SSE hub |
| [`packages/copilot`](packages/copilot) | Mastra engine + agent factory (no feature imports) |
| [`packages/staffing`](packages/staffing) | Orchestrator: cross-module workflows |
| [`packages/shared-ui`](packages/shared-ui) | Design system — tokens, primitives, the only `.css` |
| [`packages/shared-db`](packages/shared-db) | Postgres + Drizzle primitives |
| [`packages/shared-rbac`](packages/shared-rbac) | Role and permission primitives |
| [`packages/shared-crypto`](packages/shared-crypto) | KMS / env-key envelope encryption |
| [`packages/shared-mailer`](packages/shared-mailer) | Transactional mail + react-email |
| [`packages/shared-storage`](packages/shared-storage) | S3-lite wrapper, presigned URLs |
| [`packages/shared-embeddings`](packages/shared-embeddings) | Embedding providers + batching |
| [`packages/shared-retrieval`](packages/shared-retrieval) | FTS + vector RRF + rerank |
| [`packages/shared-testing`](packages/shared-testing) | Postgres testcontainers + fakes |
| [`packages/shared-types`](packages/shared-types) | Event-payload base types |
| [`packages/shared-config`](packages/shared-config) | Base tsconfig + ESLint + biome + vitest presets |
| [`sdks/module`](sdks/module) | `@seta/module-sdk` — frontend nav-manifest contract |
| [`sdks/copilot`](sdks/copilot) | `@seta/copilot-sdk` — agent-tool contract |

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Run every app with HMR |
| `pnpm build` | Production build across the workspace |
| `pnpm typecheck` | TypeScript project references |
| `pnpm test` | Vitest against real Postgres via testcontainers |
| `pnpm test:e2e` | Playwright against the dev stack |
| `pnpm lint` | dep-cruiser + biome + style + raw-SQL boundary checks |
| `pnpm gen module` | Scaffold a new module — see [`docs/creating-modules.md`](docs/creating-modules.md) |
| `pnpm db:reset` | Drop, recreate, migrate, and reseed the dev DB |

## Documentation

| Document | Read it for |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Implementation shape — single source of truth; the system overview diagram is at the top |
| [`docs/copilot-architecture.md`](docs/copilot-architecture.md) | Agent system — supervisor/specialist design walked through a concrete planner use case |
| [`docs/tech-stack.md`](docs/tech-stack.md) | Why each dependency was chosen, the alternatives considered, and when to reconsider |
| [`docs/creating-modules.md`](docs/creating-modules.md) | Add a module — fast path (~30 min) to full path with UI + write tool + tests |
| [`docs/hosting/aws.md`](docs/hosting/aws.md) | AWS production deployment — staging + prod, sizing, security, observability, runbooks, FinOps |
| [`docs/hosting/`](docs/hosting/) | Self-host index — docker compose, AWS, scaling, upgrading, DR |
| [`docs/dev-quickstart.md`](docs/dev-quickstart.md) | First tenant and accounts on a fresh DB |
| [`DESIGN.md`](DESIGN.md) | Design tokens and front-end style guide |
| [`CLAUDE.md`](CLAUDE.md) | Contributor guidance for AI agents (also `AGENTS.md`) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to contribute |

## License

[MIT](LICENSE) © Seta International
