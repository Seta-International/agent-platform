# Architecture

Seta is a multi-tenant, AI-first work-management platform built as a **modular monolith**. One Postgres database, one composition library, several runtimes — each module owns a schema, a public TypeScript surface, and (optionally) a set of agent tools that the copilot engine composes into Mastra agents.

This document is the single source of truth for the implementation shape. When the code and this doc disagree, the doc is the bug.

## Contents

1. [Stack](#1-stack)
2. [Repo layout](#2-repo-layout)
3. [Modules and boundaries](#3-modules-and-boundaries)
4. [The canonical module shape](#4-the-canonical-module-shape)
5. [Runtimes](#5-runtimes)
6. [Contribution registry](#6-contribution-registry)
7. [Event bus](#7-event-bus)
8. [Identity and sessions](#8-identity-and-sessions)
9. [Agent system (copilot)](#9-agent-system-copilot)
10. [Embeddings and retrieval](#10-embeddings-and-retrieval)
11. [Frontend shell](#11-frontend-shell)
12. [Deployment](#12-deployment)
13. [Observability](#13-observability)

---

## 1. Stack

| Layer | Choice |
|---|---|
| Runtime | Node 24 LTS |
| Build | Turborepo + pnpm workspaces, Vite (web), tsc (backend) |
| Backend | Hono, [Mastra](https://mastra.ai) (`@mastra/core@^1.35`), graphile-worker |
| Database | Postgres + pgvector, Drizzle ORM (`pgSchema` + `schemaFilter`) |
| Event bus | Transactional outbox in `core.events` + `LISTEN/NOTIFY` + 2s fallback poll |
| Frontend | React 19, TanStack Router, shadcn/ui, Tailwind 4 |
| AI surface | AI SDK v6 (`ai@^6` + `@ai-sdk/react@^3`), assistant-ui v6-paired |
| Auth | better-auth + Drizzle adapter, argon2id via `@node-rs/argon2` |
| Cloud | AWS — ECS Fargate, RDS, Secrets Manager, S3 |

Versions are pinned in the root `package.json` and each workspace `package.json`. Upgrade via `pnpm update`; never hand-edit specifiers or `pnpm-lock.yaml`.

---

## 2. Repo layout

```
apps/
├── server/   # Hono HTTP (dev: also runs dispatcher + worker pool via startBoth)
├── worker/   # graphile-worker pool + LISTEN/NOTIFY dispatcher (production split)
├── cli/      # ops: migrate, seed, embedding backfills
└── web/      # React 19 SPA — shell + per-module UI

packages/
├── core/             # event bus, outbox, registry, runtime composition
├── identity/         # users, sessions, SSO, role grants
├── planner/          # plans, buckets, tasks, M365 sync
├── integrations/     # M365 boot, mail-transport config, MCP clients
├── knowledge/        # tenant knowledge corpus, RAG pipeline
├── notifications/    # in-app + email prefs, SSE hub
├── copilot/          # engine-only: Mastra runtime + agent factory
├── staffing/         # orchestrator: cross-module workflows
└── shared-*/         # infra: config, db, rbac, types, ui, crypto, mailer,
                      #        storage, embeddings, retrieval, testing

sdks/
├── copilot/   # @seta/copilot-sdk — agent-tool contract (pure types)
└── module/    # @seta/module-sdk — frontend nav contract

infra/
├── docker/    # Dockerfile + compose
└── opentofu/  # AWS reference IaC
```

**Three tiers, two boundary rules:**

- **`packages/shared-*` and `sdks/*` (infra)** — leaf packages. May not import from modules.
- **`packages/<name>/` (module)** — cross-module imports go through the public surface only.
- **`apps/*` (runtime)** — apps don't import each other.

Path prefix is the gate; the dep-cruiser config (`.dependency-cruiser.cjs`) needs no maintained allowlist.

---

## 3. Modules and boundaries

A module owns a Postgres schema, a public TypeScript surface, and the code behind both. Modules communicate only via:

1. **Function calls into another module's public surface** (`@seta/<other>`). RBAC is re-checked at the callee — the caller's claim is never trusted.
2. **Domain events** on the shared bus (§7). At-least-once delivery with per-aggregate ordering. Subscribers must be idempotent on `event_id`.

These rules are CI-gated. Every PR runs:

- **`pnpm depcruise`** — rejects cross-module imports that don't go through `src/index.ts`, `events`, `rbac`, `contracts`, or `agent-tools`. Rejects `shared-*` → module imports. Rejects `copilot` → feature-module imports (copilot is engine-only).
- **`pnpm lint:raw-sql`** — rejects `FROM <other_module>.` / `JOIN <other_module>.` outside `packages/core/src/{audit,events}/`.
- **`pnpm lint:styles`** — rejects `.css`, `tailwind.config.*`, `@theme/@layer/@apply` outside `packages/shared-ui/`.
- **Drizzle schema scoping** — each module's `drizzle.config.ts` sets `schemaFilter: ['<module>']`. Cross-schema reads fail at codegen.

**No cross-schema foreign keys.** A `planner.tasks.assignee_id` stores a `uuid` with no FK to `identity.user.id`. Consistency is event-driven via local read-model projections in the consumer's own schema.

**Three documented patterns** ride on top of the two tiers (declared via `"setaTier"` in `package.json`):

- **foundation** — modules every other module depends on (`core`, `identity`).
- **orchestrator** — modules that compose multiple feature modules (`staffing`). Typically schemaless; workflow state lives in `copilot.workflow_runs`.
- **engine** — `copilot` only. Composes module-owned tools/specs into a Mastra runtime.

---

## 4. The canonical module shape

The module factory (`pnpm gen module`) produces this shape. The walkthrough lives in [`creating-modules.md`](./creating-modules.md).

```
packages/<module>/
├── package.json                # exports: ., ./events, ./rbac, ./contracts, ./register
├── drizzle.config.ts           # schemaFilter: ['<module>']
├── drizzle/migrations/         # generated + hand-written .sql siblings
└── src/
    ├── index.ts                # public surface — application-service functions
    ├── events.ts               # event constants + zod payload schemas
    ├── rbac.ts                 # permission constants
    ├── contracts.ts            # browser-safe DTOs + zod schemas
    ├── register.ts             # one reg.module({...}) call
    └── backend/
        ├── domain/             # use-case functions (transaction-script style)
        ├── subscribers/        # event handlers (idempotent on event_id)
        ├── jobs/               # graphile-worker task handlers
        ├── http/               # Hono sub-app + zod request schemas
        ├── stream/             # SSE hub (when fanning events to clients)
        ├── workflows/          # Mastra workflow builders
        ├── agent-tools.ts      # CopilotTool[] surfaced to copilot
        ├── agent-specs.ts      # AgentSpec[] for orchestrator-style agents
        └── db/
            ├── schema.ts       # Drizzle pgSchema('<module>')
            └── client.ts       # internal — never exported
```

**Public surface (uniform across all modules):**

```json
"exports": {
  ".":           "./src/index.ts",
  "./events":    "./src/events.ts",
  "./rbac":      "./src/rbac.ts",
  "./contracts": "./src/contracts.ts",
  "./register":  "./src/register.ts"
}
```

Anything outside this set isn't part of the contract. Internals (`src/backend/`, `src/db/`) are private to the module.

---

## 5. Runtimes

Three Node runtimes share one composition library at `packages/core/src/runtime/`, exported as the private subpath `@seta/core/runtime` (dep-cruiser limits importers to `apps/server`, `apps/worker`, and integration tests).

```ts
// Both apps/server/src/index.ts and apps/worker/src/index.ts do:
const reg = createContributionRegistry();
registerCoreContributions(reg);
registerIdentityContributions(reg);
// ... one register*Contributions call per active module ...

const rt = buildRuntime(env, { reg, pool, ...deps });
```

| Runtime | Role |
|---|---|
| `apps/server` | Hono HTTP. In production: HTTP only with enqueue-only `WorkerHandle`. In dev (`NODE_ENV !== 'production'`): `startBoth()` runs HTTP + dispatcher + worker pool in one process. |
| `apps/worker` | Graphile-worker pool + LISTEN/NOTIFY dispatcher. **Only `apps/worker` runs the dispatcher in production** — exactly one instance across the fleet. |
| `apps/cli` | Ops surface: `migrate`, `seed`, embedding backfills. Never starts the dispatcher (dep-cruiser-enforced). |

The browser SPA at `apps/web` shares no Node composition with the others. The same registry concept drives the web shell — each web module exports a typed `navManifest` from `@seta/module-sdk` registered in `apps/web/src/shell/manifests.ts`.

---

## 6. Contribution registry

Each module's `register.ts` makes one `reg.module({...})` call. The registry validates at composition time — collisions throw before the runtime finishes booting.

```ts
reg.module({
  name: 'planner',
  schema,                    // Drizzle pgSchema (name must match)
  migrationsDir,             // absolute path

  events,                    // Record<EventType, ZodSchema>
  rbac,                      // Record<permissionSlug, description>

  subscribers,               // SubscriberDef[]   — idempotent on event_id
  jobs,                      // TaskList          — globally unique names
  routes:    { mountAt: '/api/planner/v1', build },   // optional
  stream:    buildStreamHub,                          // optional

  agentTools,                // CopilotTool[]     — composed into agents
  agentSpecs,                // AgentSpec[]       — orchestrator personas
  workflows,                 // WorkflowBuilder[] — Mastra workflows

  errorMapper,               // <ModuleError> → { status, body }
});
```

Validation checks include: schema name matches `name`; no duplicate job names, permission slugs, tool ids, agent spec ids, or workflow ids; every event type referenced by a subscriber has a payload schema in some module's `events`; every `agentSpec.tools[]` id resolves in the collected tool catalog.

A typo in a tool reference fails boot, not runtime.

---

## 7. Event bus

The bus is a **transactional outbox** in `core.events` plus `LISTEN/NOTIFY` for wakeups. Every state-changing handler writes the event row inside the same transaction as the state change; a deferred trigger fires `pg_notify('events', ...)` on commit; subscriber loops `LISTEN` and read new rows. A 2s fallback poll covers dropped notifies.

This kills both classic event-bus bugs:

- *Lost events* (state committed, publish failed) — impossible: the event lives in the same tx.
- *Phantom events* (publish succeeded, state rolled back) — impossible: rollback drops the event row.

```ts
return withEmit(session, async () => {
  await db.insert(tasks).values({ id, ... });
  await emit({
    event_type: 'planner.task.created',
    aggregate_type: 'planner.task', aggregate_id: id,
    tenant_id: session.tenant_id,
    payload: { ... },
  });
  return { task_id: id };
});
```

There is no separate publish path. `core.emit()` throws `EmitContextRequired` outside an `emitContext` — the only legal entry points are `withEmit`, `withCoreEmitContext` (for Mastra workflows), and the subscriber framework. Audit rows live in `core.events` alongside domain events — one unified history.

Subscribers register through `reg.module({ subscribers })` and are deduped by `event_id`. At-least-once delivery; per-aggregate ordering only. The dispatcher runs in `apps/worker` exclusively in production.

---

## 8. Identity and sessions

`@seta/identity` wraps better-auth (local password + Entra OIDC) over the `identity.user`, `identity.session`, `identity.account`, `identity.verification` tables better-auth ships, plus a sibling `identity.user_profile` for app-specific fields (skills, availability, working_hours, timezone).

Sessions land in request context via a Hono middleware:

```ts
import { createSessionMiddleware } from '@seta/core';
// ...
app.use('*', createSessionMiddleware({ db, auth }));
```

Every public-surface function takes a `session: SessionScope`. The scope carries `tenant_id`, `user_id`, `effective_permissions: ReadonlySet<string>`, and a `role_summary`. Permission re-checks at the callee are non-negotiable — the bus doesn't impersonate, and neither do peer modules.

SSO is **admin pre-provisioning only**. There is no just-in-time provisioning. First SSO login links to an existing pre-provisioned user; unknown subjects are rejected.

---

## 9. Agent system (copilot)

`@seta/copilot` is engine-only. It composes module-owned agent tools and specs into Mastra agents via the contribution registry; it does **not** import any feature or orchestrator module (enforced by dep-cruiser rule `copilot-no-feature-imports`).

Modules build tools against `@seta/copilot-sdk` — a pure contract package with no `@mastra/*` runtime dependency. A tool wraps a public-surface function from its own module:

```ts
// packages/planner/src/backend/agent-tools.ts
export const plannerAssignTaskTool = registerToolPermission(
  createTool({
    id: 'planner_assignTask',
    description: 'Assign a task to a user.',
    inputSchema: z.object({ taskId: z.string(), userId: z.string() }),
    outputSchema: z.object({ ok: z.literal(true) }),
    requestContextSchema: RequestContextSchema,
    execute: async (input, ctx) => {
      const session = await buildActorSession(actorFromContext(ctx));
      await assignTask({ ...input, session });
      return { ok: true };
    },
  }),
  'planner.task.assign',
);
```

**HITL on every write tool.** `registerToolPermission` ties a tool to a permission; the AI SDK v6 `needsApproval` flow + assistant-ui Interactable confirmation card runs the tool only after explicit user accept. Read tools execute directly.

**One domain per agent, ≤ ~15 tools** assembled at session-assembly time. Past that, split into a specialist agent and route to it — don't keep stapling tools onto an existing agent. Tool schemas live in the system prompt; overflowing burns cache hits and worsens model tool selection.

Per-session Agent instance is LRU-cached, hashed on the role set only. Mastra memory uses `@mastra/pg`'s `PostgresStore({ schemaName: 'copilot' })`; Mastra-managed tables (`mastra_threads`, `mastra_messages`, `mastra_traces`, …) stay inside the `copilot` schema and Mastra owns their DDL.

> **Working on copilot internals?** A full Mastra source checkout lives at `../mastra/` (sibling to this repo) — consult it directly for `@mastra/core` API names and behaviors instead of guessing from npm types. The playground at `../mastra/packages/playground-ui/` is also a useful reference for chat/upload UX patterns when wiring `apps/web` features.

---

## 10. Embeddings and retrieval

Embeddings live in the **owning module's schema** as sibling tables, never in `copilot`. The pipeline:

1. Domain action emits an event (`planner.task.updated`).
2. A subscriber in the owning module enqueues an `embed_task` job.
3. The job reads source via the module's own public function, computes embedding, writes to `<module>.<entity>_embeddings`.

Tables are `LIST`-partitioned by `tenant_id`, with per-partition HNSW on `halfvec(1536)` (pgvector ≥ 0.7). The planner prunes at `WHERE tenant_id = $1` and hits exactly one partition — ~37× faster than a shared-index prefilter at 100+ tenant scale.

Retrieval is two-stage:

- **Stage 1**: FTS + vector RRF (`k = 60`), top-50.
- **Stage 2**: cross-encoder rerank (Cohere by default; LLM-as-judge fallback; `none` to opt out), truncated to the caller's limit.

Provider abstraction lives in `@seta/shared-embeddings` (`embedMany` wrapper, source-hash, model providers) and `@seta/shared-retrieval` (`Retriever`, RRF SQL builder, rerank). `@mastra/rag` is used for `MDocument.chunk()` and `rerank()` only — `@mastra/pg`'s `PgVector` is **not** used (it's incompatible with module-owned schemas).

Backfill via `apps/cli`:

```bash
pnpm -F @seta/cli exec tsx src/index.ts embed-backfill --entity task --tenant <id>
```

---

## 11. Frontend shell

`apps/web` is a React 19 SPA on TanStack Router. The shell at `apps/web/src/shell/` owns providers (session, theme, hotkeys, toasts), the global command palette, and the nav manifest registry.

Each web module exports a typed `navManifest` from `@seta/module-sdk`:

```ts
// apps/web/src/modules/planner/manifest.ts
export const plannerNavManifest: NavManifest = {
  id: 'planner',
  label: 'Planner',
  icon: Squares2x2,
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    { id: 'planner.boards', icon: LayoutDashboard, label: 'Boards', to: '/planner' },
    // ...
  ],
};
```

Manifests are registered in `apps/web/src/shell/manifests.ts`. The shell filters by `effective_permissions` at render time.

Tenant-admin UI (users, SSO, audit, integrations, notification prefs, tenant settings) is aggregated under `apps/web/src/modules/console/` — one place for admin, not one admin sub-app per module. Other modules ride on top via the same nav-manifest pattern.

**Style monopoly.** All styling lives in `@seta/shared-ui`. No `.css`, no `tailwind.config.*`, no `@theme/@layer/@apply` outside that package (one shim is allowed at `apps/web/src/styles/globals.css`). Enforced by `pnpm lint:styles`.

---

## 12. Deployment

**Container image:** single multi-stage Dockerfile produces `seta-server` and `seta-web` images. Production splits into:

- `apps/server` ECS Fargate service — HTTP behind ALB.
- `apps/worker` ECS Fargate service — dispatcher + graphile-worker pool. Runs exactly one task per fleet to keep dispatcher work single-source-of-truth.
- RDS Postgres (Multi-AZ, pgvector extension enabled).
- Secrets Manager for `DATABASE_URL`, `BETTER_AUTH_SECRET`, AI provider keys, Microsoft Graph client secret.
- S3 for tenant knowledge files.

**Migrations** run via `apps/cli` only (`pnpm db:migrate`). Both `apps/server` and `apps/worker` fail fast at boot if `schema_migrations` is behind their expected version.

**Self-host** uses the same image. The `docker compose` reference at [`hosting/docker-compose.md`](./hosting/docker-compose.md) runs server + worker + Postgres + Traefik. Configuration contract is [`/.env.example`](../.env.example).

**Mode-selectable runtime** (`SETA_MODULES` env var) supports advanced split deployments — `SETA_MODULES=identity,planner` loads only those modules in this process; cross-module sync calls route through a dispatch shim at `@seta/core/rpc` that picks in-process vs Hono RPC HTTP based on the loaded set. See [`hosting/scaling.md`](./hosting/scaling.md).

---

## 13. Observability

- **Tracing/metrics/logs**: OpenTelemetry. OTLP HTTP exporter; point at any collector via `OTEL_EXPORTER_OTLP_ENDPOINT`. The compose stack does not ship a collector by default.
- **Logging**: `pino` everywhere. Each subsystem uses `log.child({ component })` for filterable logs.
- **Audit**: writes to `core.events` alongside domain events. Query via `queryAudit` from `@seta/core`.
- **Health endpoints**: `/health/live`, `/health/ready`, `/health/startup` on `apps/server`. The readiness probe reports dispatcher backlog and per-subscriber lag.
- **Trace propagation**: W3C `traceparent` flows through assistant-ui → Hono → Mastra → tool handler, and through the in-process or RPC dispatch shim.

---

## Reading code

The fastest path to understanding any subsystem:

- `packages/core/src/composition/registry.ts` — registry type + validation.
- `packages/core/src/runtime/bootstrap.ts` — `buildRuntime`, `startServerRuntime`, `startWorkerRuntime`, `startBoth`.
- `packages/core/src/events/*` — outbox + dispatcher.
- `packages/planner/` — fully-built reference module (events, subscribers, jobs, HTTP, stream hub, agent tools).
- `packages/staffing/` — reference orchestrator.
- `apps/server/src/index.ts` + `apps/worker/src/index.ts` — composition in practice.
- `sdks/copilot/src/index.ts` — the agent-tool contract.

For Mastra internals (when wiring copilot), consult the Mastra source checkout at `../mastra/` instead of inferring from npm types.

See also: [`creating-modules.md`](./creating-modules.md) (adding a module + agent tool), [`dev-quickstart.md`](./dev-quickstart.md) (provisioning the first tenant), [`hosting/`](./hosting/) (deployment).
