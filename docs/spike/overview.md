# People & HR — Program Overview

> Program/discovery overview for People, Hiring, and PM. Product source of truth: the module PRDs in [`docs/modules/`](../modules/) ([People-PRD](../modules/People-PRD.md), [Hiring-PRD](../modules/Hiring-PRD.md), [PM-PRD](../modules/PM-PRD.md)). Boundaries: time-off/leave is owned by the external timesheet system (People integrates via its API, doesn't own it); internal mobility feeds a single job-change ("movement") in `people`, and a re-hire links to the existing person (person → many employment periods) via a boundary match — see [`benchmarking-mobility-rehire.md`](./benchmarking-mobility-rehire.md).

This is the shared foundation for **three new modules** — **`people`** (HR core + employee lifecycle),
**`hiring`** (recruitment), and **`pm`** (project management / PSA — Accounts, Projects, Resource
Allocation). It captures the cross-cutting concerns they share: the application shell,
the role model + RBAC, the `people ↔ identity` contract, and the cross-module event surface.

Document set:
- [`people.md`](./people.md) — the `people` module (HR core + lifecycle), 12 capabilities.
- [`hiring.md`](./hiring.md) — the `hiring` module (recruitment + internal mobility).
- [`pm.md`](./pm.md) — the `pm` module (PSA): Accounts/Projects/Allocation (M:N)/demand-as-placeholder/monitoring.
- [`ddd-design.md`](./ddd-design.md) — bounded contexts, context map, aggregates, **canonical event contract**.
- [`db-design.md`](./db-design.md) — validated schema + Mermaid + 3NF/optimization.
- [`benchmarking.md`](./benchmarking.md) — research vs Workday/SAP/Odoo/Kantata + adopted decisions.

---

## 1. Scope

**In scope** (this program):

| Module | Area | Features (backing capabilities) |
|---|---|---|
| `people` | HR core | Workforce dashboard/analytics · Employee records · Org & positions · Resource-allocation views |
| `people` | Lifecycle | Lifecycle dashboard · Directory · Onboarding · Probation · Movement · Offboarding |
| `people` | People ops | Performance (cycles + goals) · Time-off/Leave · Headcount planning |
| `hiring` | Recruitment | Requisitions · Candidates · Interviews · Offers · Internal mobility · Knowledge base · Reports |
| `pm` | Project mgmt / PSA | Accounts · Projects (charter flow) · **Resource allocation** · Portfolio/health · Weekly reports · Risks · KPIs · Staffing demand |

**Out of scope** (separate efforts — referenced only as integration points):

- **Super Century AI** (the chat module + 4 specialist agents) — built on the existing `agent`
  engine. All three modules **expose agent tools** (read + HITL-gated writes) but do not own the chat
  surface.
- **Timesheets / attendance** — external system now (pulled via `integrations`); slated to become its
  own platform module later.
- Payroll / benefits / deep compensation — deferred / integration-only (benchmarking R6).

**Decisions taken during discovery:**

1. Scope = People + Lifecycle + Hiring + **PM** (3 implementation modules).
2. **Lifecycle folds into the `people` module** (not a standalone module).
3. **Three modules**: `people`, `hiring`, `pm`.
4. **`people` owns the employee/HR record** as system-of-record. `identity.user` stays auth-only.
   They link by `user_id` with **no cross-schema FK**; consistency is event-driven (§5).
5. **`pm` owns Accounts, Projects, Resource Allocation (M:N), staffing demand**; `people`/`hiring`
   reference by id + projections.
6. Discovery deliverables = this overview + per-module docs + benchmarking (under `docs/people-hr/`).

---

## 2. Module map & relationship to existing modules

```
                 identity (auth, user_profile, RBAC, SSO)
                    │  identity.user.created/updated
                    ▼
   ┌─────────────────────────────┐   people.worker.* / position.* / leave.*
   │  people  (Worker SoR)        │──────────────┬───────────────┐
   │  • worker record + org/pos   │              ▼               ▼
   │  • skills, lifecycle,        │   ┌────────────────┐  ┌──────────────────┐
   │    performance, leave        │   │ hiring         │  │ pm (PSA)         │
   └───────▲──────────────────────┘   │ • requisitions │  │ • accounts       │
           │ candidate.hired          │ • candidates   │  │ • projects       │
           │ (people creates Worker)  │ • interviews   │  │ • allocation M:N │
           │                          │ • offers       │  │ • demand=        │
   pm.assignment.* ──▶ people         │ • mobility     │  │   placeholder    │
   (rm_allocation, RBAC scope)        └──────▲─────────┘  │ • portfolio/KPI  │
                                             │            └───────┬──────────┘
                              pm.resource_request.opened          │
                                             └──────────◀─────────┘
   notifications · core.events (outbox/audit) · agent (agent-tools) · planner (lifecycle boards)
```

- **`identity`** — owns authentication, `user_profile` (thin: skills, role, availability, timezone,
  bio), role grants, RBAC overlays, SSO. Does **not** hold HR data. The `people` worker record is keyed
  by `identity`'s `user_id`.
- **`pm`** — the **PSA system-of-record**: Accounts → Projects, **M:N fractional allocation**, staffing
  **demand (= placeholder allocation)**, portfolio/health/KPI. Emits `pm.assignment.*` →
  `people.rm_allocation` (which drives RBAC visibility), and `pm.resource_request.opened` → hiring.
- **`staffing`** — pre-existing AI orchestrator (`orchestration_runs` + step traces) that *proposes*
  assignments via ports. **Not** the allocation data owner — `pm` is. (`staffing` may later feed pm
  suggestions.)
- **`planner`** — task/plan/kanban backend (groups → plans → buckets → tasks → checklist items;
  event-emitting; `groups.account_id` already exists). The `people` **lifecycle boards (onboarding &
  offboarding) are planner-backed**: each **account/project is a planner group**; **one shared
  onboarding (and one offboarding) plan per group**; **each employee is a card (task)** that moves
  across **phase buckets**; the **per-step checklist = planner checklist items** on the card.
  `people` scaffolds via planner's public surface and subscribes to `planner.task.*` /
  `planner.checklist_item.*` to track progress. Board state lives in planner.
- **`notifications`** — consumes `people`/`hiring` events to drive the bell + emails.
- **`agent`** — engine-only; `people` and `hiring` contribute agent tools/specs via the
  `/agent-tools` public subpath. The modules never import `agent`.
- **`core`** — `core.events` outbox/audit + `core.emit()` inside `withEmit(...)`. All state changes
  in these modules commit their event in the same transaction.

All three modules follow the enforced rules: cross-module imports only through
`src/index.ts` / `/events` / `/rbac` / `/contracts` / `/agent-tools`; `schemaFilter: ['people']`,
`['hiring']`, `['pm']`; no cross-schema FKs; no cross-module raw SQL. New modules are scaffolded via
`pnpm gen module` (see [`docs/creating-modules.md`](../creating-modules.md)). `agent` is engine-only —
all three contribute agent tools via `/agent-tools` and never import `agent`.

---

## 3. Frontend & shell — out of scope here

**This program is backend-focused.** The web UI is delivered by a separate, in-progress effort, the
**suite-shell refactor** (`apps/web` → a Microsoft-365-style shell with a 9-dot app-launcher; apps
are `@seta/web-*` workspace packages mounted via TanStack `physical()` route mounts). People/HR will
later ship as **`@seta/web-people`** and **`@seta/web-hiring`** launcher apps that plug into that
shell. UI screens, navigation chrome, and the "Ask Seta" panel are owned there — not in this
discovery.

What the backend must expose so the shell and apps can consume it (the only frontend-facing contract
in scope):

- **Permission strings** (RBAC inventory) returned by `GET /api/me`, used for launcher/route gating.
- **Enabled-modules** signal (`GET /api/me/enabled-modules`) so `people`/`hiring`/`pm` tiles appear.
- **HTTP API surface** (Hono routes) backing each screen's data + actions.
- **Agent tools** (read + HITL-gated writes) for the cross-module "Ask Seta" panel.
- **Global search** (topbar "people, skills, projects…"): each module exposes a scoped `search*` query
  (people: workers/skills; pm: projects/accounts; hiring: reqs/candidates), federated by the shell;
  results respect RBAC visibility. (Cross-cutting; owned per-module, aggregated by the shell.)
- **Notifications read API** (topbar bell): the existing `notifications` module must expose
  `GET /api/notifications` (paged, unread filter), `GET …/unread-count`, `POST /:id/read`, and a
  notification DTO `{id, title, body, link, actor, ts, read}`. People/HR/PM only **emit** the domain
  events `notifications` consumes; the read/bell surface is `notifications`' contract.

The rest of this program (and the two module docs) concerns the **backend**: domain model, services,
public surface, events, RBAC, agent tools, jobs, and DB design.

> i18n note: HR process content (onboarding/offboarding steps, review notes) is authored in
> **English and Vietnamese**. Treat user-facing process content as localizable (OQ-5) — a DB-design
> concern, since process-step/template text may need a locale dimension.

---

## 4. Role model & RBAC

Three tiers, mapped to personas:

| Tier | Personas | Visibility | Notes |
|---|---|---|---|
| **Strategic** | BOD, Admin, PMO, **HRM/HRBP** | Everything — all accounts, all employees, sensitive comp/bank | Full read + admin-only writes |
| **Management** | Account Manager (AM) | Own account's employees only | Needs an explicit **grant** to view another account |
| **Operation** | EM / Team Lead | Own projects + members managed; can evaluate members | Probation/eval input |
| **Operation** | Member | Self only | Self-editable personal fields |

**Visibility scoping:** Strategic → all; AM → employees in own + granted accounts; EM/Lead → self +
members on managed projects; Member → self.

**Field-level policy:**

- **Admin-only** to edit (on the worker record): `position`/`grade`, `salary`, `bank`, `tax`. (Manager
  derives from position→org-unit, P-C2.)
- **Account/project are NOT worker fields** — membership is the **pm allocation set** (M:N); changing
  it is a pm allocation, not a `people` field edit. RBAC account/project scoping reads the
  `rm_allocation` projection.
- **Self-editable**: personal fields (contact, dob, emergency contact) by the owner or an admin —
  including first-login self-completion.
- **Masked** for non-admins / non-owners: salary, bank, tax (rendered as "Restricted").

**Implementation note:** new permissions/roles are contributed via the `shared-rbac` pattern
(`PEOPLE_PERMISSIONS` / `HIRING_PERMISSIONS` + role→permission maps) and re-checked at every public
function callee (see [`docs/rbac.md`](../rbac.md)). Tenant isolation (`tenant_id`) applies to every
table — the platform is multi-tenant.

---

## 5. The `people ↔ identity` contract

- `identity` is the system of record for **authentication identity** (`user.id`, email, SSO link,
  role grants). A user is **pre-provisioned by an admin**; SSO is auth-only (no JIT) per platform
  policy.
- `people` is the system of record for the **employee/HR record** (employment data, org placement,
  comp, documents, history, lifecycle stage). Its primary key references `identity` `user_id` as a
  **plain `uuid` with no FK**.
- Sync direction:
  - `identity` emits `user.created` / `user.updated` → `people` projects the minimal identity facts
    (name, email, status) it needs into a local read model.
  - `people` emits employee lifecycle events (§6) that other modules (incl. `notifications`,
    `hiring`) consume.
- An employee record may exist in `people` before the person can log in (preboarding), and a person
  may exist in `identity` without an HR record (system/service accounts) — the link is nullable on
  both sides until reconciled.

> OQ-1: exact split of "person facts" between `identity.user`/`user_profile` and the `people` record
> (e.g. who owns `skills` — the employee record carries skills, while `identity.user_profile` also
> has a `skills` array). Resolve in `people.md` system design.

---

## 6. Cross-module domain events (proposed)

All emitted via `core.emit()` inside `withEmit(...)`; subscribers idempotent on `event_id`;
per-aggregate ordering only. **Canonical names: `<module>.<aggregate>.<verb>` — the full cross-context
contract lives in [`ddd-design.md`](./ddd-design.md) §8; this is the summary.** (people's aggregate is
**Worker** → `people.worker.*`; there is no `employee.*` wire name.)

| Event | Emitter | Consumers | Purpose |
|---|---|---|---|
| `people.worker.created` / `updated` | people | pm, hiring | New/changed worker record; `created` carries `resource_request_id?` when the worker came from an external hire → pm fills the placeholder **now** |
| `people.worker.capacity_changed` | people | pm | FTE/contracted-hours change (effective-dated; utilization denominator) |
| `people.worker.lifecycle_changed` | people | notifications | Stage transition (preboard→…→alumni) |
| `people.worker.deactivated` | people | **pm**, hiring | Offboarding/Alumni → pm ends open allocations |
| `people.worker.onboarded` | people | notifications | Onboarding **complete → lifecycle only** (placeholder was already filled at `people.worker.created`) |
| `people.leave.approved` | people | pm | Availability change |
| `people.position.opened` | people | pm | Open seat → pm creates a placeholder (single demand pipeline) |
| `pm.resource_request.opened` | pm | hiring | Unfilled **placeholder allocation** → hiring authors a requisition |
| `pm.assignment.created/changed/ended` | pm | **people** | → `rm_allocation` (drives RBAC visibility); `ended` retracts |
| `pm.account.* / pm.project.*` | pm | people, hiring | lookup projections |
| `hiring.requisition.opened/closed` | hiring | pm | References the resource_request |
| `hiring.mobility.approved` | hiring | **pm** | Internal move approved → pm fills placeholder (carries `placeholder_allocation_id`) |
| `hiring.candidate.hired` | hiring | **people** | Worker creation + preboarding (carries `resource_request_id`) |
| `hiring.interview.scheduled/completed` | hiring | notifications | Calendar + reminders |

**Consumed by `people`:**
- `identity.user.created/updated` (§5).
- **`pm`** → `pm.assignment.created/changed/ended` → `rm_allocation` (P-C3) + RBAC scope.
- **`planner`** → `planner.task.*` / `planner.checklist_item.*` for lifecycle boards → recompute case
  progress/health, advance stage on completion.

**Public-surface calls from `people`:**
- → **`planner`**: `createGroup` (per account/project, idempotent) + `createPlan` (shared onboarding/
  offboarding plan) + `createBucket` (phases) once per group; `createTask` (employee card) +
  `addChecklistItem` (per step) per case; `getPlan` / `listTasks` / `listChecklistItems` for state.

**External-system side effects** (not domain events): on `people.worker.created`, `people` requests
**MS365/Teams provisioning** through the `integrations` module; worker documents/CVs are stored via
`shared-storage`. The **external timesheet system** is reached only via `integrations` (it is **not** a
`core.events` subscriber).

---

## 7. Per-module discovery method (backend WBS template)

Each module doc (`people.md`, `hiring.md`, `pm.md`) is built in these steps, in order, with a review gate
between each. Capabilities are derived from the product's screens/features but expressed as
**backend** concerns — no UI design.

1. **Capability inventory** — the domain capabilities the module provides (e.g. employee record
   management, org structure, allocation rollups, lifecycle transitions), each tied to the features
   it backs.
2. **Role breakdown** — RBAC permissions per capability: who can read/write what, scoping rules,
   field-level + sensitive-field policy (§4) applied to each capability.
3. **Domain operations (use cases)** — the commands/queries each capability needs: inputs,
   validations, state transitions, invariants, and **HITL/approval points** for agent-driven writes.
4. **Module & function linking** — events emitted/consumed, cross-module public-surface calls, and
   dependencies (`identity`, `notifications`, `staffing`, `agent`, `shared-storage`, `knowledge`).
5. **WBS** — backend work broken into buildable slices (for later spec→plan→PR).
6. **System design** — services, public surface (`index.ts` / `/events` / `/rbac` / `/contracts` /
   `/agent-tools`), HTTP routes, workflows, graphile-worker jobs, projections, RBAC contributions.
7. **Database design** — Drizzle schema (`pgSchema` + `schemaFilter`), tables, indexes, projections,
   migration strategy.

---

## 8. Open questions (tracked)

| # | Question | Resolve in |
|---|---|---|
| ~~OQ-1~~ | **RESOLVED** — `people` is SoR for the rich HR **skills** (first-class taxonomy + proficiency); `identity.user_profile.skills` left as-is for staffing hints; not coupled | — |
| ~~OQ-2~~ | **RESOLVED** — **Account** = a client of the outsourcing company, 1—* **Project**. Canonical Account/Project master data is a **shared delivery structure owned by the Project Management domain** (out of scope). `people` references `account_id`/`project_id` as plain uuids on the employee record (no FK) + a minimal projected lookup (id→name, account↔project, AM owner) for scoping/display; seeded/stubbed until PM provides it. | — |
| ~~OQ-3~~ | **RESOLVED** — Resource Allocation is a read-model in `people`, fed by the **Project Management module** via domain events (assignment/utilization). Event contract defined jointly with PM. | — |
| ~~OQ-4~~ | **RESOLVED (R1)** — explicit **Supervisory-Org/org-unit + Position** model (Workday pattern); reporting derived from position→org, not manager-field-only | — |
| OQ-5 | i18n: which process content is localizable (EN+VI); locale dimension on template/notes text | **open** — decide before finalizing `db-design` (see db-design migration notes) |
| ~~OQ-6~~ | **RESOLVED** — `shared-storage` (S3); `employee_document` = metadata + storage key + expiry + version chain | — |
| OQ-7 | Knowledge Base: the hiring "Knowledge Base" tab is **recruitment-insight analytics**, not a JD CMS (see hiring.md H-C6) — confirm whether any JD-template store also reuses `knowledge` | hiring.md |
| ~~OQ-8~~ | **RESOLVED** — `people`-owned scorecard instrument (pillars/criteria/weights/CORE/AMMI + action library as reference config); reused by probation + hiring interview scoring | people.md §6.0 |
| ~~OQ-9~~ | **RESOLVED** — account/project → planner **group**; **one shared onboarding + one offboarding plan per group**; **card (task) per employee** across **phase buckets**; per-step checklist = planner **checklist items**. | — |

> Later OQ series live with their docs (all resolved): **OQ-10/10b/11/12** in [`benchmarking.md`](./benchmarking.md) §4
> (positions/org, multi-allocation, leave-vs-attendance, performance cycles); **OQ-H1/H2/H3** in
> [`hiring.md`](./hiring.md); **OQ-P1/P2/P3** in [`pm.md`](./pm.md); **OQ-D1/D2/D3** in [`ddd-design.md`](./ddd-design.md) §9.

---

## 9. Key decisions

| Decision |
|---|
| `people` owns employee record; link to `identity.user_id`, no cross-schema FK, event-driven |
| Deliverables = program overview + per-module docs, committed under `docs/people-hr/` |
| **Backend-focused discovery**; web UI delivered separately by the suite-shell refactor (People/HR as future `@seta/web-people` / `@seta/web-hiring` apps) |
| Resource Allocation (P-C3) = read-model in `people`, sourced from the **Project Management module** via events (not standalone, not directly from `staffing`) |
| Lifecycle **kanban boards (onboarding/offboarding) are `planner`-backed**: `people` owns the process template + thin case record, scaffolds a planner plan/buckets/tasks, and projects progress from `planner.task.*` events |
| **Only onboarding + offboarding** are planner-backed boards; **movement** stays a people-owned approval workflow and **probation** stays people-owned reviews |
| OQ-9: board = account/project → planner **group**; **one shared plan per group**; **card per employee** across phase buckets; steps = planner **checklist items** |
| **Confirmed: the Project Management module owns Account, Project, and Resource Allocation.** `people` references `account_id`/`project_id` by id (no FK) + minimal projection; allocation (P-C3) is a read-model fed by PM events |
| **Benchmarking ([benchmarking.md](./benchmarking.md)): boundaries validated; follow well-known systems (Workday/SAP/Kantata), don't reinvent.** Adopt R1–R6 |
| **R1: Position/org first-class** — `people` owns Worker + Position (internal org seat) + Supervisory-Org + headcount plan; supersedes manager-derived-only org (OQ-4). PM owns Account/Project + role-demand + allocation/utilization + rates. `hiring` requisition → PM demand and/or open position by id |
| **Multi-allocation: worker↔project is M:N, concurrent, fractional** (1 person on 2 accounts / 2 projects at once). Account/project is NOT a single employee field; membership = set of PM allocations projected into `people`; utilization = Σ fractional allocations |
| **R3: Performance = review cycles + Goals/OKRs + reviews** (scorecard = instrument), consuming PM delivery/utilization; probation stays a separate lifecycle review |
| **R4: Headcount/workforce planning** in `people`, tied to the Position object. **R6: comp/payroll/benefits deferred/integrate-only** |
| **`pm` is now a full implementation module** (3 modules: people/hiring/pm). pm owns Accounts/Projects/Allocation(M:N)/demand + monitoring (portfolio/weekly/risks/KPI). See [pm.md](./pm.md) |
