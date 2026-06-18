# Agent Tool Development Guide

_Authoritative reference for building, reviewing, and maintaining agent tools in this repo.
Applies to human contributors and AI coding agents equally._

## 0. Quick Reference

| Want to…                                                       | Use                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Expose a read or write capability to a domain specialist       | Tier 1 — `defineAgentTool` + `AgentRegistry.registerSpecialist`                  |
| Share a read-only signal across all specialists (cross-domain) | Tier 2 — `CrossModuleReadToolSpec` + `AgentRegistry.registerCrossModuleReadTool` |
| Wire sub-agents inside a supervisor/workflow runtime           | Tier 3 — `defineAgentTool` bound directly, never in `AgentRegistry`              |
| Chain several frequently-coupled ops behind one call           | [§7.3 Consolidation](#73-when-to-consolidate-multiple-operations-into-one-tool)  |
| Check before merging                                           | [§2 Acceptance Criteria](#2-acceptance-criteria-checklist)                       |
| Name a new tool                                                | [§8 Naming Conventions](#8-naming-conventions)                                   |
| Write a description                                            | [§4 Description Standard](#4-description-writing-standard)                       |
| Decide split vs. combine                                       | [§7 Split vs. Combine](#7-split-vs-combine-rules)                                |
| Add an approval gate                                           | [§9 RBAC & Approval](#9-rbac--approval)                                          |
| Evaluate a tool                                                | [§13 Evaluation](#13-evaluation-required)                                        |
| Update specialist instructions                                 | [§11 Checklist](#11-specialist-instruction-checklist)                            |

---

## 1. Tool Taxonomy

### 1.1 Tier 1 — Specialist Tool

**Pattern:** `defineAgentTool` → registered on a specialist via `AgentRegistry.registerSpecialist`

**Visible to:** The LLM session for that domain (e.g., the `work` specialist sees planner tools).

**May mutate:** Yes. Write tools must gate with `requireApproval: true` (see §9).

**Owns:** A capability that belongs to one domain. If multiple specialists need it, it belongs in Tier 2.

```ts
// packages/{module}/src/backend/agent-tools/{verb-noun}.ts
export const myModuleTool = defineAgentTool({
  id: 'module_verbNoun',
  name: 'Verb Noun',          // ≤5 words, title-case
  description: '…',           // see §4
  input: z.object({ … }),
  output: z.object({ … }),
  rbac: 'module.resource.action',
  needsApproval: false,       // true for unconditional mutations — see §9.2
  execute: async (input, ctx) => { … },
});
```

### 1.2 Tier 2 — Cross-Module Read Tool

**Pattern:** `CrossModuleReadToolSpec` → `defineCrossModuleReadAsTool` → `AgentRegistry.registerCrossModuleReadTool`

**Visible to:** All specialists (via `availableTo: 'all-specialists'`) or consumed programmatically by workflows.

**Must be read-only.** No mutations. The spec is the source of truth; the `AsTool` wrapper makes it LLM-visible.

**Owns:** A read signal that any specialist might need (e.g., user availability, open task count, server time).

```ts
// packages/{module}/src/backend/agent-tools/{resource-signal}.ts
export const mySpec: CrossModuleReadToolSpec<Input, Output> = {
  id: 'module_getSignal',
  description: '…',
  inputSchema,
  outputSchema,
  rbac: 'module.resource.read',
  availableTo: 'all-specialists',
  execute: async ({ session, input }) => { … },
};

export const myTool = defineCrossModuleReadAsTool({
  id: mySpec.id,
  name: 'Get Signal',
  description: mySpec.description,   // single source of truth
  inputSchema,
  outputSchema,
  rbac: mySpec.rbac,
  execute: mySpec.execute,
});
```

Register with `AgentRegistry.registerCrossModuleReadTool(mySpec)` in `register.ts`.

### 1.3 Tier 3 — Internal Orchestration Tool

**Pattern:** `defineAgentTool` bound directly to a sub-agent inside a **supervisor agent** or workflow runtime at build time.

**Visible to:** Sub-agents within the specific runtime. Never in `AgentRegistry`.

**May mutate:** Yes, but prefer command objects passed back to the parent step.

**Owns:** An operation that only makes sense inside a specific workflow's agentic loop (e.g., `callSkillMatcher`, `updateWorkingMemory`).

> Mastra **Networks are deprecated**; use **supervisor agents** for multi-agent delegation. Approval and
> `suspend()` requests from a Tier 3 tool **bubble up the delegation chain** and surface at the
> supervisor's stream — design Tier 3 tools knowing the human gate may be several levels up (see §9.4).

All other tool design rules (§2–§13) still apply — internal tools are called by LLMs and the same selection and reliability dynamics apply.

### 1.4 Which Tier? Decision Tree

```
Does the request chain several frequently-coupled operations the agent would otherwise
call one-by-one (e.g. find availability → create event)?
  └─ Yes → consider a CONSOLIDATED tool (§7.3) at whichever tier owns the domain.

Does it cross a module boundary (needs data from a domain it doesn't own)?
  ├─ Yes, read-only → Tier 2 (CrossModuleReadToolSpec)
  └─ No
       Does it belong exclusively inside one supervisor/workflow's internal sub-agent loop?
         ├─ Yes → Tier 3 (direct defineAgentTool, NOT in AgentRegistry)
         └─ No → Tier 1 (defineAgentTool + registerSpecialist)
```

---

## 2. Acceptance Criteria Checklist

Every tool must pass **all** items before merge. Use this as a PR checklist.

### Gate 1 — Identity

- [ ] `id` follows `{module}_{verbNoun}` camelCase (e.g., `planner_queryTasks`, `identity_getAvailabilityForUser`)
- [ ] `name` is ≤5 words, title-case (e.g., `"Query Tasks"`, `"Get Availability"`)
- [ ] File is at `packages/{module}/src/backend/agent-tools/{verb-noun}.ts`
- [ ] Tool is exported from `packages/{module}/src/backend/agent-tools/index.ts`

### Gate 2 — Description

- [ ] First sentence states what the **user** is trying to accomplish (user-intent framing, not implementation framing)
- [ ] Contains `Use for:` clause with ≥2 concrete example queries written in natural user language
- [ ] If a tool with overlapping apparent purpose exists: contains `Do NOT use` clause that names the other tool explicitly
- [ ] Does not exceed 6 sentences total (more is noise, not signal)
- [ ] Does not mention implementation details (table names, index names, algorithm names) unless the user would need to know them

### Gate 3 — Parameters

- [ ] Entity references that the model **passes through from a prior tool result** use the canonical ID field (§5.3). The model must never be asked to _construct_ a UUID from memory — if there is no upstream tool that produces it, accept a resolvable reference (name + disambiguation, or ordinal) instead
- [ ] All bounded value spaces use `z.enum` not `z.string` (e.g., status, priority, sort order)
- [ ] Optional parameters have explicit defaults stated in `.describe()` (e.g., `"Default: 20"`)
- [ ] Parameter names are consistent with all other tools that reference the same entity type — see [§5.3 naming table](#53-naming-consistency-table)
- [ ] No parameter accepts relative paths, timestamps-as-strings-without-format, or context-dependent implicit values

### Gate 4 — Output

- [ ] List results return compact summaries — ≤10 fields per item; full record belongs in a `get*` tool
- [ ] Output returns **only the IDs the next step actually needs**, not every ID on the record (§6.2). Opaque IDs the agent will not chain are noise — omit them or hide them behind `responseFormat: 'detailed'`
- [ ] If the tool supports both reasoning and chaining, it exposes `responseFormat: 'concise' | 'detailed'` (§6.2)
- [ ] Any tool that returns tasks calls `recordEntityExposure(ctx, { recentTasks: […] })`
- [ ] Any tool that returns a user calls `recordEntityExposure(ctx, { lastDiscussedUserId: … })` if relevant
- [ ] Error/empty responses are actionable, not opaque (§6.6)
- [ ] If the result set can exceed 50 items: pagination uses `cursor`/`nextCursor` pattern

### Gate 5 — Scope

- [ ] The tool answers ≥2 distinct user query patterns (not a single-answer tool), **or** it consolidates a frequently-chained multi-step workflow into one call (§7.3)
- [ ] **Substitution test:** "Could I delete this tool and replace it with a new parameter on an existing tool?" — if yes, do that instead
- [ ] **Overlap test:** No two registered tools in the same specialist can answer the same query class; if they would, add a hard `Do NOT use` boundary in both descriptions

### Gate 6 — RBAC & Approval

- [ ] `rbac` matches the most restrictive permission the caller needs for this operation
- [ ] Every tool that **unconditionally** mutates state has `requireApproval: true` (§9.2)
- [ ] Mutations whose risk is **runtime-conditional** (depends on amount, blast radius, target) use `suspend()` inside `execute` instead of a static flag (§9.2)
- [ ] Tools intended only for the chat flow state the path constraint as the first line of the description (§9.3)

### Gate 7 — Specialist Instructions

- [ ] The specialist's `register.ts` `instructions` string is updated with a `Use planner_X when …` line for this tool
- [ ] If this tool narrows another tool's applicable scope, the other tool's `Do NOT use` clause is updated too
- [ ] If this tool replaces an existing tool: the old tool's description is updated to redirect, or the tool is removed

### Gate 8 — Evaluation _(new — see §13)_

- [ ] At least one Mastra eval task exercises this tool against a realistic prompt with a verifiable outcome
- [ ] For a new tool, the eval shows the agent **selects** it for its intended query class and **does not** select it for a neighbouring tool's class
- [ ] For a changed description/scope, the eval is re-run and selection accuracy did not regress versus the prior baseline

---

## 3. Design Principles

### P1 — Cover a family, not a single query

A tool should answer a _family_ of related questions through parameterization. The test: if you remove this tool, does an entire _class_ of user queries become unanswerable? If only one specific query breaks, the tool is too narrow.

**Wrong:** `listTasksForUser(userId)` — answers exactly one thing.
**Right:** `queryTasks({ assigneeUserId?, planId?, status?, skillTags? })` — answers "find Tuấn's tasks", "what's overdue in plan X", "show me docker-tagged tasks", all as parameter variants.

Parameters are how you generalize a tool. A tool with zero optional parameters is almost always too narrow. (The one principled exception: a **consolidated** tool that runs a fixed multi-step workflow under the hood — see §7.3.)

### P2 — Description is the selection contract

In this repo, tools are loaded **into the agent's context** and the model selects among them by attending over their names, descriptions, and schemas — it is _not_ a separate vector-similarity retrieval step (unless you explicitly add a tool-retrieval layer; see §6.7). Practically, this means the description and the `Do NOT use` boundaries are what steer selection, and even small wording changes move behaviour measurably.

Write descriptions from the **user's intent**, not the implementation:

- What problem is the user trying to solve? Name that first.
- Include the verbs users actually say: "find", "show", "list", "search", "get", "check".
- Assertive scope cues ("Use for X. Do NOT use for Y.") are the primary mechanism for routing between similar tools.

> If you _do_ add a retrieval layer that shortlists tools by embedding similarity before they reach
> context, then lexical overlap between user phrasing and the description starts to matter too — but
> verify that with an eval rather than keyword-stuffing on faith.

### P3 — Poka-yoke parameters (mistake-proofing)

Design parameters so the most common mistake is impossible, not just discouraged.

- Prefer enum over freeform string when the space is bounded.
- Use `status: 'open' | 'completed' | 'any'` over `percentCompleteLt: number` — the model knows the vocabulary; it doesn't know your data distribution.
- Use absolute paths/dates over relative ones; state the required format in `.describe()`.
- Make the safe default explicit: `.default('open')`, not silently undefined.
- **On IDs:** accept a passed-through ID when an upstream tool produced it; otherwise accept a resolvable reference (e.g. `taskRef` that takes a UUID _or_ an ordinal `"#1"`). Never force the model to invent a UUID it was never given — that is the mistake to make impossible (§5.2).

### P4 — Output serves the next step

Tool outputs become the inputs of subsequent tools. Design output with the downstream call in mind — but include only what the next step needs.

- Include the IDs the caller will actually chain (`taskId` to open a task; `planId`/`groupId` only if a downstream tool consumes them). Do **not** reflexively attach every ID on the record — opaque IDs the agent won't use are context noise and reduce precision.
- List results should be compact summaries. Full detail belongs in a `get*` tool.
- When a tool serves both "reason about results" and "chain an ID" use cases, expose `responseFormat` (§6.2) so the agent pays for IDs only when it needs them.
- Update `recentTasks` or other working-memory fields when returning entity lists, so the user can reference results by ordinal in the next turn.

### P5 — Semantic search ≠ structured query

These are fundamentally different operations and must be separate tools:

|            | Semantic / `find*`                       | Structured / `query*` or `list*` |
| ---------- | ---------------------------------------- | -------------------------------- |
| Input      | Natural language text                    | Typed filter predicates          |
| Selects by | Vector similarity                        | Exact DB predicates              |
| Good for   | "tasks about onboarding"                 | "Tuấn's open tasks in plan X"    |
| Bad for    | Filtering by specific person/date/status | Discovering topics or themes     |
| Freshness  | May be stale (indexed)                   | Always live from DB              |

Overloading semantic search to serve structured queries means the model attempts similarity matching against a person's name — it finds tasks that _mention_ the name, not tasks _assigned_ to that UUID. (This is the one split that is always worth it; see §7.2 for splits that are _not_ always worth it.)

### P6 — Fewer, broader tools — but measure, don't guess

Tool-selection accuracy tends to degrade as the registered set grows and as tools overlap; this is consistently reported in the literature (losses across studies span a wide range depending on model, registry size, and overlap). Anthropic likewise warns that too many or overlapping tools distract agents from efficient strategies. So: every new tool must justify itself by covering ground no existing tool covers, and before creating one, ask whether it can be a parameter on an existing tool.

**Budget, not law.** Aim for a small orthogonal set per specialist (a working target of **~10–12 registered tools**), but treat that number as a _trigger to run an eval (§13)_, not a hard merge gate. The right ceiling is model- and retrieval-dependent; recent work shows adaptive shortlists of far fewer than a dozen tools can match much larger sets, and that shorter in-context tool lists improve selection accuracy. If a specialist genuinely needs many tools, reach for **dynamic tool loading** (§6.7) rather than cramming everything into every turn.

### P7 — One owner per conceptual space

No two tools in the same specialist context should answer the same query class. When two tools overlap (e.g., two user-search tools that both accept skill keywords), one must be removed or the descriptions must draw a hard non-overlapping boundary enforced by `Do NOT use` clauses in both. Confirm the boundary holds with an eval (§13) — overlap failures are exactly what evals catch.

---

## 4. Description Writing Standard

### 4.1 Template

```
{One sentence: what the user is trying to do — user language, not implementation language.}

Use for: {query example 1 in quotes}; {query example 2}; {query example 3}.
Do NOT use {condition} — use {other_tool_id} instead.

{One optional sentence: key constraint or behaviour to know (e.g., "Requires groupId — always resolvable from a task result.").}
```

Rules:

- First sentence = intent, not description. "Find tasks assigned to a specific person or matching filter criteria." not "Wraps listTasks() with filter support."
- `Use for:` examples must be written as the user would say them, not as technical descriptions.
- `Do NOT use` is required whenever another tool overlaps in apparent purpose.
- 6 sentences maximum. More is noise.
- No implementation details (table names, algorithm names) unless operationally relevant.

### 4.2 Good vs. Bad Examples

**Bad — implementation framing, no scope boundaries:**

```
'Semantic search across tasks using natural language. Use for: (1) task discovery — when a user asks to find, list, or search tasks by topic, keyword, or theme; (2) dedup-on-create reasoning; (3) "who has done similar work" reasoning when picking an assignee.'
```

Problem: "find, list, or search tasks" is too broad — it will absorb structured queries. No `Do NOT use` boundary against a structured filter tool.

**Good — intent framing, hard boundary:**

```
'Find tasks whose content matches a topic or keyword.

Use for: "find tasks about onboarding"; "anything related to the API migration"; "who has done work like this before".
Do NOT use to filter by assignee, plan, status, or date range — use planner_queryTasks for those.

Results are ranked by semantic similarity; they may be slightly stale on status and assignee fields.'
```

---

**Bad — no context, no examples:**

```
'Returns the current user's profile (display name, email, tenant, availability).'
```

Problem: The model doesn't know when to call this vs. not, or what to do with the output.

**Good:**

```
'Read the calling user's own profile: display name, email, skills, availability, and timezone.

Use for: "who am I?"; "what are my skills?"; "am I available today?"; to get your own userId before excluding yourself from candidate lists.
Call this once at the start of any flow that references "me" or "I" — the result is cheap and can be reused across the turn.'
```

### 4.3 Anti-Patterns in Descriptions

| Anti-pattern           | Example                                           | Fix                                                    |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Implementation framing | "Wraps listTasks() with assignee filter"          | "Find tasks assigned to a specific person"             |
| Omnibus scope          | "Use for any find, list, or search request"       | Enumerate what you mean; add `Do NOT use` for the rest |
| Missing boundary       | Two tools with similar names, no mutual exclusion | Add `Do NOT use X — use Y instead` to both             |
| Over-length            | Paragraph about algorithm details                 | Max 6 sentences; cut algorithm discussion              |
| Imperative-only        | "Returns X. Takes Y. Produces Z."                 | Lead with user intent, not I/O description             |

---

## 5. Parameter Design Standard

### 5.1 Type Selection Rules

| Value space                             | Use                                                            |
| --------------------------------------- | -------------------------------------------------------------- |
| Bounded set of known values             | `z.enum(['a', 'b', 'c'])` — never `z.string()`                 |
| Free-form human text                    | `z.string().min(1).max(N).describe('…')` with explicit max     |
| Entity reference (passed through)       | `z.string().describe('…ID from {producing tool}')`             |
| Entity reference (no upstream producer) | resolvable ref: name + disambiguation, or ordinal `"#1"`       |
| Integer count/offset                    | `z.number().int().min(1).max(N).default(D)`                    |
| Boolean flag                            | `z.boolean().default(false).describe('true when …')`           |
| ISO date                                | `z.string().describe('ISO-8601 date string, e.g. 2026-06-11')` |

### 5.2 Entity Reference Rules

The goal is that the model **never constructs an identifier it was not given**. Two cases:

1. **The ID came from a prior tool result.** Accept it directly and tell the model where it comes from:
   `userId: z.string().describe('UUID from identity_whoAmI, identity_getAvailabilityForUser, or search results')`. This pass-through pattern is safe — the model is copying, not inventing.

2. **There is no upstream tool that produces the ID.** Do **not** demand a raw UUID — the model will hallucinate one. Accept a resolvable reference instead (a name plus disambiguating context, or an ordinal that maps to working memory). Tasks already do this via `taskRef` (UUID _or_ `"#1"`); extend the same courtesy to other entities where the model often has only a name.

> **Why not "always UUID"?** Agents handle opaque alphanumeric identifiers worse than semantic or
> ordinal ones, and resolving UUIDs to meaningful/0-indexed references measurably improves retrieval
> precision and reduces hallucination. UUIDs are correct as _plumbing between tool calls_; they are a
> liability when the model has to originate or reason about them. Match the reference type to where the
> value comes from.

### 5.3 Naming Consistency Table

These names are fixed. Every tool that references these entities must use exactly these field names:

| Entity                       | Tool input param                                         | Tool output field                                                                            |
| ---------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Task                         | `taskRef` (string: UUID or ordinal)                      | `taskId`                                                                                     |
| User                         | `userRef` (UUID from a prior result, or resolvable name) | `userId`                                                                                     |
| Plan                         | `planId`                                                 | `planId`                                                                                     |
| Group                        | `groupId`                                                | `groupId`                                                                                    |
| Bucket                       | `bucketId`                                               | `bucketId`                                                                                   |
| Tenant                       | _(derived from session, not a param)_                    | `tenantId`                                                                                   |
| Task progress (input filter) | `status: 'open' \| 'completed' \| 'any'`                 | _(coarse filter — maps to percent_complete thresholds internally; never expose raw numbers)_ |
| Task progress (output)       | _(derived from DB)_                                      | `status: 'not_started' \| 'in_progress' \| 'completed' \| 'deferred'`                        |
| Task priority                | `priority: 'urgent' \| 'important' \| 'medium' \| 'low'` | same                                                                                         |

Do not introduce `assigneeUserId` when the user concept is already covered. Do not introduce `task_id` when `taskId` is the convention. Resolve `userRef`/`taskRef` to a canonical ID inside `execute` (`resolveTaskRef`, `resolveUserRef`) before hitting the DB.

### 5.4 Poka-Yoke Patterns

These are mandatory for the listed scenarios:

| Scenario                | Poka-yoke                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| File or resource path   | Require absolute path; state in `.describe()`: `'Absolute path. Do not use relative paths.'`                                      |
| Task reference          | Use `resolveTaskRef(ctx, taskRef)` which handles both UUID and ordinal `"#1"` — don't accept raw UUID only                        |
| User reference          | Use `resolveUserRef(ctx, userRef)` — accept a passed-through `userId` or a resolvable name; never demand a model-constructed UUID |
| Progress filter         | Map to `status` enum; never expose `percentCompleteLt: number` to the LLM                                                         |
| User in output position | Include `userId` **and** `displayName`; the ID chains, the name lets the model reason and speak                                   |
| Date range              | Require ISO-8601 string; state example in `.describe()`: `'ISO-8601, e.g. "2026-12-31"'`                                          |

---

## 6. Output Shape Standard

### 6.1 Compact List vs. Full Record

| Operation             | Shape                  | Max fields per item |
| --------------------- | ---------------------- | ------------------- |
| List / query / search | Compact summary        | 10                  |
| Single-item get       | Full record            | No limit            |
| Count / aggregate     | Scalar or small object | —                   |

A compact task summary includes: `taskId`, `title`, `status`, `priority`, `dueAt`, `skillTags`, `reviewState`, `assignees[] (userId + displayName)`, `planId`, `groupId` — and even here, prefer `responseFormat: 'concise'` to drop the IDs when the agent is only summarising.

Full task detail (all checklist items, all labels, all references, version) belongs in `planner_getTask` only.

### 6.2 ID Discipline and `responseFormat`

Two competing pressures: the next tool call may need an ID, but a list full of opaque UUIDs burns context and hurts precision. Resolve the tension explicitly rather than defaulting to "include everything":

- Include an ID **only if a downstream tool consumes it.** If nothing chains `groupId`, don't return it.
- For tools used both to **reason** and to **chain**, expose a verbosity switch:

```ts
responseFormat: z.enum(["concise", "detailed"])
  .default("concise")
  .describe(
    "concise = human-readable fields only (names, titles, status); " +
      "detailed = also include IDs (taskId, planId, groupId) needed to call other tools.",
  );
```

`concise` returns names/titles/status and no IDs (cheaper, better for reasoning and final answers). `detailed` adds the IDs the agent needs to make a follow-up call. This mirrors the recommended pattern of letting the agent choose response verbosity instead of hard-coding one shape.

### 6.3 Always Include in Output

- **The state/flags relevant to the next decision** (e.g., `reviewState`, `pendingAssignWorkflowRunId`).
- **`nextCursor`** (nullable) when the result is paginated.
- **The IDs a known downstream tool requires** — but only those, and prefer to gate them behind `responseFormat: 'detailed'`.

### 6.4 Never Include in Output

- Internal DB columns (`version`, `order_hint`, `updated_at`) unless the caller will display or act on them.
- Raw `percent_complete` number — map to the `status` enum before returning.
- IDs that no registered tool consumes (dead-weight identifiers).
- Nested full objects when a compact reference suffices for the next step.
- Fields the specialist instructions say are stale (e.g., do not rely on assignee fields from semantic search results).

### 6.5 Working Memory Integration

Call `recordEntityExposure` whenever the tool surfaces entities the user might reference in the next turn:

```ts
await recordEntityExposure(ctx as never, {
  recentTasks: results.map((t) => ({ taskId: t.taskId, title: t.title })),
  lastDiscussedTaskId: results[0]?.taskId ?? null,
});
```

This populates the model's `recentTasks` working-memory list, enabling ordinal references (`"the first one"`, `"#2"`) in follow-up messages without requiring a UUID — which is also why `taskRef`/`userRef` accept ordinals (§5.2).

Rules:

- Any tool that returns ≥1 task must call `recordEntityExposure`.
- Overwrite `lastDiscussedTaskId` only when returning a single focused task.
- Do not record user IDs in `recentTasks` — only tasks.

### 6.6 Error and Empty Responses _(new)_

Errors are read by the model, so make them steer the next action — not dump a stack trace.

- On a validation failure, say what was wrong and what valid input looks like:
  `"No user matched 'Tuan'. Pass a userId from search results, or call identity_searchUsersBySkills first."`
- On an empty result, distinguish "no matches" from "wrong tool": an empty structured query should hint at loosening filters; an empty semantic search should hint that the topic may not exist or to try `planner_queryTasks` for a person/status filter.
- Never return opaque codes or raw exceptions to the model. A good error response is a prompt: it tells the agent the corrective move.

### 6.7 Pagination and Dynamic Tool Loading

Pagination uses a cursor, not offset/page. The `cursor` parameter is always optional; omit it for the first page.

```ts
outputSchema: z.object({
  items: z.array(itemSchema),
  nextCursor: z
    .string()
    .nullable()
    .describe(
      "Pass as `cursor` in the next call to get the following page. null = no more pages.",
    ),
});
```

**Dynamic tool loading (scaling past the budget).** When a specialist legitimately needs many tools, do not load them all every turn. Use a retrieval/shortlisting layer (or a discovery tool) so only the relevant subset enters context for a given task. This keeps per-turn tool count near the P6 budget while preserving breadth, and is the standard answer to large tool registries.

---

## 7. Split vs. Combine Rules

### 7.1 When to add a parameter to an existing tool (combine)

Add a parameter, don't create a new tool, when:

- The new query is a **subset** of what the existing tool returns, selectable by a filter.
- The two operations share the same **output shape**.
- The new parameter can be **optional** with a sensible default.
- Removing the new parameter gives you the existing behaviour exactly.

**Example:** "List tasks for a specific user" is a subset of "list tasks by any filter criteria". Add `assigneeUserId?: string` to `planner_queryTasks`, do not create `planner_listTasksByAssignee`.

### 7.2 When to create a new tool (split)

Create a new tool when:

- The new capability has a **fundamentally different output shape**.
- It requires **different RBAC** that cannot be derived from the existing tool's permission.
- It is a **write** operation when the existing tool is read — _usually_ split reads and writes, but see the caveat below.
- It operates on a **different entity type** (a task tool and a comment tool are different even if both touch tasks).
- The **query mechanism** is orthogonal (semantic search vs. structured filter — always split these; this is the firm one, §P5).
- Adding the new capability to the existing tool would make that tool's description **impossible to write clearly** because the use cases are too different.

> **Read/write caveat.** "Always split reads and writes" is a default, not an absolute. A read that
> _filters_ (Anthropic's `search_logs` over `read_logs`) is fine, and a consolidated workflow tool may
> legitimately read-then-write (§7.3). Split when the split buys clarity or RBAC separation; don't split
> reflexively when it just inflates tool count against the P6 budget. Let an eval (§13) settle close calls.

### 7.3 When to consolidate multiple operations into one tool _(new)_

The opposite of splitting: when the agent would otherwise call several tools in a fixed sequence to accomplish one user goal, consider a single tool that does the chain under the hood. This reduces selection steps, saves the context the intermediate outputs would have consumed, and removes a class of mis-chaining errors.

Consolidate when:

- The sub-steps are **almost always called together** in the same order for one user intent.
- The intermediate outputs are **plumbing** the user never needs to see.
- The combined operation still has a **single, clearly describable purpose**.

**Examples (Anthropic's pattern):**

- `schedule_event` that finds availability _and_ books — instead of `list_users` + `list_events` + `create_event`.
- `get_customer_context` that compiles recent activity, transactions, and notes in one call — instead of three gets.
- In this repo: a `planner_assignBestCandidate` that resolves group → searches users by skills → proposes the assignment, rather than making the agent chain three tools, **provided** the write still routes through the approval gate (§9).

Do **not** consolidate when the sub-steps are independently useful, when the agent legitimately needs to branch on an intermediate result, or when it would force an un-writeable omnibus description. Consolidation trades flexibility for reliability — verify the trade with an eval.

---

## 8. Naming Conventions

### 8.1 Tool ID

Format: `{module}_{verbNoun}` in camelCase.

- `module`: the owning package name (e.g., `planner`, `identity`, `core`, `knowledge`)
- `verbNoun`: action + target (e.g., `getTask`, `queryTasks`, `searchUsersBySkills`, `postComment`)

The verb should describe the **operation type**:

- `get*` — fetch a single known entity by ID
- `query*` / `list*` — fetch a filtered collection
- `search*` / `find*` / `match*` — discovery by similarity or keyword
- `create*` / `update*` / `delete*` / `post*` / `set*` / `assign*` — mutations

Examples: `planner_queryTasks`, `identity_getUserProfile`, `knowledge_searchDocuments`

**Do not use dot notation** (`knowledge.search-tenant-knowledge`) — this breaks the `{module}_{verbNoun}` contract and is inconsistent with every other tool.

> Prefix namespacing (`{module}_…`) is the repo standard for consistency and is required. Note that the
> _measured_ effect of prefix vs. suffix namespacing varies by model; if you ever evaluate a change to
> the scheme, drive it with an eval rather than preference.

### 8.2 Tool Name (display)

- ≤5 words, title-case
- Human-readable, matches what a user would call the action
- `"Query Tasks"`, `"Get Availability"`, `"Search Documents"`, `"Propose Assignment"`

### 8.3 File Name

`{verb}-{noun}.ts` in kebab-case.

Examples: `query-tasks.ts`, `get-task.ts`, `search-users-by-skills.ts`, `post-comment.ts`

---

## 9. RBAC & Approval

> This section matches the current **Mastra Agent Approval** API. `requireApproval` is a `createTool`
> field; `requireToolApproval` is a `stream()`/`generate()` option; `suspend()` is called inside
> `execute`. `defineAgentTool` forwards `requireApproval` to the underlying `createTool`.

### 9.1 Permission Taxonomy

Format: `{module}.{resource}.{action}[.{scope}]`

| Suffix         | Meaning                                              |
| -------------- | ---------------------------------------------------- |
| `.read`        | Read any record the session can see                  |
| `.read.self`   | Read only the calling user's own record              |
| `.read.tenant` | Read any record in the tenant (broader than `.read`) |
| `.write`       | Mutate; typically gated by approval                  |
| `.write.self`  | Mutate only own record                               |
| `.create`      | Create new record                                    |
| `.assign`      | Assign ownership/membership                          |

Use the **most restrictive** permission that still lets the tool work. Prefer `.read.self` over `.read` for self-only tools. Prefer `.read` over `.read.tenant` unless the query genuinely spans the entire tenant.

### 9.2 Approval Mechanisms

Mastra offers **two** ways to gate a tool call. Pick by whether the risk is unconditional or runtime-conditional.

**A. Pre-execution approval — `requireApproval: true` (tool-level).**
The call pauses _before_ `execute` runs. Use for unconditionally sensitive operations (delete, send, charge, assign).

```ts
export const deleteTaskTool = defineAgentTool({
  id: 'planner_deleteTask',
  name: 'Delete Task',
  description: '…',
  inputSchema, outputSchema,
  rbac: 'planner.task.write',
  requireApproval: true,            // pauses before execute; emits a `tool-call-approval` chunk
  execute: async (input, ctx) => { … },
});
```

The stream emits a `tool-call-approval` chunk carrying `{ toolCallId, toolName, args }`. The app calls `approveToolCall({ runId })` or `declineToolCall({ runId })` to continue. (Non-streaming `generate()` returns `finishReason: 'suspended'` with a `suspendPayload`; resume with `approveToolCallGenerate` / `declineToolCallGenerate`.)

**B. Runtime-conditional approval — `suspend()` inside `execute`.**
When approval depends on what `execute` discovers at runtime (amount over a threshold, destructive target, ambiguous input), don't use a static flag. Start executing, then `suspend()` with a `suspendSchema` payload and resume with `resumeSchema` data.

```ts
execute: async (input, ctx) => {
  const { resumeData, suspend } = ctx?.agent ?? {};
  if (input.amount > THRESHOLD && !resumeData?.approved) {
    return suspend?.({ reason: `Confirm transfer of ${input.amount}?` }); // emits `tool-call-suspended`
  }
  return doTransfer(input);
};
```

The stream emits a `tool-call-suspended` chunk with your `suspendPayload`; resume via `resumeStream(resumeData, { runId })`. Remember: `suspend()` does not throw — `return` immediately after calling it.

**C. Request-level approval — `requireToolApproval` (boolean or function).**
Set on the `stream()`/`generate()` call to gate _every_ tool, or pass a function `({ toolName, args, requestContext, workspace }) => boolean` to gate dynamically. A tool's own `requireApproval` always takes precedence. (Function form is unavailable for durable/stored agents — they fall back to gating everything.)

| Condition                                                     | Mechanism                                  |
| ------------------------------------------------------------- | ------------------------------------------ |
| Unconditional mutation (create, update, delete, assign, post) | `requireApproval: true` on the tool        |
| Mutation whose risk depends on runtime values                 | `suspend()` inside `execute`               |
| Gate every tool for a whole request                           | `requireToolApproval: true` on the request |
| Gate tools dynamically for a request                          | `requireToolApproval: (info) => boolean`   |
| Pure read                                                     | none                                       |

Do not bypass these for write operations. Approval requires a **storage provider** configured on the Mastra instance (snapshots), or you'll hit "snapshot not found".

### 9.3 Chat-Flow vs. Canvas/Workflow Constraint

Some tools must only run on one path. State it in the **first line of the description**, and repeat it in the specialist instructions:

```
// Chat flow only:
'Chat flow only — surfaces an approval card via the chat recorder. In canvas/workflow paths, use the suspend mechanism in the step directly.'

// Canvas/workflow only:
'Canvas and workflow path only. In the chat flow, use planner_proposeAssignment instead.'
```

### 9.4 Approval Across Delegation (Supervisor Agents)

When a Tier 3 tool inside a sub-agent requires approval or calls `suspend()`, the request **bubbles up the delegation chain** and surfaces at the supervisor's stream as a `tool-call-approval` / `tool-call-suspended` chunk. Pass the `toolCallId` from the chunk when approving/declining if multiple calls may be pending (common in supervisors). Design Tier 3 approvals knowing the human gate may be several levels above the tool.

---

## 10. Cross-Module Patterns

### 10.1 CrossModuleReadToolSpec vs. defineAgentTool

Use `CrossModuleReadToolSpec` when:

- The tool reads from a domain it doesn't own (e.g., planner reading identity availability).
- It must be consumable by both the LLM (via `defineCrossModuleReadAsTool`) and programmatic callers (workflows, orchestration steps).
- It is **read-only**.

Use `defineAgentTool` directly when:

- The tool belongs exclusively to one specialist and is never called programmatically by other modules.
- The operation is a write (mutations cannot be cross-module reads).

### 10.2 `availableTo` Rules

```ts
availableTo: "all-specialists"; // tool appears in every specialist's context
// (omit)                        // tool is only consumed programmatically, not LLM-visible
```

Set `availableTo: 'all-specialists'` only when the signal is genuinely needed by multiple domain specialists — every all-specialists tool counts against every specialist's P6 budget. If only one specialist needs it, make it a Tier 1 tool on that specialist instead.

### 10.3 Factory vs. Direct Export

Use a **factory function** (e.g., `plannerFindSimilarTasksTool(deps)`) when the tool requires runtime dependencies at build time (vector store, embedding provider, external client). Pass these as a typed `deps` object; use lazy getters to avoid failing at module load when env vars are absent.

Use a **direct export** (e.g., `export const plannerGetTaskTool = defineAgentTool(…)`) when the tool uses only the shared DB pool and session, which are available everywhere at runtime.

---

## 11. Specialist Instruction Checklist

Specialist instructions in `register.ts` are load-bearing — they direct the model to the right tool for each query class. Update them on every tool change.

### When adding a tool

1. **Add a `Use {tool_id} when` line** under the relevant section heading in the instructions.
   Include: the query patterns it covers, the key input it needs, and what it returns.
2. **Add a `Do NOT use {tool_id}` boundary** on every other tool whose description overlaps.
   Example: when adding `planner_queryTasks`, update `planner_findSimilarTasks`'s section to say
   "Do NOT use for filtering by assignee, plan, or status — use `planner_queryTasks` instead."
3. **If the new tool supersedes another tool for a query class**, mark the old tool's section:
   "For structured filter queries, use `planner_queryTasks` instead. `planner_findSimilarTasks` is for topic/semantic discovery only."
4. **Add the tool to the `## Tool reference` block** at the bottom of the instructions (Read or Write section).
5. **Verify the instructions compile:** no section should say "use tool X for ANY [query type]" — that phrasing is always wrong. Every tool has boundaries.
6. **Add the tool to the `tools: {}` object** in the specialist registration call.
7. **Add/extend an eval task (§13)** that confirms the model routes to the new tool for its class and not for a neighbour's.

### When modifying a tool

- If the tool's scope changed (narrowed or expanded), update all `Use when` and `Do NOT use` clauses that reference it, and **re-run the eval** to confirm no selection regression.
- If the tool's parameters changed, update any example calls in the instructions.

### When removing a tool

- Remove the tool from `tools: {}`.
- Update every instruction section that referenced it to point to the replacement or remove the guidance.
- Add a `Do NOT use {removed_id}` tombstone for one release cycle if the tool ID was stable — prevents confusion in cached sessions.

---

## 12. Anti-Patterns

### AP1 — Single-Answer Tool

**Symptom:** Tool name contains a proper noun, a hardcoded filter value, or describes exactly one query: `listTasksByAssignee(userId)`, `getOverdueTasks()`.
**Why it fails:** One query → one PR → 30 tools for 30 query types. Selection accuracy degrades as tool count grows.
**Fix:** Generalize to filter parameters. `queryTasks({ assigneeUserId?, status?, dueBefore? })` covers all three in one tool.

---

### AP2 — Semantic Search Overload

**Symptom:** Specialist instructions say "use `find*` for any find/list/search request." A vector-search tool is the catch-all.
**Why it fails:** Vector search matches by content similarity. `findSimilarTasks("Vũ Minh Tuấn")` returns tasks that _mention_ his name, not tasks _assigned_ to his UUID. The agent follows instructions loyally, lands in the wrong tool, gets no results.
**Fix:** Separate `find*` (semantic/topic discovery) from `query*` or `list*` (structured predicates), and distinguish them in the instructions.

---

### AP3 — Wrong Approval Mechanism

**Symptom:** A write tool uses `requireApproval: true` when the risk is actually conditional, so it pauses for harmless calls and trains users to rubber-stamp; or a tool needs runtime-conditional confirmation but has no `suspend()` and just executes.
**Why it fails:** Unconditional gates on conditional risk cause approval fatigue; missing gates on conditional risk cause unreviewed mutations. Mastra distinguishes the two (§9.2) for a reason.
**Fix:** Unconditional risk → `requireApproval: true`. Runtime-conditional risk → `suspend()` inside `execute` with a `suspendSchema`/`resumeSchema`.

---

### AP4 — Buried Constraint

**Symptom:** A tool has a required runtime constraint (needs a specific ctx value, only valid in certain contexts, requires a prior tool call) that is mentioned only in a code comment or not at all.
**Why it fails:** The model reads the description to decide whether to call the tool. Constraints not in the description are invisible to the model.
**Fix:** Every non-obvious constraint goes in the description. "Requires groupId — always resolvable from a task or plan result; call `planner_getTask` first if no group is in context."

---

### AP5 — Duplicate User-Search Tools

**Symptom:** Two tools in the same specialist both accept skill keywords and return user candidates. The model picks arbitrarily.
**Why it fails:** Overlapping purpose with no mutual boundary means the model chooses by name/description heuristics — inconsistently.
**Fix:** Give each a hard non-overlapping scope enforced by `Do NOT use` in both descriptions; or consolidate into one tool with a `matchMode: 'exact' | 'semantic'` parameter. Confirm with an eval.

---

### AP6 — Output Bloat / ID Dump

**Symptom:** A list tool returns full task records (20+ fields including `version`, `order_hint`, all checklist items) — or attaches every ID on the record whether or not anything chains it.
**Why it fails:** A list of full records fills the context window, and a wall of opaque UUIDs the agent will never use degrades its precision and leaves no room to reason.
**Fix:** List operations return compact summaries; include only IDs a downstream tool consumes, and gate them behind `responseFormat: 'detailed'`. Full detail lives in `getTask`.

---

### AP7 — Assert-Without-Measure

**Symptom:** A tool (or a description rewrite) ships on the belief that it improves agent behaviour, with no eval to confirm it.
**Why it fails:** Tool quality is a contract with a non-deterministic agent; intuition about what the model will select is frequently wrong, and small wording changes move behaviour. Untested tools accumulate silent selection failures.
**Fix:** Add an eval task (§13). Measure selection and task success before and after. This is Gate 8.

---

## 13. Evaluation _(required)_

Tool quality is only knowable by measuring how the agent actually uses the tool. This repo uses **Mastra Evals**; every tool change carries an eval obligation (Gate 8).

### 13.1 What to evaluate

- **Selection accuracy.** For a set of realistic prompts, does the agent call the _intended_ tool for its query class — and _not_ call it for a neighbouring tool's class? This is where overlap (AP5) and omnibus-scope (AP2) failures show up.
- **Parameter accuracy.** Does the agent populate parameters correctly (right enum value, a passed-through ID rather than an invented one)?
- **Task success.** Does the end-to-end task reach a verifiable outcome?
- **Cost signals.** Tool-call count, token consumption, and error rate per task — these reveal tools that should consolidate (§7.3) or paginate (§6.7).

### 13.2 How to build the eval

1. Write prompts grounded in **real workflows**, not toy sandboxes — multi-step tasks that may require several tool calls are the ones that stress selection.
2. Pair each prompt with a **verifiable** outcome (string/JSON match, or an LLM judge). Avoid over-strict verifiers that reject valid alternative phrasings or strategies.
3. Optionally specify the tools you expect to be called — but don't overfit; there may be more than one valid path.
4. Run the eval, read the **transcripts and reasoning**, and look for where the agent got confused or picked the wrong tool. What the agent omits is often more telling than what it says.
5. Keep a **held-out set** so description tuning doesn't overfit the training prompts.

### 13.3 When to run it

- **New tool:** baseline selection + success before merge (Gate 8).
- **Description or scope change:** re-run; confirm no regression on the neighbouring tools' classes.
- **Crossing the P6 budget:** run the eval to decide whether to consolidate (§7.3), split, or move to dynamic loading (§6.7) — let data, not the number 12, make the call.

> You can let an agent (e.g. Claude Code) analyse the eval transcripts and propose tool/description
> refactors — concatenate the transcripts and ask for self-consistency fixes across the tool set. Treat
> its suggestions as input to another eval run, not as ground truth.

---

## Appendix A — defineAgentTool Full Spec

`defineAgentTool` wraps Mastra's `createTool`. Field names match `AgentToolSpec` in `sdks/agent/src/tool.ts`.

```ts
interface AgentToolSpec<I, O, S, R> {
  id: string; // {module}_{verbNoun}
  name: string; // ≤5 words, title-case
  description: string; // see §4
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  rbac?: string; // 'module.resource.action' — see §9
  needsApproval?: boolean | ((input: z.infer<I>, ctx?) => boolean | Promise<boolean>);
  suspendSchema?: z.ZodType<S>; // payload returned by suspend() — see §9.2(B)
  resumeSchema?: z.ZodType<R>; // data expected on resume
  executionTimeoutMs?: number; // defaults: read 30s, write 60s; max AGENT_TOOL_TIMEOUT_MAX_MS
  execute: (input: z.infer<I>, ctx: AgentToolContext) => Promise<z.infer<O> | undefined>;
}
```

For runtime-conditional approval, omit `needsApproval` and call `ctx.agent.suspend(payload)` inside `execute` (§9.2 B). Every `execute` receives `ctx.abortSignal` — forward it to all DB queries, fetches, and vector calls so resources release on timeout.

## Appendix B — CrossModuleReadToolSpec Full Spec

```ts
interface CrossModuleReadToolSpec<I, O> {
  id: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  rbac: string;
  availableTo?: "all-specialists";
  execute: (opts: { session: SessionScope; input: I }) => Promise<O>;
}
```

`session` is derived from `requestContext` automatically. The `execute` here does not receive the full `ToolContext` — it receives only `session` and `input`. Do not attempt to call `actorFromContext` or `recordEntityExposure` inside a CrossModuleReadToolSpec. Cross-module read tools are read-only, so they never set `requireApproval` or call `suspend()`.

## Appendix C — File Layout Convention

```
packages/{module}/src/backend/agent-tools/
  index.ts               # exports all tools + the {module}AgentTools array
  register.ts            # AgentRegistry.registerSpecialist call + instructions
  {verb}-{noun}.ts       # one tool per file
  {verb}-{noun}.ts
  …
```

`index.ts` exports the tool constants and the `{module}AgentTools` array (for pre-registration without runtime deps). `register.ts` wires up the specialist, injects runtime deps into factory tools, and calls `AgentRegistry.registerCrossModuleReadTool` for any cross-module specs owned by this module.

## Appendix D — Source Basis

The non-obvious recommendations here are grounded in:

- Anthropic, _Writing effective tools for agents_ — consolidation, semantic-over-opaque identifiers, token-efficient/`responseFormat` outputs, actionable errors, namespacing-by-eval, and the evaluation-driven loop.
- Mastra _Agent Approval_ docs — `requireApproval`, `requireToolApproval` (boolean/function), `suspend()`/`resumeStream`, `tool-call-approval`/`tool-call-suspended` chunks, supervisor-agent propagation, storage-provider requirement.
- Tool-selection literature (StableToolBench/BFCL/ToolBench-style studies and 2026 chance-corrected shortlist work) — the directional "more tools → lower selection accuracy" finding and the case for small/adaptive in-context tool sets over fixed large ones.

When Mastra or the underlying models change, re-verify §9 and §13 against current docs and re-run the evals.
