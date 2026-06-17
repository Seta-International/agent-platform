# People / Hiring / PM — DDD context map & integration contracts

> The integration backbone for the three modules: bounded contexts, the cross-cutting Worker concept,
> aggregate roots + invariants, and domain events as the data-in/out contract. Grounded in the
> [PM/PSA + DDD research](#sources) (Kantata/Float/Runn for PSA; Vernon/O-AA/Context-Mapper for DDD).
> This doc governs `people.md`, `hiring.md`, `pm.md` system design — read it first.

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
| people | **Worker** (aggregate, SoR) | identity link, employment, grade, skills, position binding, lifecycle stage, comp attrs, **capacity** (contracted hrs/FTE), leave balances | identity `user.*` |
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

**Allocation = date-ranged, per-day assignment** (Kantata Assignment+StoryAllocationDay / Float task):
- `Allocation { id, project_id, worker_id?, role, date_from, date_to, billable }` owning **per-day
  intensity** rows (hours/min per day); assignment totals + utilization are **derived**.
- **Planning vs committed:** planning/demand may use a lighter **percent-of-capacity + duration**
  sketch; concrete per-day rows materialize on commit.

**Demand = a placeholder allocation, NOT a separate entity** (research §2, the dominant pattern):
- An unmet need is an `Allocation` with `worker_id = null` + **criteria** (role, skills, count, dates)
  + a **`planned_pct`** (capacity %) for the planning sketch (per-day `minutes` materialize on commit).
- **Single demand pipeline.** Both triggers funnel through the placeholder: a project staffing need
  *and* an **open people Position that needs filling** (backfill/headcount, P-C2/P-C12) result in **pm
  creating a placeholder** (`people.position.opened` → pm). pm is the only producer of
  `pm.resource_request.opened`. There is **no second `position.opened → hiring` demand path** (that
  would contradict "demand = placeholder, one pipeline").
- **Fill paths:** (a) internal — resolve the placeholder to an existing Worker; (b) external — emit
  `pm.resource_request.opened` → hiring opens a **Requisition** referencing the placeholder id. On
  hire/approval the **named worker replaces the placeholder** (payload transfers), closing the loop.

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

- **people owns capacity** — contracted hours / FTE% on the Worker, plus **leave** (reduces
  availability). `updateWorker` emits **`people.worker.capacity_changed`** when `fte`/`contracted_hours`
  change (a dedicated event, not folded into the generic `updated`); `decideLeave` emits
  `people.leave.approved`.
- **pm is the sole utilization authority** — utilization = Σ allocation intensity ÷ projected capacity;
  flags overallocation. pm projects people's capacity + approved leave into its Resource read-model.
- **people does NOT recompute utilization** — its `rm_allocation` is a store-only projection of pm's
  `assignment.*`; there is **no `utilization.updated` cross-module event** (it would fire off a derived
  projection with no transactional anchor — violates the outbox rule). people reads pm utilization via
  query when it needs the number.

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
| `people.worker.created/updated` | people | pm, hiring | worker_id, changed-fields |
| `people.worker.capacity_changed` | people | pm | worker_id, fte, contracted_hours |
| `people.worker.lifecycle_changed` | people | notifications | worker_id, from_stage, to_stage |
| `people.worker.deactivated` | people | **pm**, hiring | worker_id (Offboarding/Alumni → pm ends open allocations) |
| `people.worker.onboarded` | people | pm | worker_id, **resource_request_id** (→ pm fills the named placeholder) |
| `people.leave.approved` | people | pm | worker_id, range |
| `people.position.opened` | people | pm | position_id, profile, org_unit (→ pm creates a placeholder; see §5) |
| `pm.account.created/updated` · `pm.project.created/updated` | pm | people, hiring | id, name, parent, am_user_id (lookup projections) |
| `pm.resource_request.opened` | pm | hiring | placeholder_allocation_id, role, skills, count, dates, project_id |
| `pm.assignment.created/changed/ended` | pm | people | allocation_id, worker_id, project_id, account_id, pct, dates (people projects `rm_allocation`; `ended` retracts) |
| `hiring.requisition.opened/closed` | hiring | pm | requisition_id, resource_request_id |
| `hiring.mobility.approved` | hiring | pm | worker_id, project_id, **placeholder_allocation_id**, pct |
| `hiring.candidate.hired` | hiring | people | candidate_id, target position_id, **resource_request_id** |

### Canonical flow — placeholder → requisition → hire → named allocation

```
pm: create placeholder Allocation (worker_id=null, criteria) ──▶ pm.resource_request.opened
hiring: open Requisition(resource_request_id) ─ pipeline / mobility ─▶ hire/approve
   ├─ internal: hiring.mobility.approved ─▶ pm replaces placeholder with worker_id (alloc materializes)
   └─ external: hiring.candidate.hired ─▶ people creates Worker ─▶ people.worker.onboarded ─▶ pm fills placeholder
pm.assignment.created ─▶ people projects into allocation read-model (P-C3)
```

## 9. Decisions & residual open questions

**Decided:** demand = placeholder allocation (no standalone entity); allocation = date-ranged per-day
aggregate; rates = cascade; health = derived projection; ACL = projection + translation (no ceremony);
people owns capacity+leave, pm computes utilization; thin events.

**Resolved (system design):**
- **OQ-D1 (double-fill) → RESOLVED:** one placeholder → one `resource_request` → at most one open
  `requisition`. **hiring owns the resource_request fulfillment lifecycle**; internal-mobility and
  external-hire are alternative fills of the same request. **Idempotency key = the placeholder
  `allocation.id`**: `fillPlaceholder` is a compare-and-set transitioning `status` `placeholder →
  committed` **exactly once** (CAS); a second fill is a no-op. To make this work **both** fill events
  carry `placeholder_allocation_id` — `hiring.mobility.approved` directly, and the external path
  threads it through `hiring.candidate.hired` → `people.worker.onboarded` (both carry
  `resource_request_id`, which pm resolves to the placeholder). **hiring** is the owner that closes the
  losing in-flight path (cancels the other requisition/application) when the request is fulfilled.
- **OQ-D2 (pm × planner) → RESOLVED:** pm core is **allocation + monitoring**; it does **not** build
  task execution. Project *task* boards, if needed, **reuse `planner`** (a planner group per project,
  linked by id) — **deferred, not in pm MVP**. Allocation is task-optional (`task_id` nullable).
- **OQ-D3 (rates) → RESOLVED:** **pm owns the cost/bill rate cascade** (defaults + project overrides)
  and computes derived financials (margin/billable) as projections. **Deep finance — invoicing,
  payroll, GL — is downstream integration**, out of scope here.

## Sources

PSA: Kantata Assignments/Resource-Requests/Rates API + KB; Float allocation/rates/budgets; Runn
placeholders. DDD: Vernon *Effective Aggregate Design*; Open Group O-AA strategic patterns;
Context Mapper (ACL); Fowler/Verraes/Thoughtworks (thin vs fat events). 24/25 claims verified.
