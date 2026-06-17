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

> **Model follows well-known systems (Workday + Kantata-PSA), not bespoke.** `people` is the workforce
> system-of-record (Worker + Position + Supervisory-Org); PM owns Account/Project/allocation/rates;
> identity owns auth. See [benchmarking.md](./benchmarking.md).

### HR core & org

| ID | Capability | What it does |
|---|---|---|
| **P-C1** | **Employee (Worker) record** | SoR for the rich HR record: create (onboarding), **bulk import**, read (profile), edit with **field-level rights** (overview §4), status changes. Stores personal/employment data, grade, comp-relevant attrs (level/title/tenure), bank, tax, contact, DoB, **first-class skills** (taxonomy + proficiency + experience), **documents** (vault), **employment history**. On create: links/reserves `identity` `user_id`, requests **MS365 provisioning**, emits `people.worker.created`. **Account/project is NOT a field here** — membership = the set of PM allocations (P-C3). |
| **P-C2** | **Org structure & Positions** *(R1)* | Workday-style three objects: **Supervisory-Org / org-units** (reporting hierarchy + manager), **Position** (an internal company seat bound to a job profile — role+grade, org-unit, headcount status open/filled, held-by worker; persists across people), and the Worker (P-C1) who *holds* a position. Reporting line derived from position→org-unit. Movement/lifecycle change the position binding, not the worker identity. |
| **P-C3** | **Resource allocation (read-model)** | A **read-model** projected from the **PM module**: each worker's **concurrent, fractional** allocations across **multiple projects/accounts** (M:N — one person can be on 2 accounts or 2 projects at once), utilization% = Σ allocations, bucket (billable/internal/bench/leave), rollups. `people` projects, never authors. Drives RBAC account/project scoping. |
| **P-C4** | **Workforce analytics** | Read/aggregation: headcount, utilization, attrition, bench, health, seniority, skills coverage/gaps, tenure, critical-role coverage, hiring/attrition forecast, turnover, exits. **Role-scoped** (org-wide / account / team / self). |
| **P-C12** | **Headcount & workforce planning** *(R4)* | Budgeted/planned **positions** per org-unit/period vs filled; feeds `hiring` demand (open positions → requisitions). Strategic-tier. Built on the Position object (P-C2). |

### Lifecycle (folded into `people`)

| ID | Capability | What it does |
|---|---|---|
| **P-C5** | **Lifecycle stage tracking** | Every employee carries a lifecycle **stage**: Preboarding → Onboarding → Probation → Active → Offboarding → Alumni. Directory + dashboard filtered by stage; **SLA/attention** flags for overdue items. |
| **P-C6** | **Onboarding process** | Multi-step onboarding checklist across phases (pre-onboard → onboarding day → post-onboard). Each step has a **responsible role** (HR / IT / Team Leader / C&B), procedures, **audit checkpoints**, and **IT handoff** (ticket/account provisioning). **Board is `planner`-backed** (plan/buckets/tasks); `people` owns the template + a thin per-new-hire case and projects progress/health. |
| **P-C7** | **Probation management** | Probation reviews (e.g. after 1 and 2 months); **pass/fail decision**; review forms; outcome transitions the employee to Active or triggers exit. |
| **P-C8** | **Movement** | Internal **transfer / promotion**: changes to role, grade, department, account, or project; recorded in employment history; may re-trigger org-chart and allocation changes. |
| **P-C9** | **Offboarding process** | Multi-stage offboarding (receive notice → prepare → execute → complete) with **owner lanes** (HR / IT / C&B / manager); de-provisioning handoff; transition to **Alumni**. **Board is `planner`-backed** (same pattern as P-C6). |
### People operations

| ID | Capability | What it does |
|---|---|---|
| **P-C10** | **Performance** *(R3)* | **Primary (prototype-backed):** the weighted **scorecard instrument** — pillars/criteria/weights, **CORE** flags, **AMMI** 6-dim sub-model, **Evidence rule** (score 1/5), **Action-Plan rule** (<4, from an action catalog), period selector, **"My Scorecard"** (self) + **"Team Evaluation"** (TL), prev-period delta. Criteria/weights/CORE/AMMI/action-catalog are **first-class reference config**, not opaque jsonb. **Additive (R3, not prototype-backed):** wrap scorecards in recurring **review cycles** + **Goals/OKRs** that consume PM signals. Probation (P-C7) reuses the instrument. |
| **P-C11** | **Time-off / Leave** *(R2)* | Leave **types**, **balances**, **accrual policy**, **requests + approvals**. Emits leave events (availability) consumed by PM/timesheet. **Attendance/timesheets are NOT here** — they stay in the external timesheet system (pulled via `integrations` now; a future platform module). |

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
| **P-C2** Org & positions | R/W org-units + positions; assign/move | R account-scoped | R team subtree | R own position |
| **P-C3** Resource allocation | R all (read-model) | R account-scoped | R own team | R self |
| **P-C4** Workforce analytics | R org-wide | R account-scoped | R team-scoped | R self only |
| **P-C12** Headcount planning | R/W | R account-scoped (R) | — | — |
| **P-C5** Lifecycle stage | R/W all transitions | R account-scoped | R managed members | R self |
| **P-C6** Onboarding | R/W; owns HR steps | R account-scoped (view new joiners) | W own steps (TL prep/confirm); R case | R own onboarding tasks |
| **P-C7** Probation | R/W decision (HR) | R account-scoped | **W review input**; R | R own outcome |
| **P-C8** Movement | R/W (approve transfer/promotion) | R/Propose for own account | Propose for managed members | R own history |
| **P-C9** Offboarding | R/W; owns HR/coordination | R account-scoped | W own lane tasks | R own (limited) |
| **P-C10** Performance | R/W cycles, goals, all reviews | R account-scoped | **W reviews + goals for managed members**; R | R/W own goals + self-review; R own reviews |
| **P-C11** Leave | R/W all; approve | R account-scoped; approve own account | approve managed members' requests; R | R/W own requests; R own balance |

Notes:
- **Admin-only fields** (`manager, account, project, grade, salary, bank, tax`) are writable only by
  Strategic, regardless of capability row above (field policy overrides the W column).
- **AM cross-account** requires an explicit grant; default is own account only.
- **Account/project scoping derives from the PM allocation set** (M:N): an AM/EM sees a worker if the
  worker has a current allocation to a project/account they manage — a worker on 2 accounts is visible
  to both AMs.
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
| `onboardWorker` | C | Strategic | name (req), email (auto-derived if blank), role, dept, grade, type, **position?** (P-C2), CV file? | name required; email unique; grade/position admin-only; CV → document vault. Initial **project allocation is a pm concern** (`pm.assignment.*`), not a worker field. | creates record `stage=Preboarding/Onboarding`; reserves/links `user_id`; **requests MS365 provisioning** (`integrations`); emits `people.worker.created`; opens onboarding case (P-C6); audit |
| `importEmployees` | C | Strategic | Excel/CSV per template (Employee ID, Full name, Email, Role, Dept, Grade, Account, Project, Direct manager, Join date) | validate required columns per row; **skip + report** invalid rows; manager/account/project stay admin-controlled post-import | bulk-create records; one `people.worker.created` per row; import summary; audit |
| `updateWorkerField` | C | Strategic / self | field, value, `effective_from?` | `canEditField`: admin-only set (`grade, salary, bank, tax`) → Strategic only; position binding via P-C2; others → self or admin; no-op if unchanged. **Account/project are NOT fields** (pm allocations). **Sensitive comp (`salary/bank/tax`) is NOT a worker column** — it lives in the effective-dated `worker_compensation` table; editing comp inserts a *new* effective-dated row (preserving salary history), never an in-place overwrite. **Capacity (`fte/contracted_hours`) is likewise effective-dated** (`worker_capacity`). | append to **employment history**; emits `people.worker.updated`; **emits `people.worker.capacity_changed` (carrying `effective_from`) when a new `worker_capacity` row is added**; MS365 sync on relevant change; audit |
| `changeEmployeeStatus` | C | Strategic | status (`active/leave/probation/onboard/offboard`) | valid transition only (see state machine) | emits `people.worker.updated` / `people.worker.lifecycle_changed`; audit |
| `getEmployee` / `listEmployees` | Q | all (scoped) | filters: status, account, search; view list/grid | scope via visibility rules; **sensitive fields masked** unless admin or owner | — |

**Employee status / lifecycle state machine:**
`Preboarding → Onboarding → (Probation) → Active → Offboarding → Alumni`. `Active ⇄ On-leave`.
Probation outcome → `Active` (pass) or `Offboarding` (fail). Transitions emit
`people.worker.lifecycle_changed`.

### P-C2 — Org structure & Positions *(R1, Workday-style)*

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `createOrgUnit` / `updateOrgUnit` | C | Strategic | supervisory-org node; parent, manager (a position/worker) | org tree change; audit |
| `createPosition` / `updatePosition` | C | Strategic | seat bound to a job profile (role+grade), org-unit, headcount budget | open/filled state; audit |
| `assignPositionHolder` / `vacatePosition` | C | Strategic | bind/unbind a worker to a position (on hire / movement / offboard) | `people.worker.updated` (position change); reporting line recompute; audit |
| `getOrgChart` | Q | scoped | reporting tree derived from **position → org-unit** (not manager-field-only); filter by org-unit/account/project | — |

### P-C3 — Resource allocation (read-model, M:N)

| Op | Type | Actor | Notes |
|---|---|---|---|
| `getAllocations` | Q | scoped | a worker's **concurrent fractional** allocations across **multiple projects/accounts** (from the `rm_allocation` read-model); bucket + rollups; searchable, paged |
| `getUtilization` | Q | scoped | utilization is **pm-authoritative** — read via pm's batch query `pm.getUtilization(workerIds[], period)` (no event, no local projection); degrades gracefully if pm is down |
| (projection updater) | — | — | subscribes to **`pm.assignment.created/changed/ended`** (not utilization); upserts the M:N allocation rows; idempotent on `event_id`; replayable; **no human write path** in `people` |
| `getVisibilityScope` | Q | internal | resolves which workers an AM/EM may see, from the allocation set (worker on 2 accounts → visible to both) |

### P-C4 — Workforce analytics

| Op | Type | Actor | Notes |
|---|---|---|---|
| `getWorkforceMetrics` | Q | scoped | headcount, util, attrition, bench, health, seniority, stack, tenure, skill-gap, critical-roles, forecast, turnover, exits |
| `getWorkforceDashboard` | Q | scoped | role-scoped composition (org-wide / account / team / self) over the above |

> Read/aggregation only; sourced from the employee read-model + `rm_allocation` projection;
> **utilization is read from pm via the batch query `pm.getUtilization(workerIds[], period)`** (no
> local projection), and the dashboard degrades gracefully (stale/unknown) if pm is unavailable. Heavy
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
| `startOnboardingCase` | C | Strategic (auto on `onboardEmployee`) | instantiate from the active onboarding **template** | ensure account/project planner **group** + shared onboarding **plan + phase buckets** (idempotent); `createTask` = the employee card in bucket 1 (assignee/label = first responsible role); `addChecklistItem` per template step; store case `{user_id, plan_id, task_id}`; emits `people.worker.lifecycle_changed`; audit |
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
| `decideProbation` | C | Strategic (HR) | outcome `pass/fail` | `pass → Active`, `fail → Offboarding`; emits `people.worker.lifecycle_changed`; audit |

### P-C8 — Movement (transfer / promotion / salary)

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `requestMovement` | C | EM/Lead or AM (propose) | type (`Promotion/Transfer/Salary`), from/to (role+grade or account, and/or salary), effective date | creates request; **multi-step approval workflow** starts; audit |
| `advanceMovementStep` | C | the step's approver | **HITL approve-&-advance** per step | advance step; on final step **persist the approved change** and emit `people.worker.movement_decided`. The change is **applied at `effective_date`** by the `movement-apply` job (future-dated promotions) — rebind to new position (P-C2) / new `worker_compensation` row / grade — guarded by `applied_at` (once-only), then `people.worker.updated`; audit. (Account/project moves are PM re-allocations, not movement.) |

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
| `startOffboarding` | C | Strategic | reason, last day | `stage=Offboarding`; ensure group + shared offboarding plan + buckets (idempotent); `createTask` = leaver card; `addChecklistItem` per step; store case `{user_id, plan_id, task_id}`; emits `people.worker.lifecycle_changed`; audit |
| `getOffboardingCase` | Q | scoped | case + planner card state | progress/health from bucket position + checklist |
| *(projection)* | — | — | subscribes to `planner.task.*` / `planner.checklist_item.*` | recompute progress; de-provisioning handoff (`integrations`) on the relevant step |
| `completeOffboarding` | C | Strategic | card complete | `stage=Alumni`; emits `people.worker.lifecycle_changed`; audit |

### P-C10 — Performance (cycles + Goals/OKRs + reviews) *(R3)*

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `openReviewCycle` | C | Strategic (HRM) | period, **`template_id`** (a versioned `scorecard_template` + its `scorecard_criterion` rows), participants/scope | creates cycle pinning the immutable `template_id`; enrolls participants; notifies; audit |
| `setGoals` | C | self + manager | Goals/OKRs per employee within a cycle (objective, key results, weight) | persist; audit |
| `updateGoalProgress` | C | self / manager | progress updates; may ingest **PM delivery/utilization signals** | persist; audit |
| `submitReview` | C | self / manager / peer | the **scorecard instrument** (pinned `template_id`): weighted criteria by pillar; **CORE mandatory** (EXT optional for juniors); **Evidence Rule** (1/5 needs evidence); **Action-Plan rule** (<4 needs a Top action); AMMI 0–4 auto-fills one criterion | persist per-criterion scores as **`review_score` rows** (not `review.scores jsonb`) so org-wide criterion analytics + prev-period delta are queryable; compute total + verdict; audit |
| `closeReviewCycle` | C | Strategic | all required reviews in | finalize; calibrate; emit `people.performance.cycle_closed`; audit |
| `getReview` / `getCycle` | Q | scoped | cycle, goals, reviews (own / managed / all) | — |

> Probation (P-C7) reuses the scorecard **instrument** as a one-off lifecycle review, outside the
> periodic cycle. *(OQ-8: the instrument is a **versioned `scorecard_template` + `scorecard_criterion`**;
> a review/probation/interview pins an immutable `template_id` and stores normalized per-criterion
> scores. `hiring` reuses it via projected `rm_scorecard_template`/`rm_scorecard_criterion` — OQ-H3.)*

### P-C11 — Time-off / Leave *(R2)*

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `requestLeave` | C | self | type, dates; checks balance (= Σ `leave_ledger` delta) | pending request; **DB `EXCLUDE` constraint enforces no-overlap** with approved leave; notifies approver; audit |
| `decideLeave` | C | manager / Strategic | approve/reject | on approve: **append a negative `leave_ledger` row** (idempotent on `source_event_id`), set availability; emit `people.leave.approved` (PM/timesheet consume); audit |
| `getLeaveBalance` / `listLeaveRequests` | Q | scoped | balance = Σ `leave_ledger` delta per type (or its `leave_balance` cache); request history | — |
| (accrual job) | — | — | policy-based accrual (e.g. monthly); **not** derived from attendance | **append a positive `leave_ledger` row** (no in-place counter mutation) |

> Attendance/worked-hours are **not** modeled here — pulled from the external **timesheet system**
> via `integrations` (future platform module). `people` owns leave only.

### P-C12 — Headcount & workforce planning *(R4)*

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `planHeadcount` | C | Strategic | budgeted/planned **positions** per org-unit/period | persist plan; audit |
| `getHeadcountPlan` | Q | scoped | planned vs filled (open positions); feeds `hiring` demand | — |

> Built on the Position object (P-C2): an **open position** is the unit of headcount demand that a
> `hiring` requisition targets.

### Cross-cutting operations

- **Audit** — every `C` above writes an audit entry via `core.events`.
- **Masking** — every `Q` returning comp/bank/tax masks them unless caller is admin or record owner.
- **Document vault** — CV/contract/identity-doc upload + expiry tracking attaches to the employee
  record *(OQ-6: `shared-storage`)*. **Missing-required-doc attention is derived** — a
  `document_requirement` policy table LEFT JOIN `employee_document` (a `required` flag on existing rows
  can't represent an *absent* doc).

---

## Step 4 — Module & function linking

How `people` integrates with the rest of the platform. All writes commit their event in the same
transaction via `withEmit` + `core.emit()`; all subscribers are idempotent on `event_id`.

### 4.1 Dependency summary

| Direction | Module | Mechanism | What |
|---|---|---|---|
| consumes | `identity` | events | `user.created` / `user.updated` → project identity facts (name, email, status) into `people` read model; resolve `user_id` link |
| consumes | **PM module** | events | `pm.assignment.created/changed/ended` → Resource Allocation read-model (P-C3); utilization read live via pm batch query (no event) |
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
| `people.worker.created` | `onboardEmployee`, `importEmployees`, (hiring `candidate.hired`) | notifications, projections, **pm** | `user_id`, name, dept, account, stage, **`resource_request_id?`** (set when origin is an external hire → pm fills the placeholder at create time) |
| `people.worker.updated` | `updateEmployeeField`, movement apply | notifications, projections | `user_id`, changed fields |
| `people.worker.lifecycle_changed` | status/stage transitions, probation decision, offboarding | notifications | `user_id`, from-stage, to-stage |
| `people.worker.movement_requested` | `requestMovement` | notifications (approver) | move id, type, approver-of-current-step |
| `people.worker.movement_decided` | `advanceMovementStep` (final) | notifications | move id, outcome, effective date |
| `people.position.opened` / `people.position.filled` | `createPosition` / `assignPositionHolder` | notifications, hiring (demand) | position id, org-unit, job profile, holder |
| `people.leave.requested` / `people.leave.approved` | `requestLeave` / `decideLeave` | notifications, **PM/timesheet** (availability) | user_id, type, dates |
| `people.performance.cycle_opened` / `people.performance.cycle_closed` | `openReviewCycle` / `closeReviewCycle` | notifications | cycle id, scope, period |
| `people.worker.onboarded` | onboarding complete | **notifications** | worker_id — onboarding complete → **lifecycle/stage only**; the placeholder was already filled at `people.worker.created` |
| `people.worker.capacity_changed` | `updateWorker` when `fte`/`contracted_hours` change (new effective-dated row) | **pm** | worker_id, **effective_from**, fte, contracted_hours (utilization denominator) |
| `people.worker.deactivated` | offboarding complete (→ Alumni) | **pm**, hiring | worker_id → pm ends open allocations |

> Event naming is canonical `<module>.<aggregate>.<verb>` (see [`ddd-design.md`](./ddd-design.md) §8).
> people's aggregate is **Worker**, so the wire prefix is `people.worker.*` — the capability/table reads
> "Employee (Worker)" but there is **no `employee.*` event**.

### 4.3 Inbound subscribers `people` registers (via `register.ts`)

| Source event | Handler | Effect (idempotent) |
|---|---|---|
| `identity.user.created` / `.updated` | `projectIdentityUser` | upsert identity facts into `people` employee read model; reconcile `user_id` link |
| `pm.assignment.created/changed/ended` | `projectAllocation` | upsert **M:N** allocation rows (worker × project, fractional); `ended` retracts; refresh visibility scope (P-C3). **No `utilization.*` subscription** — there is no `utilization.updated` event; people reads utilization via pm's batch query (P-C4) |
| timesheet system (external, via `integrations`) | `projectWorkedHours` | optional read-model of worked-hours for analytics; not authored in `people` |
| `planner.task.created/completed/moved` | `projectLifecycleBoard` | if task's plan is a tracked case → recompute progress/health; on completion advance stage (P-C6/P-C9) |
| `hiring.candidate.hired` | `createEmployeeFromHire` | create employee record (carrying `resource_request_id` onto `people.worker.created` so pm fills the placeholder) + open onboarding case (P-C1/P-C6) |

> All projections are **idempotent on `event_id` and replayable/rebuildable from `core.events`**
> (offset + idempotent upsert) — a projector bug or a newly-added projection is recovered by replay,
> never hand-patched. Critical because the allocation projection drives RBAC visibility.

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
| **PPL-2 Employee (Worker) record** | P-C1 (`onboardEmployee`, `importEmployees`, `updateEmployeeField`, `changeEmployeeStatus`, directory queries) + **first-class skills** + **document vault** (`shared-storage`) | employee CRUD, skills, directory, docs; `people.worker.created/updated`; HTTP routes; agent tools | PPL-1 | shared-storage |
| **PPL-2b Org & Positions** *(R1)* | P-C2 (org-units/supervisory-org, Position objects, assign/vacate holder) | Workday-style org model; reporting from position→org; `position.*` events | PPL-2 | — |
| **PPL-3 Lifecycle core + planner integration** | P-C5 (stage model, case entity `{user_id, plan_id, task_id}`, directory/dashboard, SLA/attention) + **planner scaffolding helper** (ensure group+plan+buckets idempotent; card per employee via `createTask`; steps via `addChecklistItem`) + **`planner.task.*` / `planner.checklist_item.*` projection** (progress/health) | lifecycle spine + reusable planner-board integration | PPL-1, PPL-2 | planner public surface + events (exist) |
| **PPL-4 Onboarding** | P-C6 (`startOnboardingCase` from template, projection-driven stage advance, `itHandoff`) | onboarding template + board + flow; new-joiner notifications | PPL-3 | **INT-MS365** (provisioning), notifications |
| **PPL-5 Offboarding** | P-C9 (`startOffboarding`, projection, `completeOffboarding` → Alumni) | offboarding template + board + de-provision handoff | PPL-3 | **INT-MS365** (de-provision), notifications |
| **PPL-6 Movement** | P-C8 (`requestMovement`, `advanceMovementStep` approval workflow; people-owned state machine) | movement requests + multi-step HITL approval; `employee.movement_*` events | PPL-2 | notifications |
| **PPL-7 Probation** | P-C7 (`getProbationCase`, `submitProbationReview`, `decideProbation` → stage) | probation reviews + decision → Active/Offboarding | PPL-3 | (PPL-8 scorecard, soft) |
| **PPL-8 Performance** *(R3)* | P-C10 (review **cycles**, **Goals/OKRs**, reviews via the scorecard instrument with CORE/Evidence/Action-Plan + AMMI rules) | performance entity set + rules; consumes PM signals | PPL-2 | PM delivery/utilization signals (soft) |
| **PPL-9 Allocation read-model (M:N)** | P-C3 (PM event subscriber `projectAllocation`, fractional multi-allocation, `getAllocations`/`getUtilization`, visibility-scope resolver) | allocation/utilization read-model + RBAC scope | PPL-1 | **PM allocation events** (define jointly) |
| **PPL-10 Workforce analytics** | P-C4 (`getWorkforceMetrics`, role-scoped `getWorkforceDashboard`; materialize heavy aggregates) | analytics surface | PPL-2, PPL-9 | — |
| **PPL-11 Time-off / Leave** *(R2)* | P-C11 (`requestLeave`, `decideLeave`, balances, accrual job) | leave model + approvals; `leave.*` events | PPL-2 | — |
| **PPL-12 Headcount planning** *(R4)* | P-C12 (`planHeadcount`, `getHeadcountPlan`) | headcount plan on positions; feeds hiring demand | PPL-2b | — |

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

> Governed by [`ddd-design.md`](./ddd-design.md): `people` is the upstream **Worker Published-Language**
> context; pm/hiring consume via ACL. Covers all 12 capabilities.

### 6.0 Resolved OQs

- **OQ-1 (skills):** `people` is SoR for the **rich HR skill set** (name, category, proficiency 1–4,
  years experience). `identity.user_profile.skills` left **as-is**; not coupled.
- **OQ-4 (org) → R1:** **explicit Workday-style model** — `org_unit` (supervisory hierarchy) +
  `position` (seat: job profile, org-unit, headcount status, holder) + Worker holds a position.
  Reporting tree derived from position→org-unit. (Supersedes the earlier manager-derived-only plan.)
- **OQ-6 (document vault):** `shared-storage` (S3); `employee_document` = metadata + storage key +
  expiry; signed URLs; expiry-reminder job (6.4).
- **OQ-8 (scorecards):** `people`-owned. The instrument is a **versioned `scorecard_template` +
  `scorecard_criterion`** (pillars/criteria/weights/CORE/AMMI = reference config); a review pins an
  immutable `template_id` and stores **normalized `review_score` rows** + AMMI, **inside a ReviewCycle**
  (P-C10) — re-weighting a pillar never shifts historical totals. The scoring engine is reused by
  probation (P-C7) and exposed for hiring interview scoring via projection (OQ-H3).
- **Capacity (DDD §7):** `people` owns Worker **capacity** (FTE/contracted hours), **effective-dated**
  (`worker_capacity`), + leave; emits `people.worker.capacity_changed` (with `effective_from`) /
  `people.leave.approved`; pm computes utilization (people reads it via pm's batch query, no event).
  `people` does **not** project pm allocation as authoritative — it keeps a read-model only (P-C3).

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
| `/api/people/org-units` · `/positions` | GET/POST/PATCH | org-units + positions (P-C2); assign/vacate holder |
| `/api/people/org` | GET | `getOrgChart` (position→org-unit derived) |
| `/api/people/allocation` · `/utilization` | GET | read-model queries (M:N, from pm) |
| `/api/people/headcount` | GET/POST | `getHeadcountPlan` / `planHeadcount` (P-C12) |
| `/api/people/analytics/{metrics,dashboard}` | GET | workforce analytics |
| `/api/people/lifecycle/cases` · `/dashboard` | GET | lifecycle directory/dashboard |
| `/api/people/lifecycle/onboarding` · `/offboarding` | POST | `startOnboardingCase` / `startOffboarding` |
| `/api/people/lifecycle/cases/:id` | GET | case + planner card state |
| `/api/people/movements` · `/:id/advance` | GET/POST | `requestMovement` / `advanceMovementStep` (HITL) |
| `/api/people/probation/:id` · `/decide` | GET/POST | review / `decideProbation` |
| `/api/people/performance/cycles` · `/:id` | GET/POST | `openReviewCycle` / `closeReviewCycle` / `getCycle` (P-C10) |
| `/api/people/performance/goals` · `/reviews` | POST | `setGoals` / `updateGoalProgress` / `submitReview` |
| `/api/people/leave` · `/leave/:id/decide` · `/leave/balance` | GET/POST | `requestLeave` / `decideLeave` / `getLeaveBalance` (P-C11) |

`GET /api/me` permission set + `GET /api/me/enabled-modules` expose `people` permissions/tile to the
suite shell (frontend contract, overview §3).

### 6.3 RBAC contributions (`./rbac`)

- **Permissions** (`PEOPLE_PERMISSIONS`), e.g. `people.employee.read|write`,
  `people.employee.sensitive.read`, `people.employee.admin_field.write`, `people.org.read|manage`,
  `people.position.manage`, `people.headcount.plan`, `people.allocation.read`, `people.analytics.read`,
  `people.lifecycle.read|manage`, `people.movement.request|approve`, `people.probation.review|decide`,
  `people.performance.manage|review`, `people.leave.request|approve`.
- **Role→permission maps** for the four tiers (overview §4). **Account/project scoping derives from
  the pm allocation read-model** (a worker is visible to an AM/EM if allocated to a project/account
  they manage — DDD §7); field-level + sensitive masking enforced centrally in the worker serializer.

### 6.4 Workflows & jobs (graphile-worker)

| Job | Trigger | Does |
|---|---|---|
| `lifecycle-sla-sweep` | cron | flag overdue onboarding/offboarding cards (attention list); notify owners |
| `probation-review-reminder` | cron | due at 1- and 2-month marks → notify EM/Lead + HR |
| `document-expiry-reminder` | cron | docs nearing expiry → notify HR + owner |
| `ms365-provision` / `ms365-deprovision` | on `people.worker.created` / offboard complete | call `integrations` (stub until INT-MS365) |
| `movement-approval-route` | on `requestMovement` / step advance | notify the current step's approver |
| `movement-apply` | cron / on `effective_date` | apply approved-but-future-dated movements (position rebind / new `worker_compensation` row); `applied_at`-guarded once-only |
| `leave-accrual` | cron | policy-based accrual → **appends a `leave_ledger` row** (P-C11; not from attendance), idempotent on the accrual `source_event_id` |
| `review-cycle-reminder` | cron | nudge pending goals/reviews in an open cycle (P-C10) |

### 6.5 Projections (read models, idempotent on `event_id`)

| Projection | Source | Read model |
|---|---|---|
| identity facts | `identity.user.*` | worker ↔ user_id link, name/email/login status |
| allocation (ACL) | **pm** `assignment.created/changed/ended` | per-worker M:N allocations (P-C3); `ended` retracts; **drives RBAC visibility scope**; replayable. (Utilization is read live via pm's batch query, not projected.) |
| account/project lookup (ACL) | **pm** `account.*`/`project.*` | id→name, account↔project, AM owner |
| lifecycle board | `planner.task.*` / `planner.checklist_item.*` | case progress/health; stage-advance trigger |

### 6.6 Composition root (`register.ts`)

Registers: subscribers (6.5 + `hiring.candidate.hired`), RBAC contributions, agent tools, HTTP
routers, and job handlers — wired at the `apps/server` / `apps/worker` composition root (storage,
Mastra runtime, mailer injected), consistent with existing modules. The module receives its own
Drizzle client; it never hands it to another module.

### 6.7 Cross-cutting enforcement

- **Masking** is applied in a single employee serializer keyed on `canSeeSensitive(caller, employee)`
  — every query path funnels through it so comp/bank/tax cannot leak. Comp lives in the isolated
  `worker_compensation` table (RLS-eligible), so masking is defense-in-depth, not the only barrier.
- **Sensitive-read staleness (D8):** account/project visibility rides the **async `rm_allocation`
  projection**, which lags on **revocation** (an allocation `ended` event) — a window where an AM/EM
  could still see a worker's `salary/bank/tax`. Mitigate by **bounding the projection lag with an SLO
  AND re-validating an active allocation synchronously** before serving sensitive comp, so eventual
  consistency never over-exposes.
- **Tenant isolation** — every table carries `tenant_id`; every query filters by it; **Postgres RLS on
  `tenant_id`** (platform-wide, recommended) backstops a missed `WHERE`.
- **Audit** — every command writes a `core.events` audit entry in the same transaction as its domain
  event.

---

## Step 7 — Database design

→ **[`db-design.md`](./db-design.md)** — the `people` schema section (worker, **worker_compensation**,
**worker_capacity**, skill/worker_skill, org_unit, position, lifecycle_case + **lifecycle_template_step**,
probation/movement, **scorecard_template/scorecard_criterion**, review_cycle/goal/review + **review_score**,
leave_type/**leave_ledger**/leave_balance (cache)/leave_request, headcount_plan, worker_history,
employee_document + **document_requirement**) + the `rm_allocation`/`rm_account_project` ACL
read-models. Designed in one pass with `hiring` + `pm` so projections line up.
