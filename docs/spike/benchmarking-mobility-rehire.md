# Benchmarking — internal movement vs mobility, and re-hire/boomerang

> Research synthesis (2026-06-18) benchmarking two People↔Hiring boundary decisions against
> **Workday**, **SAP SuccessFactors**, and **Oracle HCM Cloud** (secondary: Workday Talent Marketplace,
> HiBob, Greenhouse; analyst framing from Gartner/Bersin/SHRM). Both load-bearing claims independently
> verified. Feeds the `People` and `Hiring` product PRDs (`docs/modules/`), which are the source of
> truth; this doc records the evidence behind their decisions. Principle: **follow well-known systems,
> don't reinvent.**

## 1. Internal MOVEMENT (HR job change) vs internal MOBILITY (apply to an open role)

**Dominant pattern (all three suites converge):** these are **two subsystems deliberately chained, not
merged.** Recruiting owns *apply → match → select* for internal candidates; on selection, control
**hands off to core HR**, which executes the move as a **typed job-change transaction against the
existing worker record — never a new hire.** A second distinction: **short gigs/projects are NOT job
changes** — a gig allocates a slice of time alongside the primary role and does not alter the
employment record, pay, or job code; only a *full role move* fires the HR transaction.

| Suite | Core-HR move (movement) | Mobility front-end | Handoff |
|---|---|---|---|
| **Workday** | "Change Job" business process (promotion/transfer/lateral/data) | Internal Career Site / Jobs Hub, Talent Marketplace, Gigs, evergreen reqs | internal applicant → "Ready for Hire" stage auto-fires **Change Job** (not Hire), same Employee ID |
| **SAP SuccessFactors** | Employee Central "Job Information" record with Event + Event Reason | Recruiting internal Job Requisition + Opportunity Marketplace | approved internal offer → **Manage Pending Hires → Internal Hire** → writes a new Job Info event on the same employment (no new person) |
| **Oracle HCM Cloud** | HR action: Transfer / Promote / Change Assignment on the worker's assignment | Oracle Recruiting internal candidate | internal offer → **Manage Job Offers (HR – Pending Processing)** → Change Assignment/Promote pre-populated from the offer |

**Recommended model for a `hiring`/`people` split:** `hiring` owns the internal application, match,
interview, selection, and the requisition/offer/headcount approvals. `people` owns the
system-of-record employment change (transfer/promotion/pay/org) and re-checks its own manager/HR
approvals. **Two write paths converge on the same `people` job-change ("movement") transaction:** (1)
HR/manager-initiated (starts in `people`); (2) mobility-initiated (starts in `hiring`, emits a handoff
on selection). `hiring` never mutates the employment record. **A project-only move is a PM
re-allocation, not a movement** (the "gig vs full role move" rule).

Sources: oshr.nc.gov NC-Workday glossary; hr.uw.edu Workday job-application BP; coorstek.com "Move
Workers vs Change Job"; sapinsider.org Manage Pending Hires; help.sap.com Opportunity Marketplace;
docs.oracle.com internal-job-offers / transfer-actions; support.greenhouse.io rehire-and-internal-transfers;
gartner.com internal-talent-marketplaces.

## 2. Re-hire / boomerang (alumni returning)

**Dominant pattern (all three suites converge):** a returner **re-enters through Recruiting as a
candidate**, but on hire the system **matches and links to the prior person record — same person, new
employment period** — rather than creating a duplicate. Every suite ships an explicit **duplicate /
rehire check** (the recruiting application is a separate artifact that does not auto-link).
**Continuous service / seniority is NOT preserved automatically** — original hire date is kept; bridging
prior service is a policy/configuration decision.

| Suite | Mechanism |
|---|---|
| **Workday** | Rehire reuses the same Worker + Employee ID; automatic duplicate pre-hire check on Hire; Original Hire Date preserved, Continuous Service Date defaults to new hire date (manually bridged) |
| **SAP SuccessFactors** | "Rehire Inactive Employee" (reuses person+employment, preserves history) or "Rehire with New Employment" (same `person-id-external`, new employment); Hire/Rehire Configuration duplicate check (name+DOB default); seniority defaults to rehire date |
| **Oracle HCM Cloud** | Rehire reuses the existing Person (same person number) + a new work relationship / period of service; Person Creation Duplicate Check blocks auto-create on a match |

**Recommended model for a `hiring`/`people` split:** the returner enters through `hiring` as a
candidate (treat "alumni pool" as a candidate-pool segment/tag, not a separate module — none of the
suites ship a first-class alumni object). A **person-match / duplicate check at the boundary** (national
id / email / name+DOB) runs before `hiring` emits "hire"; on a match the handoff **carries the existing
person id** so `people` **adds a new employment period to the existing person** (never a second
record). Model `people` as **person ⟶ many employment periods** (Oracle "work relationship" / SF
"multiple employments" precedent). **Continuous service is a `people`-owned policy decision** — keep the
original hire date immutable, set a new start date, compute a separate seniority date that defaults to
the rehire date and can be bridged per policy. Do not promise automatic tenure preservation; no suite
does this by default.

Sources: workday.wustl.edu managing-duplicate-workers; workday.utexas.edu duplicate-pre-hire;
help.sap.com rehiring-inactive-employee-with-new-employment + KBA 2678155/2424358; docs.oracle.com
rehire-a-worker / candidate-duplicate-check; help.hibob.com life-cycle-statuses;
shrm.org rehiring-returning-employees.

## Confidence

- **High:** recruiting selects → core HR records the move as a typed job change against the existing
  worker (never a new hire); rehire = link-to-existing-person + new employment period; explicit
  duplicate checks in all three suites; seniority bridging is manual/policy.
- **Medium:** exact approver sets (tenant-configured everywhere); gig/marketplace/alumni-pool as
  first-class productized features.
- **Flagged:** Workday's internal→Change-Job default rests on customer-tenant job aids (Workday product
  docs are login-gated) but is consistent across 4+ tenants and the `Move_Candidate` API — treat as the
  delivered default, not a hard constraint.
