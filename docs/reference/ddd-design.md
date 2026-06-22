# People / Hiring / PM — DDD context map & integration contracts

> The integration backbone for the three modules: bounded contexts, the cross-cutting Worker concept,
> aggregate roots + invariants, and domain events as the data-in/out contract. Grounded in the
> [PM/PSA + DDD research](#sources) (Kantata/Float/Runn for PSA; Vernon/O-AA/Context-Mapper for DDD).
>
> **Source of truth: the module PRDs** ([`People-PRD`](../modules/people-prd.md), [`Hiring-PRD`](../modules/hiring-prd.md), [`PM-PRD`](../modules/pm-prd.md)) and the data design in [`db-design.md`](./db-design.md). This is the integration backbone behind them. Carried decisions: **leave is owned by the timesheet system** (`people.leave.*` dropped; `pm` reads availability from timesheet); **re-hire** = `person` identity + many `employment_period`s, guarded by a person-match at the `hiring`→`people` boundary; **internal mobility feeds a single `people` job-change ("movement")** so `hiring.mobility.approved` is consumed by **both** `pm` and `people`.
>

## 1. Bounded contexts

| Context | Module | Core responsibility | Ubiquitous language (local) |
|---|---|---|---|
| **HR / Workforce** | `people` | Worker system-of-record; positions/org; skills; lifecycle; performance; leave/capacity | **Worker**, Position, OrgUnit, ReviewCycle, LeaveRequest, Capacity |
| **Recruitment / ATS** | `hiring` | Requisitions, candidates, interviews, offers, internal mobility | Requisition, **Candidate / HireTarget**, Application, Interview, Offer |
| **Delivery / PSA** | `pm` | Accounts→Projects, allocation, utilization, demand, health | Account, Project, **Allocation** (incl. placeholder), Resource, Rate |
| **Identity** | `identity` (existing) | Auth principal, credentials, RBAC, SSO | User, RoleGrant |
| **Work mgmt** | `planner` (existing) | Plans/buckets/tasks/kanban (lifecycle boards; optional pm project tasks) | Plan, Bucket, Task |

**Principle (research §6, Vernon):** no **god-Worker** object. The same human appears as a **Worker**
(people, SoR), a **Resource** (pm, local read-model), and a **Candidate/HireTarget** (hiring, local
model) — three *separate local models* linked by `worker_id` and reconciled by events, never one
shared mutable record.

## 2. Context map (relationships)

```
                 identity ──[U,OHS]── auth principal ──▶ people
                                                          │
   people = UPSTREAM Worker Published Language (Open-Host + Event Publisher)
                 │                                   │
        worker.* / position.* /                 worker.* / leave.* /
        leave.* / capacity.*                    capacity.*
                 ▼                                   ▼
        pm  [D, ACL]                          hiring  [D, ACL]
        (Worker → local Resource)             (Worker → local HireTarget; internal-mobility applicant)
                 ▲                                   │
                 └────────── Customer / Supplier ────┘
                   pm = customer (raises unmet demand)
                   hiring = supplier (supplies hires)
```

| Relationship | Pattern | Contract |
|---|---|---|
| identity → people | Upstream **Open-Host** | people consumes `user.created/updated`; links `worker.user_id` (no FK) |
| people → pm | **Published Language** (up) / **ACL** (down) | pm translates Worker/Capacity/Leave events into a local **Resource** read-model |
| people → hiring | **Published Language** / **ACL** | hiring translates Worker into a local applicant/hire-target view (internal mobility) |
| pm ↔ hiring | **Customer / Supplier** | pm (customer) emits unmet-demand; hiring (supplier) returns hires |
| hiring → people | event | `candidate.hired` → people creates the Worker (SoR) |
| hiring/people → pm | event | hire / mobility-approval → pm fills the placeholder allocation with the named worker |
| people ↔ planner | calls | people scaffolds lifecycle boards (overview §planner) |

**Pragmatic ACL in a modular monolith** (resolves research OQ): we do **not** build heavyweight ACL
ceremony. The ACL is realized as **(a) the event-driven local read-model projection + (b) a thin
translation function at the consumer boundary**. The discipline that matters — *translate the
upstream model into your own terms, never absorb it* — is kept; the mechanism is the repo's existing
outbox + projection pattern. No shared tables, no cross-schema FK.

## 3. The Worker concept across contexts

| Context | Local model | Owns | Gets from upstream |
|---|---|---|---|
| people | **Worker** (aggregate, SoR) | identity link, employment (**person + 1..N employment periods**), grade, skills, position binding, lifecycle stage, comp attrs, **capacity** (contracted hrs/FTE) — **leave moved to the timesheet system** | identity `user.*` |
| pm | **Resource** (read-model) | allocations, utilization, rate overrides, role-on-project | people `worker.*` (name, skills, capacity), `leave.approved` |
| hiring | **HireTarget / Applicant** (read-model for internal; Candidate is local-owned for external) | application, endorsements, interview, offer | people `worker.*` (for internal applicants) |

Only **people** mutates the Worker. pm/hiring **read** projected facts and add their own
context-specific state keyed by `worker_id`.

## 4. Aggregates & invariants

Small, invariant-scoped aggregates (Vernon). Cross-aggregate consistency is **eventual via events**.

### people
- **Worker** — identity link, profile, grade, skills, position binding, lifecycle stage, capacity.
  *Invariant:* lifecycle-stage transitions follow the state machine; admin-only fields gated.
- **Position** — seat (job profile, org-unit, headcount status, holder). *Inv:* a filled position has
  exactly one current holder.
- **OrgUnit** — supervisory hierarchy. *Inv:* acyclic; one manager.
- **ReviewCycle** — period, participants, goals, reviews. *Inv:* close requires all required reviews.
- **LeaveRequest** — *Inv:* approved leave cannot exceed balance; no overlap conflicts.

### pm
- **Account** — client + AM.
- **Project** — under an account; charter state machine (Submitted→PMO→BoD→Created).
- **Allocation** — **own small aggregate** (heavy concurrent edits): `(worker_id | placeholder, project_id, optional task_id)` + **date range** + **per-day intensity**. *Inv:* a *committed* allocation references a real `worker_id`; a *placeholder* allocation has `worker_id = null` + required role/skill criteria. (Research §1–§3.)
- *(Health/financials are NOT aggregates — see §6.)*

### hiring
- **Requisition** — links pm demand (placeholder allocation id) and/or people position id.
- **Candidate** (external, hiring-owned) / **Application** (internal mobility). *Inv:* mobility
  approval requires the full endorsement chain.
- **Interview**, **Offer** — *Inv:* offer-accept is terminal and fires `candidate.hired` once.

## 5. Allocation & demand model (revised per research)

**Allocation = date-ranged assignment with a recurrence rule** (Kantata Assignment / Float task):
- `Allocation { id, project_id, worker_id?, role, date_from, date_to, billable, minutes_per_day,
  weekday_mask }`; only days that deviate from the rule live in `allocation_day_override`. Assignment
  totals + utilization are **derived** (rule ⊕ overrides ÷ capacity). This replaces a full per-day
  fan-out (a 6-month alloc was ~130 rows) — same fidelity, far less write amplification.
- **Planning vs committed:** planning/demand uses a lighter `planned_pct` (capacity %) + duration
  sketch; the recurrence rule (and any overrides) materialize on commit.

**Demand = a placeholder allocation, NOT a separate entity** (research §2, the dominant pattern):
- An unmet need is an `Allocation` with `worker_id = null` + **criteria** (role, skills, dates) +
  `planned_pct`. **One placeholder = one seat** (N seats → N placeholders) so the single
  compare-and-set fill (DDD-D1) stays correct — there is **no `count`** on a placeholder.
- **Single demand pipeline.** Both triggers funnel through the placeholder: a project staffing need
  *and* an **open people Position that needs filling** (backfill/headcount, P-C2/P-C12) result in **pm
  creating a placeholder** (`people.position.opened` → pm). pm is the only producer of
  `pm.resource_request.opened`. There is **no second `position.opened → hiring` demand path** (that
  would contradict "demand = placeholder, one pipeline").
- **Fill paths:** (a) internal — resolve the placeholder to an existing Worker; (b) external — emit
  `pm.resource_request.opened` → hiring opens a **Requisition** referencing the placeholder id. The
  **named worker replaces the placeholder as soon as a worker_id exists** — on `hiring.mobility.approved`
  (internal) or on `people.worker.created` carrying `resource_request_id` (external, right after
  `candidate.hired`), **not** at onboarding-complete. The fill is a **committed, possibly future-dated**
  allocation (`date_from` = planned start); onboarding then only advances the worker's lifecycle stage.
  This stops the placeholder from showing as phantom-open demand (false aging escalation) during the
  weeks of onboarding.

> This replaces the earlier standalone `PM-C8 demand` entity. `pm.md` is revised accordingly.

**Rates** = dual (cost/bill) resolved by an **override cascade** (role/worker default → project
override → finer scope); the effective rate is **computed at billing/reporting time**, not
denormalized onto allocation rows.

## 6. Health/financials as a derived layer

Utilization, billable/non-billable split, margin, and **QCDP/RAG health** are **read-models /
projections** computed from `Allocation` + rate + (logged time) + weekly reports — **not** state inside
the Allocation or Project write-aggregate (research §4). Weekly reports and KPI thresholds are inputs;
RAG is derived.

## 7. Capacity / utilization contract (resolves research OQ)

- **people owns capacity** — contracted hours / FTE% on the Worker, **effective-dated**
  (`worker_capacity`). A capacity change is a new effective-dated row that emits
  **`people.worker.capacity_changed`** (a dedicated event, not folded into the generic `updated`).
  **Leave is owned by the timesheet system, not people**; `pm` reads
  availability from there, not from a `people.leave.approved` event (that event is removed).
- **pm is the sole utilization authority** — utilization = Σ allocation intensity ÷ **the capacity in
  effect for that period**; flags overallocation. pm projects people's capacity (effective-dated, into
  `rm_resource_capacity`) + approved leave. Using a single *current* capacity scalar would make any
  past-period utilization wrong after a change — hence effective-dating on both sides.
- **people does NOT recompute utilization** — its `rm_allocation` is a store-only projection of pm's
  `assignment.*`; there is **no `utilization.updated` cross-module event** (it would fire off a derived
  projection with no transactional anchor — violates the outbox rule). When people needs the number it
  calls pm's public surface — **a batch query `pm.getUtilization(workerIds[], period)`**, so the
  workforce-analytics path (P-C4, many workers) is one call, not N+1. The dashboard must degrade
  gracefully if pm is unavailable (utilization shown as stale/unknown, not a hard failure).

## 8. Domain events — the integration contract

**Scope:** this table is the **cross-context** contract. Intra-module → `notifications` events
(`hiring.interview.scheduled/completed`, `hiring.offer.made`, `*.lifecycle reminders`) live in the
module docs, not here.

**Canonical naming:** every event is **`<module>.<aggregate>.<verb>`**, matching the repo convention
(`planner.task.*`). The people aggregate is **Worker**, so its events are `people.worker.*` — **there is
no `employee.*` wire name** (the capability/table may read "Employee (Worker)", but the event prefix is
`worker`). **Thin events** (ids + changed fields), idempotent on `event_id`, per-aggregate ordering,
via the `core.events` outbox. Consumers fetch detail via public surface.

| Event | Producer | Consumers | Payload (thin) |
|---|---|---|---|
| `identity.user.created/updated` | identity | people | user_id, email, status |
| `people.worker.created/updated` | people | pm, hiring | worker_id, changed-fields, **`resource_request_id?`** (set when origin is an external hire → pm fills the placeholder now) |
| `people.worker.capacity_changed` | people | pm | worker_id, effective_from, fte, contracted_hours |
| `people.worker.lifecycle_changed` | people | notifications | worker_id, from_stage, to_stage |
| `people.worker.deactivated` | people | **pm**, hiring | worker_id (Offboarding/Alumni → pm ends open allocations) |
| `people.worker.onboarded` | people | notifications | worker_id (onboarding **complete → lifecycle only**; the placeholder was already filled at `worker.created`) |
| `people.position.opened` | people | pm | position_id, profile, org_unit (→ pm creates a placeholder; see §5) |
| `pm.account.created/updated` · `pm.project.created/updated` | pm | people, hiring | id, name, parent, am_user_id (lookup projections) |
| `pm.resource_request.opened` | pm | hiring | placeholder_allocation_id, role, skills, count, dates, project_id |
| `pm.assignment.created/changed/ended` | pm | people | allocation_id, worker_id, project_id, account_id, pct, dates (people projects `rm_allocation`; `ended` retracts) |
| `hiring.requisition.opened/updated/closed` | hiring | pm | requisition_id (the role + shared pipeline; seat link is on the opening, not here) |
| `hiring.opening.opened/closed` | hiring | pm | opening_id, requisition_id, resource_request_id? — one seat of headcount; carries the demand link (a requisition owns 1..N openings); `closed` carries reason_id + status |
| `hiring.mobility.approved` | hiring | **pm, people** | worker_id, project_id, **placeholder_allocation_id**, pct — pm fills the placeholder; **people opens a `movement_request(source=internal_mobility)` when role/grade changes** |
| `hiring.candidate.hired` | hiring | people | candidate_id, target position_id, **resource_request_id**, **`person_id?`** (from the boundary person-match → people adds a new employment period to the existing person on re-hire, else creates one) |
| `people.worker.exit_pending` | people | **pm**, notifications | worker_id (failed probation confirmation / accepted resignation → pm surfaces the soon-to-open seat in the pipeline **at the decision moment**, before offboarding completes) |
| `people.movement.applied` | people | **hiring**, notifications | movement_id, worker_id, effective_date — closes the Member loop: notifies the person and back-fills the originating Hiring application's status to "live" |
| `people.worker.did_not_start` | people | **pm**, hiring | worker_id, resource_request_id — rescind/no-show before day one → pm **reopens the placeholder/seat** (not a full offboard); hiring marks the application `reneged` |

### Canonical flow — placeholder → requisition → hire → named allocation

```
pm: create placeholder Allocation (worker_id=null, one seat) ──▶ pm.resource_request.opened
hiring: open Requisition(resource_request_id); track in resource_request_fulfillment (saga)
   ├─ internal: hiring.mobility.approved ─▶ pm fills placeholder w/ worker_id (committed, may be future-dated)
   └─ external: hiring.candidate.hired ─▶ people creates Worker ─▶ people.worker.created(resource_request_id) ─▶ pm fills placeholder
hiring marks the request filled + cancels the losing in-flight path; people.worker.onboarded later just advances lifecycle
pm.assignment.created ─▶ people projects into allocation read-model (P-C3)
```

## 9. Decisions & residual open questions

**Decided:** demand = placeholder allocation (no standalone entity, one seat); allocation =
date-ranged aggregate with a recurrence rule + sparse overrides; rates = typed cascade →
`rm_effective_rate`; health = derived projection; ACL = projection + translation (no ceremony);
people owns **effective-dated** capacity + leave (ledger), pm computes utilization (read via batch
query, no event); thin events.

**Resolved (system design):**
- **OQ-D1 (double-fill) → RESOLVED:** one placeholder (**one seat**) → one `resource_request` → at most
  one open `requisition`. **hiring owns the resource_request fulfillment lifecycle**, now modeled as an
  explicit **`resource_request_fulfillment` saga** (state `open→in_progress→filled|cancelled|timed_out`
  + `timeout_at`) — one observable record instead of state scattered across handlers. Internal-mobility
  and external-hire are alternative fills of the same request. **Idempotency key = the placeholder
  `allocation.id`**: `fillPlaceholder` is a compare-and-set transitioning `status` `placeholder →
  committed` **exactly once** (CAS); a second fill is a no-op. **Both** fill events carry
  `placeholder_allocation_id` — `hiring.mobility.approved` directly, and the external path threads it
  through `hiring.candidate.hired` → `people.worker.created` carrying `resource_request_id` (which pm
  resolves to the placeholder). **The fill happens as soon as a worker_id exists** (mobility-approve /
  worker-create), producing a committed, possibly future-dated allocation — *not* at onboarding-complete.
  **hiring** closes the losing in-flight path (cancels the other requisition/application) via the saga
  when the request is fulfilled. Out-of-order arrivals follow the global park-vs-noop policy
  ([`db-design.md`](./db-design.md) conventions).
- **OQ-D2 (pm × planner) → RESOLVED:** pm core is **allocation + monitoring**; it does **not** build
  task execution. Project *task* boards, if needed, **reuse `planner`** (a planner group per project,
  linked by id) — **deferred, not in pm MVP**. Allocation is task-optional (`task_id` nullable).
- **OQ-D3 (rates) → RESOLVED:** **pm owns the cost/bill rate cascade** (defaults + project overrides,
  **typed scope** + temporal uniqueness) and computes derived financials (margin/billable) as
  projections resolved into `rm_effective_rate`. **Deep finance — invoicing, payroll, GL — is
  downstream integration**, out of scope here.

**Architecture-revision decisions — from the solution-architecture review:**
- **D4 (effective-dating):** compensation, capacity, and rates are effective-dated history, not
  overwritten scalars; utilization/margin always read the value in effect for the period.
- **D5 (fill timing):** pm fills the placeholder when a `worker_id` first exists (mobility-approve /
  worker-create) as a committed, possibly future-dated allocation — decoupled from onboarding-complete,
  which now only advances lifecycle stage. Eliminates phantom-open demand.
- **D6 (fulfillment saga):** the request lifecycle is an explicit `resource_request_fulfillment` record
  (state + timeout + losing-path cancellation), hiring-owned.
- **D7 (utilization read):** people reads pm utilization via a **batch query**
  `getUtilization(workerIds[], period)`; no `utilization.updated` event; dashboard degrades gracefully
  if pm is down. (Reconciles `pm.md`/`people.md` to §7 — both previously listed the forbidden event.)
- **D8 (RBAC sensitive reads):** account/project visibility rides the async `rm_allocation` projection,
  which lags on **revocation** (allocation `ended`) — an over-exposure risk for salary/bank/tax.
  Mitigation: bound the projection lag with an SLO **and** re-validate an active allocation
  synchronously before serving sensitive comp fields, so eventual consistency never over-exposes.
- **D9 (movement effective-dating):** approved movements apply at `effective_date` via a job, not at
  approval time (future-dated promotions).
- **D10 (lifecycle step identity):** a stable `template_step_key` is stamped on planner checklist items
  so cross-case step-duration analytics survive the planner boundary.
- **D11 (event naming):** every cross-context event is canonical `<module>.<aggregate>.<verb>` (§8 is
  the SoR); module docs that dropped the prefix (`position.opened`, `mobility.approved`,
  `assignment.created`, …) are wrong and reconciled to §8.

## Sources

PSA: Kantata Assignments/Resource-Requests/Rates API + KB; Float allocation/rates/budgets; Runn
placeholders. DDD: Vernon *Effective Aggregate Design*; Open Group O-AA strategic patterns;
Context Mapper (ACL); Fowler/Verraes/Thoughtworks (thin vs fat events). 24/25 claims verified.
