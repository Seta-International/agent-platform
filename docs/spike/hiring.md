# `hiring` module — backend discovery (spike)

> ⚠️ **Superseded (2026-06-18) — stale.** Product source of truth is **[Hiring-PRD](../modules/Hiring-PRD.md)**.
> Notable additions since this spike: **internal mobility records a single job-change ("movement") in `people`**
> against the existing person (Hiring never edits the employment record); **re-hire/boomerang** runs a
> person-match at the hire handoff so `people` adds a new employment period to the existing person — see
> [`benchmarking-mobility-rehire.md`](./benchmarking-mobility-rehire.md). The PRD wins on any conflict.
>
> Original status: **Spike (in progress)**. Backend only. Built in the 7 steps from [`overview.md`](./overview.md)
> §7; system + DB design deferred until people/hiring/pm boundaries are all clear.

The `hiring` module owns **recruitment** — requisitions, candidates, interviews, offers, and the
internal-mobility approval flow. It sits between **`pm`** (which owns the *demand*: project staffing
needs + allocation) and **`people`** (which owns the *supply*: workers, positions; and receives new
hires).

---

## Step 1 — Capability inventory

| ID | Capability | What it does |
|---|---|---|
| **H-C1** | **Requisitions** | Open/manage a req: title, **job profile (role+grade)**, **account/project** (PM demand ref), required **skills + levels**, `kind` (**replacement/backfill** vs **new**), target dates, status, pipeline stage. A req is raised against **PM project demand** and/or a **people open position** (P-C2/P-C12). |
| **H-C2** | **Internal mobility (applications)** | An existing **employee applies** to a req. Endorsement/approval chain: **releasing-EM** → **receiving-EM** → **PMO**. On PMO approval → `hiring.mobility.approved` → **pm fills the placeholder** (worker at N% on the target project, committed/possibly future-dated) — feeding the M:N allocation model. Tracks full history. |
| **H-C3** | **External candidates** | Candidate records (profile, CV/docs, source), pipeline across **Sourcing → Screening → Interview → Offer**, per-req application. |
| **H-C4** | **Interviews** | Schedule (round, panel, date/time, duration, mode online/onsite), capture **feedback/score** via the **versioned scorecard template** (pinned `scorecard_template_id` + normalized `interview_score`, OQ-H3), result; calendar links + reminders. |
| **H-C5** | **Offers** | Create/approve an offer; candidate accept/decline; **on accept → `hiring.candidate.hired`** → `people` creates the Worker and emits `people.worker.created` (carrying `resource_request_id`) → pm fills the placeholder. |
| **H-C6** | **Recruitment insight ("Knowledge Base" tab)** | **NOT a JD CMS** — the prototype tab is **recruitment-effectiveness analytics**: interview-round pass-rate, **failure-pattern/root-cause** themes, improvement plan, hardest-roles-to-fill, **case-study log** (per-candidate pass/fail + reasons + tags). Needs structured interview-outcome data (`reject_reason`, `tags`). Folds into H-C7 analytics. *(OQ-7: a separate JD-template store may reuse `knowledge` if wanted — secondary.)* |
| **H-C7** | **Recruitment reports** | Funnel/pipeline metrics, time-to-fill, open reqs, stage conversion, source effectiveness, interview load. Role-scoped. |

### Cross-cutting

- **Audit** on every mutation (`core.events`); **HITL** on agent-driven writes.
- Documents (CV, offer letters) → **`shared-storage`** vault (shared pattern with `people`).

---

## Step 2 — Role breakdown (capability × role)

Adds a **Recruiter (HR)** actor to the tiers in `overview.md` §4. `R`=read, `W`=write.

| Capability | Strategic (BOD/Admin/PMO/HRM) | Recruiter (HR) | Account Manager | EM / Team Lead | Member/Employee |
|---|---|---|---|---|---|
| **H-C1** Requisitions | R/W all; **PMO approves** | W (open/manage, account-scoped by assignment) | R/W own account | Propose for own project | R **open roles** only |
| **H-C2** Internal mobility | R all; **PMO = final approver** | R/coordinate | R own account | **W releasing/receiving endorse** | **W apply** (self); R own |
| **H-C3** Candidates | R all | R/W (own pipeline) | R own account | R for own reqs | — |
| **H-C4** Interviews | R all | R/W (schedule) | R own account | **W panel feedback**; R | R own (if interviewee) |
| **H-C5** Offers | R/W; **approve** | W (draft) | R own account | R | R own offer |
| **H-C6** Knowledge base | R/W | R/W | R | R | R |
| **H-C7** Reports | R org-wide | R recruitment | R own account | R own reqs | — |

Notes:
- **PMO** is the capacity/allocation gatekeeper for internal mobility (H-C2) — the final approval that
  creates a PM allocation.
- A **Member** sees Hiring only as **"Open Roles"** (H-C1 read) + can **apply** (H-C2).
- Account/project scoping mirrors `people`: derived from PM account/project ownership.

---

## Cross-module boundary (the spike's core question)

| Concern | Owner | Notes |
|---|---|---|
| Requisition, candidate, interview, offer, application | **hiring** | recruitment SoR |
| **Project staffing demand** (roles a project needs) | **pm** | a req references demand; OQ: does hiring read demand from pm, or pm raises reqs into hiring? |
| **Allocation** created on mobility approval / hire | **pm** | hiring's H-C2 approval / H-C5 hire *emits*; pm fills the placeholder as soon as a `worker_id` exists |
| **Open position** (internal seat to fill) | **people** | replacement/backfill reqs target a people position (P-C2); hire fills it |
| **New employee** on offer-accept | **people** | `hiring.candidate.hired` → `people.worker.created` (carries `resource_request_id`; overview §6) |
| **Fulfillment lifecycle** (one request, one seat) | **hiring** | `resource_request_fulfillment` saga (state + timeout + losing-path cancel) — DDD-D1/D6 |
| Interview feedback scoring | shared instrument | versioned scorecard template (OQ-H3) shared with `people` P-C10 |

**Resolved (see [`ddd-design.md`](./ddd-design.md) + [pm spike](./pm.md)):**
- **OQ-H1 → RESOLVED:** demand is a **placeholder allocation** in `pm` (**one seat**); on an unfilled
  placeholder pm emits `pm.resource_request.opened` and `hiring` **authors a requisition** linked to
  `resource_request_id` (no FK).
- **OQ-H2 → RESOLVED (event-driven):** on PMO mobility approval `hiring` emits `hiring.mobility.approved`;
  on offer-accept `hiring.candidate.hired` → `people` creates the Worker → `people.worker.created`
  (carries `resource_request_id`). **`pm` consumes either** and **fills the placeholder as soon as the
  `worker_id` exists** (committed, possibly future-dated) — *not* at onboarding-complete. pm = capacity
  gatekeeper + allocation SoR; no synchronous cross-module call. **hiring owns the
  `resource_request_fulfillment` saga** that tracks the request and cancels the losing in-flight path.
- **OQ-H3 → RESOLVED (schema-level reuse):** interview/candidate scoring reuses `people`'s scorecard as
  a **versioned template pinned by `scorecard_template_id`** + a normalized `interview_score` child;
  hiring projects `rm_scorecard_template`/`rm_scorecard_criterion` from people to render/validate it
  without a cross-schema FK.

---

## Step 3 — Domain operations (use cases)

`C`=command, `Q`=query. Writes commit their event via `withEmit`; agent-driven writes are HITL-gated;
RBAC re-checked at the callee.

### H-C1 — Requisitions

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `createRequisition` | C | Recruiter / Strategic | title (req), **JD detail** (about/responsibilities/requirements/nice-to-have — required), job profile (role+grade), account, skills+levels, `kind` (replacement/new), interview mode; links `resource_request_id` (pm placeholder) and/or `position_id` (people) | `status=Open`, stage=Sourcing; opens the `resource_request_fulfillment` saga; emits `hiring.requisition.opened`; audit |
| `updateRequisition` / `getJD` | C/Q | Recruiter | edit fields/JD | audit |
| `advanceReqStage` | C | Recruiter | pipeline `Sourcing → Screening → Interview → Offer` | audit |
| `closeRequisition` | C | Recruiter / Strategic | filled or cancelled | emits `hiring.requisition.closed`; audit |

### H-C2 — Internal mobility (applications)

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `getMatchedOpenRoles` | Q | Member (self) | **"Recommended for you"** — literal skill+grade overlap vs open reqs (match count); Member-scoped | — |
| `submitApplication` | C | Member (self) | apply to an open req; note | `status=Submitted`; emits `hiring.application.submitted`; notifies releasing-EM; audit |
| `withdrawApplication` | C | Member (self) | while in-flight (pre-approval) | `status=withdrawn`; audit |
| `endorseApplication` | C | releasing-EM, then receiving-EM | **HITL** endorse (with spare-capacity note) | advances chain; audit |
| `reviewApplication` (PMO) | C | PMO | **capacity check** | `PMO review` state; audit |
| `approveApplication` | C | PMO | final approval at N% allocation; **projected-utilization check** (reads pm allocation read-model); >100% requires explicit **`override_overallocation`** | `Approved`; **emits `hiring.mobility.approved`** (worker_id, project_id, `placeholder_allocation_id`, pct) → pm fills the placeholder (committed, possibly future-dated); saga → `filled`; notifies; audit |
| `rejectApplication` | C | any approver | with reason | `Rejected`; audit |

**Mobility state machine:** `Submitted → Releasing-EM endorsed → Receiving-EM endorsed → PMO review →
Approved / Rejected`. Approval is the **only** path that creates a PM allocation.

### H-C3 — External candidates

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `createCandidate` / `updateCandidate` | C | Recruiter | profile, source, **CV** → `shared-storage` | audit |
| `parseCandidateCV` | C | Recruiter | CV upload → **extract** name/email/phone/skills/seniority (literal/dictionary, per hybrid-match — NOT embeddings) → recruiter confirms | populates `candidate.skills`/`seniority`; audit |
| `matchJdToCandidate` | Q | Recruiter | JD ↔ CV skill overlap score + fast-track hint (literal first) | — |
| `advanceCandidateStage` | C | Recruiter | `Sourcing → Screening → Interview → Offer`; or reject (with `reject_reason`+`tags`) | audit |
| `getTalentPoolMatches` | Q | Recruiter | rejected candidates × open reqs (skill/role match) | — |
| `listCandidates` / `getCandidate` | Q | scoped | by req / pipeline stage | — |

### H-C4 — Interviews

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `scheduleInterview` | C | Recruiter | round, panel, date/time, duration, **mode (online/onsite)**; online → **MS Teams link via `integrations`** | emits `hiring.interview.scheduled`; calendar + reminders; audit |
| `submitInterviewFeedback` | C | panel (EM/Lead) | **result** (Pass/Hold/Fail), **rating** (1–5), **recommendation** (Hire/Next/No-hire), **Teams transcript pull** (`integrations`), notes; scored against the **pinned `scorecard_template_id`** → per-criterion `interview_score` rows | emits `hiring.interview.completed`; audit |
| `cancelInterview` / `reschedule` | C | Recruiter | reason | audit |

### H-C5 — Offers

| Op | Type | Actor | Rules | Effects |
|---|---|---|---|---|
| `createOffer` | C | Recruiter | comp, start date, position (people), project (pm) | `Draft`; audit |
| `approveOffer` | C | Strategic | **HITL** | `Approved`; audit |
| `recordOfferDecision` | C | Recruiter | accept / decline | **accept → emits `hiring.candidate.hired`** → people creates Worker + emits `people.worker.created` (carries `resource_request_id`) → pm fills the placeholder (committed, possibly future-dated); onboarding then advances lifecycle only; decline → close/loop; audit |

### H-C6 — Knowledge base

| Op | Type | Actor | Notes |
|---|---|---|---|
| KB CRUD | C/Q | Recruiter/Strategic | JD templates, interview guides, playbooks *(OQ-7: reuse `knowledge` module vs hiring-local)* |

### H-C7 — Recruitment reports

| Op | Type | Actor | Notes |
|---|---|---|---|
| `getRecruitmentMetrics` | Q | scoped | funnel/pipeline by stage, time-to-fill, open reqs, source effectiveness, interview load |

---

## Step 4 — Module & function linking

### Events emitted

| Event | Op | Consumers |
|---|---|---|
| `hiring.requisition.opened` / `closed` | H-C1 | people (position context), pm, notifications |
| `hiring.application.submitted` | H-C2 | notifications (releasing-EM) |
| `hiring.mobility.approved` | H-C2 | **pm** (fill placeholder w/ named worker), notifications |
| `hiring.interview.scheduled` / `completed` | H-C4 | notifications (reminders) |
| `hiring.offer.made` | H-C5 | notifications |
| `hiring.candidate.hired` | H-C5 | **people** (creates Worker → `people.worker.created` carries `resource_request_id` → pm fills placeholder; onboarding then lifecycle-only) |

### Consumed / calls

| Direction | Module | What |
|---|---|---|
| consumes | **pm** | `pm.resource_request.opened` (unfilled placeholder) → author a requisition referencing `resource_request_id` |
| consumes | **people** | `people.position.opened` (backfill/replacement demand context); `people.worker.created` (on-hire link) |
| calls | **people** | read employee (mobility applicant); projects the **versioned scorecard template** (H-C4) |
| calls | **integrations** | MS Teams meeting links + transcript pull (H-C4) |
| calls | **shared-storage** | CV + offer-letter document vault |
| contributes | **agent** | read tools (reqs/candidates/pipeline/interviews) + HITL writes (create req, schedule interview, endorse/approve mobility, make/approve offer) |

`hiring` never calls `pm` synchronously to allocate — it **emits**, pm consumes (OQ-H2). hiring owns the
`resource_request_fulfillment` saga (one seat per request). No cross-schema FK; account/project/position
referenced by id.

---

## Step 5 — WBS (buildable slices)

| Slice | Scope | dep | ext |
|---|---|---|---|
| **HIR-1 Foundation** | scaffold (`pnpm gen module hiring`), `hiring` schema + `schemaFilter`, RBAC (+ **Recruiter** role), events/audit | — | identity |
| **HIR-2 Requisitions + JD** | H-C1 (create/edit/stage/close, JD); link `resource_request_id`/`position_id` | HIR-1 | pm demand, people position (refs) |
| **HIR-3 Candidates + pipeline** | H-C3 (candidate CRUD, pipeline, CV vault) | HIR-2 | shared-storage |
| **HIR-4 Interviews + feedback** | H-C4 (schedule, feedback via scorecard instrument, Teams) | HIR-3 | integrations (Teams), people (scorecard) |
| **HIR-5 Offers + hire** | H-C5 (offer, approve, accept→`hiring.candidate.hired`) | HIR-3 | people, pm (consumers) |
| **HIR-6 Internal mobility** | H-C2 (apply, endorsement chain, PMO approve→`hiring.mobility.approved`) + fulfillment saga | HIR-2 | people (employee read), pm (allocation consumer) |
| **HIR-7 Knowledge base** | H-C6 | HIR-1 | knowledge module? (OQ-7) |
| **HIR-8 Recruitment reports** | H-C7 | HIR-2..6 | — |

**Critical path:** HIR-1 → HIR-2 → {HIR-3 → HIR-4 → HIR-5} (external pipeline) and HIR-2 → HIR-6
(internal mobility, parallel). HIR-7/8 independent. External-hire MVP = HIR-1→2→3→5; mobility MVP =
HIR-1→2→6.

---

## Step 6 — System design

> Governed by [`ddd-design.md`](./ddd-design.md): `hiring` is a downstream **ACL** consumer of
> `people` (Worker → local HireTarget/applicant) and a **Customer/Supplier** peer of `pm` (pm =
> demand customer, hiring = supplier).

### 6.1 Internal layout (mirrors existing modules)
```
packages/hiring/src/
  index.ts · events.ts · rbac.ts · contracts.ts · agent-tools.ts · register.ts
  backend/
    db/{schema.ts, pg-schema.ts, index.ts}      # pgSchema('hiring'), schemaFilter:['hiring']
    domain/*.ts                                  # one file per command/query (withEmit on writes)
    projections/*.ts                             # ACL: people-worker, pm-resource-request, account/project lookup
    scoring/                                     # reuses people's scorecard instrument (interview feedback)
    http/*.ts · jobs/*.ts · agent-tools/register.ts
  drizzle.config.ts                              # schemaFilter: ['hiring']
```

### 6.2 Public surface & HTTP API (`/api/hiring`)
| Route | Method | Op |
|---|---|---|
| `/requisitions` · `/:id` · `/:id/stage` · `/:id/close` | GET/POST/PATCH | H-C1 |
| `/candidates` · `/:id` · `/:id/stage` | GET/POST/PATCH | H-C3 |
| `/applications` · `/:id/{endorse,review,approve,reject}` | GET/POST | H-C2 (mobility chain, HITL) |
| `/interviews` · `/:id/feedback` · `/:id/cancel` | GET/POST | H-C4 (feedback reuses scorecard instrument) |
| `/offers` · `/:id/approve` · `/:id/decision` | POST | H-C5 (HITL approve; decision fires `hiring.candidate.hired`) |
| `/knowledge/*` | GET/POST | H-C6 (OQ-7) |
| `/reports` | GET | H-C7 |

`open-roles` view = `GET /requisitions?scope=open` (Member-visible). Permissions/tile surface via
`GET /api/me`.

### 6.3 RBAC (`./rbac`) — adds the **Recruiter** role
`HIRING_PERMISSIONS`: `hiring.requisition.read|write`, `hiring.candidate.manage`,
`hiring.application.submit|endorse|approve`, `hiring.interview.schedule|feedback`,
`hiring.offer.create|approve`, `hiring.kb.read|write`, `hiring.reports.read`. Member gets
`requisition.read` (open roles) + `application.submit`. Account/project scoping mirrors `people`
(derived from pm allocation/ownership).

### 6.4 Jobs
| Job | Trigger | Does |
|---|---|---|
| `interview-reminder` | cron | upcoming interviews → notify panel + candidate |
| `offer-expiry` | cron | offers past decision deadline → notify recruiter |
| `pipeline-sla` | cron | stale candidates/reqs per stage → attention list |
| `mobility-approval-route` | on endorse/approve | notify the next approver in the chain |
| `fulfillment-timeout` | cron / `timeout_at` | `resource_request_fulfillment` past `timeout_at` → escalate or cancel the request |

### 6.5 Projections (ACL, idempotent on `event_id`, replayable/rebuildable from `core.events`)
| Projection | Source | Local model |
|---|---|---|
| applicant / hire-target (`rm_worker`) | `people` `people.worker.*` | minimal Worker facts for internal-mobility applicants + on-hire linking |
| resource-request (demand, `rm_resource_request`) | `pm` `pm.resource_request.opened` | open demand (**one seat**, no count) → suggest/author a requisition (`resource_request_id`) |
| scorecard template (`rm_scorecard_template`/`rm_scorecard_criterion`) | `people` scorecard config | render/validate the interview instrument + pin a `scorecard_template_id` without a cross-schema FK (OQ-H3) |
| account/project lookup (`rm_account_project`) | `pm` `pm.account.*`/`pm.project.*` | id→name for req scoping/display |

### 6.6 Composition & 6.7 enforcement
`register.ts` wires subscribers (6.5), RBAC, agent tools (read + HITL writes: create req, schedule
interview, endorse/approve mobility, make/approve offer), HTTP routers, jobs — at the
server/worker composition root. **hiring owns the `resource_request_fulfillment` saga**
(`open→in_progress→filled|cancelled|timed_out` + `timeout_at`): when one path fills the request it
cancels the losing in-flight path; out-of-order arrivals follow the global park-vs-noop policy. Own
Drizzle client; no cross-schema FK; account/project/worker/position/resource_request referenced by id.
`hiring.candidate.hired` / `hiring.mobility.approved` emitted exactly once (idempotent); every command
audits via `core.events`.

## Step 7 — Database design
→ **[`db-design.md`](./db-design.md)** — the `hiring` schema section (requisition, candidate,
application + application_event, interview + interview_score, offer, resource_request_fulfillment,
kb_article) + `rm_worker`/`rm_resource_request`/`rm_scorecard_template`/`rm_scorecard_criterion`/
`rm_account_project` ACL read-models.
