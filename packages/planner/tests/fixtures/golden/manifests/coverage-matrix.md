# Golden Dataset v2 — Coverage Matrix (spec §I)

Mapping-only view of the migrated 33 query-agent cases (PQ-001..PQ-033). **No new
cases are authored here**; the 33→60–80 scale-up is a documented path, not done.
Metric IDs and gate/advisory modes come from
`docs/agents/planner-query/eval.config.json` (`metricPolicy`): A1–A8 gate, B1–B8
advisory.

## 1. Metric coverage

| Metric | Mode | Current cases | Count | Target | Gap |
| --- | --- | --- | --- | --- | --- |
| A1 | gate | PQ-001..018, PQ-027 | 19 | happy-path answer correctness across all 4 sub-agents | covered; add A2/A3 splits below |
| A2 | gate | — | 0 | named-person / entity resolution correctness | **gap** — currently folded into A1 (PQ-006, PQ-009, PQ-027) |
| A3 | gate | — | 0 | semantic-search relevance (kind:retrieval graded labels) | **gap** — PQ-007 is agent-kind only; no retrieval-kind cases yet |
| A4 | gate | PQ-019, PQ-020, PQ-023, PQ-024, PQ-025 | 5 | empty / not-found / tool-error result shapes | covered |
| A5 | gate | PQ-021, PQ-022, PQ-026 | 3 | ambiguity → clarify (never guess) | covered |
| A6 | gate | — | 0 | multi-turn / context-pack follow-ups | **gap** — no kind:conversation cases yet |
| A7 | gate | PQ-028, PQ-029, PQ-030 | 3 | prompt-injection / out-of-domain / jailbreak refusal | covered |
| A8 | gate | PQ-031, PQ-032, PQ-033 | 3 | RBAC scope-limit + read-only write refusal | covered |
| B1–B8 | advisory | — | 0 | quality signals (faithfulness, relevancy, tone, conciseness, …) | **gap** — advisory metrics unassigned; wire in with the quality lane |

## 2. Scenario coverage

| Axis | Covered values (case ids) | Gap |
| --- | --- | --- |
| Actor scope | self (`me`: PQ-002, PQ-003, PQ-012..017), named person (PQ-006, PQ-021, PQ-023), board/plan context (PQ-004, PQ-008, PQ-010, PQ-011), cross-group escalation→scoped (PQ-031) | dedicated non-member-group denial with a real second group |
| Result shape | list (PQ-001, PQ-002, PQ-006), count (PQ-003), single (PQ-008, PQ-027), aggregate/stats (PQ-005, PQ-013), board snapshot (PQ-004), empty (PQ-019, PQ-024) | ranked/paginated large result set |
| Identity | single match (PQ-006, PQ-027), ambiguous (PQ-021, PQ-022, PQ-026), not-found (PQ-020, PQ-023) | homonym across tenants (decoy Tuan) as an eval case |
| Time | current week (PQ-001, PQ-017, PQ-018) | overdue vs upcoming boundary; explicit date ranges |
| Failure | tool error mid-flow (PQ-025), prompt injection (PQ-028) | partial tool failure with recovery (behavior:partial) |
| Security | read-only write refusal (PQ-028, PQ-030, PQ-032, PQ-033), out-of-domain (PQ-029), scope limit (PQ-031) | cross-tenant leak assertion using decoy canaries (ZEPHYR-91 / DECOY-TENANT-CANARY-742) |

## Notes

- Holdout (~18%, excluded by default; run with `includeHoldout`): PQ-011, PQ-017,
  PQ-022, PQ-027, PQ-029, PQ-031.
- Suites: `smoke` = PQ-001/002/003/006/008/012; `regression` = all; `nightly` adds
  the edge-error, adversarial, and RBAC cases.
- The three biggest gaps to close in the scale-up are **A3 retrieval-kind cases**
  (graded relevance labels + IR scorer), **A6 kind:conversation** multi-turn cases,
  and **decoy-isolation eval cases** that assert canaries never leak.
