# planner-action (A2) coverage matrix

Every case, three ways: by grid cell, by metric, by requirement. A1's matrix is the
cautionary example — organised primarily by metric, it left several cells at zero
cases until someone wrote the grid down.

## By grid cell

| Cell | Cases | Holdout |
| --- | --- | --- |
| update — happy / cancel | MU-001 / MU-002 | — |
| create — happy / cancel | MU-003 / MU-004 | — |
| assign — happy / cancel | MU-005 / MU-006 | — |
| comment — happy / cancel | MU-007 / MU-008 | — |
| merge — happy / cancel | MU-009 / MU-010 | — |
| link — happy / cancel | MU-011 / MU-012 | — |
| refuse — viewer role | MU-013 | — |
| refuse — target in another group | MU-014 | — |
| refuse — link across groups | MU-015 | — |
| refuse — asked to delete permanently | MU-016 | — |
| refuse — batch over 20, and does not split | MU-017 | **yes** |
| clarify — two tasks match one reference | MU-018 | — |
| clarify — field named, value missing | MU-019 | — |
| injection — task description | MU-020 | **yes** |
| injection — comment body | MU-021 | **yes** |
| injection — names a cross-group task | MU-022 | — |
| revision — new value for the same field | RV-008 | — |
| revision — weekday phrasing | RV-001 | — |
| revision — different tool = new request | RV-002 | — |
| revision — no preview, no context | RV-003 | — |
| revision — adding is not adjusting (D4) | RV-004 | **yes** |
| revision — reversal (merge roles swap) | RV-005 | — |
| revision — union against the PROPOSED set | RV-006 | **yes** |
| revision — narrowing, needs dropFields | RV-007 | — |

Refusal and clarify are behaviours of the gateway and of parameter handling, not of
individual tools: an RBAC denial on `planner_updateTask` runs the same path as one
on `planner_commentTask`. They are covered once per MECHANISM, not once per tool —
six near-identical RBAC refusals would buy coverage theatre at 6× the eval cost, and
`permission-matrix.test.ts` already owns the full role × operation matrix
deterministically.

Holdout: 5 of 30 (17%).

## By metric

| Metric | Cases |
| --- | --- |
| M1 | MU-001, MU-003, MU-005, MU-007, MU-009, MU-011, MU-017, RV-002 |
| M2 | MU-001, MU-003, MU-005, MU-007, MU-009, MU-011, MU-022, RV-001, RV-005, RV-006, RV-007, RV-008 |
| M3 | every case |
| M4 | MU-002, MU-004, MU-006, MU-008, MU-010, MU-012 |
| M5 | MU-013, MU-014, MU-015, MU-016, MU-017 |
| M6 | MU-018, MU-019, RV-003, RV-004 |
| M7 | MU-020, MU-021, MU-022 |
| M8 | RV-001, RV-005, RV-006, RV-007, RV-008 |
| M9 | RV-002, RV-004, RV-008 |
| B1–B3 | recorded-only this wave (advisory) |

## By requirement

| Requirement | Cases |
| --- | --- |
| BR-03 — no unconfirmed write | every case, via `dbEffects: none` on every pre-Confirm turn |
| BR-05 — no destructive autonomy | MU-016, plus MU-009 / MU-010 (merge is the only path that removes anything) |
| EV-07 — RBAC | MU-013, MU-014, MU-015 |
| EV-08 — injection | MU-020, MU-021, MU-022 |
| AS-08 — refusal tone | MU-013…MU-017 (B3, advisory this wave) |
| FUT-840 AC5 — revise through chat | RV-001…RV-008 |
| `US-*` ids | **re-resolve before filling in.** The source table in `docs/superpowers/specs/2026-07-28-action-agent-design.md:209-217` predates the shipped tool names: `US-U07` names `planner_mergeOrSoftDelete` (shipped as `planner_mergeTasks`), `US-N02` names `planner_linkItems` (shipped as `planner_linkTasks`), and `US-M04` names a `planner_bulkUpdate` tool that never existed — bulk is `planner_updateTask.taskRefs[]`, capped by `BULK_TARGET_CAP`. `planner_createTask` / `planner_assignTask` / `planner_commentTask` have no id in that table at all; theirs are in `docs/superpowers/specs/2026-08-10-fut806-create-assign-retrofit-design.md` and must be READ OFF it, not guessed. |
