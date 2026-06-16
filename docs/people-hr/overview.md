# People & HR — Program Overview

> Status: **Discovery (in progress)**. This document and the per-module docs under
> `docs/people-hr/` are the source of truth for the People & HR design. Decisions are recorded in
> §9; open questions in §8.

This is the shared foundation for two new modules — **`people`** (HR core + employee lifecycle) and
**`hiring`** (recruitment). It captures the cross-cutting concerns both share: the application shell,
the role model + RBAC, the `people ↔ identity` contract, and the cross-module event surface. Each
module's screens, use cases, WBS, system design, and DB design live in its own doc
([`people.md`](./people.md), [`hiring.md`](./hiring.md)).

---

## 1. Scope

**In scope** (this program):

| Module | Area | Features (backing capabilities) |
|---|---|---|
| `people` | HR core | Workforce dashboard/analytics · Employee records · Org structure · Resource allocation |
| `people` | Lifecycle | Lifecycle dashboard · Directory · Onboarding · Probation · Movement · Offboarding |
| `hiring` | Recruitment | Recruitment reports · Requisitions · Candidates · Interviews · Knowledge base |

**Out of scope** (separate efforts — referenced only as integration points):

- **Project Monitoring** (Portfolio / Weekly Reports / RA Monitoring / Risks / KPI) — overlaps the
  existing `planner` + `staffing` modules; tracked separately.
- **Super Century AI** (the chat module + 4 specialist agents) — built on the existing `agent`
  engine. The People/HR modules **expose agent tools** (read + HITL-gated writes) but do not own the
  chat surface.

**Decisions taken during discovery:**

1. Scope = People + Lifecycle + Hiring.
2. **Lifecycle folds into the `people` module** (not a standalone module).
3. **Two modules**: `people` and `hiring`.
4. **`people` owns the employee/HR record** as system-of-record. `identity.user` stays auth-only.
   They link by `user_id` with **no cross-schema FK**; consistency is event-driven (§5).
5. Discovery deliverables = this overview + two module docs (committed under `docs/people-hr/`).

---

## 2. Module map & relationship to existing modules

```
                 identity (auth, user_profile, RBAC, SSO)
                    │  user.created / user.updated (events)
                    ▼
   ┌─────────────────────────────────────────────┐
   │  people  (setaTier: module)                  │
   │  • employee/HR record  (system of record)    │
   │  • org structure, allocation rollups         │
   │  • lifecycle: onboarding→probation→movement  │
   │              →offboarding→alumni             │
   └───────┬───────────────────────────┬──────────┘
           │ employee.hired             │ employee.* events
           │ (consumes)                 ▼
   ┌───────┴───────────────┐     notifications · core.events (outbox/audit)
   │  hiring (module)       │            ▲
   │  • requisitions        │            │
   │  • candidates          │     planner / staffing (allocation source signals)
   │  • interviews, offers  │            agent (agent-tools surface)
   │  • knowledge base      │
   └────────────────────────┘
```

- **`identity`** — owns authentication, `user_profile` (thin: skills, role, availability, timezone,
  bio), role grants, RBAC overlays, SSO. Does **not** hold HR data (grade, dept, comp, documents,
  employment history). The `people` employee record is keyed by `identity`'s `user_id`.
- **`staffing`** — AI orchestrator (`orchestration_runs` + step traces) that proposes assignments via
  ports. Not a data owner for allocation; `people`'s Resource Allocation is its own read/rollup model
  (open question OQ-3 on whether it consumes staffing/planner assignment signals).
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

Both new modules follow the enforced rules: cross-module imports only through
`src/index.ts` / `/events` / `/rbac` / `/contracts` / `/agent-tools`; `schemaFilter: ['people']` and
`['hiring']`; no cross-schema FKs; no cross-module raw SQL. New modules are scaffolded via
`pnpm gen module` (see [`docs/creating-modules.md`](../creating-modules.md)).

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
- **Enabled-modules** signal (`GET /api/me/enabled-modules`) so `people`/`hiring` tiles appear.
- **HTTP API surface** (Hono routes) backing each screen's data + actions.
- **Agent tools** (read + HITL-gated writes) for the cross-module "Ask Seta" panel.

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

- **Admin-only** to edit: `manager`, `account`, `project`, `grade`, `salary`, `bank`, `tax`.
- **Self-editable**: other personal fields (by the record owner or an admin).
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

All emitted via `core.emit()` inside `withEmit(...)`; subscribers are idempotent on `event_id`;
per-aggregate ordering only. Names are proposals to be finalized in module system design.

| Event | Emitter | Consumers | Purpose |
|---|---|---|---|
| `employee.created` | people | notifications, hiring | New HR record (incl. from a hire) |
| `employee.updated` | people | notifications, projections | Profile/org/field change |
| `employee.lifecycle_changed` | people | notifications | Stage transition (preboard→…→alumni) |
| `employee.allocation_changed` | people | notifications | Billable/bench/leave change |
| `requisition.opened` / `requisition.closed` | hiring | people, notifications | Demand signal |
| `candidate.hired` | hiring | **people** | Triggers employee creation + preboarding |
| `interview.scheduled` / `interview.completed` | hiring | notifications | Calendar + reminders |

**Consumed by `people`:**
- `identity` → `user.created` / `user.updated` (§5).
- **Project Management module** → assignment / utilization events feed Resource Allocation (P-C3) as
  a read-model projection. Exact event names defined jointly with PM.
- **`planner`** → `planner.task.*` (moved/completed) + `planner.checklist_item.*` for lifecycle
  boards → `people` recomputes case progress/health and advances lifecycle stage when a card
  completes.

**Public-surface calls from `people`:**
- → **`planner`**: `createGroup` (per account/project, idempotent) + `createPlan` (shared onboarding/
  offboarding plan) + `createBucket` (phases) once per group; `createTask` (employee card) +
  `addChecklistItem` (per step) per case; `getPlan` / `listTasks` / `listChecklistItems` for state.

**External-system side effects** (not domain events): on `employee.created`, `people` requests
**MS365/Teams provisioning** through the `integrations` module; employee documents/CVs are stored via
`shared-storage`.

---

## 7. Per-module discovery method (backend WBS template)

Each module doc (`people.md`, `hiring.md`) is built in these steps, in order, with a review gate
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
| OQ-1 | Exact person-fact split between `identity` and `people` (esp. `skills`) | people.md §system design |
| ~~OQ-2~~ | **RESOLVED** — **Account** = a client of the outsourcing company, 1—* **Project**. Canonical Account/Project master data is a **shared delivery structure owned by the Project Management domain** (out of scope). `people` references `account_id`/`project_id` as plain uuids on the employee record (no FK) + a minimal projected lookup (id→name, account↔project, AM owner) for scoping/display; seeded/stubbed until PM provides it. | — |
| ~~OQ-3~~ | **RESOLVED** — Resource Allocation is a read-model in `people`, fed by the **Project Management module** via domain events (assignment/utilization). Event contract defined jointly with PM. | — |
| OQ-4 | Org chart source — derived from `manager` field, or an explicit org-unit hierarchy? | people.md |
| OQ-5 | i18n: which content is localizable (process steps, notes); default locale handling | overview (here) → confirm |
| OQ-6 | Document storage for employee docs / candidate CVs — reuse `shared-storage` (S3)? | both module docs |
| OQ-7 | Knowledge Base (hiring tab) vs existing `knowledge` module — reuse or distinct? | hiring.md |
| OQ-8 | Evaluation/scorecard model (probation review, member eval, AMMI) — own entity set | people.md / hiring.md |
| ~~OQ-9~~ | **RESOLVED** — account/project → planner **group**; **one shared onboarding + one offboarding plan per group**; **card (task) per employee** across **phase buckets**; per-step checklist = planner **checklist items**. | — |

---

## 9. Decision log

| Date | Decision |
|---|---|
| 2026-06-16 | Scope = People + Lifecycle + Hiring; PM + AI out |
| 2026-06-16 | Lifecycle folds into `people`; two modules `people` + `hiring` |
| 2026-06-16 | `people` owns employee record; link to `identity.user_id`, no cross-schema FK, event-driven |
| 2026-06-16 | Deliverables = program overview + per-module docs, committed under `docs/people-hr/` |
| 2026-06-16 | **Backend-focused discovery**; web UI delivered separately by the suite-shell refactor (People/HR as future `@seta/web-people` / `@seta/web-hiring` apps) |
| 2026-06-16 | Resource Allocation (P-C3) = read-model in `people`, sourced from the **Project Management module** via events (not standalone, not directly from `staffing`) |
| 2026-06-16 | Lifecycle **kanban boards (onboarding/offboarding) are `planner`-backed**: `people` owns the process template + thin case record, scaffolds a planner plan/buckets/tasks, and projects progress from `planner.task.*` events |
| 2026-06-16 | **Only onboarding + offboarding** are planner-backed boards; **movement** stays a people-owned approval workflow and **probation** stays people-owned reviews |
| 2026-06-16 | OQ-9: board = account/project → planner **group**; **one shared plan per group**; **card per employee** across phase buckets; steps = planner **checklist items** |
| 2026-06-16 | **Confirmed: the Project Management module owns Account, Project, and Resource Allocation.** `people` references `account_id`/`project_id` by id (no FK) + minimal projection; allocation (P-C3) is a read-model fed by PM events |
