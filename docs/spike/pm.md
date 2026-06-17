# `pm` (Project Management) module — backend discovery

> Status: **Spike (in progress) — now a full implementation module** (we implement **3 modules**:
> `people`, `hiring`, `pm`). Backend only. Built in the 7 steps from [`overview.md`](./overview.md) §7;
> system + DB design done across all three modules together once discovery is clear.

`pm` is the **delivery / PSA system-of-record** for a software-outsourcing firm: **Accounts (clients)
→ Projects → Resource Allocation**, project health monitoring, and staffing **demand**. It is the PSA
layer per the [benchmarking](./benchmarking.md) (mirrors Kantata).

> **Revised against dedicated PSA + DDD research** (see [`ddd-design.md`](./ddd-design.md), the
> integration backbone). Key corrections to the earlier draft: **(1)** allocation is a **date-ranged**
> assignment aggregate carrying a **recurrence rule** (`minutes_per_day` + weekday mask, with only
> deviating days in `allocation_day_override`), not a bare `%` nor a full per-day fan-out; **(2) demand
> is a *placeholder allocation*, not a standalone entity** (Kantata/Runn/Float pattern) — PM-C8 is
> realized *within* the allocation model;
> **(3)** rates resolve via a **cost/bill override cascade**; **(4)** health/financials (QCDP/RAG,
> utilization, margin) are a **derived projection**, not write-aggregate state.

---

## Step 1 — Capability inventory

| ID | Capability | What it does |
|---|---|---|
| **PM-C1** | **Accounts** | Client accounts (outsourcing clients), each with an **Account Manager**; 1—* Projects. SoR for the Account entity `people`/`hiring` reference by id. |
| **PM-C2** | **Projects** | Projects under an account, via a **charter request flow** (PM submits → PMO review → BoD review → live in Portfolio). Project profile (objective, scope, budget = billable man-months, PM, phase). SoR for Project. |
| **PM-C3** | **Resource allocation** | **Allocation = date-ranged, per-(worker, project[, task]) assignment** carrying a **recurrence rule** (`minutes_per_day` + weekday mask) with only deviating days in `allocation_day_override` (not a full per-day fan-out); **M:N** (one worker on many projects/accounts), **billable** flag, role on project. A committed allocation may be **future-dated** (`date_from` in the future); "started" is derived. Utilization (can exceed 100% = overallocation) is **derived** (Σ intensity ÷ projected capacity). **SoR that `people` P-C3 projects.** A `worker_id = null` allocation is a single-seat **placeholder** = demand (see PM-C8). |
| **PM-C4** | **Portfolio / project health** | **QCDP** (Quality/Cost/Delivery/Process) RAG status auto-derived from metrics; phase; portfolio rollup; predictability. |
| **PM-C5** | **Weekly reports** | Per-project weekly status: executive summary, risk/issue, RAG (auto-derived QCDP, override allowed); **non-Green requires a road-to-green action + owner + due**. |
| **PM-C6** | **Risks & Issues** | Risk/issue register (type, severity, priority, status, owner, due, action). **Resource risks → raise staffing demand** (PM-C8 → hiring). |
| **PM-C7** | **KPI metrics** | Metric catalog across Quality/Cost/Delivery/Process (Defect Leakage, DRE, Gross Margin, Billable Rate, Utilization, On-time Delivery, SPI, Process Compliance, **EQI/TDI**) with goal/yellow thresholds + direction. **Manual KPI input** (`kpi_value`) feeds QCDP derivation. Includes a **corrective-action (CAPA) register** (CAPA/risk/improvement with owner/due/progress). |
| **PM-C9** | **Project access (R&R)** | Per-project access grant (**Owner/Edit/View**, `project_access`) assigned in the charter's post-approval staffing step — a project-scoped access-control concept distinct from tier RBAC. |
| **PM-C8** | **Staffing demand (placeholder allocation)** | An unmet need is a **placeholder allocation** (`worker_id = null` + criteria: role/skills/dates) — *not* a separate entity. **One placeholder = one seat** (N seats → N placeholders), so the single-CAS `fillPlaceholder` stays correct. Fill paths: (a) **internal** — resolve to an existing worker; (b) **external** — emit `pm.resource_request.opened` → `hiring` opens a requisition; the **named worker replaces the placeholder as soon as a worker_id exists** (committed, possibly future-dated). |

### Cross-cutting

- **Audit** on every mutation (`core.events`); **HITL** on agent-driven writes.
- QCDP RAG is **derived** from KPI metrics + reported status (not free-entered, except override).

---

## Step 2 — Role breakdown (capability × role)

| Capability | BoD / Admin | PMO | Account Manager | PM / EM / Lead | Member |
|---|---|---|---|---|---|
| **PM-C1** Accounts | R/W all | R/W | R/W own | R own | — |
| **PM-C2** Projects | **approve** (BoD step) | **review/approve** | R/W own account | **W submit/run** own | R own |
| **PM-C3** Allocation | R all | **R/W; capacity gatekeeper** | R/W own account | R/W own project | R self |
| **PM-C4** Portfolio | R all | R all | R own account | R own | — |
| **PM-C5** Weekly reports | R all | R all; chase non-Green | R own account | **W submit** own | — |
| **PM-C6** Risks & Issues | R all | R/W | R/W own account | **W raise/own** own project | R own |
| **PM-C7** KPI metrics | R all | R/W thresholds | R own account | R own | — |
| **PM-C8** Demand | R all | R/W | R/W own account | **W raise** own project | R |

**PMO is the capacity gatekeeper** for allocation (validates utilization/overallocation) — the same
role that finally approves internal mobility in `hiring` (H-C2).

---

## Step 3 — Domain operations (use cases)

`C`=command, `Q`=query. Writes commit their event via `withEmit`; agent writes HITL-gated.

### PM-C1 — Accounts
| Op | Type | Actor | Notes |
|---|---|---|---|
| `createAccount` / `updateAccount` | C | PMO/Admin | client; assign **Account Manager** |
| `listAccounts` / `getAccount` | Q | scoped | `createAccount`/`updateAccount` emit `pm.account.*` for people/hiring lookup projections |

### PM-C2 — Projects (charter flow)
| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `submitProjectRequest` | C | PM | charter: name, account, objective, scope (in/out), budget (BMM), PM | `Submitted`; audit |
| `reviewProjectRequest` | C | PMO | capacity/process sign-off | `PMO Review` → pass/return |
| `approveProjectRequest` | C | BoD | board approval | `BoD Review` → approved |
| `createProject` | C | (on approval) | live in portfolio | emits `pm.project.created`; audit |
| `updateProject` / `closeProject` | C | PM/PMO | phase, status | audit |

**Charter state machine:** `Submitted → PMO Review → BoD Review → Project created`.

### PM-C3 — Resource allocation (the SoR people projects)
Allocation = aggregate keyed `(worker_id?, project_id, task_id?)` + **date range** + a **recurrence
rule** (`minutes_per_day` + weekday mask), with only deviating days in `allocation_day_override`;
assignment totals + utilization are **derived**. A committed allocation may be future-dated; "started"
is derived (`date_from ≤ today`). Capacity is **projected from people** (effective-dated
`people.worker.capacity_changed`, `people.leave.approved`) — pm does not own capacity.

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `createAllocation` | C | PMO/PM | worker, project, role, **date range + recurrence rule** (or planning %+duration), billable; **capacity/overallocation check** vs projected capacity | emits `pm.assignment.created`; audit |
| `updateAllocation` / `endAllocation` | C | PMO/PM | change intensity rule / date range | emits `pm.assignment.changed`/`pm.assignment.ended`; audit |
| (consume) | — | — | `hiring.mobility.approved` / `people.worker.created` (carries `resource_request_id`) | **fill the placeholder** with the named worker (committed, possibly future-dated) — **as soon as a worker_id exists**, not at onboarding-complete | 
| (consume) | — | — | `people.worker.capacity_changed` (effective-dated) / `people.leave.approved` | refresh projected capacity (utilization math) |
| `getAllocations` / `getUtilization` | Q | scoped | per worker / project; util = Σ intensity ÷ capacity-in-effect (flags overallocation); `getUtilization(workerIds[], period)` is the **batch query people calls** | — |

### PM-C4 — Portfolio / health · PM-C7 — KPI
| Op | Type | Actor | Notes |
|---|---|---|---|
| `getPortfolio` / `getProjectHealth` | Q | scoped | QCDP RAG rollup, phase, predictability |
| `getKpiMetrics` | Q | scoped | catalog values vs thresholds per project; drives QCDP derivation |
| `setKpiThresholds` | C | PMO | goal/yellow per metric |

### PM-C5 — Weekly reports
| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `submitWeeklyReport` | C | PM/EM | week, summary, risk; RAG auto-derived (override allowed); **non-Green ⇒ road-to-green action + owner + due required** | emits `pm.weekly_report.submitted`; updates project RAG; audit |
| `listWeeklyReports` | Q | scoped | by week / project | — |

### PM-C6 — Risks & Issues
| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `createRisk` / `updateRisk` / `resolveRisk` | C | PM/PMO | type, severity, priority, owner, action | audit |
| `raiseDemandFromRisk` | C | PM/PMO | a **Resource** risk → staffing demand | calls PM-C8 |

### PM-C8 — Staffing demand (= placeholder allocation, not a separate entity)
| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `createPlaceholder` | C | PM/PMO | a single-seat `worker_id=null` allocation + criteria (role/skills/dates) on a project (N seats → N placeholders) | placeholder allocation; audit |
| `openResourceRequest` | C | PM/PMO | placeholder can't be filled internally | emits **`pm.resource_request.opened`** (placeholder id) → `hiring` opens a requisition; audit |
| `fillPlaceholder` | C | (internal) / event | resolve to an existing worker, or on `hiring.mobility.approved` / `people.worker.created` | **named worker replaces placeholder** (single CAS `placeholder→committed`); emits `pm.assignment.created`; **hiring** (saga owner) closes the resource request + cancels the losing path; audit |
| `listPlaceholders` | Q | scoped | open demand (unfilled placeholders) | — |

---

## Step 4 — Module & function linking

### Events emitted
| Event | Op | Consumers |
|---|---|---|
| `pm.account.created/updated` | PM-C1 | people, hiring (lookup projections) |
| `pm.project.created/updated` | PM-C2 | people, hiring (lookup projections) |
| `pm.assignment.created/changed/ended` | PM-C3 | **people** (allocation read-model, M:N) |
| `pm.resource_request.opened` | PM-C8 | **hiring** (author requisition for an unfilled placeholder) |
| `pm.weekly_report.submitted` | PM-C5 | notifications (PMO chase) |

> **No `pm.utilization.updated` event** — utilization is a derived projection with no transactional
> outbox anchor (ddd-design §7). `people` reads it via the **batch query `getUtilization(workerIds[],
> period)`** on pm's public surface.

### Consumed / calls
| Direction | Module | What |
|---|---|---|
| consumes | **hiring** | `hiring.mobility.approved` → **fill placeholder** with named worker (capacity-checked) |
| consumes | **people** | `people.worker.created` (carries `resource_request_id`) → fill placeholder on hire; `people.worker.capacity_changed` (effective-dated)/`people.leave.approved` → capacity; `people.position.opened` → context. (`people.worker.onboarded` is **lifecycle-only**, not a fill trigger.) |
| calls | **people** | read worker (skills/profile) for allocation/matching |
| calls | **planner** | *(optional)* per-project task execution board reuses planner (group per project) — OQ-P1 |
| contributes | **agent** | read tools (portfolio/allocation/risks/KPI) + HITL writes (allocate, approve project, submit report, raise demand) |

`pm` never receives another module's Drizzle client; account/project/worker referenced by id, no
cross-schema FK. Allocation creation is **event-driven** from hiring (no synchronous call inbound).

### Resolved cross-module contracts (recap)
- **OQ-H1:** `hiring` authors requisitions linked to `pm` `resource_request_id` (the placeholder).
- **OQ-H2:** `hiring` emits `hiring.mobility.approved`/`hiring.candidate.hired`; **`pm` creates the allocation**
  (capacity gatekeeper, allocation SoR).
- **OQ-H3:** interview/candidate scoring reuses `people`'s scorecard instrument.

```
pm: placeholder allocation (1 seat) ─▶ pm.resource_request.opened ─▶ hiring (requisition + saga)
hiring.mobility.approved ─▶ pm (fill placeholder)   hiring.candidate.hired ─▶ people (Worker)
people.worker.created (resource_request_id) ─▶ pm (fill placeholder, committed/future-dated)
pm.assignment.created/changed/ended ─▶ people (alloc read-model)   [utilization via batch query, no event]
people.worker.capacity_changed (effective-dated) / leave.approved ─▶ pm (capacity for utilization)
```
Full contract + the placeholder→requisition→hire→named-allocation loop: [`ddd-design.md`](./ddd-design.md) §5,§8.

---

## Step 5 — WBS (buildable slices)

| Slice | Scope | dep | ext |
|---|---|---|---|
| **PMM-1 Foundation** | scaffold (`pnpm gen module pm`), `pm` schema + `schemaFilter`, RBAC, events/audit | — | identity |
| **PMM-2 Accounts + Projects** | PM-C1 + PM-C2 (charter flow); emits `account.*`/`project.*` | PMM-1 | — |
| **PMM-3 Resource allocation (M:N)** | PM-C3 (allocate via recurrence rule + overrides, capacity/overalloc, util batch query); consumes hiring/people events; emits `pm.assignment.created/changed/ended` → people | PMM-2 | hiring events, people (worker read) |
| **PMM-4 Staffing demand (placeholders)** | PM-C8 (single-seat placeholder allocation, `pm.resource_request.opened`, fill-when-worker-exists) — part of the PMM-3 allocation model | PMM-3 | hiring |
| **PMM-5 Portfolio + KPI** | PM-C4 + PM-C7 (QCDP derivation, metric catalog/thresholds) | PMM-2 | — |
| **PMM-6 Weekly reports** | PM-C5 (submit, RAG, road-to-green) | PMM-5 | notifications |
| **PMM-7 Risks & Issues** | PM-C6 (register; resource-risk → demand) | PMM-2, PMM-4 | — |

**Critical path:** PMM-1 → PMM-2 → PMM-3 (allocation, the people-facing SoR) and PMM-4 (demand, the
hiring bridge) in parallel; PMM-5 → PMM-6, PMM-7 independent. **MVP for the people/hiring integration =
PMM-1 → PMM-2 → PMM-3 + PMM-4.**

---

## Open questions (pm-owned)
- **OQ-P1 → lean RESOLVED:** `pm` owns the **monitoring** model (portfolio/weekly/risk/KPI) and
  Account/Project/Allocation/Demand. **Project task execution (kanban) reuses `planner`** (a planner
  group per project — `planner.groups.account_id` already exists); `pm.project` links to the planner
  group by id. Confirm depth in system design.
- **OQ-P2 → RESOLVED:** `pm` is the **sole SoR** for Account/Project; `people`/`hiring` keep projected
  lookups only.
- **OQ-P3 → RESOLVED:** Cost/bill **rates** — `pm` owns resourcing rates with **typed scope columns**
  (`role`/`worker_id`/`project_id`/`phase` + CHECK "exactly one", temporal uniqueness), not a
  polymorphic `scope_id`; the cascade resolves into a materialized **`rm_effective_rate (worker_id,
  project_id, date)`** read at margin time. Deep finance/payroll stays a downstream integration.

---

## Step 6 — System design

> Governed by [`ddd-design.md`](./ddd-design.md): `pm` is a downstream **ACL** consumer of `people`
> (Worker → local **Resource**) and the **Customer** in Customer/Supplier with `hiring`. **Allocation**
> is the write-core; **portfolio/health/utilization/margin are derived projections**, not aggregate
> state.

### 6.1 Internal layout
```
packages/pm/src/
  index.ts · events.ts · rbac.ts · contracts.ts · agent-tools.ts · register.ts
  backend/
    db/{schema.ts, pg-schema.ts, index.ts}      # pgSchema('pm'), schemaFilter:['pm']
    domain/*.ts                                  # accounts, projects (charter), allocation, placeholder, rates, risks, weekly
    projections/*.ts                             # ACL: people-worker→Resource (skills/leave) + effective-dated rm_resource_capacity; derived: rm_effective_rate, utilization, QCDP/RAG, margin
    rates/                                        # typed-scope cost/bill cascade → rm_effective_rate
    http/*.ts · jobs/*.ts · agent-tools/register.ts
  drizzle.config.ts                              # schemaFilter: ['pm']
```

### 6.2 Public surface & HTTP API (`/api/pm`)
| Route | Method | Op |
|---|---|---|
| `/accounts` · `/:id` | GET/POST/PATCH | PM-C1 |
| `/project-requests` · `/:id/{review,approve}` · `/projects` · `/projects/:id` | GET/POST/PATCH | PM-C2 charter flow |
| `/allocations` · `/:id` | GET/POST/PATCH/DELETE | PM-C3 (date-ranged, recurrence rule + overrides; capacity-checked) |
| `/utilization?workerIds=…&period=…` | GET | batch utilization query (people calls this; no event) |
| `/placeholders` · `/:id/open-request` · `/:id/fill` | POST | PM-C8 (demand = single-seat placeholder; `pm.resource_request.opened`; idempotent fill) |
| `/utilization` · `/portfolio` · `/health` | GET | derived read-models |
| `/weekly-reports` | GET/POST | PM-C5 (non-Green ⇒ road-to-green required) |
| `/risks` · `/:id` | GET/POST/PATCH | PM-C6 (resource risk → placeholder) |
| `/kpi` · `/kpi/thresholds` · `/rates` | GET/POST | PM-C7 + rate cascade |

### 6.3 RBAC (`./rbac`)
`PM_PERMISSIONS`: `pm.account.manage`, `pm.project.submit|review|approve|manage`,
`pm.allocation.read|write`, `pm.demand.manage`, `pm.weekly.submit`, `pm.risk.manage`,
`pm.kpi.read|configure`, `pm.rate.manage`. **PMO holds `allocation.write` as capacity gatekeeper**;
BoD holds `project.approve`. Account/project scoping by AM ownership + project membership.

### 6.4 Jobs
| Job | Trigger | Does |
|---|---|---|
| `utilization-recompute` | on `pm.assignment.*` / capacity events | refresh per-worker/project utilization read-model using **effective-dated capacity** |
| `rag-derivation` | on weekly-report / KPI change | recompute QCDP/RAG health projection (from `weekly_report_qcdp` + `kpi_value`) |
| `rate-resolve` | on `rate` change / `pm.assignment.*` | refresh `rm_effective_rate` (cost/bill cascade) |
| `weekly-report-chase` | cron | missing/non-Green reports → notify PM/PMO |
| `resource-request-aging` | cron | long-open **unfilled placeholders only** (filled-but-not-started seats never escalate) → escalate |
| `allocation-rollover` | cron | auto-end past-dated allocations; recompute |

### 6.5 Projections (ACL + derived, idempotent on `event_id`, **replayable/rebuildable** from `core.events`)
| Projection | Source | Model |
|---|---|---|
| Resource (ACL) | `people` `people.worker.*` | local resource: skills, role, **availability** (`people.leave.approved`) |
| Resource capacity (ACL, effective-dated) | `people.worker.capacity_changed` | `rm_resource_capacity` (effective_from/to, fte) — past-period util uses the capacity in effect then |
| effective rate | `rate` cascade | `rm_effective_rate (worker_id, project_id, date)` — resolved once, read at margin time |
| utilization | own `pm.assignment.*` + effective-dated capacity | Σ intensity ÷ capacity; overallocation flag (derived); **exposed via `getUtilization` batch query, no event** |
| QCDP / RAG health | `weekly_report_qcdp` + `kpi_value` | derived portfolio health (not write-state) |
| margin / billable | allocations + `rm_effective_rate` + (logged time) | derived financials |

### 6.6 Composition & 6.7 enforcement
`register.ts` wires subscribers — `hiring.mobility.approved` & `people.worker.created` (carrying
`resource_request_id`) → **`fillPlaceholder`** (idempotent single CAS on `allocation.status`,
capacity-checked, keyed on `placeholder_allocation_id`/`resource_request_id`, fills as soon as a
worker_id exists — committed, possibly future-dated; the fulfillment **saga is hiring-owned**);
`people.worker.capacity_changed` (effective-dated)/`people.leave.approved` → Resource projection;
**`people.worker.deactivated` → end the worker's open allocations** (prevents stale utilization);
`hiring.requisition.*` → link state — plus RBAC, agent tools (read: portfolio/allocation/risks/KPI;
HITL writes: allocate, approve project, submit report, raise/fill placeholder), HTTP routers, jobs.
Subscribers follow the global out-of-order park-vs-noop policy and are replayable. Own Drizzle client;
account/project/worker referenced by id; no cross-schema FK. **Health/financials never stored on
write-aggregates** — always recomputed projections. Every command audits via `core.events`;
`pm.assignment.*`/`pm.resource_request.*` emitted idempotently.

## Step 7 — Database design
→ **[`db-design.md`](./db-design.md)** — the `pm` schema section (account, project, project_request,
allocation + allocation_day_override, rate (typed scope), weekly_report + weekly_report_qcdp, risk,
kpi_metric/kpi_threshold/kpi_value, project_access, corrective_action) + the
`rm_resource`/`rm_resource_capacity`/`rm_effective_rate`/`rm_utilization`/`rm_project_health`/`rm_margin`
projections.
