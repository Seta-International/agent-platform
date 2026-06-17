# People/HR + PM — benchmarking against mature systems

> Research synthesis (2026-06-16) benchmarking our design against **Workday**, **SAP SuccessFactors**,
> **Odoo HR**, and PSA tools (**Kantata**, Runn/Float, BigTime), with HiBob/BambooHR inferred from
> category consensus. 25 claims adversarially verified (2-of-3 vote), 0 refuted. Confidence noted per
> item. Feeds decisions before `people` Step 7 (DB design) and the `hiring`/PM module docs.

## 1. What's validated (keep as-is)

- **Three-way ownership split is correct and standard** *(high)*. Mature suites put the **employee
  system-of-record in HR-core** (SAP Employee Central, Workday "Worker"); **identity/auth consumes it
  downstream** ("HR-driven identity" — the HRIS is the source of authority, IdPs read
  dept/title/manager/location). → our `people` = SoR, `identity` = auth-only is right.
- **The people↔project↔billing↔utilization chain belongs in PM/PSA, not HR-core** *(high)*. Kantata/
  PSA own skills-based allocation, utilization, and project financials (budget/billing/invoicing/
  time-&-expense). → our PM module owning Account→Project→Allocation is right. *Caveat:* PSA is the
  **operational** SoR; payroll/accounting books stay further downstream.
- **Skills as a domain with proficiency** *(high)*. Workday "Skills Cloud" / Odoo skill tracking treat
  skills as first-class (taxonomy + proficiency), not a string column. → our skills model (name,
  category, proficiency, experience) is on the right track; PM **consumes** skills for matching and
  owns **cost/bill rates** (resourcing data), not `people`.

## 2. Recommended refinements (decisions needed)

| # | Recommendation | Why (source) | Confidence | Effort |
|---|---|---|---|---|
| **R1** | **Model Position/"seat" + Supervisory-Org as first-class objects**, distinct from the worker record | Workday separates Worker / Position (a "chair" bound to a job profile; persists across people; history tracked) / Supervisory Org (reporting hierarchy). Decouples **headcount/budget** + org structure from individuals; lets **hiring requisitions target an open position**; movement/lifecycle don't rewrite the worker. | high | medium-high |
| **R2** | **Add Time-off / Leave management** to `people` | Standard in every suite (Odoo/Workday/SAP). We have no leave model; `status=leave` is a flag, not balances/requests/approvals. | high | medium |
| **R3** | **Reframe evaluation from point-in-time scorecards → recurring review cycles + Goals/OKRs** | Workday/SAP run performance *cycles* with goals; our P-C10 is a single scorecard. For billable consultants, cycles should consume **PM delivery/utilization signals**. | high | medium |
| **R4** | **Headcount / workforce planning**, tied to the Position object (R1) | Workday HCM bundles it; natural fit once positions exist; links to hiring demand. | medium | medium |
| **R5** | **Timesheets / attendance → PM/PSA**, `people` consumes only **aggregate leave balances** | For an outsourcing firm, time tracking drives utilization + billing → PSA-owned. Avoids duplicating in `people`. | high | (boundary) |
| **R6** | **Compensation / payroll / benefits → defer or integrate-only** | HRIS owns comp-relevant attributes (level/title/tenure); deep comp planning, payroll, benefits read from it via a dedicated platform (one-way sync). Most over-engineered to build in-house. | medium | (defer) |

## 3. Feature-gap summary vs. major suites

| Capability | In our design? | Recommendation |
|---|---|---|
| Employee record / org chart / docs | ✅ (P-C1/2, vault) | keep; add Position object (R1) |
| Skills + proficiency | ✅ (P-C1) | keep; elevate to first-class taxonomy; expose to PM |
| Lifecycle (onboard/probation/movement/offboard) | ✅ (P-C5–9) | keep |
| Evaluation | ⚠️ point-in-time only (P-C10) | → review cycles + goals/OKRs (R3) |
| Recruitment | ✅ (`hiring`) | keep; link requisition→position (R1) |
| **Time-off / leave** | ❌ | **add to `people`** (R2) |
| **Attendance / timesheets** | ❌ | **PM/PSA-owned** (R5) |
| **Compensation mgmt** | ❌ (only stored fields) | defer / integrate (R6) |
| **Payroll / benefits** | ❌ | integrate-only (R6) |
| **Headcount planning** | ❌ | add, tied to positions (R4) |
| Goals / OKRs | ❌ | with R3 |
| Surveys / engagement, L&D | ❌ | defer (not core for outsourcing now) |

## 4. Decisions (resolved 2026-06-16)

**Principle: follow well-known systems; do not reinvent.** Adopt the Workday (Worker / Position /
Supervisory-Org) + Kantata-PSA (resourcing) patterns rather than bespoke models.

- **R1–R4 all adopted** into `people` scope (Position/org as first-class, leave, performance
  cycles+goals/OKRs, headcount planning). R5 (timesheets→external/PM) and R6 (defer comp/payroll)
  adopted as defaults.
- **OQ-10 → people↔PM boundary (RESOLVED):**
  - `people` owns **Worker**, **Position** (internal company org seat: job profile, org-unit,
    headcount status, held-by), **Supervisory-Org / org-units** (reporting + manager), **headcount
    plan**.
  - **PM** owns **Account → Project**, **project role/demand**, **allocation/utilization/bench**,
    **cost/bill rates**.
  - A Worker *holds* a people Position (internal role) and is *allocated by PM* to Projects (billable
    work) — orthogonal. `hiring` requisitions reference PM **demand** and/or an open people
    **position** by id (no FK).
- **OQ-10b → multi-allocation (RESOLVED):** worker↔project is **many-to-many, concurrent, fractional**
  (a person can be on 2 accounts, or 2 projects of one account, at once). Account/project is **not a
  single field** on the employee; membership = the set of current PM allocations, projected into
  `people` for RBAC scoping + display. Utilization = sum of fractional allocations.
- **OQ-11 → leave vs attendance (RESOLVED):** `people` owns **leave** (types, balances, accrual
  policy, requests, approvals). **Attendance/timesheets** stay in the **external timesheet system**,
  pulled via `integrations` now; that timesheet app becomes its **own platform module later**.
  `people` emits leave events; PM/timesheet consume for availability.
- **OQ-12 → performance (RESOLVED):** recurring **review cycles + Goals/OKRs + reviews**
  (self/manager/peer); the scorecard becomes the **review instrument** within a cycle; cycles consume
  PM delivery/utilization signals. Probation stays a separate lifecycle review reusing the instrument.

## 5. Sources & caveats

Primary: Workday HCM datasheet; SAP SuccessFactors Employee Central docs; Workday Position-Management
guides; Kantata PSA pages; Odoo HR whitepaper. Corroborated by Gartner/Wikipedia/independent PSA
blogs. **Caveats:** Workday's *open-position* headcount enforcement applies only under its Position
Management staffing model (adopt selectively). PSA = operational SoR, not financial books. Comp-split
finding rests partly on vendor blogs (medium confidence). No vendor-specific evidence survived for
HiBob/BambooHR/Float/Runn — those are category-consensus inferences.
