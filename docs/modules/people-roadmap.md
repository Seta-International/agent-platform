# People — Roadmap

Concise delivery tracker for the People module. The canonical scope/sequencing is [`people-wbs.csv`](people-wbs.csv) (skim aid: [`people-wbs.md`](people-wbs.md)); requirements are in [`people-prd.md`](people-prd.md). On any disagreement the WBS/PRD win — this page only tracks **status**.

**Status:** ✅ done (merged to `module/people`) · 🔵 in review · 🟡 in progress · ⬜ backlog

**Now:** PPL-4 Pay & capacity, then the MVP record/directory slices.
**Critical path:** PPL-1 → PPL-3 → PPL-21 → PPL-28 → PPL-29 (foundation → record → lifecycle stage machine → probation → confirmation).

## Slice status

| Epic | Slices | Status |
|---|---|---|
| E1 Foundation | PPL-1 Module foundation | ✅ |
| E1 Foundation | PPL-2 Identity link | ✅ |
| E2 Directory & records | PPL-3 Employee record | ✅ |
| E2 Directory & records | PPL-4 Pay & capacity · PPL-5 Skills · PPL-6 Document vault · PPL-7 Directory & search · PPL-8 Onboard · PPL-9 Bulk import · PPL-10 Job history · PPL-11 Create from hire · PPL-12 Re-hire · PPL-43 Directory read-model | ⬜ |
| E3 Org structure & positions | PPL-13 Org units & positions · PPL-14 Org chart | ⬜ |
| E4 Allocation & utilization | PPL-15 Allocation read-model · PPL-16 Allocation view · PPL-17 Utilization · PPL-44 Account/project read-model | ⬜ |
| E5 Workforce analytics | PPL-18 Dashboard · PPL-19 Skills & talent · PPL-45 Metrics read-model · PPL-46 Headcount/attrition forecast | ⬜ |
| E6 Headcount planning | PPL-20 Headcount plan | ⬜ |
| E7 Lifecycle directory & dashboard | PPL-21 Stage machine · PPL-22 Lifecycle directory · PPL-23 Lifecycle dashboard | ⬜ |
| E8 Onboarding | PPL-24 Process · PPL-25 IT handoff · PPL-26 Preboarding · PPL-27 Rescind/no-show | ⬜ |
| E9 Probation | PPL-28 Reviews · PPL-29 Confirmation decision | ⬜ |
| E10 Movement | PPL-30 Request & approval · PPL-31 Apply on effective date · PPL-32 Mobility inbound | ⬜ |
| E11 Offboarding | PPL-33 Process · PPL-34 Deactivation & completion | ⬜ |
| E12 Performance | PPL-35 Scorecard · PPL-36 Review cycles & goals · PPL-37 Calibration | ⬜ |
| E13 Time-off / Leave | PPL-38 Leave balance & request | ⬜ |
| E14 Access control & data protection | PPL-39 Sensitive-field masking · PPL-40 Scope & at-request re-check · PPL-41 Cross-account grant | ⬜ |
| E15 Assistant tools | PPL-42 Assistant tools | ⬜ |

**MVP (`MVP=Y`, PRD §4 *Must*):** the trusted employee record (record, pay/capacity, skills, documents), org units & positions, lifecycle stage machine, directory with search/filter + read-model, sensitive-field masking, and Foundation's audit/isolation. *Should*/*Could* tiers sequence behind it.

## Recently shipped

- **PPL-2** Identity link: People↔identity `portal_access` provisioning; web login/access toggle (profile Switch + directory bulk), RBAC-gated. People is the system-of-record for the human; identity is auth only.
- **PPL-3** Employee record & field-level edit + email-domain consolidation (#183).
- **PPL-1** Module foundation: schema, isolation, events, RBAC, web scaffold (#179).

## Pointers

- Active specs/plans: `docs/superpowers/plans/2026-06-19-people-ppl*.md` (local working docs, not committed).
- Design source of truth for screens: [`../design/`](../design/).
- Reconciliation: People = SoT for the human · identity = auth + enforcement · staffing keeps runtime/re-points ports.
