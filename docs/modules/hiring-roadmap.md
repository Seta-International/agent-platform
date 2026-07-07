# Hiring — Roadmap

Concise delivery tracker for the Hiring module. The canonical scope/sequencing is [`hiring-prd.md`](hiring-prd.md) — on any disagreement the PRD wins; this page only tracks **status**.

**Status:** ✅ done (merged to `module/hiring`) · 🔵 in review · 🟡 in progress · ⬜ backlog

**Now:** HIR-4 Requisition approval + funded-headcount gate. PR1 (core skill catalog) in progress under HIR-6/7.
**Critical path:** HIR-1 → HIR-2 (requisition CRUD/JD) → candidates & pipeline → interviews → offers.

## Slice status

| Area (PRD §) | Slice | Status |
|---|---|---|
| Foundation | HIR-1 Module foundation (schema, org-isolation, events, RBAC, web scaffold) | ✅ |
| 7.1 Requisitions | HIR-2 Requisition + **Openings** CRUD + JD (resolves OQ-11: req owns 1..N openings, shared pipeline) | ✅ |
| 7.1 Requisitions | HIR-4 Requisition approval + funded-headcount gate | ⬜ |
| 7.1 Requisitions | HIR-5 Open Roles (employee view) + recommended | ⬜ |
| 7.2 Candidates & pipeline | HIR-6 Candidate intake + fit indicator (CV upload/parse auto-fill shipped in FUT-316) | ✅ |
| 7.2 Candidates & pipeline | HIR-7 Candidate pipeline + reject + detail + transfer + talent pool | ✅ |
| 7.3 Interviews | Scheduling, scorecards, feedback | ⬜ |
| 7.4 Offers | Offer drafting, approval, accept/decline | ⬜ |
| 7.5 Internal mobility | Internal applications, worker-subject applications | ⬜ |
| 7.6 One-seat fulfillment | Requisition → hire close-out | ⬜ |
| 7.7 Recruitment reports | Funnel, time-to-fill, source metrics | ⬜ |
| 7.8 Recruitment insight (KB) | Knowledge-base-backed insight | ⬜ |
| 7.9 Documents | CV / offer document vault | ⬜ |
| 7.10 Protection & audit | Sensitive-field masking, scope re-check | ⬜ |
| 7.11 Assistant integration | Hiring assistant tools | ⬜ |

## Recently shipped

- **HIR-1** Module foundation: the three foundation tables (`requisition`/`candidate`/`application`) with the FK-free cross-module-uuid pattern and the unified-application one-subject CHECK; application-layer tenant isolation; the `hiring.requisition.opened` domain event proven through the `core` outbox with an atomicity test; RBAC tiers (strategic/recruiter/viewer) wired into the authoritative inventory; the inbound-subscriber framework; and the `web-hiring` placeholder launcher app.
- **HIR-6/7** Candidates & pipeline: the shared `core` skill catalog (2-level category→skill, level 0–5 on assignments); manual candidate intake + `candidate_skill` + deterministic fit indicator; the board/list pipeline with stage transitions, `candidate_event` activity feed, reject-with-taxonomy + tags, move-to-another-role (new application on target), and the talent pool. CV upload/parse auto-fill shipped (FUT-316: LLM draft → recruiter review → save, with the CV stored per candidate). Remaining LLM work (fit fallback), the `hired`/offer handoff, interviews, and internal-mobility pipeline stay deferred.

## Pointers

- Active specs/plans: `docs/superpowers/specs|plans/2026-06-19-hiring-hir1-*.md` (local working docs, not committed).
- Requirements: [`hiring-prd.md`](hiring-prd.md).
