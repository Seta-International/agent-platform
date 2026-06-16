# `people` module — backend discovery

> Status: **Discovery (in progress)**. Backend only (see [`overview.md`](./overview.md) §3 for why).
> Built in the 7 steps from `overview.md` §7, with a review gate between each. Steps 3–7 are appended
> as we go.

The `people` module is the system-of-record for the **employee/HR record** and the **employee
lifecycle**. It links to `identity` by `user_id` (no cross-schema FK; event-driven — `overview.md`
§5).

---

## Step 1 — Capability inventory

Capabilities are backend domains, each tied to the product features it backs.

### HR core

| ID | Capability | What it does |
|---|---|---|
| **P-C1** | **Employee record management** | System-of-record for the rich HR record: create (onboarding), **bulk import**, read (profile), edit with **field-level rights** (§ overview §4), status changes. Stores employment data, org placement, grade, comp, bank, tax, contact, DoB, skills, tech, **documents** (CV/contracts in the document vault), and **employment history**. On create: links/reserves `identity` `user_id`, triggers **MS365 provisioning** (via `integrations`), and emits `employee.created`. |
| **P-C2** | **Org structure** | Reporting lines derived from each employee's **direct manager**; org chart across the org's hierarchies (e.g. Operations / Delivery). Auto-updates when a manager is assigned. *(OQ-4: manager-derived vs explicit org-unit hierarchy.)* |
| **P-C3** | **Resource allocation** | A **read-model** of each employee's allocation bucket (**billable / internal / bench / on-leave**) and **utilization %**; per-department rollups; allocation + utilization listings (searchable, paged). **Sourced from the Project Management module via events** (assignment/utilization) — `people` projects, it does not author allocation. |
| **P-C4** | **Workforce analytics** | Read/aggregation surface for headcount, utilization, attrition, bench, workforce health, seniority mix, tech-stack distribution, tenure bands, skill gaps, critical-role coverage, hiring/attrition forecast, turnover by group, and exit reasons. **Role-scoped** views (org-wide / account / team / self). |

### Lifecycle (folded into `people`)

| ID | Capability | What it does |
|---|---|---|
| **P-C5** | **Lifecycle stage tracking** | Every employee carries a lifecycle **stage**: Preboarding → Onboarding → Probation → Active → Offboarding → Alumni. Directory + dashboard filtered by stage; **SLA/attention** flags for overdue items. |
| **P-C6** | **Onboarding process** | Multi-step onboarding checklist across phases (pre-onboard → onboarding day → post-onboard). Each step has a **responsible role** (HR / IT / Team Leader / C&B), procedures, **audit checkpoints**, and **IT handoff** (ticket/account provisioning). **Board is `planner`-backed** (plan/buckets/tasks); `people` owns the template + a thin per-new-hire case and projects progress/health. |
| **P-C7** | **Probation management** | Probation reviews (e.g. after 1 and 2 months); **pass/fail decision**; review forms; outcome transitions the employee to Active or triggers exit. |
| **P-C8** | **Movement** | Internal **transfer / promotion**: changes to role, grade, department, account, or project; recorded in employment history; may re-trigger org-chart and allocation changes. |
| **P-C9** | **Offboarding process** | Multi-stage offboarding (receive notice → prepare → execute → complete) with **owner lanes** (HR / IT / C&B / manager); de-provisioning handoff; transition to **Alumni**. **Board is `planner`-backed** (same pattern as P-C6). |
| **P-C10** | **Evaluation & scorecards** | Member evaluation by EM/Team Lead and probation/periodic review records. *(OQ-8: exact scorecard model; may be shared with `hiring`.)* |

### Cross-cutting (within `people`)

- **Audit trail** — every mutation writes an audit entry (via `core.events`).
- **Sensitive-field masking** — salary / bank / tax masked for non-admin / non-owner reads.
- **Document vault** — CVs, contracts, identity docs; expiry tracking. *(OQ-6: `shared-storage`/S3.)*

---

## Step 2 — Role breakdown (capability × tier)

Tiers/personas and field policy are defined in `overview.md` §4. `R` = read, `W` = write.
Scoping: **Strategic** = all; **AM** = own + granted accounts; **EM/Lead** = self + managed members;
**Member** = self.

| Capability | Strategic (BOD/Admin/PMO/HRM) | Account Manager | EM / Team Lead | Member |
|---|---|---|---|---|
| **P-C1** Employee record | R/W all incl. admin-only + sensitive fields | R account-scoped (sensitive masked); request grants | R managed members (sensitive masked) | R/W **self** non-admin fields; self-complete on first login |
| **P-C2** Org structure | R/W (assign managers) | R account-scoped | R team subtree | R own position |
| **P-C3** Resource allocation | R all (read-model) | R account-scoped | R own team | R self |
| **P-C4** Workforce analytics | R org-wide | R account-scoped | R team-scoped | R self only |
| **P-C5** Lifecycle stage | R/W all transitions | R account-scoped | R managed members | R self |
| **P-C6** Onboarding | R/W; owns HR steps | R account-scoped (view new joiners) | W own steps (TL prep/confirm); R case | R own onboarding tasks |
| **P-C7** Probation | R/W decision (HR) | R account-scoped | **W review input**; R | R own outcome |
| **P-C8** Movement | R/W (approve transfer/promotion) | R/Propose for own account | Propose for managed members | R own history |
| **P-C9** Offboarding | R/W; owns HR/coordination | R account-scoped | W own lane tasks | R own (limited) |
| **P-C10** Evaluation | R/W all | R account-scoped | **W evaluate managed members**; R | R own evaluations |

Notes:
- **Admin-only fields** (`manager, account, project, grade, salary, bank, tax`) are writable only by
  Strategic, regardless of capability row above (field policy overrides the W column).
- **AM cross-account** requires an explicit grant; default is own account only.
- "Propose" = creates a request/draft that a Strategic role (or the relevant approver) confirms —
  these are the **HITL/approval points** detailed in Step 3.

---

## Open questions owned by this module

Carried from `overview.md` §8: **OQ-1** (person-fact split incl. `skills`), **OQ-2** (Account/Project
as `people` entities vs projections), **OQ-4** (org-chart source), **OQ-6** (document storage),
**OQ-8** (scorecard model). Resolved in Steps 6–7. (**OQ-3** resolved — allocation is a read-model
fed by the Project Management module.)

---

## Step 3 — Domain operations (use cases)

Each operation is a command (`C`) or query (`Q`) the module's public surface exposes. RBAC is
re-checked at the callee; field-level policy (overview §4) applies on top. Writes that originate from
the agent are **HITL-gated** (approval card before commit); writes from a permitted human user with
direct authority commit directly. State changes commit their domain event in the same transaction
(`withEmit`).

### P-C1 — Employee record management

| Op | Type | Actor | Inputs | Rules / validation | Effects |
|---|---|---|---|---|---|
| `onboardEmployee` | C | Strategic | name (req), email (auto-derived if blank), role, dept, grade, type, account?, project?, manager?, CV file? | name required; email unique; account/project/manager are admin-only; CV → document vault | creates record `stage=Preboarding/Onboarding`; reserves/links `user_id`; **requests MS365 provisioning** (`integrations`); emits `employee.created`; opens onboarding case (P-C6); audit |
| `importEmployees` | C | Strategic | Excel/CSV per template (Employee ID, Full name, Email, Role, Dept, Grade, Account, Project, Direct manager, Join date) | validate required columns per row; **skip + report** invalid rows; manager/account/project stay admin-controlled post-import | bulk-create records; one `employee.created` per row; import summary; audit |
| `updateEmployeeField` | C | Strategic / self | field, value | `canEditField`: admin-only set (`manager, account, project, grade, salary, bank, tax`) → Strategic only; others → self or admin; no-op if unchanged | append to **employment history**; emits `employee.updated`; if `manager/account/project` changed → triggers org-chart recompute (P-C2) + MS365 sync; audit |
| `changeEmployeeStatus` | C | Strategic | status (`active/leave/probation/onboard/offboard`) | valid transition only (see state machine) | emits `employee.updated` / `employee.lifecycle_changed`; audit |
| `getEmployee` / `listEmployees` | Q | all (scoped) | filters: status, account, search; view list/grid | scope via visibility rules; **sensitive fields masked** unless admin or owner | — |

**Employee status / lifecycle state machine:**
`Preboarding → Onboarding → (Probation) → Active → Offboarding → Alumni`. `Active ⇄ On-leave`.
Probation outcome → `Active` (pass) or `Offboarding` (fail). Transitions emit
`employee.lifecycle_changed`.

### P-C2 — Org structure

| Op | Type | Actor | Notes |
|---|---|---|---|
| `getOrgChart` | Q | all (scoped) | reporting tree derived from each employee's **direct manager**; filter by company/account/project level |
| (manager assignment) | C | Strategic | via `updateEmployeeField('manager')` — recomputes the subtree; *(OQ-4: pure derivation vs persisted org-unit)* |

### P-C3 — Resource allocation (read-model)

| Op | Type | Actor | Notes |
|---|---|---|---|
| `getAllocation` / `getUtilization` | Q | scoped | per-employee bucket (billable/internal/bench/leave) + utilization%; per-dept rollups; searchable, paged |
| (projection updater) | — | — | subscribes to **PM module** assignment/utilization events; idempotent on `event_id`; no human write path in `people` |

### P-C4 — Workforce analytics

| Op | Type | Actor | Notes |
|---|---|---|---|
| `getWorkforceMetrics` | Q | scoped | headcount, util, attrition, bench, health, seniority, stack, tenure, skill-gap, critical-roles, forecast, turnover, exits |
| `getWorkforceDashboard` | Q | scoped | role-scoped composition (org-wide / account / team / self) over the above |

> Read/aggregation only; sourced from the employee read-model + allocation projection. Heavy
> aggregations may be materialized (Step 6/7).

### P-C5 — Lifecycle stage tracking

| Op | Type | Actor | Notes |
|---|---|---|---|
| `listLifecycleCases` | Q | scoped | filter by stage; SLA/attention flags (overdue tasks) |
| `getLifecycleDashboard` | Q | scoped | counts per stage, attention list |

### P-C6 — Onboarding process *(planner-backed board)*

The onboarding **kanban board is owned by `planner`** (OQ-9 resolved): **account/project → planner
`group`**; **one shared onboarding plan per group**; **each employee is a card (task)** moving across
**phase buckets** (pre-onboard → day → post-onboard); the **per-step checklist = planner checklist
items** on the card. `people` owns the **process template** and a thin **case** record
(`employee user_id` + planner `task_id`/`plan_id` + derived progress/health/stage). Only
**onboarding + offboarding** are planner-backed; **movement** (P-C8) and **probation** (P-C7) remain
people-owned workflows.

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `startOnboardingCase` | C | Strategic (auto on `onboardEmployee`) | instantiate from the active onboarding **template** | ensure account/project planner **group** + shared onboarding **plan + phase buckets** (idempotent); `createTask` = the employee card in bucket 1 (assignee/label = first responsible role); `addChecklistItem` per template step; store case `{user_id, plan_id, task_id}`; emits `employee.lifecycle_changed`; audit |
| `getOnboardingCase` | Q | scoped | reads case + planner card state (`getTask`/`listChecklistItems`) | progress + health (On track / At risk / Blocked / Complete) from bucket position + checklist completion |
| *(projection)* | — | — | subscribes to `planner.task.*` (moved/completed) + `planner.checklist_item.*` | recompute case progress + health; when card reaches final bucket / completes → advance stage (→ Probation/Active); audit |
| `itHandoff` | C | HR→IT | the IT-provisioning checklist item / step | `integrations` ticket / account provisioning; audit |

> Card-level actions (move across buckets, complete, block, assign, tick checklist items) are
> **planner operations**, surfaced in the Planner app / embedded board. `people` does not duplicate a
> task model — it scaffolds the card and projects its state.

### P-C7 — Probation management

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `getProbationCase` | Q | scoped | objectives + scores, review schedule (e.g. 1- and 2-month) | — |
| `submitProbationReview` | C | EM/Lead (input), HR (decision) | review windows; evidence on extreme scores (see P-C10 rules) | records review; audit |
| `decideProbation` | C | Strategic (HR) | outcome `pass/fail` | `pass → Active`, `fail → Offboarding`; emits `employee.lifecycle_changed`; audit |

### P-C8 — Movement (transfer / promotion / salary)

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `requestMovement` | C | EM/Lead or AM (propose) | type (`Promotion/Transfer/Salary`), from/to (role+grade or account, and/or salary), effective date | creates request; **multi-step approval workflow** starts; audit |
| `advanceMovementStep` | C | the step's approver | **HITL approve-&-advance** per step | advance step; on final step apply changes to employee (grade/account/role/salary via admin-only fields) + `employee.updated`; audit |

**Movement approval workflow (state machine):**
`Request → Leader review → Manager approval → HR approval → Effective` (Transfer terminal =
`Completed`). Status = first non-done step. Each approval is an explicit confirmation (HITL when
agent-driven).

### P-C9 — Offboarding process *(planner-backed board)*

Same pattern as P-C6: per account/project planner **group**, **one shared offboarding plan**, **card
per leaver** across stage buckets (receive → prepare → execute → complete), per-step checklist items
(owner lanes HR/IT/C&B/manager). `people` owns the template + case record.

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `startOffboarding` | C | Strategic | reason, last day | `stage=Offboarding`; ensure group + shared offboarding plan + buckets (idempotent); `createTask` = leaver card; `addChecklistItem` per step; store case `{user_id, plan_id, task_id}`; emits `employee.lifecycle_changed`; audit |
| `getOffboardingCase` | Q | scoped | case + planner card state | progress/health from bucket position + checklist |
| *(projection)* | — | — | subscribes to `planner.task.*` / `planner.checklist_item.*` | recompute progress; de-provisioning handoff (`integrations`) on the relevant step |
| `completeOffboarding` | C | Strategic | card complete | `stage=Alumni`; emits `employee.lifecycle_changed`; audit |

### P-C10 — Evaluation & scorecards

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `getScorecard` | Q | scoped | by employee + period; prefill from previous period | — |
| `saveEvaluation` | C | EM/Lead | weighted criteria by pillar; **CORE mandatory** (EXT optional for juniors); **Evidence Rule** (score 1 or 5 needs evidence); **Action-Plan rule** (any score <4 needs a Top action); AMMI 0–4 dims auto-fill one criterion | compute total + verdict; persist per period; audit |

> *(OQ-8: scorecard pillar/criteria + AMMI model is its own entity set — detailed in Steps 6–7;
> may be shared with `hiring` candidate scoring.)*

### Cross-cutting operations

- **Audit** — every `C` above writes an audit entry via `core.events`.
- **Masking** — every `Q` returning comp/bank/tax masks them unless caller is admin or record owner.
- **Document vault** — CV/contract/identity-doc upload + expiry tracking attaches to the employee
  record *(OQ-6: `shared-storage`)*.

---

## Step 4 — Module & function linking

How `people` integrates with the rest of the platform. All writes commit their event in the same
transaction via `withEmit` + `core.emit()`; all subscribers are idempotent on `event_id`.

### 4.1 Dependency summary

| Direction | Module | Mechanism | What |
|---|---|---|---|
| consumes | `identity` | events | `user.created` / `user.updated` → project identity facts (name, email, status) into `people` read model; resolve `user_id` link |
| consumes | **PM module** | events | assignment / utilization → Resource Allocation read-model (P-C3) |
| consumes | `planner` | events | `planner.task.*` (created/completed/moved) → recompute onboarding/offboarding case progress + health; advance lifecycle stage on board completion |
| calls | `planner` | public surface | `createGroup` (per account/project) / `createPlan` (shared) / `createBucket` (phases) / `createTask` (employee card) / `addChecklistItem` (steps) / `assignTask` / `applyLabel`; `getTask` / `listChecklistItems` to read state |
| calls | `integrations` | public surface / event | **MS365 user provisioning** on hire + **de-provisioning** on offboard *(NEW capability — see 4.5)*; planner-board → MS365 Planner sync is **already automatic** in `integrations` |
| calls | `shared-storage` | library | document vault: CV / contract / identity-doc upload + signed URLs *(OQ-6)* |
| emits | `notifications` | events | consumes `employee.*` to drive the bell + emails (new joiner, stage change, movement approval needed, doc expiry) |
| contributes | `agent` | `/agent-tools` | read tools + HITL-gated write tools (4.4) |
| writes | `core` | `core.events` | every command emits a domain event + audit entry |

`people` **never** imports feature modules directly except through their public surface / `/events` /
`/contracts`. It does **not** import `agent` (engine-only rule). No cross-schema FK to `identity`,
`planner`, or PM.

### 4.2 Events emitted by `people`

| Event | Emitted by op(s) | Primary consumers | Payload (key fields) |
|---|---|---|---|
| `employee.created` | `onboardEmployee`, `importEmployees`, (hiring `candidate.hired`) | notifications, projections | `user_id`, name, dept, account, stage |
| `employee.updated` | `updateEmployeeField`, movement apply | notifications, projections | `user_id`, changed fields |
| `employee.lifecycle_changed` | status/stage transitions, probation decision, offboarding | notifications | `user_id`, from-stage, to-stage |
| `employee.movement_requested` | `requestMovement` | notifications (approver) | move id, type, approver-of-current-step |
| `employee.movement_decided` | `advanceMovementStep` (final) | notifications | move id, outcome, effective date |

### 4.3 Inbound subscribers `people` registers (via `register.ts`)

| Source event | Handler | Effect (idempotent) |
|---|---|---|
| `identity.user.created` / `.updated` | `projectIdentityUser` | upsert identity facts into `people` employee read model; reconcile `user_id` link |
| PM `assignment.*` / `utilization.*` | `projectAllocation` | upsert allocation read-model row (P-C3) |
| `planner.task.created/completed/moved` | `projectLifecycleBoard` | if task's plan is a tracked case → recompute progress/health; on completion advance stage (P-C6/P-C9) |
| `hiring.candidate.hired` | `createEmployeeFromHire` | create employee record + open onboarding case (P-C1/P-C6) |

### 4.4 Agent tools `people` contributes (`/agent-tools`)

- **Read** (execute directly): `getEmployee`, `listEmployees`, `getOrgChart`, `getAllocation`,
  `getWorkforceMetrics`, `listLifecycleCases`, `getScorecard`.
- **Write** (`needsApproval: true` — HITL card): `onboardEmployee`, `updateEmployeeField`,
  `changeEmployeeStatus`, `requestMovement`, `advanceMovementStep`, `startOffboarding`,
  `decideProbation`, `saveEvaluation`.
- These back the "Super Century AI" **People Agent**; the agent reads state and drafts changes that a
  human approves before commit (overview §3).

### 4.5 Notable dependency gaps / assumptions

- **MS365 user provisioning is NOT yet a public capability** of `integrations` (it currently does
  MS365 *Planner* sync + mail transport, not user-account creation). On-hire Teams/MS365 user
  provisioning and on-offboard de-provisioning must be **added to `integrations`** (its own slice) —
  `people` will call it or emit an event it consumes. Tracked as a cross-module dependency for Step 5
  WBS. Until it lands, on-hire provisioning is a no-op stub behind the same interface.
- **Planner-board → MS365 Planner sync is already automatic** in `integrations`, so lifecycle boards
  surface in MS365 with no extra `people` work (a benefit of the planner-backed design).

### 4.6 Dependency graph

```
identity ──user.*──▶ people ──employee.*──▶ notifications
   PM    ──alloc.*──▶ people
planner ──task.*──▶ people ──createPlan/Task──▶ planner ──(auto)──▶ integrations(MS365 Planner)
 hiring ─candidate.hired─▶ people ──provision/deprovision──▶ integrations(MS365 user) [NEW]
                          people ──upload──▶ shared-storage (doc vault)
                          people ──/agent-tools──▶ agent (People Agent, HITL writes)
```

---

## Step 5 — WBS (buildable slices)

Each slice is a future spec → plan → PR. **Tests against real Postgres (testcontainers), failing
test first.** Agent tools (read + HITL write) for a slice's operations ship **within that slice**, not
separately. `dep` = internal slice dependency; `ext` = cross-module/external dependency (stub behind
a stable interface until it lands).

| Slice | Scope (capabilities/ops) | Delivers | dep | ext |
|---|---|---|---|---|
| **PPL-1 Foundation** | module scaffold (`pnpm gen module people`), `people` pgSchema + `schemaFilter`, RBAC inventory (`PEOPLE_PERMISSIONS`/role maps), `withEmit`/event plumbing, audit, **identity projection** (`user.created/updated` subscriber + employee read-model base), field-level policy + sensitive-field masking helpers | the module spine | — | identity events (exist) |
| **PPL-2 Employee management** | P-C1 (`onboardEmployee`, `importEmployees`, `updateEmployeeField`, `changeEmployeeStatus`, directory queries) + P-C2 org chart (manager-derived) + **document vault** (`shared-storage`) | employee CRUD, directory, org chart, docs; `employee.created/updated` events; HTTP routes; agent tools | PPL-1 | shared-storage |
| **PPL-3 Lifecycle core + planner integration** | P-C5 (stage model, case entity `{user_id, plan_id, task_id}`, directory/dashboard, SLA/attention) + **planner scaffolding helper** (ensure group+plan+buckets idempotent; card per employee via `createTask`; steps via `addChecklistItem`) + **`planner.task.*` / `planner.checklist_item.*` projection** (progress/health) | lifecycle spine + reusable planner-board integration | PPL-1, PPL-2 | planner public surface + events (exist) |
| **PPL-4 Onboarding** | P-C6 (`startOnboardingCase` from template, projection-driven stage advance, `itHandoff`) | onboarding template + board + flow; new-joiner notifications | PPL-3 | **INT-MS365** (provisioning), notifications |
| **PPL-5 Offboarding** | P-C9 (`startOffboarding`, projection, `completeOffboarding` → Alumni) | offboarding template + board + de-provision handoff | PPL-3 | **INT-MS365** (de-provision), notifications |
| **PPL-6 Movement** | P-C8 (`requestMovement`, `advanceMovementStep` approval workflow; people-owned state machine) | movement requests + multi-step HITL approval; `employee.movement_*` events | PPL-2 | notifications |
| **PPL-7 Probation** | P-C7 (`getProbationCase`, `submitProbationReview`, `decideProbation` → stage) | probation reviews + decision → Active/Offboarding | PPL-3 | (PPL-8 scorecard, soft) |
| **PPL-8 Evaluation & scorecards** | P-C10 (`saveEvaluation` with CORE/Evidence/Action-Plan rules + AMMI, `getScorecard`) | scorecard entity set + rules | PPL-2 | — |
| **PPL-9 Allocation read-model** | P-C3 (PM event subscriber `projectAllocation`, `getAllocation`/`getUtilization`) | allocation/utilization read-model | PPL-1 | **PM allocation events** (define jointly) |
| **PPL-10 Workforce analytics** | P-C4 (`getWorkforceMetrics`, role-scoped `getWorkforceDashboard`; materialize heavy aggregates) | analytics surface | PPL-2, PPL-9 | — |

### Cross-module slice (separate, parallel — not in `people`)

| Slice | Module | Scope | Needed by |
|---|---|---|---|
| **INT-MS365** | `integrations` | MS365/Teams **user provisioning + de-provisioning** public capability (new; currently only Planner-sync + mail) | PPL-4, PPL-5 (stubbed until ready) |

### Critical path & parallelism

```
PPL-1 ─┬─▶ PPL-2 ─┬─▶ PPL-3 ─┬─▶ PPL-4   (needs INT-MS365)
       │          │          └─▶ PPL-5   (needs INT-MS365)
       │          ├─▶ PPL-6
       │          ├─▶ PPL-7  ◀── PPL-8 (soft)
       │          ├─▶ PPL-8
       │          └─▶ PPL-10 ◀── PPL-9
       └─▶ PPL-9  (needs PM events)
INT-MS365 runs in parallel from the start (own module).
```

- **MVP HR core** = PPL-1 → PPL-2 (employees, org, docs) — usable on its own.
- **Lifecycle MVP** = + PPL-3 → PPL-4/PPL-5 (onboarding/offboarding boards).
- PPL-6/7/8 (movement/probation/evaluation) and PPL-9/10 (allocation/analytics) are independent
  branches that can be sequenced by priority.
- **External gating:** PPL-4/5 are functionally complete without INT-MS365 (provisioning stubbed);
  PPL-9 needs the PM module emitting allocation events (define the contract jointly, stub a consumer).

---

## Step 6 — System design

### 6.0 Remaining OQ resolutions

- **OQ-1 (skills):** `people` is SoR for the **rich HR skill set** (name, category, proficiency 1–4,
  years experience) on the employee record. `identity.user_profile.skills` (flat string array) is
  left **as-is** for the existing availability/staffing path; not coupled. If staffing later wants HR
  skills it reads `people`'s surface. No change to `identity`.
- **OQ-4 (org chart):** **manager-derived** — reporting tree is a recursive walk over
  `employee.manager_id` within the caller's visibility scope, plus a `department` field for grouping.
  **No** separate org-unit hierarchy table now (deferred; revisit only if a non-manager org structure
  is required).
- **OQ-6 (document vault):** `shared-storage` (S3). An `employee_document` row holds metadata +
  storage key + optional expiry; downloads via signed URLs; an expiry-reminder job (6.4).
- **OQ-8 (scorecards):** a `people`-owned entity set (Step 7). Pillars/criteria/weights + AMMI
  dimensions are **reference config**; an evaluation is a scorecard header + per-criterion scores +
  AMMI assessment. Candidate scoring in `hiring` may reuse the scoring engine later (not coupled now).

### 6.1 Internal layout (mirrors existing modules)

```
packages/people/
  src/
    index.ts                      # public surface (domain fns, types)
    events.ts | events/index.ts   # event names + payload types  (./events)
    rbac.ts                       # PEOPLE_PERMISSIONS, role maps  (./rbac)
    contracts.ts                  # cross-module DTOs              (./contracts)
    agent-tools.ts                # tool registry                  (./agent-tools)
    register.ts                   # composition-root wiring        (./register)
    backend/
      db/{schema.ts, pg-schema.ts, index.ts}   # pgSchema('people'), schemaFilter:['people']
      domain/*.ts                 # one file per command/query (withEmit on writes)
      projections/*.ts            # identity, allocation, lifecycle-board, account/project lookup
      lifecycle/{templates.ts, planner-board.ts, projection.ts}
      scorecard/{rules.ts, compute.ts}
      http/*.ts                   # Hono routers                  (./http)
      jobs/*.ts                   # graphile-worker handlers
      agent-tools/register.ts
  drizzle.config.ts               # schemaFilter: ['people']
```

### 6.2 Public surface & HTTP API

Domain functions from Step 3 are exported via `index.ts` (RBAC re-checked in each). HTTP (Hono)
mounts under `/api/people`:

| Route | Method | Op |
|---|---|---|
| `/api/people/employees` | GET / POST | `listEmployees` / `onboardEmployee` |
| `/api/people/employees/import` | POST | `importEmployees` (xlsx/csv) |
| `/api/people/employees/:id` | GET / PATCH | `getEmployee` / `updateEmployeeField` |
| `/api/people/employees/:id/status` | POST | `changeEmployeeStatus` |
| `/api/people/employees/:id/documents` | GET / POST | doc vault list / upload (signed URL) |
| `/api/people/org` | GET | `getOrgChart` |
| `/api/people/allocation` · `/utilization` | GET | read-model queries |
| `/api/people/analytics/{metrics,dashboard}` | GET | workforce analytics |
| `/api/people/lifecycle/cases` · `/dashboard` | GET | lifecycle directory/dashboard |
| `/api/people/lifecycle/onboarding` · `/offboarding` | POST | `startOnboardingCase` / `startOffboarding` |
| `/api/people/lifecycle/cases/:id` | GET | case + planner card state |
| `/api/people/movements` | GET / POST | list / `requestMovement` |
| `/api/people/movements/:id/advance` | POST | `advanceMovementStep` (HITL) |
| `/api/people/probation/:id` · `/decide` | GET / POST | review / `decideProbation` |
| `/api/people/evaluations` · `/:id` | POST / GET | `saveEvaluation` / `getScorecard` |

`GET /api/me` permission set + `GET /api/me/enabled-modules` expose `people` permissions/tile to the
suite shell (frontend contract, overview §3).

### 6.3 RBAC contributions (`./rbac`)

- **Permissions** (`PEOPLE_PERMISSIONS`), e.g. `people.employee.read|write`,
  `people.employee.sensitive.read`, `people.employee.admin_field.write`, `people.org.read`,
  `people.allocation.read`, `people.analytics.read`, `people.lifecycle.read|manage`,
  `people.movement.request|approve`, `people.probation.review|decide`, `people.evaluation.write`.
- **Role→permission maps** for the four tiers (overview §4). Scoping (account/project/self) is
  enforced in the domain layer using the employee's `account_id`/`project_id`/`manager_id` and the
  caller's grants; field-level + sensitive masking enforced centrally in the employee serializer.

### 6.4 Workflows & jobs (graphile-worker)

| Job | Trigger | Does |
|---|---|---|
| `lifecycle-sla-sweep` | cron | flag overdue onboarding/offboarding cards (attention list); notify owners |
| `probation-review-reminder` | cron | due at 1- and 2-month marks → notify EM/Lead + HR |
| `document-expiry-reminder` | cron | docs nearing expiry → notify HR + owner |
| `ms365-provision` / `ms365-deprovision` | on `employee.created` / offboard complete | call `integrations` (stub until INT-MS365) |
| `movement-approval-route` | on `requestMovement` / step advance | notify the current step's approver |

### 6.5 Projections (read models, idempotent on `event_id`)

| Projection | Source | Read model |
|---|---|---|
| identity facts | `identity.user.*` | employee ↔ user_id link, name/email/login status |
| allocation | **PM** assignment/utilization events | per-employee bucket + utilization (P-C3) |
| account/project lookup | **PM** account/project events | id→name, account↔project, AM owner (for scoping/display) |
| lifecycle board | `planner.task.*` / `planner.checklist_item.*` | case progress/health; stage-advance trigger |

### 6.6 Composition root (`register.ts`)

Registers: subscribers (6.5 + `hiring.candidate.hired`), RBAC contributions, agent tools, HTTP
routers, and job handlers — wired at the `apps/server` / `apps/worker` composition root (storage,
Mastra runtime, mailer injected), consistent with existing modules. The module receives its own
Drizzle client; it never hands it to another module.

### 6.7 Cross-cutting enforcement

- **Masking** is applied in a single employee serializer keyed on `canSeeSensitive(caller, employee)`
  — every query path funnels through it so comp/bank/tax cannot leak.
- **Tenant isolation** — every table carries `tenant_id`; every query filters by it.
- **Audit** — every command writes a `core.events` audit entry in the same transaction as its domain
  event.

*(Step 7 appended after review.)*
