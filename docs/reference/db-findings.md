# Database review — findings and remediation program

A senior-architect review of the database across all ten module schemas, conducted against the code, the CI gates, and a live migrated database. Every claim below carries evidence.

This document replaces `db-design.md`, which was deleted. That file had two halves. The **descriptive** half — table inventories, the cross-module reference map, the projection census, ER diagrams, the lifecycle registry — was a hand-maintained copy of `schema.ts`, and it is where every drift finding in this review originated. The code and [`review-schema.sql`](./review-schema.sql) already say all of it, and they cannot lie. The **normative** half was the constitution: rules that constrain the code rather than describe it. Those rules are preserved in §2 below, and DB-4 made every one of them that a database can answer executable. A rule that CI checks does not rot; a rule in a markdown file does.

Read the schema files for column-level truth. Read [`ddd-design.md`](./ddd-design.md) for the event backbone. Read this document to know what is broken and why.

---

## 1. Findings

Ranked by blast radius. `S1`–`S3` are architectural and each needs its own design cycle. `S4` is what stops the drift recurring. `S6`–`S11` are mechanical.

### S1 — The RLS backstop is inert for four of the ten modules — **critical** · *fixed ([#353](https://github.com/Seta-International/agent-platform/pull/353), [#361](https://github.com/Seta-International/agent-platform/pull/361), PR4)*

Every tenant-owned table has row-level security enabled and forced, with a uniform `tenant_id = current_setting('app.tenant_id')` policy. Ten `rls-census.test.ts` files (one per module) prove those policies are configured correctly: `assertRlsCensus` creates a `NOBYPASSRLS` role in a test container and asserts every tenant-scoped table is tenant-blind to a stranger.

**Nothing asserts that production connects as that role.** Four modules resolve their database client from the admin pool:

| module | db client | pool | role |
|---|---|---|---|
| `identity`, `planner`, `knowledge`, `agent` | `identityDb()`, `plannerDb()`, … | `getPool('worker')` | `seta` — `superuser=t`, `bypassrls=t` |
| `core`, `people`, `hiring`, `pm`, `integrations`, `notifications` | `coreDb()`, … | `getPool('web')` | `seta_app` — `NOBYPASSRLS` |

`packages/planner/src/backend/db/index.ts:13` and its peers. `packages/shared-db/src/pools.ts` gives the worker pool `cfg.databaseUrl`; `pg_roles` confirms `seta` is `superuser=true bypassrls=true`.

So **31 of the 77 RLS-protected tables carry a policy that never executes at runtime.** A forgotten `WHERE tenant_id` in `planner` or `agent` leaks across tenants exactly as if RLS had never been written. The census proves the lock works; nothing proves the door is used. This is why a green test suite coexisted with the defect.

Verified against production configuration: `DATABASE_APP_URL` exists as a `prod` environment secret, and the session middleware pins a GUC-set connection on the web-pool facade for the life of each request. The mechanism was real and working — for six modules. (At the time of the review the wrapper was a standalone `runRequestTenant` middleware in `apps/server`; DB-1 moved it into `createSessionMiddleware`, because building the session scope itself reads tenant-scoped tables, and then deleted `runRequestTenant` — `scoped()` is now the only pinning entry point.)

Two deliberate exemptions, both correct:

- `identity.user` is exempt because better-auth performs a pre-tenant email lookup at login. The rationale is documented at `packages/identity/drizzle/0001_identity_platform.sql:30`. Confirmed live: with 199 rows in each table, as `seta_app` with no tenant GUC, `people.person` returns 0 rows and `identity.user` returns all 199.
- The 35 `mastra_*` tables and `agent.memory_messages` carry no `tenant_id` and cannot — Mastra owns their DDL. Isolation is enforced by `packages/agent/src/backend/mastra-store/tenant-guarded-store.ts`, which builds a composite `${tenantId}:${userId}` resourceId for every call.

`agent.memory_messages` deserves a note, because an earlier draft of this review misjudged it. It is created by Mastra's `PgVector` with `schemaName: 'agent'` (`packages/agent/src/backend/memory.ts:47`) and backs `semanticRecall`, which is configured `scope: 'thread'` (`memory.ts:94`). Recall is filtered to the current thread, and thread access is tenant-guarded. **It is isolated.** The real gap is narrower: `scripts/lint/lint-mastra-access.mjs:18` hardcodes six table names —

```js
/mastra_threads|mastra_messages|mastra_ai_spans|mastra_workflow_snapshot|mastra_traces|mastra_resources/
```

— so `memory_messages` and 29 other `mastra_*` tables are not guarded by the containment lint. Isolation holds today because the store enforces it; nothing stops the next person from bypassing the store.

#### What DB-1 shipped, and what it found on the way

`shared-db` now exposes an ambient executor over `AsyncLocalStorage`: `scoped(tenantId, fn)`, `maintenance(fn)`, and `executorPool()`, which throws outside a context. The composition root — not module code — decides every connection's privilege and tenant scope. The four broken modules resolve `executorPool()`, and each carries a `runtime-privilege.test.ts` that reads an RLS table **through its own db client with no `WHERE tenant_id`** inside `scoped(A)` and asserts tenant B is invisible. All four were red before the flip.

Three corrections to the review above, established while implementing it:

- **This finding understated the blast radius.** `knowledge_searchDocuments` — an *agent tool*, executing on behalf of a user — bypassed its own module's client and called `getPool('worker')` directly. Its `WHERE tenant_id = $1` was the only tenant boundary. Scoped to tenant A with a session naming tenant B, it returned tenant B's document text to the model. A module's client being audited says nothing about code that goes around it: **grep `getPool` under `agent-tools/` and `http/`, not just `db/client.ts`.**
- **The `getPool('web')` row in the table above is not a defect.** `getPool('web')` returns the tenant-aware facade (`pools.ts`), so the six modules on it already receive the pinned connection and the tenant GUC inside `scoped()`. Their RLS *is* enforced. Migrating them (PR3) buys one idiom and a fail-closed error, not a fixed leak. Only `getPool('worker')` bypasses RLS.
- **`memory_messages` and the containment lint** are addressed: `lint-mastra-access.mjs` now matches `/\b(mastra_\w+|memory_messages)\b/`, subtracting identifiers we own (`workflow_approvals.mastra_run_id`) rather than growing an allowlist.

Bugs the work uncovered, each with a regression test: `apps/worker` never passed `appDatabaseUrl`, so its "web" pool *was* the admin pool — without that fix the whole migration would have been a silent no-op with every test green. `RESET ALL` does not drop prepared statements (only `DISCARD ALL` does), so a pooled connection carried the previous scope's statements. A pinned client has no `'error'` listener while checked out, so a backend dying mid-scope killed the worker process. And `sessionMiddleware` built the session scope — which itself reads tenant-scoped tables — *before* the executor context opened, so every authenticated request threw on a session-scope cache miss.

#### What PR3 found: the facade was hiding a whole class of bug

PR3 ([#361](https://github.com/Seta-International/agent-platform/pull/361)) moved every remaining caller — the six other module clients, the `knowledge` and `agent` jobs, `core`'s retention tick, `identity`'s tenant-settings route, the server's `/me` route. Ten modules now carry a `runtime-privilege.test.ts`. `knowledge`'s per-tenant partition DDL moved to `maintenance()`, because `seta_app` has no `CREATE`.

The migration's cost landed in one place nobody predicted. `withEmit()` — every module's write path — calls `coreDb()`. So the moment `coreDb()` failed closed, **779 tests threw `ExecutorContextError`**: 734 across eight modules, 45 across both apps. That number is the honest measure of how little the old arrangement exercised RLS. None of those paths had ever run as `seta_app`.

The deeper lesson is about the facade. `getPool('web')` returned a *long-lived* `Pool` that resolved the pinned per-scope client lazily, at query time — so a database handle captured once at boot still routed correctly per request. `executorPool()` resolves eagerly. **Any code that captured a handle instead of resolving one per call was therefore already wrong, and the facade was silently covering for it.** Three such captures existed in production (`createOutboxStore`, `createMailTransportConfigStore`, and four m365 repo factories built at boot); all now take a `db: () => NodePgDatabase` resolver.

Seven production bugs surfaced, every one behind a green test suite:

- **`credential-gate.ts` failed open.** Its `core.tenants` read sat inside `try { … } catch { /* fall through to better-auth */ }`. An `ExecutorContextError` there is swallowed and the `LOCAL_PASSWORD_DISABLED` check silently skipped — an SSO-only tenant would have accepted a password sign-in. The `catch` now rethrows it.
- **The M365 webhook was broken.** Unauthenticated, mounted outside `sessionMiddleware`, and `integrations.m365_subscriptions` is RLS-enabled. `findBySubscriptionId` is cross-tenant *by necessity* — the subscription id is opaque and the HMAC authenticating the request is keyed on the tenant it resolves to — so it is the one admin read on that path.
- **`buildM365Boot()` would have crashed server startup** wherever `M365_WEBHOOK_SECRET` is set.
- **`recordFailedAttempt`** (the pre-auth login throttle) emitted its alert with no context. It runs `scoped(tenantId, …)`, not `maintenance()`: the tenant is already resolved, and an unauthenticated caller must never reach `BYPASSRLS`.
- **`isIdleExpired`** ran before `scoped()` opened, and would have thrown on every authenticated request.
- **`agent_lifecycle_retry`** ran contextless. `wrapJob` cannot scope it — the dead-lettered payload's tenant field is `tenantId`, not the `tenant_id` `wrapJob` reads.
- **`getWorkerIdForUser` would have deadlocked the connection pool.** FUT-327 wrapped it in `runRequestTenant(tenantId, …)` on the premise that `resolveWorkerId` runs before the tenant GUC is bound. DB-1 moved the scope open into `sessionMiddleware`, so it now runs *inside* one — and `pinTenantConnection` unconditionally acquires a fresh connection rather than reusing the active binding. Every authenticated request would have held two connections from a `max: 15` pool; at fifteen concurrent requests every outer scope blocks on an inner connection that can never be granted.

**`maintenance()` is a `BYPASSRLS` grant, so it is countable.** Exactly six exist in production, each justified in-file: `wrapJob` (for `MAINTENANCE_JOBS`), `apps/cli`'s `parseAsync`, `identity`'s test seeder, the m365 webhook lookup, `knowledge`'s partition DDL, and the agent lifecycle-retry dead-letter job. `MAINTENANCE_JOBS` itself is unchanged — adding a name to it is a privilege escalation.

One shortcut was available and refused. Giving `withTestDb` an ambient `maintenance()` context would have fixed all 779 failures in a single line — and would have made the `credential-gate` regression test pass *without* its fix, because a context would always have been open. Tests enter the context production enters: seed helpers `maintenance()`, test bodies `scoped(session.tenant_id, …)`.

#### What PR4 closed

`getPool` is gone from the `@seta/shared-db` barrel. It lives at `@seta/shared-db/composition`, importable only by `apps/{server,worker,cli}`. Identity's two authentication-time escapes — which are *different privileges for different reasons*, and were previously indistinguishable from an ordinary pool fetch — are now named and confined to `@seta/shared-db/pre-tenant`: `preTenantAppPool()` for better-auth's lookup against the RLS-exempt `identity.user`, and `preTenantAdminPool()` for SSO tenant resolution, which must read the RLS'd `tenant_sso_providers` before any tenant exists.

Both subpaths are enforced by `.dependency-cruiser.cjs` rules (`shared-db-composition-root-only`, `shared-db-pre-tenant-identity-only`), because **dependency-cruiser restricts by module path, not by named export** — `import { getPool }` and `import { scoped }` resolve to the same file, so no rule could ever have told them apart while both lived on the barrel. That is why the accessor had to move rather than merely be deprecated. `runRequestTenant` is deleted; `scoped()` is the only pinning entry point.

`scripts/lint/lint-init-pools.mjs` asserts both long-running composition roots pass `appDatabaseUrl` to `initPools`. This guards the bug that would have made the entire program a no-op: `apps/worker` shipped without it, so its "web" pool *was* the admin pool, and every RLS policy would have evaluated as a superuser — silently, with all tests green. The lint checks the call site made the choice; the *value* stays optional, because the self-host onboarding contract depends on the fallback.

### S2 — `people.worker.id` is a phantom identity — **critical**

Every column named `worker_id` in this system holds a **`people.person.id`**, not a `people.worker.id`. This includes `pm.allocation.worker_id`, `pm.account.am_worker_id`, `pm.project.pm_worker_id`, `hiring.application.worker_id`, `pm.worker_projection.worker_id`, and `people.org_unit.head_worker_id` — the last of which has an actual foreign key to `person.id`.

- The `people` domain layer does `eq(worker.person_id, worker_id)` in eleven places.
- `worker.id` appears twice in the whole module, once inside a comment reading *"there is no separate worker.id in use anywhere else"* (`packages/people/src/backend/subscribers/bind-user-to-person.ts:47`).
- The deleted `db-design.md §3` stated these columns reference `people.worker`. They do not.

Meanwhile the split buys nothing. `worker_uniq_person` makes `person → worker` strictly 1:1, and live data is 199 persons / 199 workers with zero persons holding more than one worker. The per-stint lifecycle modeling that would justify the split already lives in `employment_period`.

The result is a surrogate primary key on a 1:1 table that nothing references, sharing a name with a differently-scoped identifier. The first engineer to write `JOIN people.worker w ON w.id = a.worker_id` gets a silently empty result set rather than an error.

### S3 — The projection replay contract does not exist — **high**

The constitution required that every projector rebuild from `core.events` alone, and that a testcontainers test per projection verify replay reconstructs the same rows.

**Zero of the eleven projections have such a test.** Every test either constructs a synthetic `DomainEvent` in memory and calls `subscriber.handler()` directly, or inserts straight into the projection table. The real dispatcher is exercised only in `core`'s generic mechanics tests, never wired to a projection assertion. `packages/identity/tests/helpers/bus.ts:9` documents itself as running "without going through the full event bus machinery."

This matters because replay from events is the *only* recovery mechanism for a corrupted read model — there are no cross-schema foreign keys to fall back on. It has never been demonstrated to work.

Compounding it:

- **Five of eleven projections lack `updated_at`**, which the same convention required: `hiring`'s four (`account_projection`, `project_projection`, `project_owner_projection`, `worker_user_projection`) and `planner.assignee_projection`, which uses `projection_built_at`. No lint rule checks `updated_at` at all.
- **`people` and `hiring` maintain near-identical duplicate projections** of `pm.account` and `pm.project`, fed by the same events, differing only in that `hiring`'s lack `updated_at`. Some duplication is the honest price of the no-cross-schema-FK rule. *Identical* duplication is not.
- The deleted doc's census listed seven projections; there are eleven. It also documented `assignee_projection.skills[]`, dropped by `packages/planner/drizzle/0002_drop_assignee_projection_skills.sql`, and omitted `core.skill_alias` entirely.

### S4 — The governance gate cannot see what matters — **high** · *fixed (DB-4)*

`pnpm lint:db` passes clean. That is not evidence of health.

- **It parses only `schema.ts` files** (`scripts/lint/lint-db.mjs`, `schemaFiles()`), never `.sql`. `knowledge.chunks` — a LIST-partitioned table with a composite foreign key — exists *only* in hand-written SQL and is invisible to both `lint:db` and the drizzle drift check. Any table can escape governance by being born in a `.sql` file. So can an entire schema: `people_rag.person_profile_embeddings` is created at runtime by Mastra's `PgVector` (`packages/people/src/backend/embeddings/vector-store.ts:3`) and appears in no schema file at all. Neither does the ten-strong `rls-census.test.ts` family see them — `assertRlsCensus` enumerates tables from Drizzle exports (`packages/shared-testing/src/rls-census.ts:15`), so it reads the same source of truth the lint does.
- **It checks four things**: missing `tenant_id` (R1), inline text-enums (R2), non-tenant-led uniques (R3), missing `created_at` (R4). It does not check `updated_at`, `version`, or — most importantly — the runtime privilege of the connection, which is the actual defect in S1.
- The 34-entry baseline in `scripts/lint/lint-db-baseline.json` is legitimate. All 34 are junction tables, projections, or infra tables that name their timestamp `occurred_at` / `built_at` / `attempted_at`. Nothing was smuggled in.

Two smaller inconsistencies. Migration layouts diverge — `identity`, `planner`, `agent` use `packages/<m>/drizzle/`, the other seven use `packages/<m>/drizzle/migrations/`. The runner (`packages/shared-db/src/migrate.ts`) handles both because each `register.ts` supplies its own path, so this is convention drift rather than a bug. And the constitution's own worked example was wrong: it named `worker_history` as a `created_at`-only append-only table; the column is called `at`.

#### What DB-4 shipped

The gate now queries `pg_catalog` after the migrations run. It lives in `apps/cli/tests/integration/db-constitution.test.ts`, because `apps/cli/tests/global-setup.ts` is the only place in the repo where all ten modules' migrations are applied to one database. Eighteen rules, in `packages/shared-testing/src/db-constitution.ts`:

`schema-governed` · `rls-enabled-forced` · `rls-policy-uniform` · `tenant-id-shape` · `tenant-id-present` · `app-role-privilege` · `app-role-grants` · `app-role-no-create` · `no-cross-schema-fk` · `tenant-scoped-unique` · `created-at-present` · `timestamp-shape` · `updated-at-trigger` · `version-column` · `ordered-pair-check` · `numeric-range-check` · `projection-shape` · `lifecycle-registered`

Each has a negative test in `packages/shared-db/tests/integration/db-constitution-rules.test.ts` that builds a table violating exactly that rule and asserts it — and no other rule — reports it. A rule nobody has watched fail may match nothing.

Three rules stay source-level, because they are not properties of the migrated database. C4: after migration, `text({ enum })` and `textEnum()` are indistinguishable — one emits a `CHECK`, the other does not, but a `text` column with no `CHECK` cannot be told apart from a legitimately free-text column. C11 is an access rule and C12 compares generated output to committed files. `lint-db.mjs` is now C4 and nothing else; R1, R3 and R4 were deleted along with their baseline, each replaced by a catalog rule that also sees tables the regex never could: `tenant-id-present`, `tenant-scoped-unique`, `created-at-present`.

**The old lint had one property worth keeping**, and the first draft of this gate lost it: it walked `packages/**/schema.ts`, so a new module was governed from the moment it existed. The catalog gate filters by a hand-maintained `OWNED_SCHEMAS`, and a schema missing from that list is inspected by no rule at all — a whole module could ship ungoverned by being unlisted rather than by being well-shaped. `schema-governed` closes it: any schema present in the database and absent from both `OWNED_SCHEMAS` and a named exempt set is itself a violation.

**Two rules had to be weakened, and the numbers say why.** C5 as written — "every unique constraint on a tenant-scoped table leads with `tenant_id`" — flags **65 objects**, essentially every primary key, because the convention is `id uuid PRIMARY KEY` and a random UUID is unique across tenants by construction. The rule's real intent is that a *natural* key be tenant-scoped, so it reads: lead with `tenant_id`, or lead with a `uuid`. Exactly one live object violates — `core.session_scope_cache_pkey`, whose leading column is `session_id text` — which is what proves the rule is not vacuous. And C6 cannot ask whether a table is mutable; the catalog does not know. The `updated_at` trigger is the honest proxy, because it exists precisely when something updates the row. So the rule is *trigger ⇒ `version`*, and under it the S8 canary `planner.task_comments` is flagged, along with `integrations.m365_{group,plan}_links` and `knowledge.files`.

**The grants are conditional, and that is now gated.** Every module baseline wraps its `GRANT … TO seta_app` in `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app')` (`packages/core/drizzle/migrations/0001_core_platform.sql:111`). Migrate a cluster where the role does not yet exist and the whole block is skipped — silently. Measured on a clean container: **all 92 owned tables end with zero DML grants for `seta_app`**. Create the role first and it is zero missing, with no `CREATE` on any schema. `app-role-grants` and `app-role-no-create` assert both, and `apps/cli/tests/global-setup.ts` now creates the role before migrating, the way `infra/postgres/initdb/01-app-role.sql` does. C2c is what keeps `maintenance()` load-bearing: `seta_app` has no `CREATE`, which is the whole reason `knowledge`'s partition DDL needs the admin role.

**The baseline distinguishes a decision from a defect.** `scripts/lint/db-constitution-baseline.json` carries 91 rows: 62 `accepted`, each with a reason naming the code or migration that justifies it, and 29 `debt`, each naming the ticket that owns it (21 → DB-6, 8 → DB-3). The old flat list of strings could not tell "this is fine, and here is why" from "this is broken, and someone owns it", which is how a to-do list quietly becomes a permanent exemption. Both directions ratchet: a fresh violation fails, and a baseline row that no longer occurs fails and must be deleted. `pnpm db:constitution` regenerates the file with empty reasons, and an empty reason does not parse — **generation cannot launder a violation**.

**The gate immediately found a bug this review missed.** `planner.group_join_requests` has an `updated_at` trigger and no `version`, so `version-column` flagged it. Reading the write path to classify the row: `resolve-join-request.ts:28` reads the row and throws unless `status === 'pending'`, then updates on `(group_id, user_id)` with no status or version predicate. Two administrators approving the same request concurrently both pass the check, both update, and both call `addGroupMember`. It is a lost update with a visible side effect, it is not in S8's list, and nothing but a catalog rule was ever going to point at it. It is baselined as debt against DB-6.

Three corrections to this document, established by running the queries rather than reading the schema. **S6 over-counts twice**: `hiring.requisition` has no start/end pair at all (its date columns are `due_date`, `start_date`, `closed_at`), and `people.worker`'s `work_start`/`work_end` are `time` columns — a daily shift window, where `end < start` is a legitimate night shift crossing midnight and a `CHECK (end >= start)` would be wrong. Five tables carry unconstrained ordered pairs, not seven. **`people.worker_history (from_val, to_val)` are `jsonb`** — the before and after values of an audited field change, not a time range; name-only pair detection would have flagged them, so the rule requires both columns be date- or timestamp-typed. And **`lint-db-baseline.json` holds 34 entries, not 36.**

**The gate's own database has to be built the way production's is.** The test container is reused across runs and its template database survives, while `runMigrations` skips whatever `__platform_migrations` already records. So anything a migration does *conditionally* — on state that existed the first time it ran — freezes. A template first built by a checkout predating `createAppRole` would carry no grants forever, and, worse, a template built correctly once would keep passing after someone deleted `createAppRole`, hiding exactly the S1-class defect these rules exist to catch. `apps/cli`'s template is therefore dropped and rebuilt from nothing on every run.

What the gate still cannot see: the `mastra_*` tables and `people_rag`, because Mastra creates them at runtime rather than by migration. The `mastra_*` exemption is therefore a name pattern, `people_rag` is a named exempt schema, and containment stays with `lint-mastra-access.mjs`.

### S5 — `pm.project` ↔ `pm.charter`: a circular FK over a 12-column clone — **medium**

Both foreign keys exist, both `ON DELETE SET NULL`. `charter` duplicates twelve domain columns from `project`: `account_id`, `name`, `objective`, `scope`, `budget_bmm`, `pm_worker_id`, `pmo_worker_id`, `team_size`, `methodology`, `pricing_model`, `date_from`, `date_to`. `bodApproveCharter` (`packages/pm/src/backend/domain/decide-charter.ts:120-137`) copies all twelve field-for-field into the `project` insert.

No trigger, constraint, or exclusion keeps `project.charter_id = C` in agreement with `charter.project_id = project.id`. They stay consistent only because exactly one function writes both, in one transaction, by convention. Nothing prevents the next writer, migration, or operations script from silently desynchronizing the pair.

The charter is not a separate aggregate. It is a pre-approval draft of the project.

### S6 — No start/end ordering constraint exists anywhere in the database — **medium** · *gated (DB-4)*

`pm.project`, `pm.charter`, `pm.allocation`, `people.employment_period` and `people.worker_allocation_projection` each carry a start/end pair of date columns. **None** has a `CHECK (end >= start)`. `allocation_committed_dates_check` only asserts `date_from IS NOT NULL`.

Given the constitution's care with `numeric(p,s)` range checks and `weekday_mask BETWEEN 0 AND 127`, this is a conspicuous and systematic omission.

Two tables this finding originally named do not belong on the list, as DB-4's `ordered-pair-check` established: `hiring.requisition` has no start/end pair (`due_date`, `start_date`, `closed_at`), and `people.worker`'s `work_start`/`work_end` are `time` columns describing a daily shift, where `end < start` is a night shift crossing midnight. Five tables, not seven. All five are baselined as debt against DB-6.

### S7 — Dead columns, and two aggregates that were never built — **medium**

The deleted `db-design.md §3` listed **"resource request"** as a cross-module target aggregate. No `resource_request` table exists in any schema. Neither does `position`.

| column | reality |
|---|---|
| `pm.allocation.resource_request_id` | never written, never read — yet carries a partial unique index |
| `pm.allocation.weekday_mask` | zero references outside the schema — yet carries a `CHECK` |
| `pm.allocation.minutes_per_day` | written on create, never read |
| `hiring.opening.resource_request_id`, `.position_id` | a write path exists; the only caller passes `{}`. Always NULL. |

`pm.allocation` therefore carries three representations of effort — `planned_pct`, `minutes_per_day`, `weekday_mask` — only one of which is live.

### S8 — Optimistic concurrency is missing where contention is highest — **medium** · *gated (DB-4)*

Thirty-one mutable tables lack the mandated `version` column. Most are projections or junctions, which is fine. These are not:

- **`integrations.m365_group_links` / `m365_plan_links`** — `sync_status`, `delta_link`, and `last_synced_at` are mutated by concurrent sync workers. No `version`. This is precisely the lost-update scenario the guarded-UPDATE recipe exists to prevent.
- **`knowledge.files`** — a seven-state status machine driven by asynchronous jobs. No `version`.
- **`planner.task_comments`** — no `version`, and `updated_at` is **nullable with no default**, the only table in the database violating `NOT NULL DEFAULT now()`. Its trigger is `BEFORE UPDATE` only, so a comment that is never edited keeps `updated_at = NULL` forever.
- **`planner.group_join_requests`** — found by DB-4's `version-column` rule, not by this review. `resolve-join-request.ts:28` reads the row, throws unless `status === 'pending'`, and then updates on `(group_id, user_id)` with no status or version predicate. Two administrators approving the same request concurrently both pass the check, both update, and both call `addGroupMember`.

`task_comments` breaks the constitution's letter in three ways at once and is caught by none of R1–R4. It is the natural canary for any new gate: a rule that does not flag it is not working. DB-4's gate flags it, and `apps/cli/tests/integration/db-constitution.test.ts` asserts that it does — against the live violations, not against the baseline file, so the assertion cannot pass by someone having typed the row.

Separately, `identity.{user,session,account,verification}` have `updated_at` with no maintaining trigger. Better-auth writes it itself; this is expected, not a defect.

### S9 — Index hygiene — **low**

- **Fifteen prefix-redundant indexes.** Clear-cut: `pm.charter.charter_by_tenant`, `pm.project_access.project_access_by_project`, `pm.account_recruiter.account_recruiter_by_account`, `people.person_skill.person_skill_by_person`, `people.employment_period.employment_period_by_person`, `hiring.opening.opening_by_requisition`, `identity.access_group_{membership,role}_by_tenant`, `planner.task_assignments_by_user`. Three apparent hits are false — their covering index is *partial*, so the shorter index still serves rows outside the predicate.
- **Eight useless `tenant_id`-only secondary indexes.** Near-zero selectivity in a workload where every query filters by tenant. (Three further `tenant_id`-only indexes are primary keys on one-row-per-tenant config tables and are load-bearing.)
- **Fourteen `ON DELETE CASCADE` children seq-scan on parent delete**, because the FK column never leads an index — the convention indexes `(tenant_id, fk_col)`. A naive audit reports 38 unindexed FKs; only the cascade children actually bite. Latent at current volumes, real at scale.
- **Zero range indexes on the four date-range tables**, including `people.worker_allocation_projection` — the read model built specifically to power allocation and utilization screens. Every "who is allocated in July" query is a filtered scan.

### S10 — Vocabulary duplication and drift — **low**

Copy-pasted identically across packages, with nothing keeping them in step:

| constant | duplicated in | status |
|---|---|---|
| `GENDERS` | `hiring`, `people` | identical |
| `AVAILABILITY_STATUS` | `people`, `planner` | identical |
| `SYNC_STATUS` | `integrations`, `planner` | identical |
| `ALLOCATION_BUCKETS` / `PROJECTION_BUCKETS` | `pm`, `people` | identical values, different name |
| `TRANSPORT_KINDS` | `core` (5 values), `integrations` (2) | **already divergent** |
| `APPROVAL_STATUS` | `hiring`, `agent` | name collision, unrelated domains |

Inside `identity`, `GRANTED_VIA` (`admin|cli|idp`) and `PRODUCT_GRANT_GRANTED_VIA` (`admin|seed|cli`) express the same concept with different vocabularies. Worse, the module carries **two encodings of "no scope"** on semantically identical `(scope_kind, scope_id)` pairs: `role_assignments` uses `NULL`, `access_group_role` uses a nil-UUID sentinel. Both drive RBAC.

Bare-text columns holding closed sets, against the "no bare-text status columns" rule: `pm.allocation.role` and `pm.staffing_plan_line.role` (the enum lives in `packages/web-pm/src/pages/charter-staffing-editor.tsx:33`), `agent.workflow_runs.started_via` (a three-literal TypeScript union; the sibling `status` column on the same table does it correctly), and `hiring.candidate.segment`, which `read-candidates.ts:358` branches on with the magic literal `'alumni'`.

### S11 — Two identical reason taxonomies — **low**

`hiring.opening_close_reason` and `hiring.rejection_reason` are column-for-column identical except `rejection_reason.category`. And `requisition.close_reason_id` has a foreign key to the table named `opening_close_reason` — a requisition closed by an opening's reason type. One `reason(kind, label, category, active)` table would carry both.

---

## 2. The constitution

These rules constrain the code; they are not derivable from it. They were the normative half of the deleted `db-design.md`. **DB-4 moved every row that is a property of the migrated database to "gated".** Where a rule is gated by a catalog query, the rule id is the one in `packages/shared-testing/src/db-constitution.ts`.

| # | Rule | Enforcement |
|---|---|---|
| C1 | Every tenant-owned table carries `tenant_id uuid NOT NULL` and has RLS enabled **and forced**, with the uniform `app.tenant_id` policy. A small allowlist covers pre-tenant and cross-tenant-drain infra. | **Gated** — catalog: `rls-enabled-forced`, `rls-policy-uniform`, `tenant-id-shape`, `tenant-id-present`, and `schema-governed`, which stops a whole schema escaping the other rules by being absent from `OWNED_SCHEMAS`. Also ten `rls-census.test.ts` files, which prove a stranger sees no rows |
| C2 | Domain code reaches the database through a `NOBYPASSRLS` role. Cross-tenant access is an explicit, enumerable exception. | **Gated** — catalog: `app-role-privilege`, `app-role-grants`, `app-role-no-create`. Plus `runtime-privilege.test.ts` × 10; `executorPool()` throws outside a context; two `depcruise` rules confine `getPool` to `apps/*` and the pre-tenant escapes to `identity`. The exceptions are counted: six `maintenance()` calls, `preTenantAppPool()`, `preTenantAdminPool()` |
| C3 | Intra-schema foreign keys are mandatory with an explicit `ON DELETE`. **Cross-schema references stay bare `uuid` with no FK**; consistency is event-driven. | **Gated** — catalog: `no-cross-schema-fk`. Plus `lint:raw-sql`, `depcruise`, `schemaFilter` |
| C4 | One enum style: the `textEnum(column, values)` helper emits the Drizzle type and the `CHECK` from one definition. No bare-text status columns, no integer-coded enums. | Partly — source-level by necessity: after migration a `text` column with no `CHECK` is indistinguishable from a free-text one. `lint-db.mjs` catches inline enums, not bare `text()` holding a closed set (S10) |
| C5 | Every unique constraint on a tenant-scoped table leads with `tenant_id` — or, since a surrogate `id uuid` is unique across tenants by construction, with a `uuid`. | **Gated** — catalog: `tenant-scoped-unique` |
| C6 | Every mutable table has `created_at` / `updated_at timestamptz NOT NULL DEFAULT now()`, a shared `updated_at` trigger, and a `version integer NOT NULL DEFAULT 1` optimistic-concurrency column. `deleted_at` is the single soft-delete idiom. | **Gated** — catalog: `created-at-present`, `timestamp-shape`, `updated-at-trigger`, `version-column`. "Mutable" is read as *carries an `updated_at` trigger*, which the catalog can see |
| C7 | Money and effort columns are explicit `numeric(p,s)` with range `CHECK`s. Ordered pairs (start/end) are constrained. | **Gated** — catalog: `numeric-range-check`, `ordered-pair-check`. The ordering half is still universally absent (S6); every instance is baselined as debt |
| C8 | A projection ends `_projection`, carries `tenant_id` and `updated_at`, is keyed by the source aggregate's id, names its source module, and **rebuilds from `core.events` alone** — proven by a replay test. | Partly — catalog: `projection-shape` gates the columns; the replay contract is DB-3's, and remains false (S3) |
| C9 | The bus is the outbox: state change and event row commit in one transaction. Subscribers are idempotent on `event_id`. | Gated by design — `withEmit` + `core.subscription_processed` |
| C10 | Every table declares a lifecycle class in the `shared-db` registry. | **Gated** — catalog: `lifecycle-registered` |
| C11 | Mastra owns its own tables. All access flows through the containment repository. | **Gated** — `lint-mastra-access.mjs` matches every `mastra_*` table plus `memory_messages`. Not a catalog rule: Mastra creates these tables at runtime, so a migrated database does not contain them |
| C12 | Each module is one generated baseline plus hand-written SQL for what Drizzle cannot model. Never edit a committed migration. | **Gated** — drift check + migration-prefix lint |

---

## 3. Remediation program

Six sub-projects. Each gets its own spec, plan, and pull-request cycle. Production holds real tenant data: each takes a backup and runs its migration scripts out-of-band in a maintenance window.

| | Sub-project | Findings | Rules restored | Status |
|---|---|---|---|---|
| **DB-1** | Tenant isolation, made real | S1 | C2, C11 | **Done** — [#353](https://github.com/Seta-International/agent-platform/pull/353), [#361](https://github.com/Seta-International/agent-platform/pull/361), PR4 ([FUT-549](https://all-it.atlassian.net/browse/FUT-549)) |
| **DB-2** | Collapse the `person` / `worker` identity | S2 | — | Not started |
| **DB-3** | The event-replay contract, made real | S3 | C8 | Not started |
| **DB-4** | A gate that reads the database | S4 | C1, C2, C3, C5, C6, C7, C8, C10 | **Done** — [FUT-552](https://all-it.atlassian.net/browse/FUT-552) |
| **DB-5** | Charter as a project lifecycle state | S5 | C3 | Not started |
| **DB-6** | Mechanical sweep | S6–S11 | C4, C6, C7 | Not started |

**DB-1** went first: production is live, and it is the only finding whose cost of delay is a cross-tenant leak — a leak that turned out to already exist, in `knowledge_searchDocuments`. Its shape is an executor refactor across all ten modules: domain code stops resolving its own pool and instead reads an ambient executor whose privilege and tenant scope were decided by the caller. Two constructors live in the composition root and nowhere else: `scoped(tenantId)` on the `seta_app` role with the GUC set, and `maintenance()` on the admin role for the legitimately cross-tenant jobs. It needed no migration and no maintenance window — the policies and `seta_app` grants already existed in every baseline; the code simply never connected to them. It is now complete: all ten modules resolve `executorPool()`, each gated by a `runtime-privilege.test.ts`, and `getPool` is illegal outside the composition root, enforced by `.dependency-cruiser.cjs`.

Two things DB-1 is worth remembering for. First, **the audit undercounted, twice**: the actual leak was in an agent tool that bypassed its module's client entirely, and the six modules the review flagged as at-risk were never leaking at all. Reading `db/client.ts` told us less than we thought, in both directions. Second, **fail-closed found what review could not.** Seven live production bugs — an authentication bypass, a broken webhook ingress, a boot crash, a connection-pool deadlock — sat behind a green test suite for as long as the code could silently obtain a superuser connection. Not one was found by reading. Every one announced itself the moment a missing context stopped being survivable. That is the argument for `executorPool()` throwing rather than defaulting, and it is the argument for **DB-4**.

**DB-4** was the one that stops this document from being written again, and it went second for the reason DB-1 had just demonstrated: every rule in §2 that is a property of the migrated database — RLS coverage, `version` columns, `updated_at NOT NULL`, range `CHECK`s, lifecycle registration — is now a query rather than a paragraph, so DB-2, DB-3, DB-5 and DB-6 are checked on the way in rather than audited afterwards.

It earned its keep before it shipped. Pointing the gate at the catalog rather than at `schema.ts` turned up a lost update in `planner.group_join_requests` that this review had read past, and asking whether the `seta_app` grants had actually landed turned up that on a cluster where the role is created *after* the migrations run — which is what every module baseline's `IF EXISTS (… rolname = 'seta_app')` guard silently permits — **all 92 owned tables end up with no grants at all**. Both are the same lesson as S1's: the schema files describe what someone meant, and only the database knows what happened.

The rules it could not make executable are worth naming, because they are where the next drift will start. `textEnum` (C4) and Mastra containment (C11) are source rules and stay source rules. The projection replay contract (C8) is a behaviour, not a shape, and remains DB-3's. And the gate reads a *migrated* database, so it cannot see `people_rag` or the thirty-six `mastra_*` tables, which Mastra creates at runtime.
