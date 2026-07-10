# Database review — findings and remediation program

A senior-architect review of the database across all ten module schemas, conducted against the code, the CI gates, and a live migrated database. Every claim below carries evidence.

This document replaces `db-design.md`, which was deleted. That file had two halves. The **descriptive** half — table inventories, the cross-module reference map, the projection census, ER diagrams, the lifecycle registry — was a hand-maintained copy of `schema.ts`, and it is where every drift finding in this review originated. The code and [`review-schema.sql`](./review-schema.sql) already say all of it, and they cannot lie. The **normative** half was the constitution: rules that constrain the code rather than describe it. Those rules are preserved in §2 below, and DB-4 makes each one executable. A rule that CI checks does not rot; a rule in a markdown file does.

Read the schema files for column-level truth. Read [`ddd-design.md`](./ddd-design.md) for the event backbone. Read this document to know what is broken and why.

---

## 1. Findings

Ranked by blast radius. `S1`–`S3` are architectural and each needs its own design cycle. `S4` is what stops the drift recurring. `S6`–`S11` are mechanical.

### S1 — The RLS backstop is inert for four of the ten modules — **critical** · *fixed, in review ([#353](https://github.com/Seta-International/agent-platform/pull/353))*

Every tenant-owned table has row-level security enabled and forced, with a uniform `tenant_id = current_setting('app.tenant_id')` policy. Ten `rls-census.test.ts` files (one per module) prove those policies are configured correctly: `assertRlsCensus` creates a `NOBYPASSRLS` role in a test container and asserts every tenant-scoped table is tenant-blind to a stranger.

**Nothing asserts that production connects as that role.** Four modules resolve their database client from the admin pool:

| module | db client | pool | role |
|---|---|---|---|
| `identity`, `planner`, `knowledge`, `agent` | `identityDb()`, `plannerDb()`, … | `getPool('worker')` | `seta` — `superuser=t`, `bypassrls=t` |
| `core`, `people`, `hiring`, `pm`, `integrations`, `notifications` | `coreDb()`, … | `getPool('web')` | `seta_app` — `NOBYPASSRLS` |

`packages/planner/src/backend/db/index.ts:13` and its peers. `packages/shared-db/src/pools.ts` gives the worker pool `cfg.databaseUrl`; `pg_roles` confirms `seta` is `superuser=true bypassrls=true`.

So **31 of the 77 RLS-protected tables carry a policy that never executes at runtime.** A forgotten `WHERE tenant_id` in `planner` or `agent` leaks across tenants exactly as if RLS had never been written. The census proves the lock works; nothing proves the door is used. This is why a green test suite coexisted with the defect.

Verified against production configuration: `DATABASE_APP_URL` exists as a `prod` environment secret, and the session middleware pins a GUC-set connection on the web-pool facade for the life of each request. The mechanism was real and working — for six modules. (At the time of the review the wrapper was a standalone `runRequestTenant` middleware in `apps/server`; DB-1 moved it into `createSessionMiddleware`, because building the session scope itself reads tenant-scoped tables.)

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

Still open after #353: **PR3** moves the six correct-but-inconsistent modules onto `executorPool()`; **PR4** deletes `getPool` from the `shared-db` public surface, adds the `.dependency-cruiser.cjs` rule confining it to `apps/*`, and adds a static guard that both composition roots pass `appDatabaseUrl`. Until PR4, `getPool` remains exported and deprecated.

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

### S4 — The governance gate cannot see what matters — **high**

`pnpm lint:db` passes clean. That is not evidence of health.

- **It parses only `schema.ts` files** (`scripts/lint/lint-db.mjs`, `schemaFiles()`), never `.sql`. `knowledge.chunks` — a LIST-partitioned table with a composite foreign key — exists *only* in hand-written SQL and is invisible to both `lint:db` and the drizzle drift check. Any table can escape governance by being born in a `.sql` file.
- **It checks four things**: missing `tenant_id` (R1), inline text-enums (R2), non-tenant-led uniques (R3), missing `created_at` (R4). It does not check `updated_at`, `version`, or — most importantly — the runtime privilege of the connection, which is the actual defect in S1.
- The 36-entry baseline in `scripts/lint/lint-db-baseline.json` is legitimate. All 36 are junction tables, projections, or infra tables that name their timestamp `occurred_at` / `built_at` / `attempted_at`. Nothing was smuggled in.

Two smaller inconsistencies. Migration layouts diverge — `identity`, `planner`, `agent` use `packages/<m>/drizzle/`, the other seven use `packages/<m>/drizzle/migrations/`. The runner (`packages/shared-db/src/migrate.ts`) handles both because each `register.ts` supplies its own path, so this is convention drift rather than a bug. And the constitution's own worked example was wrong: it named `worker_history` as a `created_at`-only append-only table; the column is called `at`.

### S5 — `pm.project` ↔ `pm.charter`: a circular FK over a 12-column clone — **medium**

Both foreign keys exist, both `ON DELETE SET NULL`. `charter` duplicates twelve domain columns from `project`: `account_id`, `name`, `objective`, `scope`, `budget_bmm`, `pm_worker_id`, `pmo_worker_id`, `team_size`, `methodology`, `pricing_model`, `date_from`, `date_to`. `bodApproveCharter` (`packages/pm/src/backend/domain/decide-charter.ts:120-137`) copies all twelve field-for-field into the `project` insert.

No trigger, constraint, or exclusion keeps `project.charter_id = C` in agreement with `charter.project_id = project.id`. They stay consistent only because exactly one function writes both, in one transaction, by convention. Nothing prevents the next writer, migration, or operations script from silently desynchronizing the pair.

The charter is not a separate aggregate. It is a pre-approval draft of the project.

### S6 — No start/end ordering constraint exists anywhere in the database — **medium**

`pm.project`, `pm.charter`, `pm.allocation`, `people.employment_period`, `people.worker` (`work_start`/`work_end`), `hiring.requisition`, and `people.worker_allocation_projection` each carry a start/end pair. **None** has a `CHECK (end >= start)`. `allocation_committed_dates_check` only asserts `date_from IS NOT NULL`.

Given the constitution's care with `numeric(p,s)` range checks and `weekday_mask BETWEEN 0 AND 127`, this is a conspicuous and systematic omission.

### S7 — Dead columns, and two aggregates that were never built — **medium**

The deleted `db-design.md §3` listed **"resource request"** as a cross-module target aggregate. No `resource_request` table exists in any schema. Neither does `position`.

| column | reality |
|---|---|
| `pm.allocation.resource_request_id` | never written, never read — yet carries a partial unique index |
| `pm.allocation.weekday_mask` | zero references outside the schema — yet carries a `CHECK` |
| `pm.allocation.minutes_per_day` | written on create, never read |
| `hiring.opening.resource_request_id`, `.position_id` | a write path exists; the only caller passes `{}`. Always NULL. |

`pm.allocation` therefore carries three representations of effort — `planned_pct`, `minutes_per_day`, `weekday_mask` — only one of which is live.

### S8 — Optimistic concurrency is missing where contention is highest — **medium**

Thirty-one mutable tables lack the mandated `version` column. Most are projections or junctions, which is fine. These are not:

- **`integrations.m365_group_links` / `m365_plan_links`** — `sync_status`, `delta_link`, and `last_synced_at` are mutated by concurrent sync workers. No `version`. This is precisely the lost-update scenario the guarded-UPDATE recipe exists to prevent.
- **`knowledge.files`** — a seven-state status machine driven by asynchronous jobs. No `version`.
- **`planner.task_comments`** — no `version`, and `updated_at` is **nullable with no default**, the only table in the database violating `NOT NULL DEFAULT now()`. Its trigger is `BEFORE UPDATE` only, so a comment that is never edited keeps `updated_at = NULL` forever.

`task_comments` breaks the constitution's letter in three ways at once and is caught by none of R1–R4. It is the natural canary for any new gate: a rule that does not flag it is not working.

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

These rules constrain the code; they are not derivable from it. They were the normative half of the deleted `db-design.md`. Each is listed with its current enforcement status. **DB-4 exists to move every row in this table to "gated".**

| # | Rule | Enforcement today |
|---|---|---|
| C1 | Every tenant-owned table carries `tenant_id uuid NOT NULL` and has RLS enabled **and forced**, with the uniform `app.tenant_id` policy. A small allowlist covers pre-tenant and cross-tenant-drain infra. | **Gated** — ten `rls-census.test.ts` files |
| C2 | Domain code reaches the database through a `NOBYPASSRLS` role. Cross-tenant access is an explicit, enumerable exception. | **Gated for the four modules that bypassed it** — `runtime-privilege.test.ts` × 4; `executorPool()` throws outside a context. The exceptions are enumerable: `identityAuthDb()`, `MAINTENANCE_JOBS`, `apps/cli`. Fully gated when PR4 lands the `depcruise` rule |
| C3 | Intra-schema foreign keys are mandatory with an explicit `ON DELETE`. **Cross-schema references stay bare `uuid` with no FK**; consistency is event-driven. | Partly — `lint:raw-sql`, `depcruise`, `schemaFilter` |
| C4 | One enum style: the `textEnum(column, values)` helper emits the Drizzle type and the `CHECK` from one definition. No bare-text status columns, no integer-coded enums. | Partly — R2 catches inline enums, not bare `text()` holding a closed set (S10) |
| C5 | Every unique constraint on a tenant-scoped table leads with `tenant_id`. | **Gated** — R3 |
| C6 | Every mutable table has `created_at` / `updated_at timestamptz NOT NULL DEFAULT now()`, a shared `updated_at` trigger, and a `version integer NOT NULL DEFAULT 1` optimistic-concurrency column. `deleted_at` is the single soft-delete idiom. | Partly — R4 checks `created_at` only. Nothing checks `updated_at` or `version` (S8) |
| C7 | Money and effort columns are explicit `numeric(p,s)` with range `CHECK`s. Ordered pairs (start/end) are constrained. | **Not gated** — and the ordering half is universally absent (S6) |
| C8 | A projection ends `_projection`, carries `tenant_id` and `updated_at`, is keyed by the source aggregate's id, names its source module, and **rebuilds from `core.events` alone** — proven by a replay test. | **Not gated, and false** (S3) |
| C9 | The bus is the outbox: state change and event row commit in one transaction. Subscribers are idempotent on `event_id`. | Gated by design — `withEmit` + `core.subscription_processed` |
| C10 | Every table declares a lifecycle class in the `shared-db` registry. | Partly — the registry is code, but nothing asserts coverage |
| C11 | Mastra owns its own tables. All access flows through the containment repository. | **Gated** — `lint-mastra-access.mjs` now matches every `mastra_*` table plus `memory_messages` |
| C12 | Each module is one generated baseline plus hand-written SQL for what Drizzle cannot model. Never edit a committed migration. | **Gated** — drift check + migration-prefix lint |

---

## 3. Remediation program

Six sub-projects. Each gets its own spec, plan, and pull-request cycle. Production holds real tenant data: each takes a backup and runs its migration scripts out-of-band in a maintenance window.

| | Sub-project | Findings | Rules restored | Status |
|---|---|---|---|---|
| **DB-1** | Tenant isolation, made real | S1 | C2, C11 | Executor + the four broken modules in review ([#353](https://github.com/Seta-International/agent-platform/pull/353)); PR3 + PR4 open |
| **DB-2** | Collapse the `person` / `worker` identity | S2 | — | Not started |
| **DB-3** | The event-replay contract, made real | S3 | C8 | Not started |
| **DB-4** | A gate that reads the database | S4 | C6, C7, C10, and the rest of this table | Not started |
| **DB-5** | Charter as a project lifecycle state | S5 | C3 | Not started |
| **DB-6** | Mechanical sweep | S6–S11 | C4, C6, C7 | Not started |

**DB-1** went first: production is live, and it is the only finding whose cost of delay is a cross-tenant leak — a leak that turned out to already exist, in `knowledge_searchDocuments`. Its shape is an executor refactor across all ten modules: domain code stops resolving its own pool and instead reads an ambient executor whose privilege and tenant scope were decided by the caller. Two constructors live in the composition root and nowhere else: `scoped(tenantId)` on the `seta_app` role with the GUC set, and `maintenance()` on the admin role for the legitimately cross-tenant jobs. It needed no migration and no maintenance window — the policies and `seta_app` grants already existed in every baseline; the code simply never connected to them. Remaining: PR3 moves the six already-correct modules onto the same idiom, and PR4 makes `getPool` illegal outside the composition root, enforced by `.dependency-cruiser.cjs`.

**DB-4** is the one that stops this document from being written again. Today `lint:db` reads `schema.ts`; it should read `pg_catalog` after `db:migrate`. Every rule in §2 that is a property of the migrated database — RLS coverage, `version` columns, `updated_at NOT NULL`, range `CHECK`s, lifecycle registration — becomes a query rather than a paragraph.
