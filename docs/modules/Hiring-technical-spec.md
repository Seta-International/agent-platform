# Software Requirements Specification — Hiring Module

| | |
|---|---|
| **Module** | `hiring` (Recruitment / ATS) |
| **Companion product PRD** | [`Hiring-PRD.md`](./Hiring-PRD.md) |
| **Status** | Draft · 2026-06-18 |
| **Standard** | ISO/IEC/IEEE 29148 |
| **Audience** | Engineering |

> Engineering spec (real schema/event/permission identifiers). Plain behavior lives in the PRD; PRD
> owns *what*, this owns *how*. Supersedes the `hiring` portions of `docs/spike/` (stale).

---

## 1. Introduction

### 1.1 Purpose
Implementable requirements for `hiring` — requisitions, candidates, interviews, offers, internal mobility, the one-seat fulfillment saga, and recruitment analytics.

### 1.2 Scope
`hiring` is the SoR for the recruitment pipeline. It **reads** demand from `pm` and worker/scorecard facts from `people` (via ACL read-models), **selects**, and on a hire **hands the person to `people`** (which owns the employee). It never mutates an employment record; it emits, others consume. No cross-schema FK.

### 1.3 Definitions & acronyms
- **Requisition** — one open seat (one req = one seat). **Candidate** (external, hiring-owned) / **Application** (internal mobility).
- **Fulfillment saga** — `resource_request_fulfillment`: tracks one PM placeholder → requisition → fill, with timeout + losing-path cancel.
- **Person-match** — the duplicate/rehire check at the hire boundary that links a returner to their existing `people` person.
- **CV** — curriculum vitae. **EM** — Engineering Manager. **PMO** — Project Management Office (the mobility capacity gate). **SoR** — system of record.

### 1.4 Overview (plain words)
`hiring` runs the funnel and the internal-mobility approval chain, guards the boundary with a person-match so re-hires don't duplicate people, and triggers a `people` job change (movement) when an internal move changes role/grade. One requisition fills one seat; the saga cancels the losing path.

---

## 2. Overall Description

### 2.1 Product perspective
Feature-tier module. Depends on `core`, `identity`, `shared-storage` (CV/offer-letter vault), `integrations` (MS Teams links + transcript). ACL consumer of `people` (Worker→`rm_worker`, scorecard→`rm_scorecard_*`) and Customer/Supplier peer of `pm` (demand→hires). Consumed by `pm`, `people`, `notifications`.

### 2.2 Product functions
H-C1 Requisitions (incl. **demand→auto-author**) · H-C2 Internal mobility (endorsement chain + PMO gate) · H-C3 Candidates + CV parse · H-C4 Interviews + scoring · H-C5 Offers + hire (incl. **person-match**) · H-C6 Recruitment analytics · H-C7 Reports · fulfillment saga.

### 2.3 User characteristics
Tiers: Strategic (BOD/Admin/**PMO**), **Recruiter (HR)**, Account Manager, Team Lead/EM, Member ("Open Roles" + apply). PMO is the final mobility approver. Recruiter scope = **assigned accounts**.

### 2.4 Constraints
`pgSchema('hiring')`, `schemaFilter: ['hiring']`; no cross-schema FK; `withEmit` transactional outbox; multi-tenant + RLS; idempotent subscribers; HITL on agent-driven writes. `hiring.candidate.hired`/`hiring.mobility.approved` emitted **exactly once** (idempotent guard).

### 2.5 Assumptions & dependencies
- `pm` emits `pm.resource_request.opened` (one seat) and consumes `hiring.mobility.approved`/`hiring.requisition.*`.
- `people` projects `rm_worker` + `rm_scorecard_template/criterion`, consumes `hiring.candidate.hired` (carrying matched `person_id?`) and `hiring.mobility.approved`.
- `integrations` Teams meeting/transcript (stub until ready).
- CV parsing is **literal/dictionary** (recruiter-confirmed), **not embeddings**.

---

## 3. Specific Requirements (→ PRD F-IDs)

**FR-1 Requisitions (F-REQ-1/2/3/4).** `createRequisition` (JD required; links `resource_request_id?`/`position_id?`), `updateRequisition`, `advanceReqStage` (`sourcing→screening→interview→offer`), `closeRequisition` (`filled|cancelled`). **`autoAuthorRequisition`** consumes `pm.resource_request.opened` → drafts a requisition linked to `resource_request_id` + opens the fulfillment saga; **idempotent (deduped on `resource_request_id`, unique)** so at-least-once delivery never drafts two. Status `open|on_hold|filled|cancelled`. Member-visible open-roles view = `GET /requisitions?scope=open`.

**FR-2 Internal mobility (F-MOB-1/2/3).** `submitApplication`/`withdrawApplication` (pre-PMO-decision only), `endorseApplication` (releasing-EM → receiving-EM; HITL, spare-capacity note), `reviewApplication` (PMO capacity check), `approveApplication` (final; **projected-utilization check**, `>100%` requires `override_overallocation` recorded with approver+reason). On approve emits `hiring.mobility.approved` (`worker_id`, `project_id`, `placeholder_allocation_id`, `pct`, **`to_position_id?`**, **`to_grade?`**) → **`pm` fills placeholder** and **`people` opens a `movement_request(source=internal_mobility)`** when role/grade changes (the target role/grade rides the payload so `people` need not look it up). Emitted once via a `mobility_event_id` guard on `application`. The `>100%` projected-utilization check reads **`pm.getUtilization(...)`** at PMO approve. `reviewApplication` and `approveApplication` are two actions within the single `pmo_review` state. `rejectApplication` with reason. `getMatchedOpenRoles` (literal skill+grade overlap) backs the Member "recommended for you" view.

**FR-3 Candidates (F-CAND-1..5).** `createCandidate`/`updateCandidate` (CV→`shared-storage`), `parseCandidateCV` (extract name/contact/**dob/gender**/seniority/skills → recruiter confirms; nothing saved unconfirmed), `matchJdToCandidate` (overlap score + fast-track hint), `advanceCandidateStage` (`new→screening→interview→offer→hired`; reject with `reject_reason`+`tags`), `getTalentPoolMatches` (rejected × open reqs). **Alumni sourcing:** `projectAlumni` consumes `people.worker.deactivated` (stage→alumni) into `rm_worker`; the **alumni candidate segment** is surfaced as `rm_worker WHERE stage=alumni` (a returner is sourced here and linked at hire by the person-match, FR-5).

**FR-4 Interviews (F-INT-1/2/3).** `scheduleInterview` (round, panel≥1, mode; online→Teams link via `integrations`; if `integrations` is down, allow **manual `meeting_link` entry** rather than hard-fail; auto-advance stage), `submitInterviewFeedback` (result `pass|hold|fail`, rating 1–5, recommendation, transcript pull — manual paste if Teams down; scores vs the **scorecard template+criteria snapshotted locally at schedule time** (immutable copy, not a live `rm_scorecard_*` read, so QA-14 holds) → `interview_score` rows), `cancelInterview`/`reschedule`/**`markNoShow`** (status `no_show` + reason). Reminders default day-before.

**FR-5 Offers + hire + person-match (F-OFFER-1..4).** `createOffer`→draft, `approveOffer` (HITL, Strategic), `recordOfferDecision` (accept|decline; accept advances the candidate to `hired`). On accept: **`personMatch`** calls `people.matchPerson(identity|email|name+dob)` — a **unique strong-key (identity/email) match auto-links**; an **ambiguous / name-only / multi-match requires recruiter confirmation (HITL), never auto-merge**; no match ⇒ new person. Then emit `hiring.candidate.hired` carrying **`candidate_id`, `target position_id`, `resource_request_id`, `person_id?`** → `people` adds a new employment period to the existing person (rehire) or creates one. *Inv:* one accepted offer per candidate; `hired_event_id` fires once. **F-OFFER-4** respond-by → `offer-expiry` job → `expired` + emit `hiring.offer.expired` (→ notifications).

**FR-6 Fulfillment saga (F-FILL-1).** `resource_request_fulfillment` `open→in_progress→filled|cancelled|timed_out` (`open→in_progress` on requisition open / first application). The **`fillPlaceholder` CAS runs in `pm`** (pm owns the allocation), keyed on placeholder `allocation.id` (exactly once); hiring's saga **reacts** to the fill — marking `filled` and cancelling the losing in-flight path (the other requisition/application) — as soon as a `worker_id` exists (mobility-approve / worker-create). `fulfillment-timeout` job past `timeout_at` emits `hiring.fulfillment.timed_out` (→ notifications: PMO + assigned recruiter).

**FR-7 Reports & insight (F-RPT/F-KB).** `getRecruitmentMetrics` (funnel, time-to-fill, leadtime, roles-at-risk + stale-stage attention list, recruiter/source effectiveness). KB = closed-position analytics (pass-rate by round, failure clusters, improvement plan, case-study log) — **not** a JD CMS (OQ-1).

**FR-8 Cross-cutting.** Audit every command; candidate-contact + offer-comp masked to non-recruiter/non-Strategic; account scoping from `rm_account_project` (recruiter by assignment).

**FR-9 Documents (F-DOC-1).** Candidate CVs and offer letters live in the `shared-storage` vault (`cv_storage_key`; offer-letter key on `offer`), with a supersede version chain.

## 3.2 External interfaces
`/api/hiring/*` — requisitions, candidates, applications(+/:id/{endorse,review,approve,reject}), interviews(+/:id/feedback,/cancel), offers(+/:id/approve,/decision), knowledge, reports. **In:** `pm.resource_request.opened`, `pm.account.*`/`pm.project.*`, `people.worker.*`, `people` scorecard config. **Out:** `shared-storage`, `integrations` (Teams).

## 4. Verification (→ PRD §10)
Real-Postgres tests: auto-author from demand (QA-32); person-match rehire → existing person (QA-46); mobility role change → `people` movement (QA-47); one accepted offer (QA-16); hire fires once (QA-18); offer expiry (QA-41); saga cancels losing path (QA-23).

---

## Appendix A — Data model (`hiring` schema)
`requisition` (`status open|on_hold|filled|cancelled`, `stage`, `resource_request_id null`, `position_id null`, `kind replacement|new`, `jd jsonb`, `owner_user_id` (recruiter), `closed_at`; uniq `(tenant_id, resource_request_id)`); `requisition_skill` (normalized, was `skills jsonb`); `candidate` *(the **person** — no per-role stage here)* (`source`, `contact jsonb`, `dob`, `gender`, `cv_storage_key`, `seniority`, **`segment` (incl. alumni)**, `source_cost`); `candidate_skill` (normalized); **`application` (UNIFIED — external candidate × requisition OR internal worker × requisition)** (`requisition_id`, `kind external|internal`, `candidate_id?`/`worker_id?` with CHECK exactly-one, `stage` (external pipeline `new…hired|rejected`), `status` (internal endorsement chain), `rating`, `alloc_pct`, `override_overallocation`, `mobility_event_id` guard, `reject_reason`, `tags`; uniq `(requisition_id, candidate_id)` / `(requisition_id, worker_id)`); `candidate_event` (external stage history → funnel/lead-time/timeline); `application_event` (internal endorsement history); `interview` (`application_id`, `round`, `mode`, `meeting_link`, `status …|no_show`, `result pass|hold|fail`, `rating`, `recommendation`, `transcript`, **pinned `scorecard_template_id` + immutable snapshot**); `interview_panelist` (normalized, was `panel jsonb`); `interview_score` (normalized by `criterion_id`); `offer` (`application_id`, `candidate_id`, `status …|expired`, `respond_by`, `hired_event_id` guard, partial uniq accepted-per-candidate); `resource_request_fulfillment` (saga; uniq placeholder); `recruiter_account_assignment` (recruiter scope by assignment); structured insight `kb_failure_theme` / `kb_theme_case` (+ `kb_article` prose).
**Read-models (ACL):** `rm_worker` (from `people` — **also the person-match source**), `rm_resource_request` (from `pm`), `rm_scorecard_template`/`rm_scorecard_criterion` (from `people`), `rm_account_project` (from `pm`).
> Migration delta vs spike: add `offer.respond_by` + `expired` state; add `candidate.segment`; add the `personMatch` path on `recordOfferDecision` (carry `person_id?` on `hiring.candidate.hired`).

## Appendix B — Event catalog
**Emitted** (consumer in parens): `hiring.requisition.opened`/`closed` (→ *pm*: saga/demand); `hiring.application.submitted` (→ *notifications*); `hiring.mobility.approved` (`worker_id`,`project_id`,`placeholder_allocation_id`,`pct`,`to_position_id?`,`to_grade?`) (→ ***pm + people***); `hiring.interview.scheduled`/`completed` (→ *notifications*); `hiring.offer.made`/`hiring.offer.expired` (→ *notifications*); `hiring.candidate.hired` (`candidate_id`,`target position_id`,`resource_request_id`,`person_id?`) (→ *people*); `hiring.fulfillment.timed_out` (→ *notifications*).
**Consumed:** `pm.resource_request.opened`, `pm.account.*`/`pm.project.*`, `people.worker.*` (→ `rm_worker`), **`people.worker.deactivated`** (→ seed alumni segment), `people` scorecard config (→ `rm_scorecard_*`).

## Appendix C — State machines
Requisition `open(sourcing→screening→interview→offer)|on_hold|filled|cancelled`; Candidate `new→screening→interview→offer→hired|rejected`; Application `submitted→releasing_endorsed→receiving_endorsed→pmo_review→approved|rejected` (+withdrawn pre-decision); Offer `draft→approved→sent→accepted|declined|expired`; Fulfillment `open→in_progress→filled|cancelled|timed_out`.

## Appendix D — Permission matrix
`HIRING_PERMISSIONS`: `hiring.requisition.read|write`, `hiring.candidate.manage`, `hiring.application.submit|endorse|approve`, `hiring.interview.schedule|feedback`, `hiring.offer.create|approve`, `hiring.kb.read|write`, `hiring.reports.read`. Member = `requisition.read` (open roles) + `application.submit`. PMO holds `application.approve`. Recruiter scope = assigned accounts.

## Appendix E — Open questions / decisions
**OQ-1** JD-template store separate from KB analytics. **OQ-3** Teams integration availability. **OQ-8** candidate communication scope. Decisions: mobility feeds a `people` movement; person-match links rehires to existing person; one req = one seat; CV parse literal not embeddings.

## Appendix F — Cross-module ripple
- `hiring.mobility.approved` has **two consumers** now (`pm` fill + `people` movement-on-role-change).
- `hiring.candidate.hired` carries `person_id?` from the person-match so `people` never duplicates a person on re-hire.
- `pm.resource_request.opened` is the **only** demand path (no `position.opened → hiring`); a `people` open position routes through `pm` as a placeholder first.

## Appendix G — Scheduling & calendar sync (RRULE + Teams/Google), research-grounded

Standards: RFC 5545 (iCalendar/RRULE), RFC 5546 iTIP / RFC 6047 iMIP, Microsoft Graph calendar + Teams online-meeting, Google Calendar API.

- **Recurrence = RFC 5545 RRULE** is the canonical internal model for `interview` (and any user calendar event): store `dtstart` + `tzid` (IANA, **zoned not UTC** so DST survives) + `rrule` + `exdate[]`/`rdate[]`, with a `calendar_event_override` child keyed by **`recurrence_id`** (the *original* instant). **Expand occurrences on read** over a bounded window; never materialize an unbounded tail. Microsoft Graph's structured `patternedRecurrence` is a **boundary adapter** (a subset of RRULE — validate `BYSETPOS`/`RDATE`/sub-daily before pushing; else expand to discrete events). Google stores RRULE verbatim.
- **Identity hub = our own `interview.ical_uid` / internal id — NOT a shared `iCalUID`.** Google's iCalUID is portable; **Graph's `iCalUId` is read-only and per-occurrence**, so it can't be the cross-provider key. Map per provider in `integrations.external_calendar_link` (provider, `external_event_id`, `etag_or_changekey`, `sequence`, snapshot, soft-unlink).
- **Two-way sync = webhook + delta/sync-token** (never webhook-only): Graph subscriptions (≤7-day, renew early; handle `reauthorizationRequired`/`subscriptionRemoved`/`missed`) + delta; Google `watch` + `syncToken` (full-resync on `410 Gone`); poll fallback. **Idempotent create** via Graph `transactionId` / Google `requestId`; **optimistic concurrency** via `If-Match` ETag/changeKey → 3-way merge emitting a `calendar.field-conflict` event (never silent last-write-wins). **iMIP `.ics` email** (stable UID + monotonic SEQUENCE, `METHOD:CANCEL` on cancel) is the universal fallback.
- **Ownership:** the schedule shape is domain-owned (`hiring`); the external mapping + sync state live in **`integrations`** (`external_calendar_link`, `calendar_sync_state`), referenced by id (no cross-schema FK), reusing the existing M365 webhook/ETag/3-way-merge/token-bucket primitives. Flow: `interview.scheduled` → integrations creates the Graph/Google event (+ Teams `joinUrl`) → projects `external_event_id`/`meeting_link` back.
- **Resource allocation stays bespoke** (`minutes_per_day` + `weekday_mask` + sparse `allocation_day_override`) — RRULE is wrong for *continuous fractional capacity*; this matches Runn/Float/Kantata. Precedence: override > weekday_mask > minutes_per_day.

## Appendix H — v3 hardening

Shares the People spec's Appendix H decisions (temporal `EXCLUDE`, generic `core.audit_log`, CQRS read-model directory, BRIN/partitioning, RLS). Hiring-specific: unified `application` is the ATS central object (Greenhouse model, validated); offer/decision audit columns added; `candidate_event`/`application_event` indexed for funnel/lead-time; matched-skills normalized (`requisition_skill`/`candidate_skill`).
