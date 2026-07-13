# People / Hiring / PM — DDD context map & integration contracts

> The integration backbone for the three modules: bounded contexts, the cross-cutting Person concept,
> aggregate roots + invariants, and domain events as the data-in/out contract. Describes the system as
> it is built today — grounded directly in each module's `events.ts`, `schema.ts`, and
> `subscribers/index.ts`, re-derived 2026-07-13 after this doc drifted years out of sync with the
> shipped implementation (the prior draft described a placeholder-fulfillment saga, internal mobility,
> and effective-dated capacity that were never built — see §9).
>
> **Source of truth: the module PRDs** ([`People-PRD`](../modules/people-prd.md), [`Hiring-PRD`](../modules/hiring-prd.md), [`PM-PRD`](../modules/pm-prd.md)) for product intent and the forward roadmap, and [`db-design.md`](./db-design.md) for the physical schema. This document is the *as-built* integration backbone behind them — it does not describe roadmap features (see §9 for what's deferred).

## 1. Bounded contexts

| Context | Module | Core responsibility | Ubiquitous language (local) |
|---|---|---|---|
| **HR / Workforce** | `people` | System of record for the human: identity/biographical data, org placement, employment lifecycle, skills, presence | **Person**, EmploymentPeriod, OrgUnit, Skill |
| **Recruitment / ATS** | `hiring` | Requisitions, openings, candidates, applications | Requisition, Opening, Candidate, Application |
| **Delivery / PSA** | `pm` | Accounts → Projects, allocation, staffing plans, project governance | Account, Project, Allocation, ProjectApproval |
| **Identity** | `identity` (foundation) | Auth principal, credentials, RBAC, SSO | User, RoleAssignment |
| **Work mgmt** | `planner` (existing) | Plans/buckets/tasks/kanban | Plan, Bucket, Task |

**Principle (DB-2 finding, confirmed by the code):** **Worker is not a durable entity — it is a role a
person plays.** `people` owns exactly one system-of-record aggregate for the human, **Person**, realized
as `(person, open employment_period)`. There is no separate `Worker` table; `pm` and `hiring` each keep
their own small, locally-owned read-model or local aggregate keyed on `person_id` — never one shared
mutable record, and never a second write-owner of person data.

## 2. Context map (relationships)

```
   identity ──[U, OHS]── auth principal ──▶ people
                                              │
   people = UPSTREAM Person Published Language (event publisher)
                │                        │
      worker.* / org_unit.* /      worker.* (name/title cache)
      skill.*                            │
                ▼                        ▼
        pm  [D]                   hiring  [D]
   (Person → local name-cache      (no current link — see below)
    projection on account/project
    manager fields)
                │
                └──[account.*, project.*, allocation.*, skill.renamed]──▶ people, hiring
                     (pm and core.skill are the other two event publishers)
```

| Relationship | Pattern | Contract |
|---|---|---|
| identity → people | Upstream **Open-Host** | `people` consumes `identity.user.created` to link an existing person by email; `identity.user.deactivated/reactivated` sync `people.user_projection`. |
| people → pm, hiring | **Published Language** (read-only name cache) | `pm.person_projection` (name/title) is fed by `people.worker.{created,updated}`. `hiring` does **not** subscribe to any `people` event today. |
| pm → people, hiring | **Published Language** | `people.account_projection`/`project_projection` and `hiring.account_projection`/`project_projection` are each independently fed by `pm.account.*`/`pm.project.*` (per §2.2 of the DB-2 design, this duplication is intentional — two different bounded contexts, not a shared table). `people.worker_allocation_projection` is fed by `pm.allocation.*`. |
| pm ↔ hiring | **schema-level linking column, not an active event flow** | `pm.allocation.resource_request_id` and `hiring.opening.resource_request_id` share a bare-uuid handle intended to connect an open PM seat to a hiring opening. As of this audit, `hiring` reads/writes `resource_request_id` (`openings.ts`); `pm` does not — there is no code path that resolves a hiring hire back onto a `pm.allocation`, and no event carries a person id from `hiring` into `pm` or `people`. This is a real gap, not a documented design (see §9). |
| hiring → people | **none today** | `hiring.application.status = 'hired'` is a local status value only. There is no `hiring.*` event consumed by `people`, and `people.createWorker` is called only from `people`'s own HTTP/UI (admin creates the person manually). A hired candidate does **not** automatically become a `people.person`. |
| people ↔ planner | calls + projection | `planner.assignee_projection` is fed by `identity.user.*` plus `people` skill/availability updates, for the assignee/mention picker. |

**Pragmatic ACL in a modular monolith.** No heavyweight ACL ceremony: the boundary discipline is
realized as **(a)** the event-driven local read-model projection, or **(b)** a public-surface function
call re-checking RBAC at the callee (e.g. `pm.listAccountIdsManagedBy`). No shared tables, no
cross-schema FK — enforced by `pnpm lint:raw-sql` and `depcruise`.

## 3. The Person concept across contexts

| Context | Local model | Owns | Gets from upstream |
|---|---|---|---|
| people | **Person** (aggregate, SoR) — realized as `(person, 0..N employment_period)` | identity/biographical fields, org placement, presence, skills, employment lifecycle | `identity.user.created/deactivated/reactivated` (correlates to an existing person by email; does not create one) |
| pm | `person_projection` (read-model: name, job_title) | allocations, project governance, rate/role-on-project | `people.worker.{created,updated}` |
| hiring | **Candidate** (local aggregate, hiring-owned) | application, pipeline stage, interview/offer state (candidate fields only — no `people` link) | nothing from `people` today |

Only **people** mutates the Person. `pm` reads a thin name/title cache. `hiring`'s Candidate is a wholly
separate local record with **no verified relationship to a `people.person`** — an external candidate and
an employee are different objects in different schemas with no code path connecting them.

## 4. Aggregates & invariants

Small, invariant-scoped aggregates. Cross-aggregate consistency is **eventual via events**.

### people
- **Person** — identity/biographical fields (`full_name`, `work_email`, `dob`, `gender`, …), org
  placement (`org_unit_id`), presence (`availability_status`, `timezone`, …). *Invariant:* live-row
  unique `work_email` / `employee_no` per tenant.
- **EmploymentPeriod** — one row per employment stint on a person; carries `job_title` (tier-3, so a
  rehire's new title doesn't overwrite history) and `lifecycle_stage`. *Inv:* at most one open period
  (`end_date IS NULL`) per person; `lifecycle_stage` follows the state machine
  (`preboarding → onboarding → probation → active → on_leave → offboarding → alumni`, or
  `did_not_start`).
- **OrgUnit** — supervisory tree (`parent_id` self-FK, `head_worker_id` → `person`). *Inv:* acyclic
  (checked, not enforced by a trigger).
- **PersonSkill** — a person's skills (`skill_id` → `core.skill`, `level` 0–5).

*Not built* (roadmap only — see the People PRD, not this doc): Position, ReviewCycle, LeaveRequest,
effective-dated Capacity. `people` does not currently model performance reviews, leave requests, or a
seat/position concept independent of `employment_period`.

### pm
- **Account** — client + AM (`am_person_id`, boundary field `am_worker_id`).
- **Project** — under an account; lifecycle `submitted → pmo_approved → active → on_hold → closed`
  (or `rejected`/`withdrawn`). A charter is **not** a separate aggregate — it is a project in a
  pre-approval state (DB-2 §4.4); `pm.project_approval` is a 1:1 governance side table holding only
  workflow metadata (sign-off/approval/rejection timestamps and actors).
- **Allocation** — own small aggregate (heavy concurrent edits): `(person_id | placeholder, project_id,
  optional task_id)` + date range + intensity. *Inv:* a *committed*/*tentative* allocation references a
  real `person_id`; a *placeholder* allocation has `person_id = null`. The schema carries a
  `resource_request_id` column for linking a placeholder to a hiring opening, but as of this audit no
  code in `pm` reads or writes it (see §2) — treat the placeholder-to-hire fill path as **not wired**,
  not merely undocumented.
- *(Health/financials/rates are not modeled — see §6.)*

### hiring
- **Requisition** — a hiring request against a `pm.account`; owns 1..N **Opening**s (one row of
  headcount each).
- **Candidate** (external, hiring-owned) / **Application** — a candidate's or person's application to a
  requisition. *Inv:* exactly one of `candidate_id`/`person_id` is set (boundary field `worker_id`);
  `superseded_by_application_id` self-FK models a transfer as a new application, not a mutation of the
  old one.
- **Opening** — one fillable seat; closes with a reason from the merged `hiring.reason` taxonomy
  (`kind ∈ {opening_close, rejection}`).

## 5. Allocation & demand — what's actually built

`pm.allocation.status` includes `'placeholder'` at the schema level, and both `pm.allocation` and
`hiring.opening` carry a `resource_request_id` column clearly intended to link an unfilled PM seat to a
hiring opening. **That linkage is not active**: only `hiring` touches the column today, `pm` never sets
or reads it, and no domain event carries it across the module boundary. A placeholder allocation today
is purely a `pm`-internal "unassigned seat" marker — it does not open a requisition, and filling a
requisition does not resolve a placeholder.

This is the single largest gap between what the schema anticipates and what the code does. It is not a
documented, deferred design decision — it is dead wiring. Closing it (or formally deferring it) belongs
to a PM/Hiring integration spec, not this reference doc; §9 records it as an open question so it isn't
lost.

## 6. Health/financials

Not modeled. There is no margin, RAG/health status, or rate cascade anywhere in `pm`, `people`, or
`hiring` as of this audit (`grep` for `margin`/`RAG`/`health`/`QCDP` across `pm`'s domain layer returns
nothing). Utilization is the one derived metric that exists, and it is simpler than a prior draft of
this doc claimed — see §7.

## 7. Utilization — what's actually built

- **`people` computes utilization itself**, directly from its own projection of `pm`'s allocation
  events (`people.worker_allocation_projection`, fed by `pm.allocation.*`) — see
  `packages/people/src/backend/domain/allocation-grid.ts`. There is no `pm.getUtilization()` RPC and no
  `pm`-side utilization computation; `pm` publishes allocation facts, `people` derives the metric.
- **No capacity ledger.** There is no effective-dated FTE/contracted-hours table anywhere. A person's
  capacity for utilization purposes is not modeled — the allocation-grid computation works off booked
  `planned_pct` only, spread at read time (not materialized), planned-only (no timesheet/actuals
  integration).
- **Leave is out of scope** for this codebase today — no `people.leave.*` events, no leave table.

## 8. Domain events — the integration contract

**Scope:** cross-context events only. Intra-module notification events (interview reminders, lifecycle
nudges) live in each module's own doc, not here.

**Naming:** `<module>.<aggregate>.<verb>`, thin payloads (ids + changed fields), idempotent on
`event_id`, per-aggregate ordering, via the `core.events` outbox. `people`'s human-aggregate events keep
the `worker` prefix (`people.worker.*`) — per DB-2, Worker remains the domain vocabulary even though the
storage is `person` + `employment_period`.

| Event | Producer | Consumers | Payload (thin) |
|---|---|---|---|
| `identity.user.created` | identity | people | `after: { user_id, tenant_id, email, name }` — people links to an existing person by email; does not create one |
| `identity.user.deactivated` / `.reactivated` | identity | people | user_id, tenant_id — syncs `people.user_projection.deactivated_at` |
| `people.worker.created` / `.updated` | people | pm | worker_id, person_id, tenant_id, full_name, work_email, job_title(, changed `fields` on update) — feeds `pm.person_projection` |
| `people.worker.terminated` / `.reinstated` | people | *(defined, no current subscriber)* | worker_id, person_id, tenant_id |
| `people.worker.user_linked` | people | *(defined, no current subscriber)* | worker_id, person_id, user_id, tenant_id — emitted by the `identity.user.created` link subscriber itself |
| `people.person.skill.added` / `.removed` / `.level.set` | people | *(embeddings refresh, intra-module)* | person_id, skill_id, tenant_id(, level) |
| `people.org_unit.created` | people | identity | org_unit_id, tenant_id, parent_id, name — feeds `identity.org_unit_projection` |
| `pm.account.created` / `.updated` | pm | people, hiring | account_id, tenant_id, name, am_worker_id(, fields) |
| `pm.account.recruiter.assigned` / `.unassigned` | pm | *(no current subscriber)* | account_id, tenant_id, recruiter_worker_id |
| `pm.project.created` / `.updated` | pm | people, hiring | project_id, tenant_id, account_id, `charter_id` (still present in the payload schema; = `project_id` post-DB-2, not a live FK), name(, fields) |
| `pm.project.access.changed` | pm | hiring | project_id, tenant_id, owner_worker_ids — lets hiring project "who manages this project" without a cross-module join |
| `pm.project.staffing_plan.changed` | pm | *(no current subscriber)* | project_id, tenant_id |
| `pm.charter.submitted` / `.pmo_signed_off` / `.approved` / `.rejected` / `.withdrawn` / `.updated` | pm | *(no current subscriber)* | charter_id (= project_id post-DB-2), tenant_id, account_id/project_id/reason/stage as applicable — kept as domain vocabulary even though `pm.charter` the table no longer exists (DB-2 §4.4) |
| `pm.allocation.created` / `.updated` / `.removed` | pm | people | allocation_id, project_id, worker_id, account_id, tenant_id, planned_pct/dates/bucket(, fields) — feeds `people.worker_allocation_projection` |
| `hiring.requisition.opened` / `.updated` / `.closed` | hiring | *(no current subscriber)* | requisition_id, tenant_id(, fields/reason) |
| `hiring.opening.opened` / `.closed` | hiring | *(no current subscriber)* | opening_id, requisition_id, tenant_id(, close_reason_id, hired_application_id) |
| `hiring.candidate.added` / `.updated` | hiring | *(no current subscriber)* | candidate_id, tenant_id(, fields) |
| `hiring.application.created` / `.updated` / `.stage_changed` / `.rejected` / `.transferred` | hiring | *(no current subscriber)* | application_id, requisition_id, tenant_id(, stage/status/reason/superseded_by) |
| `core.skill.renamed` | core (cross-cutting) | people, pm, hiring | skill_id, tenant_id, new_name — fans out through one shared factory (`makeSkillRenamedSubscriber`) to every module's cached `skill_name` column |

**Rows marked "no current subscriber"** are real, emitted events with zero consumers today — accurate
as of this audit, not a documentation gap. Some exist for future integration points (e.g.
`hiring.opening.closed` is a natural trigger for eventually resolving a `pm.allocation` placeholder);
others may simply be unused. Treat each as a genuine open question, not a broken contract.

### Canonical flow — what actually crosses module boundaries today

```
identity.user.created ──▶ people links user to existing person (by email) ──▶ people.worker.user_linked
people.worker.created/updated ──▶ pm.person_projection (name/title cache)
pm.account.*/project.* ──▶ people.account_projection/project_projection AND hiring.account_projection/project_projection (independent caches)
pm.allocation.* ──▶ people.worker_allocation_projection ──▶ people computes utilization (allocation-grid.ts)
core.skill.renamed ──▶ person_skill / candidate_skill / requisition_skill / staffing_plan_line_skill (cached skill_name)
```

Everything else in this doc's prior draft — placeholder-to-hire fulfillment, internal mobility,
promotion/movement tracking, effective-dated capacity — is **not** part of the current flow. It may be
worth building; it is not built.

## 9. Open questions (replaces the prior "Decisions" section)

The previous version of this document presented a resource-request fulfillment saga, internal-mobility
flow, and effective-dated capacity model as **resolved system design**. None of it exists in code. Rather
than re-assert unverified design, this section records what an implementer would actually need to
decide before building the demand → hire → allocation loop:

- **OQ-1 (demand → hire linkage):** `pm.allocation.resource_request_id` and
  `hiring.opening.resource_request_id` share a column but no code connects them. Decide: does `pm`
  create the placeholder and hand a `resource_request_id` to `hiring` on `pm.resource_request.opened`
  (an event that doesn't exist yet), or does `hiring` originate the id? Either way, someone must resolve
  a hire back onto the placeholder allocation.
- **OQ-2 (hire → person creation):** today, hiring a candidate does not create a `people.person`. Decide
  whether `hiring.application.stage_changed` (to `hired`) should emit a `hiring.candidate.hired` event
  that `people` subscribes to (creating a person, à la the prior draft), or whether person creation stays
  a manual admin step permanently.
- **OQ-3 (internal mobility):** there is no `application.kind = 'internal'` → `people` job-change flow.
  If internal mobility is in scope, it needs its own event contract; none of the prior draft's
  `people.movement.*` design survived contact with the implementation.
- **OQ-4 (capacity/leave):** no effective-dated capacity or leave model exists. `people`'s presence
  fields (`availability_status`, `ooo_until`) are the only capacity-adjacent data today, and they are not
  wired into utilization.

These belong in a dedicated People↔PM↔Hiring integration spec when the product need is concrete, not as
speculative design carried in a reference doc.

## Sources

This rewrite is grounded directly in the repository (`events.ts`, `schema.ts`, `subscribers/index.ts`
across `people`, `pm`, `hiring`, `identity`, current as of 2026-07-13), not external research. The prior
version's PSA/DDD literature review (Kantata, Float, Runn, Vernon, O-AA, Context Mapper) may still be
useful background reading for the open questions in §9, but is no longer cited as the basis for claims
about this codebase.
