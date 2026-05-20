# Seta — Architecture (v1, Phase A focus)

**Status:** drafted 2026-05-19, immediately after `docs/requirements.md` v1 closed. All 11 §21 known unknowns resolved here. Scope is the §14.1 Phase A vertical (agent module end-to-end) with `identity` and `planner` shipping as backend-only foundations; Phase B / C surfaces are referenced where they constrain v1 architecture but otherwise deferred.

This document is the **architecture-phase output** for §13 / §1.6.10 / §14.1. It is consumed by implementation; if a section conflicts with `requirements.md`, requirements wins and this doc is a bug.

---

## Table of contents

- §A. Resolved unknowns (A1–A11)
- §B. Module boundary enforcement
- §C. Repo skeleton + `ContributionRegistry` shape
- §D. Boot sequence + migration orchestration
- §E. Data model — Drizzle schemas (Phase A)
- §F. Event bus — outbox + dispatcher
- §G. Session + auth flow
- §H. Copilot deep-dive
- §I. Embeddings CDC pipeline
- §J. Frontend shell + standalone Copilot module
- §K. Deployment topology
- §L. Observability + audit
- §M. Future-extraction reference architecture
- §N. Phase A → B/C handoff

---

## §A. Resolved unknowns

Resolutions to `requirements.md §21`. Each entry restates the question, the decision, and the integration point.

### §A1. AI SDK v5 vs v6 pin → **v6**

- **Decision.** Pin `ai@^6` + `@ai-sdk/react@^3`; Mastra chat handler opts into v6 via `version: 'v6'`; assistant-ui uses its dedicated v6 runtime (`@assistant-ui/react-ai-sdk` v6-paired build).
- **Why.** AI SDK v6 is GA as of 2026 (consolidated 4.x/5.x patterns, added Agent abstraction, `stopWhen`, native tool-approval flows, MCP support). Mastra v1.35 supports it via opt-in. assistant-ui ships dedicated v6 runtime docs. Pinning v6 from day one avoids a mid-Phase-A migration.
- **Fallback.** If a regression bites a specific surface, downgrade *just* `chatRoute()`'s `version` to `'v5'`. assistant-ui supports both. Do not pre-wire fallback paths.
- **Concrete versions** (re-confirming §17.2): `ai@^6`, `@ai-sdk/react@^3`, `@assistant-ui/react@^0.14.5`, `@assistant-ui/react-ai-sdk` matching core, `@mastra/core@^1.35`, `@mastra/ai-sdk` track core.

### §A2. better-auth ↔ `identity.user_profile` → **separate FK table, confirmed safe**

- **Decision.** `identity.user_profile (user_id uuid PK FK → identity.user.id, skills text[], availability_status enum, ooo_until timestamptz, timezone text, working_hours jsonb, ...)`. better-auth owns `identity.user`, `identity.session`, `identity.account`, `identity.verification` as it ships them.
- **Why.** better-auth's Drizzle adapter (`@better-auth/drizzle-adapter`) supports `modelName` customization and welcomes plugin tables alongside its core set; profile-extension via a sibling table is the documented pattern. Avoids drifting better-auth's own schema (reduces upgrade friction). better-auth ≥1.4.0 has `experimental.joins` if we later want server-side joins, but Phase A queries the projection or joins in our own SQL.
- **Day-one verification.** Spike step in week-1 of `identity` work: write the `user_profile` table, ensure better-auth's `signUp.emailAndPassword` flow does not blow up when our app-side `afterSignUp` hook inserts the profile row. Throwaway test, fast.

### §A3. Mastra memory storage adapter → **`@mastra/pg` `PostgresStore({ schemaName: 'copilot' })`**

- **Decision.**
  ```ts
  import { PostgresStore } from '@mastra/pg';
  export const copilotStore = new PostgresStore({
    pool: corePool,           // reuse the app-wide pg.Pool
    schemaName: 'copilot',    // Mastra creates its tables inside copilot schema
  });
  ```
- **What Mastra owns inside `copilot.*`.** Mastra auto-manages `mastra_workflow_snapshot`, `mastra_evals`, `mastra_threads`, `mastra_messages`, `mastra_resources`, `mastra_traces` (names per the `@mastra/pg` defaults). Our own tables (`copilot.rate_limits`, `copilot.workflow_runs` shim for the Workflows tab, `copilot.tenant_knowledge_chunks` Phase C) live alongside in the same schema.
- **Boundary check.** Mastra-created tables stay inside `copilot`. `core.events` writes (which now carry audit shape per D6) go through `core.emit()` — Mastra never writes outside its own schema.
- **Migration responsibility.** `@mastra/pg` auto-runs its own schema setup on first connect. We do **not** version-control Mastra's tables in our drizzle-kit migrations; we own only what we author (`copilot.rate_limits`, `copilot.tenant_knowledge_*`, etc.). Documented in the migration orchestrator (§D).

### §A4. Workflow ↔ outbox bridge → **`withCoreEmitContext()` helper in `core`**

```ts
// packages/core/src/events/mastra-bridge.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { trace as otelTrace } from '@opentelemetry/api';
import type { StepCtx } from '@mastra/core/workflows';

type EmitCtx = { tx: NodeTx; causedByEventId?: string; traceId?: string };
export const emitContext = new AsyncLocalStorage<EmitCtx>();

export function withCoreEmitContext<I, O>(
  body: (ctx: StepCtx<I> & { tx: NodeTx }) => Promise<O>,
  opts?: { triggerEventId?: string },
) {
  return async (ctx: StepCtx<I>): Promise<O> => {
    return db.transaction(async (tx) => {
      const causedByEventId = opts?.triggerEventId ?? ctx.runtimeContext?.get('triggerEventId');
      const traceId = otelTrace.getActiveSpan()?.spanContext().traceId;
      return emitContext.run({ tx, causedByEventId, traceId }, () => body({ ...ctx, tx }));
    });
  };
}

// core.emit reads emitContext if present, else opens its own tx — both paths legal.
export async function emit(event: DomainEvent): Promise<void> {
  const ctx = emitContext.getStore();
  const tx = ctx?.tx ?? db;
  await tx.insert(coreEvents).values({
    id: crypto.randomUUID(),
    occurred_at: new Date(),
    tenant_id: event.tenant_id,
    aggregate_type: event.aggregate_type,
    aggregate_id: event.aggregate_id,
    event_type: event.event_type,
    event_version: event.event_version,
    payload: event.payload,
    caused_by_user_id: event.caused_by_user_id,
    caused_by_event_id: event.caused_by_event_id ?? ctx?.causedByEventId,
    trace_id: event.trace_id ?? ctx?.traceId,
  });
  // deferred trigger fires pg_notify on commit — no client-side publish call
}
```

**Suspend/resume semantics.** When a Mastra step suspends (HITL pause days/weeks long), the tx must commit at the suspend boundary — we cannot hold a Postgres tx for the duration. Each *resume segment* opens a fresh tx via `withCoreEmitContext`; events emitted in the pre-suspend segment fire at the suspend commit, post-suspend events fire at resume commit. Documented constraint — already required by §7.1f workflows like `capability-gap-translation`.

**Idempotency.** Subscriber framework keys on `event_id` (§1.6.5a). If a step retries after the tx committed but before its `runStep` ack landed, Mastra will re-execute the step → tx rolls back the duplicate event row → same outbox correctness story as any other emitter.

### §A5. dependency-cruiser config → **complete `.dependency-cruiser.cjs`**

```js
// .dependency-cruiser.cjs (repo root)
module.exports = {
  forbidden: [
    {
      name: 'no-private-cross-package',
      comment: 'Cross-package imports must enter via the package root (src/index.ts) or /events. Any other path inside another package\'s src/ is private. Exception: packages/shared/* are imported freely (they are pure infrastructure with no internal-vs-surface distinction).',
      severity: 'error',
      from: { path: '^packages/(?!shared/)([^/]+)/src/' },
      to: {
        path: '^packages/(?!shared/)([^/]+)/src/.+',
        pathNot: '^packages/$1/src/|^packages/(?!shared/)[^/]+/src/(index\\.ts|events/)',
      },
    },
    {
      name: 'shared-must-not-import-modules',
      comment: 'D13/D14: shared/* packages must not import from feature modules (core, identity, planner, copilot, integrations). They are pure infrastructure consumed by modules, not the reverse.',
      severity: 'error',
      from: { path: '^packages/shared/' },
      to:   { path: '^packages/(core|identity|planner|copilot|integrations)/' },
    },
    {
      name: 'no-peer-module-import',
      comment: 'identity, planner, integrations are peers — they communicate only via events through core. Only copilot may import every peer\'s public surface to wrap as tools.',
      severity: 'error',
      from: { path: '^packages/(identity|planner|integrations)/src/' },
      to:   { path: '^packages/(identity|planner|integrations)/src/', pathNot: '^packages/$1/' },
    },
    {
      name: 'apps-only-backend',
      comment: 'A package\'s /backend subpath is private to apps/server. Cross-package code uses the package root (src/index.ts) or /events.',
      severity: 'error',
      from: { pathNot: '^apps/server/' },
      to:   { path: '^packages/[^/]+/src/backend/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to:   { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true, pathNot: '\\.(d\\.ts|spec\\.ts|test\\.ts|stories\\.tsx?|config\\.(c|m)?[jt]s)$' },
      to: {},
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    doNotFollow: { path: 'node_modules' },
    includeOnly: '^(packages|apps)/',
  },
};
```

- Runs in CI as `pnpm dlx dependency-cruiser --validate .dependency-cruiser.cjs packages apps` in the lint Turbo task. Build-failing.
- IDE companion: `eslint-plugin-boundaries` mirroring the same rules (configured in `packages/shared/config/eslint-boundaries.cjs`) for faster feedback.
- **Raw-SQL audit** (§1.6.2 rule 3 enforcement) is a separate CI grep step, not dep-cruiser's job:
  ```
  ! grep -rEn '(FROM|JOIN)\s+(core|identity|planner|copilot|integrations)\.' \
    packages/{identity,planner,copilot,integrations}/src \
    --include='*.ts' \
    | grep -v 'src/db/' \
    | grep -v "//.*allow-cross-schema"
  ```
  Allowed in `packages/core/src/{audit,events}/`. Same-package schema references via Drizzle's `pgSchema` are fine.

### §A6. assistant-ui HITL → **AI SDK v6 `needsApproval` + Interactables**

- **Tool side (server, `copilot`):**
  ```ts
  export const assignTaskTool = tool({
    description: 'Assign a task to a user.',
    inputSchema: z.object({ taskId: z.string(), assigneeId: z.string() }),
    needsApproval: true,                    // <-- AI SDK v6 marker
    execute: async ({ taskId, assigneeId }, { context }) => {
      const session = context.session as SessionScope;
      return planner.assignTask({ taskId, assigneeId, actingUser: session });
    },
  });
  ```
- **UI side (client, assistant-ui):** the Interactable receives the pending tool call and renders a confirmation card; user accepts → AI SDK resumes with the tool call approved → handler runs.
- **Audit.** Tool execution writes an audit row (via the `auditTool` middleware wrapper, §H.2). Approval/rejection is recorded with `outcome=approved|rejected`. Trace `traceparent` flows through assistant-ui's request → Hono → Mastra → tool handler.
- **Scope (Phase A).** Every write tool (`create_task`, `assign_task`, `update_task`, `add_skill_tag`, future bulk variants) is HITL-gated. Read tools execute without approval.
- **Failure modes.** User dismisses card → tool call resolved as `output-error` with code `USER_REJECTED`; agent receives the error and can respond. Card timeout (10 min) → same path with code `APPROVAL_TIMEOUT`.

### §A7. Mastra `chatRoute()` ↔ Hono mount → **`@mastra/hono` adapter with prefix**

```ts
// apps/server/src/server.ts
import { Hono } from 'hono';
import { honoServer } from '@mastra/hono';
import { mastra } from './mastra.runtime';      // built via copilot.registerCopilot()

const app = new Hono();
app.use('*', sessionMiddleware);                  // core middleware — attaches req.user
app.route('/api/identity/v1', identityRouter);
app.route('/api/planner/v1',  plannerRouter);
app.route('/api/integrations/v1', integrationsRouter);

// Mastra owns /api/copilot/v1/*
app.route('/api/copilot/v1', honoServer({
  mastra,
  prefix: '',                                     // routes already namespaced by app.route
  auth: { type: 'session', middleware: sessionMiddleware },
}));

app.get('/*', staticHandler('apps/web/dist'));    // SPA
```

- The Mastra Hono adapter exposes `/chat/:agentName`, `/workflows/:workflowName/runs`, `/threads/...` under the prefix.
- `auth.middleware` ensures every Mastra route runs behind `sessionMiddleware` — tools receive `req.user` via Hono context (Mastra's adapter forwards Hono's Context into tool `execute`'s `context` arg).
- Reuses the single `corePool` connection pool — no per-route pool instantiation.
- Per-route OpenTelemetry spans: `hono-otel` middleware wraps `app.use('*')` so the trace originates at the outermost ingress.

### §A8. Per-session tool registry → **per-session Agent instance, LRU-cached**

```ts
// packages/copilot/src/backend/agent-factory.ts
import { Agent } from '@mastra/core';
import LRU from 'lru-cache';
import { filterToolsByRole, hashRoleSummary } from './rbac-filter';
import { router, planner, staffing } from './agents/definitions';

const baseDefs = { router, planner, staffing } as const;
type AgentKey = keyof typeof baseDefs;

const cache = new LRU<string, Agent>({
  max: Number(process.env.COPILOT_AGENT_CACHE_MAX ?? 5_000),  // ~50KB/agent; default ≈ 250MB cap
  ttl: 1000 * 60 * 60,         // 1h idle eviction
});

// D9 (2026-05-19): hash on role set + cross_tenant_read ONLY. accessible_group_ids
// is read inside each tool.execute() at call time — keeps system prompts identical
// across same-role users and lets the provider prompt cache hit.
export function getAgentForSession(key: AgentKey, session: SessionScope): Agent {
  const roleHash = hashRoleSummary(session);   // roles + cross_tenant_read only
  const cacheKey = `${key}:${roleHash}`;
  const hit = cache.get(cacheKey);
  if (hit) { metrics.agentCacheHits.inc(); return hit; }
  metrics.agentCacheMisses.inc();
  const filtered = filterToolsByRole(toolRegistry.toolsFor(key), session);
  const agent = new Agent({ ...baseDefs[key], tools: filtered });
  cache.set(cacheKey, agent);
  return agent;
}

// Subscriber evicts on role / membership change.
registry.subscribers([
  { event: 'identity.role_grant.changed', handler: (e) => evictByUser(e.payload.user_id) },
  { event: 'identity.user.deactivated',   handler: (e) => evictByUser(e.payload.user_id) },
]);
```

- `hashRoleSummary(session)` is a stable hash over **`roles ⊕ cross_tenant_read` only** — **NOT** `accessible_group_ids` (architect review 2026-05-19, D9). Group filtering happens inside each tool's `execute()` body, which reads `session.accessible_group_ids` at call time and applies the filter in SQL. Result: every user with the same role bundle shares one Agent instance, one system prompt, one provider prompt-cache lane.
- The trade-off: tool descriptions in the system prompt cannot embed user-specific group names. They say *"list tasks in groups you can access"*, not *"list tasks in groups Acme-Mobile, Acme-Web."* Acceptable cost; the LLM doesn't need group names in the prompt to call a tool that reads them from session context.
- Agent instance is a POJO around tool refs + prompt string. Construction is < 1ms; no LLM call.
- Cache is process-local. After a horizontal scale-out, a request reaching a different replica simply rebuilds the Agent — no correctness impact.
- **Instrumentation.** OTel metric `copilot.agent.cache.hit_ratio` (counter pair: hits / misses) — alert if hit ratio drops below 80% sustained, signal that role-bundle cardinality is higher than expected and the cache cap needs review.
- **Cap is env-tunable.** `COPILOT_AGENT_CACHE_MAX` (default 5_000) — bumped without a code change when `agents × role_bundles` outgrows headroom. No dynamic resizing; the operator sets a value and ECS restarts pick it up.
- **Rejected:** singleton Agent with per-call tool injection. Mastra serializes tool schemas into the system prompt at construction; mutating tools per call invalidates provider prompt caching turn-over-turn.
- **Rejected (D9, 2026-05-19):** hashing on `accessible_group_ids`. Fine-grained group membership would push the cache toward per-user instances, defeating provider prompt-cache hits and pushing the LRU bound past its 5,000-entry cap at v1 scale.

### §A9. graphile-worker maintenance → **keep**

- **Signal.** v0.17.0-rc.0 released July 2025; 2026 issue activity (April 2026 issue open). Slow cadence but active. Production-ready 0.x line is stable.
- **Pin** `graphile-worker@^0.16.6` for v1 (prod-stable). Track `0.17` RC for Phase B upgrade window.
- **Fallback contract.** If maintenance signal degrades (no commits in 12 months, security CVE unaddressed), swap to `pg-boss`. Our usage is narrow (cron triggers + retry + `LISTEN/NOTIFY` wakeup) — both libraries cover it. Cost: ~1 sprint to port the ~10 scheduled workflows. Captured as risk #2 in §17.3.

### §A10. pgvector index strategy → **HNSW + tenant_id prefilter**

- **Decision.** HNSW index on every embedding column. Standard parameters: `m=16, ef_construction=200`. Per-query: `SET LOCAL hnsw.ef_search = 40` (default; tune up to 100 for higher recall in `staffing.agent`).
- **Tenant scoping.** All embedding queries include `WHERE tenant_id = $1` as a B-tree prefilter alongside the HNSW order-by. The HNSW index expression is `ON ... USING hnsw (embedding vector_cosine_ops)`; Postgres planner uses the tenant_id index for the filter and HNSW for the order-by.
- **Schema shape.**
  ```sql
  CREATE TABLE planner.task_embeddings (
    chunk_id uuid PRIMARY KEY REFERENCES planner.task_chunks(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    embedding vector(1536) NOT NULL,
    embedded_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX task_embeddings_tenant_idx ON planner.task_embeddings (tenant_id);
  CREATE INDEX task_embeddings_hnsw_idx
    ON planner.task_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);
  ```
- **v1 scale check.** §10.2: 100 tenants × ≤100k tasks × avg 1.5 chunks/task = ≤15M vectors total, ≤150k vectors per tenant. Well inside HNSW's <1M-per-tenant comfort zone. No need for per-tenant partitioning in v1.
- **v1.x trigger for partitioning.** Single tenant > 1M vectors *and* p95 vector-query latency > 200ms. Mitigation: declarative partitioning on `tenant_id` (list partitioning, one partition per hot tenant) so the planner prunes shards.
- **Rebuild cadence.** None scheduled. HNSW handles incremental writes without index-quality degradation at our scale. Reactive rebuild only if recall drops are observed in `embedding-quality-canary` (§14.4, Phase C).

### §A11. Embeddings CDC backpressure → **2 levers Phase A, 3 reactive (D4)**

Architect review 2026-05-19 compressed an earlier 5-lever spec. v1 scale (§10.2: ~15M total vectors across all tenants) does not need all five on day one; speccing each adds ops-surface and test cost. Ship two; add the others when observation justifies.

**Phase A — two levers.**

| Lever | Default | What it does |
|---|---|---|
| `EMBED_WORKER_CONCURRENCY` | `5` | graphile-worker concurrency on the `embed` queue. Caps parallel calls to the embedding provider. |
| `copilot.embed.queue.depth` (OTel gauge) | (n/a) | Operator-visible queue depth. Alert threshold (e.g. 10k sustained 5min) configured outside the app. |

**Bulk-import escape valve.** When `planner.task.bulk.completed` (Phase B) or initial-import (Phase A seed) emits a range event, the embed subscriber batches in groups of up to 2048 (OpenAI batch size limit) — one request per batch. Both per-entity and bulk paths drain through the same worker queue.

**Outage handling.** Provider 5xx → graphile-worker exponential backoff (built-in). Long outage (>1h) → metric crosses alert threshold → operator pauses worker (`graphile-worker --schedule-only`); resume when provider recovers. No data loss — jobs persist in `graphile_worker.jobs`.

**Reactive additions (added when observation triggers).**

| Lever | Trigger to add | What it would do |
|---|---|---|
| `EMBED_PROVIDER_RPM_CAP` | Sustained provider 429s, or risk of saturating tier-1 RPM | Token-bucket semaphore at the provider boundary (e.g. `2400` for tier-1 3000 RPM with 20% headroom). One semaphore across workers/tenants. |
| `EMBED_COALESCE_WINDOW_MS` | Duplicate embed cost observed on rapid edits to the same entity (look at `copilot.embed.invocation` counter ÷ unique entity ids) | graphile-worker `job_key = ${entity_type}:${entity_id}` — re-enqueue within window *replaces* the pending job. Multiple rapid writes coalesce. |
| `EMBED_TENANT_FAIR_SHARE` | Noisy-neighbor incident (one tenant's bulk import delays another tenant's chat-driven re-embed) | Workers pull jobs round-robin across `tenant_id` cursor partitions. |

Each lever is 1–2 days to add and lights up independently; pre-wiring them in Phase A bakes config surface that can't be tuned without telemetry that doesn't exist yet.

### §A12. Single image, mode-selectable runtime → **`SETA_MODULES` + dispatch shim**

The "one runtime binary" framing in earlier drafts of this section is amended. The `seta-server` image is one artifact; the runtime topology (modular monolith vs split per-module ECS services) is chosen at startup via the `SETA_MODULES` env var. Cross-module sync calls route through a dispatch shim (`packages/core/src/rpc/`) that picks in-process function call vs Hono RPC HTTP client based on which modules this process loaded. The event bus is unchanged — `core.events` outbox + `LISTEN/NOTIFY` is already cross-process. Boundary discipline (`CLAUDE.md` "Architectural rules that are enforced") is unchanged; the shim lives entirely inside `core` and peer modules consume it only through `@seta/core/rpc`.

- **Public surface.** `createModuleClient(reg, 'identity', identityRpcMethods)` returns a typed object whose method shapes match `identity`'s `RpcMethodMap`. Each call: (a) reads the current actor from the registry, (b) parses input via zod, (c) runs `rbacCheck` (same code path as remote), (d) dispatches — in-proc function call if `identity ∈ SETA_MODULES`, Hono RPC over HTTP otherwise.
- **Authorization.** Two transports, one `peerAuth` middleware. Self-host single-host uses constant-time bearer comparison against `SETA_RPC_SHARED_SECRET`. AWS production uses mTLS — ECS Service Connect + AWS Private CA terminate the cert chain upstream; the middleware trusts a verified-cert header (`X-Client-Cert-Verified: SUCCESS`).
- **OTel trace propagation.** W3C `traceparent` header injected on egress; resumed via `withRemoteSpan` on ingress. Same trace IDs whether the call was in-proc or split.
- **Mutating-call idempotency.** Callers attach `Idempotency-Key: <uuid>` (auto-generated for methods declared `mutates: true`). Callee dedups via `core.rpc_idempotency` table — race-safe via the primary-key constraint. Failures are NOT cached; retries re-run the body.
- **Error contract.** `ModuleUnavailable` (peer down after 1 retry on network/timeout/502/503/504), `RpcTimeout`, `RpcForbidden`, `RpcInvalidArgument`, `RpcInternal`. Callers handle as named classes.

This provision keeps OSS self-host as a single container and unlocks AWS per-module scaling without a code fork — see ADR D34 in `docs/project-plan.md §7` and `docs/superpowers/specs/2026-05-20-deployment-strategy-design.md` §5.4.

---

## §B. Module boundary enforcement

§1.6.2 mandates four enforcement mechanisms. Concrete shapes:

### §B.1 ESLint / dependency-cruiser

Full ruleset in §A5. dependency-cruiser is the CI gate (`turbo run lint` includes it). `eslint-plugin-boundaries` mirrors the rules inside the IDE for fast feedback.

### §B.2 Drizzle schema scoping

Each module's drizzle config sets `schemaFilter`:

```ts
// packages/planner/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  out:    './src/db/migrations',
  schemaFilter: ['planner'],
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Drizzle introspection ignores other schemas → cross-schema reads fail at codegen / type-check time, not at runtime.

### §B.3 Raw-SQL CI audit

CI step (`turbo run lint:sql`):

```bash
#!/usr/bin/env bash
set -e
PATTERNS='(FROM|JOIN)[[:space:]]+(core|identity|planner|copilot|integrations)\.'
SCOPE='packages/{identity,planner,copilot,integrations}/src'

violations=$(grep -rEn "$PATTERNS" $SCOPE --include='*.ts' \
  | grep -v '/db/' \
  | grep -v '// allow-cross-schema:' \
  || true)

if [ -n "$violations" ]; then
  echo "Cross-schema SQL violation:" >&2
  echo "$violations" >&2
  exit 1
fi
```

`core/src/{audit,events}` is the only directory exempt by convention; the script's path filter excludes `packages/core` entirely. Per-line escape hatch via `// allow-cross-schema: <justification>` comment, never to be used in v1 outside a documented exception.

### §B.4 Public-API integration test

```ts
// packages/planner/test/index-surface.test.ts
import { register } from '@seta/planner';
import { describe, it, expect } from 'vitest';

describe('planner public surface', () => {
  it('exports only the v1 surface (§15.3)', () => {
    const exported = Object.keys(register);
    expect(exported.sort()).toEqual([
      'addGroupMember', 'addSkillTag', 'assignTask', 'createBucket',
      'createGroup', 'createPlan', 'createTask', 'findTasks', 'getTask',
      'listGroups', 'listPlans', 'register', 'reorderBuckets',
      'searchTasksSemantic', 'toggleReviewState', 'unassignTask', 'updateTask',
    ]);
  });
});
```

Plus a build-time integration test that compiles `packages/<m>/src/index.ts` with `paths` rewritten to alias all peers' `internals/` to `unreachable` — any leakage fails the build.

### §B.5 What happens when a rule fires

CI: fails the PR. PR comment template explains the rule + offers the legal alternative (call the package's public surface from its root, subscribe to an event, propose adding to the public surface). No bypass mechanism; rules can only be relaxed by editing the config file in a PR that touches the architecture decision.

---

## §C. Module composition — imperative `ContributionRegistry`

**D1 (architect review 2026-05-19): this section was rewritten.** An earlier draft introduced a declarative `ModuleManifest` pattern with two pure composers, an `ActionId` indirection, and a serializable shell-runtime. That contradicted `requirements.md §1.6.3` which explicitly defers manifest abstractions to v2 ("modules register their contributions through plain code — direct imports from `core`'s registration APIs at app boot"). On review the manifest pattern was found to add several hundred LOC for properties (serializable per-user manifest filtering, action-by-ID indirection, declarative composers) that don't earn their keep in a single-process v1 with five modules. The imperative shape below matches §1.6.3 directly.

### §C.1 The pattern

Each module exports **one registration function** that takes a single `ContributionRegistry` and calls the registry's typed methods. Boot order in `apps/server` is plain code: call each module's `registerXContributions(reg)` in dependency order.

```ts
// packages/shared/types/contribution-registry.ts
import type { HonoRouter } from '@seta/shared/types';
import type { PgSchemaModule } from '@seta/shared/db';
import type { ToolDef, AgentDef, WorkflowDef, SubscriberDef } from '@seta/shared/types';
import type { RoleDefinition, PermissionDefinition, VisibilityGate } from '@seta/shared/rbac';

export interface ContributionRegistry {
  // Backend
  schema(mod: ModuleKey, schema: PgSchemaModule): void;
  migrationsDir(mod: ModuleKey, dir: string): void;
  routes(mod: ModuleKey, router: HonoRouter): void;
  permissions(perms: PermissionDefinition[]): void;
  roles(roles: RoleDefinition[]): void;
  copilotTools(tools: ToolDef[]): void;
  copilotAgents(agents: AgentDef[]): void;
  workflows(workflows: WorkflowDef[]): void;
  subscribers(subs: SubscriberDef[]): void;
  scheduled(jobs: ScheduledJobDef[]): void;
  publicApi(mod: ModuleKey, api: Record<string, Function>): void;

  // Frontend — same registry; consumed by apps/web shell.
  app(mod: ModuleKey, app: AppDef): void;
  menuItems(items: MenuItemDef[]): void;
  commands(commands: CommandDef[]): void;
  hotkeys(hotkeys: HotkeyDef[]): void;
  notificationRenderers(renderers: NotificationRendererDef[]): void;
  providers(providers: ProviderComponent[]): void;
  actions(actions: Record<string, ActionHandler>): void;
}
```

### §C.2 Per-module registration function

```ts
// packages/planner/src/register.ts
import type { ContributionRegistry } from '@seta/shared/types';
import * as schema from '../db/schema';
import { plannerRouter } from '../backend/routes';
import { plannerAgent } from '../backend/copilot/agents/planner.agent';
import * as tools from '../backend/copilot/tools';
import * as subscribers from '../backend/subscribers';
import * as permissions from '../backend/permissions';
import * as roles from '../backend/roles';
import * as publicApi from './functions';

export function registerPlannerContributions(reg: ContributionRegistry): void {
  reg.schema('planner', schema);
  reg.migrationsDir('planner', 'packages/planner/src/db/migrations');
  reg.routes('planner', plannerRouter);
  reg.permissions(permissions.catalog);
  reg.roles([roles.admin, roles.contributor, roles.viewer]);
  reg.copilotTools(Object.values(tools));
  reg.copilotAgents([plannerAgent]);
  reg.subscribers([
    { event: 'identity.user.deactivated',     eventVersion: 1, subscription: 'planner.user-cleanup',           handler: subscribers.cleanupAssignments },
    { event: 'identity.user.profile.updated', eventVersion: 1, subscription: 'planner.assignee-projection',    handler: subscribers.refreshAssigneeProjection },
    { event: 'planner.task.created',          eventVersion: 1, subscription: 'planner.embed-enqueue-created',  handler: subscribers.enqueueEmbedRefresh },
    { event: 'planner.task.updated',          eventVersion: 1, subscription: 'planner.embed-enqueue-updated',  handler: subscribers.enqueueEmbedRefresh },
  ]);
  reg.publicApi('planner', publicApi);

  // Phase B frontend (Phase A: no planner UI per §14.1):
  // reg.app('planner', { landingPath: '/planner', routes: [...], sidebar: {...}, visibility: { anyOf: ['planner.group.read', 'org.viewer'] }, order: 20 });
  // reg.commands([...]);
  // reg.hotkeys([...]);
  // reg.actions({ 'planner.openCreateTaskSheet': ({ modal }) => modal.open(<CreateTaskSheet />), ... });
}
```

A module with no UI surface in a given phase simply omits the frontend calls. No manifest object to thin out.

### §C.3 Boot wiring

```ts
// apps/server/src/index.ts
import { createContributionRegistry, buildHonoApp, runMigrations, startBus, startWorkers, startMastra } from '@seta/core/composition';
import { registerCoreContributions } from '@seta/core/register';
import { registerIdentityContributions } from '@seta/identity/register';
import { registerPlannerContributions } from '@seta/planner/register';
import { registerIntegrationsContributions } from '@seta/integrations/register';
import { registerCopilotContributions } from '@seta/copilot/register';

const reg = createContributionRegistry();
registerCoreContributions(reg);          // core first — events live in core.events (audit unified per D6)
registerIdentityContributions(reg);      // identity second — sessions before any module's routes mount
registerPlannerContributions(reg);
registerIntegrationsContributions(reg);
registerCopilotContributions(reg);       // copilot last — needs peers' tools/agents already collected

await runMigrations(reg);                // dep order via reg.migrationsDir entries
await startBus(reg);                     // dispatcher reads reg.subscribers
await startWorkers(reg);                 // graphile-worker tasks + reg.scheduled crons
await startMastra(reg);                  // builds runtime from collected tools/agents/workflows
serve({ fetch: buildHonoApp(reg).fetch, port: env.PORT });
```

```ts
// apps/web/src/main.tsx
import { createContributionRegistry, buildShell, fetchSession } from '@seta/core/composition';
import { registerCoreShell } from '@seta/core/register';
import { registerIdentityShell } from '@seta/identity/register';
import { registerCopilotShell } from '@seta/copilot/register';

async function boot() {
  const reg = createContributionRegistry();
  registerCoreShell(reg);
  registerIdentityShell(reg);
  registerCopilotShell(reg);   // Phase A: standalone Copilot module
  const session = await fetchSession();
  ReactDOM.createRoot(document.getElementById('root')!)
    .render(<AppShell runtime={buildShell(reg, session)} />);
}
boot();
```

Backend boot and shell boot use the same `ContributionRegistry` interface — only the methods called differ. The registry implementation is a plain accumulator (Maps under the hood); `buildShell()` and `buildHonoApp()` consume the accumulated state.

### §C.4 Visibility gating

Permission-checked visibility — menu items, commands, hotkeys, app launcher tiles — uses one predicate utility from `@seta/shared/rbac` (D14):

```ts
// packages/shared/rbac/src/visibility.ts
export type VisibilityGate =
  | string                                       // 'planner.task.read'
  | { anyOf: string[] }
  | { allOf: string[] }
  | { predicate: (s: SessionScope) => boolean };

export function passesGate(gate: VisibilityGate, session: SessionScope): boolean { /* ... */ }
```

`reg.app()`, `reg.menuItems()`, `reg.commands()`, `reg.hotkeys()` each carry a `visibility: VisibilityGate` field. The shell filters at render time. The same utility evaluates server-side when `/api/auth/me` computes `visibleApps` for the launcher.

### §C.5 Why this works (vs. the rejected manifest pattern)

| Property | Imperative `ContributionRegistry` (this) | Rejected `ModuleManifest` |
|---|---|---|
| Adding a contribution type | Add a method to the registry interface + handle in `buildHonoApp` / `buildShell`. Existing modules unaffected. | Add an optional field to the manifest + handle in composer. Tie. |
| One file per module | `register.ts` calls 5–15 typed methods, readable top-to-bottom. | Nested object literal. Comparable. |
| Serializable for SSR / per-user shipping | Not serializable. We don't SSR (Vite SPA behind login). | Serializable — buys nothing v1 actually uses. |
| Action references | Plain object: `reg.actions({ 'planner.openCreateTaskSheet': ({modal}) => ... })`. Direct closures, type-safe. | `ActionId` strings + lookup table; misses fail at boot. Indirection for a property we don't need. |
| LOC overhead | ~50 LOC for the registry + boot wiring. | ~300 LOC: manifest type + composers + action registry + filter functions. |
| Boundary preservation | Modules expose `register.ts` only via the package root (`src/index.ts`). §A5 dep-cruiser enforces. | Same. Tie. |
| Test ergonomics | `const reg = createContributionRegistry(); registerPlannerContributions(reg); expect(reg.collected.routes.get('planner'))...` | `composeShell([plannerManifest], mockSession)`. Tie. |

Deciding factors: serializable manifests buy nothing v1 uses (we don't SSR; per-user filtering is solved server-side by computing `visibleApps` and shipping that). The action-registry indirection adds a failure mode (unregistered ActionId at boot) without solving a problem.

### §C.6 What this means for the rest of the doc

The earlier draft's references to `ModuleManifest`, `composeBackend`, `composeShell`, `ActionId`, "filtered per-user manifest" map to the imperative shape above. The §M.2 trimmed federation section (D3) already preserves the property that mattered — modules register *somewhere*, and the composition site can move from build-time to runtime as needed.

`rbac-and-screens.md` references to `AppContribution` map to `AppDef` here (or to `reg.app()` arguments).

---

## §D. Boot sequence + migration orchestration

### §D.1 Migration order

Strict dependency order, run inside one process at app boot. Any failure → exit non-zero → ECS restarts.

```ts
// apps/server/src/migrations.ts
export async function runMigrationsInDepOrder(reg: ContributionRegistry): Promise<void> {
  const pool = await openPool();
  await ensurePgvectorExtension(pool);     // CREATE EXTENSION IF NOT EXISTS vector

  // Hard order: core first (events + audit must exist before anyone emits).
  await migrateModule(pool, 'core');
  await migrateModule(pool, 'identity');

  // Parallel within tier 3 (planner / integrations / copilot have no inter-dependencies in DDL).
  await Promise.all([
    migrateModule(pool, 'planner'),
    migrateModule(pool, 'integrations'),
    migrateModule(pool, 'copilot'),
  ]);

  // Mastra-owned tables initialize lazily on first @mastra/pg use; do not migrate here.
}

async function migrateModule(pool: pg.Pool, mod: ModuleName): Promise<void> {
  const drizzle = drizzleClient(pool);
  await migrate(drizzle, { migrationsFolder: `packages/${mod}/src/db/migrations`, migrationsSchema: `${mod}_migrations` });
}
```

- `<module>_migrations` schema per module — Drizzle's metadata table (`__drizzle_migrations`) lives there, no collision with business tables.
- Each module's migrations folder is owned by that module's PR; cross-module migration ordering is *not* allowed (no migration in `planner` may depend on a state set up in `integrations`).

### §D.2 Boot sequence (re-stated for completeness)

1. Validate env (`zod`).
2. Open `pg.Pool`. Verify `pgvector` extension installed.
3. Run migrations in dep order (above).
4. Build `ContributionRegistry` by calling each module's `registerX(reg)` — assembles routes, roles, tools, agents, subscribers, frontend routes.
5. Build the Mastra runtime from `reg.collectedTools`, `reg.collectedAgents`, `reg.collectedWorkflows`.
6. Start bus dispatcher (one `LISTEN events` loop per subscriber group).
7. Start `graphile-worker` (cron + retry).
8. Mount Hono app: session middleware → module routers → Mastra adapter → SPA static.
9. Start HTTP server.

No degraded-mode boot: any step's failure → process exits non-zero → ECS restarts the task.

---

## §E. Data model (Phase A) — Drizzle schemas

Per-module Drizzle schemas, scoped via `pgSchema`. Only Phase A scope is enumerated; Phase B (`comments`, `attachments`) and Phase C (`tenant_knowledge_*`) are sketched as schema headroom.

### §E.1 `core` schema

```ts
// packages/core/src/db/schema/index.ts
import { pgSchema, uuid, text, timestamp, jsonb, integer, bigint, boolean } from 'drizzle-orm/pg-core';

export const core = pgSchema('core');

export const tenants = core.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  suspended_at: timestamp('suspended_at', { withTimezone: true }),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  idle_timeout_days: integer('idle_timeout_days').default(30).notNull(),
  ai_cost_cap_usd_monthly: integer('ai_cost_cap_usd_monthly').default(500),
  // Phase B: branding, vanity_domain, account_id (v1.x §11.2 hook), feature_flags jsonb
});

export const instanceConfig = core.table('instance_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// §1.6.5a + §8.1 (D6, 2026-05-19): events table doubles as the audit log.
// Payload carries actor/before/after/ip/user_agent. Audit-shaped reads go through
// core.audit_v (Postgres view defined in 0002_audit_view.sql).
// Partitioned by month, see DDL note below.
export const events = core.table('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  occurred_at: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  tenant_id: uuid('tenant_id').notNull(),
  aggregate_type: text('aggregate_type').notNull(),
  aggregate_id: text('aggregate_id').notNull(),
  event_type: text('event_type').notNull(),
  event_version: integer('event_version').notNull(),
  payload: jsonb('payload').notNull(),  // includes { actor: {...}, before?, after?, ip?, user_agent? }
  caused_by_event_id: uuid('caused_by_event_id'),
  trace_id: text('trace_id'),
});

// Payload type for `events.payload` — enforced in code (zod-validated at emit()).
//   {
//     actor: { type: 'user' | 'copilot' | 'system' | 'superadmin',
//              user_id?: string, agent_name?: string, on_behalf_of_user_id?: string },
//     ip?: string,
//     user_agent?: string,
//     before?: unknown,
//     after?: unknown,
//     ...domain-specific fields
//   }

// §7.1e — durable layer of the session scope cache (in-memory LRU is the hot layer)
export const sessionScopeCache = core.table('session_scope_cache', {
  session_id: text('session_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  user_id: uuid('user_id').notNull(),
  role_summary_hash: text('role_summary_hash').notNull(),
  role_summary: jsonb('role_summary').notNull(),
  accessible_group_ids: jsonb('accessible_group_ids').notNull(),
  cross_tenant_read: boolean('cross_tenant_read').default(false).notNull(),
  built_at: timestamp('built_at', { withTimezone: true }).defaultNow().notNull(),
  invalidated_at: timestamp('invalidated_at', { withTimezone: true }),
});
```

**Raw DDL appended in `core/src/db/migrations/0001_partitions.sql`** (drizzle-kit doesn't emit `PARTITION BY` yet):

```sql
ALTER TABLE core.events RENAME TO events_legacy;
CREATE TABLE core.events (LIKE core.events_legacy INCLUDING ALL) PARTITION BY RANGE (occurred_at);
-- monthly partitions auto-created by pg_partman OR a graphile cron 'core.events-partition-manager'
CREATE INDEX events_aggregate_idx ON core.events (aggregate_type, aggregate_id, occurred_at);
CREATE INDEX events_tenant_type_idx ON core.events (tenant_id, event_type, occurred_at);
-- D6: index for audit-shaped reads by actor and by resource
CREATE INDEX events_actor_idx ON core.events ((payload->'actor'->>'user_id'), occurred_at);
DROP TABLE core.events_legacy;
```

**Audit view appended in `core/src/db/migrations/0002_audit_view.sql`** (D6 — audit-shaped read API over the unified events table):

```sql
CREATE VIEW core.audit_v AS
SELECT
  id,
  occurred_at,
  tenant_id,
  event_type AS action,
  aggregate_type AS resource_type,
  aggregate_id AS resource_id,
  payload->'actor'->>'type'           AS actor_kind,
  (payload->'actor'->>'user_id')::uuid AS actor_user_id,
  payload->'actor'->>'agent_name'     AS actor_agent_name,
  payload->'before'                   AS before,
  payload->'after'                    AS after,
  payload->>'ip'                      AS ip,
  payload->>'user_agent'              AS user_agent,
  trace_id
FROM core.events;
```

Partition manager (graphile-worker cron, runs daily): creates next month's partition 7 days ahead, detaches and archives partitions older than `core.tenants.event_retention_days` (default 30) to S3. v1 archival format: gzipped JSONL of all rows.

### §E.2 `identity` schema

```ts
import { pgSchema, uuid, text, timestamp, jsonb, boolean, integer } from 'drizzle-orm/pg-core';

export const identity = pgSchema('identity');

// better-auth-owned tables (better-auth creates these via its drizzle adapter)
// We do NOT version-control them in our migrations; better-auth migrate runs first.
//   identity.user, identity.session, identity.account, identity.verification

// Our extensions:
export const userProfile = identity.table('user_profile', {
  user_id: uuid('user_id').primaryKey(),  // FK→identity.user.id (intra-schema, allowed)
  tenant_id: uuid('tenant_id').notNull(),
  skills: text('skills').array().default([]).notNull(),
  availability_status: text('availability_status', { enum: ['available', 'busy', 'ooo'] })
    .default('available').notNull(),
  ooo_until: timestamp('ooo_until', { withTimezone: true }),
  timezone: text('timezone').default('UTC').notNull(),
  working_hours: jsonb('working_hours').$type<{ start: string; end: string } | null>(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const roleGrants = identity.table('role_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  tenant_id: uuid('tenant_id').notNull(),
  role_slug: text('role_slug').notNull(),         // 'planner.contributor'
  scope_type: text('scope_type', { enum: ['tenant', 'group'] }).notNull(),
  scope_id: text('scope_id'),                      // null for tenant scope; group_id for group scope
  granted_by: uuid('granted_by'),
  granted_at: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
});

export const failedLoginAttempts = identity.table('failed_login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  ip: text('ip').notNull(),
  attempted_at: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  reason: text('reason').notNull(),
});

// §3.9.1 + §7.1c — for "find users by skill concept" semantic matching path (Phase A)
export const userSkillEmbeddings = identity.table('user_skill_embeddings', {
  user_id: uuid('user_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  source_text: text('source_text').notNull(),     // concatenated skill list for re-embed
  embedded_at: timestamp('embedded_at', { withTimezone: true }).defaultNow().notNull(),
});
```

`vector(1536)` comes from `drizzle-orm/pg-core` via the pgvector extension typing helper. HNSW index appended in raw SQL migration (§A10).

### §E.3 `planner` schema (Phase A scope)

```ts
import { pgSchema, uuid, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';

export const planner = pgSchema('planner');

export const groups = planner.table('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  account_id: uuid('account_id'),                  // §2.3 v1.x hook, always null in v1
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const groupMembers = planner.table('group_members', {
  group_id: uuid('group_id').notNull(),
  user_id: uuid('user_id').notNull(),
  added_at: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  // Composite PK
});

export const plans = planner.table('plans', { /* tenant_id, group_id, name, created_at */ });
export const buckets = planner.table('buckets', { /* tenant_id, plan_id, name, sort_order */ });

export const tasks = planner.table('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  plan_id: uuid('plan_id').notNull(),
  bucket_id: uuid('bucket_id'),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority', { enum: ['urgent', 'important', 'medium', 'low'] }).default('medium').notNull(),
  progress: text('progress', { enum: ['not_started', 'in_progress', 'completed', 'deferred'] }).default('not_started').notNull(),
  // §5.3 — optional refinement; default null. Per D15 the agent does not depend on this field being set.
  // v1 values: 'needs_review' | null. Schema is pgEnum with a single non-null value to leave room for
  // 'in_review' / 'approved' / 'changes_requested' / 'blocked' in v1.x without a column migration.
  review_state: text('review_state', { enum: ['needs_review'] }),
  // §5.1 — optional refinement; default empty. Agent infers topics from title+description by default
  // (§7.2 infer_task_topics). Explicit tags pin topic with high confidence when present.
  skill_tags: text('skill_tags').array().default([]).notNull(),
  due_at: timestamp('due_at', { withTimezone: true }),
  created_by: uuid('created_by').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});

export const taskAssignments = planner.table('task_assignments', {
  task_id: uuid('task_id').notNull(),
  user_id: uuid('user_id').notNull(),
  assigned_at: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  // composite PK
});

export const checklistItems = planner.table('checklist_items', { /* task_id, label, checked, sort_order */ });
export const labels = planner.table('labels', { /* tenant_id, plan_id, name, color */ });
export const taskLabels = planner.table('task_labels', { /* task_id, label_id */ });

// §1.6.11 — read-model projection (event-driven, no FK to identity)
export const assigneeProjection = planner.table('assignee_projection', {
  user_id: uuid('user_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  display_name: text('display_name').notNull(),
  skills: text('skills').array().default([]).notNull(),
  availability_status: text('availability_status').notNull(),
  workload_score: integer('workload_score').default(0).notNull(),  // recomputed by workload-cache-refresh
  ooo_until: timestamp('ooo_until', { withTimezone: true }),
  refreshed_at: timestamp('refreshed_at', { withTimezone: true }).defaultNow().notNull(),
});

// §7.1c — task embeddings
export const taskChunks = planner.table('task_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  task_id: uuid('task_id').notNull(),
  tenant_id: uuid('tenant_id').notNull(),
  chunk_index: integer('chunk_index').notNull(),
  text: text('text').notNull(),
  source_hash: text('source_hash').notNull(),    // dedupe: skip re-embed if hash unchanged
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const taskEmbeddings = planner.table('task_embeddings', {
  chunk_id: uuid('chunk_id').primaryKey(),
  task_id: uuid('task_id').notNull(),
  tenant_id: uuid('tenant_id').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  embedded_at: timestamp('embedded_at', { withTimezone: true }).defaultNow().notNull(),
});

export const planEmbeddings = planner.table('plan_embeddings', {
  plan_id: uuid('plan_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  source_text: text('source_text').notNull(),
  embedded_at: timestamp('embedded_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### §E.4 `copilot` schema

Mastra-owned tables (auto-managed by `@mastra/pg`): `mastra_threads`, `mastra_messages`, `mastra_resources`, `mastra_workflow_snapshot`, `mastra_evals`, `mastra_traces`. We do not version-control them.

Our own tables:

```ts
export const copilot = pgSchema('copilot');

export const rateLimits = copilot.table('rate_limits', {
  tenant_id: uuid('tenant_id').notNull(),
  bucket: text('bucket').notNull(),               // 'chat', 'embed', 'workflow'
  window_start: timestamp('window_start', { withTimezone: true }).notNull(),
  token_count: integer('token_count').default(0).notNull(),
  usd_cost_cents: integer('usd_cost_cents').default(0).notNull(),
  // composite PK (tenant_id, bucket, window_start)
});

// §7.3 — workflow runs view shim. Mastra's snapshot is the truth; this projects it for the Workflows tab UI.
export const workflowRunsView = copilot.table('workflow_runs_view', {
  run_id: uuid('run_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  workflow_name: text('workflow_name').notNull(),
  triggered_by: text('triggered_by').notNull(),   // 'cron' | 'event:<type>' | 'manual:<user_id>'
  status: text('status').notNull(),                // 'running' | 'suspended' | 'completed' | 'failed'
  started_at: timestamp('started_at', { withTimezone: true }).notNull(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
  summary: jsonb('summary'),                       // per-workflow custom fields for UI display
});
```

### §E.5 `integrations` schema (Phase A scope)

Phase A only ships the Timesheet MCP path (read-only).

```ts
export const integrations = pgSchema('integrations');

export const mcpClients = integrations.table('mcp_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  kind: text('kind').notNull(),                    // 'timesheet'
  endpoint_url: text('endpoint_url').notNull(),
  // credentials encrypted at rest via AWS Secrets Manager; row stores Secret ARN, not raw key
  credentials_secret_arn: text('credentials_secret_arn').notNull(),
  health_state: text('health_state', { enum: ['healthy', 'degraded', 'unreachable'] })
    .default('healthy').notNull(),
  last_invoked_at: timestamp('last_invoked_at', { withTimezone: true }),
  last_failure_at: timestamp('last_failure_at', { withTimezone: true }),
  last_failure_reason: text('last_failure_reason'),
  configured_by: uuid('configured_by').notNull(),
  configured_at: timestamp('configured_at', { withTimezone: true }).defaultNow().notNull(),
});

// §11.5 / Phase B: bindings (MS Planner), sync_state, conflict_log, translation_log
```

---

## §F. Event bus — outbox + dispatcher

§1.6.5a fixed the design. Concrete shapes:

### §F.1 Dispatcher loop

```ts
// packages/core/src/events/dispatcher.ts
export async function startDispatcher(subscribers: SubscriberDefinition[]): Promise<void> {
  // One PG client per dispatcher process, dedicated to LISTEN.
  const listener = await pool.connect();
  await listener.query('LISTEN events');

  // Cursor map: subscription name → last_processed_event_id
  const cursors = await loadCursors();   // from core.subscription_cursors

  listener.on('notification', async () => {
    // NOTIFY fires every commit. We don't trust the payload (8KB limit); we re-poll.
    await drainAllSubscriptions(subscribers, cursors);
  });

  // Fallback poll every 2s — covers dropped NOTIFY (replica lag, connection blip).
  setInterval(() => drainAllSubscriptions(subscribers, cursors), 2000);
}

async function drainAllSubscriptions(subs: SubscriberDefinition[], cursors: CursorMap) {
  await Promise.all(subs.map(sub => drainOne(sub, cursors)));
}

async function drainOne(sub: SubscriberDefinition, cursors: CursorMap) {
  const last = cursors.get(sub.subscription);
  const batch = await db
    .select().from(coreEvents)
    .where(and(
      eq(coreEvents.event_type, sub.event),
      eq(coreEvents.event_version, sub.eventVersion),
      last ? gt(coreEvents.id, last) : undefined,
    ))
    .orderBy(coreEvents.occurred_at)
    .limit(100);

  for (const evt of batch) {
    try {
      await db.transaction(async (tx) => {
        await emitContext.run({ tx, causedByEventId: evt.id, traceId: evt.trace_id }, async () => {
          await sub.handler(evt, { tx });
        });
        await advanceCursor(tx, sub.subscription, evt.id);
      });
    } catch (err) {
      // §1.6.5a: per-aggregate ordering; subscriber must be idempotent.
      // Failure halts this subscription; metric + retry loop. Other subscriptions continue.
      logger.error({ sub: sub.subscription, evt: evt.id, err }, 'subscriber failed');
      metrics.counter('subscriber.failures').inc({ subscription: sub.subscription });
      break;
    }
  }
}
```

- **Per-aggregate ordering** — events are emitted in commit order, and the dispatcher reads in `occurred_at` order. Subscribers that need stricter intra-aggregate ordering (e.g., `planner.task.created` must land before `planner.task.assigned` for the same task) get it for free.
- **Cross-aggregate ordering is not guaranteed.** Subscribers that join across aggregates use the local projection table (`planner.assignee_projection`) for the latest snapshot.
- **Idempotency** keyed on `event_id`. The default subscriber framework upserts on `(subscription, event_id)` into a `core.subscription_processed` table within the same tx as the handler effect, so a handler re-run after a tx rollback finds the event unprocessed and runs again; a re-run after a tx commit finds it processed and skips.

### §F.2 Subscription cursor schema

```sql
CREATE TABLE core.subscription_cursors (
  subscription text PRIMARY KEY,
  last_processed_event_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE core.subscription_processed (
  subscription text NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription, event_id)
);
-- TTL: rows older than 30d trimmed by graphile cron (events older than the partition replay window can't be re-played anyway).
```

### §F.3 Event-payload type registry

Each module exports event-payload types from `packages/<m>/src/events/`:

```ts
// packages/planner/src/events/index.ts
export type PlannerTaskCreated = {
  task_id: string;
  tenant_id: string;
  plan_id: string;
  title: string;
  created_by: string;
  skill_tags: string[];
};

export type PlannerTaskAssigned = {
  task_id: string;
  tenant_id: string;
  assignee_id: string;
  assigned_by: string;
};

export const PLANNER_EVENT_TYPES = {
  TASK_CREATED: 'planner.task.created' as const,
  TASK_UPDATED: 'planner.task.updated' as const,
  TASK_ASSIGNED: 'planner.task.assigned' as const,
  TASK_UNASSIGNED: 'planner.task.unassigned' as const,
  TASK_REVIEW_STATE_CHANGED: 'planner.task.review_state.changed' as const,
  TASK_DELETED: 'planner.task.deleted' as const,
  PLAN_CREATED: 'planner.plan.created' as const,
  BUCKET_REORDERED: 'planner.bucket.reordered' as const,
};
```

Consumers (`copilot` subscribing to `planner.task.assigned`, etc.) import the type and use a typed subscriber wrapper.

### §F.4 Cross-module data access patterns

The concrete answer to "*the planner module needs user info held by identity — how?*"

**The constraint** (from §1.6.2): a module never reads another module's tables. `planner` cannot `SELECT FROM identity.user_profile`. Drizzle's `schemaFilter` enforces this at type level; raw-SQL CI audit (§B.3) enforces it at lint time; dependency-cruiser (§A5) forbids importing the other module's internals at compile time.

**The pattern** (decision rule first, then mechanics):

| Need | Pattern | When to use |
|---|---|---|
| "Run a one-shot action that depends on the other module" (e.g., create a task whose `created_by` references an identity user — but the planner only stores the uuid, doesn't need to display the name now) | **Just store the foreign id; don't fetch.** | Default. Most cross-module touches don't need joined data. |
| "I need the user's display name / skills / availability inside *this* request" | **Synchronous: call the other module's `publicApi.getX()`** | Rare, ad-hoc reads. Single record. No hot path. |
| "I serve a query that joins user data into every row" (assignee list, recommender ranking, mention rendering) | **Async: subscribe to the other module's events; maintain a local read-model projection** | Hot paths. Anything that would otherwise N+1 across the function-call boundary. |
| "I need a synchronous, side-effecting operation on another module" (e.g., copilot tool calling `planner.assignTask`) | **Synchronous: call `publicApi.assignTask()` — never reach into another module's tables to mutate** | Cross-module mutations. The callee's public function re-checks RBAC and emits its own events. |

The projection pattern is the default for **anything on a hot path**. It looks like more code on day one and pays back tenfold once your recommender does one query instead of N RPCs.

#### §F.4.1 Worked example — planner needs identity data

**The need.** `planner` UI shows the assignee's display name + avatar next to every task; `staffing.agent` ranks candidates by skills + availability + workload; `planner.assignTask` validates the assignee is still active before writing.

**Three different access patterns, three different mechanisms.**

##### Pattern A — store the FK, don't join (the common case)

`planner.tasks.assignee_id` is a plain `uuid` (no FK to `identity.user`, per §1.6.2 rule 5). Most `planner` queries return the id; the UI fetches the display name lazily via a batch endpoint or — more typically — uses the projection from Pattern C.

```ts
// packages/planner/src/backend/domain/list-tasks.ts
export async function listTasks(input: ListTasksInput): Promise<TaskRow[]> {
  return db.select().from(plannerTasks)
    .where(and(
      eq(plannerTasks.tenant_id, input.tenant_id),
      inArray(plannerTasks.plan_id, accessiblePlanIds(input.session)),
    ))
    .limit(50);
  // assignee_id is a bare uuid in each row; no identity touch here.
}
```

##### Pattern B — synchronous call to identity's public API (rare reads)

When `planner.assignTask` needs to confirm the user is active and in the same tenant before assigning:

```ts
// packages/planner/src/backend/domain/assign-task.ts
import { identityPublic } from '@seta/identity';   // public surface only — dep-cruiser enforced

export async function assignTask(input: AssignTaskInput): Promise<TaskRow> {
  // 1. Sync RBAC + existence check on the identity side.
  //    identity re-checks its own permissions; planner trusts the boolean answer.
  const user = await identity.getUser(input.assignee_id, { actingUser: input.session });
  if (!user || user.deactivated_at) {
    throw new DomainError('ASSIGNEE_NOT_ACTIVE', 'Cannot assign to a deactivated user.');
  }
  if (user.tenant_id !== input.session.tenant_id) {
    throw new DomainError('CROSS_TENANT_ASSIGN', 'Assignee not in this tenant.');
  }

  // 2. Do the planner-local write inside the outbox tx — emits planner.task.assigned.
  return db.transaction(async (tx) => {
    await emitContext.run({ tx }, async () => {
      await tx.insert(taskAssignments).values({ task_id: input.task_id, user_id: input.assignee_id });
      await emit({
        event_type: 'planner.task.assigned', event_version: 1,
        tenant_id: input.session.tenant_id,
        aggregate_type: 'planner.task', aggregate_id: input.task_id,
        payload: { task_id: input.task_id, assignee_id: input.assignee_id, assigned_by: input.session.user_id },
        caused_by_user_id: input.session.user_id,
      });
    });
    return loadTask(tx, input.task_id);
  });
}
```

**Why sync here and not the projection.** This check happens once per assignment (low-frequency action) and needs strongly-consistent data — a user deactivated 50ms ago must not be assignable. A projection would have eventually-consistent lag (sub-second usually, but never zero). The hot path is the recommender (Pattern C); the assignment is the cold path.

**`identity.getUser` shape** (re-exported from `packages/identity/src/index.ts`):

```ts
export interface PublicUser {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  deactivated_at: Date | null;
}

export async function getUser(userId: string, opts: { actingUser: SessionScope }): Promise<PublicUser | null> {
  // RBAC re-checked at this public entry per §1.6.5.
  if (!hasPermission(opts.actingUser, 'identity.user.read.any')) {
    if (opts.actingUser.user_id !== userId) throw new ForbiddenError('identity.user.read.any');
  }
  const row = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row[0] ? toPublicUser(row[0]) : null;
}
```

The return type is `PublicUser`, **not** the internal `User` row. Internals stay private.

##### Pattern C — local read-model projection (the hot path)

`planner` keeps a denormalized table inside its own schema that mirrors the identity fields it needs. Subscriber consumes identity events and maintains the projection. Every planner query that needs assignee data joins this **local** table.

**The projection table** (already shown in §E.3 — restated for context):

```ts
// packages/planner/src/db/schema/assignee-projection.ts
export const assigneeProjection = planner.table('assignee_projection', {
  user_id: uuid('user_id').primaryKey(),               // bare uuid; no FK to identity (§1.6.2)
  tenant_id: uuid('tenant_id').notNull(),
  display_name: text('display_name').notNull(),
  email: text('email').notNull(),
  skills: text('skills').array().default([]).notNull(),
  availability_status: text('availability_status').notNull(),
  timezone: text('timezone').notNull(),
  workload_score: integer('workload_score').default(0).notNull(),  // computed by planner workflow
  ooo_until: timestamp('ooo_until', { withTimezone: true }),
  deactivated_at: timestamp('deactivated_at', { withTimezone: true }),
  projection_built_at: timestamp('projection_built_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**The subscriber** (declared in `packages/planner/manifest.ts` — §C.3):

```ts
// packages/planner/src/backend/subscribers/identity-projection.ts
import type { IdentityUserCreated, IdentityUserProfileUpdated,
              IdentityUserDeactivated } from '@seta/identity/events';

export async function applyUserCreated(e: DomainEvent<IdentityUserCreated>, ctx: SubscriberCtx) {
  await ctx.tx.insert(assigneeProjection).values({
    user_id: e.payload.user_id,
    tenant_id: e.payload.tenant_id,
    display_name: e.payload.display_name,
    email: e.payload.email,
    skills: [],
    availability_status: 'available',
    timezone: e.payload.timezone ?? 'UTC',
    workload_score: 0,
    ooo_until: null,
    deactivated_at: null,
  }).onConflictDoNothing();   // idempotent — re-delivery is safe
}

export async function applyProfileUpdated(e: DomainEvent<IdentityUserProfileUpdated>, ctx: SubscriberCtx) {
  await ctx.tx.update(assigneeProjection)
    .set({
      display_name: e.payload.display_name,
      skills: e.payload.skills,
      availability_status: e.payload.availability_status,
      ooo_until: e.payload.ooo_until,
      timezone: e.payload.timezone,
      projection_built_at: new Date(),
    })
    .where(eq(assigneeProjection.user_id, e.payload.user_id));
}

export async function applyDeactivated(e: DomainEvent<IdentityUserDeactivated>, ctx: SubscriberCtx) {
  await ctx.tx.update(assigneeProjection)
    .set({ deactivated_at: new Date(), projection_built_at: new Date() })
    .where(eq(assigneeProjection.user_id, e.payload.user_id));
  // Also clean up open assignments — domain decision, not a projection concern.
  await ctx.tx.delete(taskAssignments).where(eq(taskAssignments.user_id, e.payload.user_id));
}
```

**Subscriber registration** in the manifest (excerpt):

```ts
// packages/planner/manifest.ts
backend: {
  events: {
    subscribes: [
      { event: 'identity.user.created',          eventVersion: 1,
        subscription: 'planner.assignee-projection.create',     handler: applyUserCreated },
      { event: 'identity.user.profile.updated',  eventVersion: 1,
        subscription: 'planner.assignee-projection.update',     handler: applyProfileUpdated },
      { event: 'identity.user.deactivated',      eventVersion: 1,
        subscription: 'planner.assignee-projection.deactivate', handler: applyDeactivated },
    ],
  },
},
```

**The hot-path query** uses the projection — pure in-schema:

```ts
// packages/planner/src/backend/domain/list-tasks-with-assignees.ts
export async function listTasksWithAssignees(input: ListInput): Promise<TaskWithAssigneeRow[]> {
  return db
    .select({
      task: plannerTasks,
      assignee: assigneeProjection,
    })
    .from(plannerTasks)
    .leftJoin(taskAssignments,    eq(taskAssignments.task_id, plannerTasks.id))
    .leftJoin(assigneeProjection, eq(assigneeProjection.user_id, taskAssignments.user_id))
    .where(and(
      eq(plannerTasks.tenant_id, input.tenant_id),
      inArray(plannerTasks.plan_id, accessiblePlanIds(input.session)),
    ))
    .limit(50);
  // One DB roundtrip. No identity public-API calls. Scales linearly with task count.
}
```

The Phase B `staffing.agent`'s `match_users_to_topic` primitive runs the same shape — joins `assigneeProjection` with `taskAssignments` (and the embedding indexes) to filter by skill match, with availability/workload pulled separately as atomic primitives.

#### §F.4.2 Bootstrap + backfill

Projections start empty when a module is added (or when a tenant's data is restored). Two backfill mechanisms:

**1. Initial backfill at module first-deploy.** When `planner` ships (or any new module whose subscribers join existing data), the migration includes a backfill step:

```ts
// packages/planner/src/db/migrations/0003_backfill_assignee_projection.ts
export async function up(tx: NodeTx) {
  // Replay identity events from the event log — no cross-schema read of identity tables.
  const events = await tx.execute(sql`
    SELECT id, payload FROM core.events
    WHERE event_type IN ('identity.user.created', 'identity.user.profile.updated', 'identity.user.deactivated')
    ORDER BY occurred_at
  `);
  for (const e of events.rows) {
    await applyEventToProjection(tx, e);
  }
}
```

The replay reads `core.events` (allowed — `core` is special per §1.6.2). It never touches `identity.users`. Subscribers handle the same events idempotently going forward.

**2. Reset-and-rebuild operation.** If a projection drifts (bug, dropped subscription cursor, etc.) the operator can rebuild it by:

```sql
TRUNCATE planner.assignee_projection;
DELETE FROM core.subscription_cursors WHERE subscription LIKE 'planner.assignee-projection.%';
-- Dispatcher's next tick re-delivers all events from the start.
```

Cost: O(events). Replay window must cover the active retention period (§1.6.5a — 30d default). Beyond that, fall back to the initial-backfill migration script.

#### §F.4.3 Eventual-consistency lag — measured, not assumed

The projection has lag. Concretely:

- `identity` commits the change → outbox event row written in the same tx → `pg_notify` fires on commit.
- Dispatcher's `LISTEN` loop wakes up → reads new rows from `core.events` → invokes planner's subscriber → planner tx applies the projection update and advances the cursor.

Typical p50: < 50ms. Typical p99 under normal load: < 500ms. Fallback poll guarantees max 2s lag even if NOTIFY drops.

OTel metric `bus.dispatcher.lag_ms` (§L.2) tracks this per-subscription. Operators alert at sustained > 5s.

**What the lag means in practice.** A user updates their skills at T+0; `staffing.agent` queried at T+200ms might return them with old skills. Acceptable for recommendation (the very next request will be fresh; the user can refresh). NOT acceptable for the assignment validation in Pattern B (we use sync call there).

**Decision rule:** use a projection when stale-by-seconds is acceptable; use a sync public-API call when stale-by-anything is not.

#### §F.4.4 What this pattern forbids

- ❌ `planner` SQL referencing `identity.users` or `identity.user_profile`. (Drizzle `schemaFilter` + raw-SQL CI audit catch it.)
- ❌ `planner` importing `@seta/identity/src/backend/...` — only `@seta/identity` (the public surface) and `@seta/identity/events`. (dependency-cruiser catches it.)
- ❌ `planner` writing into `identity.role_grants` or any identity table. (Drizzle schema scoping catches it.)
- ❌ `identity` knowing about `planner` at all. Identity emits events; what consumes them is none of its concern. (Architectural invariant — no import to enforce.)

#### §F.4.5 Testing pattern

The projection is testable in isolation: feed events, assert state.

```ts
// packages/planner/test/assignee-projection.test.ts
describe('assignee projection', () => {
  it('applies user.created idempotently', async () => {
    await applyUserCreated(makeEvent(USER_CREATED, { user_id: 'u1', display_name: 'Alice', ... }), ctx);
    await applyUserCreated(makeEvent(USER_CREATED, { user_id: 'u1', display_name: 'Alice', ... }), ctx);
    const rows = await db.select().from(assigneeProjection).where(eq(assigneeProjection.user_id, 'u1'));
    expect(rows).toHaveLength(1);
  });

  it('updates skills on profile.updated', async () => {
    await applyUserCreated(makeEvent(USER_CREATED, { user_id: 'u1', display_name: 'Alice', skills: [] }), ctx);
    await applyProfileUpdated(makeEvent(PROFILE_UPDATED, { user_id: 'u1', skills: ['terraform', 'k8s'] }), ctx);
    const row = await db.select().from(assigneeProjection).where(eq(assigneeProjection.user_id, 'u1')).then(r => r[0]);
    expect(row.skills).toEqual(['terraform', 'k8s']);
  });

  it('marks deactivated and cleans assignments', async () => {
    /* ... */
  });
});
```

Integration test exercises the full path: emit events via `core.emit()` in a real Postgres (testcontainers), wait for dispatcher to drain, assert projection state. No mocking; no cross-module function calls in the test.

#### §F.4.6 Generalizing — when copilot needs planner data, when timesheet needs planner data, …

The same three patterns apply to every cross-module read:

| Consumer | Producer | Pattern |
|---|---|---|
| `planner` | `identity` (display name, skills, availability) | C (projection) — hot path |
| `planner` | `identity` (assignee active check) | B (sync) — cold path, needs consistency |
| `copilot` (staffing.agent) | `identity` + `planner` | C (projection — `copilot` keeps its own `staffing_user_view`) |
| `copilot` (chat memory) | `identity` (user display name in thread sidebar) | C (small projection or join through Mastra's resource id) |
| `integrations` (Phase B sync) | `planner` (task changes to push) | A (FK + event subscription) — sync workflow consumes events and walks back to planner public API |
| `timesheet` (v1.x) | `identity` (employee info) | C (projection) — its hot path is leave-request lookups |
| `pmo` (v1.x) | `planner` + `timesheet` | C (projection — `pmo.account_rollup` denormalizes both) |
| `finance` (v1.x) | `pmo` (project burn) | C (projection) |

Every new module follows the same playbook in §F.4.1. Existing modules unaffected.

#### §F.4.7 Worked example — copilot subscribing to planner (and identity) events

`staffing.agent` (Phase B) is the canonical cross-module consumer. The §7.2.2 staffing recipe needs: user skills + availability (from `identity`), task workload signals (from `planner`), and approved leave (from `integrations` MCP). Per D15 the recipe is composed by the LLM at chat time over atomic primitives, but every candidate the recipe scores still pulls skills + availability + workload — without a projection, that would fan out into 3 cross-module function calls per candidate × N candidates — N+1 across module boundaries. Unacceptable on the hot path.

**Decision.** Pattern C — `copilot` maintains its own `staffing_user_view` projection inside `copilot.*` schema, fed by events from `identity` and `planner`. Recommender becomes one in-schema query. Pattern A for the MCP overlay (live read, no projection — it's an external system, not a peer module).

**The projection schema** lives in `copilot.*` (not `identity.*` or `planner.*`):

```ts
// packages/copilot/src/db/schema/staffing-view.ts
export const copilot = pgSchema('copilot');

export const staffingUserView = copilot.table('staffing_user_view', {
  user_id: uuid('user_id').primaryKey(),                    // bare uuid; no FK
  tenant_id: uuid('tenant_id').notNull(),
  display_name: text('display_name').notNull(),
  email: text('email').notNull(),                            // for Timesheet MCP getLeave call
  skills: text('skills').array().default([]).notNull(),
  availability_status: text('availability_status').notNull(),
  timezone: text('timezone').notNull(),
  working_hours: jsonb('working_hours').$type<{ start: string; end: string } | null>(),
  ooo_until: timestamp('ooo_until', { withTimezone: true }),
  deactivated_at: timestamp('deactivated_at', { withTimezone: true }),
  // From planner — denormalized workload signal
  open_assignment_count: integer('open_assignment_count').default(0).notNull(),
  weighted_workload_score: integer('weighted_workload_score').default(0).notNull(),  // §3.9.3
  // Bookkeeping
  identity_built_at: timestamp('identity_built_at', { withTimezone: true }),
  planner_built_at:  timestamp('planner_built_at', { withTimezone: true }),
});
```

Note: this is **distinct from** `planner.assignee_projection` (§F.4.1 Pattern C). Both projections exist because each module needs its own — `planner` joins `assignee_projection` into task lists; `copilot` joins `staffing_user_view` into recommender ranking. They are not shared; each module owns and rebuilds its own. The duplication is the price of strict isolation and is the right trade — disk is cheap, cross-schema coupling is expensive.

**The subscribers** — declared in `packages/copilot/manifest.ts`:

```ts
// packages/copilot/manifest.ts (excerpt)
backend: {
  events: {
    subscribes: [
      // identity → skills, availability, timezone, working hours, OOO
      { event: 'identity.user.created',         eventVersion: 1,
        subscription: 'copilot.staffing-view.identity.create',  handler: subs.upsertFromUserCreated },
      { event: 'identity.user.profile.updated', eventVersion: 1,
        subscription: 'copilot.staffing-view.identity.update',  handler: subs.upsertFromProfileUpdated },
      { event: 'identity.user.deactivated',     eventVersion: 1,
        subscription: 'copilot.staffing-view.identity.deact',   handler: subs.markDeactivated },

      // planner → workload signals
      { event: 'planner.task.assigned',         eventVersion: 1,
        subscription: 'copilot.staffing-view.planner.assigned', handler: subs.bumpWorkload },
      { event: 'planner.task.unassigned',       eventVersion: 1,
        subscription: 'copilot.staffing-view.planner.unassign', handler: subs.dropWorkload },
      { event: 'planner.task.review_state.changed', eventVersion: 1,
        subscription: 'copilot.staffing-view.planner.review',   handler: subs.recomputeWorkload },

      // copilot's other concerns (chat invalidation, etc.) declared elsewhere
    ],
  },
},
```

**Handler shape** — each is idempotent, in-tx, advances its own cursor:

```ts
// packages/copilot/src/backend/subscribers/staffing-view.ts
export async function upsertFromProfileUpdated(e: DomainEvent<IdentityUserProfileUpdated>, ctx: SubscriberCtx) {
  await ctx.tx.insert(staffingUserView).values({
    user_id: e.payload.user_id,
    tenant_id: e.payload.tenant_id,
    display_name: e.payload.display_name,
    email: e.payload.email,
    skills: e.payload.skills,
    availability_status: e.payload.availability_status,
    timezone: e.payload.timezone,
    working_hours: e.payload.working_hours,
    ooo_until: e.payload.ooo_until,
    deactivated_at: null,
    open_assignment_count: 0,
    weighted_workload_score: 0,
    identity_built_at: new Date(),
  }).onConflictDoUpdate({
    target: staffingUserView.user_id,
    set: {
      skills: e.payload.skills,
      availability_status: e.payload.availability_status,
      timezone: e.payload.timezone,
      working_hours: e.payload.working_hours,
      ooo_until: e.payload.ooo_until,
      identity_built_at: new Date(),
    },
  });
}

export async function bumpWorkload(e: DomainEvent<PlannerTaskAssigned>, ctx: SubscriberCtx) {
  // Cheap: increment counter + invalidate score. Full recompute is a workflow (workload-cache-refresh, §H.9).
  await ctx.tx.update(staffingUserView)
    .set({ open_assignment_count: sql`${staffingUserView.open_assignment_count} + 1`, planner_built_at: new Date() })
    .where(eq(staffingUserView.user_id, e.payload.assignee_id));
  // workload-cache-refresh workflow picks up the same event and writes the weighted score.
}
```

**The hot-path query** that the Phase B `staffing.agent`'s `match_users_to_topic` primitive runs:

```ts
// packages/copilot/src/backend/agents/staffing/match-users-to-topic.ts
export async function matchUsersToTopic(input: MatchInput): Promise<Candidate[]> {
  // Embed the topic once, then cosine-similarity against user_skill_embeddings.
  // No concept-map expansion (D15) — embedding space is the only synonym layer.
  const topicVec = await embedQuery(input.topic);

  return db.select().from(staffingUserView)
    .innerJoin(userSkillEmbeddings, eq(userSkillEmbeddings.user_id, staffingUserView.user_id))
    .where(and(
      eq(staffingUserView.tenant_id, input.tenant_id),
      isNull(staffingUserView.deactivated_at),
      sql`1 - (${userSkillEmbeddings.embedding} <=> ${topicVec}) > ${input.minScore ?? 0.6}`,
    ))
    .orderBy(staffingUserView.weighted_workload_score)
    .limit(input.maxResults);
  // ONE query. Reads only copilot.*. No identity public-API calls. No planner public-API calls.
  // Then overlay leave from Timesheet MCP (Pattern A — live external read, not a projection).
}
```

**What `copilot` does NOT do:**

```ts
// ❌ Not allowed — crosses schema, caught by raw-SQL CI audit + Drizzle schemaFilter
SELECT * FROM identity.user_profile WHERE skills @> $1;

// ❌ Not allowed — imports planner internals, caught by dependency-cruiser
import { plannerTasks } from '@seta/planner/src/db/schema';

// ❌ Allowed but discouraged on hot path — would be N+1 across module boundaries
for (const id of candidateIds) {
  const profile = await identity.getUser(id, { actingUser });   // N calls
}
```

**Lag tolerance.** `staffing.agent`'s output is a *recommendation* — stale by < 1 second is fine. (User changes their skills, immediately asks for a rec → may see one-second-old skill state. Refresh produces fresh result.) For the strict-consistency check on `planner.assignTask`, Pattern B sync call still applies (§F.4.1 example B).

**One subtle property worth calling out.** When `timesheet` ships in v1.x (per §1.6.3 worked example), it emits `timesheet.leave.approved`. `copilot`'s staffing subscriber gains *one new entry* to subscribe to `timesheet.leave.approved` and update `staffing_user_view.ooo_until` from approved leave overlapping today. **Zero changes to `identity`, `planner`, or `staffing.agent`'s tool code.** The recommender's query already filters on `ooo_until`; the data source becomes more accurate without the query shape changing. This is the cross-module-extensibility property promised in §16.7 — load-bearing because of the projection pattern.

#### §F.4.8 Worked example — `integrations` syncing outbound to MS Planner (Phase B)

External sync is the cross-module pattern with the strongest *no-cross-schema-read* constraint and the most operational complexity. The Phase B sync architecture exists to push planner state changes out to MS Planner Graph API. `integrations` must do this **without ever reading `planner.*` tables**.

**Decision.** Hybrid — Pattern A (event subscription) plus Pattern B (sync call back to planner's public API for full record load). Not Pattern C — `integrations` doesn't need a denormalized projection because each sync action is one-shot and event-triggered, not query-driven.

**Flow:**

```
T+0    planner.assignTask domain function commits — emits planner.task.assigned event
T+1    Dispatcher delivers the event to integrations' subscriber
T+2    integrations subscriber:
        - Looks up which bindings cover this task's plan (integrations.bindings, in-schema)
        - If no binding, skip
        - For each binding: enqueue a sync-push job (graphile-worker) keyed on (binding_id, task_id, event_id)
T+10   sync-push worker pulls the job:
        - Calls planner.getTask(task_id, { actingUser: SYSTEM }) — Pattern B sync read for the
          full current record (NOT replaying the event payload — the event only carries the diff;
          the truth-of-now lives in planner's tables)
        - Maps Seta task → MS Planner task (translation layer, §6.6 capability-gap handling)
        - Looks up MS Planner external_id from integrations.binding_task_map
        - PATCH https://graph.microsoft.com/v1.0/planner/tasks/{external_id}
          with If-Match: <stored ETag> for optimistic concurrency
        - On 200: update integrations.binding_task_map.last_pushed_etag + last_pushed_field_values (§6.3)
        - On 412 (etag mismatch): emit integrations.conflict.recorded event → conflict workflow handles
        - On 5xx / network: graphile-worker exponential backoff retry
```

**The subscriber** (declared in `packages/integrations/manifest.ts`):

```ts
// packages/integrations/src/backend/subscribers/planner-sync-trigger.ts
export async function enqueuePushOnTaskChange(
  e: DomainEvent<PlannerTaskAssigned | PlannerTaskUpdated | PlannerTaskCreated>,
  ctx: SubscriberCtx,
) {
  // Read integrations' OWN tables only.
  const bindings = await ctx.tx.select().from(bindings_)
    .where(and(
      eq(bindings_.tenant_id, e.payload.tenant_id),
      eq(bindings_.kind, 'ms-planner'),
      eq(bindings_.seta_plan_id, e.payload.plan_id),
      eq(bindings_.health_state, 'healthy'),
    ));

  if (bindings.length === 0) return;   // no binding — nothing to do

  for (const b of bindings) {
    // graphile-worker job — coalesced per (binding, task) within 1s to absorb burst writes
    await ctx.scheduleJob('integrations.planner-sync-push', {
      binding_id: b.id, task_id: e.payload.task_id, triggered_by_event_id: e.id,
    }, { job_key: `push:${b.id}:${e.payload.task_id}`, job_key_mode: 'replace' });
  }
}
```

**The worker** does the Pattern B sync read back to planner's public API:

```ts
// packages/integrations/src/backend/workers/planner-sync-push.ts
import { plannerPublic } from '@seta/planner';

export async function plannerSyncPushTask(payload: { binding_id: string; task_id: string; triggered_by_event_id: string }) {
  const binding = await db.select().from(bindings_).where(eq(bindings_.id, payload.binding_id)).limit(1).then(r => r[0]);
  if (!binding) return;
  if (binding.health_state !== 'healthy') return;

  // ============================================================================
  // PATTERN B: sync call back to planner's public API.
  // This is the canonical "I need the full current record, not a stale event payload."
  // Replaying the event would push the value as of T+0; the worker runs at T+10s,
  // and the task may have been updated again in that window. Always read truth-of-now.
  // The acting user is a synthetic SYSTEM identity scoped to this binding.
  // ============================================================================
  const task = await planner.getTask(payload.task_id, {
    actingUser: SYSTEM_SYNC_USER(binding.tenant_id),
  });
  if (!task) { await markTombstone(binding, payload.task_id); return; }

  // Build the outbound payload — translation layer (§6.6 capability-gap warnings here).
  const graphPayload = mapSetaToGraph(task, binding);
  const mapping = await loadOrCreateExternalMapping(binding, task);

  // Echo-suppression check: if our last_pushed_field_values matches `task` field-by-field, skip.
  // This prevents echo loops when inbound sync (Phase B) writes a value Seta then "syncs out" again.
  if (deepEqualFields(mapping.last_pushed_field_values, task)) return;

  try {
    const response = await msGraph.patch(`/planner/tasks/${mapping.external_id}`, graphPayload, {
      headers: { 'If-Match': mapping.last_pushed_etag },
    });
    await db.update(externalMappings)
      .set({
        last_pushed_etag: response.headers['etag'],
        last_pushed_field_values: pickSyncedFields(task),
        last_pushed_at: new Date(),
      })
      .where(eq(externalMappings.id, mapping.id));
  } catch (err) {
    if (err.status === 412) {
      // Conflict — Seta-wins per §6.3 but record the conflict for visibility.
      await emit({
        event_type: 'integrations.conflict.recorded', event_version: 1,
        tenant_id: binding.tenant_id,
        aggregate_type: 'integrations.binding', aggregate_id: binding.id,
        payload: { binding_id: binding.id, task_id: payload.task_id, kind: 'etag-mismatch' },
        caused_by_event_id: payload.triggered_by_event_id,
      });
      // Refresh ETag and let the conflict workflow decide if Seta still wins.
      await refreshExternalEtag(binding, mapping);
    } else if (err.status >= 500 || err.code === 'NETWORK') {
      throw err;   // graphile-worker retries with exponential backoff
    } else {
      await markBindingDegraded(binding, err);
      throw err;
    }
  }
}
```

**What `integrations` does NOT do:**

```ts
// ❌ Not allowed — cross-schema read, caught by raw-SQL CI audit
SELECT * FROM planner.tasks WHERE id = $1;

// ❌ Not allowed — imports planner internals, caught by dependency-cruiser
import { plannerTasks, taskAssignments } from '@seta/planner/src/db/schema';

// ❌ Not allowed — direct mutation of planner state
UPDATE planner.tasks SET ms_planner_external_id = $1 WHERE id = $2;
// Instead: integrations owns its OWN binding_task_map table:
// integrations.binding_task_map (binding_id, seta_task_id, external_id, last_pushed_etag, ...)
```

**Inbound direction (MS Planner → Seta).** Symmetric. Sync poll runs as a workflow:
1. Delta-poll Graph for changes since last delta token.
2. For each inbound change: call `planner.updateTask(...)` (Pattern B sync — NOT writing to planner tables directly).
3. `planner.updateTask` re-checks RBAC at planner's public entry (the SYSTEM user scoped to the binding has the right permissions), runs the domain logic, emits `planner.task.updated` event.
4. The subscriber from `enqueuePushOnTaskChange` above sees the new event — and uses echo-suppression (the `deepEqualFields(mapping.last_pushed_field_values, task)` check) to avoid pushing the change back out. This is why the field snapshot exists (§6.3 conflict-resolution decision).

**Why this works without a projection.** Sync events are infrequent (~one per task change per binding) and each event is a discrete unit of work. The cost of an extra in-process function call per event is negligible vs the cost of MS Graph network round-trips. Projection would just be cached staleness — the public-API call is the right primitive here.

**What the architecture prevents.** A bug in the sync worker that tries to "fix" a planner task by directly UPDATEing `planner.tasks` would:
- Fail at CI (raw-SQL audit catches `UPDATE planner.tasks`).
- Fail at type-check (Drizzle `schemaFilter: ['integrations']` means `plannerTasks` isn't importable from integrations' Drizzle client).
- Fail at lint (dependency-cruiser blocks `import @seta/planner/src/backend/...`).

Three guardrails. Caught before merge, every time.

---

## §G. Session + auth flow

§1.6.11 + §17.4 fixed ownership. Concrete wiring:

### §G.1 Login flow (Phase A: local password only)

```
┌────────────┐                  ┌──────────────┐                ┌──────────────┐
│ Browser    │                  │ Hono app     │                │ Postgres     │
└─────┬──────┘                  └──────┬───────┘                └──────┬───────┘
      │                                │                               │
      │  GET /                         │                               │
      ├──────────────────────────────► │                               │
      │  302 → /login (no cookie)      │                               │
      │ ◄──────────────────────────────┤                               │
      │                                │                               │
      │  POST /api/identity/v1/auth/sign-in/email                      │
      │    { email, password }         │                               │
      ├──────────────────────────────► │                               │
      │                                │  betterAuth.signIn ────────►  │
      │                                │  ├── verify argon2id          │
      │                                │  ├── progressive backoff check│
      │                                │  ├── HIBP (Phase B)           │
      │                                │  └── INSERT identity.session  │
      │                                │ ◄────────────────────────────│
      │  Set-Cookie: better-auth.session  + refresh                   │
      │ ◄──────────────────────────────┤                               │
      │                                │                               │
      │  GET /                         │                               │
      ├──────────────────────────────► │                               │
      │                                │  sessionMiddleware:           │
      │                                │   1. betterAuth.api.getSession│
      │                                │   2. buildSessionScope (cache)│
      │                                │   3. attach req.user          │
      │                                │                               │
      │  200 + index.html              │                               │
      │ ◄──────────────────────────────┤                               │
```

### §G.2 `sessionMiddleware` (in `core`)

```ts
// packages/core/src/middleware/session.ts
import { auth } from '@seta/identity/auth';   // exported by identity, betterAuth instance

export const sessionMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'unauthenticated' }, 401);
    return c.redirect('/login');
  }

  const scope = await getSessionScope(session.session.id, session.user.id);
  c.set('user', {
    id: session.user.id,
    tenant_id: scope.tenant_id,
    session_id: session.session.id,
    email: session.user.email,
    role_summary: scope.role_summary,
    role_summary_hash: scope.role_summary_hash,
    accessible_group_ids: scope.accessible_group_ids,
    cross_tenant_read: scope.cross_tenant_read,
  });
  await next();
});
```

### §G.3 Session scope cache (§7.1e wired)

```ts
// packages/core/src/session/scope.ts
const hot = new LRU<string, SessionScope>({ max: 50_000, ttl: 1000 * 60 * 15 });

export async function getSessionScope(sessionId: string, userId: string): Promise<SessionScope> {
  const hit = hot.get(sessionId);
  if (hit && !hit.invalidated_at) return hit;

  // Try durable layer
  const cached = await db.select().from(sessionScopeCache).where(eq(sessionScopeCache.session_id, sessionId)).limit(1);
  if (cached.length && !cached[0].invalidated_at) {
    hot.set(sessionId, cached[0]);
    return cached[0];
  }

  // Build fresh
  const scope = await buildSessionScope(userId);
  await db.insert(sessionScopeCache).values({ session_id: sessionId, ...scope })
    .onConflictDoUpdate({ target: sessionScopeCache.session_id, set: { ...scope, invalidated_at: null, built_at: new Date() } });
  hot.set(sessionId, scope);
  return scope;
}

async function buildSessionScope(userId: string): Promise<SessionScope> {
  // Pulls role_grants from identity (in-process, in the same DB — schema-per-module: identity reads its own tables).
  const grants = await identity.listRoleGrants(userId);
  const groups = computeAccessibleGroups(grants);                // tenant-scoped + group-scoped union
  return {
    tenant_id: grants.tenant_id,
    user_id: userId,
    role_summary: rollup(grants),
    role_summary_hash: hashRoleSummary(rollup(grants)),
    accessible_group_ids: groups,
    cross_tenant_read: grants.some(g => g.role_slug === 'org.viewer'),
    built_at: new Date(),
  };
}
```

### §G.4 Cache invalidation (§7.1f `session-cache-invalidate` workflow)

Subscriber registered by `core`:

```ts
reg.subscribers([
  { event: 'identity.role_grant.changed', eventVersion: 1, subscription: 'core.session-invalidate-by-grant',
    handler: async (e) => invalidateUserSessions(e.payload.user_id) },
  { event: 'identity.user.deactivated', eventVersion: 1, subscription: 'core.session-invalidate-by-deactivation',
    handler: async (e) => invalidateUserSessions(e.payload.user_id) },
  { event: 'identity.user.profile.updated', eventVersion: 1, subscription: 'core.session-invalidate-by-profile',
    handler: async (e) => invalidateUserSessions(e.payload.user_id) },
]);

async function invalidateUserSessions(userId: string) {
  // Mark durable layer invalidated.
  await db.update(sessionScopeCache).set({ invalidated_at: new Date() }).where(eq(sessionScopeCache.user_id, userId));
  // Drop hot layer. (Process-local; other replicas will check durable layer on next request.)
  for (const [k, v] of hot.entries()) if (v.user_id === userId) hot.delete(k);
  // Drop per-session Mastra Agent instances tied to this user.
  evictAgentsByUser(userId);
}
```

Across horizontal replicas, the durable layer (`core.session_scope_cache.invalidated_at`) is the source of truth — replica B's hot cache may still hold a stale copy, but on next request the middleware compares `hot.invalidated_at` vs durable layer and refreshes. Eventually consistent within milliseconds of the event.

### §G.5 Tenant context propagation

Phase A (single host): tenant_id is resolved entirely from `role_grants` (a user belongs to exactly one tenant). No subdomain routing.

Phase B (v1.x per-tenant subdomains, deferred): `tenant_id` resolved from subdomain at the edge (CloudFront / ALB) → injected as `x-seta-tenant-id` header → validated against the user's grants in `sessionMiddleware` → mismatch = 403.

---

## §H. Copilot deep-dive

The architectural meat. §7.1b–§7.1f + §16 + §18 made the decisions; this section wires them.

### §H.1 Agent topology + turn lifecycle

**Single-domain rule.** Each agent owns one domain and targets ≤ ~15 tools. Tool schemas are serialized into the system prompt, so an agent that grows past that range bloats the prompt, weakens provider prompt-cache hit rate, and degrades the model's tool selection. When a domain genuinely needs more surface, split into a new specialist and let the router delegate — don't keep stapling. Soft cap, reviewer-enforced; no lint.

**Phase A agents (post D8 compression — staffing.agent deferred to Phase B):**

- **`router`** (Supervisor) — no domain tools. Holds delegation hooks. Phase A prompt: "You are the Seta Copilot's router. You receive a user question. Identify which specialist should handle it and delegate. Specialists: `planner.agent` for tasks/plans/groups." Phase B prompt adds `staffing.agent` for reviewer recommendations + availability + leave queries.
- **`planner.agent`** — single-domain agent owned by `packages/planner/src/backend/copilot/agents/planner.agent.ts`. Tools: `listMyAccessibleGroups`, `listTasks`, `searchTasksSemantic`, `getTask`, `createTask` (HITL), `updateTask` (HITL), `assignTask` (HITL), `addSkillTag` (HITL), `toggleReviewState` (HITL).
- **`staffing.agent` (Phase B target shape — described below for architectural completeness, not shipped in Phase A).** Cross-module agent owned by `packages/copilot/src/backend/agents/staffing.agent.ts`. Tools: `recommendReviewers` (monolithic per §16.5), `findUsersBySkill`, `computeWorkload`, `getLeaveOverlap`. Pulls from `identity` (skills), `planner` (assignment data via the local `assignee_projection`), `integrations` (Timesheet MCP). Described in §F.4 + §H.4 because the cross-module projection pattern it uses is the canonical example, and Phase B will need the design ready.

**Turn lifecycle (router → specialist → tool → response):**

```
1. Client POSTs /api/copilot/v1/chat/router with { message, threadId }.
2. sessionMiddleware attaches req.user.
3. Mastra adapter resolves Agent via getAgentForSession('router', session).
   - cache hit: existing Agent instance with role-filtered tool list.
4. router runs, identifies delegation target (e.g., planner.agent).
   - onDelegationStart hook emits 'copilot.delegate' event (audit-shaped, per D6)
     with payload.actor={type:'user',user_id}, payload.after={target:'planner.agent'}.
5. getAgentForSession('planner', session) → filtered toolset.
6. planner.agent composes tool calls. For each:
   - read tool: execute immediately, emit 'tool.invoked' event (audit-shaped), return result.
   - write tool: needsApproval=true → stream pauses with input-available;
     assistant-ui renders Interactable card; user confirms → resume;
     tool handler runs inside core.emit() tx; emits planner.task.assigned
     (the same emit carries actor + before/after — no separate audit write).
7. onDelegationComplete hook returns control to router; router streams final message to client.
8. Token usage tagged with session.role_summary_hash, written to copilot.rate_limits.
```

**Streaming** is parent-only (per Mastra Supervisor model, §18). Child output flows through the supervisor's stream. One SSE stream per session = no multiplexing complexity.

### §H.2 Tool layer — the wrapping pattern

Every tool is a thin shell around a module's public-surface function. The wrapper adds: zod input validation, RBAC re-check, audit, OpenTelemetry span.

```ts
// packages/planner/src/backend/copilot/tools/assign-task.tool.ts
import { tool } from 'ai';
import { z } from 'zod';
import { assignTask as assignTaskDomain } from '../../domain/assign-task';
import { wrapTool } from '@seta/core/copilot';

export const assignTaskTool = wrapTool({
  key: 'planner.assign_task',
  description: 'Assign a task to a user.',
  inputSchema: z.object({ task_id: z.string().uuid(), assignee_id: z.string().uuid() }),
  requiredPermission: 'planner.task.assign',
  needsApproval: true,
  execute: async ({ task_id, assignee_id }, { session, tx }) => {
    // Domain function re-checks RBAC at its own public entry — §1.6.5 sync path.
    return assignTaskDomain({ task_id, assignee_id, acting_user: session, tx });
  },
});
```

`wrapTool` (in `core`):

```ts
export function wrapTool<I, O>(def: ToolDef<I, O>): Tool {
  return tool({
    description: def.description,
    inputSchema: def.inputSchema,
    needsApproval: def.needsApproval,
    execute: async (input, { context }) => {
      const session = context.session as SessionScope;
      // RBAC pre-check is redundant with per-session tool filtering (§A8) but
      // catches misconfiguration. Cheap.
      if (!hasPermission(session, def.requiredPermission)) {
        throw new ToolError('FORBIDDEN', `Missing ${def.requiredPermission}`);
      }
      const span = tracer.startSpan(`tool.${def.key}`, { attributes: { 'tool.key': def.key, 'session.user_id': session.user_id } });
      try {
        const out = await def.execute(input, { session, tx: context.tx });
        // D6 (2026-05-19): audit is unified with events. For read tools that don't
        // already emit a domain event, emit a 'copilot.tool.invoked' event carrying
        // actor + tool key + summary in the payload. Write tools' domain events
        // already carry actor/before/after — no separate emit here.
        if (!def.emitsOwnDomainEvent) {
          await emit({
            tenant_id: session.tenant_id,
            aggregate_type: 'copilot.tool',
            aggregate_id: def.key,
            event_type: 'copilot.tool.invoked',
            event_version: 1,
            payload: {
              actor: { type: 'copilot', user_id: session.user_id, agent_name: def.agentKey },
              tool_key: def.key,
              input_summary: redact(input),
            },
          });
        }
        return out;
      } finally {
        span.end();
      }
    },
  });
}
```

- **No duplicated business logic** (§15.8). The tool calls the domain function.
- **D6 unified emit.** The tool wrapper does not call a separate `auditAsync`. Write tools rely on the domain function's `emit()` to carry actor + before/after. Read tools emit a lightweight `copilot.tool.invoked` event for audit traceability.

### §H.3 RBAC + performance contract (§7.1e wired end-to-end)

**Single source of truth:** `SessionScope` built by `core` at login (§G.3), invalidated by event subscribers (§G.4), cached in-memory (LRU) and durably (`core.session_scope_cache`).

**Five surfaces consume it:**

1. **Hono request middleware** — attaches `req.user = SessionScope` to every request.
2. **Per-session Agent factory** (§A8) — filters tool list by `requiredPermission`. Role-shaped tool registry.
3. **`wrapTool` execute** — redundant RBAC check (defense in depth).
4. **Domain functions** (`planner.assignTask`, etc.) — re-check at the module's public entry point (§1.6.5 rule).
5. **SQL-side filter** — every domain query carries `tenant_id` + `accessible_group_ids` IN clause. `planner.listTasks` query:
   ```sql
   SELECT * FROM planner.tasks
   WHERE tenant_id = $1
     AND plan_id IN (SELECT id FROM planner.plans WHERE group_id = ANY($2))
     AND deleted_at IS NULL
   ORDER BY updated_at DESC LIMIT 50;
   ```
   `$1 = session.tenant_id`, `$2 = session.accessible_group_ids`. No application-side filtering of result rows.

**Cache-friendly system prompt.** Because `getAgentForSession(key, session)` instantiates a fresh Agent per `(agentKey, role_summary_hash)`, two sessions with identical role shape produce identical system prompts → provider prompt cache (OpenAI / Anthropic) hits. Per-user state (name, recent thread) flows in `messages`, not the system prompt.

**End-to-end:** login → `buildSessionScope` (~30ms first call, ~0ms cached) → first chat request → `getAgentForSession('router', scope)` (~1ms cache miss to build Agent; ~0ms hit) → Mastra streams → tool call → `assignTask` → audit-async → done. p95 RBAC overhead for a chat turn: < 5ms (cache hit) / < 50ms (cold session).

### §H.4 Staffing primitives — atomic tools, agent composes (Phase B)

Per D15 there is no `recommend_reviewers` macro tool. The staffing recommendation flow is the §7.2.2 composition recipe; the agent calls atomic primitives at chat time and applies the availability policy itself. The Phase B `staffing.agent` exposes the cross-module read primitives; ranking and merging happen in the LLM turn, not inside a tool.

```ts
// packages/copilot/src/backend/agents/staffing/tools/index.ts (Phase B)
export const matchUsersToTopicTool = wrapTool({
  key: 'staffing.match_users_to_topic',
  description: 'Return users whose declared skills or task history match a topic, with raw match scores. No workload or availability filter applied — agent composes those separately.',
  inputSchema: z.object({
    topic: z.string().min(1),
    group_ids: z.array(z.string().uuid()).optional(),   // defaults to session.accessible_group_ids
    scope: z.enum(['accessible', 'tenant']).default('accessible'),
    top_k: z.number().int().min(1).max(50).default(20),
  }),
  requiredPermission: 'staffing.read',
  needsApproval: false,
  execute: async (input, { session }) => {
    const scope = input.scope === 'tenant' && session.cross_tenant_read
      ? null
      : (input.group_ids ?? session.accessible_group_ids);

    // Two signals combined per §3.9.1:
    //   1. Declared-skill embedding match against identity.user_skill_embeddings
    //   2. History inference — embedding match against the user's recent task embeddings
    // Both run via the embed-then-cosine path; merge by max(declared, history).
    const declared = await matchDeclaredSkillsByEmbedding(session.tenant_id, input.topic, scope, input.top_k);
    const history  = await matchHistoryByEmbedding(session.tenant_id, input.topic, scope, input.top_k);
    return mergeBySource(declared, history).slice(0, input.top_k);
  },
});

export const inferUserSkillsFromHistoryTool = wrapTool({
  key: 'staffing.infer_user_skills_from_history',
  description: 'Recency-weighted topic extraction over a user\'s assignment history.',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    top_k: z.number().int().min(1).max(20).default(10),
    recency_window: z.enum(['30d', '90d', '180d', '365d']).default('180d'),
  }),
  requiredPermission: 'staffing.read',
  needsApproval: false,
  execute: async (input) => {
    // Pull user's recent task assignments → for each, retrieve task embedding + title+description
    // → cluster topics → return top-k with evidence task ids and last_used dates.
    return inferSkillsFromHistory(input.user_id, input.top_k, input.recency_window);
  },
});

export const getUserAvailabilityTool = wrapTool({
  key: 'staffing.get_user_availability',
  description: 'Self-declared availability fields. No leave overlay or workload computation — those are separate primitives.',
  inputSchema: z.object({ user_id: z.string().uuid() }),
  requiredPermission: 'staffing.read',
  needsApproval: false,
  execute: async (input) => {
    // Reads from copilot.staffing_user_view (the projection per §F.4.7).
    return readAvailability(input.user_id);
  },
});

export const computeWorkloadTool = wrapTool({
  key: 'staffing.compute_workload',
  description: 'Weighted workload score per §3.9.3. Returns raw score and per-factor breakdown — no threshold applied.',
  inputSchema: z.object({ user_id: z.string().uuid() }),
  requiredPermission: 'staffing.read',
  needsApproval: false,
  execute: async (input) => {
    return computeWeightedWorkload(input.user_id);  // priority × due × progress, tenant-configurable weights
  },
});

export const getLeaveOverlapTool = wrapTool({
  key: 'staffing.get_leave_overlap',
  description: 'Timesheet MCP call for approved leave in a date range. Returns degraded:true on MCP failure (§7.1d graceful degradation).',
  inputSchema: z.object({
    user_id: z.string().uuid(),
    start: z.string().datetime(),
    end:   z.string().datetime(),
  }),
  requiredPermission: 'staffing.read',
  needsApproval: false,
  execute: async (input, { session }) => {
    return getLeaveOverlay(session.tenant_id, input.user_id, input.start, input.end);
  },
});
```

The `infer_task_topics` primitive lives in `planner.agent` (it's about task content), not `staffing.agent`:

```ts
// packages/copilot/src/backend/agents/planner/tools/infer-task-topics.tool.ts
export const inferTaskTopicsTool = wrapTool({
  key: 'planner.infer_task_topics',
  description: 'Aggregate topics from a task\'s title+description via embedding similarity against similar-tagged tasks. Used by the agent when reasoning about an untagged task AND by the new-task-skill-tag-suggester workflow — same code path.',
  inputSchema: z.object({
    task_id: z.string().uuid().optional(),
    content: z.string().optional(),
    top_k:   z.number().int().min(1).max(10).default(5),
  }),
  requiredPermission: 'planner.task.read',
  needsApproval: false,
  execute: async (input, { session }) => {
    const content = input.task_id
      ? await readTaskContent(session.tenant_id, input.task_id)
      : input.content!;
    return inferTopics(content, session.tenant_id, input.top_k);
  },
});
```

**Embedding-based matching is the v1 default** (per §3.9.1, ADR D15). There is no concept-map fallback and no `resolveSkills` indirection layer — embedding cosine similarity over `identity.user_skill_embeddings` and `planner.task_embeddings` is the matching path. The old `conceptSkillRetriever` from earlier drafts has been removed; only `semanticTaskRetriever` and `semanticSkillRetriever` remain.

**Retriever interface (§7.1c) — unchanged shape.**

```ts
export interface Retriever<Q, R> {
  retrieve(tenantId: string, query: Q, opts?: { limit?: number; minScore?: number }): Promise<R[]>;
}
export const semanticTaskRetriever: Retriever<string, TaskMatch> = { /* v1 */ };
export const semanticSkillRetriever: Retriever<string, SkillMatch> = { /* v1 — embedding similarity over user_skill_embeddings */ };
```

When v1.x adds calendar / Slack-presence retrievers, only the new retriever instances are added — neither primitive signatures nor agent composition recipes change.

### §H.5 Chat memory + GDPR erasure

- **Storage:** Mastra's `PostgresStore({ schemaName: 'copilot' })` owns `mastra_threads` + `mastra_messages`. Per-user threads keyed on `resourceId = user.id`.
- **Working memory summarization:** Mastra's built-in working-memory trigger fires when thread exceeds 16k tokens; summary replaces oldest messages while preserving last 8 turns. Configured in agent definition (`memory: { workingMemory: { template: '...', maxTokens: 16000 } }`).
- **GDPR erasure (§7.4, §10.1):** `copilot.deleteThread(threadId)` → cascading delete of `mastra_messages` for the thread; thread row tombstoned. User-wide erasure (DSR): `copilot.eraseUserThreads(userId)` iterates threads and calls `deleteThread`. Bulk path runs as a workflow.
- **Per-user export:** `copilot.exportUserThreads(userId)` streams threads + messages as NDJSON to S3, signed URL returned to DSR admin.

### §H.6 Streaming transport

- **Server:** `chatRoute()` returns `createUIMessageStreamResponse(stream)`. Tool calls flow as `tool-{toolKey}` parts in the AI SDK v6 protocol; HITL pauses surface as `input-available` states held by assistant-ui Interactables until user resolves.
- **SSE multiplexing:** Phase A has *one* SSE stream type per session (chat). Phase B adds the Kanban board's real-time updates (§5.2). The board uses a *separate* SSE endpoint (`/api/planner/v1/board/:planId/stream`) — not multiplexed onto chat. Rationale: chat stream is bursty + per-user; board stream is steady + per-plan; multiplexing would force shared backpressure semantics. Both endpoints share the same `LISTEN/NOTIFY` source feeding their respective subscribers — that's where the integration lives, not at the HTTP layer.

### §H.7 Retriever interface

Defined in §H.4. Single interface, multiple implementations, swap in place without changing agent prompts or tool signatures. v1: semantic retrievers for both skills (`semanticSkillRetriever` over `identity.user_skill_embeddings`) and tasks (`semanticTaskRetriever` over `planner.task_embeddings`). v1.x candidates: calendar retriever, presence retriever, history-weighted skill retriever variants.

### §H.8 MCP integration architecture (Timesheet)

**Per-tenant config:** `integrations.mcp_clients` row per `(tenant_id, kind)`. Credentials in AWS Secrets Manager; row holds only the Secret ARN.

**Mastra MCP client wrapping:**

```ts
// packages/integrations/src/backend/mcp/timesheet-client.ts
import { MCPClient } from '@mastra/mcp';

export async function getTimesheetClient(tenantId: string): Promise<MCPClient | null> {
  const cfg = await db.select().from(mcpClients).where(and(eq(mcpClients.tenant_id, tenantId), eq(mcpClients.kind, 'timesheet'))).limit(1);
  if (!cfg.length) return null;
  const creds = await secrets.getSecretValue(cfg[0].credentials_secret_arn);
  return new MCPClient({ endpoint: cfg[0].endpoint_url, credentials: creds, timeoutMs: 500 });
}

// Public surface — wraps for graceful degradation.
export async function getLeaveOverlay(tenantId: string, userEmails: string[], dateRange: DateRange): Promise<LeaveOverlay> {
  const client = await getTimesheetClient(tenantId);
  if (!client) return { source: 'none', leave: [] };

  try {
    const result = await Promise.race([
      client.callTool('getLeave', { userEmails, dateRange }),
      timeout(500),                  // §7.1d hard 500ms
    ]);
    await updateHealth(tenantId, 'healthy');
    await emitMcpInvoked(tenantId, 'timesheet', 'getLeave', { count: userEmails.length });
    return { source: 'mcp', leave: result.leave };
  } catch (err) {
    await updateHealth(tenantId, 'degraded', err.message);
    return { source: 'none', leave: [], degraded: true };
  }
}
```

- **Phase A note (D8):** Timesheet MCP integration is deferred to Phase B; the §H.8 code above is the target shape, not the Phase A delivery.
- **Degradation:** Timesheet MCP failure → `getLeaveOverlay` returns `degraded: true`; the agent surfaces "Timesheet check skipped" in its rationale when composing the §7.2.2 staffing recipe.
- **Audit attribution:** `integrations.mcp.timesheet.invoked` event written with `payload.actor = { type:'copilot', user_id: <chat session's user> }` (per D6 audit-unified shape). The call is on the user's behalf.
- **Encryption at rest:** credentials in Secrets Manager with KMS encryption (managed key in Phase A, customer-managed CMK as v1.x option per §10.3 hook).
- **Generic MCP-consumer pattern:** when v1.x adds calendar / HRIS MCPs, `getTimesheetClient` → `getMCPClient(tenantId, kind)` with the same signature; per-MCP wrapper functions handle the tool-specific call shape.

### §H.9 System workflows — concrete step graphs (Phase A, post D7/D8)

| Workflow | Trigger | Steps | Durable state | Idempotency key |
|---|---|---|---|---|
| `session-cache-invalidate` | events `identity.role_grant.changed`, `identity.user.deactivated`, `identity.user.profile.updated` | 1. Mark `core.session_scope_cache.invalidated_at`. 2. Send in-process eviction signal. 3. Evict per-session Agents (§A8). | None. | `(user_id, event_id)` |
| `embeddings-keep-fresh` | events `planner.task.created`, `planner.task.updated`, `planner.plan.created`, `identity.user.profile.updated` | 1. Compute `source_hash`. 2. If hash unchanged, skip. 3. Chunk if needed. 4. Enqueue graphile job with `job_key = ${entity}:${id}`. Worker pulls, calls embedding API, UPSERTs `planner.task_embeddings` / `identity.user_skill_embeddings`. | graphile-worker job table. | `(entity_type, entity_id, source_hash)` |
| `new-task-skill-tag-suggester` | event `planner.task.created` where `skill_tags = []` | Thin glue: 1. Call `inferTaskTopics({ task_id })` — the same atomic primitive (§H.4) the agent uses for untagged-task reasoning. 2. Post HITL card to creator's chat with the suggested tags. | Mastra snapshot. | `task_id` |

**Deferred from earlier draft (architect review 2026-05-19; refined per D15):**
- `audit-flush` removed (D6) — audit is now part of `core.emit()` inside the state-changing transaction; no in-memory queue, no separate batch drain.
- `workload-cache-refresh` (D7) — compute live via the `compute_workload` primitive; only re-introduce if measured latency demands it.
- `leave-overlap-warning` (D7 + D8) — depends on Timesheet MCP + `staffing.agent`; Phase B.
- `stale-review-detector` (D15) — dropped. Only fires for tasks with `review_state = 'needs_review'` explicitly set; since `review_state` is an optional refinement (default null per §5.3), this subscriber would be mostly idle. A v1.x replacement is a generic `stale-task-detector` (any task whose `updated_at` is past N days) — universal, no dependence on optional fields.

**Runtime story.** v1 single-process: all workflows run inside the one Hono container. Mastra Workflow runtime + graphile-worker share the process. Per-tenant isolation is logical (queries filter on `tenant_id`); no process-level isolation.

**Cron triggers.** graphile-worker's `taskList` includes a `mastra-workflow-trigger` task; cron entries invoke it with `{ workflow_name, input }`; the task calls `mastra.getWorkflow(name).createRun().start(input)`.

### §H.10 Chatflow turn lifecycle — login → boot → first turn

```
T+0     Browser: GET / → 302 /login
T+1s    User: POST /api/identity/v1/auth/sign-in/email
T+1.1s  better-auth: argon2id verify, INSERT session row, set cookie
T+1.2s  Browser: GET /
T+1.3s  sessionMiddleware: betterAuth.getSession (~5ms);
          getSessionScope (~30ms first time, builds from role_grants);
          attach req.user
T+1.4s  Server: 200 + index.html
T+1.5s  Browser: SPA boot, hydrate, render Standalone Copilot.
        Browser: GET /api/copilot/v1/threads → list user threads
        Browser: POST /api/copilot/v1/threads → new thread (if none)
T+2s    User types: "Find tasks needing review on terraform."
T+2.1s  Browser: POST /api/copilot/v1/chat/router (assistant-ui Transport sends)
T+2.15s sessionMiddleware: hot cache hit, ~1ms
T+2.16s Mastra adapter resolves Agent: getAgentForSession('router', scope) → cache miss
          → build Agent with router config + filtered tools (none — router has no tools) → ~1ms
          → store in agent cache
T+2.17s router agent runs; first LLM call streamed to client (SSE opens)
T+3s    router emits delegation tool call: delegate_to=planner.agent
T+3.05s getAgentForSession('planner', scope) → cache miss → build Agent
          with planner config + filtered tools (per role) → ~2ms
T+3.06s planner.agent runs; LLM composes the §7.2.2 recipe:
          → list_my_accessible_groups()                                                // local DB, ~5ms
          → parallel (both fire, both may return empty — both are expected):
              list_tasks({ review_state: 'needs_review' })                             // ~10ms; often empty
              search_tasks_semantic({ query: 'terraform review needed' })              // ~30ms (vector)
          → LLM filter pass over union: judges "needs review?" + "about terraform?"    // ~400ms (small model)
            from each candidate's title + description; signals include "PTAL",
            "ready for review", "@x please check", bucket name, label, checklist state.
T+3.5s  Results merged + ranked (explicit review_state pinned > LLM confidence > recency);
          planner.agent streams natural-language summary back through router.
T+4s    Client renders ranked cards; SSE closes.
        Audit-shaped events already in core.events from inside each emit() tx (D6): copilot.delegate, copilot.tool.invoked × N.
        copilot.rate_limits incremented for the turn (token usage from Mastra response).
```

Subsequent turns in the same thread: cached SessionScope, cached Agents — ~2ms middleware overhead before the first LLM token.

---

## §I. Embeddings CDC pipeline

§7.1c required <60s lag. Pipeline shape:

```
planner.task.created event
       │
       ▼
embed subscriber (in copilot, registered at boot)
       │
       │ 1. compute source_hash from (title, description, skill_tags)
       │ 2. lookup planner.task_chunks WHERE task_id=$1 ORDER BY chunk_index
       │ 3. if hashes match → skip (no-op)
       │ 4. else → graphile job enqueue with job_key = `task:${id}`
       │           payload: { task_id, tenant_id, content_to_embed }
       ▼
graphile-worker pool (EMBED_WORKER_CONCURRENCY=5)
       │
       │ 5. take semaphore (EMBED_PROVIDER_RPM_CAP=2400)
       │ 6. call OpenAI text-embedding-3-small (1536d)
       │ 7. UPSERT planner.task_chunks + planner.task_embeddings in one tx
       │ 8. release semaphore
       │ 9. metric copilot.embed.queue.depth, copilot.embed.latency
```

Re-embed triggers:
- `planner.task.updated` (title or description changed)
- `planner.task.review_state.changed` (skill_tags often correlate)
- `identity.user.profile.updated` (skills changed → re-embed `user_skill_embeddings`)
- Daily `embedding-quality-canary` (Phase C only).

**Sub-60s lag target.** Worst case: event written → notify dropped → 2s fallback poll → job enqueued → worker pulls (≤100ms) → API call (≤2s) → UPSERT (≤50ms). Typical: < 1s end-to-end. The <60s budget gives generous headroom for OpenAI hiccups.

---

## §J. Frontend shell + Standalone Copilot module (Phase A)

### §J.1 Shell

`apps/web/src/shell` owns the chrome around every module. See §J.5–§J.9 for the full component inventory, layer model, and contribution APIs.

Quick summary:
- Top nav (logo, app launcher, global search, notifications bell [Phase B], user menu).
- App launcher (Google-style grid) — module-contributed tiles (§9.3 of `rbac-and-screens.md`).
- Sidebar slot — owned by the active app; shell provides the frame.
- Main content slot — flexible region for the active app's pages.
- Copilot panel slot — Phase B embedded drawer; Phase A's Copilot is standalone (no panel).
- Notification center — Phase B+; shell-owned UI, module-emitted notifications.
- Global command palette (`cmdk`, `Cmd+K`) — module-contributed commands.
- Providers: SessionProvider, TenantContextProvider, ThemeProvider, HotkeysProvider, ToastRoot, ModalRoot.

### §J.2 Standalone Copilot module (the only Phase A UI surface besides login/profile/admin)

```
apps/web/src/modules/copilot/
├── pages/
│   ├── ChatPage.tsx          # Sidebar (threads) + main pane (assistant-ui Thread)
│   ├── WorkflowsPage.tsx     # Inbox-style list of recent workflow runs (role-scoped)
│   └── WorkflowRunDrillDown.tsx
├── components/
│   ├── AgentSelector.tsx     # Supervisor (default) + specialists (gated copilot.contributor+)
│   ├── ThreadSidebar.tsx
│   ├── HitlCard.tsx          # assistant-ui Interactable surface for needsApproval tools
│   └── RecommendReviewersCard.tsx   # custom result card for staffing.agent output
├── hooks/
│   └── useCopilotRuntime.ts  # useChatRuntime + AssistantChatTransport per selected agent
└── api/
    └── client.ts             # fetch wrappers for /api/copilot/v1/* (threads CRUD, workflow list)
```

`useCopilotRuntime`:

```ts
export function useCopilotRuntime(selectedAgent: AgentKey) {
  return useChatRuntime({
    transport: new AssistantChatTransport({
      api: `/api/copilot/v1/chat/${selectedAgent}`,
      credentials: 'include',
    }),
    threadId: useCurrentThreadId(),
  });
}
```

### §J.3 Phase A admin / settings screens (bare-bones)

Per §14.1:
- `apps/web/src/modules/identity/pages/Login.tsx`, `PasswordReset.tsx`, `EmailVerify.tsx`, `Settings.tsx` (profile incl. skills/availability).
- `apps/web/src/modules/admin/pages/TenantUsers.tsx` (org.admin only — list, invite, role grant).
- `apps/web/src/modules/admin/pages/SuperTenants.tsx` (superadmin only — list, create, designate admin).
- `apps/web/src/modules/integrations/pages/TimesheetMcpConfig.tsx` (org.admin only).

### §J.4 Frontend boundary discipline

§19.1 defers boundary enforcement to `eslint-plugin-boundaries` inside `apps/web/.eslintrc.cjs`. Config:

```js
// apps/web/.eslintrc.cjs (boundaries section)
{
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'shell',    pattern: 'src/shell/**' },
      { type: 'module',   pattern: 'src/modules/*', mode: 'folder', capture: ['module'] },
      { type: 'lib',      pattern: 'src/lib/**' },
    ],
  },
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        { from: 'shell',   allow: ['module', 'lib'] },
        { from: 'module',  allow: ['lib'] },                        // modules don't import each other
        { from: 'module',  allow: [{ type: 'module', module: '${capture[0]}' }] }, // same module OK
        { from: 'lib',     allow: ['lib'] },
      ],
    }],
  },
}
```

### §J.5 Shell component layer model

Three layers, each with strict rules on what it can know:

```
LAYER 1 — packages/shared/ui              (knows: design tokens, nothing app-specific)
  Primitives    — Button, Input, Sheet, Dialog, Command, Toast, Avatar, Badge,
                  Dropdown, Tooltip, Tabs, Switch, Checkbox, RadioGroup, Form,
                  Label, Textarea, Popover, ScrollArea, Skeleton, Calendar,
                  DatePicker, ContextMenu, Alert, Card                                (~25 — §20)
  Composites    — CommandPalette, SidePanel, InboxList, KbdHint, EmptyState, DataTable (~6 — §20)
  Theme         — ThemeProvider, dark/light tokens, CSS-var setup

LAYER 2 — apps/web/src/shell              (knows: ShellRuntime from composed manifests, modules abstractly)
  Frame         — AppShell, TopBar, Sidebar frame, MainContent, CopilotPanelSlot
  Chrome widgets— AppLauncher, GlobalSearchButton, NotificationBell, UserMenu, HelpMenu
  Providers     — SessionProvider, TenantContextProvider, HotkeysProvider,
                  ToastRoot, ModalRoot, ErrorBoundary, RouteGuard
  Hooks         — useVisibleApps, useMenuItems, useCommands, useHotkeys,
                  useActionRegistry, useNotificationRenderer  (§J.7)

LAYER 3 — apps/web/src/modules/<module>/  (knows: its own domain)
  Pages         — Module's screens (e.g., copilot/ChatPage)
  Components    — Module-internal composites (ThreadSidebar, HitlCard, AgentSelector)
  Contributions — Declared in packages/<module>/manifest.ts (§C.3) as data — picked up
                  by Layer 2 widgets via the composed ShellRuntime. No imperative
                  registration calls.
```

**Rule:** Layer N may only depend on Layer N-1 or N (never N+1). Layer 1 has no concept of modules. Layer 2 reads `ShellRuntime` abstractly — it never imports a specific module. Layer 3 is the only place module-specific UI lives.

The frontend contributions each module declares via the `ContributionRegistry`'s `app()` / `commands()` / `hotkeys()` / `menuItems()` / `actions()` methods (§C.1). The shell consumes the accumulated registry via `buildShell(reg, session)` returning a `ShellRuntime`. Same registry interface backend/frontend; one `register.ts` per module describes both halves.

### §J.6 Component inventory by phase

#### §J.6.1 Phase A (must ship)

**Shell frame & providers (Layer 2):**

| Component | File | Purpose | Notes |
|---|---|---|---|
| `AppShell` | `shell/layout/AppShell.tsx` | Outer wrapper: TopBar + Sidebar slot + MainContent + overlays | Single instance, mounted by root router |
| `TopBar` | `shell/layout/TopBar.tsx` | Sticky header — logo, app launcher button, command-palette trigger, user menu | 56px height (per DESIGN.md) |
| `MainContent` | `shell/layout/MainContent.tsx` | Flexible slot the active app's route fills via TanStack Router `<Outlet/>` | |
| `SidebarSlot` | `shell/layout/SidebarSlot.tsx` | Renders the active app's sidebar contribution (if any) — Phase A only Copilot contributes | Hidden when contribution is null |
| `RouteGuard` | `shell/auth/RouteGuard.tsx` | `beforeLoad` integration; redirects to `/login` or `/403` | Per §7.4 of `rbac-and-screens.md` |
| `ErrorBoundary` | `shell/errors/ErrorBoundary.tsx` | Catches render errors per-app; falls back to ErrorState | |
| `NotFoundPage`, `ForbiddenPage` (A12), `ServerErrorPage` | `shell/errors/` | 404/403/500 | |

**Chrome widgets (Layer 2):**

| Component | File | Purpose | Notes |
|---|---|---|---|
| `AppLauncher` | `shell/launcher/AppLauncher.tsx` | 3×3 dot button + popover grid of `AppTile`s | Uses `useRegisteredApps()` |
| `AppTile` | `shell/launcher/AppTile.tsx` | Icon + label tile inside the launcher grid | |
| `GlobalSearchButton` | `shell/search/GlobalSearchButton.tsx` | Cmd+K trigger button (search icon + "⌘K" hint) | Opens `CommandPalette` |
| `CommandPalette` | (from `shared/ui` composites) | Cmd+K modal with module-contributed commands | `useCommandRegistry()` populates it |
| `UserMenu` | `shell/user/UserMenu.tsx` | Avatar dropdown — Profile / Settings / Your access / Sign out + module-contributed items | Uses `useUserMenuItems()` |
| `UserMenuAccessSection` | `shell/user/UserMenuAccessSection.tsx` | "Your access" list grouped by module (per `rbac-and-screens.md §9.4`) | |
| `AdminMenu` | `shell/user/AdminMenu.tsx` | Nested submenu of admin destinations (Tenant users, Integrations, Tenant settings) | Visible only when user has admin role in any module |
| `SuperadminBadge` | `shell/user/SuperadminBadge.tsx` | Pill in TopBar indicating superadmin mode | Tiny — superadmin sees an obviously-different chrome |

**Providers (Layer 2):**

| Component | Purpose |
|---|---|
| `SessionProvider` | Holds `SessionScope` from `/api/auth/me`; refreshes on focus + token expiry |
| `TenantContextProvider` | Exposes tenant info to all children (one per session — single-tenant v1) |
| `ThemeProvider` | From `shared/ui`; dark/light/system + persists choice |
| `HotkeysProvider` | `tinykeys` registry; modules register via `useHotkey()` |
| `ToastRoot` | Sonner-style toast container; `toast.success/error/info` API |
| `ModalRoot` | Portal for `Dialog` / `Sheet` / `AlertDialog` instances |
| `OfflineBanner` | Detects offline → shows persistent banner |

**Phase A apps' module-level contributions:**

| Module | App tile | Sidebar | Commands | User menu items | Notes |
|---|---|---|---|---|---|
| `copilot` | "Copilot" tile → `/copilot/chat` | `CopilotSidebar` (threads + agent selector + Workflows tab toggle) | "New thread", "Open Workflows" | — | Only Phase A app tile |
| `identity` | — | — | "Edit profile" | "Profile", "Sign out" | No tile; profile is a TopBar destination |
| `core` | — | — | "Admin: tenant users" (if `identity.admin`), "Admin: tenant settings" (if `core.tenant.write`) | "Admin" submenu (gated) | Admin destinations are AdminMenu items, not an app tile in v1 |
| `integrations` | — | — | "Configure Timesheet MCP" (if `integrations.mcp.write`) | — | Surfaces under AdminMenu |

#### §J.6.2 Phase B (extensions)

| Addition | Where | Purpose |
|---|---|---|
| `NotificationBell` + `NotificationDrawer` + `NotificationList` + `NotificationItem` | `shell/notifications/` | Top-bar bell with unread count; click → side drawer with feed |
| `NotificationProvider` | `shell/notifications/NotificationProvider.tsx` | SSE subscription to `/api/core/v1/notifications/stream`; emits events to consumers |
| `CopilotPanelSlot` | `shell/copilot/CopilotPanelSlot.tsx` | Right-side drawer (~480px); embedded `useChatRuntime` shares threads with standalone Copilot |
| `BoardSSEProvider` | shell-adjacent | Per-plan SSE for Kanban board updates (used by `planner` module) |
| `planner` app tile | `apps/web/src/modules/planner/` | "Planner" tile in launcher; routes `/planner/*` |
| `planner` sidebar | `PlannerSidebar` (groups + recent plans) | Active when user is inside `/planner/*` |
| `EmailPreferencesSection` in Profile | `modules/identity/pages/Settings/EmailPreferences.tsx` | Toggle email notification categories (@mentions, assignments, due-date approach) |

#### §J.6.3 Phase C (polish)

| Addition | Where | Purpose |
|---|---|---|
| `HelpMenu` | `shell/help/HelpMenu.tsx` | Top-bar "?" — docs, keyboard shortcuts overlay, support |
| `KeyboardShortcutsOverlay` | `shell/help/KeyboardShortcutsOverlay.tsx` | Modal listing all registered hotkeys, grouped by module |
| `CostMeter` | `shell/copilot/CostMeter.tsx` | Compact AI-cost gauge for `copilot.admin` + `org.admin` in TopBar |
| `StatusIndicator` | `shell/status/StatusIndicator.tsx` | Instance health badge (operator-visible only) |
| `TenantBadge` | `shell/tenant/TenantBadge.tsx` | Currently fixed (single-tenant); reserved slot for future multi-tenant switcher |

### §J.7 Shell contributions — see §C

Frontend contributions (apps, sidebar, menu items, commands, hotkeys, notification renderers, providers) are registered via the same imperative `ContributionRegistry` as backend contributions (§C.1). The per-module example is in §C.2.

The Layer 2 widgets defined in §J.6 (`AppLauncher`, `UserMenu`, `AdminMenu`, `CommandPalette`, `SidebarSlot`, `NotificationDrawer`, …) consume their data via hooks bound to the composed `ShellRuntime` (built by `buildShell()` in §C.3):

```ts
// apps/web/src/shell/hooks.ts
export const useShell = () => useContext(ShellRuntimeContext);

export const useVisibleApps    = () => useShell().visibleApps;
export const useMenuItems      = (placement: MenuPlacement) =>
  useShell().visibleMenuItems.filter(i => i.placement === placement);
export const useCommands       = () => useShell().visibleCommands;
export const useHotkeys        = () => useShell().hotkeys;
export const useActionRegistry = () => useShell().actions;
export const useNotificationRenderer = (eventType: string) =>
  useShell().notificationRenderers.get(eventType);
```

Widget example using the hooks:

```tsx
// apps/web/src/shell/launcher/AppLauncher.tsx
export function AppLauncher() {
  const apps = useVisibleApps();   // already filtered by session, sorted by order
  return (
    <Popover>
      <PopoverTrigger><GridIcon /></PopoverTrigger>
      <PopoverContent>
        <Grid cols={3}>{apps.map(a => <AppTile key={a.landingPath} app={a} />)}</Grid>
      </PopoverContent>
    </Popover>
  );
}
```

Adding a new contribution type follows the §C.8 playbook — extend the manifest, extend the composer, add a hook. No new registry interface, no changes to existing modules.

**Important:** the imperative `ShellContributionRegistry` and declarative `ModuleManifest` designs that appeared in earlier drafts of this section are both superseded. Use the unified `ContributionRegistry` from §C.1 exclusively (D1, 2026-05-19).

### §J.8 Notification system shape (Phase B+)

Architectural seam fixed in Phase A even though the UI ships in Phase B.

**Backend flow:**

```
1. Domain action emits an event via core.emit()
   (e.g., planner.comment.created with mentions[])

2. core.notifier subscriber consumes domain events,
   evaluates per-user notification rules (mentioned? assigned? due-soon?),
   produces core.notifications.<type> events with target_user_id payload.

3. Notification delivery subscriber:
   - writes to core.notifications table (durable, per-user inbox)
   - publishes to per-user SSE channel via pg_notify('notify:user:<id>', ...)

4. Frontend NotificationProvider subscribes to SSE,
   updates in-memory feed, increments bell badge,
   dispatches matching NotificationRenderer.
```

**`core.notifications` schema (Phase B migration):**

```sql
CREATE TABLE core.notifications (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  event_id uuid NOT NULL REFERENCES core.events(id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz
);
CREATE INDEX notifications_unread_idx ON core.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
```

**Categories (Phase B set per §5.4):** `@mention`, `assignment`, `due-date-approach`. Per-user preferences in `identity.user_profile.notification_prefs jsonb` — defaulted on per category.

**No email delivery in Phase B notifications.** Email infrastructure exists for invites + password reset only (§5.4 reaffirmed in §J.9). Email digests for notifications are a v1.x candidate.

### §J.9 Mail / email — clarification

Seta v1 has **no in-app mail or inbox feature**. Email is purely outbound transactional:

| Email | Trigger | Owner | Template |
|---|---|---|---|
| Welcome invite | Admin invites user / superadmin creates tenant admin | `identity` | `react-email` template |
| Email verification | First-time local-password sign-up | `identity` | `react-email` template |
| Password reset | User clicks "forgot password" | `identity` | `react-email` template |
| Failed-login security alert | 5 failures in 15 min per `(email, IP)` (§3.8) | `identity` | `react-email` template |

**Phase A:** all four implemented (verification + reset + security alert; invite is admin-driven from the tenant-users screen).

**Phase B:** adds `EmailPreferencesSection` to the Profile settings page — toggles for notification categories, but the *delivery* of notification emails is itself a v1.x deferral. The UI ships before the backend so preference state is durable.

**Transport:** `react-email` templates rendered server-side; SES (AWS) in production or Resend (operator option). Configured in `core.instance_config`.

**v1.x candidates** (not v1 work, but the shell APIs in §J.7 don't foreclose them):
- In-app inbox for digesting notifications threaded by entity.
- Email-out integration for outbound notifications (extends §J.8 delivery subscriber with an email leg).
- Email-in (reply to a notification email → post comment) — would require an inbound email gateway (SES inbound).
- A future `mail` module wrapping a Gmail/Outlook MCP for users who want their work email triaged by the copilot. Same module pattern as everything else; not on any roadmap today.

If "mail" in the original question meant any of those v1.x scenarios, the shell APIs (especially `apps()`, `notificationRenderers()`, `userMenuItems()`) accommodate them without restructuring. Confirm direction if relevant.

### §J.10 Phase A wire-up checklist (concrete tasks)

To go from "shell exists conceptually" to "shell ships in Phase A":

| Task | Layer | Effort |
|---|---|---|
| Implement `AppShell` + `TopBar` + `SidebarSlot` + `MainContent` | 2 | ~1 day |
| Implement `AppLauncher` + `AppTile` + `useRegisteredApps()` glue | 2 | ~0.5 day |
| Implement `UserMenu` + `UserMenuAccessSection` + `AdminMenu` | 2 | ~1 day |
| Implement Providers (`SessionProvider`, `TenantContextProvider`, `ThemeProvider`, `HotkeysProvider`, `ToastRoot`, `ModalRoot`) | 2 | ~1 day |
| Implement `RouteGuard` + 403/404/500 pages | 2 | ~0.5 day |
| Implement `GlobalSearchButton` + wire to `CommandPalette` | 2 | ~0.5 day |
| Define `ShellContributionRegistry` interface + boot-time aggregator | 2 | ~0.5 day |
| Wire `copilot` module's contributions (app tile, sidebar, commands) | 3 | ~0.5 day |
| Wire `identity`, `core`, `integrations` user-menu / admin-menu contributions | 3 | ~0.5 day |
| Server endpoint `/api/auth/me` returning `SessionScope + visibleApps + visibleCommands + visibleAdminMenu` | backend | ~0.5 day |

Total Phase A shell work: ~6 days, parallelizable across two frontend engineers.

---

## §K. Deployment topology (AWS reference)

### §K.1 Stack diagram (Phase A)

```
                ┌─────────────────┐
                │  CloudFront CDN │  (TLS, geo-block per residency, WAF)
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │      ALB        │
                └────────┬────────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
       ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
       │ Fargate │  │ Fargate │  │ Fargate │   (N tasks; Phase A: N=2 for HA)
       │  task   │  │  task   │  │  task   │
       └────┬────┘  └────┬────┘  └────┬────┘
            └────────────┼────────────┘
                         │
                ┌────────▼────────┐
                │  RDS Postgres   │  (Multi-AZ, pgvector enabled, daily snapshot)
                └─────────────────┘

                ┌─────────────────┐
                │ Secrets Manager │  (DB creds, OpenAI/Anthropic keys, MCP creds)
                └─────────────────┘

                ┌─────────────────┐
                │     S3          │  (Phase B: attachments; Phase A: events archive)
                └─────────────────┘

                ┌─────────────────┐
                │  CloudWatch     │  (logs from Fargate; OTel collector forwards to Tempo/Grafana)
                └─────────────────┘
```

### §K.2 Per-task process layout

Single Hono process per Fargate task. Inside it:
- HTTP handlers (Hono routers).
- `LISTEN events` loop (one PG client dedicated).
- graphile-worker (concurrency configured per env).
- Mastra runtime + agents.
- `partition-manager` cron (graphile).

**Three workload-class pools (D10, architect review 2026-05-19).** A single 20-connection pool let workflow-snapshot bursts transiently block web handlers — the workloads have different latency profiles and different concurrency ceilings, so they get different pools.

| Pool | Max | Used by |
|---|---|---|
| `webPool` | 15 | Request handlers, Mastra agent execution (`tool.execute()` bodies), session middleware |
| `workerPool` | 10 | graphile-worker job runner, subscriber framework, dispatcher LISTEN client, partition manager cron |
| `mastraStatePool` | 5 | `@mastra/pg` workflow snapshots, thread/message storage |

Total: **30 connections per Fargate task.** RDS `max_connections` must accommodate `N replicas × 30` plus headroom for `psql` admin sessions and any backup jobs. At the §K.1 reference instance class (Phase A: 2 replicas → 60 + headroom; budget ≥100). Per-pool sizing is env-tunable; defaults above are calibrated for the §10.2 scale targets.

Audit is *not* in this table — D6 collapsed `core.audit` into `core.events`, so audit writes are part of the same transaction as the state change and use whichever pool the calling handler is on (typically `webPool` for sync mutations, `workerPool` for subscriber-driven mutations).

### §K.3 Why no Redis / SQS in v1

- Session scope cache: in-process LRU + `core.session_scope_cache` durable layer. Two-replica drift is bounded by event-driven invalidation.
- Rate limit: `hono-rate-limiter` with Postgres store (acceptable at v1 scale).
- Event bus: outbox + `LISTEN/NOTIFY` — no broker.
- Job queue: graphile-worker — no broker.

§11.7 hook preserved: no AWS-runtime dependency in app code (only RDS + Secrets Manager are AWS-managed; both have on-prem equivalents).

### §K.4 IaC

`infra/cdk/`:
- `NetworkStack` (VPC, subnets, security groups, WAF).
- `DataStack` (RDS Postgres with `vector` extension via parameter group, Secrets Manager, S3 bucket).
- `ComputeStack` (ECS cluster, Fargate service with rolling deploy, task definition, ALB target group).
- `ObservabilityStack` (CloudWatch log groups, OTel collector ECS task).

Reference shipped in `infra/cdk/`. Operators bring their own stack or fork.

### §K.5 Secrets rotation (D11c, doc-only Phase A; implementation Phase B)

Secrets the platform owns and the rotation posture for each. Phase A stores every secret in Secrets Manager in a shape that *can* be rotated; Phase B wires the actual rotation flows.

| Secret | Recommended cadence | In-process reload mechanism |
|---|---|---|
| **JWT signing key** (better-auth) | 90 days | Two-key window: new key starts signing on rotation; both keys verify for the overlap window (one access-token TTL = 15 min per §3.6). Old key retired after window. Implemented as `JWT_SIGNING_KID` + `JWT_VERIFYING_KIDS` env list; rolling Fargate deploy swaps the active signer. |
| **LLM provider API key** (OpenAI / Anthropic / Bedrock) | Quarterly, or on suspected compromise | Rolling Fargate deploy with new env var. AI SDK reads from process env at module init; no live reload needed because deploys are zero-downtime. Mid-deploy in-flight turns finish on the old key. |
| **Embedding provider API key** | Quarterly | Same shape as LLM key. |
| **Postgres password** (`DATABASE_URL`) | 6 months, or AWS Secrets Manager managed rotation | RDS managed rotation with a 2-phase Secrets Manager rotation (`AWSPENDING` → `AWSCURRENT`). Fargate task IAM role reads the secret on startup; rolling deploy picks up `AWSCURRENT`. |
| **MCP credentials** (Timesheet, future) | Operator-decided (Phase B) | Stored in `integrations.connection_credentials` table encrypted with `INTEGRATIONS_CREDENTIAL_KEY` (KMS-backed). Connection-level reload after the tenant admin re-saves. |
| **`INTEGRATIONS_CREDENTIAL_KEY`** (KMS data key for MCP creds at rest) | Yearly via KMS key rotation (automatic) | KMS handles key versioning transparently; app code does not see the key. |

**Phase A discipline (no implementation, just storage hygiene):**
- Every secret above already lives in Secrets Manager (never in env files or git).
- Env var names use the `_KID` / `_VERIFYING_KIDS` pattern for the JWT key so the two-key window can ship in Phase B without schema change.
- The CDK `DataStack` provisions each secret with `description` + `tags={rotation_cadence_days}` for operator visibility.

**Phase B implements:** the JWT two-key window, the RDS managed rotation hookup, the in-app metric `secrets.kid.active`, and the operator runbook for an emergency revoke.

---

## §L. Observability + audit

### §L.1 Traces (OpenTelemetry)

- Hono middleware: `hono-otel` wraps every request as the outermost span.
- Mastra propagates trace context into agent/tool spans automatically (v1.x).
- Subscriber framework: each event delivery is a span; `caused_by_event_id` joins spans into a causation tree (§1.6.5a).
- Tool wrapping (`wrapTool`): one span per tool call, attributes `tool.key`, `tool.duration_ms`, `tool.outcome`.
- Embedding subscriber: span per embed job; correlates with the originating `planner.task.created` span.

Export: OTLP → CloudWatch (default) or Tempo (operator option).

### §L.2 Metrics

| Metric | Type | Cardinality | Use |
|---|---|---|---|
| `copilot.turn.duration_ms` | histogram | agent_key, tenant_id | Chat latency budget |
| `copilot.turn.tokens` | counter | agent_key, tenant_id, role_summary_hash (top-N) | Cost dashboard |
| `copilot.tool.invocation` | counter | tool_key, outcome | Tool reliability |
| `copilot.embed.queue.depth` | gauge | tenant_id (top-N) | Backpressure alert |
| `copilot.embed.latency` | histogram | (none) | Provider health |
| `bus.dispatcher.lag_ms` | gauge | subscription | Subscriber health |
| `subscriber.failures` | counter | subscription | Subscriber alert |
| `session.scope.build_ms` | histogram | (none) | Cold-cache cost |
| `copilot.agent.cache.hit_ratio` | counter pair | agent_key | Per-session Agent LRU hit rate (D9) |

### §L.3 Audit log (§8.1, post-D6 unified with events)

- **No separate audit table** — `core.events` rows carry actor + before/after; `core.audit_v` Postgres view exposes the audit-shaped read API.
- Written by `core.emit()` inside the state-changing transaction (no separate audit write, no batch flush). Read tools that don't already emit a domain event emit a thin `copilot.tool.invoked` event so the audit view sees them.
- Append-only; never updated. Hash-chain tamper-evidence hook (§11.6) is a v1.x bolt-on: add `prev_hash jsonb` column to `core.events`, compute at insert.
- DSR erasure: per-user event rows pseudonymized in place (replace `payload.actor.user_id` with `erased:<pseudonym>`, clear `payload.actor.email/name` and `payload.before/after` PII fields). Documented in §10.1 + §2.6.

### §L.4 Cost telemetry

`copilot.rate_limits` aggregates per `(tenant_id, bucket, window_start)`. Daily roll-up workflow computes per-tenant USD spend; superadmin dashboard surfaces tenants approaching cap; hard-stop at cap halts new chat turns with a 402-equivalent response.

---

## §M. Future-extraction reference architecture

### §M.1 Backend extraction

See **`requirements.md §1.6.12`** for the playbook. Architect review 2026-05-19 (D2) consolidated the duplicated extraction narrative into that single section.

The boundary discipline in `§1.6.2` is what preserves extraction optionality; this section does not restate it.

### §M.2 Frontend extraction — single SPA → per-portal independent deploys

Architect review 2026-05-19 (D3) collapsed an earlier 11-subsection treatment with full vite configs into the summary below. By the time the trigger fires, the federation ecosystem will have moved on; re-research at that point.

**Trigger.** v1 ships one SPA per §1.6.8. Graduate when any of: entry chunk > 500KB gzipped sustained, or build > 5 min, or > 5 modules contribute portals, or vanity-domain support is required.

**Three strategies, in order of cost:**

1. **Route-split SPA** (v1 default). One Vite build, dynamic `import()` per route, per-route code splitting. Fits 1–5 portals.
2. **Module Federation.** One runtime shell loads remote modules at runtime. Per-module deploys, single shell URL. Fits 5–10 portals.
3. **Edge-routed multi-bundle.** Thin shell at root domain + per-portal Vite builds at per-CDN paths; shell dynamically imports portals on first nav. Fits 10+ portals; natural vanity-domain support.

**What v1 must preserve to keep all three viable** (cost: ~half a day): module manifest files import only `@seta/shared` + `@seta/core/composition` types, never `apps/web/src/shell/...`; the shell consumes manifest data and never has module-specific branches (`if (manifest.key === 'planner')`); modules use shell-provided context (`useSession`, `useToast`, `useModal`), not module-local singletons. The §A5 dep-cruiser rules + a lint rule on the shell handle the first two.

**What stays the same across all three.** The contribution shape from §C is byte-identical — only the composition site moves (build-time import vs. runtime federation vs. runtime dynamic import). Strategy switch is a build/deploy decision, not a module-code decision.

iframes-per-portal: rejected at every scale, same reasons §1.6.8 lists.

## §N. Phase A → B/C handoff

What Phase A delivers vs what Phase B/C extends. Anchored against §14.1–§14.3.

### §N.1 Phase A completion checklist

Per §14.1 acceptance gates, the architecture supports all of them. Concrete file/section pointers:

- Module boundary tooling green → §A5 + §B.
- Outbox + LISTEN/NOTIFY ≥1 cross-module subscriber under 10k events/min → §F + §K.2 task layout.
- RBAC per-session role-shaped tool registry → §A8 + §H.3.
- Agent selector RBAC gate → §J.2.
- HITL on every write tool → §A6 + §H.2.
- Deterministic ranked recommender output → §H.4.
- Timesheet MCP failure graceful degradation → §H.8.
- AI cost cap hard-stop → §L.4.
- Embeddings freshness ≤60s → §I.
- Seed + agent-driven bootstrap → unchanged from §14.1 (CLI + agent flow).

### §N.2 Phase B extensions (architectural ready, no v1 work)

- **Planner Kanban UI:** consumes `/api/planner/v1` (already exposed in Phase A) + new SSE board endpoint. No backend changes beyond adding the SSE stream.
- **MS Planner sync:** new module-internal workflows under `integrations`. Subscribes to `planner.task.*` events for outbound push; cron-poll for inbound. Conflict resolution per §6.3 (field-level Seta wins with `last_pushed_field_values`).
- **Embedded copilot panel:** same `useCopilotRuntime` consumed from inside `planner` module pages; shares threads via `resourceId = user.id`.
- **Comments + mentions:** new `planner.comments` table + `comment_embeddings`; subscribed to by retriever.
- **Bulk operations:** new `bulk_*` tools (HITL); subscribers fan out per-entity events.
- **HIBP for local password:** wrapping `betterAuth.signUp` hook.

### §N.3 Phase C extensions

- **DSR tooling:** `deleteThread`, `eraseUserThreads`, `exportUserThreads` already in §H.5; Phase C adds the admin UI and audit pseudonymization workflow.
- **Tenant knowledge RAG (per-tenant company knowledge):** new `copilot.tenant_knowledge_chunks` table; per-tenant retriever; system-prompt layering via Agent definition's `instructions` extended at session-build time.
- **MFA:** `better-auth/plugins/two-factor` — additive.
- **Concept-map editor:** UI over `core.instance_config` keyed entries (already a v1 design hook).

---

## §O. Phase A vertical-slice order (recommended)

This is a build-order recommendation, not a doc requirement. Each slice is shippable to the demo tenant. Refine during sprint planning.

1. **Slice 0: skeleton + boundary tooling.** Repo layout (§19.1), `core` with Hono + event-bus stubs + audit + registries, dep-cruiser + ESLint boundaries config (§A5), CI green. No business value yet.
2. **Slice 1: identity backend.** better-auth wiring, `user_profile`, `role_grants`, sessions, `sessionMiddleware`, login UI, profile UI. Throwaway integration test from §A2.
3. **Slice 2: planner schema + public surface.** All tables (§E.3), domain functions, Hono routes (`/api/planner/v1`), seed script for demo tenant.
4. **Slice 3: event bus dispatcher.** §F shape; verify with a no-op subscriber printing event types as they arrive.
5. **Slice 4: copilot runtime baseline.** Mastra installed, `chatRoute()` mounted (§A7), router agent + planner.agent with read-only tools (`listTasks`, `getTask`, `searchTasksSemantic` — embeddings stubbed initially), standalone Copilot module UI (chat pane + sidebar + agent selector). Per-session Agent cache (§A8). End-to-end: "list my tasks" works.
6. **Slice 5: embeddings CDC pipeline.** §I shape; subscribers; graphile-worker; back-fill on demo tenant; `searchTasksSemantic` returns real results.
7. **Slice 6: HITL write tools.** `createTask`, `assignTask`, `updateTask`, `addSkillTag`, `toggleReviewState` with `needsApproval`; assistant-ui Interactable cards; full audit (§H.2).
8. **~~Slice 7: staffing.agent + recommend_reviewers.~~** **Deferred to Phase B (D8), reshaped per D15.** `staffing.agent` exposes atomic primitives (`match_users_to_topic`, `infer_user_skills_from_history`, `get_user_availability`, `compute_workload`, `get_leave_overlap`) — no macro `recommend_reviewers` tool. Skill matching is embedding-based (no concept map). Workload projection, leave overlay, and the Timesheet MCP client all ship in Phase B alongside the Kanban UI.
9. **Slice 8: Phase A workflows (§H.9, post D7/D8/D15).** `session-cache-invalidate`, `embeddings-keep-fresh`, `new-task-skill-tag-suggester`. (`stale-review-detector` dropped per D15.)
10. **Slice 9: tenant admin bare-bones UI + CLI tenant-create.** Superadmin tenants UI deferred to Phase B (D8); Phase A uses `apps/cli` for tenant lifecycle.
11. **Slice 10: observability + cost telemetry.** §L. Per-tenant cost envelope dashboard against the §10.2 target (D11d).
12. **Slice 11: tenant deletion cascade implementation.** §2.6 cascade end-to-end with the integration test that's a Phase A acceptance gate (D11a).
13. **Slice 12: Phase A acceptance bake.** Run all §14.1 acceptance gates — including the three load tests (D11b) and three correctness tests (D12) — against the demo tenant. Fix gaps.

Each slice ends with the CI gates green (boundary, raw-SQL audit, public-API tests, type-check, unit + integration).

---

## §P. Risks carried into implementation

Re-listed for visibility; mitigations defined inline above.

1. **graphile-worker cadence** — verified active, but slow. Fallback: pg-boss port (~1 sprint).
2. **Mastra v1.x release pace** — pin patch + minor, weekly review per §17.3.
3. **assistant-ui pre-1.0** — pin minor, ~0.5d per upgrade.
4. **AI SDK v6 / Mastra v6 / assistant-ui v6 stack alignment** — pin all three; full-stack regression test in CI.
5. **Single-DB bottleneck** — fits v1 scale (§10.2). At 10× scale: logical replication / per-tenant shards / dispatcher to SNS swap (§1.6.5a).
6. **Audit queue loss on crash** — accepted trade for tool-latency budget. v1.x mitigation: write-ahead log to a small Postgres table before LLM-side calls.
7. **OpenAI embedding-provider availability** — graceful degradation (queue persists; reactive worker pause).
8. **Per-tenant noisy neighbor** — fair-share at embed worker; rate-limit per tenant on chat (hono-rate-limiter); event bus subscribers shard by `tenant_id` cursor.

---

End of architecture document. Companion: `docs/requirements.md` (source of truth for product scope), `docs/adr/` (decision records — to be populated as v1.x calls arise).
