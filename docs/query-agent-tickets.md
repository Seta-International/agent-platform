# Query Agent (A1) — Jira Ticket Breakdown

> Source: `docs/Planner-Agent-System-Design.xlsx` (sheet 2–4), `docs/agents/planner-query/internals.md`
> Agent A1 in workbook: 23 tools, 4 sub-agents, decomposed orchestrator.

---

## Epic: Query Agent (A1)

**Epic name:** Query Agent — Read-only Q&A for Planner

**Description:**

Build the Query Agent (A1) — a chat-panel agent that answers read-only questions about project management data. Users ask in natural language ("what's overdue?", "will milestone M2 finish on time?", "who is overloaded?") and get answers backed by real data with traceable references.

### Problem

Today, users must open boards, apply filters, and manually piece together information to answer common questions: which tasks are overdue, who is overloaded, whether a milestone is on track. This takes time — especially for EMs and executives who need cross-project visibility. The Query Agent turns any question into a single chat message — grounded in real data, with every figure citing its source.

### Scope

- **Read-only:** The Query Agent only reads data. It does NOT write, update, or delete anything. Write requests are declined and redirected to the Action Agent.
- **23 tools** across 4 families: R (Planner Reads), E (Embedding), K (Knowledge Graph), X (Analysis).
- **4 sub-agents** with focused roles: taskSearch (find sets of tasks), taskDetail (details of one known task), teamInfo (people, workload, skills), generalAnswer (synthesis, off-topic).
- **Page-context aware:** Automatically detects which page the user is on (board, task, group, Gantt) and scopes answers accordingly — no need for the user to specify.
- **Verifier:** Every number in every answer is re-verified before delivery — ensuring 100% figure accuracy.

### Target personas

| Persona | Example question |
|---|---|
| Any user | "What changed on this board since yesterday?" |
| User (IC) | "What should I work on today?" |
| EM | "Will milestone M2 finish on time?", "Who should take T-260?" |
| CEO | "State of all projects — what's waiting on me?" |
| BOD | "Quarter-over-quarter delivery trends?" |
| Accountant | "Which client projects have >20% overdue?" |
| IT | "Show today's maintenance queue" |

### Rollout waves

| Wave | Content | Story points | Status |
|---|---|---|---|
| 0 | Design + Rename qna → query | 4 | No dependencies |
| 1 | R-tools, Scope resolution, Sub-agents, Analysis tools, A0 integration, Verifier | 36 | No external infra needed |
| 2 | KG adapters (K1–K3), Embedding search + Date conflicts (E2, X2) | 8 | Blocked — KG/Embedding infra |
| 4 | KG advanced (K4–K5), Pattern/Bus-factor/Skill-coverage (X5–X8, E3) | 8 | Blocked — KG/Analysis infra |

### Constraints

- Permissions enforced on every tool — users can only see data from groups/boards they have access to
- Tenant isolation — no data leaks between tenants
- Budget: 120s per sub-agent, 180s for the orchestrator overall
- Sensitivity class S2 — task text may contain client/project names; self-hosted model required when S1 policy is active

### Definition of Done

- 15 user stories (Wave 1) working end-to-end in the chat panel
- Every answer includes traceable references (US-X05)
- Eval suite green: faithfulness >= 0.7, answer-relevancy >= 0.6, forbidden-tools gate 100%
- 4 user stories (Wave 2–4) ready to implement once infra dependencies are available

---

## User Stories Scope

The Query Agent (A1) addresses 19 user stories this sprint, grouped by rollout wave:

### Wave 1 — Core read-only Q&A (Ticket 1–8)

| Story ID | Persona | Summary | Related tickets |
|---|---|---|---|
| US-X01 | Any user | Ask about the current board ("what changed since yesterday?") — page context auto-resolves | T3 (R4), T4, T7 |
| US-X02 | Any user | On a task detail page, ask "summarize this thread" — instant context recovery | T3 (R2, R3), T5 |
| US-X03 | Any user | On a chart/Gantt page, ask "which items drive the critical path?" | T3 (R5), T6 (X1), T7 |
| US-X04 | Any user | On a group page, ask cross-board questions ("who is overloaded?") — group-scoped | T3 (R6, R7), T4, T5 |
| US-X05 | Any user | Every answer carries traceable references (item IDs, filters, date range) | T8 (Verifier) |
| US-U03 | User | "What should I work on today?" — ranked by due date, priority, blocking relations | T3 (R1, R6), T5 |
| US-M02 | EM | "Will milestone M2 finish on time?" — grounded schedule risk assessment | T3 (R5, R7), T6 (X1) |
| US-M05 | EM | Why-questions ("why are bugs increasing in module X?") | T6 (X4), T5 |
| US-F01 | Accountant | Schedule-health questions with citations on every figure | T3 (R7), T8 (Verifier) |
| US-C01 | CEO | "State of all projects" — scatter-gather portfolio overview | T3 (R7), T5, T7 (scatter-gather) |
| US-C02 | CEO | "Are we on track for Client X's milestones?" | T3 (R5, R7), T6 (X1) |
| US-C03 | CEO | Drill-down on red flags ("why is Portal red?") | T3 (R1, R2), T5 |
| US-B01 | BOD | Board-level summaries, read-scope enforced | T3 (R4, R7), T5 |
| US-B03 | BOD | Quarter-over-quarter trends with anomaly explanations | T6 (X4), T5 |
| US-I01 | IT | Manage IT queue by chat (list, mark done) — shared with Action Agent | T3 (R1), T5 |

### Wave 2–4 — KG + Embedding + Advanced analysis (Ticket 9–12)

| Story ID | Persona | Summary | Related tickets |
|---|---|---|---|
| US-I02 | IT | Similar past tasks + resolutions when opening a new ticket — shared with Triage | T10 (E2), T9 (K1) |
| US-N01 | EM | Assignee suggestions ranked by skill x availability x history | T11 (K4) |
| US-N04 | User | One-click context pack for unfamiliar tasks | T9 (K1, K2), T10 (E2) |
| US-N06 | EM | Skill-gap forecast vs upcoming milestones — shared with Insight Miner | T12 (X8), T11 (K5) |
| US-N10 | User | Starter-task suggestions for new members — shared with Triage | T11 (K4, K5) |

### Coverage summary

- **Wave 1 (Ticket 1–8):** 15 user stories — can be delivered now, no external infra needed
- **Wave 2–4 (Ticket 9–12):** 4 user stories — blocked by KG/Embedding/Analysis services
- **Shared stories:** US-I01 (Action), US-I02 (Triage), US-N01 (Triage), US-N06 (Insight Miner), US-N10 (Triage) — Query Agent handles the READ portion; write/action portions belong to other agents
- **US-X05 (traceable references):** cross-cutting concern, enforced by Verifier (Ticket 8)

---

## Ticket 1: Query Agent — Architecture design and test plan

**Type:** Story
**Priority:** Highest
**Description:**
Define how the Query Agent works before writing any code. The output is a design folder that the team can review — covering agent behavior, tool list, quality metrics, and the full test plan.

The design splits the Query Agent from one flat agent with 23 tools into a query orchestrator that routes questions to 4 specialized sub-agents (taskSearch, taskDetail, teamInfo, generalAnswer). This design folder also serves as the Confluence-ready spec for stakeholder review.

**Deliverables:**
- spec.md — what the agent does, written for PMs (no code)
- internals.md — how it works, written for developers
- metrics.md + eval.config.json — quality thresholds for automated evaluation
- testcases.csv — full test suite: happy paths, edge cases, security, and permission tests

**Acceptance criteria:**
- [ ] Design folder `docs/agents/planner-query/` contains all 5 files: spec.md, internals.md, metrics.md, eval.config.json, testcases.csv
- [ ] spec.md is readable by PMs and non-developers: no file paths, import paths, or code snippets — only agent/tool names like "QueryAgent", "searchTasks"
- [ ] Every user story (US-X01 through US-N10) has at least 1 happy-path test case + 1 edge case in testcases.csv
- [ ] Every tool in the allowlist (23 tools) is covered by at least 1 test case
- [ ] The scorer list in metrics.md matches eval.config.json exactly (no extra, no missing)
- [ ] The flow diagram in spec.md covers all 4 sub-agents: taskSearch, taskDetail, teamInfo, generalAnswer

**Labels:** `query-agent`, `design`
**Story points:** 3

---

## Ticket 2: Rename legacy "QnA" identifiers to "Query Agent"

**Type:** Task
**Priority:** High
**Depends:** Ticket 1
**Description:**
The current codebase uses the old name "QnA" (planner.qna) for this agent. The workbook and design call it "Query Agent" (planner.query). This ticket renames all identifiers to match the official name.

This is a name-only change — no features are added or removed. All existing chat functionality must continue to work exactly as before.

**Acceptance criteria:**
- [ ] Search for "qna" across the entire planner UI and API responses — no results found (except git history)
- [ ] Chat panel still works normally after the rename — ask a simple question ("what's overdue?") and get a correct answer
- [ ] No regressions: existing chat features (staffing, assignment) still work

**Labels:** `query-agent`, `refactor`
**Story points:** 1

---

## Ticket 3: Enable the agent to read tasks, boards, timelines, workload, and activity data

**Type:** Story
**Priority:** Highest
**Depends:** Ticket 2
**Description:**
Give the Query Agent access to 8 core data sources so it can answer questions about tasks, boards, timelines, workload, and user activity. These are the building blocks for all read-only Q&A — without them, the agent has no data to answer from.

Each data source is a tool the agent can call. Together they cover: searching and filtering tasks, viewing a single task in detail, reading change history, viewing board layouts, reading Gantt timelines, checking team workload, getting project stats, and reviewing a person's recent actions.

**Tools:**
| Tool ID | Tool name | What it provides |
|---|---|---|
| R1 | `planner_queryTasks` | Search and filter tasks by status, labels, due date, or text |
| R2 | `planner_getTask` | Full details of one task (assignees, labels, checklist, dates, relations) |
| R3 | `planner_getItemActivity` | Change history and comments for one task |
| R4 | `planner_getBoardSnapshot` | Board layout with columns and items per column |
| R5 | `planner_getTimeline` | Gantt data: date ranges, milestones, dependencies |
| R6 | `planner_getWorkload` | Open items per person over a time window |
| R7 | `planner_getStats` | Aggregated numbers: overdue ratio, completion rate |
| R8 | `planner_getUserActivity` | One person's actions for a given period (standup source) |

**Acceptance criteria:**
- [ ] **R1 — Task search:** Ask "show overdue tasks" → returns a list of overdue tasks with title, due date, and status. Filtering by label, status, and text works correctly
- [ ] **R2 — Task details:** Ask for details of a specific task → returns full info: title, description, assignees, labels, checklist, dates, relations
- [ ] **R3 — Activity feed:** Ask "what changed on task X?" → returns an activity feed with details: who made the change, which field changed, before/after values (not just "Task was updated")
- [ ] **R4 — Board view:** Ask "show board Sprint 1" → returns a board snapshot with columns and items per column
- [ ] **R5 — Timeline:** Ask "show timeline of project X" → returns Gantt data: date spans, milestones, dependencies
- [ ] **R6 — Workload:** Ask "who is overloaded?" → returns open item count per person within a time window
- [ ] **R7 — Stats:** Ask "overdue ratio?" → returns aggregates: overdue count/ratio, completion rate
- [ ] **R8 — User activity:** Ask "what did Hieu do yesterday?" → returns a list of the user's actions within the given period
- [ ] **Permissions:** A user without access to a group/board gets a "no access" message — no data leaks
- [ ] **Tenant isolation:** A user in tenant A cannot see data from tenant B through any tool

**Labels:** `query-agent`, `wave-1`, `data-access`
**Story points:** 8

---

## Ticket 4: Let users ask questions by name instead of requiring IDs

**Type:** Story
**Priority:** High
**Depends:** Ticket 3
**Description:**
Users ask questions using natural language ("show workload in my group", "what's overdue on Backend Squad?"), but the tools internally need a group ID or plan ID. This ticket adds smart scope resolution so users never have to type a UUID.

The system tries 3 approaches in order:
1. **User gives an ID** → use it directly
2. **User gives a name** → find the matching group/plan by name
3. **User gives nothing** → if they belong to only one group, pick it automatically; if multiple, ask them to choose

**Acceptance criteria:**
- [ ] **By ID:** Ask "show workload of group grp-xxx" → returns results for that exact group
- [ ] **By name:** Ask "show workload of Backend Squad" → resolves the group by name and returns results
- [ ] **Ambiguous name:** Ask "show workload of Backend" when both "Backend Squad" and "Backend Infra" exist → agent asks the user to pick, listing the group names
- [ ] **Name not found:** Ask "show workload of NonExistGroup" → returns a "group not found" message, does not crash
- [ ] **Auto-pick (single group):** User belongs to exactly 1 group, asks "show workload" without specifying a group → auto-picks the only group
- [ ] **Auto-pick (multiple groups):** User belongs to multiple groups, asks "show workload" → agent asks the user to pick a group
- [ ] **Works on 7 tools:** getBoardSnapshot, getTimeline, listBuckets, getGroupOverview, getWorkload, searchUsersBySkills, getStats — all accept names instead of requiring UUIDs

**Labels:** `query-agent`, `wave-1`, `ux`
**Story points:** 5

---

## Ticket 5: Route questions to the right specialist and set up quality evaluation

**Type:** Story
**Priority:** Highest
**Depends:** Ticket 3, Ticket 4
**Description:**
The Query Agent receives many different types of questions. Instead of one agent handling all 23 tools, this ticket splits the work into 4 specialists — each focused on one type of question. A routing layer decides which specialist handles each question.

This ticket also sets up the automated evaluation framework so we can measure answer quality on every build.

**Specialists:**
| Specialist | What it handles | Example question |
|---|---|---|
| taskSearch | Finding groups of tasks | "Find all overdue tasks", "How many open bugs?" |
| taskDetail | Details about one specific task | "Summarize task T-198", "What changed on this task?" |
| teamInfo | People, workload, and team structure | "Who is overloaded?", "What did Hieu do yesterday?" |
| generalAnswer | General knowledge, off-topic questions | "What is Agile?", "Explain story points" |

**Acceptance criteria:**
- [ ] **Correct routing:** Ask "find overdue tasks" → handled by taskSearch (returns a list). Ask "summarize task T-198" → handled by taskDetail (returns details). Ask "who is overloaded?" → handled by teamInfo (returns workload). Ask "what is Agile?" → handled by generalAnswer (returns text, no tool calls)
- [ ] **Context enrichment:** Answers contain human-readable group/plan names ("Engineering") instead of only UUIDs
- [ ] **Tool isolation:** Each specialist can only access its own tools — taskSearch cannot access activity feeds (R3), taskDetail cannot access workload data (R6)
- [ ] **Eval gate:** Eval suite runs green — every test case in testcases.csv has a matching eval case, all results pass threshold

**Labels:** `query-agent`, `wave-1`, `routing`, `eval`
**Story points:** 8

---

## Ticket 6: Add trend analysis and schedule risk prediction

**Type:** Story
**Priority:** High
**Depends:** Ticket 5
**Description:**
Enable the agent to answer two new types of questions:

1. **Trend analysis:** "Are bugs increasing?", "Completion rate last 3 months?" — the agent calculates period-over-period KPI series and shows the numbers broken down by time period.
2. **Schedule risk:** "Will milestone M2 finish on time?" — the agent predicts whether a milestone will slip, based on remaining work, completion pace, and current blockers.

**Acceptance criteria:**
- [ ] **Trend series:** Ask "bug count trend last 3 months?" → returns series data broken down by month (e.g., May: 4, Jun: 7, Jul: 11), with scope and metric name
- [ ] **Trend comparison:** Ask "completion rate this month vs last month?" → returns 2 periods with comparable values
- [ ] **Schedule risk:** Ask "will milestone M2 finish on time?" → returns a risk level (low/medium/high/critical) with specific reasoning (e.g., "predicted finish 22 Jul vs plan 15 Jul, driver: T-210 blocked 3 days")
- [ ] **Scope enforcement:** A user outside a group cannot see trend/risk data for that group
- [ ] **Empty data:** Ask for a trend on a project with no tasks → returns a "no data" message instead of crashing

**Labels:** `query-agent`, `wave-1`, `analysis`
**Story points:** 5

---

## Ticket 7: Connect the Query Agent to the chat panel with page-aware context

**Type:** Story
**Priority:** High
**Depends:** Ticket 5
**Description:**
Connect the Query Agent to the main chat system so users can actually use it. When a user opens the chat panel and asks a read-only question, the system routes it to the Query Agent instead of other agents.

The key feature is **page context**: the agent automatically knows which page the user is on (board, task detail, group, or Gantt chart) and scopes answers to that page. The user never has to say "on board X" — the agent already knows.

Also supports **multi-part questions**: "state of all projects — and what's waiting on me?" runs multiple specialists in parallel and combines the answers.

**Acceptance criteria:**
- [ ] **Intent routing:** Ask a read-only question ("what's overdue?") → dispatched to Query Agent. Ask a write request ("assign task to Hieu") → NOT dispatched to Query Agent (goes to Action Agent)
- [ ] **Board page context:** Open the chat panel on the board "Sprint Board — Portal FE", ask "what changed since yesterday?" → answer is scoped to that board without the user specifying the board name
- [ ] **Task detail page context:** Open the chat panel on task T-198, ask "summarize this thread" → answer is about the task being viewed
- [ ] **Group page context:** Open the chat panel on the group "Backend Squad", ask "who is overloaded?" → answer is automatically scoped to that group
- [ ] **Chart/Gantt page context:** Open the chat panel on the Gantt view of milestone M2, ask "any date conflicts?" → answer is scoped to the timeline being viewed
- [ ] **Multi-part question:** Ask "state of all projects — and what's waiting on me?" → answer covers both parts (portfolio health + pending decisions), nothing is cut off
- [ ] **Timeout:** A complex question that runs over 180s → returns a partial result instead of an error or hanging
- [ ] **Trace ID:** Every answer includes a trace ID for debugging — verify in logs

**Labels:** `query-agent`, `wave-1`, `integration`
**Story points:** 5

---

## Ticket 8: Verify every number in every answer before showing it to the user

**Type:** Story
**Priority:** Medium
**Depends:** Ticket 7
**Description:**
Add a verification step that runs automatically after the agent generates an answer. The verifier checks every number and data reference in the answer by re-querying the same data source. If a number is wrong, it gets corrected or replaced with a raw data table. If a claim has no source, it gets removed.

This ensures users can trust every figure in every answer. Before this ticket, answers may contain approximate or hallucinated numbers. After this ticket, every number is verified and linked to its source.

**Acceptance criteria:**
- [ ] **Traceable references (US-X05):** Every number in every answer includes a reference — e.g., "Overdue: 18% (9/50) [ref: planner_get_stats, scope=Project X, 09 Jul 09:20]". No unsourced numbers
- [ ] **Figure verification:** Ask "overdue ratio of Project X?" → click the reference chip → opens the filtered item list that produced that number. The numbers match
- [ ] **Mismatch auto-correct:** When the agent returns a wrong number vs the re-query → the verifier corrects it automatically (first attempt). If still wrong → falls back to showing a raw data table instead of wrong numbers
- [ ] **Unreferenced claim block:** An answer containing a claim with no source → blocked, regenerated once. If still no source → that claim is removed from the answer
- [ ] **Confidence score:** Answers that have not passed the verifier show confidence <= 0.6. After verifier pass → confidence can go above 0.6
- [ ] **No false positives:** The verifier does not block or modify correct answers — verify with 10 happy-path questions, all pass through unchanged

**Labels:** `query-agent`, `wave-1`, `trust`
**Story points:** 5

---

## Ticket 9: Add relationship and impact-chain queries (Knowledge Graph)

**Type:** Story
**Priority:** Medium
**Depends:** Knowledge Graph infrastructure (ADR D-05)
**Description:**
Enable the agent to answer questions about how things are connected: related tasks, blocking chains, and people profiles. These answers come from the Knowledge Graph — a service that maps relationships between tasks, people, and teams.

This unlocks 3 new question types:
- "What's related to this task?" → shows dependencies, related tasks, and people involved
- "Why is this project red?" → traces the blocking chain from root cause to milestone
- "Tell me about Hieu's skills" → shows a person's skill profile and work history

**Blocked by:** Knowledge Graph service REST API (ADR D-05).

**Acceptance criteria:**
- [ ] **Related entities:** Ask "what's related to task T-198?" → returns a list of related tasks, dependencies, and people involved — with relation type (blocks/blocked-by/related)
- [ ] **Impact path:** Ask "why is Portal red?" → returns a chain: T-198 blocks T-215 blocks M2 gate — each node shows title + owner
- [ ] **Person profile:** Ask "tell me about Hieu's skills" → returns person profile: skill tags, completed task history, team membership
- [ ] **Permissions:** A user without access to an entity cannot see its profile or relations
- [ ] **Service unavailable fallback:** Knowledge Graph service is down → agent responds "knowledge graph data is currently unavailable" + returns a partial answer from other data sources if possible, does not crash

**Labels:** `query-agent`, `wave-2`, `knowledge-graph`, `blocked`
**Story points:** 5

---

## Ticket 10: Add past-resolution search and timeline conflict detection

**Type:** Story
**Priority:** Medium
**Depends:** Embedding service (ADR D-06)
**Description:**
Enable the agent to answer two new question types:

1. **Past resolution search:** "How was the VPN issue fixed last time?" — uses semantic search to find resolution notes from similar past tasks, so known fixes are reused instead of rediscovered.
2. **Date conflict detection:** "Any date conflicts in this timeline?" — checks for scheduling contradictions like a task starting after its due date, or a predecessor ending after its successor starts.

**Blocked by:** Embedding service (ADR D-06).

**Acceptance criteria:**
- [ ] **Past resolution search:** Ask "how was the VPN issue fixed last time?" → returns resolution notes from similar past tasks, with relevance ranking + source task ID
- [ ] **Date conflicts:** Ask "any date conflicts in this timeline?" → detects: task start date after due date, predecessor end date after successor start date. Returns a specific list of conflicts (task IDs + dates)
- [ ] **No false positives:** A valid timeline with no conflicts → returns "no conflicts found", does not report false issues
- [ ] **Service unavailable:** Embedding service is down → agent reports the issue and returns a partial answer, does not crash

**Labels:** `query-agent`, `wave-2`, `search`, `analysis`, `blocked`
**Story points:** 3

---

## Ticket 11: Add smart assignee suggestions and work history lookup

**Type:** Story
**Priority:** Low
**Depends:** KG + skill profiles (WP-13)
**Description:**
Enable the agent to suggest who should work on a task and show a person's completed work history. Suggestions are ranked by skill match, current availability, and past experience — including "growth picks" for team development.

**Blocked by:** Knowledge Graph + skill profile infrastructure (WP-13).

**Acceptance criteria:**
- [ ] **Assignee suggestion (US-N01):** Ask "who should take T-260 (React dashboard rework)?" → returns a ranked list with reasoning: "1) Hieu — React 4/5, 2 open items, worked on original dashboard. 2) Phong — growth pick, paired on T-118". Includes skill score, capacity, and history
- [ ] **Growth pick:** At least 1 candidate is tagged as a "growth pick" with a reason (e.g., junior but has potential)
- [ ] **Work history:** Ask "what has Hieu completed recently?" → returns a list of completed tasks with dates and categories
- [ ] **Overloaded warning:** A candidate with workload over 2x the median → shows a warning with specific numbers
- [ ] **Acceptance rate:** Run 20 assignee suggestion questions → at least 50% of suggestions are rated "reasonable" by an EM (manual evaluation)

**Labels:** `query-agent`, `wave-4`, `team-intelligence`, `blocked`
**Story points:** 3

---

## Ticket 12: Add duration estimation, pattern detection, bus factor, and skill-gap analysis

**Type:** Story
**Priority:** Low
**Depends:** Analysis services + KG
**Description:**
Complete the full Query Agent tool set with 5 advanced analysis capabilities. These answer strategic questions about effort estimation, recurring problems, team risk, skill gaps, and task linking.

**Blocked by:** Analysis services + Knowledge Graph infrastructure.

**New capabilities:**
| Capability | Example question |
|---|---|
| Duration estimate | "How long will T-266 take?" |
| Pattern detection | "Any patterns in our bugs?" |
| Bus factor | "Bus factor for Assets module?" |
| Skill-gap analysis | "Do we have the skills for milestone M3?" |
| Auto-link suggestions | "What tasks should be linked to T-266?" |

**Acceptance criteria:**
- [ ] **Duration estimate:** Ask "how long will T-266 take?" → returns an estimated duration based on similar past tasks, with confidence level + basis ("similar tasks T-201, T-118 took 4–6 days")
- [ ] **Pattern detection:** Ask "any patterns in our bugs?" → detects recurring patterns (e.g., "7 of 11 bugs trace to the import wizard refactor")
- [ ] **Bus factor:** Ask "bus factor for Assets module?" → returns a list of people with their coverage percentage. Bus factor = 1 → shows a warning
- [ ] **Skill coverage (US-N06):** Ask "do we have the skills for milestone M3?" → returns a gap analysis: "React OK (3 people). GAP: AI-agent — only Sy has experience". Includes suggested actions (pair, train, re-sequence)
- [ ] **Auto-link suggestions:** Ask "what tasks should be linked to T-266?" → returns suggested links with relevance scores. At least 70% of suggestions are actually relevant (manual evaluation over 20 cases)
- [ ] **No hallucination:** Tools return "insufficient data" when there is not enough data for analysis — they do not make up results

**Labels:** `query-agent`, `wave-4`, `advanced-analysis`, `blocked`
**Story points:** 5

---

## Dependency graph

```
T1 (Architecture design)
  └── T2 (Rename QnA → Query)
       └── T3 (Core data access)
            ├── T4 (Name-based scope resolution)
            │    └──┐
            └───────┤
                    T5 (Question routing + eval)
                    ├── T6 (Trend analysis + schedule risk)
                    └── T7 (Chat integration + page context)
                         └── T8 (Answer verification)

[Blocked by external infra]
T9  (Relationship + impact queries)      ← KG infra
T10 (Past resolutions + date conflicts)  ← Embedding service
T11 (Assignee suggestions + history)     ← KG + skill profiles
T12 (Advanced analysis suite)            ← Analysis services + KG
```

## Summary

| Wave | Tickets | Story points | Status |
|---|---|---|---|
| — | T1 (Design), T2 (Rename) | 4 | No dependencies |
| 1 | T3 (Data access), T4 (Scope), T5 (Routing), T6 (Analysis), T7 (Integration), T8 (Verifier) | 36 | No external infra needed |
| 2 | T9 (KG relations), T10 (Search + conflicts) | 8 | Blocked by KG/Embedding |
| 4 | T11 (Assignee suggestions), T12 (Advanced analysis) | 8 | Blocked by KG/Analysis |
| **Total** | **12 tickets** | **56 SP** | |

**Ready now:** 8 tickets (T1–T8, 40 SP) — no external infra dependencies.
**Blocked:** 4 tickets (T9–T12, 16 SP) — waiting on KG, embedding, and analysis services.
