# Seta — Requirements (v1 scope)

**Status:** v1 requirements closed (2026-05-19); architecture phase complete same day — all 11 §21 unknowns resolved, full architecture spec lives in `docs/architecture.md`. Scope expanded same day along three coordinated axes — user skills + availability (§3.9), Mastra agent/chat/RBAC architecture (§7.1b–§7.1e), and a Timesheet MCP integration for external availability data (§7.1d). New `org.viewer` cross-group read role added (§4.4). Accounts entity deferred with schema hook in `groups.account_id` (§2.3, §11.2). Domain event bus fixed as transactional outbox + Postgres `LISTEN/NOTIFY` (§1.6.5a). **Architecture reframed from multi-app to modular monolith with strict, enforced module boundaries (§1.6).** v1 ships one container; per-module extraction is documented as a v1.x+ playbook (§1.6.12) gated on real scaling pain. Module boundary discipline (schema-per-module, no cross-schema reads, public-API surfaces, no cross-module FKs) is enforced by tooling, not convention. Future business modules (`timesheet`, `pmo`, `okrs`, etc.) slot in via §1.6.3 with zero changes to existing modules. **Sync conflict resolution pinned (§6.3): field-level "Seta wins" with `last_pushed_field_values` snapshot — not timestamp LWW.** **Flagship demo runs on agent composition over atomic primitives (§7.2), not macro tools** — `skill_tags` (§5.1) and `review_state` (§5.3) are optional refinements (default empty/null is the common case); the agent reasons primarily over `title` + `description` via semantic retrieval + LLM filter pass. Skill matching uses embedding similarity + assignment-history inference (§3.9.1), not a hand-curated concept map. Aligned with Mastra's agent-vs-workflow guidance (small composable tools for adaptive reasoning; deterministic step graphs only for system pipelines, §7.1f). Six §12.1 residuals closed inline (Entra-removed-user detection, idle-session timeout, failed-login threshold + notification, audit-permission separability, IdP recompute cadence, import-recent windows). All foundational decisions resolved. Deferred capabilities with v1 architectural hooks in §11. Ready for architecture phase.

**Flagship v1 use case (drives §3.9 + §7.2 scope):** *"Show me tasks that need review on a given topic (e.g., infrastructure) and recommend available people in this tenant with matching skills."* This is the canonical demo of the "AI-first work management" framing in §1. The agent answers it by composing atomic read primitives at runtime — `search_tasks_semantic`, `list_tasks`, `infer_task_topics`, `match_users_to_topic`, `infer_user_skills_from_history`, `compute_workload`, `get_leave_overlap`, `get_user_availability` — over the natural-language content of tasks and the assignment-history graph. No `recommend_reviewers` macro tool; the LLM is the orchestrator. The demo works whether or not users tag tasks (`skill_tags`) or set `review_state` — those are optional pinning signals. v1 still includes a user skill profile (HR-curated, trusted when present; augmented by assignment-history inference), a multi-factor workload score (tenant-configurable weights), an MCP timesheet hook for leave-aware availability, and an `org.viewer` role so leadership can see across all projects without being god-admin.

---

## 1. What this is

An **open-source, production-ready, multi-tenant AI-first work-management platform**. v1 ships a Microsoft Planner-style task management module with an embedded AI copilot, multiple authentication options, and bidirectional-capable sync to external work trackers (Microsoft 365 Planner first).

The product targets organizations that want a more capable, AI-native alternative to MS Planner while keeping their existing Microsoft 365 investment.

**Naming convention used in this doc:**
- **The platform** — the OSS software itself. Anyone can self-host an instance.
- **Instance** — a running deployment of the platform (could be Seta International's hosted instance, a customer's self-hosted instance, anything in between).
- **Tenant / org / organization** — a customer organization within an instance. All business data is scoped to one tenant.
- **Seta / Seta International** — the outsourcing company that maintains the OSS project and operates the first reference instance. Seta International itself is *one tenant* of that instance — they dogfood the platform.

This three-level structure (instance → tenants → users) is core. Every requirement below assumes it.

---

## 1.5 Technical foundations (chosen)

These are fixed constraints, not open decisions. They shape the option space for everything that follows.

- **Monorepo:** Turborepo.
- **Backend HTTP framework:** Hono.
- **Database:** PostgreSQL via Drizzle ORM.
- **AI / agent framework:** Mastra.
- **Cloud:** AWS.

Implications worth noting up front:
- Hosting on AWS rather than Azure means Microsoft Graph / Entra calls cross a cloud boundary. No technical blocker, but data-residency posture and latency budgets must account for it.
- Postgres is the system of record. Anything that argues for a different store (search index, vector store, queue, blob) is an *addition*, not a replacement.
- Mastra is the agent orchestration layer; the AI section's "copilot routes intent across domain specialists" pattern is expressed in Mastra primitives.

---

## 1.6 Module architecture — modular monolith with strict boundaries (decided)

The platform is structured as a **modular monolith**: one process, one container, one Hono app, one frontend bundle — organized as **strictly-bounded modules** as Turborepo packages. Modules cannot reach into each other's data, mutate each other's state, or hold references to each other's internals. The only legal cross-module surfaces are (a) typed function calls into another module's *public* API, and (b) domain events on the shared bus (§1.6.5a).

The single-process deployment shape is a v1 choice driven by §10.2 scale targets and the OSS / self-hosted audience. The **boundary discipline is not a v1-only choice** — it is load-bearing for every future business module (`timesheet`, `pmo`, `time-tracking`, `okrs`, …) and for any future need to extract a module to its own process (§1.6.12).

Everything in §4 (authorization), §5 (Planner), §6 (Integrations), §7 (Copilot), §9 (Admin), §10 (Deployment) is described per-module and lands behind this contract.

### 1.6.1 v1 module inventory

Modules fall into three categories. The taxonomy matters because future business modules slot in alongside `planner` — not inside it.

| Category | Module | Owns | Backed by |
|---|---|---|---|
| **Platform** | `core` | Tenant lifecycle, audit log, domain-event bus, role-registry aggregation, session middleware library, common UI shell (header, app launcher, notifications, copilot panel slot), tenant-level operations | §2, §8, §9 |
| **Platform** | `identity` | Auth providers, sessions, user profile (incl. §3.9 skills + availability), role grants, IdP-group→role mappings | §3 |
| **Business** | `planner` | Groups, plans, buckets, tasks, assignments, comments, attachments, skill_tags | §5 |
| **Capability** | `copilot` | Mastra runtime, chatflow + workflow execution, MCP integrations (Timesheet), tool registry | §7 |
| **Capability** | `integrations` | Planner sync connectors, future sync connectors, MCP server configuration UI | §6 |

**Why the three-way split matters.** Platform modules underpin everything; they hold no domain knowledge of work management. Business modules own product surface and a piece of the domain model. Capability modules wrap horizontal capabilities (AI orchestration, external system integration) consumed *by* business modules.

**Future business modules (v1.x+) — each is a peer of `planner`, not a child.**

- `timesheet` — if/when Seta builds its own timesheet (currently consumed externally via MCP per §7.1d). Ships as a new module with its own schema, its own tasks/leave/capacity entities, its own role bundle (`timesheet.admin`, `timesheet.contributor`, `timesheet.viewer`).
- `pmo` — cross-project governance, account rollups, capacity planning for outsourcing orgs. The §11.2 accounts entity is its primary data seam.
- `docs` / `wiki`, `time-tracking`, `okrs`, `crm` — per §11.3.

Adding any new business module is the playbook in §1.6.3. **Existing modules are not modified.**

### 1.6.2 What "strict module boundaries" means concretely — and how they are enforced

This is the design contract. It is **enforced by tooling**, not aspirational.

**The five rules.**

1. **One Turborepo package per module.** `packages/core`, `packages/identity`, `packages/planner`, `packages/copilot`, `packages/integrations`. A module's source code lives nowhere else.

2. **Schema-per-module in shared Postgres.** Schemas `core`, `identity`, `planner`, `copilot`, `integrations`. Each module's Drizzle config targets *only* its own schema. Migrations live in the module's package.

3. **No cross-schema reads.** A module's SQL queries reference only tables in its own schema. The `planner` module does not `SELECT FROM identity.users` — even though both tables sit in the same Postgres instance. The only exception is `core` itself, which legitimately reads `core.events` (which carries audit per D6) on behalf of all modules.

4. **No cross-module imports of internals.** Each module exposes a public surface (function exports from `packages/<module>/src/index.ts`); everything else is private. Other modules import only from the package root (e.g., `@seta/identity`) or its `/events` subpath. The `planner` module cannot `import { internalThing } from '@seta/identity/src/internals'`.

5. **No cross-schema foreign keys.** Database constraints are intra-schema only. A `planner.tasks.assignee_id` does not declare a FK to `identity.users.id`; it stores a plain `bigint`. Consistency is event-driven (`identity.user.deactivated` → `planner` cleanup handler).

**How each rule is enforced.**

- **ESLint boundary rule** (custom). Scans every import in `packages/X/src/**` and rejects imports from `packages/Y/src/!(index.ts|events)/**`. Build-failing CI gate.
- **Drizzle schema scoping.** Each module's Drizzle config sets `schemaFilter: ['<module>']`. Cross-schema reads fail at the type level.
- **Raw-SQL audit.** CI grep-check rejects any `FROM <other_module>.` or `JOIN <other_module>.` in module sources. Allowed only inside `packages/core/src/audit/` and `packages/core/src/events/` (which legitimately span schemas).
- **Public-API integration test.** Each module ships a test suite that exercises only its public API. CI runs it with the *other* modules' source paths excluded from the resolver. A private cross-module dependency fails the test.

Without enforcement, the rules become aspirational and modules congeal within a year. These checks are v1 architecture-phase deliverables, not a v1.x cleanup.

### 1.6.3 Adding a new business module — the playbook

When v1.x adds `timesheet`, `pmo`, or any other module, the path is fixed and existing modules need zero changes:

1. Create `packages/<new-module>/` as a new Turborepo workspace.
2. Add schema `<new-module>` to Postgres; Drizzle migrations live in the package.
3. Define the module's tables; no FK references to other modules' tables.
4. Expose `packages/<new-module>/src/index.ts` — the typed function-level API other modules may call. RBAC re-checked at each public entry point.
5. Subscribe to whatever cross-module events the module needs; maintain local read-model projections in the module's own schema.
6. Emit `<new-module>.<entity>.<verb>` events on every state change (§1.6.5a).
7. Contribute Hono routes under `/api/<new-module>/v1/...` (registered with `core` at app boot).
8. Contribute roles + permissions to the role registry (`<new-module>.admin`, `<new-module>.contributor`, `<new-module>.viewer`).
9. Contribute frontend SPA pages to the shell as route slots (`/<new-module>/*`).
10. Contribute copilot tools (§7.1b) if the module wants the copilot to act on its domain.

**What is NOT required:** a manifest schema, a service-token handshake, a dynamic app registry. Modules register their contributions through plain code — direct imports from `core`'s role/route/tool/subscriber registration APIs at app boot. The "manifest" abstraction was overkill for a single-process world; it returns as v2 only if a plugin framework arrives (§1.6.9). (Architect review 2026-05-19 re-affirmed this against an earlier architecture.md §C draft that proposed declarative manifests; §C is reverted to match this section.)

### 1.6.4 Module public surface — what crosses the boundary

Each module's `packages/<module>/src/index.ts` is the only legal cross-module entry point. It exposes:

- **Typed function exports.** Inputs/outputs are TypeScript types defined in `src/index.ts`. The function body may delegate to internals; the type signature is the contract. Side effects must be scoped to the module's own schema and its own event emissions.
- **Event-payload TypeScript types** for events the module emits. Importing modules use these types to write typed subscribers.
- **Route registration** — a function that returns the Hono sub-router for the module's HTTP API (`/api/<module>/v1/...`), mounted by `core`'s composition layer at app boot.
- **Role + permission registration** — an array of role definitions (slug, permission list) registered with `core`'s role registry at app boot.
- **Copilot tool registration** (§7.1b) — array of tool definitions registered with `copilot`'s tool registry. Tools are thin wrappers over the module's own public functions (no duplicate business logic).
- **Frontend route registration** — SPA route definitions (path, component, role gates) registered with the shell at app boot.
- **Event subscriber registration** — handlers the module wants invoked for specific event types, registered with the event-bus subscriber framework.

**Not allowed across the boundary:**

- Re-exporting types from internals. If a type leaks an internal entity shape, it stays in `internals/`.
- Shared utilities that live in module A and are imported from module B. Cross-module utilities live in `packages/shared/` (UI primitives, type helpers) or in `core` (event bus, role registry, session middleware).
- Direct database handles. A module never hands its Drizzle client to another module.
- Mutating state callbacks. A module never registers a callback that another module invokes to mutate it — mutation happens through the public API, not through callback registration.

### 1.6.5 Inter-module communication

In a modular monolith, the synchronous boundary is in-process; no HTTP between modules, no JWTs in v1.

- **Synchronous:** typed function calls into another module's public API surface (§1.6.4). RBAC is **re-checked at the callee's public entry point** — the caller's claim of "this user has X permission" is not trusted; every public function runs the permission-check function (§11.1) using the *authenticated session's* identity carried in the request context.
- **Asynchronous:** domain events on the shared bus — full mechanism in §1.6.5a. Modules emit `<module>.<entity>.<verb>` events; subscribers run in the same process but operate from their own module's schema only. Bus delivery is at-least-once with per-aggregate ordering; subscribers must be idempotent (already required for workflows, §7.1f).
- **No shared mutable state.** Modules do not read each other's database schemas directly. Modules may maintain **read-model projections** populated from events (e.g., `copilot` keeping a denormalized "user availability" cache from `identity.user.profile.updated` and `identity.user.deactivated` events) inside their own schema for performance.
- **No service-identity JWTs in v1.** Cross-module calls are in-process function calls; no token boundary exists. (Service tokens at the boundary become relevant only under extraction — see §1.6.12.)

### 1.6.5a Domain event bus — transactional outbox in Postgres (decided)

The bus referenced throughout this doc (§1.6.5, §7.1e, §7.1f, §8.1, §11.3, §11.5) is a **single design**, fixed below.

**Mechanism: transactional outbox + `LISTEN/NOTIFY` wakeup.** Every state-changing handler writes an event row to `core.events` **inside the same database transaction** as the state change. After commit, a deferred trigger fires `pg_notify('events', ...)`. Subscriber loops `LISTEN` on that channel and immediately read new rows. A fallback poll (~2s) covers dropped NOTIFY (replica lag, connection blip). No separate "publish" call exists; emission cannot diverge from state.

This kills both classic event-bus bugs:
- *Lost events* (state committed, publish failed) — impossible: event lives in the same tx.
- *Phantom events* (publish succeeded, state rolled back) — impossible: rollback drops the event row.

**Why this and not alternatives.**

| Option | Why rejected |
|---|---|
| Pure `LISTEN/NOTIFY` (no outbox) | No durability; payload <8KB; fan-out tied to live connections. |
| SNS/SQS | Adds AWS-runtime dependency in app code, breaking §11.7 on-prem hook. Splits truth between Postgres and SQS, complicating recovery. |
| Kafka / NATS / Redis Streams | Operationally heavy for v1 scale (§10.2). Not worth the infra footprint. |
| In-process emitter only | Works for single-process v1, but couples emitters to subscribers in the same process — losing durability and replay (audit retention also lives here per D6). |

Outbox is correct, durable, requires no new infra, and is swap-out-able to a managed broker later by replacing one process (the dispatcher) — without touching emit sites. (Cross-process extraction in §1.6.12 reuses the same outbox unchanged.)

**Schema (`core.events`).**

```
core.events (
  id uuid PK,
  occurred_at timestamptz NOT NULL,
  tenant_id uuid NOT NULL,
  aggregate_type text NOT NULL,    -- 'planner.task', 'identity.user'
  aggregate_id text NOT NULL,
  event_type text NOT NULL,        -- 'planner.task.created'
  event_version int NOT NULL,
  payload jsonb NOT NULL,
  caused_by_user_id uuid,
  caused_by_event_id uuid,         -- causation chain
  trace_id text                    -- W3C traceparent
) PARTITION BY RANGE (occurred_at);
```

- Partitioned by month. Old partitions detach + archive to S3 after the replay window (default 30 days, operator-configurable).
- Indexed on `(aggregate_type, aggregate_id, occurred_at)` for ordered reads, and on `id` for cursor lookup.
- Causation chain (`caused_by_event_id`) is optional but cheap; enables tree-shaped reconstruction in observability and doubles as the §11.6 hash-chain seed if SOC 2 ever calls for tamper-evidence.

**Audit and events share one table (D6, architect review 2026-05-19).** Earlier drafts kept `core.events` and `core.audit` separate ("subscribers want stable shape; audit wants full actor + diff"). On review we collapsed them — fewer code paths, one source of truth, no double-insert per state change. The event payload contract gains standard `actor`, `before`, `after`, `ip`, `user_agent` fields; subscribers tolerate unknown payload fields (already required by the versioning policy). Audit queries become read-time projections over `core.events` (or a thin Postgres view `core.audit_v` for ergonomics). The §11.6 hash-chain tamper-evidence hook moves onto `core.events`. The §10.1 DSR pseudonymization-in-place targets event rows.

**Delivery semantics.**

- **At-least-once** with per-aggregate ordering. Events for the same `aggregate_id` are delivered in commit order; events across aggregates may arrive in any order.
- Subscribers are responsible for idempotency, keyed by `event_id`. This is already mandated for workflows in §7.1f and is now the cross-bus rule.
- Each subscription stores `(subscription_name, last_processed_event_id)` and advances at its own pace. Independent fan-out, independent backpressure. A slow subscriber cannot delay a fast one.

**Subscriber runtime — v1 and beyond.**

- **v1 (modular monolith):** subscribers run in-process inside the single container, each module's subscriber framework reading from `core.events` against its own cursor.
- **Per-module DB isolation (future operator option):** modules may eventually be split onto separate Postgres instances for their own schema data, but `core.events` (which now also carries audit per D6) **must remain a shared Postgres**. Documented constraint. Full per-module DB isolation including the bus is out of v1 scope and likely out of v1.x. Extraction details: §1.6.12.

**Emit-site contract.**

- The framework (in `core`) provides a single `emit(event)` API. Handlers in every module call this; the framework writes the outbox row in the active transaction. There is no synchronous publish path.
- `trace_id` is captured automatically from the active OpenTelemetry context (§11.6 hook). Handlers do not pass it explicitly.
- `caused_by_event_id` is set automatically when an event is emitted from within an event handler's transaction (subscriber framework threads it through).

**Event versioning.**

- `event_version` is required from day one. Subscribers declare the versions they handle.
- Non-breaking field addition: bump minor, old subscribers ignore unknown fields (jsonb makes this free).
- Breaking change: new `event_type` (`planner.task.created.v2`) or new `event_version`, dual-write for a window, retire the old.
- The schema-evolution policy is a v1 architectural rule, not a future task.

**Risks flagged (not mitigated in v1).**

- **Single-DB bottleneck at high scale.** v1 scale targets (§10.2) are well within Postgres comfort. A tenant 10× over targets makes `core.events` hot. v1.x mitigations: logical replication for read fan-out, per-tenant shards, or dispatcher swap to SNS/SQS.
- **Noisy-neighbor.** A bulk import at tenant A inflates the global event stream; subscribers from tenant B see delayed delivery. Subscribers shard by `tenant_id` in their cursor logic to bound this — implementation detail, not architectural change.
- **Trace propagation discipline.** `trace_id` is only useful if every emit site captures the active trace context. The app framework's `emit()` must do this automatically — handlers cannot be trusted to pass it manually.

**v1.x and beyond hooks (no v1 work, but unblocked).**

- **Outbound webhooks (§11.9):** a subscriber that translates events to HTTP POSTs against operator-configured targets. No core change.
- **SIEM streams (§11.6):** another subscriber type emitting NDJSON to syslog/Splunk/Datadog. No core change.
- **Hash-chained tamper-evident audit (§11.6):** `core.events` adds `prev_hash` (audit lives there per D6); emit-time computes it from the prior row in the same partition. Schema change only.
- **Cross-instance federation (no commitment):** the dispatcher process is the swap point; logical replication of `core.events` or a broker replaces the in-process LISTEN loop.

### 1.6.6 Database isolation (v1)

- **Single Postgres instance, schema-per-module.** v1 default. Schemas: `core`, `identity`, `planner`, `copilot`, `integrations`. The schema-per-module discipline is the **single most important data seam** — it is what makes future business-module additions (§1.6.3) and future module extraction (§1.6.12) feasible without surgery.
- **No cross-schema reads** (§1.6.2 rule 3). A module's queries reference only its own schema. The sole legitimate cross-schema readers are `core`'s audit and event-bus internals.
- **No cross-schema foreign keys** (§1.6.2 rule 5). Cross-module references store plain IDs (`bigint`, `uuid`); validation is at the application layer, eventual consistency via events (`identity.user.deactivated` → `planner` cleanup handler).
- **Per-module migration ownership.** Each module owns its schema migrations; the app's deploy orchestrator runs them at boot in dependency order (`core` first — `core.events` must exist before any other module emits — then `identity`, then everything else).
- **Per-module Postgres isolation is not a v1 concern.** A future operator who wants `planner` on a separate Postgres from `copilot` runs into the constraint that `core.events` (which carries audit per D6) must remain shared (§1.6.5a). That is a v1.x+ scenario.

### 1.6.7 Deployment shape (v1: single container)

v1 ships **one deploy unit**: a single container running all modules in-process.

- **Container.** One image, one process. The Hono app at boot loads each module's contributions (routes, event subscribers, role registrations, copilot tools, frontend mounts) via direct code imports — no manifest layer, no runtime registry.
- **Scaling.** Horizontal replicas of the single container behind a load balancer. Postgres handles state. All modules scale together. v1's §10.2 targets (1k users / tenant, 100 tenants, 100k tasks / tenant) do not require per-module scaling.
- **Operator deploys** (per §10.5): `docker compose up` for evaluation; ECS / Fargate for production-grade AWS. Reference Terraform / CDK ships in the repo.
- **Per-module containers are NOT a v1 deployment mode.** They are an extraction scenario (§1.6.12) if a future operator hits scaling or blast-radius pain. The contract that enables extraction is the §1.6.2 boundary discipline, not a deployment shape.
- **Operator-omits-modules: NO in v1.** Every instance ships every module. Per-tenant *runtime* module enablement is v1.x (§11.2) and is distinct from deployment-time selectivity.

### 1.6.8 Frontend shell (in `core`)

- **Shell** owns: top navigation, app launcher (Google-style grid), tenant context, copilot panel slot, notification center, global search.
- **Modules** own: their own pages, rendered inside the shell as SPA route slots (`/planner/*`, `/integrations/*`, …). Pages register with the shell at app boot via the module's frontend contribution (§1.6.4).
- **Shared UI library** as a Turborepo package (`packages/shared/ui`) — design system, base components, theming — consumed by every module's frontend.
- **Single SPA bundle in v1.** Per-module bundles (micro-frontends, module federation) are an extraction-time concern (§1.6.12), not v1. Build-time tree-shaking handles dead code; per-route code-splitting handles initial-load size.
- **iframes are not used in v1** — SPA route slots are lighter. Iframes remain available as an opt-in isolation mode if a future plugin/extension scenario needs it (§11.8).

### 1.6.9 Out of scope for v1 (links to §11 deferrals)

- **Per-module deployment** (separate containers per module) — `v1.x` if scale demands; playbook in §1.6.12.
- **Per-tenant runtime module enablement** (toggle) — `v1.x` (§11.2).
- **Per-module vanity domains** (`planner.tenantname.seta.com`) — `v1.x` alongside tenant branding (§11.2).
- **Multi-region per-module deployment** — `v2` (§11.7).
- **Module-level RPM/billing isolation** — `no commitment` (§11.9 if a hosted variant emerges).
- **Third-party / tenant-installable modules** (plugin framework) — `v2` (§11.8).
- **Module manifests + dynamic registry** — direct code imports at app boot replace the manifest abstraction in a single-process world. Manifests return as v2 only if a plugin framework arrives.
- **Inter-module service tokens / signed JWTs** — deferred to §1.6.12 extraction. Not v1 infrastructure.

### 1.6.10 What architecture phase must produce for §1.6

See §13. Highlights:

- Public-API contract for each module (`packages/<module>/src/`).
- Role / route / event / copilot-tool / frontend registration APIs in `core`.
- Module-boundary enforcement: ESLint custom rule, Drizzle schema scoping, raw-SQL CI audit, public-API integration test (§1.6.2).
- Per-module migration orchestration at app boot (dependency order: `core` → `identity` → others).
- Shell routing model.
- In-process event subscriber framework (cursor-per-subscription, idempotency-keyed by `event_id`).
- The future-extraction reference architecture (§1.6.12) — not v1 code, but the design target documented.

### 1.6.11 Session, cookies, and cross-module auth — ownership map

A modular monolith must still answer: *"Who issues the session? Who validates it? Where does user profile live? Where do cookies live?"* These are decided below — the ownership rules also hold in the future-extraction shape (§1.6.12).

**Ownership table.**

| Concern | Owner |
|---|---|
| Auth providers (Entra OIDC, local password, future Okta / SAML / Google) — §3.2 | `identity` |
| Login UI (`/login`, `/oauth/callback`, password reset, email verification) | `identity` |
| Session issuance (mint cookies after successful auth) | `identity` |
| Refresh-token storage + denylist (§3.6) | `identity` |
| User profile (name, email, **skills, availability_status, working_hours, timezone** — §3.9) | `identity` |
| Password hashing, HIBP check, lockout backoff (§3.8) | `identity` |
| MFA (when added v1.x) | `identity` |
| Role grants (per-user role assignments) | `identity` (data) |
| Role registry (each module contributes its roles at app boot; aggregated centrally) | `core` |
| **Session-validation middleware** (stateless JWT check, attaches `req.user`) — used by every module's routes | `core` (Hono middleware library mounted in front of every module's sub-router) |
| **JWT signing key / cookie domain config** | `core` (single source of truth) |
| Audit log | `core` |
| Domain-event bus | `core` |
| Tenant lifecycle (create / suspend / delete tenant) | `core` |

**Login + cookie flow (concrete).**

1. User opens `app.seta.com/anywhere`; no valid session cookie.
2. `core` shell detects unauthenticated → redirects to `identity`'s login route.
3. `identity` runs the chosen auth strategy (Entra OIDC or local password).
4. On success, `identity` mints:
   - **Access token** — JWT, 15-min TTL (§3.6), signed with the `core`-managed key.
   - **Refresh token** — opaque, 14-day sliding, stored server-side in `identity` with denylist support.
5. `identity` sets cookies on the shared parent path (`HttpOnly`, `Secure`, `SameSite=Lax`) — one host, one cookie, every module's routes see it.
6. Redirect to the originally-requested URL.
7. Every subsequent request hits the `core` session middleware before reaching any module's handler. The middleware:
   - Validates JWT signature with the shared public key (no internal call to `identity` — stateless).
   - Resolves session scope cache (§7.1e) lazily.
   - Attaches `req.user = { id, tenant_id, role_summary, accessible_group_ids, cross_tenant_read, ... }`.
8. Access-token expiry → client uses the refresh-token endpoint on `identity`, which re-issues access if the refresh token is not denylisted.
9. Logout / deactivate / role-change / group-membership-change:
   - `identity` revokes refresh tokens and emits the corresponding domain event (`identity.user.deactivated`, `identity.user.session_invalidated`, `identity.role_grant.changed`).
   - The §7.1f `session-cache-invalidate` workflow consumes the event and evicts the affected sessions' permission caches across every module's in-process state.

**Cookie domain.**
- **v1 (single host `app.seta.com`):** one cookie, path `/`, every module's routes served under the same host. Trivial.
- **Future per-subdomain routing** (`planner.seta.com`, `copilot.seta.com`) — reserved for v1.x vanity-domain work (§11.2); cookie would be set on the parent domain (`.seta.com`).

**Cross-module reads of user profile (the recommender's "get user skills" path).**

When `copilot` (running the §7.2.2 staffing-recommendation recipe via `staffing.agent` — Phase B) or any other module needs a user's profile fields:

- **Synchronous path:** call `identity`'s public function API (§1.6.4) — `getUserProfile(userId, { acting_user })` — with the acting user's session context. `identity` re-checks RBAC at its public entry point.
- **Hot-path read model (preferred):** subscribe to `identity.user.profile.updated`, `identity.user.deactivated`, and `identity.role_grant.changed` events. Maintain a local **denormalized projection** in the consuming module's own schema. The recommender's skill / workload / availability query becomes a single in-schema Postgres query.
- **Cross-schema FKs are forbidden** (§1.6.6). Local projections store `user_id` as a plain `bigint` with no FK; consistency is event-driven.

This means cross-module agents (when added Phase B+) don't pay a function-call per candidate; they query the local projection (kept fresh by events) and join with the local task / assignment tables. The cost is one Postgres query, regardless of how many modules need user-profile data.

**What `core` does NOT own.**
- `core` does not authenticate users (delegated to `identity`).
- `core` does not store user-domain data (skills, availability, password hashes).
- `core` is infrastructure: shell, role-registry aggregation, event bus, audit, session middleware, tenant-level operations. Auth and profile knowledge stays in `identity`.

### 1.6.12 Future extraction playbook — splitting a module to its own process

Not v1 work. Documented so the architectural target is clear and the §1.6.2 boundary discipline has a concrete endpoint.

**When extraction is justified.**

- Module's resource consumption (CPU, memory, AI-token spend) outpaces the rest of the platform by >5× and horizontal-scaling the whole monolith is wasteful.
- Module's failure characteristics differ enough that operators want explicit blast-radius isolation.
- A regulated customer wants independent deploy cadences for security-sensitive modules.

None of these apply at v1 scale. They might apply to `copilot` at v1.x+ if token traffic explodes.

**The extraction path (assuming `copilot` is the target).**

1. **Add an HTTP API at the module's public surface.** Each function in `packages/copilot/src/` becomes a Hono route under `/api/copilot/v1/...`. Same input/output shapes as the in-process function. Existing in-process callers in other modules switch from direct import to an HTTP client wrapper — same call site, different transport.
2. **Introduce service-identity JWTs at the boundary.** Issuer: a key managed in `core`. Tokens carry caller-module-id, propagated user context (`user_id`, `tenant_id`, role summary, accessible_group_ids per §7.1e), ~60s TTL, signed with the shared key. RBAC re-checked at the callee — caller's claims are not trusted.
3. **Split `copilot` to its own container.** Same Postgres connection — `copilot`'s own schema, plus read access to `core.events` (which carries audit per D6). Schema-per-module discipline already isolates the data.
4. **Cross-process events.** `copilot`'s subscriber loop now reads `core.events` from the shared Postgres over the network. Same SQL, same cursor, same idempotency contract. LISTEN/NOTIFY works across clients in different processes.
5. **Update deployment** to a two-process posture: the monolith for everything else, `copilot` standalone. Operator runs both containers, both connected to the same Postgres.

What makes this cheap: nothing in the v1 module design assumes co-location of *behavior*. Every cross-module call already goes through the public API surface or the event bus. Extraction changes the transport, not the contracts.

What would make extraction expensive (and is therefore forbidden in v1): any cross-schema SQL, any direct cross-module struct import outside the package root (`src/index.ts`), any shared mutable in-memory state. The §1.6.2 enforcement tooling is what prevents these from creeping in.

---

## 2. Tenancy

### 2.1 Three-level model

- **Instance** — a running deployment of the OSS platform.
- **Tenant (org)** — a customer organization within an instance.
- **User** — a person, belonging to exactly one tenant.

One user, one tenant. Humans with legitimate need for multi-tenant access (e.g., consultants) use separate accounts per tenant. The Google Workspace personal/work split is the precedent.

All business data is scoped to a tenant. Strict isolation between tenants at the data layer.

### 2.2 Platform-level roles (above tenant)

- **Superadmin** — an instance-level operator. Creates new tenants, manages instance-wide configuration (auth providers, sub-processor list, feature toggles), and handles support escalations.
- Onboarding new tenants is **superadmin-mediated by default** — there is no public self-serve signup in the core platform. (An operator may bolt a self-serve signup flow onto their instance, but it's not part of v1 core.)
- The Seta International reference instance follows this rule: a Seta International superadmin creates each new tenant.

### 2.3 Tenant structure (decided)

- **Flat groups, MS Planner-aligned.** A tenant has a flat list of **groups**. A group owns plans. Group membership = access to the plans inside. No workspaces, departments, or group-of-groups above groups in v1.
- Rationale: matches MS Planner's actual structure (M365 Group → Plan → Bucket → Task), keeps sync impedance low, keeps the data model small for v1. Large tenants cope with naming conventions, exactly as they do in Planner.
- **Outsourcing-org pattern.** Customer orgs like Seta International typically have `Account (Client) → Project → Plan(s) → Tasks`. v1 models only the bottom half — groups are projects, plans are sprints/initiatives within them. Account-level grouping is expressed via **naming convention** in v1 (`ClientA-Mobile`, `ClientA-Web`, `ClientB-Backend`). Cross-cutting navigation (filter by client, by phase) is satisfied by `org.viewer` (§4.4) for leadership + group naming conventions for everyone else.
- **Schema hook for first-class accounts (v1.x candidate).** The v1 `groups` table includes a nullable `account_id` column (always null in v1). When the accounts entity is introduced in v1.x (§11.2), groups can be re-parented without restructuring plans, tasks, or assignments. Naming-convention groups become explicit account members; nothing downstream changes.
- ❓ OPEN (v1.x candidate): lightweight tags on groups for cross-cutting navigation (`client:Acme`, `phase:discovery`, `team:frontend`). Not an access boundary, just a navigation aid. Deferred unless v1 dogfooding proves the navigation pain — though the schema hook above already enables a sharper alternative (real accounts).

### 2.4 OSS & distribution (decided)

- **License: Apache 2.0.** Fully open, permissive, with explicit patent grant. Everything in core. No open-core split, no paid feature gating, no source-available license.
- **Reference instance is internal to Seta International.** Seta International is *not* operating a hosted SaaS for external customers. External adopters self-host their own instance from the OSS.
- Implications: no billing/pricing/seat-counting subsystem in v1 core. No abuse/anti-fraud signup protection. No payment integration. The OSS license must permit but not require any of these to be bolted on by downstream operators.
- **Contributor sign-off: DCO** (Developer Certificate of Origin via `Signed-off-by`), not a CLA. Lighter weight; standard in modern OSS.
- Trademark policy: deferred. Not a v1 code-level concern.

### 2.5 Superadmin scope (decided)

- **Tenant management only. No access to tenant business data.** Superadmin can create / suspend / delete tenants, designate the initial tenant admin, manage instance configuration, and view operational metrics — but cannot read tasks, plans, comments, users, or any other tenant business data.
- Support model implication: every support request from a tenant must be solved either by (a) the tenant admin sharing screenshots/exports, or (b) a future opt-in impersonation feature that the tenant explicitly grants. The latter is deferred.
- **Flat superadmin role in v1.** Sub-roles (instance-admin / billing-viewer / support-viewer) are a v1.x candidate (see §11.1).
- **Phase A delivery shape:** superadmin tenants UI is **deferred to Phase B.** Phase A creates / suspends / deletes tenants via the `apps/cli` `tenant-create|suspend|delete` commands. The cascade behavior in §2.6 is identical regardless of trigger surface (CLI or UI).

### 2.6 Tenant lifecycle — cascade order (decided)

`core.deleteTenant(tenantId)` is the single authoritative entry point for permanent tenant removal. The cascade is **synchronous, fail-fast, and idempotent** — if any step fails the operation aborts; re-running the command resumes from the next pending step. Soft-suspend (`core.suspendTenant`) is a flag flip on `core.tenants.suspended_at`; nothing else moves.

**Cascade order (delete).** Each step executes in its own transaction; cross-step retries are safe because every step is idempotent on `tenant_id`.

1. **Mark tenant `deleting_at = now()`** in `core.tenants` to fence new writes (sessions invalidated below).
2. **Invalidate sessions.** `identity.user.session_invalidated` event per user; refresh-token denylist gets every active refresh token for this tenant. Better-auth `session` rows for the tenant deleted.
3. **Drop copilot durable state.** `copilot.threads`, `copilot.messages`, `copilot.workflow_runs`, `copilot.workflow_run_state`, `copilot.rate_limits`, `copilot.tenant_knowledge_*` (Phase C) — all rows with `tenant_id = $1` deleted. Mastra-managed tables (`mastra_threads`, `mastra_messages`, `mastra_workflow_snapshot`, `mastra_evals`, `mastra_traces`) — same, scoped by their `resourceId` / `metadata.tenant_id` index per `@mastra/pg` defaults.
4. **Drop integrations state.** `integrations.*` rows for the tenant (connection records, binding state, conflict / translation logs — Phase B only).
5. **Drop planner state.** Order: `planner.task_embeddings` → `planner.task_chunks` → `planner.plan_embeddings` → `planner.assignments` → `planner.checklist_items` → `planner.tasks` → `planner.buckets` → `planner.plans` → `planner.group_members` → `planner.groups`. Phase B adds `planner.comment_embeddings`, `planner.comments`, `planner.attachments` (S3 keys deleted via batch S3 lifecycle policy in Phase B; Phase A: no attachments).
6. **Drop identity state.** `identity.user_skill_embeddings` → `identity.role_grants` → `identity.user_profile` → `identity.user` rows. Better-auth's `account` and `verification` rows likewise scoped to the tenant's user ids.
7. **Pseudonymize event history (do not delete).** `core.events` rows for the tenant: `actor.user_id` → `erased:<tenant_id>:<random>`, `actor.email` / `actor.name` cleared, `payload.before`/`after` PII fields scrubbed in place. Event row IDs, timestamps, types, aggregate IDs survive — compliance retention + future audit replay both keep working. (Same shape DSR uses per §10.1.)
8. **Drop tenant row last.** `core.tenants.id = $1` deleted after every other module reports clean.

**Phase A scope.** Steps 1, 2, 3 (Phase A copilot tables only), 5 (Phase A planner tables only), 6, 7, 8 implemented end-to-end. Integration test asserts: after a `deleteTenant()` cycle, `SELECT count(*) FROM <every module schema>.<every table> WHERE tenant_id = $deleted_tenant` returns 0 for non-event tables, and `core.events` rows for that tenant have pseudonymized actors. This test is a Phase A acceptance gate (§14.1).

**S3 attachment deletion (Phase B).** Tenant-scoped attachment keys deleted via a tagged-prefix lifecycle rule or a one-shot delete-objects call; ClamAV quarantine bucket likewise.

**Backups out of scope** (§10.1). Operator's backup retention window is documented; rotated-out deleted data does not return to production.

**Soft-delete (suspend) semantics.** `suspendTenant` flips `suspended_at`. The Hono session middleware rejects new requests for users of suspended tenants with `403 TENANT_SUSPENDED`. No data is touched. Resume = clear the flag.

---

## 3. Identity & authentication

### 3.1 Authentication providers (v1)

Two providers must work side by side from day one:

- **Microsoft Entra ID (OIDC)** — primary path for organizations using Microsoft 365.
- **Local username + password** — for users without Entra or for orgs that aren't M365 shops.

Each user account is permanently bound to one provider at creation time. No dual-provider users; no migration path between providers (to avoid account-takeover edges).

### 3.2 Future authentication providers (v1.x+)

The system must accommodate additional SSO providers without architectural change: Okta (SAML/OIDC), Google Workspace (OIDC), generic SAML, generic OIDC, others as customer demand surfaces. v1 only ships Entra, but adding a provider must be a small additive change.

### 3.3 Login experience

- Users should be able to enter their email and the system routes them to the correct authentication path automatically (domain-based discovery) rather than picking a provider button blindly.
- Local password fallback is always offered unless an org has explicitly disabled it (per-org policy).
- **Local password remains available by default** even after Entra is connected. Tenant admin can disable it via the per-tenant "disable local password" toggle (see §3.7). Default-on preserves break-glass access; admin opt-out gives the MFA-enforced posture.

### 3.3a User identity model (decided)

- **Email is the primary user identifier** across both providers. Normalized to lowercase on every input; original casing preserved only for display / outbound email.
- For Entra-provisioned users, the platform additionally records Entra `oid` and `tid` as mapping metadata (for telemetry and future-migration purposes), but the primary key remains email.
- **Risks accepted by this choice** (captured here so they're not silent):
  - Entra UPN/email is mutable upstream — a user's email can change. The platform must ship a **"rename user email" admin tool** in v1 (not as an afterthought) and a detection path for Entra-side email changes on login.
  - Email reuse (a recycled corporate address landing with a different person) creates account-takeover risk. **Forbidden at the tenant policy level**; tenant admin guidance must call this out.
  - Account-collision (local + Entra both have the same email) is the nOAuth class of bug — mitigated by §3.3b below.

### 3.3b Account collision policy (decided)

- When a local-password user exists with email X and the tenant later connects Entra with an Entra user X, **the Entra login is refused** with a clear message: "An account with this email already exists for your tenant. Ask your tenant admin to link the accounts."
- Tenant admin has an explicit "link accounts" tool that merges the local-password user into the Entra identity (Entra becomes the auth path, local password is disabled, all authored content preserved).
- No automatic merge on email match.

### 3.4 User provisioning

- **Just-in-time (JIT) provisioning** on first SSO login for users from a connected Entra tenant. v1 only.
- **Manual admin invite** for local-password users and Entra users created proactively.
- **Bulk import from CSV** for migration onboarding — deferred to v1.x (see §11.1, alongside SCIM).
- **Directory sync (SCIM or Microsoft Graph directory pull)** — explicitly deferred past v1 (see §11.1).
- **Entra-removed-user detection (decided — keep v1 simple).** No periodic Graph reconciliation in v1. The v1 posture is:
  - Next SSO login fails (Entra blocks the redirect) — same as the original default.
  - **On any SSO failure, all of that user's active refresh tokens are revoked immediately.** Narrows worst-case stale-session window from 14 days (refresh-token TTL) to 15 minutes (access-token TTL of any session alive at offboarding). Costs one `DELETE` on the failed-SSO path.
  - Tenant-admin "deactivate user" tool is fast and prominent in the admin UI (§9.1) — operator runbooks document offboarding as: disable in Entra, then deactivate in Seta.
  - **Future hook:** SCIM / Graph directory pull (§11.1) is the real answer at v1.x. Building hourly Graph reconciliation in v1 would be a worse SCIM that operators then migrate off — not worth the surface area.

### 3.5 Tenant onboarding

- An **instance superadmin** creates a new tenant (see §2.2). Onboarding is not self-serve in the core platform.
- During tenant creation the superadmin nominates the initial tenant admin (org admin) by email. That person receives an invite and sets up their account on first login.
- The tenant admin then (if applicable) connects Microsoft Entra via an in-app admin consent flow.
- Connecting Entra is independent of connecting Microsoft 365 Planner for data sync — two different consent scopes, may be authorized separately.
- **No billing / seat-counting in v1 core.** OSS, self-hosted, internal. Operators that build a hosted variant add billing as a downstream concern.
- **Tenant deletion: superadmin-initiated only.** No tenant-admin self-serve delete in v1. Deletion is a soft-delete (suspended) for a documented window before hard-delete; window length is operator-configurable.
- **Pending invite TTL: 14 days.** Tenant admin may revoke at any time. If the inviter leaves before the invitee accepts, the invite remains valid until expiry.
- **≥2 tenant admins enforced.** The platform refuses to demote, deactivate, or delete the last `org.admin` of a tenant. Lockout recovery is a superadmin operation.
- **Re-hire policy: new account.** Same email returning months later does not revive a deactivated account. Tenant admin has a "reattribute content from former member" tool to repoint historical authorship to the new account if desired.

### 3.6 Sessions & tokens (decided)

- A successful login of either provider issues the same session credential. Downstream code does not need to know which provider authenticated a user.
- **Token model:** short-lived access tokens + refresh tokens with server-side denylist. Disabling a user causes their next refresh to fail; existing access tokens die within the access-token TTL.
- **TTLs:** access token 15 minutes; refresh token 14 days sliding (extends on each use, hard-revoked on disable).
- **Idle-session timeout (decided):** tenant-configurable hard ceiling on refresh-token age since last use. **Default 30 days; range 1–90 days.** Implementation: refresh-token rows carry `last_used_at`; refresh handler refuses tokens older than `tenant.idle_timeout_days`. One field, one comparison, no new infrastructure. 30d matches Notion / Linear (work-tool peers); paranoid tenants set 7d; nobody can set >90d (no defensible work-tool case for longer). The configurability itself is the future-extend hook.
- "Remember this device" / trusted-device flows — deferred to v1.x.
- **Cross-app session model** — sessions issued by `identity` are validated locally by every app via a stateless JWT check using the shared signing key from `core` (see §1.6.11 for the full ownership map and cookie/flow diagram). No per-request hop to `identity`.

### 3.7 MFA posture (decided)

- **No MFA in the core platform for v1.** Local-password users have no second factor in the product itself.
- This posture is defensible only because: (a) the platform is OSS and internal-only — production deployments are expected to put MFA upstream via Entra ID (which has MFA) or a reverse-proxy SSO (Cloudflare Access, Authelia, etc.); (b) Seta International's reference instance will use Entra for all real users, with local-password reserved for break-glass / dev / test scenarios.
- **Compensating obligation:** because local-password is the only line of defense for users on that path, the password policy in §3.8 has to be uncompromising (length, breach-check, lockout).
- **Per-tenant "disable local password" toggle.** Tenant admin can flip local-password off once Entra is connected, making Entra-only (and therefore MFA-via-Entra) enforceable for that tenant. Architectural hook for an MFA-required posture without us building MFA in core.
- TOTP and WebAuthn / passkey support for local users are v1.x candidates (see §11).

### 3.8 Password policy (decided)

- **Length:** minimum 12 characters (above NIST 800-63B minimum because we have no MFA fallback), maximum 128 (allow passphrases).
- **No composition rules** (no "must contain uppercase + number + symbol"). Aligns with NIST 800-63B Rev 4.
- **No forced rotation** (NIST 800-63B Rev 4).
- **Breach-check against HIBP** ("Have I Been Pwned" passwords API, k-anonymity protocol) on set/change. Reject known-compromised passwords.
- **Brute-force protection: progressive backoff per `(email, IP)` tuple, not hard lockout.** Avoids weaponized-lockout DoS where an attacker locks out a known username.
  - **Backoff schedule (config-driven, not hardcoded):** failures 1–2 = 0s, 3 = 1s, 4 = 5s, 5 = 30s, 6–10 = 1min, 11+ = 5min. Sliding 15-minute window per tuple.
  - **Unknown emails counted the same as known emails.** Prevents email enumeration via the timing/rate-limit channel.
  - **User notification: email the account owner after 5 failures in 15 minutes** (per `(email, IP)` tuple). Email includes IP, server-derived geolocation, timestamp, and one-click password-reset link. Rate-limited to 1 notification per hour per email so the notification path cannot be weaponized.
  - **No CAPTCHA in v1 core.** Progressive backoff is sufficient for the v1 threat profile; operators running a public-facing instance with high attack volume can bolt on Turnstile / hCaptcha at the reverse proxy.
  - **Future hook (no v1 work):** every failed attempt is logged to a `failed_login_attempts` table keyed `(email, ip, at, reason)`. v1.x can add per-email-only credential-stuffing detection (e.g., "if a single email gets >N failures/hour across all IPs, soft-block and alert tenant admin") as a query over that table — no schema change.
- **Email verification required before first login** for local accounts. Self-service password reset via signed time-limited token (TTL 1 hour).

### 3.9 User profile — skills & availability (decided)

In addition to identity (§3.3a), every user carries a profile used by the copilot for the flagship staffing-recommendation use case (§7.2) and visible to other members of the same tenant.

#### 3.9.1 Skill model — declared skills + history inference

People tag themselves with **specific** tools and frameworks (`terraform`, `github-actions`, `kubernetes`, `react`). HR onboarding produces a credible initial skill set, so declared skills are the **primary** matching signal when present. Queries phrased at a concept level ("find me an infrastructure reviewer") are bridged by **embedding similarity** (e.g., `terraform` ≈ `cdk` ≈ `infrastructure` in vector space, §7.1c) — not by a hand-curated concept map.

- **`skills: string[]`** — free-form leaf tags on the user profile. Lowercased on save; original casing preserved for display. User-editable; tenant admin can also edit. Default empty is acceptable — the agent falls back to history inference (below).

- **Two signal sources, combined:**

  1. **Declared skills (precision-leaning).** User-curated; trusted when populated. Concept-level queries match via embedding similarity over `identity.user_skill_embeddings` (§7.1c). No concept map, no synonym list — the embedding space is the only synonym layer.

  2. **History inference (recall-leaning, freshness-aware).** From the user's assignment history, infer demonstrated skills: for each query topic, retrieve the user's recent tasks (title + description), score by topic embedding similarity × recency weight. A user with three completed `terraform` tasks last month outranks one who self-tagged `terraform` two years ago and hasn't touched it since. Exposed as the `infer_user_skills_from_history` primitive (§7.2).

  The §7.2 `match_users_to_topic` primitive combines both — `max(declared_match, history_match)` — so a user with no declared skills is still discoverable through their work, and a user who declared a stale skill is downweighted when history disagrees.

- **Tradeoffs accepted.**
  - **No proficiency level.** Junior `terraform` and principal `terraform` are not distinguished in v1. v1.x adds `{tag, level}` if dogfood demands it (§11.8).
  - **History inference cost.** Adds one vector query per candidate during ranking; bounded by per-user recent-assignment count and answered against the per-tenant HNSW index. Within the §10.2 latency budget on the §10.2 reference deployment.
  - **Cold start for new hires.** A user with no declared skills and no assignment history yet is invisible to the recommender. Acceptable — same outcome as not being in the tenant. Admin can seed declared skills at invite.

#### 3.9.2 Availability model — status, timezone, working hours

- **`availability_status: enum('available' | 'busy' | 'ooo')`** — user-settable; default `available`. Subjective signal; can override derived workload only in the *more-busy* direction (a user with low load can declare `busy`; a user with high load *cannot* declare themselves available — the workload score in §3.9.3 still applies).
- **`ooo_until: timestamp | null`** — companion to `ooo`; auto-resets the user to `available` on first access after this passes.
- **`timezone: IANA tz string`** — stored on the profile (e.g., `Asia/Ho_Chi_Minh`). Inferred from the browser at first login; user-editable. Already needed for due-date display (§5.3).
- **`working_hours: { start: time, end: time } | null`** — optional. Default empty. In v1 the recommender *displays* "currently outside working hours" in the candidate card but does **not** filter on it. Filtering by working-hours overlap is v1.x (§11.8).

**External availability augmentation (Timesheet MCP).** When the tenant has a Timesheet MCP integration configured (§7.1d), the recommender additionally queries `getLeave(userEmail, today..today+14d)`. Approved leave that overlaps the relevant window forces the user's effective status to `ooo` for recommendation purposes, regardless of their self-declared `availability_status`. Rationale: people forget to update Seta status when they take leave; the timesheet is the source of truth. Tenants without the integration configured behave as before (rely on user-set status). The user can also explicitly set `availability_status = 'available'` to override an MCP false-positive (e.g., leave was rejected after the API last responded) — the recommender notes "user overrides timesheet" in the rationale so the requester sees the conflict.

#### 3.9.3 Workload score — what "busy" actually means in v1

Raw assignment count is a poor proxy for busy-ness. Five low-priority tasks due next month is not the same as five P0 in-progress tasks due today. v1 derives a **weighted workload score** from data the v1 task model already carries:

```
workload_score(user) = sum over user's open assignments of:
    priority_weight × due_weight × progress_weight
```

**Factors are spec-pinned; weights are tenant-tunable.** The factor set (priority, due-date proximity, progress state) is fixed in v1. The numeric weight ladder is **tenant configuration**, not spec, so operators can recalibrate without code changes. Architecture phase ships a default ladder that produces sensible scoring on the §10.2 reference workload; tenant admins override via instance config.

The `compute_workload({ user_id })` primitive (§7.2) returns `{ score, breakdown }` — the raw score plus per-factor contribution. The agent (or a tenant policy) applies any threshold for "available for new work" — the threshold is not baked into the primitive. This keeps the tool atomic (per §16.5) and lets the agent answer "ignore workload, just rank by skill" without fighting a built-in filter.

Score is cheap to compute live — bounded by the user's open assignments, indexed by `assignee_id`. If at-scale listing endpoints need this, a scheduled recompute or materialized view is an optimization, not a model change.

**Effective-availability — composed at the agent layer, not baked into a tool.** The agent combines `get_user_availability({ user_id })` (self-declared status, OOO, working hours, timezone), `compute_workload({ user_id })`, and `get_leave_overlap({ user_id, start, end })` (Timesheet MCP, §7.1d) to decide whether a candidate is currently available. A typical default policy returns "available" when status is `available`, score is under the tenant's threshold, OOO is past, and no MCP leave overlaps. Other policies ("any non-OOO user, ignoring workload"; "everyone, ranked by closest match regardless of capacity") are equally expressible because the inputs are separate primitives. Composition recipes documented in §7.2.

**Behaviour when no one is strictly available.** The agent always returns a non-empty list when *any* skill-matching users exist; users that fail the availability policy are returned with an explicit "at capacity" / "on leave" label and de-ranked. Better than zero results — the human asking can decide if it's worth interrupting someone at capacity.

#### 3.9.4 Signals deliberately not modeled in v1 (and why)

- **Calendar / meeting load** — would be the strongest "busy" signal, but needs Graph/Google Calendar integration. v1.x (§11.8).
- **Slack / Teams real-time presence** — same problem; integration cost. v1.x (§11.8).
- **Effort estimates / story points on tasks** — task model (§5.1) doesn't carry them. Adding is its own design choice; not bundled into v1.
- **Velocity / historical completion rate** — needs analytics infra; defer.
- **Real-time online presence in the Seta UI itself** — overkill for an async-collaboration tool.
- **Skill proficiency level / peer endorsement** — v1.x (§11.8); meaningful but adds UX surface.
- **Cross-tool busy state** (someone is heads-down in code, not in Seta) — out of scope; Seta has no visibility.

These are flagged so reviewers don't expect them and so the v1.x roadmap is anchored.

#### 3.9.5 Visibility & editing

- Skills, `availability_status`, `working_hours`, `timezone`, and computed `workload_score` of any user in a tenant are visible to other members of that tenant — needed for collaboration and recommendation rationale ("Alice was suggested because she's tagged `terraform`, her workload score is 4.5, and it's 2pm in her timezone").
- `workload_score` is shown contextually in recommendation cards, not as a public leaderboard. Avoids the "Seta tells my manager I look idle" surveillance smell.
- `ooo_until` is visible tenant-wide; not cross-tenant.
- Profile is *not* visible across tenants.
- Profile data is *not* included in superadmin's per-tenant operational view (§2.5 / §9.2) — it is tenant business data.
- Users edit their own profile. Tenant admin (`org.admin`) can edit any user's profile and the tenant's concept map. All edits audit-logged (§8.1).

---

## 4. Authorization (role-based)

### 4.1 Scope

- Permissions are flat strings, conventional naming `<module>.<resource>.<action>` (e.g., `planner.task.create`).
- Roles are named bundles of permissions, scoped per module (e.g., `planner.admin`, `planner.contributor`, `planner.viewer`).
- A user holds one role per module they're granted access to. Their full authorization is the union of their per-module role permissions.
- **Tenant-level role: organization admin**, granting all permissions across all modules for their tenant.
- **Instance-level role: superadmin** (see §2.2), above org admin. Scope of superadmin authority on tenant data is open (see §2.3 — read-only vs. impersonation-with-consent).

### 4.2 Role grants

- Granted directly by an org admin via the admin portal.
- Optionally derived from SSO group membership (Entra groups for v1; generalizable to other IdPs). Each org can configure a mapping from IdP-side group identifiers to Seta role slugs.
- **Group-derived grant recompute cadence (decided): SSO-login-time only in v1.** No background reconciliation. Cost: a user removed from an Entra group keeps their group-derived Seta role until their next SSO login (or until a tenant admin manually revokes). Same staleness shape as the user-removal posture in §3.4. **Future hook:** SCIM (§11.1) lands directory-driven reconciliation; until then, login-time is the only signal.
- Manually-granted and group-derived grants coexist on the same user; removing one doesn't affect the other.

### 4.3 What v1 does NOT need

- Resource-level / row-level permissions ("Alice can edit task #123 but not task #456"). Not in v1. Plan-level membership for contributor-tier users is handled in domain logic, not in the permission system.
- Custom roles defined by customers. Roles are code-defined and ship with the system. Custom roles deferred.
- Time-bounded role grants, approval workflows for grants, role hierarchies.
- **Per-task / per-plan ACLs beyond group membership: deferred to v1.x.** v1 access is fully determined by (a) group membership for the plan's containing group, and (b) role within that scope. The permission-check layer must be a function call (not inlined SQL) so an ACL extension can be added in v1.x without rewriting call sites — see §11.

### 4.4 Seeded roles (initial proposal — to refine)

Each module is an **authorization scope** (§1.6). Roles below are *contributed* to the role registry by each module's public surface (§1.6.4); `core` aggregates them at app boot. Deploy unit in v1 is the single container (§1.6.7), not the module — but role scoping survives the future-extraction shape (§1.6.12) unchanged.

- **`identity` module:** `identity.admin`, `identity.viewer`
- **`planner` module:** `planner.admin`, `planner.contributor`, `planner.viewer`
- **`copilot` module:** `copilot.admin` (configure copilot settings — model, custom instructions, tool allowlist), `copilot.user` (use the copilot), `copilot.viewer` (view copilot ops dashboards, no use). Renamed from `agents.*` per §7.0 — there are no user-defined agents in v1.
- **`integrations` module:** `integrations.admin`, `integrations.viewer`
- **Org-wide (contributed by `core`):**
  - **`org.admin`** — bypass; can do anything in the tenant including destructive ops. Includes the `core.audit.read` permission.
  - **`org.viewer`** (new in v1) — **read-only across every plan in the tenant**. No writes, no member management, no integration config. Designed for CEO / CTO / Head of Delivery / PMO roles in outsourcing-style orgs who need cross-project visibility without destructive power. Distinct from `planner.viewer` which is scoped to a single group.
- **Audit-log access permission (decided — simple v1, ready-to-extend).** `core.audit.read` is a **first-class permission string** from day one, bundled into `org.admin`'s permission set. No separate `org.auditor` role ships in v1 — premature for v1 scale. The audit-log UI checks `hasPermission(user, 'core.audit.read')`, not `isOrgAdmin(user)`. **Future hook:** when custom tenant-defined roles ship (§11.1) or when a separation-of-duties tenant asks, `org.auditor` lands as a one-line role definition (`{ slug: 'org.auditor', permissions: ['core.audit.read'] }`) without permission re-shuffling. Same pattern unlocks SOC 2 separation-of-duties (§10.1) with zero migration.
- Four-module business / capability split confirmed (`identity`, `planner`, `copilot`, `integrations`), plus `core` (tenant-wide org roles + superadmin). Roles + permissions of a module are **contributed via its public surface** (§1.6.4) — adding a fifth module in v1.x means new role + permission registrations at app boot, with no changes to existing modules.
- `org.pmo` (cross-group read + edit governance fields like priority/due date without create/delete rights) is a v1.x candidate — see §11.1. The role-grants table's `scope` JSON column (v1 hook in §11.2) makes scoped versions (e.g., `org.viewer` limited to specific accounts) additive.

---

## 5. Work-management (Planner) module

### 5.1 Domain shape

- **Groups** — the membership container that owns plans. MS Planner's "M365 Group" analogue, but native to the platform (no dependency on an actual M365 Group). A user is a member of zero or more groups within their tenant. Group membership controls visibility/access to plans within it.
- **Plans** — containers for work, akin to a project or initiative. Each plan belongs to exactly one group.
- **Buckets** — columns within a plan (Kanban-style grouping).
- **Tasks** — the unit of work. Carries title, description, due date, start date, percent complete, priority, progress state, labels, checklist items, assignees, attachments, and two optional refinements: **skill_tags** (cross-plan free-form tags such as `infrastructure`, `frontend`; default empty — see §5.3 for the optional-refinement semantic) and **review_state** (also §5.3). Both are pinning signals when explicitly set; the agent does not depend on them being populated and reasons primarily over title + description.
- **Assignments** — many users may be assigned to a task.
- **Labels** — per-plan colored tags.
- **Checklist items** — sub-tasks within a task, with done/not-done state.

Terminology and structure deliberately track Microsoft Planner's so sync mapping has low impedance, but the model is Seta's; we don't tie ourselves to MS-specific limits unless required for sync fidelity.

### 5.2 v1 capabilities (decided)

- Full CRUD on plans, buckets, tasks, checklist items, assignments, labels — within authorization.
- Kanban-style drag-and-drop reorder of tasks within and across buckets.
- Task detail editing (title, description, dates, priority, progress, labels, checklist, assignees, attachments).
- **Plan-level membership:** via group membership (§5.1). Each plan belongs to a group; group membership = access; role (`planner.admin` / `contributor` / `viewer`) governs what they can do within that scope.
- **Comments:** Seta-native, text + @mentions + in-app notifications. No email notifications in v1.
- **Attachments:** URL references **plus** native file upload to S3, with a per-tenant size quota set by tenant admin (e.g., 5 GB default). Virus scanning required on upload (operational dependency for v1).
- **Real-time updates:** Server-Sent Events (SSE) push board change events to viewers. No collaborative editing primitives (live cursors, OT/CRDT) — that's a v1.x candidate.
- **Search:** Postgres full-text search across the user's accessible tasks. Permission-filtered at query time. Dedicated search engine (OpenSearch / Meilisearch) is a v1.x candidate.

### 5.3 v1 capabilities — additional decisions

- **Recurring tasks, task dependencies, templates: deferred** (see §11). Task schema must be extension-ready so v1.x adding `parent_task_id` / `recurrence_rule` columns does not force broad refactors.
- **Bulk operations on tasks: yes, full set in v1** — select N tasks → change assignee, label, bucket, complete, delete. Sync implication: a bulk edit becomes N sequential ETag-bound Planner writes.
- **Time zones:** due dates stored as UTC instants; displayed in viewer's local tz. "Due Friday at 5pm" entered by a PST user resolves to a UTC instant; a London viewer sees it in BST. Date-only fields render in viewer's local calendar.
- **Soft-delete with no auto-purge.** Deleted tasks, plans, comments go to per-tenant trash indefinitely. Tenant admin can restore or empty trash manually. Hard-delete only via (a) explicit "empty trash" or (b) GDPR DSR erasure (see §10.1).
- **Authorship after user deletion: "Former member" placeholder.** Content survives; the author label is replaced. Personal data is scrubbed.
- **Empty-state:** new tenant lands on an empty Groups page with a single prominent "Create your first group" CTA. No sample data, no guided tour, no template gallery in v1.
- **Skill-tagged tasks (optional refinement in v1).** Any task may carry zero or more `skill_tags` (free-form, lowercased, cross-plan). They are an **optional pinning signal**, not a primary input to the agent: the staffing flow (§7.2) reasons primarily over each task's `title` + `description` via semantic retrieval + LLM filter; explicit `skill_tags`, when present, boost confidence and short-circuit topic extraction. Default empty is the common case — task creators are not expected to tag. MS Planner has no equivalent field; sync ignores `skill_tags` on outbound writes and never overwrites them on inbound writes (§6.5).
- **Review state — optional refinement in v1.** Whether a task "needs review" is a property the agent infers from `title` + `description` (wording like "ready for review", "PTAL", `@x please check`), labels, bucket names, checklist state, and progress (§7.2 composition recipe). `tasks.review_state` is an **optional pinning signal** for teams that want explicit workflow tracking; default null is the common case. MS Planner has no equivalent field, so Planner-imported tasks arrive with `review_state = null` and the agent still answers "find tasks needing review" correctly.
  - **Schema:** `tasks.review_state` — Postgres enum, Drizzle `pgEnum`. v1 values: `'needs_review'` and `null` (default null).
  - **Why enum, not boolean.** v1.x will inevitably grow this surface (`'in_review'`, `'approved'`, `'changes_requested'`, `'blocked'`, etc., shaped by which review workflows real tenants run). Starting as an enum lets v1.x add values without a column migration — matches §11's "schema-leaves-room" principle.
  - **UI:** task detail surfaces a "Needs review" toggle alongside `priority` and `progress`. Permission: same as task-edit (`planner.contributor` and above) — no new permission string.
  - **Auto-clear on completion?** No. Review state is independent of progress; a completed task pending review is a coherent state.
  - **Checklist items don't carry review_state.** Review is task-level only in v1.
  - **Not synced to Planner.** Seta-native (Planner has no equivalent). Same handling pattern as `skill_tags` (§6.5) — sync layer ignores on outbound, never overwrites on inbound.
  - **Event:** `planner.task.review_state.changed` emitted on toggle. Feeds audit log + v1.x notification triggers (see §11.5 "skill-based notifications").
  - **Planner-import compatibility:** imported tasks arrive with `review_state = null`; teams that want explicit tracking can bulk-set later. No migration tooling needed in v1 core because the flagship flow doesn't depend on the field being populated.

### 5.4 Notifications (in-app only, v1)

- **In-app only.** No email digests, no push, no SMS in v1.
- **Triggers (v1 set):** @mention in a comment; assignment to a task; due-date approach 24 hours before due.
- **Per-user preferences:** minimal — on/off per trigger category (so a user can mute due-date-approach while keeping @mentions). No per-plan / per-group muting in v1.
- Notification feed visible in the UI; mark-as-read, dismiss.
- Email infrastructure is still required for invites and password reset, but is not wired into the notifications path. Adding email notifications later means wiring an existing dispatcher channel — see §11.

---

## 6. External system sync

### 6.1 First external system (v1)

**Microsoft 365 Planner — "basic" SKU only.** Bidirectional sync between Seta plans/tasks and MS Planner plans/tasks accessed via Graph `/planner`.

**Explicitly out of scope:** Planner Premium and Project for the Web (Dataverse-backed; separate API surface). A Premium connector is a v1.x candidate as a separate connector implementation, not an extension of the basic one.

**Hard external constraints driving §6 design (from Graph research):**
- No webhooks on Planner resources — sync is poll-based by necessity. Delta queries exist only on `/beta`.
- Comments are mid-migration (legacy Outlook-group-thread model being retired; new task-chat API rolling out 2026 with no Graph surface yet). **Comments are out of scope for v1 sync.**
- Per-PATCH ETag handling (`If-Match`) is mandatory; 412/429 retry loops are a v1 requirement, not polish.
- Planner has no published throttling limits; resilience to 429 with `Retry-After` is mandatory.
- Hard limits to design against: 9,000 tasks/plan, 200 buckets/plan, 20 assignees/task, 20 checklist items, 15 references, 400 plans/group, 100 users-per-plan / 400 plans-per-user in delta subscriptions.
- `v1.0` exposes 6 of 25 label categories; `/beta` exposes all 25. Colors are fixed by category index, not settable.
- No file content upload via Planner — references are URL-only. File attachment content sync (if ever in scope) requires a separate SharePoint/OneDrive connector.

### 6.2 Future external systems (v1.x+)

The sync abstraction must accommodate other work trackers without architectural change: Jira (Cloud), Trello, Asana, ClickUp, Linear, others. v1 only ships MS 365 Planner; adding a connector must be a small additive change.

### 6.3 Direction of authority and conflict resolution (decided)

**Direction of authority.** Seta is the system of record for v1. State diverges only transiently during sync — both sides are edited (users work in either UI), but Seta's view is canonical and asserts itself on divergence.

**Conflict resolution: field-level "Seta wins" — not timestamp LWW.** Precise rule:

- Each (task, binding) pair carries a `last_pushed_field_values` jsonb column, populated on every successful outbound push (the Seta-side values at the moment of push).
- On each inbound change, decompose into per-field diffs and classify each field:
  - **Seta-side unchanged since last push** (current Seta value == `last_pushed_field_values[field]`): apply the inbound value; update `last_pushed_field_values[field]` to the new value. No conflict.
  - **Seta-side changed since last push AND Planner-side changed since last push** (both differ from `last_pushed_field_values[field]`): **field-level conflict**. Drop the inbound value for that field; record a conflict-log entry (per-binding); mark the task dirty so the outbound push re-asserts Seta's value.
  - **Seta-side changed, Planner-side unchanged**: no inbound to apply; Seta's outbound push propagates normally.
- **No timestamp comparison.** "Last write" semantics are not used; Seta wins on conflict, period. Avoids the clock-skew failure mode and matches the system-of-record stance. The "LWW" framing in earlier drafts was a misnomer.
- **Echo suppression (§6.8) runs first.** If the inbound matches the recorded echo ETag, it is filtered before the conflict step — never compared against `last_pushed_field_values`.

**Special cases.**

- **Both sides delete:** no conflict; the delete propagates.
- **Seta deletes, Planner updates:** Seta wins; inbound update dropped; Seta's delete pushed (Planner task removed).
- **Planner deletes, Seta updates:** Seta wins, but Seta's outbound update to a deleted Planner task will 404. The conflict log records `orphan: task deleted upstream while modified locally`; tenant admin reconciles manually (restore-then-push as a new Planner task, or accept the delete).
- **Bulk Seta edit + concurrent Planner change:** each task processed independently per the field-level rule. ETag-bound PATCH retries handle wire-level races (§6.8). Bulk operations on synced plans carry a **heightened conflict-risk profile**; the admin UI surfaces bulk-edit-induced conflict spikes as a single grouped entry rather than N individual lines.
- **Comments, attachments, skill_tags:** not synced (§6.5), so no conflict logic applies.
- **Checklist items:** each item is a sub-record with its own id; per-item field-level rule applies (an item is a small "task" under the parent).

**Conflict log (distinct from the §6.6 translation log).**

- **Translation log (§6.6):** records *capability-gap mappings* — Seta concepts that don't exist in the target system and how the admin chose to map them.
- **Conflict log (this section):** records *divergence resolutions* — concrete instances where Seta's value won over a competing Planner-side change. Per-binding; admin-readable; not user-prompted in v1 (resolution is automatic per the rule above).
- Both logs feed the same admin "binding health" view.

**v1.x extension hooks (no v1 work, but unblocked).**

- **Per-binding "Planner wins" override** for read-only-Seta tenants — the conflict step branches on a binding-level policy flag. Same column, different rule.
- **User-prompted conflict resolution** (modal on conflict) — the conflict log already exists; v1.x adds the UI.
- **Three-way merge for text fields** (titles, descriptions) — replaces "drop" with "merge" for specific field types.
- **Read-only mirror mode** (Seta shows but doesn't write back) — deferred to v1.x. The bind-time prompt's "import all" + admin pause on outbound (§11.4) gives an approximate version of this for v1.

### 6.4 Connection & binding model

- A tenant admin connects an external system through an OAuth or equivalent flow.
- A connection is scoped to a tenant and identifies which external workspace/tenant it serves.
- A Seta plan can be bound to zero, one, or multiple external connections.

**Container creation (Seta → Planner):** When Seta originates a plan and pushes it to Planner, **Seta requires a pre-existing M365 Group**. The plan creator (or tenant admin) selects the target M365 Group at bind time. Seta never auto-creates M365 Groups, mailboxes, or SharePoint sites. Roster-based plans (still beta, tenant-disabled by default) are out of scope for v1.

**Initial import on bind:** At bind time, the user is **prompted** to choose:
- *Start fresh* (forward-only — only sync changes from now)
- *Import recent* — fixed v1 window options: **7 days / 30 days / 90 days / 1 year**
- *Import all* (backfill all existing Planner tasks/buckets into Seta)

The dialog displays the **remote task count for each option** before the user picks (one filter query per bucket; results cached for the duration of the dialog). No silent default. Future v1.x: custom date ranges if dogfood reveals the five fixed buckets are insufficient — additive UI change, no schema impact.

- **Binding authority:** a binding can be created or edited by a user with `planner.admin` within the plan's containing group, OR by a tenant admin. Plan creators do not automatically get binding rights.

### 6.5 Sync coverage

- **Tasks:** create, update (title, description, dates, priority, progress, labels, checklist), assign, complete, delete. **`skill_tags` (§5.1) are Seta-native and not synced** — Planner has no equivalent field; sync ignores skill_tags on writes both directions.
- **Plans/Boards:** create, rename, delete.
- **Buckets/Columns:** create, rename, reorder, delete.
- **Labels:** create, rename, color-change. (MS Planner only supports 25 fixed-color labels — mapping to be defined.)
- **Comments:** **out of scope for v1 sync.** Forced by external constraints: the legacy Planner comments model (Outlook group threads) is being retired in 2026; the new task-chat model has no documented Graph surface yet. Revisit once Microsoft publishes the new API. Note: comments may still exist as a **Seta-native feature** independent of sync (see §5).
- **Attachments:** sync URL-reference metadata only in v1. Native file uploads (S3-stored Seta-side) are **not** mirrored to Planner — Planner's API has no file-upload endpoint; content sync requires a separate SharePoint/OneDrive connector, deferred to v1.x (see §11.4).
- **Notifications/activity:** out of scope; we don't sync notifications from external systems.

### 6.6 Capability gaps between systems

Different work trackers represent things differently (Jira has statuses where Planner has buckets; Trello has unlimited labels where Planner has 25 colored ones; some systems don't support multiple assignees natively). The system needs to be explicit about these gaps rather than silently dropping information.

**Capability-gap policy (decided):** when a Seta concept can't be represented in the target system, the platform **warns at sync time and requires admin confirmation** before applying a best-effort mapping. First-time occurrences of each gap class trigger the prompt; admins can choose "apply once," "apply always for this binding," or "refuse." The translation choices made are recorded in a per-binding **translation log** the admin can review and revoke.

The translation log (capability-gap mappings) is **distinct from the §6.3 conflict log** (divergence resolutions). Both feed the same admin "binding health" view but answer different questions: translation = "how should this Seta concept be represented in Planner?"; conflict = "what happened when both sides changed the same field?"

Rationale: silent best-effort drops information users can't see they've lost. The warn-and-confirm path is high-friction but matches enterprise tolerance and avoids the most common sync-trust failure.

### 6.7 Inbound change handling

- Changes made in the external system arrive via webhook (or polling, if a system doesn't support webhooks). For Planner specifically: polling against Graph delta (beta), no webhooks available (§6.1).
- **Per-change processing order:** (1) echo suppression (§6.8 — drop our own echoes), (2) conflict classification (§6.3 — field-level "Seta wins"), (3) apply non-conflicting fields, (4) emit `planner.task.synced_in` domain event.
- Changes are applied to Seta with a clear marker indicating they originated externally (for audit, observability, and to prevent push-back loops).
- **Latency target:** inbound (Planner → Seta) changes appear within 60 seconds in normal operation; 5 minutes worst-case. Achieved via a 30–60s poll interval with backoff on throttling.

### 6.8 Outbound change handling

- Changes in Seta are propagated to bound external systems asynchronously.
- Failures (rate limits, transient errors) retry with backoff; permanent failures (auth revoked, resource deleted upstream) are surfaced to admins, not silently dropped.
- **Outbound latency target:** Seta → Planner within 60 seconds normal, 5 minutes worst-case (same envelope as inbound).
- **Ordering:** per-task ordering is preserved (sequential PATCH with ETag chain). Cross-task ordering is best-effort — two unrelated tasks may arrive at Planner in either order.
- **Echo suppression:** per-binding "last-pushed digest." When Seta pushes a change to Planner, the resulting Planner ETag is recorded; if a later poll surfaces a change matching that ETag, it is suppressed as our own echo. Prevents the Seta → Planner → poll → Seta loop.
- **Successful push updates `last_pushed_field_values`** (§6.3) with the Seta-side values that were just pushed. This is the snapshot the next inbound poll compares against for field-level conflict detection.

### 6.9 Disconnection

- Disconnecting a sync connection stops the flow but does not delete data on either side.
- **Orphan handling:** Seta plans formerly bound to the disconnected connection remain in Seta as plain (unbound) plans. Planner-side plans remain untouched. Binding metadata is cleared. The disconnection event is recorded in the audit log.
- Tenant admin gets an "orphaned bindings" view to inspect / re-bind / archive.
- **Reconnection** is not automatic. The admin must re-bind explicitly. (Architectural hook: bindings carry stable external IDs, so a future "auto-restore on reconnect" workflow can be added in v1.x without schema change.)

---

## 7. AI copilot

### 7.0 Scope clarifier (decided)

In v1, **"agent" = the built-in copilot.** The copilot is a single, conversational, request-response assistant embedded in each domain portal. There are no user-defined agents, no scheduled or triggered workflows, and no per-tenant custom agent definitions in v1. The `agents.*` role triplet in §4.4 is renamed accordingly to `copilot.*` (see §4.4 update).

Future scope (v1.x+): scheduled/triggered automations, admin-defined custom agents, user-shareable agent definitions. The platform's agent layer (Mastra) supports these primitives natively; they're omitted from v1 product surface, not from the underlying capability.

### 7.0a AI-first design lens (decided 2026-05-19)

Seta is built as an **AI-first system**, not a SaaS app with AI bolted on. Three principles flow from this and constrain every other decision in §7 and §16:

**1. The agent surface is a peer of the HTTP surface, not a layer on top.** Every domain capability ships with a Mastra Tool wrapping its Hono handler — never UI-only, never Tool-only. The discipline: a domain function reaches the user via *both* paths or it doesn't ship. The Tool registry is the **complete platform capability map**; an external reader of the registry should see every meaningful action the platform supports. §16's "tools are thin wrappers over each module's public surface" makes this load-bearing, not aspirational. Practical consequence: PR review for any new domain feature requires both the Hono route *and* the Mastra Tool registration in the same change.

**2. Seta is itself an MCP server (target by v1.x), not just an MCP consumer.** §7.1d covers Seta-as-MCP-consumer (Timesheet). The forward direction: **Seta exposes its own Tool registry as an MCP server** so external agents (Claude Desktop, Cursor, a tenant's custom orchestrator, another Mastra instance) can drive Seta exactly as our internal Supervisor does. v1 hook: the Tool registration shape in §16 must be MCP-emittable — input/output schemas as JSON Schema (Zod is fine; it serializes), descriptions written for an LLM consumer, no hidden coupling to the in-process invoker. v1 builds the registry; v1.x flips the switch to expose it as an MCP server endpoint per tenant, role-gated identically to the internal copilot's tool registry (§7.1e).

**3. User-defined tools, MCP endpoints, and workflows are the v1.x trajectory.** The §7.0 deferral stands for product surface, but the *architecture* targets:
- Tenants register **custom MCP servers** their copilot can use (a calendar MCP, a CRM MCP, an internal tools MCP — pattern is already in §7.1d under "Future MCP-consumer integrations").
- Tenants author **custom tools** as TypeScript snippets in a sandbox, registered through admin UI, scoped to their tenant. Same Tool shape as internal tools; same RBAC contract.
- Tenants compose **custom workflows** visually (Mastra Workflow primitives are already there; the v1.x work is the editor).

The framing positions Seta as a **substrate**, not a finished app — operators and tenants extend it through agent primitives rather than through plugins or webhooks. Plugin-framework + sandbox-runtime work (§11.8) is the enabling infrastructure.

**What this rules out for v1.** Anything that treats the agent as an optional add-on or feature flag. The agent path is the default; the UI path is the alternative for users who prefer clicking. Phase A's "agent module first" sequencing (§14.1) is the lived demonstration of this principle.

### 7.1 Pattern

- Every domain portal embeds a copilot panel. Users converse with it to perform domain actions and ask questions.
- The copilot routes intent across domain specialists (a Mastra-native pattern) rather than being one large mega-agent.
- The copilot's context is aware of which portal the user is currently in (biases routing) but is not strictly scoped to that domain — the user can ask cross-domain questions.

### 7.1a LLM provider (decided)

- **Pluggable via Mastra.** The instance superadmin configures which LLM provider(s) the instance uses (OpenAI, Anthropic, AWS Bedrock, Azure OpenAI, local via Ollama, etc.). Mastra's model abstraction is the integration point.
- Provider credentials are instance-level config, not per-tenant.
- **One LLM provider active per instance in v1.** Per-tenant provider selection is a v1.x candidate (see §11). The provider-config schema must accommodate per-tenant overrides in the future even though v1 only sets it instance-wide.
- **Tested-provider matrix published in docs.** At minimum: Anthropic Claude, OpenAI GPT, AWS Bedrock (Anthropic). Others may work but are unverified. The matrix is updated each release.
- **Custom AI instructions / "company knowledge" per tenant: deferred to v1.x.** v1 has a single instance-level system prompt configured by superadmin. The prompt-composition layer must be templated, not hardcoded, so per-tenant prompts can be layered in without touching every callsite.

### 7.1b Chatflow — Mastra Agent shape (decided)

**Definition.** A **chatflow** in Seta v1 is a turn-loop on a Mastra **Agent**: user message → LLM decides what to do (call tools, ask follow-up, produce final response) given the thread's memory → output streams back. The flow is **LLM-driven** — at each turn the model chooses the next move from the tools available to it. This is the user-facing surface; every interaction with the copilot panel is a chatflow turn.

Contrast with **workflows** (§7.1f), which are code-driven, deterministic step graphs used for system-internal pipelines (sync, recomputes, scheduled jobs). The two are distinct Mastra primitives:

| Aspect | Chatflow (Mastra Agent) | Workflow (Mastra Workflow) |
|---|---|---|
| Who drives flow | LLM, per turn | Code-defined step graph |
| Trigger | User message | Schedule, event, or platform call |
| Visibility | Conversational UI, streaming | System-internal; observable in ops portal (§7.3) |
| State | Thread + working memory per user | Durable per-run state |
| Failure model | Turn fails, user sees error inline | Step-level retry, durable resume across hours/days |
| User-defined in v1? | No (single platform copilot) | No (system-internal only) |

The rest of §7.1b describes the chatflow shape. §7.1f enumerates the v1 workflows.

The copilot's chatflow architecture is fixed below; architecture phase implements directly against it.

**Topology — router + domain specialists.**
- One **router agent** receives every user message. Job is intent classification + routing. Lightweight prompt, no domain tools attached.
- A small set of **domain specialist agents**, each with a tightly scoped tool list:
  - **`planner.agent`** — task / plan / bucket / checklist / assignment CRUD, querying, summarization. Wraps the Planner module's HTTP handlers as tools.
  - **`staffing.agent`** (Phase B) — exposes the cross-module skill/availability/workload primitives (`match_users_to_topic`, `infer_user_skills_from_history`, `get_user_availability`, `compute_workload`, `get_leave_overlap`) that the §7.2.2 staffing-recommendation recipe composes. Not a macro tool — atomic primitives only, per D15.
- The router picks one specialist per turn. Specialists may call multiple tools within a turn but do not hand off to another specialist mid-turn. Cross-specialist orchestration via **Mastra Supervisor Agents** (the v1.0 successor to the deprecated `.network()` primitive) is a v1.x candidate. v1 uses a Supervisor Agent topology from day one — single-delegation-per-turn is enforced via `onDelegationComplete`, leaving the door open for v1.x multi-delegation without a rewrite. See §18 for the concrete wiring.
- The current portal (which app the user is in) is passed as a routing hint, not a hard restriction — cross-domain questions still work.

**Tool layer — single source of truth.**
- Every tool is a thin wrapper over an existing Hono handler. Same RBAC check, same input validation, same audit emit. No duplicate business logic between UI and copilot paths.
- The wrapper threads the acting user's identity from chat context into the handler call. A user without `planner.task.delete` cannot delete via a tool, same as the UI (§7.4).
- Destructive tools (delete, bulk reassign, bulk complete, bulk-edit, sync-binding mutations) emit a **confirmation card**; the handler runs only after the user clicks confirm (HITL per §7.2).
- Tool-call results are surfaced inline as structured cards (task summaries, candidate lists, diff previews), not just free-form text.

**Chat memory model.**
- **Thread-scoped per-user memory.** Each user has one or more chat threads; messages append in order within a thread. The router and specialists see the full thread (subject to context-window limits) each turn.
- **No cross-thread memory in v1.** "What did I ask yesterday in another thread?" is not a v1 capability.
- **Working-memory summarization** (Mastra primitive) compresses long threads — older turns collapse into a running summary to fit the token budget. Summaries are stored alongside the thread for inspection.
- **Persistence per §7.4** — threads + messages in Postgres, owned by the user, user-deletable, GDPR-erasable; not visible to admins.
- **No tool-result caching across turns in v1.** Each invocation re-runs against the source of truth. Caching is a v1.x optimization, not a correctness concern.

**Streaming.**
- Copilot responses stream token-by-token to the chat panel. Transport reuses the SSE channel established for board updates (§5.2) — one connection per session, multiplexed by stream type. Confirmation cards and tool-call status updates flow on the same channel.

**Chatflow turn lifecycle (concrete).**

1. **Session boot** (on copilot panel open or first turn after timeout):
   - Authenticate session; resolve scope (§7.1e cache).
   - Build role-shaped tool registry; instantiate the Mastra Agent with tools + memory + role-context system prompt.
   - Load active thread (or create new).
2. **Per turn:**
   - Append user message to thread.
   - Call `agent.stream()` — Mastra orchestrates the LLM-tool loop:
     - LLM produces tool calls and/or response tokens; tokens stream to UI via SSE.
     - For each tool call: validate args → run handler (with RBAC at the boundary, SQL-filtered query) → return typed result back to the LLM.
     - For destructive tools: emit a confirmation card to the chat panel, pause the loop, resume on user confirm.
   - Persist new messages and tool calls to thread storage (Postgres); enqueue audit (§7.1e async-batched).
   - If thread length crosses the working-memory threshold, run a summarization step that compresses older turns into the running summary.
3. **Session idle/close:** thread persists; session-scoped caches (`accessible_group_ids`, tool registry instance) may evict on idle (~15 min default).

Workflow vs chat boundary is summarized in the table at the top of §7.1b. The concrete v1 workflow inventory lives in §7.1f.

### 7.1c Retrieval & embeddings posture (revised 2026-05-19 — in scope for v1)

**Posture (revised 2026-05-21, M3 implementation slice).** Semantic retrieval is the agent-flow substrate per the flagship demo §3.9.1. v1 ships embeddings for three entities (tasks, user profile, tenant knowledge corpus); the pipeline is event-driven CDC for the entity-bus entities and admin-driven upload for tenant knowledge.

- **Vector store: pgvector** (Postgres extension). No new runtime infra per §1.6.5a. HNSW indexes; per-tenant filtering at WHERE; per-tenant residency posture is identical to the rest of the data per §10.3.
- **Embedding model: pluggable via Mastra's model abstraction**, same pattern as the LLM provider (§7.1a). **Default: OpenAI `text-embedding-3-small`** (1536d) for managed deploys; self-hosters can swap in AWS Bedrock Titan Embed v2, local Ollama (`nomic-embed-text` / `bge-small`), or any model Mastra exposes. The provider config schema accommodates this from day one.
- **Embedded entities (v1):**
  - **Tasks** — `title + description + skill_tags` (labeled prose). One vector per task when source ≤1000 tokens (~95% of rows); recursive 512/50 chunking above. Stored in `planner.task_embeddings`. CDC trigger: `planner.task.{created,updated,deleted}`.
  - **User profile** — labeled prose over `identity.user_profile` (today: `skills`; extensible to job title / department / bio without schema change). One vector per user, never chunked. Stored in `identity.user_profile_embeddings` (renamed from the v1 stub `user_skill_embeddings`). CDC trigger: `identity.user.{created,profile.updated,deactivated}`.
  - **Tenant knowledge corpus** — parsed text from admin-uploaded PDF/DOCX/XLSX/CSV/TXT/MD. Recursive 512/50 chunking (always chunk — knowledge docs are long-form). Stored in `copilot.tenant_knowledge_embeddings` joined with `copilot.tenant_knowledge_chunks` and `copilot.tenant_knowledge_files`. Trigger: admin upload → parse worker → embed worker. **Pulled forward from Phase B** per D47.
  - **Plans** and **comments** — deferred per D46. Re-evaluate Phase B when a consumer query justifies the cost.
- **Ownership.** Embeddings live in the **owning module's schema** as sibling tables — never in `copilot`. The owning module's public surface (`src/index.ts`) exposes a `getEntityForEmbedding()` view function that the embedding subscriber (which lives in `copilot`) calls when refreshing. Boundary discipline (§1.6.2) holds.
- **Freshness pipeline: event-driven CDC.** A subscriber per chunkable entity reacts to domain events (`planner.task.created`, `planner.task.updated`, `identity.user.profile.updated`, etc.), re-chunks + re-embeds the affected rows, upserts into the vector index. Idempotent by `event_id` (the bus rule from §1.6.5a applies). Batched through graphile-worker. **Freshness target: search index lags primary by ≤ 60s** — same envelope as inbound MS Planner sync (§6.7).
- **Per-tenant isolation.** Embeddings tables partitioned by `tenant_id` or always filtered at WHERE; HNSW indexes scoped accordingly. Same SQL discipline as the rest of `planner.*` / `identity.*`.
- **`Retriever` function interface stays the v1 design.** Two implementations coexist from day one:
  - `FtsRetriever` — Postgres `tsvector` FTS for keyword paths.
  - `VectorRetriever` — pgvector cosine similarity for semantic paths.
  Tool code chooses based on intent (or runs both and merges); implementations are swappable. Architecture phase defines the interface and the merge policy.
- **What this unlocks in Phase A:**
  - "Find tasks similar to this one" / concept search over task descriptions.
  - Skill matching at concept level — `cloud architect` ≈ `infrastructure` works because both embed into nearby space. This is the v1 design (§3.9.1), not a fallback for a concept map (there is no concept map per D15).
  - Topic extraction from untagged tasks (`infer_task_topics`, §7.2.1) — embeddings power both the `new-task-skill-tag-suggester` workflow and the agent's reasoning when answering "find tasks about X".
- **Tradeoffs accepted.**
  - Embedding cost: a small but real per-write cost (OpenAI text-embedding-3-small is ~$0.02 per 1M tokens; cheap, but non-zero).
  - One additional residency-scope surface (the embedding model endpoint) — listed in the §10.3 checklist alongside the LLM provider.
  - The vector index adds storage + memory footprint; pgvector HNSW is the cheap path.
  - The copilot still does **not** retrieve from prior threads when answering — thread isolation per §7.4 holds; per-thread embedding is not v1.
- **What is still NOT in v1.**
  - Cross-tenant similarity search (would breach tenancy).
  - Custom per-tenant embedding models (instance-level pick only).
  - Vector-store-backed long-term memory (Mastra working-memory summarization per §7.1b is sufficient for v1; no separate "agent memory store" in vectors).

**Decisions:** see D42–D49 in `project-plan.md` §7 for the M3 implementation deltas (LIST partitioning day-1, halfvec, ef_search=100, conditional chunking, knowledge corpus pulled forward, two-stage hybrid+rerank, Mastra utilities-only).

### 7.1d External data via MCP — Timesheet integration (decided)

Mastra supports the **Model Context Protocol (MCP)**: a vendor-neutral standard for connecting LLM agents to external data sources via a small, typed RPC surface. v1 uses MCP for one purpose: pulling availability data (leave, capacity) from external timesheet / HRIS systems without building our own.

Integration: **`@mastra/mcp`** (Mastra's MCP client wrapper) sits over the official **`@modelcontextprotocol/sdk`** TypeScript SDK. The Mastra wrapper handles tool-registration into the Agent runtime; the SDK handles the wire protocol.

**Why this exists.** Self-declared availability (§3.9.2) is unreliable — people forget to update status when going on leave. Workload score (§3.9.3) is good for "how loaded are they with tasks tracked in Seta" but doesn't see leave requests, capacity allocation to other accounts, or actual hours logged. Operator orgs (Seta International included) already run a timesheet system; the platform should consume it, not replace it.

**Timesheet MCP contract (defined by v1, implemented by operators).**

```
getLeave(userEmail: string, dateRange: { from: ISO8601, to: ISO8601 })
  → [{ start, end, type: 'vacation'|'sick'|'personal'|'other',
       status: 'approved'|'pending'|'rejected' }]

getCapacity(userEmail: string, dateRange)        [optional in v1; reserved for v1.x]
  → [{ accountOrProjectKey: string, percentAllocated: 0-100 }]

getLoggedHours(userEmail: string, dateRange)     [optional in v1; reserved for v1.x]
  → [{ taskExternalKey: string, date, hours }]
```

- **Join key is email** (the platform's primary user identifier, §3.3a). Operators whose timesheet uses a different identifier configure a mapping at integration time (Seta user.email → timesheet user_id).
- **v1 consumes leave only.** Capacity and logged-hours are part of the contract so operators can implement them once and we light them up in v1.x — no breaking change at the integration boundary.
- **Read-only.** Writing back to timesheet (logging time on task completion) is v1.x or v2 (§11.4).

**Configuration model.**
- Tenant admin configures the MCP server endpoint + auth credentials, similar to the §6.4 connection pattern for sync providers. Connection is tenant-scoped, single-server per tenant in v1. Multiple timesheet sources per tenant are v1.x.
- Credentials encrypted at rest (§10.1).
- Operators run the MCP server themselves — either using a published reference adapter (we may ship one or two for popular systems) or by writing one against the contract above.

**v1 reference adapter — TBD.** Decision deferred to architecture phase: ship a reference MCP server for one common system (Jira Tempo, Harvest, BambooHR Time, etc.) or leave operators to implement against the published contract. Either way, the contract is the artifact; reference adapter is convenience.

**Failure modes.**
- **MCP server unreachable:** the recommender degrades gracefully — uses Seta-side data only, adds a "(timesheet unavailable, leave check skipped)" note to the rationale. Does not fail the whole call.
- **MCP server returns malformed data:** validation at the boundary; bad responses are logged and treated as "no leave data." Tenant admin sees the integration health in the admin UI (§8.2).
- **Latency:** MCP calls are made *concurrently* with the recommender's main DB query, joined before ranking. Budget: 500ms timeout for MCP; if exceeded, skip with the same "unavailable" note.

**Security boundary.**
- MCP server is an external service; treat all returned data as untrusted input (validate types, lengths, value ranges).
- User-typed text from chat is *never* passed into MCP arguments — only structured fields (email, date range) sourced from the authenticated session.
- All MCP calls are audit-logged (§8.1) as `system.mcp.timesheet.getLeave` etc., attributed to the user whose action triggered the call.

**Future MCP-consumer integrations (deferred — see §11.5).**
- **Calendar MCP** — direct meeting / busy-free data from Outlook / Google Calendar.
- **HRIS MCP** — role, department, manager, employment status.
- **Slack/Teams presence MCP** — currently-online signal.
- **Internal "tools" MCP servers** — operator-defined tool servers expanding the copilot's domain coverage without modifying Seta core.

### 7.1e RBAC enforcement in the copilot — and how it stays fast (decided)

The same agent definition serves every role. Behaviour differs because the agent receives a **role-shaped tool registry + a pre-resolved access scope + structured role context** at session start, not because there is per-role agent logic. This section is the contract between RBAC (§4) and the copilot.

**Three layers of defense.**

1. **Tool registration (per-session).** When a user opens the copilot, the agent's tool registry is built dynamically from the caller's effective permissions. A `planner.contributor` user does not see `bulk_delete_tasks` in the tool list at all — the LLM cannot attempt what it cannot see. Saves tokens, prevents failed tool calls, narrows the attack surface.
2. **Tool execution (per-call).** Every tool wraps an existing Hono handler (§7.1b). The handler runs its existing RBAC check using the *authenticated session's* identity — never a value supplied in chat. Belt-and-braces with layer 1.
3. **Data filtering (in SQL).** Tool handlers filter at the WHERE clause: `WHERE group_id = ANY($accessible_group_ids)`. There is no "fetch all then filter" path — that would leak data through token costs and timing channels even if the LLM never produced it.

**Optimization — why this is fast, not just correct.**

A naive implementation re-checks permissions on every tool call, fetches data then filters it, re-injects role context per turn, and writes audit synchronously. That works but costs latency, tokens, and DB load. v1 is designed against that:

- **Access scope is computed once per session and cached.** On session start (or first copilot turn) the platform resolves and caches:
  - `accessible_group_ids: int[]` — the actual groups the user can read.
  - `effective_permissions: Set<string>` — denormalized permission strings.
  - `cross_tenant_read: boolean` — true for `org.admin`/`org.viewer`.
  - `effective_role_summary: string` — a short label for system-prompt use ("Project Manager in `ClientA-Mobile`").
  
  Cache is invalidated by event (membership change, role grant change), never by polling. TTL ≤ 24h as a safety net.

- **Filtering happens in the query, not in app code.** For `cross_tenant_read=false`, the WHERE clause uses `group_id = ANY($1)` against the cached id array. For `cross_tenant_read=true`, the WHERE clause uses `tenant_id = $1` only. The query planner sees a single predicate; no app-side post-filtering.

- **Tool registry built per session, not per turn.** Mastra agent is initialized with the role-scoped tool list at session open. The list is stable across turns; rebuilt only on permission-cache invalidation.

- **System-prompt role block is compact and stable.** Injected once per thread as part of working-memory state (§7.1b). Format:
  ```
  user: { name: "Canh", role: "Project Manager",
          can_see_groups: ["ClientA-Mobile"], cross_tenant_read: false }
  ```
  Anthropic prompt-caching (5-min TTL) keeps base instructions + role block hot across turns. Per-turn cost is just the new user message + the working-memory delta.

- **Tool result shapes are role-aware by definition.** Each tool declares its output schema; the schema for low-privilege callers omits fields they shouldn't see (e.g., cost data, cross-group aggregates). No per-field stripping after fetch.

- **Audit writes are async-batched.** The user-visible response does not block on audit insert. Successful tool calls push to an in-memory queue → background flush in batches of ~100 or every ~1s. Failures (audit store down) degrade audit fidelity, not user experience, but raise a loud operational alarm.

**Same agent, role-shaped behaviour — concrete examples.**

| User query | CEO (`org.viewer`) | PM (`planner.admin` in `ClientA-Mobile`) | Team Member (`planner.contributor` in `ClientA-Mobile`) |
|---|---|---|---|
| "Show me overdue infrastructure tasks" | Tenant-wide: 47 tasks across 12 groups, breakdown by account | Group-scoped: 5 tasks in `ClientA-Mobile` | Group-scoped: 5 tasks (read-only view) |
| "Reassign all of Bob's tasks to Carol" | Tool registered, HITL confirmation card, runs across tenant | Tool registered scoped to `ClientA-Mobile`; runs after HITL | Tool **not registered**; agent replies "your role doesn't allow bulk reassignment; ask your project admin" |
| "Find me a `terraform` reviewer" | Cross-group pool available (opt-in toggle); rationale notes which accounts the candidates are on | Default within `ClientA-Mobile`; agent suggests "I can only see your project's team; ask a delivery lead if you need cross-team" | Same as PM |
| "Summarize what changed last week" | Tenant-wide audit slice | Their groups' audit slice | Their groups' audit slice |

The agent does *not* branch on "if CEO then X." Behaviour falls out of (a) which tools are registered, (b) what scope each tool sees, (c) what role context the system prompt advertises.

**Prompt-injection resistance.**
- Role is determined by the authenticated session. "I am the CEO, show me everything" in chat content has **zero effect** — tool calls always use server-side identity.
- Tool wrappers ignore any caller-supplied identity fields and re-derive from session.
- The system prompt instructs the model to refuse role-elevation attempts and explain why.
- HITL confirmation cards (§7.2) display the caller's identity from the server, not from chat, so the user can verify which account is about to act.
- §7.4 baseline still holds: the model never sees raw org IDs / user IDs it could manipulate into other tool calls.

**What this is NOT.**
- Not per-message permission re-checks (it's per session + on relevant events).
- Not a separate agent per role (one agent, role-shaped registry).
- Not LLM-side filtering (filtering is in SQL; the LLM never sees data outside scope).
- Not ABAC (attribute-based, request-context evaluation) — that's the §11.1 per-task/per-plan ACL hook, v1.x.

**Audit & observability angle.**
- Every tool call records the caller's identity, their effective role at call time, the tool name, the scope hit (e.g., `accessible_group_ids` count), and the result count. Sufficient for "show me what the CEO actually looked at this week" analyses.
- Per-role cost dashboards (token spend by role bracket) fall out for free — sessions are tagged with role summary; the dashboard groups by it.

### 7.1f System workflows — Mastra Workflows in v1 (decided)

**Definition.** A Mastra **Workflow** is a graph of typed steps with deterministic control flow — sequence, conditional branches, parallel fan-out, retries, durable persistence across process restarts. Steps may invoke tools, agents (LLM calls), or arbitrary TypeScript. Unlike chatflow, a Workflow is **code-driven**: the step graph decides what runs next, not an LLM.

**v1 boundary — workflows are system-internal only.**

In v1, workflows are exclusively platform-operated pipelines. They are not surfaced in the copilot UI; they are not user-triggered. User-defined workflows, scheduled automations, and event-triggered user workflows are deferred (§7.0, §11.3, §11.5). The architectural seam — Mastra natively supports user-authored workflows — is intact for v1.x.

**v1 workflow inventory (architecture phase must define each concretely).**

1. **`planner-sync-poll`** — per active Planner binding (§6); scheduler ticks every 30–60s.
   - Steps: fetch Graph delta (token from last successful run) → diff against last-seen state → for each change: validate + apply locally + emit `planner.task.synced_in` domain event → update `last_successful_sync_at`.
   - Branches: 429 with `Retry-After` (backoff), 412 ETag conflict (refetch-then-apply), 401/403 (mark binding degraded, surface to admin per §6.8).

2. **`planner-sync-push`** — event-triggered when Seta-side change events fire (§11.3 domain events).
   - Steps: locate binding → resolve target object id + ETag → PATCH Planner → on success record echo digest (§6.8) and emit `planner.task.synced_out` → on 412 reconcile (sub-workflow) → on permanent failure flag binding + notify admin.

3. **`capability-gap-translation`** — triggered when the sync layer encounters an unmapped translation (§6.6).
   - Steps: pause sync for affected binding → create admin notification → **wait for admin decision** (durable HITL gate; the workflow run may sit idle for hours or days) → record decision in the per-binding translation log → resume sync with chosen mapping.
   - Demonstrates Mastra's durable workflow guarantee — process restarts don't lose the pending decision.

4. **`workload-cache-refresh`** — scheduled (every ~5 min) and event-triggered on assignment-table changes.
   - Steps: enumerate users with changed open assignments → recompute `workload_score` (§3.9.3) → update cache or materialized view (architecture phase chooses).
   - May be skipped entirely if architecture phase decides live computation is fast enough — workload score is cheap to derive.

5. **`trash-purge`** — scheduled daily; only active when operator has configured retention (§10.1).
   - Steps: scan soft-deleted records past retention → hard-delete (cascading via referential integrity) → write audit row per deletion.

6. **`mcp-timesheet-leave-warm`** (optional; architecture phase decides) — scheduled (~hourly) prefetch of leave data from the Timesheet MCP (§7.1d).
   - Steps: enumerate users with open assignments in the next 14d → call `getLeave(email, today..today+14d)` in parallel → cache results with 1h TTL.
   - Alternative: skip warming; recommender fetches on demand within its 500ms budget.

<!-- D6 (2026-05-19): `audit-flush` removed — audit is now written inline via core.emit() inside the state-changing transaction. No batch queue, no flush workflow. -->
   - Steps: read batch (size N or age T) → bulk insert to audit table → on success ack; on failure retry with backoff; on sustained failure raise loud alert and apply backpressure to producers.

8. **`session-cache-invalidate`** — event-triggered on role-grant change, group-membership change, or user deactivation.
   - Steps: identify affected sessions (by user_id and group_id) → evict session-scoped permission cache (§7.1e) → optionally push refresh hint to live SSE channels so panels reload tool registries.

9. **`planner-sync-bootstrap-import`** — one-shot, triggered at bind time when user picks "Import all" or "Import recent" (§6.4).
   - Steps: page through Graph tasks within the chosen window → for each: insert local representation → emit `planner.task.imported` event → on completion mark binding `active`.
   - Resumable: a network failure mid-import does not restart from page 0.

**What is NOT a workflow in v1.**
- The chatflow turn loop (§7.1b — that's an Agent).
- Direct HTTP request handlers (Hono — synchronous request/response).
- User-defined "when X happens do Y" automations (deferred, §11.3).
- Cross-tenant or cross-instance orchestration (not in scope).

**Observability.**
- Every workflow run carries a `traceparent` (§11.6); steps emit spans with input/output sizes (not content), durations, and retry counts.
- The agent-ops portal (§7.3) lists recent runs per workflow definition: success / fail / running / waiting (for HITL gates), with drill-down to step traces.
- Operators see "the `planner-sync-poll` for binding X has failed 3 of last 10 runs at step `fetch-delta` with 429" — actionable signal.

**Failure handling and idempotency.**
- All workflow steps that mutate state must be idempotent (replays during retry must not double-apply). Architecture phase defines per-step idempotency keys (e.g., for sync push: tenant+task+ETag tuple).
- Permanent failures (auth revoked upstream, deleted resource) surface to admin UI; transient failures (429, 5xx, timeout) follow exponential-backoff-with-jitter retry policies.
- Workflows do not silently swallow errors — audit + observability are always populated, even on failure.

### 7.2 Capabilities (v1)

- Conversational task management ("create a task X, due Friday, assign to Alice and Bob").
- Querying ("show me everything overdue this week," "what changed on the engineering board?").
- Summarization ("summarize the open tasks in this plan").
- Destructive actions guarded by human-in-the-loop approval (e.g., "reassign all of Bob's open tasks to Carol" requires a confirmation card).
- **Tool-call failure UX:** surfaced clearly in the conversation thread; copilot suggests retry or alternate path; never silently swallowed.
- **No voice input, no mobile-native copilot in v1.** Web only.

#### 7.2.1 Tool catalog — atomic primitives only

Aligned with §16.5 and Mastra's agent-vs-workflow guidance: tools are **atomic primitives**. The agent decides composition dynamically per intent. No macro tools (no `recommend_reviewers`, no `find_tasks_needing_review` — those are composition recipes, §7.2.2). Deterministic multi-step processes go in §7.1f workflows, not in the tool catalog.

**Read primitives (no HITL).**

| Tool | Returns | Notes |
|---|---|---|
| `list_my_accessible_groups()` | `group_id[]` | Scope resolution. |
| `list_tasks({ group_ids?, review_state?, skill_tags?, due_before?, assignee_id?, completed?, limit? })` | `TaskRow[]` | Structured filter. All filter fields optional. Empty `review_state` / `skill_tags` filters are typical (most tasks lack these). |
| `get_task({ task_id })` | `TaskDetail` | Single record with full fields. |
| `search_tasks_semantic({ query, group_ids?, limit? })` | `{ task, score }[]` | pgvector cosine similarity over `task_embeddings` (§7.1c). |
| `search_users_semantic({ query, group_ids?, limit? })` | `{ user, score }[]` | pgvector over `identity.user_skill_embeddings`. |
| `infer_task_topics({ task_id?, content?, top_k? })` | `{ topic, confidence, evidence }[]` | LLM + embedding aggregate over similar-task tags. Atomic primitive — used by the `new-task-skill-tag-suggester` workflow *and* by the agent when reasoning about a task whose `skill_tags` are empty. Same code path either way. |
| `infer_user_skills_from_history({ user_id, top_k?, recency_window? })` | `{ skill, evidence_tasks[], last_used }[]` | Recency-weighted topic extraction over the user's assignment history (§3.9.1). |
| `match_users_to_topic({ topic, group_ids?, top_k? })` | `{ user_id, match_score, source: 'declared' \| 'history' \| 'both' }[]` | Combines declared-skill embedding match (`identity.user_skill_embeddings`) and history-inferred match. Returns raw match scores — no workload or availability filter. |
| `get_user_availability({ user_id })` | `{ status, ooo_until, working_hours, timezone }` | Self-declared availability fields (§3.9.2). No leave overlay. |
| `compute_workload({ user_id })` | `{ score, breakdown }` | Live computation per §3.9.3; raw score, no threshold applied. |
| `get_leave_overlap({ user_id, start, end })` | `{ on_leave: bool, source, range? } \| { degraded: true }` | Timesheet MCP call (§7.1d); graceful degradation on MCP failure. |

**Write primitives (HITL-gated per §14.1).** `create_task`, `update_task`, `assign_task` / `unassign_task`, `complete_task`, `delete_task`, `set_review_state`, `add_skill_tag` / `remove_skill_tag`, `apply_label` / `remove_label`, `add_checklist_item` / `toggle_checklist_item`, `create_group`, `add_group_member`, `create_plan`, `create_bucket` / `reorder_buckets`, plus `bulk_*` variants (§5.3). Each is a thin wrapper over its module's public-API function; all writes require user approval via assistant-ui Interactable confirmation card.

**Cross-group scope rule.** Tools that accept `group_ids` default to the caller's `accessible_group_ids`. Callers with `org.viewer` or `org.admin` (§4.4) may pass `scope: 'tenant'` for cross-group read primitives (`search_tasks_semantic`, `search_users_semantic`, `match_users_to_topic`, `list_tasks`); the tool ignores `scope: 'tenant'` from callers without the role and surfaces the constraint in its result rationale rather than silently downscoping.

#### 7.2.2 Composition recipes (illustrative, not a contract)

These narrate how the agent typically answers flagship queries by composing §7.2.1 primitives at runtime. They are **not** spec — the LLM may compose differently per turn, and that flexibility is the point. The recipes exist so reviewers see that the catalog is sufficient for the flagship use case.

**Recipe: "Find tasks needing review on terraform"**

```
1. list_my_accessible_groups() → groups
2. In parallel:
   a. search_tasks_semantic({ query: 'terraform review needed', group_ids: groups })
   b. list_tasks({ group_ids: groups, review_state: 'needs_review' })  // catches explicitly-pinned tasks
3. Merge candidates; LLM filter pass over title + description of each:
   - Is this task asking for review? Signals: "PTAL", "ready for review", "@x please check",
     bucket name "Review", label "Needs Review", checklist incomplete with high % complete.
   - Is it about terraform / infrastructure?
4. Rank by: explicit review_state pinned (boost) > LLM judgment confidence > recency.
5. Return ranked cards with one-line rationale per result.
```

The recipe degrades gracefully: if no tenant has ever set `review_state`, step 2b returns empty and the agent works entirely off semantic + LLM filter. If many do, step 2b is the high-precision anchor and 2a provides recall.

**Recipe: "Recommend reviewers for this task"**

```
1. Read task: get_task({ task_id }) → { title, description, skill_tags, labels, bucket }
2. Topic extraction:
   - If skill_tags non-empty: use as pinned topics (high confidence).
   - Else: infer_task_topics({ task_id }) → topics.
3. For each topic: match_users_to_topic({ topic, group_ids: [task.group_id] }) → candidates_per_topic
4. Merge, dedupe by user_id, sum match_scores across topics.
5. For each candidate, in parallel:
   - get_user_availability({ user_id })
   - compute_workload({ user_id })
   - get_leave_overlap({ user_id, start: today, end: today+14d })   // graceful degradation
6. Apply availability policy (tenant-default or user-stated, e.g., "ignore workload"):
   - default: rank available > at_capacity > on_leave; within bucket sort by match_score.
7. Cross-group expansion is opt-in (org.viewer / org.admin) per §7.2.1 scope rule.
8. Return ranked cards with per-candidate rationale:
   "matches terraform (declared + 3 recent tasks), kubernetes (3 recent tasks);
    workload 4.5; not on leave (per AcmeTimesheet); 2pm in Asia/Ho_Chi_Minh."
```

**Display only in v1.** The agent presents the ranked list; the user manually picks and assigns through the task-edit UI (or by saying "assign Alice" — which triggers the `assign_task` HITL card). No agent-driven auto-assign in v1 — v1.x (§11.8).

**Why composition, not a macro.** Hardcoding either flow as a single tool (e.g., `recommend_reviewers({ task_id, scope })`) would freeze the ranking policy, the availability rule, the scope-resolution semantics, and the merge strategy inside the tool. Users asking variations ("ignore workload"; "include people on leave but flag them"; "rank by recent activity instead of skill match") would each need a new tool or a parameter, leading to tool sprawl. The atomic-primitive shape lets the LLM accommodate those variations turn-by-turn from the same building blocks. See §16.5 + ADR D15.

### 7.3 Agent operations (internal portal)

- A separate portal for operators (Seta team initially, potentially customer admins) to inspect agent activity: conversations, tool calls, workflow runs, approval queues, traces, costs, integration health.
- This must exist from v1 because debugging a copilot without observability is impossible.
- **Access:** `copilot.viewer` within a tenant (sees their tenant's slice) and instance superadmin (sees aggregate / per-tenant metrics, never conversation content — per §2.5). Reading individual conversation transcripts is restricted to the conversation's owner (per §7 conversation-persistence decision).

### 7.4 Constraints

- The model never sees authorization-relevant data (org IDs, user IDs) as text it could manipulate. Tenancy is structural, enforced at the data layer.
- AI actions are auditable — every tool call records who, what, when, and the data before/after.
- AI access is gated by the same role-based permissions as human actions (a user without `planner.task.delete` cannot delete a task via the copilot).
- **Cost controls (decided):** the platform exposes **per-tenant request/token rate limits** configured by the instance superadmin, plus a usage dashboard (per-tenant, per-time-window). Hard-stop when limits are hit. Per-user budgets, anomaly auto-pause, and soft-warn modes are out of v1 scope (v1.x candidates). Rationale: simple, defensible for an internal-only / self-hosted product; matches the superadmin-managed posture.
- **Conversation persistence (decided):** copilot conversations are **persisted per user, user-deletable, not visible to anyone else** (not tenant admins, not superadmins). Treated as personal data subject to GDPR DSRs (export + erasure tooling required). No admin-visible mode in v1; that's a regulated-environment v1.x candidate.
- **AI provider data residency: operator responsibility.** Documented in the residency-scope checklist (§10.3). The operator's choice of provider determines where model inference happens; the platform does not impose a region.

---

## 8. Audit & observability

### 8.1 Audit log (a product feature, not just diagnostics)

- Every meaningful action — by a user, by the system, by AI — is recorded in an immutable audit log.
- **Physical storage (D6, 2026-05-19):** the audit log shares `core.events` with the domain-event bus (§1.6.5a). The event payload contract carries `actor`, `before`, `after`, `ip`, `user_agent` — same data a separate audit table would carry. Audit-shaped reads go through `core.audit_v` (a Postgres view over `core.events`) for ergonomics; admins, DSR tooling, and the Phase B audit-log browser query that view. No second physical table.
- Audit records carry: who acted, what action, on what target, when, and contextual metadata.
- Action names follow a `subject.verb` convention (e.g., `user.signed_in`, `task.created`, `connection.activated`).
- Tenant admins can browse and export their tenant's audit log (Phase B+ UI; the data already exists in Phase A's `core.events`).
- **Actor model:** four actor types — `user`, `copilot-on-behalf-of` (records the human prompter and the agent name), `system` (sync, cleanup, scheduler), `superadmin`. The `actor` payload field is a tagged union `{ type: 'user' | 'copilot' | 'system' | 'superadmin', user_id?, agent_name?, ... }`. Schema accommodates all four from v1.
- **Retention:** no platform-enforced policy. Operators decide via DB lifecycle (audit table partitioned by month to make this easy).
- **Export formats:** JSON + CSV exposed via admin UI download. Programmatic export API and SIEM-friendly streams (Splunk, Datadog) deferred to v1.x (see §11).
- **Tamper-evidence:** append-only DB table in v1. Hash-chained records deferred — needed for SOC 2 Type 2 but not v1 GDPR-only posture.

### 8.2 Observability (operational)

- Operators need distributed tracing across HTTP, AI, and integration calls.
- Per-org cost/usage visibility for AI traffic.
- Sync health visibility (last successful sync per connection, failure counts, dead-letter queue).
- **Customer-facing observability deferred to v1.x.** v1 surfaces per-binding sync health to tenant admins (last successful sync, failure count, error reason) in the admin UI; status pages and per-tenant dashboards are operator concerns / future work.

---

## 9. Admin & self-service

### 9.1 Org admin surfaces (the customer's IT admin)

- Manage users (invite, deactivate, change role grants).
- Connect / disconnect Entra (and future SSO providers).
- Connect / disconnect Microsoft 365 Planner (and future trackers).
- Configure IdP-group-to-role mappings.
- View audit log.
- View integration health.
- **No tenant branding in v1.** Every tenant on an instance sees the same UI. Instance operators may theme the entire instance (a separate concern, deferred); per-tenant logos / colors / vanity domains are v1.x candidates.

### 9.2 Instance superadmin surfaces

Required in v1 (see §2.2 and §2.5). Concrete capabilities:

- Create / suspend / delete tenants.
- Designate the initial tenant admin during creation.
- View instance-wide audit log (instance-level events: tenant created, auth-provider configured, etc. — *not* tenant business data).
- View per-tenant operational health (seat counts, sync connector status, last-active timestamps, error rates) — metrics only, no business data.
- Manage instance-wide configuration: which auth providers are enabled, sub-processor list, feature toggles, AI provider credentials.
- **Explicitly NOT in superadmin scope (per §2.5):** reading tasks/plans/comments/users in a tenant.

---

## 10. Non-functional requirements

### 10.1 Compliance & data protection

- **GDPR-ready at launch.** Includes: DPA artifact (clickwrap or pre-signed PDF), public sub-processor list with 30-day objection window, data subject request (DSR) tooling exposed to tenant admins (access, rectification, erasure, portability), explicit "no customer data used for model training" commitment, 24–48h customer-notification SLA on breaches, cross-border transfer mechanisms (SCC/IDTA/Swiss addendum) as applicable.
- **DSR erasure vs. normal soft-delete:** the soft-delete model (§5.3 — trash retained indefinitely) is for user convenience. **GDPR erasure requests bypass trash and hard-delete immediately** — across primary data, search indexes, AI conversation history, attachments in S3, and (with pseudonymization) audit log fields. Tenant admin gets an explicit "Erase user's personal data" tool distinct from "Delete user."
- **Audit log retention:** no platform-enforced retention. Operators decide via DB-side lifecycle / archival tooling. Architectural choice in v1 should make this easy (e.g., partition audit table by month).
- **SOC 2 deferred** to the first enterprise deal that demands it. Architectural choices in v1 should not foreclose future SOC 2 (centralized audit log, MFA, access reviews, change-management traceability — all already pointed at in §3, §4, §8).
- **ISO 27001, HIPAA: out of scope for v1.** Revisit per deal (see §11).
- All sensitive data (OAuth tokens, secrets) is encrypted at rest.
- All traffic is TLS in transit.
- **Customer-managed encryption keys (BYOK / CMEK): deferred to v1.x or later** (see §11). v1 uses platform-managed keys (AWS KMS-backed for self-hosters who opt in).
- **Erasure scope across backups and audit logs (decided):** **backups are out-of-scope of surgical scrubbing** when rotation is bounded (operator's backup retention period is documented; deleted records do not return to production after their rotation cycle). **Audit log records are pseudonymized in-place** on DSR erasure — operating on `core.events` rows (per D6) where the `actor.user_id` is replaced with a stable pseudonym, `actor.email` / `actor.name` cleared, and `payload.before` / `payload.after` PII fields scrubbed; the event_type / timestamp / aggregate_id survive for compliance. Per CNIL / EDPB guidance.

### 10.2 Availability & performance

- **SLA: operator responsibility.** OSS / self-hosted product; the platform does not commit to an availability SLA. Architectural choices (stateless API services, no region-pinned state) should make 99.9% achievable on a competent single-region AWS deployment.
- **Latency target (Kanban interactions):** p95 read < 200ms, p95 write < 500ms on a baseline reference deployment with typical task counts. Treated as a budget for engineering, not a customer commitment.
- **Scale targets (soft, for capacity planning):** 1,000 users per tenant, 100 tenants per instance, 100k tasks per tenant. Architecture must not preclude going past these; we just don't certify it for v1.
- **RPO/RTO targets (doc-only Phase A, drill in Phase B):** RPO ≤ 15 minutes, RTO ≤ 1 hour on a competent single-region AWS deployment. Phase A documents the target so backup cadence and recovery design align; Phase B exercises a restore-and-verify drill across `core.events` partitions, Mastra durable state, and per-module projections.
- **Per-tenant AI cost envelope (doc-only Phase A target):** $50/tenant/month at typical use (~1k chat turns × ~3k tokens/turn × current model pricing, plus embedding refresh on ~10k task writes/mo). Re-baseline numbers after Phase A telemetry lands. The cap (§7.4) is a fuse; this is the budget the cap is set against. Phase A surfaces a dashboard against the target; Phase B+ tunes.

### 10.3 Data residency (decided)

- **Single-region per instance.** Operator picks the AWS region at deploy time. The platform documents residency as "wherever you deployed."
- **Residency-scope checklist** (operators' compliance aid): primary Postgres, S3 attachments, audit log storage, AI inference endpoint, transactional email provider, and operational telemetry / error tracking are all surfaces where data lives. Operators audit each independently — the platform's docs enumerate them so nothing is silently in a different region.
- Multi-region active-passive / active-active deployments are out of v1 core scope; achievable downstream by operators using standard AWS multi-region patterns.

### 10.4 Backups & recovery

- **RPO/RTO: operator responsibility, platform-recommended target.** The platform provides backup-friendly architecture (Postgres as source of truth, S3 for attachments, no in-memory unrecoverable state); the operator runs the backups and disaster-recovery process. Recommended target: RPO ≤ 15 min (Postgres PITR + WAL archive), RTO ≤ 1 h (RDS snapshot restore + boot). Phase B includes a restore-and-verify drill (§14.2) confirming `core.events` partition consistency, Mastra durable workflow state, and module projections rebuild cleanly.
- Self-serve restore for tenants is deferred to v1.x (see §11).

### 10.5 Deployment

- **Cloud:** AWS (see §1.5). Microsoft Graph calls cross a cloud boundary; account for latency and egress in the sync design.
- **Self-hostable: yes.** Distribution is OSS (see §2.4). Container images + Terraform / CDK examples for an AWS deployment ship in the repo. On-prem (non-AWS) is not actively supported in v1; the architecture (12-factor, no AWS-runtime-API dependencies in app code) should not preclude it.
- **AWS region:** operator picks at deploy time (§10.3).
- **Deployment shape (per §1.6.7): single container, modular monolith.** All five modules (`core`, `identity`, `planner`, `copilot`, `integrations`) run in-process. `docker compose up` for evaluation; ECS / Fargate for production-grade AWS. Reference Terraform / CDK ships in the repo.
- **Horizontal scaling** via replicas of the single container behind a load balancer, backed by shared Postgres + S3. v1 scale targets (§10.2) are well within single-container vertical scaling + a few replicas.
- **Per-module deployment is NOT a v1 mode.** Per-module extraction is the playbook in §1.6.12, used when scale or blast-radius pain justifies it (likely v1.x+ for `copilot` if AI traffic grows out of band with the rest). The §1.6.2 module boundary discipline is what makes extraction tractable; it does not require a v1 multi-container deployment.

### 10.6 Frontend & access non-functional (decided)

- **Browser support:** modern evergreen — last two major versions of Chrome, Firefox, Safari, Edge. No legacy IE, no early-major-version compatibility.
- **Accessibility:** WCAG 2.1 AA as the v1 target. Audit before v1 launch.
- **Internationalization:** English only at v1, framework-ready (no hardcoded user-facing strings; i18n key extraction in place). Translations are a v1.x candidate (see §11).
- **Mobile:** web-responsive only; no native mobile apps in v1.

---

## 11. Deferred capabilities & architectural hooks

This is **not** a flat "out of scope" list. For each deferred capability we capture:

- **What** — the capability deferred from v1.
- **When** — `v1.x` (next minor cycle, expected), `v2` (major future), or `no commitment` (may never happen, but worth not foreclosing).
- ***v1 hook:*** what v1 architecture must do (or avoid doing) so this capability can be added later without rewriting the system.

The critical posture: **v1 does not implement these, but v1 design must not paint us into a corner that makes them disproportionately expensive later.** If a deferred capability has no v1 hook noted, it means nothing in v1 stands in its way.

### 11.1 Identity & access

- **MFA for local-password users (TOTP, then WebAuthn/passkeys)** — `v1.x` (TOTP), `v2` (passkeys). *v1 hook:* login flow passes through a challenge handler interface (today it always returns "no challenge"); user account schema includes a `second_factors` relation even if empty.
- **Additional SSO providers (Okta, Google Workspace, generic SAML/OIDC)** — `v1.x`. *v1 hook:* authentication provider abstraction — each provider is a strategy with a config blob; the email-domain → provider routing table already supports per-tenant mapping.
- **SCIM / Graph directory sync for user provisioning** — `v1.x`. *v1 hook:* user provisioning is a service interface; JIT-on-SSO is one implementation, SCIM will be another.
- **Custom roles defined by tenants** — `v1.x`. *v1 hook:* roles and permissions are data rows (Drizzle tables), not code constants. The permission-check call site is a single function.
- **Per-task / per-plan ACLs beyond group membership** — `v1.x`. *v1 hook:* permission checks go through a function call (not inlined SQL), so ACL evaluation can be added alongside group-membership evaluation without touching call sites.
- **Time-bounded role grants, approval workflows, role hierarchies** — `v2`. *v1 hook:* grants table has nullable `expires_at` and `granted_by` even if always (null, system) in v1.
- **Support-impersonation with consent** (superadmin temporarily acts as a tenant user, fully audited) — `v1.x`. *v1 hook:* audit actor model already includes `superadmin` and `copilot-on-behalf-of` patterns — extending to `superadmin-impersonating-user` is additive.

### 11.2 Tenancy, onboarding, branding

- **Hosted SaaS variant** (Seta International or a downstream operator running multi-customer hosted service) — `no commitment` for this project. *v1 hook:* nothing in core assumes single-tenant deployment; an optional billing/seat-counting module can sit alongside core without modifying it.
- **Self-serve tenant signup** — `v1.x` for any operator who wants it. *v1 hook:* tenant-creation API exists for superadmin; an unauthenticated wrapper with email verification + abuse protection is purely additive.
- **Tenant branding (logo + colors), vanity domains** — `v1.x`. *v1 hook:* tenant entity has a metadata blob; UI uses CSS variables; host-header routing is feasible without major refactor.
- **Per-tenant configurable retention** (audit, soft-delete trash, conversation history) — `v1.x`. *v1 hook:* retention is a function-of-tenant-config (defaults from instance config), not hardcoded constants.
- **First-class accounts / clients entity (above groups)** — `v1.x`. *v1 hook (§2.3):* `groups.account_id` nullable column shipped in v1. Migration adds the `accounts` table and backfills from naming-convention groups via a tenant-admin tool. Pricing/billing tie-ins (if a hosted variant emerges) hang off accounts.
- **Scoped role grants** (e.g., `org.viewer` limited to a list of accounts) — `v1.x`. *v1 hook:* the role-grants table includes a nullable `scope JSON` column from v1 (always null today). Future scoped grants encode their scope here without schema migration. Permission-check function (§11.1) reads scope when present, full bypass when null.
- **`org.pmo` role** (cross-group read + edit governance fields like priority, due date, status — no create/delete) — `v1.x`. *v1 hook:* same permission-check function as v1; new role definition + permission strings. No infra change.
- **Per-tenant module enablement** (tenant admin toggles which modules their tenant sees — Workspace-style) — `v1.x`. *v1 hook:* runtime check at the shell + route-middleware layer keyed on `(tenant_id, module)`. No schema migration; no impact on §1.6 module structure.
- **Per-module vanity domains** (`planner.acme.seta.com` routing) — `v1.x`, paired with tenant branding. *v1 hook:* `core`'s session middleware and routing layer can dispatch by host header; the module's mount point is unchanged.

### 11.3 Planner module — additional capabilities

- **Recurring tasks** — `v1.x`. *v1 hook:* task schema is extension-ready (Drizzle migrations add `recurrence_rule`, occurrence generator runs as scheduled job).
- **Task dependencies (blocks / blocked-by)** — `v1.x`. *v1 hook:* avoid baking "tasks are leaf nodes" into APIs; expect a dependency-edge join table.
- **Task templates** — `v1.x`. *v1 hook:* task-creation path accepts a "from template" variant; template entity is a sibling of plan.
- **Workflow / automation rules** ("when task moves to bucket X, do Y") — `v1.x` to `v2` depending on demand. *v1 hook:* **emit domain events for every meaningful change** (`task.created`, `task.assigned`, `task.moved`, `task.completed`, …) in v1 even though no rule engine consumes them yet. Same event shape feeds the audit log, so this is essentially free.
- **Live collaborative editing (cursors, OT/CRDT)** — `v2` (real cost). *v1 hook:* SSE in v1; transport upgrade to WebSocket is additive. Optimistic-update story should exist in the v1 client.
- **Bulk import from competitor tools (Trello, Asana, Jira)** — `v1.x`. *v1 hook:* importer is a one-shot variant of a connector (§6.2 abstraction).
- **Calendar integration, time tracking, OKRs, forms / intake** — `no commitment`. *v1 hook:* none required — these are independent business modules added alongside `planner` via the §1.6.3 playbook. The §1.6.2 boundary discipline makes each addition a localized change.

### 11.4 External sync — additional capabilities

- **Second sync provider (Jira, Trello, Asana, Linear, ClickUp)** — `v1.x`. *v1 hook:* connector abstraction (§6.2). Each connector is a separate package implementing a common interface.
- **Planner Premium / Project for the Web (Dataverse-backed)** — `v1.x` as a separate connector. *v1 hook:* connector abstraction supports multiple Planner-family connectors side-by-side.
- **Comments sync** (once Microsoft publishes the new task-chat Graph API) — `no commitment` (gated on Microsoft). *v1 hook:* the comment domain model exists in v1 (§5.2); the sync layer can add a comment channel without touching task sync.
- **Attachment file content sync via SharePoint/OneDrive** — `v1.x` or `v2`. *v1 hook:* attachment model already separates file (S3-stored) from URL reference; the sync layer can add a file-content channel that mediates SharePoint/OneDrive APIs.
- **Pause-sync feature** (bulk-edit without thrashing the remote) — `v1.x`. *v1 hook:* connector worker has per-binding state; `paused` is an additional state.
- **Bidirectional comment sync, attachment sync, full-fidelity label sync** — gated on the same constraints; *v1 hook:* the capability-gap translation log (§6.6) already accommodates new mappings.

### 11.5 AI / copilot — additional capabilities

- **Per-tenant LLM provider selection** — `v1.x`. *v1 hook:* provider config schema accommodates per-tenant overrides; Mastra integration is not coupled to a hardcoded provider.
- **Custom AI instructions / "company knowledge" per tenant** — `v1.x`. *v1 hook:* prompt-composition layer is templated, not hardcoded; tenant-context block is the obvious extension point.
- **User-defined custom agents** (named agents with tool allowlists, schedules, triggers, sharing) — `v1.x` to `v2`. *v1 hook:* Mastra primitives natively support this; v1 just doesn't expose the UI / permission model. Agent definitions become first-class entities with their own permission scope.
- **Scheduled / triggered automations** — `v1.x`. *v1 hook:* Mastra supports this natively; integrate with the domain-event bus (§11.3 — workflow rules).
- **Anomaly detection & cost auto-pause** — `v1.x`. *v1 hook:* rate limiter is pluggable middleware in front of the LLM call; per-tenant usage metrics are already collected for the dashboard.
- **Soft-warn / overage-billing cost modes** (Copilot-style) — `v1.x` if a hosted SaaS variant emerges. *v1 hook:* rate limit is configurable; hard-stop is one of several possible modes.
- **Voice / mobile-native copilot** — `v2`. *v1 hook:* copilot is a stateless API; future surfaces consume the same API.
- **Admin-visible conversation history for compliance** (currently user-private only) — `v1.x` for regulated tenants. *v1 hook:* conversation persistence schema already exists; visibility is a permission check, not a storage change.
- **Vector store / RAG infrastructure** (pgvector or external) — `v1.x`, gated on the first dogfood use case that earns it (semantic task search, skill normalization, or company-knowledge RAG — whichever pulls hardest). *v1 hook:* the `Retriever` function-interface in §7.1c — v1 implements with Postgres queries, v1.x adds a `VectorRetriever` sibling without touching tool code. Embedding pipeline (model selection, batch generation, re-embed on edit) becomes a Mastra workflow when activated.
- **Cross-specialist orchestration** (a single turn that hands off between `planner.agent` and `staffing.agent`) — `v1.x`. *v1 hook:* Mastra's `network` primitive is the integration point; v1 keeps single-specialist-per-turn for simplicity.
- **Cross-thread memory / "what did I ask last week"** — `v1.x`. *v1 hook:* thread persistence already exists; cross-thread retrieval is a new tool, gated on the user's own threads only (privacy boundary per §7.4).
- **Additional MCP-consumer integrations beyond timesheet** — all `v1.x`:
  - **Calendar MCP** (Outlook / Google Calendar) — meeting load + busy/free; once landed, working-hours overlap (§3.9.2) graduates from display-only to a hard filter.
  - **HRIS MCP** (BambooHR, Workday, etc.) — role / department / manager / employment-status; enables organisational visualisations and richer role hints to the copilot.
  - **Slack / Teams presence MCP** — currently-online + "in a huddle" signals as additional availability inputs.
  - **Operator-defined "company tools" MCP servers** — operator-specific tool surfaces (e.g., an internal deployment system) reachable from the copilot.
  
  *v1 hook for all:* §7.1d's MCP-consumer pattern is generic — adding a new MCP integration is a new tenant-config entry + a new typed contract + a new Mastra tool wrapping it. No core platform change required per integration.
- **Timesheet write-back** (Seta logs time on task completion → MCP server's `logHours`) — `v1.x` or `v2`. *v1 hook:* the contract surface in §7.1d reserves space for write operations; v1 just doesn't implement them.

### 11.6 Audit & observability

- **Hash-chained tamper-evident audit log** — `v1.x` (when SOC 2 Type 2 is pursued). *v1 hook:* audit record schema includes a `prev_hash` field even if unused in v1 — back-fill is cheap if needed.
- **Programmatic audit export API + SIEM-friendly streams (Splunk, Datadog)** — `v1.x`. *v1 hook:* audit reads are a separable service; UI download is one consumer, API is another.
- **Customer-facing status page; per-tenant usage / sync dashboards beyond admin UI** — `v1.x`. *v1 hook:* primarily an operator concern; metrics are already collected per tenant.
- **Distributed tracing across HTTP / AI / integration calls** — partially v1, expanded v1.x. *v1 hook:* propagate trace context (W3C `traceparent`) end-to-end from v1, even if the visualization tooling is just "operator's OTel backend of choice."

### 11.7 Operational / non-functional

- **Multi-region active-passive / active-active deployment** — `v2`. *v1 hook:* stateless API services, no region-pinned application state, clean separation of state stores (Postgres, S3, optional Redis). No code path assumes "the database is local."
- **Customer-managed encryption keys (BYOK / CMEK)** — `v1.x` or later. *v1 hook:* application-level encryption of high-sensitivity fields (OAuth tokens, secrets) goes through a key-provider abstraction even if v1 only has one implementation.
- **Internationalization** (translations beyond English) — `v1.x`. *v1 hook:* no hardcoded user-facing strings; i18n key extraction in place from day one.
- **Mobile native apps (iOS, Android)** — `v2`. *v1 hook:* REST/JSON API design suitable for mobile clients; no UI-coupled responses; no session assumptions specific to browsers (cookie-vs-token works for both).
- **Self-serve point-in-time restore for tenants** — `v1.x`. *v1 hook:* tenant-scoped data is cleanly identifiable (partition by tenant_id); backup tooling already operates at that grain.
- **SOC 2 Type 2 certification** — when an enterprise deal demands. *v1 hook:* MFA path (via Entra), centralized audit log, change-management traceability, access-review export — all the §10.1 / §3 / §8 architectural choices already accommodate it.
- **HIPAA, ISO 27001** — per-deal `no commitment`. *v1 hook:* same as SOC 2; encryption, audit, access control already in place.
- **On-prem (non-AWS) deployment** — `no commitment`. *v1 hook:* 12-factor app; avoid AWS-runtime-API dependencies in application code (use S3-compatible clients, not AWS-SDK-specific features).

### 11.8 Skills, availability, staffing recommendations

- **Embedding-based skill matching** — **shipped in v1** as the default (replaces hand-curated concept map; see §3.9.1). Not a deferred item.
- **Skill freshness signals** (recent-task-history weighting) — **shipped in v1** via `infer_user_skills_from_history` (§7.2, §3.9.1). Not a deferred item.
- **Auto-suggest `skill_tags` on task creation** — **shipped in v1** via the `new-task-skill-tag-suggester` subscriber consuming the `infer_task_topics` primitive (§7.2). HITL card to the creator's chat.
- **Skill proficiency levels** (`junior` / `mid` / `senior` per skill) — `v1.x`. *v1 hook:* skills are bare strings in v1; the schema can be widened to `{tag, level}` objects without changing the ranking primitives' input shape (level becomes an optional weight).
- **Peer skill endorsement / verification** — `v2`. *v1 hook:* additive feature on top of user profile; no v1 schema work needed.
- **Calendar / Slack-status / Teams-status integration for richer availability** — `v1.x`. *v1 hook:* `availability_status` is the user-facing surface; an integration worker writes the same field on behalf of the user. Working-hours overlap (§3.9.2) becomes a filter, not just a display, once calendar context exists.
- **Effort estimates / story points on tasks** — `v1.x`. *v1 hook:* task schema is extension-ready (§11.3 already calls this out for other dimensions); workload-score factor set is fixed in v1 but extension-ready (§3.9.3).
- **Velocity / historical completion rate** as a workload-score input — `v1.x`. *v1 hook:* requires a small analytics layer over assignment-history; metric flows into workload_score with the same multiplicative shape.
- **Copilot-driven one-click assign from the recommendation card** — `v1.x`. *v1 hook:* the staffing-recommendation composition (§7.2) already produces structured candidates; the "assign from card" tool call is a sibling of the existing assignment endpoint, gated by the same RBAC + HITL pattern as §7.2 destructive actions.
- **Skill-based notifications** ("a new task tagged `infrastructure` needs review") — `v1.x`. *v1 hook:* depends on the domain-event bus (§1.6.5a); a subscriber filters `planner.task.review_state.changed` events where `new_value = 'needs_review'` and matches subscribers by skill overlap.

### 11.9 Distribution / commercial

- **Hosted SaaS by Seta International or a downstream operator** — `no commitment`. *v1 hook:* see §11.2.
- **Open-core split (paid enterprise tier)** — `no commitment` and would require a license change (currently Apache 2.0, §2.4). *v1 hook:* nothing precludes it; module organization is clean enough to extract a paid layer later if posture ever shifts.
- **Marketplace / third-party extension framework** — `v2`. *v1 hook:* the app-framework manifest pattern (§1.6.4) already describes how an app contributes roles, permissions, navigation, copilot tools, and events. A future tenant-installable / 3rd-party app drops into the same shape — what's missing is sandboxing (isolation between vendor code and platform), a signing/trust model, and an installation flow. None of those require restructuring v1.
- **Tenant-installable apps** (the operator pre-approves a catalog; tenant admins install per tenant) — `v2`. *v1 hook:* per-tenant app enablement (§11.2 v1.x hook) is a precursor; sandbox + signing land in v2.
- **Public REST/GraphQL API for customer integrations** — `v1.x`. *v1 hook:* internal API is versionable from v1 (path-prefixed `/v1/...`); the UI is one consumer among many possible — don't deeply couple Hono routes to UI specifics.
- **Outbound webhooks (Seta → customer systems)** — `v1.x`. *v1 hook:* domain events (§11.3) are also the source for outbound webhooks; same event bus, different subscriber.

---

### Architectural principles that emerge from §11

Reading across the hooks, a few v1 design rules are non-negotiable because they unlock the deferred surface:

1. **Permission checks are function calls**, not inlined SQL. (Unlocks: custom roles, ACLs, impersonation.)
2. **Auth/sync providers are strategies behind a stable interface.** (Unlocks: Okta, SAML, Jira, Trello, Premium.)
3. **Domain events are emitted for every meaningful change.** (Unlocks: workflows, automations, outbound webhooks, SIEM streams.)
4. **State stores are cleanly separated and not region-pinned.** (Unlocks: multi-region, on-prem, BYOK.)
5. **API is versioned and consumed by the UI as just-another-client.** (Unlocks: public API, mobile, automation.)
6. **Schemas leave room** for `expires_at`, `prev_hash`, `recurrence_rule`, `second_factors`, `parent_task_id` — even when the v1 field is always null.
7. **i18n keys from day one** — strings live in catalogs, not in JSX.

---

## 12. Open questions remaining

The bulk of §12's original open questions are now resolved in their home sections or moved into §11. What follows is the residual list — questions that genuinely still need a decision before architecture, or that should be revisited after first dogfood.

### 12.1 Genuinely still open (decide before architecture)

All six previously-open items resolved 2026-05-19; decisions live in their home sections. Captured here for trace.

- **§3.4 Entra-removed-user detection.** No periodic Graph reconciliation in v1. SSO failure revokes the user's refresh tokens immediately, narrowing worst case from 14 days to 15 minutes. Future hook: SCIM (§11.1).
- **§3.6 Idle-session timeout.** Tenant-configurable; default 30 days, range 1–90 days. Implementation: comparison against `refresh_token.last_used_at`.
- **§3.8 Failed-login threshold + notification.** Backoff schedule fixed (1–2 = 0s, 3 = 1s, 4 = 5s, 5 = 30s, 6–10 = 1min, 11+ = 5min), 15-minute sliding window per `(email, IP)`. User-notification email at 5 failures in 15min, rate-limited to 1/hour per email. Unknown emails counted same as known. No CAPTCHA in v1. `failed_login_attempts` table is the v1.x hook for per-email credential-stuffing detection.
- **§4.4 Audit-log permission separability.** `core.audit.read` is a first-class permission string from day one, bundled into `org.admin`. No separate `org.auditor` role in v1. Future hook: custom tenant roles (§11.1) define `org.auditor` against the existing permission — zero migration.
- **§6.4 Import-recent window options.** Fixed buckets: 7d / 30d / 90d / 1 year / all. Each shows the remote task count before user picks. Custom date ranges are a v1.x additive UI change.
- **§4.2 IdP group → role recompute cadence.** SSO-login-time only in v1. No background reconciliation. Future hook: SCIM (§11.1).

### 12.2 To revisit after first dogfood (Seta International internal use)

- Sub-tenant grouping beyond flat groups (§2.3 v1.x candidate — tags on groups for navigation). Decision should be informed by actual dogfood pain.
- Notification trigger set (currently @mention / assignment / due-date-24h). Likely to expand based on what users actually want notified about.
- Default per-tenant attachment quota (currently 5 GB). May need adjustment.
- The "translation log per binding" UX (§6.6). Verify admins actually use it; if not, simplify.
- Scale targets (1k users/tenant, 100 tenants/instance, 100k tasks/tenant). Verify against actual dogfood load profile.
- **Default workload-score threshold and weight ladder** (§3.9.3). Both live in tenant config in v1, not in spec. Architecture phase ships a default ladder; revisit after dogfood — if everyone scores in a narrow band, the spreads are wrong.
- **History-inference cost vs. precision** (§3.9.1). Recall comes from history inference; if it produces noisy candidates (matches against shallow task involvement), tune the recency window or raise the embedding-similarity threshold. Validate against dogfood — declared skills should usually outrank history when both signals exist.
- **`skill_tags` adoption rate** (§5.1, §5.3). The agent does not require `skill_tags` to function, but if creators do start tagging, ranking benefits. Track adoption; if it's near-zero, drop the `new-task-skill-tag-suggester` workflow to remove an idle HITL surface.

### 12.3 Resolved-but-flagged (research-flagged trade-offs the team accepted)

Captured here so the rationale is recallable. None of these are open — they're choices with known costs.

- **Email-as-primary identifier** (§3.3a). Accepted the email-mutation, casing-collision, and reuse risks; mitigated via email-rename admin tool, lowercase normalization, and policy.
- **No MFA in core** (§3.7). Accepted; defensible only because production deployments are expected to put MFA upstream (Entra or reverse-proxy SSO). Tenant-level "disable local password when Entra connected" toggle is the safety valve.
- **Soft-delete forever in trash** (§5.3). Accepted; safety valve is the explicit DSR-erasure path that bypasses trash for legal obligations.
- **No tenant branding in v1** (§9.1). Accepted; v1.x candidate. Frequently-requested in B2B, will surface in early adopter feedback.
- **Operator-decided audit retention** (§8.1). Accepted; means SOC 2 readiness depends on operator following the deployment guide.
- **Free-form leaf skills + embedding-based matching, no proficiency level** (§3.9.1). Accepted that v1 ranks junior-`terraform` and principal-`terraform` identically; mitigated partially by history inference (a senior with many recent `terraform` tasks outranks a junior with one). Proficiency levels are a v1.x candidate if dogfood demands them.
- **Multi-factor workload model derived from existing task fields** (§3.9.3). Accepted that v1's "busy" signal is bounded by what the task model already carries (priority, due, progress) — it does *not* see calendar load, real-time presence, effort estimates, or velocity. Documented in §3.9.4 so reviewers don't assume those signals are in play.
- **Display-only staffing recommendation** (§7.2). The agent composes the recommendation; the user assigns by hand. Accepted as the safe default; one-click assign is v1.x (§11.8).
- **Agent composes the recommendation; no `recommend_reviewers` macro tool** (§7.2, §16.5). Accepted that v1 documents a composition recipe over atomic primitives rather than a single ranking tool. Aligns with Mastra's agent-vs-workflow guidance and the user-instruction principle "each tool should be small enough that the agent can reuse and decide dynamically, not hardcode flow." Tradeoff: the LLM does the orchestration each turn (one extra reasoning step) vs. a deterministic macro. Acceptable for v1 latency budgets (§10.2) given the per-session Agent + prompt-cache architecture (§A8).

---

## 13. Definition of done for "requirements clear"

Original gates and current state:

1. ~~Every ❓ in §12 has a chosen position.~~ **Done.** All six §12.1 residuals resolved 2026-05-19 in their home sections; §12.2 items wait on real-world feedback by design.
2. ~~Seeded role list (§4.4) confirmed or refined.~~ **Done.** Four-app split confirmed; `agents.*` renamed to `copilot.*`.
3. ~~Planner v1 feature surface (§5.2) locked.~~ **Done.** Comments yes (+ mentions + in-app), attachments yes (URL + S3 + quota), real-time = SSE, search = Postgres FTS. Recurring/dependencies/templates deferred per §11.3.
4. ~~Sync coverage matrix (§6.5) locked, including capability-gap behavior.~~ **Done.** Planner basic only; M365 Group container required; bind-time import prompt; warn-and-confirm on capability gaps; comments out of v1 sync (gated on Microsoft).
5. ~~Compliance/availability/residency posture (§10) directionally chosen.~~ **Done.** GDPR-ready at launch; SOC 2 deferred to first enterprise deal; single-region per instance; operator-owned SLA/RPO/RTO.

**Additional gate added during brainstorming:**

6. ~~Deferred capabilities have architectural hooks documented in §11.~~ **Done.** Each deferred capability lists its v1 hook so v1 design doesn't foreclose it.

7. ~~Flagship copilot use case defined with concrete data-model implications.~~ **Done (2026-05-19 scope expansion; refined 2026-05-19 per D15).** Staffing-recommendation use case captured in the §1 callout; data-model implications in §3.9 (user skill profile, availability) and §5.1 (optional `skill_tags` on tasks); copilot capability in §7.2 (atomic primitives + §7.2.2 composition recipe, display-only flow); deferred refinements in §11.8.

### Status

**Requirements are clear enough to start architecture.** The §12.1 residuals are inline-decidable; §12.2 items are dogfood-informed by design. The architectural-principles list at the end of §11 (function-call permission checks, strategy interfaces for providers, domain events, separated state stores, versioned API, schema headroom, i18n keys) should be load-bearing inputs to the architecture phase.

**Note on scope expansion.** v1 was originally a Planner-clone + sync + basic copilot. The 2026-05-19 expansion added a user skill/availability profile and a staffing-recommendation copilot use case, on the judgment that the original scope didn't actually demonstrate the "AI-first work management" framing in §1. The expansion is bounded (one new sub-entity on users, one new field on tasks, one new copilot tool); the §11.8 deferred list keeps the scope from creeping further.

### What architecture must produce (v5 inputs)

To translate this requirements doc into an architecture, the next phase should yield at minimum:

- Module decomposition consistent with the §1.6 modular monolith — `core`, `identity`, `planner`, `copilot`, `integrations` as Turborepo packages with strictly-bounded public surfaces (§1.6.4), running in one process in v1.
- **Module boundary enforcement (§1.6.2):** ESLint custom rule rejecting cross-package internal imports, Drizzle schema-scoping config per module, raw-SQL CI grep audit, public-API integration test per module. Build-failing gates from day one.
- **Module public-surface contract (§1.6.4):** for each module, the typed function exports, event types emitted, event subscriptions, route registration, role + permission contributions, copilot tool registrations, and frontend route registrations.
- **Per-module migration orchestration at app boot:** dependency order (`core` first — `core.events` must exist before any module emits, and it now carries audit per D6 — then `identity`, then others). All migrations run in the single process.
- **Shell routing model (§1.6.8):** how the `core` shell composes module-registered SPA route slots, navigation contributions, copilot panel + app launcher; how role-based route gates work.
- **Future-extraction reference architecture (§1.6.12):** documented as the design target — what changes (transport, service-identity JWTs) and what doesn't (schemas, public surfaces, event contracts).
- Data model (Drizzle schemas) reflecting the entity model and the schema-headroom rules from §11.
- Authentication / authorization flow diagrams covering Entra OIDC, local password, JIT provisioning, group-derived grants, account collision, and the permission-check function-call boundary.
- Sync architecture: poll loop, delta-token management, ETag/412 handling, echo suppression, retry/backoff, translation-log persistence.
- Domain-event bus shape (consumed by audit + future workflows / webhooks / SIEM).
- Deployment topology for a baseline AWS reference deployment, including the residency-scope checklist surfaces (§10.3).
- Observability story (traces, metrics, audit) — operator-facing.
- Copilot architecture (Mastra) — concretely:
  - Agent topology: the router agent and v1 specialists (`planner.agent`, `staffing.agent`), prompt outlines, and the turn lifecycle (§7.1b).
  - Tool layer: the wrapping pattern that makes every tool a thin shell over its Hono handler so RBAC and validation are shared, not reimplemented. Confirmation-card flow for destructive tools.
  - **RBAC + performance contract (§7.1e):** session-scoped permission cache (`accessible_group_ids`, `effective_permissions`, `cross_tenant_read`), event-driven invalidation, role-shaped tool registry at session start, SQL-side filtering, async-batched audit, and stable cache-friendly system-prompt role block. Architecture must show how these are wired end-to-end (login → session boot → tool list → first turn).
  - Concrete shape of the §7.2.2 staffing-recommendation composition (Phase B) — the cross-module primitives (`match_users_to_topic`, `infer_user_skills_from_history`, `get_user_availability`, `compute_workload`, `get_leave_overlap`), group-scoped default + role-gated cross-group expansion semantics, embedding-based skill matching, MCP timesheet leave overlay. Per D15 no macro `recommend_reviewers` tool — the recipe is the contract.
  - Chat memory: thread schema, working-memory summarization strategy, GDPR-erasure path (§7.4, §10.1).
  - Streaming transport: SSE multiplexing with §5.2 board events.
  - `Retriever` function interface (§7.1c) — the v1 hook that keeps tool code stable when a vector store lands later.
  - **MCP integration architecture (§7.1d):** Timesheet MCP client wiring inside Mastra, per-tenant endpoint+credential config, encryption-at-rest path, 500ms timeout with graceful degradation, audit attribution model, generic MCP-consumer pattern that v1.x integrations (calendar / HRIS / presence) will reuse.
  - System-internal workflows (§7.1f): for each of the nine v1 workflows, the concrete step graph, idempotency-key choice, retry policy, durable-state schema, and the trace-span model. Plus the runtime story — single process? worker pool? per-tenant isolation?
  - Chatflow turn lifecycle (§7.1b): the actual session-boot sequence, Mastra Agent instantiation per session, working-memory summarization trigger and shape, and how the SSE stream multiplexes chat tokens, tool-call status, and confirmation cards on the same channel established for board updates (§5.2).

If any of those run into a requirement gap, that's the signal to come back here and resolve it before going deeper.

---

## 14. Implementation phases — agent module first

Three sequenced phases. Phase A is **the standalone Copilot module end-to-end**, with `identity` and `planner` ready as backend schemas + public APIs + Mastra tools — UI deferred to Phase B. The agent *is* the UI in Phase A. Each phase is shippable; later phases extend, never refactor across module boundaries.

### 14.1 Phase A — Agent module end-to-end (the flagship demo, standalone Copilot app)

**Strategic framing.** Phase A proves the AI-first thesis (§1) with the agent as the only product surface. The user converses with the Supervisor or `planner.agent`; the Supervisor delegates; tools execute against the full planner schema. Planner Kanban UI, tenant admin UI, MS Planner sync, cross-domain `staffing.agent`, Timesheet MCP integration — all Phase B+. Backend APIs for everything Phase A's agent needs *are* in scope: schema, public functions, Mastra tools, RBAC, embeddings + CDC freshness pipeline (§7.1c).

**Scope compression vs earlier draft (2026-05-19 architect review, refined 2026-05-19 per D15):** `staffing.agent` + cross-module staffing primitives (`match_users_to_topic`, `infer_user_skills_from_history`, `get_user_availability`, `compute_workload`, `get_leave_overlap`) + Timesheet MCP client + leave-overlay narrative are deferred to Phase B. Per D15 there is no `recommend_reviewers` macro tool — the staffing flow is the §7.2.2 composition recipe, which lights up in Phase B once the cross-module primitives ship. Phase A's flagship demo runs the "find tasks needing review" half of the recipe end-to-end (composition over `planner.agent`'s tools). Superadmin tenants UI is deferred — Phase A creates tenants via the `apps/cli` `tenant-create` command only. Result: ~4–5 weeks compression; 4–5-engineer budget for Phase A becomes ~7–10 months.

**Journey under test.**

1. User logs in with local username/password.
2. Lands in the **standalone Copilot module** (the only app visible in the launcher).
3. Sets profile: skills (`terraform`, `kubernetes`), availability, working hours, tz.
4. Picks the **Supervisor** agent (default), or — if `copilot.contributor+` — picks `planner.agent` directly from the agent selector. (`staffing.agent` is Phase B.)
5. *"Find tasks needing review on terraform."* → Supervisor delegates to `planner.agent` → LLM composes the §7.2.2 recipe: `list_my_accessible_groups()` + parallel `search_tasks_semantic({ query: 'terraform review needed' })` and `list_tasks({ review_state: 'needs_review' })` (the latter often empty, that's expected) → LLM filter pass over candidates judging "needs review?" and "about terraform?" from title + description → merged ranked cards stream back.
6. *"Assign Alice to this task."* → Supervisor delegates to `planner.agent` → `assign_task` tool → **HITL confirmation card** → user confirms → assignment created → audit-event emitted → done.
7. (Power-user) Switches to the **Workflows tab** in the standalone Copilot module → sees recent runs of `embeddings-keep-fresh` and `new-task-skill-tag-suggester`.

**In scope.**

| Module | Backend (schema + public API + Mastra tools) | UI |
|---|---|---|
| `core` | Event bus (outbox + `LISTEN/NOTIFY` per §1.6.5a), audit log, session middleware, app launcher, shell, route/role/tool/subscriber registries | Shell + app launcher (Copilot the only visible app) |
| `identity` | Schema for user, `user_profile` (skills, availability, working_hours, tz), `role_grants`, sessions via better-auth (local password, argon2id) + `user_skill_embeddings` table maintained by CDC subscriber | **Login**, password reset (functional), email verification, user profile / settings page |
| `planner` | Full schema: groups, plans, buckets, tasks (incl. `skill_tags` + `review_state`), assignments, checklist items, labels + `task_chunks` / `task_embeddings` / `plan_embeddings` maintained by CDC subscribers. Public API for read + write. Mastra tools per §7.2 (decomposed primitives), all writes HITL-gated. | **No planner UI in Phase A.** Kanban, task detail, board views = Phase B. |
| `copilot` | **Supervisor agent** + `planner.agent` (specialist). Thread persistence in `copilot.*`. Mastra workflows: `session-cache-invalidate`, **`embeddings-keep-fresh`** (CDC pipeline per §7.1c), `new-task-skill-tag-suggester`. (Cross-module `staffing.agent` deferred to Phase B; `recommend_reviewers` does not exist as a tool — flagship staffing flow is the §7.2.2 composition recipe, which lights up once `planner.agent` can call `match_users_to_topic` + workload/availability primitives — Phase B alongside the Kanban UI.) | **Standalone Copilot module:** sidebar with thread history, agent selector (Supervisor + `planner.agent`; `planner.agent` gated to `copilot.contributor+`), chat main pane with streaming + tool-call cards + HITL confirmation cards, Workflows tab (collapsed with §7.3 agent-ops, role-shaped). **Embedded panel deferred** — no domain portal exists yet. |
| `integrations` | Schema + connection record stub for future MCP/Planner bindings (no live integrations in Phase A) | (none in Phase A) |

**Admin UIs to make Phase A self-sufficient (bare-bones):**

- Tenant admin → users list + invite + role-grant. No audit-log browser, no IdP mapping UI.
- Superadmin tenants UI **deferred to Phase B.** Phase A creates / suspends / deletes tenants via `apps/cli tenant-create|suspend|delete` only.

**Workflows running in Phase A (3 total):**

- `session-cache-invalidate` — event-triggered on role / membership change (§7.1f).
- `embeddings-keep-fresh` — CDC pipeline per §7.1c; subscribers re-chunk + re-embed on entity write.
- `new-task-skill-tag-suggester` — event-triggered on `planner.task.created` when `skill_tags` is empty. Thin glue layer: calls the `infer_task_topics` primitive (§7.2.1) and posts a HITL card in the creator's chat. The same `infer_task_topics` primitive is what the agent uses when reasoning about an untagged task; the subscriber and the agent share one inference path.

**Workflows considered and deferred (architect review 2026-05-19, refined per D15):**
- `workload-cache-refresh` — compute live via the `compute_workload` primitive; only introduce a cache if measured latency demands it. Phase B at earliest.
- `audit-flush` — subsumed by D6 audit-collapse: audit writes land inline with event emissions, no batch drain needed.
- `leave-overlap-warning` — depends on Timesheet MCP wiring + cross-module agent surface; Phase B.
- `stale-review-detector` — **dropped per D15.** Only fires for tasks with `review_state = 'needs_review'` explicitly set; since `review_state` is an optional refinement (default null) and adoption will be low, this subscriber is mostly idle. If a tenant wants stale-task surfacing, a v1.x replacement is a generic `stale-task-detector` (any task whose `updated_at` is past N days, regardless of `review_state`) — universal, no dependence on optional fields.

All `planner-sync-*`, `capability-gap-translation`, `mcp-timesheet-leave-warm`, `trash-purge` are Phase B. See §14.4 for additional chatflow-extending workflows planned beyond Phase A.

**Data bootstrap.** Without a planner UI, the first task in a new tenant comes from:
- **CLI seed script** (`pnpm seed`) — demo tenant with groups/plans/tasks for sales demos. A subset of seeded tasks carries `skill_tags` / `review_state` so reviewers can see the optional-refinement path; most are deliberately untagged so the agent's primary inference path (semantic + LLM filter over title+description, §7.2.2) is what gets demoed.
- **Agent-driven bootstrap** for real tenants — user asks Supervisor *"create a group called Engineering, a plan called Backlog, and add three tasks tagged terraform"* → HITL cards → done. This is the proof that "agent is the UI" works.

**Phase A screens (~7):** Login; password reset; email verification; user profile/settings; Standalone Copilot — Chat tab; Standalone Copilot — Workflows tab; Workflow run drill-down; Tenant admin → users (bare-bones). Plus empty-state + error pages. (Superadmin tenants UI and Integrations → Timesheet MCP config moved to Phase B with the cuts above.)

**Phase A acceptance gates.**

*Architecture / correctness:*
- Module boundary tooling green (dependency-cruiser CI gate, raw-SQL grep audit, public-API integration tests, Drizzle schema scoping) per §1.6.2.
- Outbox + `LISTEN/NOTIFY` dispatcher delivers events to ≥1 cross-module subscriber under load test (10k events/min).
- RBAC contract round-tripped: copilot tool registry per-session is role-shaped (§7.1e); a `planner.contributor` calling `assign_task` succeeds only within their accessible groups; `planner.viewer` returns "tool not registered."
- Agent selector RBAC gate enforced (`copilot.contributor+` for `planner.agent`).
- HITL confirmation cards verified for every write tool — handler runs only after user confirms.
- AI cost cap configurable per tenant; hard-stop verified.
- **Embeddings freshness:** search index lags primary by ≤ 60s under normal write load.
- Seed script + agent-driven bootstrap both produce a working flagship demo from a fresh tenant.
- **Tenant deletion cascade** (per §2.6) verified: a deleted tenant leaves no rows in any module schema, no Mastra durable state, no embeddings, and per-row pseudonymized actor in `core.events`. Implementation gate, not just a doc gate.

*Correctness tests (D12, 2026-05-19 architect review):*
- **Trace + actor presence test.** Integration test asserts every event emitted during a representative scenario carries `trace_id` and `actor` populated (post-D6 audit-collapse).
- **Suspend/resume outbox test.** Integration test on a suspend/resume Mastra workflow verifies subscriber visibility at each commit boundary — no subscriber assumes pre- and post-suspend events arrive together.
- **Mastra schema-leak boot assertion.** Boot fails if any `mastra_*` table exists outside `copilot.*` schema.

*Load tests (D11b, 2026-05-19 architect review):*
- **Agent turn latency p95 under cold cache** ≤ 5s on a representative `list_tasks` + `search_tasks_semantic` composition, with a freshly-built per-session Agent and a cold provider prompt cache. Baseline; revise after measurement.
- **HNSW vector search p95** ≤ 200ms at 1.5M vectors single-tenant (synthetic data) under 5 concurrent queries — the partitioning trigger condition for §A10.
- **graphile-worker burst** — 1k jobs enqueued in 10s drain with queue-depth p95 ≤ 100 and processing latency p95 ≤ 30s.

### 14.2 Phase B — Planner UI + sync + collaboration

- **Planner Kanban UI** + task detail editor + groups/plans list UIs.
- **Embedded copilot panel** in the planner portal (shares threads with the standalone Copilot module).
- MS Planner sync end-to-end (§6) — delta poll, ETag PATCH, conflict log, translation log, `capability-gap-translation` HITL workflow.
- Entra OIDC + JIT provisioning + IdP group → role mapping UI.
- Comments + @mentions + in-app notification feed (§5.2, §5.4) + `comment_embeddings` joined to retrieval (§7.1c).
- Attachments (URL refs + S3 upload + ClamAV scan + per-tenant quota).
- Real-time SSE on Kanban board (§5.2).
- Bulk operations (§5.3) — copilot `bulk_*` tools with HITL confirmation.
- Trash UI + restore.
- Full Postgres FTS surface for keyword paths.
- Tenant admin: audit-log browser + IdP mapping + integration health expansion.
- HIBP check for local-password registration (§3.8).

### 14.3 Phase C — Polish + compliance

- DSR tooling (export + erasure) end-to-end across primary data, audit (pseudonymize-in-place), S3, chat history, embeddings (§10.1).
- Audit-log export (JSON/CSV).
- Concept-map editor for skills (§3.9.1) — embeddings already cover most synonym cases by then.
- Account collision admin tool (§3.3b).
- Per-tenant rate-limit dashboard + cost view.
- Tenant attachment-quota settings UI.
- MFA in `identity` (TOTP).
- Reference Terraform / CDK for ECS Fargate deploy.
- WCAG 2.1 AA audit (§10.6) — **Phase C gate**.
- Per-tenant "company knowledge" RAG (§7.1a + §7.1c) tied to custom prompt layering.

### 14.4 Additional chatflow-extending workflows (Phase B+/C)

Continuing the pattern from Phase A's chatflow-relevant workflows — workflows whose primary value is turning passive data into proactive chat-panel surfaces. Aligned with the AI-first design lens (§7.0a): every workflow that surfaces insight should do so through the agent, not through a sidebar widget.

| Workflow | Phase | Trigger | What it does |
|---|---|---|---|
| `reviewer-pool-warm` | B | Cron every 15min | Pre-computes the §7.2.2 staffing recipe's candidate output for tasks with `review_state = 'needs_review'` and a sample of tasks whose title/description suggest a review intent → caches in `copilot.recommendation_cache`. Makes the recipe feel instant in chat; foundation for "always-suggesting" UX |
| `review-cycle-summary` | B | Cron weekly | Aggregates per-user (tasks reviewed / tasks pending / avg time-to-review) → posts a weekly digest to the user's chat thread |
| `sync-conflict-coach` | B | Event `integrations.conflict.recorded` | When a sync conflict lands, summarizes the field-level diff via LLM step and posts to the binding-owner's chat with quick-actions (accept Seta / accept Planner / manual edit). Makes the §6.3 conflict log conversational |
| `bulk-edit-summarizer` | B | Event `planner.task.bulk.completed` | When a bulk edit affects >20 tasks, posts a chat-thread summary ("Reassigned 47 tasks from Bob to Carol; 3 had review_state=needs_review — review them here") with deep-links |
| `onboarding-skill-prompt` | C | Event `identity.user.created` | Waits 1h (Mastra suspend/resume), then DMs the new user via copilot: *"Welcome — what are your skills?"* HITL-gated; closes when user fills profile or after 7d. Showcases durable suspend/resume |
| `embedding-quality-canary` | C | Cron monthly | Samples N tasks, runs the §7.2.2 staffing recipe (`infer_task_topics` → `match_users_to_topic`), compares against actual reviewer assignments. Surfaces embedding-drift signals to admins |

These are illustrative, not committed scope. Phase B priorities should reflect actual dogfood pain.

---

## 15. Module scope contracts

For each module: what it **owns** (data + lifecycle), what its **public surface** exposes, what it **explicitly does not do** (anti-scope — the boundary), and what it **depends on**. This is the design contract; any deviation is a doc bug, not license to drift.

### 15.1 `core` (platform)

- **Owns:** tenant lifecycle (create / suspend / delete + §2.6 cascade), unified event+audit log (`core.events` outbox + dispatcher; `core.audit_v` read-view per D6), role registry, route registry, copilot tool registry, frontend route registry, session-validation middleware, JWT signing key, cookie config.
- **Public surface:** `emit(event)`, `registerRoutes()`, `registerRoles()`, `registerCopilotTools()`, `registerFrontendRoutes()`, `registerSubscribers()`, `auditQuery()`, `createTenant()`, `suspendTenant()`, `deleteTenant()`, session middleware (Hono).
- **Does NOT do:** authentication strategies (`identity` owns), business domain logic, per-module schema management beyond `core.*` tables.
- **Depends on:** Postgres only.
- **Backed by §:** 2, 8, 9, 1.6.5a, 1.6.11.

### 15.2 `identity`

- **Owns:** users, `user_profile` (§3.9 skills, availability_status, working_hours, timezone), `role_grants`, sessions, refresh-token denylist, auth providers (local password; Entra OIDC + future SAML in Phase B+), password hashing (argon2id via better-auth), HIBP check (Phase B), MFA (Phase C), `user_skill_embeddings`.
- **Public surface:** `createUser()`, `getUserById()`, `getUserByEmail()`, `listUsers()`, `updateUserProfile()`, `grantRole()`, `revokeRole()`, `listRoleGrants()`, skill / availability / working-hours setters, `findUsersBySkill(criteria)`, plus better-auth API mounted at `/auth/*`.
- **Emits events:** `identity.user.created`, `identity.user.deactivated`, `identity.user.profile.updated`, `identity.role_grant.changed`, `identity.user.session_invalidated`.
- **Does NOT do:** tenant CRUD (core), business domain logic, request-level RBAC enforcement (core middleware reads role_grants).
- **Depends on:** `core`, better-auth, Postgres.
- **Backed by §:** 3, 4.

### 15.3 `planner`

- **Owns:** groups, plans, buckets, tasks (incl. `skill_tags`, `review_state`, assignees, dates, priority, progress, labels, checklist items), per-plan labels, soft-delete trash, attachments metadata (Phase B), comments (Phase B), `task_chunks` / `task_embeddings` / `plan_embeddings` (+ Phase B `comment_embeddings`).
- **Public surface:** `createGroup()`, `listGroups()`, `addGroupMember()`, `createPlan()`, `listPlans()`, `createBucket()`, `reorderBuckets()`, `createTask()`, `updateTask()`, `assignTask()`, `unassignTask()`, `setReviewState()` (optional-refinement write), `addSkillTag()` / `removeSkillTag()` (optional-refinement write), `findTasks(criteria)`, `searchTasksSemantic(query, criteria)`, `inferTaskTopics(input)`, `getTask(id)`. Mastra tools wrap these 1:1 with HITL on writes.
- **Emits events:** `planner.task.{created,updated,assigned,review_state.changed,deleted}`, `planner.plan.created`, `planner.bucket.reordered`, etc.
- **Subscribes to:** `identity.user.deactivated` (reassign / unassign cleanup), `identity.user.profile.updated` (refresh own assignee projection).
- **Does NOT do:** auth (identity), MS Planner sync (integrations), copilot orchestration (copilot — planner only contributes tools), agent-level RBAC (copilot enforces via tool registry per §7.1e).
- **Depends on:** `core`, `identity` (via events only — no direct read), Postgres.
- **Backed by §:** 5.

### 15.4 `copilot`

- **Owns:** Mastra Supervisor + cross-module specialist agents (Supervisor `router`, `staffing.agent`), tool registry (composed from all modules' contributions), chat threads + messages (per user, GDPR-erasable per §7.4), workflow definitions + runs (§7.1f), copilot rate-limit counters (per tenant per §7.4), per-session permission scope cache (§7.1e), `tenant_knowledge_chunks` + `tenant_knowledge_embeddings` (Phase C — per-tenant RAG corpus).
- **Public surface:** `chatRoute()`, `workflowRoute()`, `runWorkflow(name, input)`, `listThreads(userId)`, `deleteThread(threadId)`, `getRunStatus(runId)`.
- **Emits events:** `copilot.thread.created`, `copilot.tool.invoked`, `copilot.workflow.completed`, `copilot.workflow.failed`, `copilot.rate_limit.hit`.
- **Subscribes to:** `identity.role_grant.changed` (invalidate session scope cache), `identity.user.deactivated` (close threads + drop cache), domain events from every module (workflow triggers).
- **Does NOT do:** business-domain logic — tools are *thin wrappers* over each module's public surface, no duplicated logic. Owns no domain entities. Authentication = identity. Persistence outside `copilot.*` schema = forbidden.
- **Depends on:** `core`, every module's public surface (to wrap as tools), Mastra, AI SDK, MCP SDK, Postgres + pgvector.
- **Backed by §:** 7.

### 15.5 `integrations`

- **Owns:** external connection records (MS Planner OAuth, Timesheet MCP), per-binding state (last delta token, ETag echo digest, `last_pushed_field_values`), conflict log, translation log, sync workflow runs (Phase B), MCP client configurations.
- **Public surface:** `configureMCPClient()`, `getLeaveOverlay(userEmails, dateRange)`, `createBinding()` (Phase B), `getBindingHealth()` (Phase B).
- **Emits events:** `integrations.mcp.timesheet.invoked`; Phase B adds `integrations.binding.created`, `integrations.sync.completed`, `integrations.conflict.recorded`, `integrations.translation.recorded`, `integrations.binding.degraded`.
- **Subscribes to:** Phase B — `planner.task.*`, `planner.plan.*`, `planner.bucket.*` (outbound sync push triggers).
- **Does NOT do:** own planner entities (planner does), tenancy decisions (core), route-level RBAC (middleware does).
- **Depends on:** `core`, `@seta/planner` (Phase B), Mastra Workflows, MCP SDK, Microsoft Graph SDK (Phase B).
- **Backed by §:** 6, 7.1d.

### 15.6 Shared packages (`packages/shared/*`)

Cross-cutting infrastructure lives in dedicated packages, not buried in `core`. Each is importable from every module + every app. Each has its own public surface at `packages/shared/<name>/src/index.ts` plus a dep-cruiser rule.

- **`shared/ui`** — design tokens, primitive components (shadcn copy-in), Linear-flavored composites, theme provider, icons. Does NOT own business components (those live in `apps/web/src/modules/<m>/components/`).
- **`shared/types`** — cross-package zod schemas, event-payload base types, shared utility types. Does NOT own module-specific types (those live in each module's `src/index.ts`).
- **`shared/config`** — ESLint preset, tsconfig base, Tailwind preset, dependency-cruiser preset, Prettier config. Pure configuration; no runtime code.
- **`shared/mailer`** (D13, 2026-05-19) — typed `sendEmail({ template, to, props })` API + react-email templates folder + swappable transport (SES default; Resend, SMTP, dev-stub all behind one interface). Used by `identity` (verify email, password reset), Phase B `planner` (@mentions), `core` (tenant lifecycle notifications). Operators swap transport via env config. Does NOT own message rendering inside modules — modules import templates from here.
- **`shared/observability`** (D13) — OpenTelemetry SDK setup, pino logger config, metrics helpers, attribute-naming conventions (`tenant.id`, `tool.key`, `module.key`, `aggregate.type`). Used by `apps/server`, `apps/cli`, future `apps/worker`. Centralizes dashboard contract — dashboards don't drift when a module names attributes its own way.
- **`shared/crypto`** (D13) — Secrets Manager reader, KMS-backed envelope encryption helpers (used for `integrations.connection_credentials` encryption at rest), JWT key rotation primitives (loads `JWT_SIGNING_KID` + `JWT_VERIFYING_KIDS`, supports the two-key window per §K.5), HIBP k-anonymity client (Phase B per §3.8). All security-sensitive primitives in one auditable package.
- **`shared/storage`** (D13, Phase B impl) — S3 client wrapper, presigned-URL generation for attachment upload/download, ClamAV invocation, per-tenant key namespacing. Seam declared now so Phase A's `integrations` module's MCP creds can persist in the same S3 bucket pattern if needed; full attachment storage path lights up in Phase B.
- **`shared/db`** (D14, 2026-05-19) — `pg.Pool` factory (the three workload-class pools per D10/§K.2: `webPool`, `workerPool`, `mastraStatePool`), drizzle client builder, transaction primitives, retry/timeout helpers. Decouples pool construction from `core`'s event bus so `apps/cli` and future workers can open Postgres without importing `core`'s entire surface.
- **`shared/rbac`** (D14) — the `VisibilityGate` predicate type + `passesGate(gate, session)` evaluator, permission-string nominal types, role-registry types. ~50 LOC; lives here so both backend (route guards, tool filtering) and frontend (menu/command visibility) share one implementation.
- **`shared/testing`** (D14, dev-only) — testcontainers Postgres helper with pgvector + migrations pre-applied, fake event bus (in-memory `core.events` stand-in), fake mailer (collects sent messages for assertion), fake embedding provider (deterministic dim vectors), fixture builders (tenant, user, planner data). Each module's `vitest` integration tests import from here.

**Deferred shared packages (architect review 2026-05-19):**
- `shared/i18n` — only `apps/web` consumes today; lives in `apps/web/src/lib/i18n/` until a second app needs it.
- `shared/http-client` — provider SDKs (Mastra, MSAL, AI SDK) already handle retry/timeout; revisit if we start hand-rolling fetch.
- `shared/feature-flags` — out of v1 scope (§11).
- Splitting `shared/ui` into design-tokens + components — too small a surface in v1 to justify the overhead.

**What stays in `core`** (load-bearing — moving these would leak abstractions everywhere):
- Event bus / outbox dispatcher (`core.events` is the schema, the dispatcher is its only client).
- Audit (now part of events per D6).
- Session middleware + JWT signing config (request-path seam).
- Tenant lifecycle + `core.tenants` (domain of `core` per §1.6.1).
- Role/route/tool/subscriber registries.
- Rate limiting (`hono-rate-limiter` wrapper; small enough not to warrant its own package).

### 15.7 Dependency graph (compile-time)

```
                ┌─────────┐
                │  core   │ ← every module depends on core
                └────┬────┘
                     │
       ┌─────────────┼─────────────┐
       │             │             │
  ┌────▼────┐  ┌─────▼─────┐  ┌────▼─────────┐
  │identity │  │  planner  │  │ integrations │
  └────┬────┘  └─────┬─────┘  └──────┬───────┘
       │             │               │
       └─────────────┼───────────────┘
                     │
                ┌────▼────┐
                │ copilot │ ← copilot depends on every peer module's public surface
                └─────────┘   to wrap them as Mastra tools
```

`identity`, `planner`, `integrations` are **peers** — they communicate only via events through `core`. No direct `planner → identity` import; `planner` reads `identity` data via subscribing to events and maintaining its own projection (e.g., `assignee_summary` table inside `planner.*` schema).

`copilot` is the only module that imports every peer's public surface (to wrap as tools). Intentional: copilot is the **integration point** for cross-module agent surface. It does not mutate other modules' state; it calls their public functions, which re-check RBAC.

### 15.8 Anti-scope summary — what NO module does

- No cross-schema reads (§1.6.2 rule 3).
- No cross-schema FKs — `planner.tasks.assignee_id` is a plain `uuid`, not a FK (§1.6.2 rule 5).
- No shared mutable process-memory state — each module's caches live in its own module.
- No duplicated business logic — a Mastra tool that "creates a task" calls `planner.createTask()` (imported from `@seta/planner`), never re-implements.
- No silent error swallowing — every failure surface emits an event (`*.failed`) and an audit row.

---

## 16. Agent / workflow / state ownership — where things live

**The rule:** every business module owns its own agents, workflows, tools, and schema. The `copilot` module owns the runtime that wires them together. Adding `timesheet` or `pmo` later = drop a new package alongside `planner`, never touch existing modules. This is §1.6.3 (`adding a new business module` playbook) applied to the copilot dimension.

### 16.1 Per-business-module shape

Every business module — `planner` today, `timesheet` / `pmo` / `docs` / `okrs` tomorrow — has the same internal layout:

```
packages/<module>/
└── src/
    ├── backend/
    │   ├── routes/                       # Hono HTTP routes
    │   ├── domain/                       # business logic (real implementations)
    │   ├── copilot/
    │   │   ├── tools/                    # Mastra tool defs — thin wrappers over domain/
    │   │   │   ├── create-X.tool.ts
    │   │   │   └── ...
    │   │   ├── agents/                   # specialist agent defs (one per module typically)
    │   │   │   └── <module>.agent.ts
    │   │   └── workflows/                # domain workflows (sync, recompute, scheduled jobs)
    │   │       └── <module>-<thing>.workflow.ts
    │   └── subscribers/                  # event handlers (cross-module reactions + CDC)
    ├── index.ts                          # the public surface — exports register<Module>Contributions(registry)
    ├── events/                           # event-payload types
    └── db/
        └── schema/                       # tables in <module>.* Postgres schema
```

The module's `src/index.ts` exports one registration function:

```typescript
// packages/planner/src/index.ts
export function registerPlannerContributions(reg: ContributionRegistry) {
  reg.routes(plannerHonoRouter);                       // mounts /api/planner/v1/*
  reg.roles([plannerAdminRole, plannerContribRole, plannerViewerRole]);
  reg.copilotTools([listTasksTool, searchTasksSemanticTool, createTaskTool, /* ... */]);
  reg.copilotAgents([plannerAgent]);                   // specialist
  reg.workflows([plannerSyncPollWorkflow /* Phase B */]);
  reg.subscribers([
    { event: 'identity.user.deactivated', handler: cleanupAssignments },
    { event: 'planner.task.created', handler: enqueueEmbedRefresh },
    { event: 'planner.task.updated', handler: enqueueEmbedRefresh },
  ]);
  reg.frontendRoutes([{ path: '/planner/*', component: PlannerApp, gate: 'planner.viewer' }]);
}
```

`apps/server` at boot:

```typescript
const registry = createContributionRegistry();
registerCoreContributions(registry);
registerIdentityContributions(registry);
registerPlannerContributions(registry);
registerIntegrationsContributions(registry);
registerCopilotContributions(registry);          // copilot runs last — needs peers' contributions
await runMigrationsInDepOrder(registry);
await startBus(); await startWorkers(); await startServer();
```

### 16.2 `copilot` owns the runtime, not the domain agents

- **Mastra runtime + Supervisor (router) agent** lives in `copilot`. Supervisor's delegation targets are the specialist agents *collected from business modules* at boot — Supervisor knows nothing about the domain.
- **Cross-module agents** (no single business module owns them) live in `copilot`. `staffing.agent` reads from `identity` (skills, availability) + `planner` (assignment data) + `integrations` (Timesheet MCP) — too broad for one module.

  **Rule of thumb:** single-domain agents live in the owning module; cross-domain agents live in `copilot`.

- **Chat threads + messages** in `copilot.threads`, `copilot.messages` — cross-module per-user conversation; GDPR-erasable per §7.4.
- **Workflow runtime + run state** in `copilot.workflow_runs`, `copilot.workflow_run_state` (Mastra durable state). Centralized so the Workflows tab queries all runs in one place.
- **Per-tenant AI rate-limit counters** in `copilot.rate_limits`.

### 16.3 `core` owns platform-level workflows + bus

- **Platform workflows:** `session-cache-invalidate` — not domain-specific. (`audit-flush` removed per D6; audit writes inline.)
- **`core.events`** outbox + dispatcher (§1.6.5a). Audit lives here too per D6 — read via `core.audit_v` view.

### 16.4 Persistence map

| State | Postgres schema | Owner |
|---|---|---|
| Tasks, plans, buckets, assignments, skill_tags, review_state | `planner.*` | planner |
| Task chunks + embeddings, plan embeddings | `planner.task_chunks`, `planner.task_embeddings`, `planner.plan_embeddings` | planner |
| Users, user_profile (skills, availability, working_hours, tz), role_grants | `identity.*` | identity |
| User skill embeddings | `identity.user_skill_embeddings` | identity |
| External connections, bindings, conflict log, translation log, MCP configs | `integrations.*` | integrations |
| Chat threads + messages | `copilot.threads`, `copilot.messages` | copilot |
| Workflow runs + durable state | `copilot.workflow_runs`, `copilot.workflow_run_state` | copilot |
| Tenant knowledge chunks + embeddings (Phase C) | `copilot.tenant_knowledge_chunks`, `copilot.tenant_knowledge_embeddings` | copilot |
| Per-tenant AI rate-limit counters | `copilot.rate_limits` | copilot |
| Domain events (outbox + audit, per D6 collapse) | `core.events` | core |
| Tenants, instance config | `core.tenants`, `core.instance_config` | core |
| Session permission scope cache (durable layer) | `core.session_scope_cache` | core (in-memory + DB hybrid per §7.1e) |

Future business modules (`timesheet`, `pmo`, `docs`, `okrs`, …) own their own schemas the same way `planner` does. The §1.6.3 playbook applies; details are deliberately not pre-baked here.

### 16.5 Tool design principle — small composable tools, LLM orchestrates

Tools are atomic operations. Flows emerge from LLM composition over tools, not from baking flows into tools. Hardcoding `find_tasks_needing_review` as one monolithic tool would force tool sprawl for every variation and remove the LLM's ability to recompose primitives. Instead: expose small building blocks (`list_my_accessible_groups`, `list_tasks`, `search_tasks_semantic`, `get_task`, `infer_task_topics`, `match_users_to_topic`, `infer_user_skills_from_history`, `compute_workload`, `get_user_availability`, `get_leave_overlap`) and let the agent compose them per intent (§7.2.2 has the canonical examples).

**Tools vs. workflows — Mastra's framing.** Mastra explicitly distinguishes the two ([agents-vs-workflows](https://mastra.ai/docs/learn/agents-vs-workflows)): *"use agents for flexible, adaptive reasoning and workflows for defined, controlled processes."* In Seta v1: agent-facing **tools** must be atomic primitives the LLM picks dynamically; deterministic multi-step processes go in **Mastra Workflows** (§7.1f), where the steps, order, and "done" criteria are explicit and code-driven. A flow that always runs the same way — embeddings CDC, sync poll, cron-triggered cleanup — is a workflow, not a tool. A flow whose shape varies per user intent — "find tasks needing review", "recommend reviewers" — is a composition recipe over tools, not a workflow disguised as a tool.

**No tool-monolithic carve-outs.** Earlier drafts allowed monolithic tools "when the operation is a single deterministic algorithm with no LLM decision points inside" (e.g., the original `recommend_reviewers`). That carve-out is removed: the user-stated principle is that each tool must be small enough for the agent to reuse and decide dynamically rather than locking the flow inside the tool. ADR D15 records the reversal. Deterministic algorithms that don't need LLM mid-step decisions still belong in workflows when triggered by schedule/event, or in composition recipes when triggered by chat.

### 16.6 Tool vs Workflow — refined boundary

| | Tool (chatflow primitive) | Workflow (code primitive) |
|---|---|---|
| Driven by | LLM, per turn | Code-defined step graph |
| Trigger | Agent's tool-call within a chat turn | Schedule, event, direct call |
| Shape | Single atomic op | Multi-step with branching, retries, durable state across hours/days |
| User-driven? | Yes (via chat) | No (system-internal in v1) |
| Examples | `list_tasks`, `search_tasks_semantic`, `match_users_to_topic` (Phase B), `create_task` (HITL) | `planner-sync-poll` (Phase B), `capability-gap-translation` (HITL gate, Phase B), `embeddings-keep-fresh`, `new-task-skill-tag-suggester` |

User queries are never workflows. Workflows are for code-driven deterministic pipelines (sync, batch jobs, CDC) and HITL gates that pause across hours/days.

### 16.7 What this enables (and forbids)

- **Adding a new business module** = new package, new schema, new tools, new agent (if domain-specific), new subscribers. Register at boot. **Zero changes to existing modules.** Cross-module data flows via events + local projections.
- **Forbidden:** business logic in another module's package; cross-schema reads; `copilot/tools/` containing single-domain tools (those live in the owning module).

---

## 17. OSS stack — what we adopt vs what we build

### 17.1 Runtime

**Node.js 24 LTS** (codename Krypton; LTS until April 2028). npm 11, stable permission model, native `.env`, V8 13.6, stable built-in TypeScript type stripping. Lock via `.nvmrc` + `engines.node: ">=24.0.0 <25.0.0"` in every `package.json`.

### 17.2 Pinned versions (verified 2026-05-19 via npm + official docs)

| Package | Version | Status | Notes |
|---|---|---|---|
| `@mastra/core` | **1.35.0** | ✅ stable | v1.x; weekly cadence; Supervisor Agent topology |
| `@mastra/ai-sdk` | track `@mastra/core` | ✅ stable | UI transport adapter for assistant-ui (§18) |
| `@mastra/mcp` | track `@mastra/core` | ✅ stable | MCP client wrapper over `@modelcontextprotocol/sdk` |
| `better-auth` | **1.6.11** | ✅ stable | DB adapters extracted in 1.5+ — install `better-auth` + Drizzle adapter pkg separately |
| `@assistant-ui/react` | **0.14.5** | ⚠ pre-1.0 | Three migrations in v0.11–v0.14 — pin minor; review upgrades on Renovate cadence |
| `@assistant-ui/react-ai-sdk` | match core | ⚠ pre-1.0 | Pairs with `ai@^6` + `@ai-sdk/react@^3` |
| `ai` (Vercel AI SDK) | **v6** | ✅ stable | Mastra defaults to v5; opt into v6 via `version: 'v6'` |
| `hono` | **4.12.16** | ✅ stable | Native `streamSSE` helper; mature middleware ecosystem |
| `@hono/zod-openapi` | latest | ✅ stable | OpenAPI 3.1 spec generation — table stakes for OSS public API |
| `drizzle-orm` + `drizzle-kit` | **0.44.x** | ✅ stable (1.0-beta.2 available) | Lock 0.44.x for prod; track 1.0 beta. Multi-schema via `pgSchema` + `schemaFilter` glob |
| `pgvector` | latest | ✅ stable | Postgres extension; HNSW indexes for §7.1c |
| `@node-rs/argon2` | latest | ✅ stable | Used by better-auth for argon2id |
| `graphile-worker` | **0.16.6** | ⚠ slower cadence | Production-ready 0.x; cron + retry + LISTEN/NOTIFY wakeup. ~1.5y since last release — verify maintenance before locking; fallback = `pg-boss` |
| `@dnd-kit/core` + `@dnd-kit/sortable` | **6.3.1** | ⚠ ~1y since release | Accessibility (ARIA + keyboard) built-in. No credible alternative if it stalls |
| `@tanstack/react-query` | **5.100.10** | ✅ stable | Weekly cadence |
| `@tanstack/react-router` | **1.170.4** | ✅ stable | Active May 2026 |
| `@tanstack/react-table` | latest 8.x | ✅ stable | Headless; pairs with shadcn |
| `cmdk` | latest | ✅ stable | Cmd+K palette |
| `tinykeys` | latest | ✅ stable | Global keyboard shortcuts |
| `motion` (was `framer-motion`) | latest | ✅ stable | Sheet/Dialog transitions |
| `zod` | v3 latest (track v4 GA) | ✅ stable | Validation everywhere |
| `tailwindcss` | 4.x | ✅ stable | Tailwind preset shared across apps |
| `vite` | 6.x | ✅ stable | Pairs with Vitest |
| `vitest` | latest | ✅ stable | Unit + integration |
| `playwright` | latest | ✅ stable | E2E |
| `testcontainers` | latest | ✅ stable | Real Postgres per integration test |
| `dependency-cruiser` | latest | ✅ stable | CI boundary gate |
| `pino` | latest | ✅ stable | Structured logging |
| `@opentelemetry/api` + node SDK | latest | ✅ stable | Tracing + metrics |

**Version-pin policy.** Renovate PRs grouped by ecosystem (Mastra-suite, assistant-ui-suite, TanStack-suite, AWS-SDK-suite, OpenTelemetry-suite). Auto-merge minor + patch after CI green. Major upgrades and pre-1.0 minor bumps flagged for manual review.

### 17.3 Risk register

1. **assistant-ui pre-1.0 churn.** Pin minor; ~0.5 day per upgrade. Fallback = roll-our-own on raw `useChat` (~3 weeks).
2. **graphile-worker maintenance signal.** Verify on GitHub before Phase A starts. Fallback = `pg-boss` (similar API, more active).
3. **dnd-kit stagnation.** No credible alternative. Vendor the parts we depend on if maintainer signal goes cold.
4. **AI SDK v5 → v6 drift between Mastra default and our pin.** If Mastra's v6 path regresses, fall back to v5 in `chatRoute()` config; assistant-ui supports both.
5. **Mastra v1.x rapid release cadence.** Pin patch + minor; review weekly. Changelog discipline has been good v1.0 → v1.35.

### 17.4 Identity / auth — better-auth wiring decisions

- `better-auth` core for sessions, cookies, email+password (argon2id default).
- `better-auth/adapters/drizzle` against the `identity` schema.
- `better-auth` Microsoft provider for Entra OIDC (Phase B).
- `better-auth/plugins/two-factor` for TOTP (Phase C).
- `hibp` npm package (k-anonymity API) layered on top per §3.8.

| Question | Decision |
|---|---|
| Where do §3.9 profile fields live? | Separate `identity.user_profile` FK→better-auth's `user.id` — keeps better-auth's table close to its expected shape, reduces upgrade friction |
| Who owns role grants? | Our own `identity.role_grants` table — better-auth's organization plugin doesn't carry our group-scoped grant model |
| How does `core` validate sessions? | Call `betterAuth.api.getSession()` from `core` middleware — never reach into better-auth's tables (§1.6.11) |
| Tenant context propagation | Pass `tenant_id` via subdomain / explicit header; resolved in `core` middleware and attached to `req.user` |

**Rejected alternatives.** `oslojs` primitives (too much custom code), `Lucia` (archived 2025), `next-auth` / `auth.js` (Next.js-coupled, SPA fit awkward).

### 17.5 Frontend — Vite + React 19 + TanStack Router + shadcn/ui

| Slot | Pick |
|---|---|
| Build | Vite (matches §1.6.8 single SPA; no SSR overhead behind login) |
| Router | TanStack Router (typed routes, per-route code splitting, loader pattern) |
| UI primitives | shadcn/ui (Radix + Tailwind) — components we own; Radix backbone for WCAG 2.1 AA (§10.6) |
| Server state | TanStack Query (pairs with Router loaders) |
| Forms | react-hook-form + zod (same schemas as server; drizzle-zod for DB shape) |
| Kanban DnD | dnd-kit (`@dnd-kit/sortable`) |
| Tables | TanStack Table (headless; pairs with shadcn) |
| Copilot UI | assistant-ui + `@mastra/ai-sdk` (see §18) |
| Markdown | react-markdown + remark-gfm + rehype-sanitize (or Streamdown via assistant-ui) |
| Icons | lucide-react |
| i18n | i18next + react-i18next — day-one wiring per §10.6 |
| Date/time | date-fns + date-fns-tz (UTC store, viewer-tz display per §5.3) |
| File upload (Phase B) | uppy (S3 multipart built in) |

**Rejected for v1:** Next.js App Router (SSR overhead behind login wall, conflicts with §1.6.8); Mantine / MUI (heavier; less escape hatch); roll-your-own chat UI on raw `useChat` (~3–4 weeks vs ~1 week with assistant-ui); CopilotKit (bundle-exclusion footgun + more lock-in than assistant-ui).

### 17.6 Event bus + workflows

| Slot | Pick | Notes |
|---|---|---|
| Bus dispatcher | Hand-roll (~200 lines around `pg_notify` + `core.events` outbox) | Matches §1.6.5a literally; no abstraction layer |
| Job queue / scheduler | graphile-worker | Postgres-native cron + retry + LISTEN/NOTIFY wakeup — drives all scheduled workflows |
| Workflow engine | Mastra Workflows (`@mastra/core/workflows`) | Decided in §7.1f; provides Step, suspend-and-resume, snapshots; cron triggers come from graphile-worker calling `mastra.getWorkflow().createRun().start()` |

Bus semantics are fan-out with per-subscription cursors. pg-boss / pgmq are queue-shaped (single consumer per message) — mapping fan-out onto them means N copies of every event. Hand-rolling the dispatcher matches §1.6.5a directly.

`event_version` from day one (§1.6.5a). Subscriber registration pairs `event_type` + `event_version`; framework rejects mismatch.

### 17.7 Backend libraries

| Slot | Pick | Notes |
|---|---|---|
| Validation | zod | Request bodies, env config, event payloads, drizzle-zod for DB shape |
| Password hash | `@node-rs/argon2` | argon2id; used by better-auth |
| MS Graph (Phase B) | `@microsoft/microsoft-graph-client` + `@azure/msal-node` | Delta tokens, retries, throttling headers |
| MCP client | `@modelcontextprotocol/sdk` TypeScript via `@mastra/mcp` | — |
| Rate limit | `hono-rate-limiter` + Postgres store (v1) | No Redis dep in v1 |
| Logging | pino (via `@seta/observability`) | Fast structured JSON; CloudWatch-friendly |
| Observability | OpenTelemetry SDK + OTLP exporter (via `@seta/observability`) | Vendor-neutral; attribute conventions centralized in the shared package |
| Error tracking | Sentry SDK (operator-installable, optional; wired through `@seta/observability`) | — |
| Email | react-email templates + AWS SES / Resend / SMTP / dev-stub transports (via `@seta/mailer`) | TSX templates; transport swappable by env |
| Secrets / encryption | AWS Secrets Manager reader + KMS envelope (via `@seta/crypto`) | Centralizes security-sensitive code |
| Object storage (Phase B) | S3 + ClamAV (via `@seta/storage`) | Per-tenant key namespacing |
| Virus scan (Phase B) | ClamAV sidecar or Lambda-from-S3-trigger (invoked from `@seta/storage`) | OSS norm |
| Embedding model | OpenAI `text-embedding-3-small` (1536d) baseline; pluggable via Mastra | §7.1c — alternatives: Bedrock Titan Embed v2, local Ollama for air-gapped |

### 17.8 Tooling

| Slot | Pick | Notes |
|---|---|---|
| Boundary enforcement | dependency-cruiser (CI gate) + `eslint-plugin-boundaries` (IDE) | Forbids `pkgA/src/!(index.ts|events)/**` cross-imports |
| Migrations | drizzle-kit per module | Owned per package; orchestrator runs in dep order at boot (`core` first per §1.6.6) |
| Unit tests | vitest | Pairs with Vite |
| E2E tests | Playwright | — |
| DB in CI | Testcontainers | Real Postgres per test run; no DB mocks |
| CI | GitHub Actions + Turborepo remote cache (S3) | — |
| IaC | AWS CDK (TypeScript) | Matches stack language; Terraform also fine per §10.5 |
| Docs site | Starlight (Astro) | For OSS-facing docs |

### 17.9 Deliberately NOT adopted for v1

- Vector DB external (we use pgvector in-Postgres).
- Redis — in-memory LRU + Postgres cover Phase A.
- Kafka / NATS / Redis Streams for bus — rejected in §1.6.5a.
- Temporal / Inngest — Mastra Workflows is decided.
- Microfrontend / module federation — single SPA per §1.6.8.
- `next-auth`, `Lucia`, `passport`.

---

## 18. Copilot integration architecture (Mastra ↔ assistant-ui)

Verified against Mastra v1.0 docs as of 2026-05-19. This is the concrete wiring for §7.1b.

**Server side (`copilot` module).**

```
POST /api/copilot/v1/chat/:agentName
  → Hono handler →  Mastra.chatRoute() / handleChatStream()
  → returns createUIMessageStreamResponse(stream)
```

- `chatRoute()` accepts an Agent name, resolves the Mastra Agent (router or specialist), streams the turn.
- Tool calls flow on the wire as `tool-{toolKey}` parts cycling `input-streaming` → `input-available` → `output-available` (or `output-error`). assistant-ui's `ToolUI` primitives render these directly.
- AI SDK version pin — **opt into v6** from day one via `version: 'v6'` (matches assistant-ui v6 runtime). Sit on v5 only if a regression forces it.

**Client side.**

```typescript
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { AssistantChatTransport } from '@mastra/ai-sdk';

const runtime = useChatRuntime({
  transport: new AssistantChatTransport({
    api: `/api/copilot/v1/chat/${selectedAgent}`, // 'router' | 'planner' | 'staffing'
  }),
});
```

**Why both `assistant-ui` and `@mastra/ai-sdk`?** Different layers:

- `@mastra/ai-sdk` is a **transport adapter** — `AssistantChatTransport` translates Mastra's response shape (`tool-{toolKey}` parts lifecycle, `memory.thread` / `memory.resource` routing) into the AI SDK protocol that `useChat` consumes. Without it, ~150 lines of custom fetch + ReadableStream + part formatter we maintain.
- `@assistant-ui/react` is the **UI component library** — Thread, Composer, MessageList, `ToolUI`, `Interactables` (HITL). Without it, ~3–4 weeks of custom JSX.

Two separate problems (transport vs. components) bridged by the AI SDK protocol. Default to both per Mastra's own assistant-ui integration guide.

**Topology — Supervisor Agent.**

Mastra v1.0 replaced `.network()` with **Supervisor Agents** (delegation hooks + message filtering + parent-only streaming). We use Supervisor from day one even though Phase A only delegates to one specialist per turn — same primitive scales to v1.x multi-specialist orchestration without rewrite.

- **Supervisor agent** at `/chat/router` — no domain tools, delegation hooks only. Uses `messageFilter` to bound context (Research-Coordinator pattern: last N messages).
- **Specialist agents** registered as delegation targets:
  - `planner.agent` — tools per §7.2 (composable primitives).
  - `staffing.agent` (Phase B) — atomic primitives per §7.2.1 (`match_users_to_topic`, `infer_user_skills_from_history`, `get_user_availability`, `compute_workload`, `get_leave_overlap`). The §7.2.2 staffing recipe is composed at chat time; per D15 there is no macro tool.
- `onDelegationStart` records the delegation for audit + observability (§8.1).
- `onDelegationComplete` is the seam where Phase A enforces "one specialist per turn." Phase B can soften.
- Streaming is **parent-only** per Mastra's Supervisor model — child output flows through the supervisor. Matches SSE multiplexing constraint (§5.2 / §7.1b — one stream per session).

**Workflows → UI stream forwarding.** Mastra v1 forwards agent text + tool calls from workflow steps to the workflow's UI stream when the step pipes the agent's stream to the workflow writer — lets durable long-running workflows (e.g., `capability-gap-translation` in Phase B) surface status into the user's chat panel without bespoke wiring.

**Cost / token telemetry.** Mastra's response stream surfaces token counts per turn. Tag each turn with `session.role_summary` (per §7.1e) for per-role cost dashboards (§7.4).

**Two copilot interfaces in v1.** Both surfaces run against the same Mastra backend; threads are shared between them (per the build-plan thread-model decision):

1. **Embedded copilot panel** (Phase B once domain portals exist) — right-side drawer in each portal, supervisor as default, portal-context hint biases routing.
2. **Standalone Copilot module** (Phase A) — full-page app, peer of future business modules in the app launcher. ChatGPT-style sidebar with thread history; **agent selector** (Supervisor + specialists, gated to `copilot.contributor+` for specialists); **Workflows tab** that collapses with §7.3 agent-ops — role-shaped visibility (end users see their own runs; `copilot.viewer` sees tenant; superadmin sees instance).

The standalone module takes UX inspiration from **Mastra Studio** (Studio's UX = agent chat + workflow graph viz + traces + OM panel) but uses our auth + our role model; Studio itself is dev-targeted and not shipped to end users.

---

## 19. Repo structure, deployment, local development

### 19.1 Repo layout

```
apps/
├── server/              # Hono + Mastra runtime; imports each package's /backend
├── web/
│   └── src/
│       ├── shell/       # header, app launcher, copilot panel slot, providers, command palette
│       ├── modules/
│       │   ├── identity/    # login, profile, password reset
│       │   ├── planner/     # Phase B Kanban + task detail
│       │   ├── copilot/     # standalone Copilot module (Phase A), embedded panel (Phase B)
│       │   └── integrations/# Timesheet MCP config (Phase A), sync admin (Phase B)
│       └── lib/         # app-only utilities (auth client, API client, hotkeys hub)
├── cli/                 # tenant-create, seed, migration runner
└── dev-mcp-stub/        # canned Timesheet getLeave (local-dev only)

packages/
├── core/                # BACKEND: event bus (incl. audit per D6), session middleware, registries, tenant lifecycle
├── identity/            # BACKEND: better-auth wiring, user_profile, role_grants
├── planner/             # BACKEND: schema, Hono routes, Mastra tools/agent
├── copilot/             # BACKEND: Mastra Supervisor + cross-module agents/workflows, thread storage
├── integrations/        # BACKEND: MS Planner sync (Phase B), MCP clients (Phase B)
└── shared/              # cross-cutting infrastructure — imported by every module + app
    ├── ui/              # design system: tokens + primitives + Linear-flavored composites
    ├── types/           # cross-package zod schemas, event-payload base types
    ├── config/          # eslint, tsconfig, tailwind preset, dep-cruiser preset
    ├── mailer/          # D13: react-email templates + swappable transport (SES/Resend/SMTP/dev-stub)
    ├── observability/   # D13: OTel SDK + pino + metrics helpers + attribute naming conventions
    ├── crypto/          # D13: Secrets Manager reader, KMS envelope encryption, JWT rotation, HIBP
    ├── storage/         # D13 (Phase B impl): S3 wrapper + presigned URLs + ClamAV + tenant key namespacing
    ├── db/              # D14: pg.Pool factory (3 workload-class pools), drizzle client builder, tx primitives
    ├── rbac/            # D14: VisibilityGate predicate + permission-string types + role-registry types (~50 LOC)
    └── testing/         # D14 (dev-only): testcontainers helper + fake event bus / mailer / embeddings + fixtures

infra/
├── cdk/                 # AWS CDK reference deployment
└── docker/              # Dockerfile, docker-compose.yml (eval), compose.dev.yml (Postgres-only)

docs/                    # requirements.md (this file), adr/
.dependency-cruiser.cjs  # CI boundary gate per §1.6.2
turbo.json
pnpm-workspace.yaml
.nvmrc                   # 24
```

**Backend package shape (`packages/<module>/`):**

```
src/
├── index.ts     # typed exports for cross-module calls — the public surface (§1.6.4)
├── backend/     # Hono routes, Mastra tools/agents/workflows, DB queries — internal
├── events/      # event-payload type definitions (§1.6.5a)
└── db/          # Drizzle schema + migrations (schemaFilter: ['<module>'])
package.json     # subpath exports: . (the public surface), ./backend (apps/server only), ./events
```

`apps/server` imports `@seta/planner/backend`. Cross-module code imports `@seta/planner` / `@seta/planner/events`. dependency-cruiser rejects any other shape.

**Frontend boundary discipline.** Backend boundaries are dep-cruiser-enforced (CI gate). Frontend lives inside `apps/web` — boundaries here are **conventional**, enforced by `eslint-plugin-boundaries` inside `apps/web/.eslintrc.cjs` (e.g., `apps/web/src/modules/planner/` cannot reach into `apps/web/src/modules/copilot/`'s internals).

### 19.2 Deployment (production)

One Docker image, one Hono process per ECS Fargate task (§1.6.7, §10.5):

```
[ALB] → [ECS Fargate: N tasks] → [Hono process]
                                    ├── /api/*  — all module routes
                                    ├── /*      — apps/web/dist (built static)
                                    ├── bus dispatcher (LISTEN/NOTIFY)
                                    ├── graphile-worker (cron + retry)
                                    └── Mastra agents + workflows (in-process)
                                          ↓
                                    [RDS Postgres + pgvector]   [S3 — Phase B]
                                    [Secrets Manager — DB pw, AI/embed API keys, MCP creds]
```

**Dockerfile (multi-stage):** install → `pnpm turbo build` → runtime image with `apps/server/dist`, `apps/web/dist`, production `node_modules`. Single image, single entrypoint.

**Boot sequence (`apps/server/src/index.ts`):**

1. Validate env (zod).
2. Open Postgres pool (verify pgvector extension installed).
3. Run migrations in dep order: `core` → `identity` → `planner` / `copilot` / `integrations` (§1.6.6).
4. Initialize each module via registration calls (routes, roles, subscribers, copilot tools/agents/workflows, frontend routes).
5. Start bus dispatcher.
6. Start graphile-worker.
7. Start Mastra runtime.
8. Start Hono server.

Any step fails → exit non-zero → ECS restarts. No degraded-mode boot.

**IaC.** AWS CDK (TypeScript) in `infra/cdk/`. Stack: VPC, RDS Postgres (with pgvector parameter group), ECS cluster, Fargate service, ALB with WAF, S3 bucket (Phase B), Secrets Manager, IAM roles, CloudWatch log groups.

**`docker compose up` for evaluation.** `infra/docker/docker-compose.yml` brings up Postgres (with pgvector) + app container — single-command bring-up per §10.5.

### 19.3 Local development

Stack:

- Postgres + pgvector in Docker (`compose.dev.yml`, Postgres-only — app runs natively for HMR).
- `apps/server` via `tsx watch` on `:3000` (Hono + Mastra + workers).
- `apps/web` via Vite dev server on `:5173`, `/api/*` proxied to `:3000`.
- `apps/dev-mcp-stub` on `:4000` (canned `getLeave` data; deterministic).
- **Mastra Studio** on `:4111` as a dev convenience (`pnpm studio`) — inspect agents/workflows/traces while developing. Documented as optional.

**Scripts (repo root):**

```
pnpm install
pnpm db:up              # docker compose -f infra/docker/compose.dev.yml up -d
pnpm db:migrate         # drizzle-kit migrate in dep order
pnpm db:seed            # demo tenant: groups, plans, tasks (most untagged; a subset with skill_tags/review_state)
pnpm db:reset           # drop + migrate + seed
pnpm dev                # turbo dev — apps/server + apps/web + apps/dev-mcp-stub in parallel
pnpm studio             # mastra studio (optional)
pnpm typecheck          # tsc -b across packages
pnpm lint               # eslint + dep-cruiser
pnpm test               # vitest (unit + integration via testcontainers)
pnpm test:e2e           # playwright against the dev stack
```

**Onboarding contract:** `git clone && pnpm install && pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev` → working flagship demo within 5 minutes on a fresh machine.

**Test data isolation.** Testcontainers spins a real Postgres (with pgvector) per integration test. No DB mocks.

---

## 20. Design system & UI library — Linear-flavored

Build `packages/shared/ui` upfront as the Phase A foundation. ~1–2 weeks for the v1 surface (mostly shadcn copy-in + Linear-flavored theming + ~6 custom composites). Without it, every module reinvents buttons; with it, Phase A's standalone Copilot module is meaningfully less code.

**Linear UX traits we adopt for v1:**

| Trait | Implementation |
|---|---|
| Keyboard-first | `tinykeys` global shortcut registry in shell; module-contributed shortcuts |
| Cmd+K command palette | `cmdk` (shadcn Command wrapper) — single global palette, module-contributed commands |
| Slide-in detail pane | shadcn `Sheet` — task detail (Phase B), workflow run drilldown (Phase A) |
| Optimistic UI | TanStack Query `useMutation` with `onMutate` + rollback — default for every write |
| Inline editing | No separate "edit mode" — click-to-edit on every editable field |
| Minimal palette | Tailwind slate/zinc neutrals + one accent; **dark mode from day one** |
| Smooth transitions | `motion` (was Framer Motion) for Sheet/Dialog enter-exit + list reorder; CSS for everything else |
| Inbox-style triage | Workflows tab in standalone Copilot — runs as inbox items (status, title, meta, unread dot, click-to-drill) |
| Typography | Inter (or system); tight line heights; ~14px body |
| Dense info, low chrome | No card shadows, no over-iconification; whitespace + typography hierarchy carry the weight |

**`packages/shared/ui` layering:**

```
shared/ui/
├── tokens/        # color / spacing / radius / typography / motion — Tailwind preset + CSS vars
├── primitives/    # shadcn copy-in: Button, Input, Select, Sheet, Dialog, Command, Toast,
│                  # Dropdown, Tooltip, Tabs, Avatar, Badge, Separator, Switch, Checkbox,
│                  # RadioGroup, Form, Label, Textarea, Popover, ScrollArea, Skeleton,
│                  # Calendar, DatePicker, ContextMenu, Alert, Card — ~25 primitives
├── composites/    # Linear-flavored:
│                  #   CommandPalette (Cmd+K with grouped sections)
│                  #   SidePanel (Sheet wrapper, consistent header/body/footer)
│                  #   InboxList + InboxItem (status + title + meta + unread)
│                  #   KbdHint (rendered keyboard shortcut chip)
│                  #   EmptyState, ErrorState, LoadingSkeleton
│                  #   DataTable (TanStack Table preset)
├── icons/         # lucide-react re-exports with project aliases
└── theme/         # ThemeProvider, dark/light toggle, system-pref detection
```

**Rule of thumb:** if two modules use it, it lives in `shared/ui`. If one module uses it, it stays in the module folder (`apps/web/src/modules/<module>/components/`).

**Phase A deliverable from shared/ui:** tokens + ~25 primitives + 6 composites (CommandPalette, SidePanel, InboxList, KbdHint, EmptyState, DataTable) + dark/light theme.

**Storybook?** Deferred. Premature without a design partner; modules themselves are the showcase. Revisit when designers join.

---

## 21. Known unknowns — resolved in architecture phase (2026-05-19)

All 11 items resolved during the architecture phase. Resolutions summarized below; full rationale, code shapes, and integration detail in `docs/architecture.md`.

1. **AI SDK v5 vs v6 pin.** **Resolved — pin v6.** AI SDK v6 is GA (2026); Mastra v1.35 supports it via `version: 'v6'` in chat handler config; assistant-ui ships a dedicated v6 runtime (`@assistant-ui/react-ai-sdk` pairs with `ai@^6` + `@ai-sdk/react@^3`). v5 fallback documented but not pre-wired. See `docs/architecture.md §A1`.
2. **better-auth ↔ §3.9 user-profile fit.** **Resolved — separate `identity.user_profile` table FK→`user.id`.** Confirmed: better-auth Drizzle adapter supports custom `modelName` + extensible plugin tables. No session/account-linking conflict. See `docs/architecture.md §A2`.
3. **Mastra memory storage adapter for Postgres.** **Resolved — `@mastra/pg` `PostgresStore({ schemaName: 'copilot' })`.** First-class `schemaName` option scopes Mastra-managed tables (`mastra_workflow_snapshot`, `mastra_evals`, thread/message storage) inside the `copilot` schema; schema-per-module discipline preserved. See `docs/architecture.md §A3`.
4. **Workflow ↔ outbox bridge.** **Resolved — `withCoreEmitContext()` helper in `core`.** Wraps a Mastra step body in `db.transaction()` + AsyncLocalStorage carrying `tx`, `trace_id`, `caused_by_event_id`. `core.emit()` inside the scope joins the tx automatically. Suspend/resume steps emit per-segment (documented constraint). See `docs/architecture.md §A4`.
5. **dependency-cruiser config shape.** **Resolved — full `.dependency-cruiser.cjs` ruleset specified.** Five rules: no-private-cross-package, no-peer-module-import (identity / planner / integrations are peers), apps-only-backend, no-circular, no-orphans (warn). CI gate in Turbo lint stage. See `docs/architecture.md §A5`.
6. **assistant-ui HITL pattern under AI SDK runtime.** **Resolved — AI SDK v6 `needsApproval` on the tool + assistant-ui Interactables surface card.** Standard pattern; tools marked `needsApproval` pause with `input-available` → user confirms via Interactable → handler runs. Wired uniformly for every write tool (§14.1 acceptance gate). See `docs/architecture.md §A6`.
7. **Mastra `chatRoute()` ↔ Hono mount.** **Resolved — `@mastra/hono` server adapter with `prefix: '/api/copilot/v1'`.** Official adapter; clean mount inside our existing Hono sub-router. Auth middleware shared via `createAuthMiddleware()` helper. See `docs/architecture.md §A7`.
8. **Per-session tool registry build.** **Resolved — per-session Agent instance, LRU-cached by `(agentKey, role_summary_hash)`.** Mastra Agents are POJOs around tool refs — cheap to construct. Cache invalidated by `identity.role_grant.changed` subscriber. Doubles as the §7.1e cache-friendly system-prompt seam (same hash = same prompt block = provider prompt-cache hit). See `docs/architecture.md §A8`.
9. **graphile-worker maintenance verification.** **Resolved — keep graphile-worker.** 0.17.0-rc.0 (Jul 2025) + 2026 issue activity confirm active maintenance despite slow cadence. pg-boss remains a documented fallback if signal degrades. See `docs/architecture.md §A9`.
10. **pgvector index strategy at v1 scale.** **Resolved — HNSW with `WHERE tenant_id = $1` prefilter; `m=16, ef_construction=200`.** 2026 consensus for <1M vectors per tenant. Per-tenant partitioning is a v1.x mitigation when any single tenant exceeds ~1M; v1 scale (§10.2) does not require it. Rebuild cadence: ad-hoc on bulk-import surge, otherwise none (HNSW handles incremental writes well). See `docs/architecture.md §A10`.
11. **Embeddings CDC backpressure.** **Resolved — five env-tunable levers + per-entity job-key coalescing.** `EMBED_WORKER_CONCURRENCY=5`, `EMBED_PROVIDER_RPM_CAP=2400` (token-bucket at provider boundary), `EMBED_COALESCE_WINDOW_MS=5000` (graphile-worker `job_key` per entity), tenant fair-share round-robin, OTel `copilot.embed.queue.depth` metric with alert at 10k. Bulk-import escape valve uses array embedding calls (up to 2048 inputs per request). See `docs/architecture.md §A11`.
