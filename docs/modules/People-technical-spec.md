# Software Requirements Specification — People Module

| | |
|---|---|
| **Module** | `people` (HR / Workforce system-of-record) |
| **Companion product PRD** | [`People-PRD.md`](./People-PRD.md) |
| **Status** | Draft · 2026-06-18 |
| **Standard** | ISO/IEC/IEEE 29148 |
| **Audience** | Engineering |

> This is the engineering spec: it uses real schema, event, and permission identifiers. The plain
> product behavior lives in the companion PRD. Where the two disagree, the PRD owns *what*, this spec
> owns *how*. Supersedes the `people` portions of `docs/spike/` (now stale — see those banners).

---

## 1. Introduction

### 1.1 Purpose
Define the implementable requirements for `people` — the system-of-record for the employee (Worker), org/positions, skills, lifecycle, performance, headcount, and the read-models that drive RBAC visibility.

### 1.2 Scope
`people` owns the Worker aggregate and everything keyed to it. It **reads** project allocation/utilization from `pm`, **reads/writes leave through the timesheet system's API** (it does **not** own leave), receives a hired person from `hiring`, and scaffolds lifecycle boards in `planner`. No cross-schema foreign keys; cross-module consistency is event-driven via local read-model projections.

### 1.3 Definitions & acronyms
- **Worker** — the person's HR record; the `people` aggregate root. One **person identity** persists across re-hires.
- **Employment period** — one period of service for a person (hire → offboard). A person has 1..N periods.
- **Movement (job change)** — a typed change to the employment record (promotion / transfer / pay / org), HR-initiated or triggered by an approved internal-mobility selection in `hiring`.
- **Effective-dated** — history rows with `effective_from`/`effective_to`; the current row has null `effective_to`.
- **ACL read-model (`rm_*`)** — a local projection of another module's facts; the anti-corruption boundary.
- **RLS** — Postgres row-level security. **SoR** — system of record. **HITL** — human-in-the-loop approval.

### 1.4 Overview (plain words)
`people` keeps one trustworthy record per person and runs their journey from preboarding to alumni. It never duplicates a person on re-hire (it adds a period), never stores leave (the timesheet system does), and never authors allocations (`pm` does). Every write commits its domain event in the same transaction; every projection is idempotent and replayable.

---

## 2. Overall Description

### 2.1 Product perspective
A feature-tier module in the modular monolith. Depends on `core` (outbox/audit), `identity` (auth principal), `shared-storage` (document vault), `integrations` (MS365 provisioning + the **timesheet API**), and `planner` (lifecycle boards). Consumed by `pm`, `hiring`, `notifications`. Contributes agent tools via `/agent-tools`; never imports `agent`.

### 2.2 Product functions
P-C1 Worker record (incl. **re-hire / employment periods**) · P-C2 Org & positions · P-C3 Allocation read-model · P-C4 Workforce analytics · P-C5 Lifecycle stage · P-C6 Onboarding (planner-backed) · P-C7 Probation · P-C8 Movement (HR- or mobility-sourced) · P-C9 Offboarding (planner-backed) · P-C10 Performance · ~~P-C11 Leave~~ **→ timesheet integration (read-only model + request passthrough)** · P-C12 Headcount.

### 2.3 User characteristics
Four access tiers — Strategic (BOD/Admin/PMO/HR management), Account Manager, Team Lead/EM, Member — plus the MS365-sync system account. Visibility scope is derived from the `rm_allocation` projection, not a stored field.

### 2.4 Constraints
- `pgSchema('people')`, `schemaFilter: ['people']`; **no cross-schema FK**; no cross-module raw SQL.
- Multi-tenant: every table carries `tenant_id`; **Postgres RLS on `tenant_id`** is the backstop.
- State change + event row commit in **one transaction** via `core.emit()` inside `withEmit(session, …)`.
- Sensitive comp (`worker_compensation`) isolated for stricter grants/RLS; masking is defense-in-depth.
- Subscribers idempotent on `event_id`; per-aggregate ordering only; park-and-retry vs no-op per the global out-of-order policy.

### 2.5 Assumptions & dependencies
- **Timesheet system** exposes an API for leave balance read + request submit + availability (OQ-T1); until then, behind a stable interface returning "unavailable".
- **MS365/Teams user provisioning** is a new `integrations` capability (not built — stub behind the interface).
- `pm` emits `pm.assignment.*` and answers `pm.getUtilization(workerIds[], period)`.
- `hiring` emits `hiring.candidate.hired` (carrying a matched `person_id?` + `resource_request_id?`) and `hiring.mobility.approved`.

---

## 3. Specific Requirements

### 3.1 Functional requirements (→ PRD F-IDs)

**FR-1 Worker record & re-hire (F-WORK-1/2/3/4/7/9/10).**
- `onboardWorker`, `importWorkers` (bulk; per-row skip+report), `updateWorkerField`, `changeLifecycleStage`, directory queries.
- `createWorkerFromHire` consumes `hiring.candidate.hired`: if it carries a **matched `person_id`**, append a **new `employment_period`** to that person (re-hire) — never a new person; else create a new person + first period. Carry `resource_request_id` onto `people.worker.created` so `pm` fills the placeholder.
- `updateWorkerField` enforces `canEditField`: admin-only set `{grade, position(binding), salary, bank, tax}`; sensitive comp edits insert a new `worker_compensation` row (history preserved, never overwritten); capacity edits insert a new `worker_capacity` row (emits `people.worker.capacity_changed`). Account/project are **not** worker fields.
- Re-hire: `original_hire_date` immutable on the person; `seniority_date` defaults to the new period start, bridgeable per policy (OQ-12).
- **Cross-module identity:** the stable cross-module `worker_id` **is `person.id`** (unchanged across re-hires). `worker` is the current-state view of the person's **single open `employment_period`**; `rm_allocation`, `pm` assignments, and visibility are all keyed on `person.id`. A re-hire re-points `worker` to the new open period — role/department/grade/fte reset, identity/dob/gender persist — and the same command that inserts the new effective-dated rows refreshes the cached `grade`/`fte`.
- **Person-match (for `hiring`):** `matchPerson(identity|email|name+dob)` is exposed on the public surface. A unique strong-key (identity/email) match **auto-links**; an ambiguous / name-only / multi-match returns candidates for **recruiter confirmation (HITL), never auto-merge**; no match ⇒ new person. `hiring` calls this before emitting `hiring.candidate.hired`.
- **Skills (F-WORK-6):** `worker_skill.skill_id` FK-enforced against the `skill` catalog (a skill not in the catalog can't be added); `proficiency` CHECK 0–5; OQ-8 (self-declared vs manager-confirmed).

**FR-2 Org & positions (F-ORG-1/2/3).** `createOrgUnit`/`updateOrgUnit` (acyclic, domain-checked), `createPosition`/`updatePosition`, `assignPositionHolder`/`vacatePosition` (filled ⇒ exactly one holder), `getOrgChart` (derived from position→org-unit). Emits `people.position.opened`/`filled`.

**FR-3 Allocation read-model (F-ALLOC-1/2/3).** `projectAllocation` subscribes to `pm.assignment.created/changed/ended` → upserts `rm_allocation` (M:N, fractional); `ended` retracts. `getAllocations` (scoped), `getUtilization` reads live via `pm.getUtilization(...)` (no local utilization projection, no `utilization.updated` event); degrades gracefully if `pm` down. `getVisibilityScope` resolves AM/EM visibility from the allocation set.

**FR-4 Analytics (F-ANALYTICS-1/2).** `getWorkforceMetrics`, `getWorkforceDashboard` — role-scoped aggregation over the worker read-model + `rm_allocation` + live utilization; heavy aggregates may be materialized.

**FR-5 Lifecycle + planner (F-LIFE/F-ONB/F-OFF).** `startOnboardingCase`/`startOffboarding`/`completeOffboarding`; ensure planner group+plan+phase-buckets idempotently; `createTask` (employee card) + `addChecklistItem` per step. `projectLifecycleBoard` subscribes to `planner.task.*` / `planner.checklist_item.*` → recompute `lifecycle_case.progress/health`, advance stage on completion. `itHandoff` → `integrations`. Offboarding completion emits `people.worker.deactivated` (→ `pm` ends open allocations) and sets stage `alumni`.

**FR-6 Probation (F-PROB-1/2).** `getProbationCase`, `submitProbationReview` (EM/Lead input), `decideProbation` (HR decision: pass→active / extend→new date / fail→offboarding). Reuses the scorecard instrument.

**FR-7 Movement (F-MOVE-1/2/3).** `requestMovement` with **`source ∈ {hr_initiated, internal_mobility}`**; `advanceMovementStep` (HITL per step). Mobility-sourced movements are opened by `projectMobilityApproved` consuming `hiring.mobility.approved` **when it changes role/grade**. On final approval the change is persisted then **applied at `effective_date`** by `movement-apply` (position rebind / new `worker_compensation` row), `applied_at`-guarded once-only; emits `people.worker.movement_decided` then `people.worker.updated`.

**FR-8 Performance (F-PERF-1/2/3).** `openReviewCycle` (pins immutable `template_id`), `setGoals`, `updateGoalProgress`, `submitReview` (CORE mandatory, Evidence rule on 1/5, Action-Plan rule <4, maturity sub-assessment auto-fills one criterion; writes normalized `review_score` rows), `closeReviewCycle`. Probation reuses the instrument.

**FR-9 Leave — timesheet integration (replaces owned leave).** `getLeaveBalance(workerId)` and `submitLeaveRequest(...)` proxy the **timesheet API** (`integrations`); no leave tables, no leave events emitted by `people`. Availability for `pm` comes from the **timesheet system**, not from a `people.leave.*` event. Degrades to "unavailable" if the API is down.
- The **`on_leave` lifecycle value is a derived display sub-state** computed from the timesheet system's current-leave signal — **not** a People-owned stored transition (no command/event flips it; it overlays `active`).

**FR-10 Headcount (F-HEAD-1).** `planHeadcount`, `getHeadcountPlan` (planned vs filled positions); an open position is the demand unit a `hiring` requisition targets.

**FR-11 Cross-cutting.** Audit every command (`core.events`); sensitive-field masking in one serializer keyed on `canSeeSensitive`; **synchronous re-validation before serving comp** — the re-check queries **`pm`'s authoritative public surface** for that single worker's current allocation, **not** the lagging local `rm_allocation` (otherwise the D8 revocation window isn't actually closed).

**FR-12 Cross-account access grant (F-SEC-4).** `grantAccountAccess` / `revokeAccountAccess` (Strategic) write `account_access_grant`; `getVisibilityScope` **unions** allocation-derived accounts with active grants; grant/revoke are audited and emit `people.access.granted` / `people.access.revoked`.

**FR-13 Documents (F-DOC-1/2).** `uploadDocument` / `replaceDocument` (supersede chain) via `shared-storage`; missing-required derived by `document_requirement` LEFT JOIN `employee_document` (scoped tenant / employment_type); the `document-expiry-reminder` job emits `notifications` for documents nearing expiry (HR + owner).

### 3.2 External interface requirements
- **HTTP (Hono) `/api/people/*`** — employees, employees/import, employees/:id(+/status,/documents), org-units, positions, org, allocation, utilization, headcount, analytics/{metrics,dashboard}, lifecycle/*, movements(+/:id/advance), probation/*, performance/*, **leave/{balance,request}** (proxy). `GET /api/me` + `/api/me/enabled-modules` expose permissions/tile.
- **Inbound events:** `identity.user.created/updated`; `pm.assignment.created/changed/ended`; `pm.account.*`/`pm.project.*`; `planner.task.*`/`planner.checklist_item.*`; `hiring.candidate.hired`; `hiring.mobility.approved`.
- **Outbound calls:** `planner` public surface; `integrations` (MS365 provisioning, **timesheet API**); `shared-storage`; `pm.getUtilization(...)`.

### 3.3 Performance requirements
Directory search GIN-trigram-backed; analytics may be materialized; utilization is one batch call (no N+1); projection lag bounded by SLO (feeds the sensitive-read re-validation).

### 3.4 Software system attributes
Security (RLS + masking + sync re-validation), reliability (replayable projections), auditability (every command), tenancy isolation (RLS).

### 3.5 Other requirements
i18n: lifecycle/process content authored EN + VI (locale dimension on template/notes text — OQ-5).

---

## 4. Verification

### 4.1 Functional acceptance (→ PRD §10 QA)
Real-Postgres (testcontainers), failing test first. Cover: re-hire links to existing person + new period (QA-42); mobility move → movement against existing person (QA-43); pay edit preserves history (QA-4); position one-holder (QA-9); sensitive re-validation on allocation end (QA-8); leave proxy matches timesheet + no local store (QA-20); import skip+report (QA-5).

### 4.2 Access-control verification
Field policy (admin-only set) overrides the capability grant; visibility derived from `rm_allocation`; comp never served without a synchronous active-allocation check.

---

## Appendix A — Data model (`people` schema)

**Identity & employment**
- `person` *(stable identity across re-hires)* — `id`, `tenant_id`, `user_id uuid null` (identity link), `original_hire_date date`, `seniority_date date`. *Inv:* `original_hire_date` immutable.
- `employment_period` — `person_id` (FK), `seq`, `start_date`, `end_date date null`, `status`, `lifecycle_stage`, `employment_type`. *Inv:* **at most one open period per person** — enforced by a hand-written **partial unique index** `(person_id) WHERE end_date IS NULL` (Drizzle can't model it; lives alongside generated migrations). **Re-hire = a new period; never a new `person`.**
- `account_access_grant` — `grantee_user_id`, `account_id`, `granted_by`, `granted_at`, `revoked_at null`. Active grants are **unioned** into the AM visibility scope (F-SEC-4).
- `worker` *(current-state view of a person's open period; the directory/edit aggregate)* — `person_id` (FK), `full_name`, `work_email`, `role_title`, `department`, `grade` (cached), `fte` (cached), `location`, `gender`, `dob`, `phone`, `emergency_contact jsonb`, `profile_completed_at`, `version`, `deleted_at`. idx `(tenant_id, status)`, `(tenant_id, user_id)`, `(tenant_id, lifecycle_stage)`; GIN trigram `(full_name, work_email)`.

**Comp / capacity (effective-dated, isolated)**
- `worker_compensation` — `person_id` (FK), `effective_from`, `effective_to null`, `salary_amount numeric(14,2)`, `salary_currency`, `bank jsonb`, `tax jsonb`, `reason`, `by_user_id`. uniq `(person_id, effective_from)`; RLS-eligible.
- `worker_capacity` — `person_id` (FK), `effective_from`, `effective_to null`, `fte numeric`, `contracted_hours int`. uniq `(person_id, effective_from)`; insert emits `people.worker.capacity_changed`.

**Skills / org / history**
- `skill` (`name`,`category`, uniq `(tenant_id,name)`); `worker_skill` (`person_id`,`skill_id`,`proficiency smallint`,`years_experience`, pk `(person_id,skill_id)`).
- `org_unit` (`parent_id null`,`name`,`manager_position_id null`; acyclic domain check); `position` (`org_unit_id`,`role_title`,`grade`,`headcount_status open|filled`,`holder_worker_id null`; filled⇒one holder).
- `worker_history` (`person_id`,`at`,`action`,`field`,`from_val`,`to_val`,`by_user_id`).

**Lifecycle / movement / performance**
- `lifecycle_case` (`person_id`,`kind onboarding|offboarding`,`planner_plan_id`,`planner_task_id`,`stage`,`progress`,`health`,`sla_due_at`,**`leaver_type voluntary|involuntary null`**,**`held bool`**,**`prior_stage null`** (resume target on hold/cancel)); `lifecycle_template_step` (`template_id`,`step_key`,`phase`,`responsible_role`,`sla_hours`,`seq`).
- `probation_review` (`person_id`,`marker 1mo|2mo|confirmation`,`scorecard_review_id null`,`outcome pass|fail|extend|pending`,**`extension_until date null`**,`decided_at`).
- `movement_request` (`person_id`,`type promotion|transfer|pay`,**`source hr_initiated|internal_mobility`**,`to_position_id`,`to_grade`,`salary_from`,`salary_to`,`effective_date`,`status`,`applied_at null`); an **org/department move is a `transfer`** re-binding `to_position_id` (no separate `org` type). `movement_step` (`request_id`,`seq`,`name`,`status`,`approver_user_id`,`decided_at`).
- `scorecard_template`/`scorecard_criterion` (versioned, pinned); `review_cycle`/`goal`/`review`/`review_score` (normalized).

**Headcount / documents**
- `headcount_plan` (`org_unit_id`,`period`,`planned_count`,`notes`).
- `employee_document` (`person_id`,`doc_type`,`storage_key`,`expiry_date null`,`supersedes_id null`,`uploaded_by`,`at`); `document_requirement` (`scope`,`doc_type`,`mandatory`).

**Read-models (ACL)** — `rm_allocation` (from `pm`; drives RBAC visibility), `rm_account_project` (from `pm`).

**~~Removed~~** — `leave_type`, `leave_ledger`, `leave_balance`, `leave_request` are **deleted** (leave owned by the timesheet system). No leave tables in `people`.

> Migration note: drop the four leave tables and the `people.leave.*` emit path; split `worker` into `person` + `employment_period` + current-state `worker` (the spike's single `worker` row becomes person seq=1); add `movement_request.source`. Generated migrations via `pnpm --filter @seta/people db:generate`.

## Appendix B — Domain event catalog

**Emitted** (consumer in parens): `people.worker.created` (carries `resource_request_id?`) → *pm, hiring*; `.updated` → *pm, hiring*; `.capacity_changed` (`effective_from`,`fte`,`contracted_hours`) → *pm*; `.lifecycle_changed` → *notifications*; `.movement_requested`/`.movement_decided` → *notifications*; `.onboarded` → *notifications*; `.deactivated` → *pm, hiring* (pm ends open allocations; hiring seeds the **alumni** segment); `people.position.opened`/`.filled` → *pm, hiring*; `people.performance.cycle_opened`/`.cycle_closed` → *notifications*; `people.access.granted`/`.revoked` → *(audit)*.
**Removed:** ~~`people.leave.requested`~~, ~~`people.leave.approved`~~ — availability now sourced from the timesheet system by `pm` directly.
**Consumed:** `identity.user.*`; `pm.assignment.*`, `pm.account.*`/`pm.project.*`; `planner.task.*`/`planner.checklist_item.*`; **`hiring.candidate.hired`** (`candidate_id`, `target position_id`, `resource_request_id`, **`person_id?`** → match ⇒ new `employment_period` on existing person, else new person); **`hiring.mobility.approved`** (`worker_id`, `project_id`, `placeholder_allocation_id`, `pct`, **`to_position_id?`**, **`to_grade?`** → open `movement_request(source=internal_mobility)` when role/grade changes).

## Appendix C — State machines
- **Lifecycle:** preboarding→onboarding→(probation)→active→offboarding→alumni; probation pass→active / extend→probation / fail→offboarding; **alumni→preboarding (re-hire = new employment_period)**. `on_leave` is a **derived display overlay on `active`** (from the timesheet signal), not a stored transition. Offboarding **hold/cancel → `prior_stage`** (resume later).
- **Movement:** request→leader_review(promotion only)→manager_approval→hr_approval→effective (transfer terminal=completed); any step→rejected; applied at `effective_date`.

## Appendix D — Permission matrix
`PEOPLE_PERMISSIONS`: `people.employee.read|write`, `people.employee.sensitive.read`, `people.employee.admin_field.write`, `people.org.read|manage`, `people.position.manage`, `people.headcount.plan`, `people.allocation.read`, `people.analytics.read`, `people.lifecycle.read|manage`, `people.movement.request|approve`, `people.probation.review|decide`, `people.performance.manage|review`, `people.leave.read` (proxy view only — **no** `people.leave.approve`; approvals live in the timesheet system), `people.access.grant` (Strategic — F-SEC-4). Role→permission maps for the four tiers; account/project scoping derived from `rm_allocation` **unioned with active `account_access_grant`** rows.

## Appendix E — Error codes
`VALIDATION`, `FORBIDDEN` (field policy / scope), `CONFLICT` (stale `version`), `INVALID_TRANSITION` (lifecycle/movement), `UPSTREAM_UNAVAILABLE` (pm utilization / timesheet leave).

## Appendix F — Open questions / decisions
- **OQ-12** continuous-service bridging on re-hire (policy). **OQ-T1** timesheet leave API contract + availability source for `pm`. **OQ-5** i18n locale dimension. Decisions: leave→timesheet (reverses spike R2); person→employment-periods (re-hire); movement `source` discriminator; mobility feeds movement.

## Appendix G — Cross-module ripple (PM)
- **Availability:** `pm` must read worker availability from the **timesheet system** (via `integrations`), **not** from a `people.leave.approved` event (removed). Utilization still = Σ allocation ÷ capacity; capacity still from `people.worker.capacity_changed`.
- **Mobility:** `hiring.mobility.approved` now has **two consumers** — `pm` (fills the placeholder) **and** `people` (opens a `movement_request` with `source=internal_mobility` when role/grade changes).
- **Re-hire:** `hiring.candidate.hired` carries a matched `person_id?`; `pm` placeholder-fill logic is unchanged (keyed on `resource_request_id`).
