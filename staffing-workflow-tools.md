# Staffing Workflow — Tool Specification

## Overview

This document defines every tool required by the **staffing recommendation workflow**.
The workflow answers one question: *"Who should be assigned to this task?"*

Agents run **sequentially**. Each agent receives the output of the previous one as its
input context. No parallelism — the Orchestrator drives each step in order and passes
results downstream before starting the next agent.

```
Orchestrator
  │
  ▼ step 1
AGENT: TaskAnalyzer          → skills_requirement[]
  │
  ▼ step 2
AGENT: SkillMatcher          → ranked_candidates[]
  │
  ▼ step 3
AGENT: AvaiChecker           → avai_status[]
  │
  ▼ step 4
AGENT: Recommender           → final_recommendations[]
  │
  ▼
TrustLayer.buildPayload      → final response + trust metadata
```

TrustLayer tools are cross-cutting: any agent can log reasoning traces and evidence
citations at any point during its step.

---

## TrustLayer Tools (cross-cutting)

These tools are available to **all agents** throughout the workflow. They are called
after significant reasoning steps to build a transparent audit trail that is attached
to the final response.

---

### `trust_createTraceSession`

**Position in workflow:** Called by the Orchestrator before dispatching step 1.

**How it works:**
Opens a new trace session tied to the current request. Returns a `trace_id` that all
subsequent agents use when logging reasoning and evidence. Ensures every log entry
produced during the turn can be correlated back to a single request.

| | |
|---|---|
| **Input** | `request_id: string` — unique ID of the current chat turn |
| **Output** | `trace_id: string` — session key passed to all downstream agents |

---

### `trust_logReasoningTrace`

**Position in workflow:** Called by any agent after a significant reasoning step.

**How it works:**
Appends one reasoning entry to the trace session. Each entry records which agent
produced it, what the reasoning was, and when it happened. In Phase A this writes to
structured logs and an OTel span. In Phase B entries are persisted to a
`trust_traces` table so they can be surfaced in the UI.

| | |
|---|---|
| **Input** | `trace_id: string`, `agent: enum(TaskAnalyzer, SkillMatcher, AvaiChecker, Recommender, Orchestrator)`, `reasoning: string` |
| **Output** | `ok: boolean` |

---

### `trust_logEvidenceCitation`

**Position in workflow:** Called by any agent when it references an external data
source (task record, member profile, timesheet, vector search result).

**How it works:**
Records what data source was consulted, what was queried, and what was returned.
This is what populates the `EvidenceCitations` section of TrustLayer — the user or
auditor can trace every claim in the recommendation back to the raw data that
supported it.

| | |
|---|---|
| **Input** | `trace_id: string`, `source: string` (e.g. `"planner.tasks"`, `"vector_db.user_skill_embeddings"`), `query: string`, `result_summary: string` |
| **Output** | `ok: boolean` |

---

### `trust_buildPayload`

**Position in workflow:** Called by the Orchestrator after step 4, before returning
the final response to the user.

**How it works:**
Collects all trace entries and evidence citations for the given `trace_id`. Receives
per-agent confidence scores and averages them into a single `confidence_score`. Packages
everything into a `TrustPayload` object that is attached to the response alongside the
recommendations.

| | |
|---|---|
| **Input** | `trace_id: string`, `confidence_inputs: Array<{ agent: string, score: number }>` |
| **Output** | `trace_id: string`, `confidence_score: number (0–1)`, `evidence_count: number`, `reasoning_steps: number` |

---

## Step 1 — AGENT: TaskAnalyzer

**Goal:** Read the raw task and produce a structured list of skill requirements
(`skills_requirement[]`) that the next agent can search against.

**Receives from Orchestrator:** `task_id`

**Passes to SkillMatcher:** `skills_requirement[]`

---

### `planner_fetchTask`

**Position in workflow:** First call in step 1 — fetches the raw task before any
analysis.

**How it works:**
Queries the planner database for a single task by its ID. Returns the full task record
including title, description, any manually-assigned `skill_tags`, priority, and due
date. This is the only tool in the workflow that reads directly from the planner
storage; everything downstream works from this payload.

Reuses `getTaskById()` from `packages/planner` — no new database logic required.

| | |
|---|---|
| **Input** | `task_id: string (uuid)` |
| **Output** | `id`, `title`, `description`, `skill_tags: string[]`, `priority: urgent\|important\|medium\|low`, `progress`, `due_at`, `plan_id`, `bucket_id` |

---

### `planner_classifySkillRequirements`

**Position in workflow:** Second call in step 1 — transforms the raw task into a
structured skill requirement list.

**How it works:**
Receives the task's title, description, and existing `skill_tags`. Merges the
explicit tags (marked `source: explicit`, weight `0.8`) with skills inferred from the
free-text description by the LLM (marked `source: inferred`, weight determined by
how central the skill appears in the text). Returns a deduplicated, weighted list.

The LLM performs the inference; this tool normalises and packages the result so the
output schema is always consistent regardless of how the model expressed its
reasoning.

| | |
|---|---|
| **Input** | `title: string`, `description: string\|null`, `existing_skill_tags: string[]` |
| **Output** | `skills_requirement: Array<{ skill: string, level?: junior\|mid\|senior, weight: number (0–1), source: explicit\|inferred }>`, `summary: string` |

---

## Step 2 — AGENT: SkillMatcher

**Goal:** Find team members whose skills match the requirements and rank them by
skill fit score.

**Receives from TaskAnalyzer:** `skills_requirement[]`

**Passes to AvaiChecker:** `ranked_candidates[]`

---

### `staffing_searchMembersBySkills`

**Position in workflow:** First call in step 2 — broad retrieval from the vector
database.

**How it works:**
Converts the `skills_requirement` list into a single query string, embeds it using
OpenAI `text-embedding-3-small`, and runs a cosine similarity search against
`identity.user_skill_embeddings` in pgvector (HNSW index). Returns the top-K members
whose skill vectors are closest to the query — this handles synonyms automatically
(`"k8s"` matches `"kubernetes"` without a synonym map).

**Scope** controls which members are eligible for matching:

- `group` (default) — restricts the search to members of groups the requester can
  access. `group_ids` must be supplied. This is the safe default; the agent never
  silently expands beyond what the requester can see.
- `tenant` — searches across the entire tenant. Opt-in only. Requires the caller to
  hold a cross-group role (e.g. `org.viewer`). The agent must ask the user before
  issuing a tenant-scoped call: *"You have org.viewer — want me to search the whole
  tenant?"*. The scope expansion is recorded in `trust_logEvidenceCitation` so it is
  visible in the TrustLayer audit trail.

Requires the M3 embeddings pipeline to be running. Before M3 is available, can fall
back to filtering `identity.user_profile.skills` by keyword overlap.

| | |
|---|---|
| **Input** | `skills_requirement: Array<{ skill: string, weight: number }>`, `top_k: number (default 10, max 20)`, `scope: 'group' \| 'tenant' (default 'group')`, `group_ids: string[] (required when scope = 'group')` |
| **Output** | `candidates: Array<{ user_id, display_name, email, matched_skills: string[], skill_score: number (0–1) }>`, `scope_used: 'group' \| 'tenant'` |

---

### `staffing_getMemberProfile`

**Position in workflow:** Called once per candidate returned by
`searchMembersBySkills` — enriches each result with full profile data.

**How it works:**
Fetches the complete profile for one member from the identity module: declared skills,
timezone, working hours, and any availability flag set by the user. Used to fill in
context that the vector search result alone does not carry.

Reuses `getUserProfile()` from `packages/identity`.

| | |
|---|---|
| **Input** | `user_id: string` |
| **Output** | `user_id`, `display_name`, `email`, `skills: string[]`, `timezone: string\|null`, `working_hours: { start, end }\|null`, `availability: available\|partial\|unavailable\|null` |

---

### `staffing_rankCandidates`

**Position in workflow:** Final call in step 2 — produces the ordered candidate list
that AvaiChecker will process.

**How it works:**
Pure scoring function with no database calls. For each candidate, iterates through
the skill requirements and accumulates `weight` points for every requirement the
candidate's `matched_skills` satisfy. Divides by total weight to normalise to `0–1`.
Sorts descending and assigns integer ranks starting at 1.

| | |
|---|---|
| **Input** | `candidates: Array<{ user_id, display_name, matched_skills, skill_score }>`, `skills_requirement: Array<{ skill, weight }>` |
| **Output** | `ranked_candidates: Array<{ user_id, display_name, skill_score, rank }>` |

---

## Step 3 — AGENT: AvaiChecker

**Goal:** For each candidate from SkillMatcher, determine how available they currently
are and produce an availability score.

**Receives from SkillMatcher:** `ranked_candidates[]`

**Passes to Recommender:** `avai_status[]`

---

### `staffing_checkInProgressTasks`

**Position in workflow:** First call in step 3 — measures current workload.

**How it works:**
Queries the planner for all tasks with `progress = 'in_progress'` assigned to the
given member. Returns each task with its priority and due date so the downstream
scoring tool can weight urgent, near-deadline work more heavily than low-priority
distant tasks.

Reuses `listTasks({ assignee_id, progress: 'in_progress' })` from `packages/planner`.

| | |
|---|---|
| **Input** | `user_id: string` |
| **Output** | `tasks: Array<{ id, title, priority: urgent\|important\|medium\|low, due_at: string\|null, plan_id }>`, `total_count: number` |

---

### `staffing_checkTimesheetLeave`

**Position in workflow:** Second call in step 3 — checks approved absence in the
relevant date range.

**How it works:**
Returns approved leave days and booked hours per day for the given member over a date
range. In **Phase A** this returns an empty stub (no external system integrated yet).
In **Phase B** this calls MS Graph Calendar via `packages/integrations` to read
calendar events marked as out-of-office or time-off. If the external system is
unavailable the tool returns `degraded: true` rather than blocking the workflow.

| | |
|---|---|
| **Input** | `user_id: string`, `from_date: string (ISO date)`, `to_date: string (ISO date)` |
| **Output** | `leave_days: string[] (ISO dates)`, `booked_hours_per_day: Record<string, number>`, `is_on_leave_today: boolean`, `degraded: boolean` |

---

### `staffing_determineAvailabilityScore`

**Position in workflow:** Final call in step 3 — combines workload and leave signals
into a single score per candidate.

**How it works:**
Pure scoring function. Assigns a cost to each in-progress task based on its priority
(`urgent` = 0.35, `important` = 0.20, `medium` = 0.10, `low` = 0.05). Sums the
costs to get a `taskBurden`. If the member is on leave today the score is immediately
0 (`unavailable`). Otherwise `availability_score = max(0, 1 − taskBurden)`. Assigns
a human-readable label: `high (≥0.7)`, `medium (≥0.4)`, `low (>0)`, `unavailable`.
Also returns a plain-English `reasoning` string that appears verbatim in the final
recommendation rationale.

| | |
|---|---|
| **Input** | `user_id: string`, `tasks: Array<{ priority, due_at }>`, `leave_days: string[]`, `booked_hours_per_day: Record<string, number>`, `target_date?: string` |
| **Output** | `user_id`, `availability_score: number (0–1)`, `label: high\|medium\|low\|unavailable`, `reasoning: string` |

---

## Step 4 — AGENT: Recommender

**Goal:** Merge skill scores and availability scores, filter out unavailable candidates,
rank the remainder, and format the final output ready to attach TrustLayer metadata.

**Receives from AvaiChecker:** `ranked_candidates[]` + `avai_status[]`

**Passes to Orchestrator:** `final_recommendations[]`

---

### `staffing_generateRecommendation`

**Position in workflow:** The single tool in step 4 — produces the final ranked list.

**How it works:**
Joins `ranked_candidates` with `avai_status` on `user_id`. Drops anyone whose
availability label is `unavailable`. For each remaining candidate computes:

```
final_score = skill_score × skill_weight + availability_score × avai_weight
```

Default weights: `skill_weight = 0.6`, `avai_weight = 0.4`. Both weights are
configurable per call. Sorts descending by `final_score`, slices to `top_n` (default 3),
and assigns final ranks. Generates a one-line `explanation` per candidate that surfaces
both the skill match percentage and the availability label with its reasoning string —
this is what the user reads in the chat response.

| | |
|---|---|
| **Input** | `ranked_candidates: Array<{ user_id, display_name, skill_score, rank }>`, `availability_scores: Array<{ user_id, availability_score, label, reasoning }>`, `skill_weight: number (default 0.6)`, `avai_weight: number (default 0.4)`, `top_n: number (default 3, max 10)` |
| **Output** | `recommendations: Array<{ rank, user_id, display_name, final_score, skill_score, availability_score, availability_label, explanation: string }>` |

---

## Complete Tool Map

```
REQUEST
  │
  ▼
Orchestrator
  ├─ trust_createTraceSession
  │
  ├─────────────────────────────────────────── STEP 1: TaskAnalyzer
  │   ├─ planner_fetchTask
  │   │     IN:  task_id
  │   │     OUT: task record (title, description, skill_tags, priority, due_at)
  │   │
  │   ├─ planner_classifySkillRequirements
  │   │     IN:  title, description, skill_tags
  │   │     OUT: skills_requirement[] (skill, weight, source, level?)
  │   │
  │   └─ trust_logReasoningTrace / trust_logEvidenceCitation
  │
  ├─────────────────────────────────────────── STEP 2: SkillMatcher
  │   ├─ staffing_searchMembersBySkills
  │   │     IN:  skills_requirement[], top_k
  │   │     OUT: candidates[] (user_id, matched_skills, skill_score)
  │   │
  │   ├─ staffing_getMemberProfile          [once per candidate]
  │   │     IN:  user_id
  │   │     OUT: profile (skills, timezone, working_hours, availability)
  │   │
  │   ├─ staffing_rankCandidates
  │   │     IN:  candidates[], skills_requirement[]
  │   │     OUT: ranked_candidates[] (user_id, skill_score, rank)
  │   │
  │   └─ trust_logReasoningTrace / trust_logEvidenceCitation
  │
  ├─────────────────────────────────────────── STEP 3: AvaiChecker
  │   ├─ staffing_checkInProgressTasks      [once per candidate]
  │   │     IN:  user_id
  │   │     OUT: tasks[] (priority, due_at), total_count
  │   │
  │   ├─ staffing_checkTimesheetLeave        [once per candidate]
  │   │     IN:  user_id, from_date, to_date
  │   │     OUT: leave_days[], booked_hours_per_day, degraded
  │   │
  │   ├─ staffing_determineAvailabilityScore [once per candidate]
  │   │     IN:  user_id, tasks[], leave_days[], booked_hours_per_day
  │   │     OUT: availability_score, label, reasoning
  │   │
  │   └─ trust_logReasoningTrace / trust_logEvidenceCitation
  │
  ├─────────────────────────────────────────── STEP 4: Recommender
  │   ├─ staffing_generateRecommendation
  │   │     IN:  ranked_candidates[], availability_scores[], skill_weight, avai_weight, top_n
  │   │     OUT: recommendations[] (rank, final_score, skill_score, availability_label, explanation)
  │   │
  │   └─ trust_logReasoningTrace
  │
  └─ trust_buildPayload
        IN:  trace_id, confidence_inputs[] (per-agent scores)
        OUT: TrustPayload (confidence_score, evidence_count, reasoning_steps)

RESPONSE = recommendations[] + TrustPayload
```

---

## Tool Summary Table

| Tool | Agent / Layer | Reads from | Pure logic? |
|------|--------------|-----------|-------------|
| `trust_createTraceSession` | Orchestrator | — | Yes |
| `trust_logReasoningTrace` | All agents | — | Yes |
| `trust_logEvidenceCitation` | All agents | — | Yes |
| `trust_buildPayload` | Orchestrator | Trace session | Yes |
| `planner_fetchTask` | TaskAnalyzer | `planner.tasks` DB | No |
| `planner_classifySkillRequirements` | TaskAnalyzer | LLM reasoning | Yes |
| `staffing_searchMembersBySkills` | SkillMatcher | `user_skill_embeddings` (pgvector) | No — needs M3 |
| `staffing_getMemberProfile` | SkillMatcher | `identity.user_profile` DB | No |
| `staffing_rankCandidates` | SkillMatcher | — | Yes |
| `staffing_checkInProgressTasks` | AvaiChecker | `planner.tasks` DB | No |
| `staffing_checkTimesheetLeave` | AvaiChecker | MS Graph Calendar (Phase B) | No — stub Phase A |
| `staffing_determineAvailabilityScore` | AvaiChecker | — | Yes |
| `staffing_generateRecommendation` | Recommender | — | Yes |

**Total: 13 tools** — 4 TrustLayer, 2 TaskAnalyzer, 3 SkillMatcher, 3 AvaiChecker, 1 Recommender.

---

## Build Priority

### Can be built immediately (no external dependencies)

| Tool | Reason |
|------|--------|
| `trust_*` (all 4) | Pure logging and aggregation |
| `planner_fetchTask` | Wraps `getTaskById()` already in `packages/planner` |
| `planner_classifySkillRequirements` | Pure normalisation; LLM does the inference |
| `staffing_getMemberProfile` | Wraps `getUserProfile()` already in `packages/identity` |
| `staffing_rankCandidates` | Pure weighted scoring — no DB |
| `staffing_checkInProgressTasks` | Wraps `listTasks()` already in `packages/planner` |
| `staffing_checkTimesheetLeave` | Phase A stub returns empty safely |
| `staffing_determineAvailabilityScore` | Pure scoring formula — no DB |
| `staffing_generateRecommendation` | Pure merge and rank — no DB |

### Requires M3 (embeddings pipeline)

| Tool | Blocker |
|------|---------|
| `staffing_searchMembersBySkills` | Needs `user_skill_embeddings` table populated by the embeddings CDC pipeline |

### Requires Phase B (MS Graph integration)

| Tool | Blocker |
|------|---------|
| `staffing_checkTimesheetLeave` | Full implementation needs MS Graph Calendar via `packages/integrations` |

---

## File Structure

```
packages/copilot/src/backend/tools/
├── trust.create-trace-session.ts
├── trust.log-reasoning-trace.ts
├── trust.log-evidence-citation.ts
├── trust.build-payload.ts
├── planner.fetch-task.ts
├── planner.classify-skill-requirements.ts
├── staffing.search-members-by-skills.ts       ← needs M3
├── staffing.get-member-profile.ts
├── staffing.rank-candidates.ts
├── staffing.check-inprogress-tasks.ts
├── staffing.check-timesheet-leave.ts          ← stub Phase A
├── staffing.determine-availability-score.ts
└── staffing.generate-recommendation.ts
```

Each file follows the project pattern:

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RequestContextSchema, registerToolPermission } from './_types';

export const myTool = registerToolPermission(
  createTool({
    id: 'module_toolName',
    description: '...',
    inputSchema: z.object({ ... }),
    outputSchema: z.object({ ... }),
    requestContextSchema: RequestContextSchema,
    execute: async (input, ctx) => { ... },
  }),
  'module.resource.action',
);
```
