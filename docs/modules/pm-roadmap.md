# Project Management (PSA) — Roadmap

Concise delivery tracker for the PM module — Seta's delivery system-of-record (accounts, projects, resource allocation, delivery health). The canonical scope/sequencing is [`pm-prd.md`](pm-prd.md) — on any disagreement the PRD wins; this page only tracks **status**.

**Status:** ✅ done (merged to `module/pm`) · 🔵 in review · 🟡 in progress · ⬜ backlog

**Now:** PM-3 Projects & charter flow.
**Critical path:** PM-1 → PM-2 (accounts) → projects & charter flow → resource allocation → delivery health.

## Slice status

| Area (PRD §) | Slice | Status |
|---|---|---|
| Foundation | PM-1 Module foundation (schema, org-isolation, events, RBAC, web scaffold) | ✅ |
| 7.1 Accounts | PM-2 Accounts CRUD | ✅ |
| 7.2 Projects & charter flow | Project records + charter approval ("Requests") | ⬜ |
| 7.3 Resource allocation & utilization | Allocation (placeholder/named bookings), utilization ("RA Monitoring") | ⬜ |
| 7.4 Portfolio & project health | QCDP + RAG portfolio/project health | ⬜ |
| 7.5 Weekly reports | Weekly status reports | ⬜ |
| 7.6 Risks & issues | Risk/issue register | ⬜ |
| 7.7 KPI metrics | KPI programme + operational-health score | ⬜ |
| 7.8 Staffing demand / backfill | Open-demand surfacing → handoff to Hiring | ⬜ |
| 7.9 Retrospectives | Project retrospectives | ⬜ |
| 7.10 Project access (R&R) | Per-project roles & responsibilities | ⬜ |
| 7.11 Protection & audit | Sensitive-field masking, scope re-check | ⬜ |
| 7.12 Assistant integration | PM assistant tools | ⬜ |

## Recently shipped

- **PM-1** Module foundation: the three foundation tables (`account`/`project`/`allocation`) with FK-free cross-module-uuid columns and the allocation worker-rule CHECK (placeholder ⇒ null worker; tentative/committed ⇒ named worker); application-layer tenant isolation; the `pm.account.created` domain event proven through the `core` outbox with an atomicity test; RBAC tiers (strategic/viewer) wired into the authoritative inventory; the inbound-subscriber framework; and the `web-pm` placeholder launcher app.

## Pointers

- Active specs/plans: `docs/superpowers/specs|plans/2026-06-19-pm-pm1-*.md` (local working docs, not committed).
- Requirements: [`pm-prd.md`](pm-prd.md).
