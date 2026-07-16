# QueryAgent — Internals

Dev-facing counterpart of spec.md. Everything spec.md is forbidden to say lives here.

## Ownership & wiring

- Owning module: `packages/planner`
- Built by: `buildPlannerQnaRuntime()` in `packages/planner/src/backend/orchestration/register.ts` — wires sub-agents + tools, returns the orchestrator spec + chat streamer.
- Mounted: the planner orchestration runtime registers `planner.query.orchestrator` as a specialized agent; the top-level A0 orchestrator dispatches to it on `intent=qna`.
- **Rename in progress:** all `planner.qna.*` identifiers → `planner.query.*` (agent IDs, factory names, file names). The workbook calls this A1 = "Query Agent"; `qna` was the legacy label.

## Architecture — Decomposed A1

The workbook defines A1 as one flat agent with 23 tools. Implementation decomposes it into a **query orchestrator + 4 sub-agents**, each with a focused tool subset. The orchestrator IS the A0-for-query-intent dispatch layer.

```
planner.query.orchestrator (A0 layer for qna intent)
├── planner.query.taskSearch   — SET of tasks (search/count/filter/similar)
├── planner.query.taskDetail   — ONE known task (details/history/comments/deps)
├── planner.query.teamInfo     — org structure, people, workload, skills
└── planner.query.generalAnswer — synthesis/compound/off-topic (LLM, no tools)
```

Rationale: 23 tools in one agent degrades tool selection. Sub-agents keep 6–12 tools each, are independently testable, and have smaller context windows. Extra LLM hop cost (~200ms) is acceptable for routing accuracy.

## Model & sensitivity

- Model tier: **Fast** (orchestrator routing) / **Std** (sub-agents). Matches workbook A1 "Fast/Std".
- Sensitivity class: **S2** — task text may contain client-project names (D-01 boundary). All R-family tools are S2-floor. Self-hosted model required when S1 policy is active.
- Budget: 1–3 tool calls per sub-agent; orchestrator makes 1–2 delegation calls per turn.
- Timeout: 120s per sub-agent execution; orchestrator overall 180s.

## Tools — Full 23-tool allowlist by sub-agent

### Sub-agent: taskSearch (`planner.query.taskSearch`)

| Tool | Workbook ID | Family | Read/Write | RBAC check | HITL? | Wave |
|---|---|---|---|---|---|---|
| `planner_queryTasks` (= `planner_search_items`) | R1 | R - Planner Reads | Read | group-scoped | No | 1 ✓ |
| `planner_getBoardSnapshot` | R4 | R - Planner Reads | Read | board-scoped | No | 1 ✓ |
| `planner_getStats` | R7 | R - Planner Reads | Read | group/board-scoped | No | 1 ✓ |
| `planner_findSimilarTasks` (= `embedding_find_similar`) | E1 | E - Embedding | Read | scope-filtered | No | 1 ✓ |
| `analysis_trend_series` | X4 | X - Analysis | Read | scope-scoped | No | 1 (WP-04) |
| `planner_getOpenTaskCountForUser` | — | R (convenience) | Read | self/group-scoped | No | 1 ✓ |
| `planner_resolveMember` | — | R (helper) | Read | group-scoped | No | 1 ✓ |
| `analysis_compute_schedule_risk` | X1 | X - Analysis | Read | scope-scoped | No | 2 |

### Sub-agent: taskDetail (`planner.query.taskDetail`)

| Tool | Workbook ID | Family | Read/Write | RBAC check | HITL? | Wave |
|---|---|---|---|---|---|---|
| `planner_getTask` (= `planner_get_item`) | R2 | R - Planner Reads | Read | item-scoped | No | 1 ✓ |
| `planner_getItemActivity` | R3 | R - Planner Reads | Read | item-scoped | No | 1 ✓ |
| `planner_getTimeline` | R5 | R - Planner Reads | Read | scope-scoped | No | 1 ✓ |
| `planner_listComments` | — | R (detail) | Read | item-scoped | No | 1 ✓ |
| `planner_queryTasks` | R1 | R - Planner Reads | Read | group-scoped | No | 1 ✓ |
| `kg_get_related` | K1 | K - Knowledge Graph | Read | entity-scoped | No | 2 |
| `kg_find_path` | K2 | K - Knowledge Graph | Read | entity-scoped | No | 2 |
| `embedding_search_knowledge` | E2 | E - Embedding | Read | scope-filtered | No | 2 |
| `embedding_suggest_links` | E3 | E - Embedding | Read | scope-filtered | No | 4 |
| `analysis_check_date_conflicts` | X2 | X - Analysis | Read | scope-scoped | No | 2 |
| `analysis_estimate_duration` | X5 | X - Analysis | Read | scope-scoped | No | 4 |

### Sub-agent: teamInfo (`planner.query.teamInfo`)

| Tool | Workbook ID | Family | Read/Write | RBAC check | HITL? | Wave |
|---|---|---|---|---|---|---|
| `planner_getWorkload` | R6 | R - Planner Reads | Read | group-scoped | No | 1 ✓ |
| `planner_getUserActivity` | R8 | R - Planner Reads | Read | self/group-scoped | No | 1 ✓ |
| `planner_getGroupOverview` | — | R (org structure) | Read | group-scoped | No | 1 ✓ |
| `planner_listPlans` | — | R (org structure) | Read | group-scoped | No | 1 ✓ |
| `planner_listBuckets` | — | R (org structure) | Read | plan-scoped | No | 1 ✓ |
| `planner_searchGroupMembersBySkills` | — | R (skill query) | Read | group-scoped | No | 1 ✓ |
| `kg_get_entity_profile` | K3 | K - Knowledge Graph | Read | entity-scoped | No | 2 |
| `kg_suggest_assignees` | K4 | K - Knowledge Graph | Read | scope-scoped | No | 4 |
| `kg_get_person_task_history` | K5 | K - Knowledge Graph | Read | person-scoped | No | 4 |
| `analysis_detect_patterns` | X6 | X - Analysis | Read | scope-scoped | No | 4 |
| `analysis_bus_factor` | X7 | X - Analysis | Read | scope-scoped | No | 4 |
| `analysis_skill_coverage` | X8 | X - Analysis | Read | scope-scoped | No | 4 |

### Sub-agent: generalAnswer (`planner.query.generalAnswer`)

No tools. LLM-only synthesis from context + prior sub-answers.

### Forbidden tools (gate — all W/O/G families)

All write tools (W1–W8), delivery tools (O1–O3), and governance-write tools (G2–G3) are forbidden. `gov_audit_query` (G1) is also forbidden for A1 — it belongs to A8 (Governance Agent). The `forbidden-tools` eval gate enforces this.

## Verifier post-step (design only — deferred implementation)

Per WF-C1 step 4, a deterministic Verifier runs after the sub-agent returns:
1. Extract every numeric claim and item reference from the answer text.
2. Re-query the cited tool(s) with the same parameters to recompute figures.
3. If a figure mismatches: correct it in-place (first attempt) or fall back to a raw data table.
4. Unreferenced claims (no source_ref) trigger one regeneration attempt.

Implementation deferred to WP-03. Until then, sub-agent answers pass through unverified — the trust.confidenceScore reflects this (capped at 0.6).

## Memory & state

- **Session history**: passed through `ctx.sessionHistory` (MastraDBMessage[]) to the orchestrator; sub-agents do NOT receive session history (they get a single focused query).
- **Working memory**: none attached. The orchestrator is stateless per turn.
- **Never attach Memory to the orchestrator Agent** — it would double-persist with the chat-level memory layer.
- **Pre-resolved context**: `teamInfo` sub-agent pre-resolves the caller's group IDs and plan IDs into the RequestContext so "my group/team" questions work without asking for an ID.

## Failure handling

| Failure mode | Mechanism |
|---|---|
| No data found | Sub-agent returns "no matching tasks" / "no members found" — valid answer, not an error. |
| Out-of-scope request (write intent) | Orchestrator routing rejects; returns disclaimer + redirect to Action Agent. |
| Tool error (API/DB) | Sub-agent catches, returns partial answer with disclosure ("could not fetch board snapshot"). Orchestrator surfaces the partial. |
| Budget/timeout hit | 120s timeout per sub-agent; if exceeded, orchestrator returns whatever partial result is available. |
| Ambiguous scope (multi-group user) | ScopeResolver lists matching groups; orchestrator asks user to pick by name (never by ID). |
| Permission denied | Tool returns scope-violation error; sub-agent says "you don't have access to that group/board." |

## Eval target

- Factory export: `buildPlannerQueryEvalTarget` from `@seta/planner`
- Signature: `(deps: { pool, judgeModel }) => Agent`
- Stubs vs production: the factory wires real DB tools (testcontainers Postgres) but stubs the embedding provider (deterministic fake). Knowledge-graph tools (K1–K5) stubbed until Wave 2.
- Consumed by `/agent-eval` in the later eval-infra phase; name fixed now so the contract is stable.

## Rename checklist (planner.qna.* → planner.query.*)

| Current | Target |
|---|---|
| `planner.qna.orchestrator` | `planner.query.orchestrator` |
| `planner.qna.taskQuery` | `planner.query.taskSearch` |
| `planner.qna.taskDetail` | `planner.query.taskDetail` |
| `planner.qna.teamInfo` | `planner.query.teamInfo` |
| `planner.qna.generalAnswer` | `planner.query.generalAnswer` |
| `makeQnaOrchestrator` | `makeQueryOrchestrator` |
| `makeQnaChatStreamer` | `makeQueryChatStreamer` |
| `buildPlannerQnaRuntime` | `buildPlannerQueryRuntime` |
| `qnaOrchestratorSpec` | `queryOrchestratorSpec` |
| `QnaOrchestratorDeps` | `QueryOrchestratorDeps` |
| `QnaSubAgentInput/Output` | `QuerySubAgentInput/Output` |
| File: `orchestration/agents/task-query.ts` | `orchestration/agents/task-search.ts` |
| File: `orchestration/schemas.ts` | keep, rename types inside |
