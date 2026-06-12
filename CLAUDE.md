# Agent guidance

Contract for coding agents (Claude Code, Codex, any `AGENTS.md`-aware tool) working in this repo. `AGENTS.md` is a symlink to `CLAUDE.md` — edit one, both update.

## Reference docs

- [`docs/architecture.md`](docs/architecture.md) — single source of truth for the implementation shape.
- [`docs/rbac.md`](docs/rbac.md) — how access control works, conceptually (for contributors + agents; no code).
- [`docs/creating-modules.md`](docs/creating-modules.md) — add a new module + agent tool via `pnpm gen module`.
- [`docs/dev-quickstart.md`](docs/dev-quickstart.md) — first tenant and accounts on a fresh DB.
- [`docs/hosting/`](docs/hosting/) — self-host (docker compose, AWS, scaling, upgrading).
- [`DESIGN.md`](DESIGN.md) — design tokens and the `packages/shared-ui` contract.
- [`/.env.example`](.env.example) — every variable the stack reads.

When `docs/architecture.md` and the code disagree, the doc is the bug — fix it there. One version per doc: no Phase tags, no internal milestones, no ADR ledger.

## Fixed technical foundations (do not propose alternatives)

- **Runtime / build**: Node 24 LTS, Turborepo + pnpm workspaces, Vite.
- **Backend**: Hono, Mastra (`@mastra/core@^1.35`), graphile-worker.
- **Database**: Postgres + pgvector, Drizzle ORM (`pgSchema` + `schemaFilter`). No other ORM, no raw migration tool.
- **Event bus**: transactional outbox in `core.events` + `LISTEN/NOTIFY` + 2s fallback poll. No SQS, no Kafka.
- **Frontend**: React 19, TanStack Router, shadcn/ui, Tailwind 4, AI SDK v6 (`ai@^6` + `@ai-sdk/react@^3`), assistant-ui v6-paired.
- **Auth**: better-auth + Drizzle adapter, argon2id via `@node-rs/argon2`.
- **Cloud**: AWS — ECS Fargate, RDS, Secrets Manager, S3.

For `@mastra/core` API names, consult the sibling checkout at `../mastra/` instead of guessing from npm types. `../mastra/packages/playground-ui/` is the reference for chat/upload UX patterns in `apps/web`.

## Enforced architectural rules (CI-gated)

1. **`pnpm depcruise`** — cross-module imports must go through `packages/<module>/src/index.ts` or the `/events`, `/rbac`, `/contracts`, `/agent-tools` subpaths. `shared-*` may not import from feature modules. `agent` is engine-only and may not import any feature or orchestrator module (`agent-no-feature-imports`).
2. **`pnpm lint:raw-sql`** — rejects `FROM <other_module>.` / `JOIN <other_module>.` outside `packages/core/src/{audit,events}/`.
3. **`pnpm lint:styles`** — rejects `.css`, `tailwind.config.*`, `@theme/@layer/@apply` outside `packages/shared-ui/` (one shim allowed at `apps/web/src/styles/globals.css`).
4. **Drizzle schema scoping** — each `drizzle.config.ts` sets `schemaFilter: ['<module>']`; cross-schema reads fail at codegen.

**No cross-schema foreign keys.** `planner.tasks.assignee_id` stores a `uuid` with no FK to `identity.user.id`. Consistency is event-driven via local read-model projections.

**No cross-module data-handle sharing.** A module never hands its Drizzle client to another module. Mutation crosses the boundary only through public-surface function calls (RBAC re-checked at the callee) or domain events.

**The bus is the outbox.** State change + event row commit in one transaction via `core.emit()` inside `withEmit(session, ...)`. No separate publish path. `LISTEN/NOTIFY` wakes subscribers; the 2s poll covers dropped notifies. Audit lives in `core.events` alongside domain events.

## Module tiers

Enforced by `.dependency-cruiser.cjs`:
- **infra** — `packages/shared-*` and `sdks/*`. Leaf packages; may not import from feature/orchestrator modules.
- **module** — `packages/<name>/`. Cross-module imports go through the public surface only.

Declared via `"setaTier"` in `package.json` (informational, not a separate enforced layer):
- **foundation** — depended on by every module (`core`, `identity`).
- **orchestrator** — composes multiple feature modules (`staffing`). Typically schemaless; workflow state lives in `agent.workflow_runs`.
- **engine** — `agent` only. Composes module-owned agent tools/specs into a Mastra runtime.

## Project-specific workflow

- **Tests run against real Postgres via `testcontainers`** — do not introduce DB mocks. Write the failing test first.
- **Verify before claiming done**: `pnpm typecheck && pnpm lint && pnpm test` (and `pnpm test:e2e` if UI changed).
- **Install deps via CLI only**: `pnpm add <pkg>` with no version specifier so the registry resolves latest. Never hand-edit `package.json` versions or `pnpm-lock.yaml`.
- **Generate migrations via CLI only**: `pnpm --filter @seta/<module> db:generate`, then `pnpm db:migrate`. Never hand-edit files under `drizzle/`.
  - **Exception — SQL Drizzle cannot model** (partitioning, deferred constraint triggers, `pg_notify` wiring, partitioned indexes): hand-written `.sql` files live alongside generated ones in `drizzle/migrations/`. Each begins with a one-line comment naming the limitation. The runner walks lexically; both formats coexist. Never edit a committed migration — write a new numbered one.
- **Module shape comes from `pnpm gen module`** — see [`docs/creating-modules.md`](docs/creating-modules.md). Don't invent commands; the `pnpm` scripts in root `package.json` are the contract.
- **`docs/superpowers/` is gitignored — never `git add -f` or push it.** Specs and plans under that path are local working documents only. Commit design docs there freely; they will not appear in the remote repo.
- **Onboarding contract**: `clone → install → db:up → db:migrate → bash scripts/tenant-bootstrap.sh → dev` yields a working demo in 5 min on a fresh machine. Don't break it.

## Conventions worth knowing

- **Inspect the DB (dev):** `docker exec seta-ap-postgres-dev psql -U seta -d seta -c '<SQL>'`. Postgres is also reachable at `localhost:5542` (mapped by `infra/docker/compose.dev.yml`). Schemas: `agent`, `core`, `identity`, `planner`, `notifications`, `staffing`, etc.
- **Debug the agent (dev):** `scripts/trace-thread.sh <threadId>` dumps a chat turn's lifecycle (messages, approvals, snapshot status, spans). App logs persist to `logs/{server,worker}.log` (NDJSON). Per-turn tool-calls/suspends/resumes trace to `agent.mastra_ai_spans`; raise Mastra's logger with `MASTRA_LOG_LEVEL`.
- **HITL on every write tool.** AI SDK v6 `needsApproval: true` + assistant-ui Interactable confirmation card, wired via `registerToolPermission` from `@seta/agent-sdk`. Read tools execute directly. Native-suspend chat cards resume via `POST /chat/resume`; `/workflows/approvals/:id/decide` only records the decision (no resume).
- **Subscribers must be idempotent**, keyed on `event_id`. At-least-once delivery; per-aggregate ordering only.
- **Production-grade only, never quick hacks.** Diagnose the root cause and ship the optimized solution; "small patch now, real fix later" is rejected on review.
