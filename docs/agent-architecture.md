# Agent system

Seta's agent system is a **three-tier supervisor tree**: a top router selects a domain, a domain supervisor coordinates the specialists and workflows registered in that domain, and each specialist is a Mastra `Agent` composed from a curated tool record. Every write tool is gated by an explicit human-in-the-loop approval; every workflow step is audited and replayable through the same event bus as the rest of the platform.

This document explains the design by tracing one realistic workload — planner assignment assistance for a product manager — from user pain point through to implementation. The planner is used as the running example because it exercises every layer the system offers: a specialist with read and HITL-gated write tools, a deterministic multi-step workflow (`assignBySkill`), and cross-module read tools owned by `identity`.

**Related documents.** [`architecture.md`](./architecture.md) describes the surrounding platform shape (modules, event bus, identity). [`tech-stack.md`](./tech-stack.md) records the rationale for Mastra, AI SDK v6, and assistant-ui. [`creating-modules.md`](./creating-modules.md) is the module-author guide.

> **Scope note.** Every layer described below — top router, domain supervisors, the `planner` / `identity` / `self` / `meta` specialists, the `assignBySkill` and `dedupOnCreate` workflows, and the cross-module read tools — is wired up in the codebase today. Code locations are listed in §19.

---

## Contents

| Part | Subject |
|---|---|
| [A. Pain point](#part-a--pain-point) | Personas, current-tool gaps |
| [B. Use case](#part-b--use-case) | Target user story and required capabilities |
| [C. Design](#part-c--design) | Three-tier supervisor tree, registry, HITL boundary, memory, workflows, observability |
| [D. Implementation](#part-d--implementation) | Specialist registration, tool definitions, workflow shells, web surface, end-to-end run |
| [E. Production concerns](#part-e--production-concerns) | Failure modes, latency and cost budgets, extension criteria |

---

## Agent system at a glance

```mermaid
flowchart LR
    User[User in assistant-ui]
    Top[Top supervisor]
    DomW[Domain supervisor — work]
    DomP[Domain supervisor — people]
    DomS[Domain supervisor — self]
    DomM[Domain supervisor — meta]
    SpPlan[Specialist — planner]
    SpId[Specialist — identity]
    SpSelf[Specialist — self]
    SpMeta[Specialist — meta]
    WfABS[Workflow — assignBySkill]
    WfDOC[Workflow — dedupOnCreate]
    Tools[Module-owned tools]
    XRead[Cross-module read tools]
    HITL{Human approval}
    Mods[Feature modules]
    PG[(Postgres — agent + module schemas)]
    LLM[LLM provider]

    User --> Top
    Top --> DomW
    Top --> DomP
    Top --> DomS
    Top --> DomM
    DomW --> SpPlan
    DomW --> WfABS
    DomW --> WfDOC
    DomP --> SpId
    DomS --> SpSelf
    DomM --> SpMeta
    SpPlan --> Tools
    SpPlan --> XRead
    SpId --> XRead
    Tools --> HITL
    WfABS --> HITL
    WfDOC --> HITL
    HITL --> Mods
    Mods --> PG
    Top -. memory .- PG
    DomW -. memory .- PG
    SpPlan -. memory .- PG
    Top --> LLM
    DomW --> LLM
    SpPlan --> LLM
```

| Layer | Responsibility |
|---|---|
| User-facing chat | Message stream, tool-call cards, approval cards rendered by assistant-ui |
| Agent HTTP | A single route bridges the AI SDK v6 stream protocol to Mastra |
| Top supervisor | Routes the request to exactly one domain (`work` / `people` / `self` / `meta`) |
| Domain supervisor | Coordinates specialists and workflows registered in that domain |
| Specialist | Domain-scoped Mastra `Agent` composed from a tool record + a domain-specific system prompt |
| Tools | Thin adapters over module domain functions, owned by the source module |
| Cross-module read tools | Read-only contracts a module exposes for any specialist to call without a cross-module import |
| Workflows | Deterministic multi-step flows registered with the domain; emit lifecycle events into `agent.workflow_runs` |
| HITL gate | Pauses every write tool and every approving workflow step for explicit user decision |
| Modules | Perform the actual reads and mutations through their public surfaces |
| Memory | Threads, messages, and traces persisted to the `agent` Postgres schema, managed by Mastra |
| Audit | Workflow lifecycle, approvals, and domain events recorded across `core.events`, `agent.workflow_runs`, and `agent.workflow_approvals` |

The rest of this document explains *why* this shape — starting from a concrete user pain — and *how* it is built. Code locations for each layer are listed in §19.

---

# Part A — Pain point

## 1. Affected personas

| Persona | Recurring workload |
|---|---|
| **Product Manager** | Weekly status compilation, re-prioritisation, and ad-hoc capacity queries across multiple ICs. Frequent context switches between board views, chat, and email. |
| **Tech Lead / IC** | Task hygiene (closing stale items, updating status), interrupt-driven status reporting for stakeholders. |
| **Engineering Manager** | Assigning new work to individuals with matching skills and available capacity. Frequently defaults to familiarity heuristics, under-utilising newer team members. |

These workloads are information-retrieval and coordination problems mediated through chat, dashboards, and email. The latency and lossiness of these channels is the cost being optimised.

## 2. Gap analysis

| Existing tool | Limitation for the workloads above |
|---|---|
| Jira / Linear filter views | Surface items by attribute. Cannot answer intent-shaped queries such as "who is free next week with the skills required for a Stripe webhook integration". |
| Team chat | High latency, lossy, recipient must be online. |
| Spreadsheets | Snapshot in time; immediately stale. |
| General-purpose LLM chat (ChatGPT, Claude.ai) | No access to tenant data, no write authority, no audit. |
| LLM with retrieval over docs | Read-only. Cannot assign, update status, or notify. |

The gap is a per-tenant agent that can read the planner, search team members by skill, propose assignments, and apply them after a one-click human approval — with the resulting action audited and the assignee notified through the existing event channels.

---

# Part B — Use case

## 3. Target user story

```mermaid
journey
    title PM plans the week with the planner specialist
    section Open agent
      Open Seta and open the agent panel: 5: User
      Ask what is on my plate this week: 5: User
      Agent returns 7 open tasks grouped by status: 5: Agent
    section Triage
      Ask which tasks are blocked: 5: User
      Agent returns blocked items with blocker text: 5: Agent
      Ask who can take TASK-101 requiring Stripe webhooks: 5: User
      Agent runs planner_suggestAssignee and shows top-5 candidates: 5: Agent
      User picks an assignee and approves: 5: User
      Agent assigns, notifies assignee, records audit: 5: Agent
    section Close
      Close agent panel: 5: User
```

The target end-to-end duration is approximately five minutes for the full interaction, compared with the 60–90 minutes typically required when the same workflow is performed manually across chat, board views, and email.

## 4. Required capabilities

| Capability | Source module | Side effect | Permission slug |
|---|---|---|---|
| List my tasks | `planner` | read | `planner.task.read` |
| Fetch task detail (blockers, dependencies) | `planner` | read | `planner.task.read` |
| Semantic search across tasks | `planner` (embedding index) | read | `planner.task.read` |
| Suggest assignee by skill + history + load + tz (HITL card) | `planner` (calls cross-module reads from `identity`) | proposes write | `planner.task.assign` |
| Apply chosen assignment | `planner` | write to `planner.tasks.assignee_id` | `planner.task.assign` |
| Notify assignee | `notifications` (event-driven projection) | write (via subscriber) | governed by event |
| Audit every action | `core.events` + `agent.workflow_runs` | write (via outbox + lifecycle hook) | automatic |

---

# Part C — Design

## 5. Architectural alternatives

| Design | Tool catalogue per agent | Prompt cache behaviour | Routing quality | Selected |
|---|---|---|---|---|
| Single agent with the full tool catalogue | Grows past 50 entries as modules are added | Tool schemas in system prompt invalidate the cache on every catalogue change | Degrades as catalogue grows | No |
| One agent per tool (router-only composition) | One tool per agent | Minimal prompt, optimal cache | No surface for domain reasoning | No |
| Two-tier supervisor → specialists | ~15 tools per specialist | Specialist prompt caches | Supervisor selects specialist directly | Was the previous design |
| **Three-tier top → domain supervisor → specialist** | Specialist prompts stay small; domain supervisor adds workflow-vs-specialist routing | Both supervisor prompts cache; specialist tool record is the only thing that changes with module updates | Top router picks one of four fixed domains (high precision); domain supervisor picks a specialist or workflow within scope | **Yes** |

The third tier exists for two reasons:

1. **Workflows live next to specialists.** A domain often has both an interactive specialist (planner) and one or more deterministic multi-step workflows (`assignBySkill`, `dedupOnCreate`) — the domain supervisor decides which is the right entry point for a given request.
2. **Bounded routing surface.** Each agent in the tree picks from a small, stable set: the top supervisor picks one of four domains, the domain supervisor picks among a handful of specialists and workflows. Adding a new module rarely changes any prompt at all — it adds a leaf.

## 6. Request flow

In chat, the specialist agent **reasons** over its primitive tool palette and
decides which signals to fetch for the request in front of it. The workflow
registry exists for the REST surface (`/workflows/runs/:id/start`) and the
workflow inbox; the chat agent never invokes a workflow directly — workflows
are not in any specialist's tool record.

```mermaid
sequenceDiagram
    participant User
    participant Top as Top supervisor
    participant Dom as Work supervisor
    participant Spec as Planner specialist
    participant Reads as Read tools (search_users_by_skills,<br/>planner_findSimilarTasks, identity_getTimezone, …)
    participant Propose as planner_proposeAssignment (HITL)

    User->>Top: Who can take TASK-101
    Top->>Dom: delegate (work)
    Dom->>Spec: delegate (planner)
    Spec->>Spec: reason about which signals matter
    Spec->>Reads: 2-4 read tool calls (skill / similar work / load / tz)
    Reads-->>Spec: signal data
    Spec->>Propose: planner_proposeAssignment(taskId, candidates[], summary)
    Note over Propose: ctx.agent.suspend(ApprovalCard)
    Propose-->>User: candidate list + per-candidate rationale
    User->>Propose: Pick Devon (resumeData)
    Propose->>Propose: INV-1 guard then assignTask
    Propose-->>User: confirmation
```

## 7. Specialist composition

A specialist is a Mastra `Agent` built dynamically at boot from a `SpecialistSpec` (`@seta/agent-sdk`). Modules register their specialists at module load time via `AgentRegistry.registerSpecialist(...)`; the registry is frozen once before the supervisor tree is built.

| Ingredient | Source | Scope |
|---|---|---|
| Domain | `SpecialistSpec.domain` — one of `'work' \| 'people' \| 'self' \| 'meta'` | Per specialist |
| System prompt | `SpecialistSpec.instructions(ctx)` — invoked at agent build time | Per specialist |
| Tool record | `SpecialistSpec.tools: Record<string, AgentTool>` | Per specialist |
| Workflows | `SpecialistSpec.workflows?` (rarely set on the specialist; usually registered at the domain level) | Per specialist |
| Memory store | `@mastra/pg` `PostgresStore({ schemaName: 'agent' })`, wrapped in `Memory` with sliding window, semantic recall, and working memory | Shared store, per-user resource scope |
| Model | `resolveModel('auto', { tierHint: 'fast' })` at the specialist layer (`balanced` at the supervisor layers) | Per agent |

The four domains are fixed because the top router prompt is parameterised over them. Adding a new domain is a deliberate change — adding a new specialist or workflow in an existing domain is not.

## 8. Tool catalogue and RBAC binding

The planner specialist composes tools owned by `planner` and `identity`. Tool IDs are unique per specialist record; cross-module reads use a separate, more constrained contract.

| Tool ID | Owning module | Side effect | Permission | Author shape |
|---|---|---|---|---|
| `planner_getTask` | `planner` | read | `planner.task.read` | agent tool |
| `planner_createTask` | `planner` | write (dedup-aware) | `planner.task.create` | agent tool (HITL via suspend) |
| `planner_suggestAssignee` | `planner` | proposes write | `planner.task.assign` | agent tool (HITL via suspend) |
| `planner_assignTask` | `planner` | write | `planner.task.assign` | agent tool (`needsApproval`) |
| `search_tasks_semantic` | `planner` | read | `planner.task.read` | agent tool |
| `search_users_by_skills` | `identity` | read | `identity.user.read` | agent tool |
| `planner_getOpenTaskCount` | `planner` | read | `planner.task.read` | cross-module read tool |
| `identity_getTimezone` | `identity` | read | `identity.user.read` | cross-module read tool |
| `identity_getAvailability` | `identity` | read | `identity.user.read` | cross-module read tool |

Each agent tool calls `registerToolPermission(tool, slug)` (done inside `defineAgentTool` when `rbac` is set). At the HTTP boundary the `agent.chat.use` permission gates access to the chat route; per-tool RBAC slugs are enforced inside each tool's `execute` against the resolved session, and per-workflow permissions are enforced inside domain functions for the workflow management endpoints. There is no separate runtime filter that hides tools from the model — the model sees the full specialist tool record, and unauthorised executions are rejected at the domain boundary.

## 9. Human-in-the-loop boundary

HITL has two shapes today, both audited:

**Agent-tool approvals (`@mastra/core` tool suspension).** A write tool either sets `needsApproval: true` (simple accept/reject card derived from the input schema) or calls `ctx.agent.suspend(payload)` inside `execute` to surface a domain-specific card validated against `suspendSchema`. The client posts the user's decision to `POST /api/agent/v1/chat/approve`; the route calls Mastra's `approveToolCall` / `declineToolCall` / `resumeStream(resumeData)` on the top supervisor and streams the continuation back. `resumeData` is validated against the tool's `resumeSchema`.

```mermaid
stateDiagram-v2
    [*] --> Proposed: agent calls write tool
    Proposed --> AwaitingApproval: needsApproval = true OR ctx.agent.suspend(card)
    AwaitingApproval --> Executed: user approves (or sends resumeData)
    AwaitingApproval --> Rejected: user rejects
    Executed --> [*]: result streamed back to agent
    Rejected --> [*]: rejection streamed back to agent
```

**Workflow-step approvals.** A workflow declares `hitlSteps: string[]` on its `WorkflowSpec`. The lifecycle hook writes a row into `agent.workflow_approvals` when one of those steps suspends; users decide via `POST /api/agent/v1/workflows/approvals/:approvalId/decide` (decision `approve | reject | modify`, with optional `overrideUserId` and `note`).

| Property | Behaviour |
|---|---|
| Read tools | Execute directly without approval |
| Write tools | Always require approval — either `needsApproval` or a typed `suspend()` card |
| Approval surface | Card schema is either the tool input schema (`needsApproval`) or the `suspendSchema` payload |
| Rejection | Streamed back as a tool error (agent path) or persisted to `agent.workflow_approvals` (workflow path); the agent may re-plan |
| Replay & rerun | Workflows support `rerun` (new run, same input or override) and `replayFromStep` (continue from a specific step) |
| Audit | Tool calls and workflow lifecycle events both land in `core.events`; workflow runs are also materialised in `agent.workflow_runs` with idempotency in `agent.workflow_run_events_seen` |

The approval boundary is a trust contract, not a UX option: agent-driven mutations always present the proposed action to the user before commit.

## 10. Memory model

```mermaid
flowchart TB
    subgraph Working[Working memory — per turn]
      W[LLM context window — recent turns and tool results]
    end
    subgraph Session[Session memory — per thread]
      S[mastra_messages and mastra_threads in agent schema]
    end
    subgraph LongTerm[Long-term memory — cross-thread]
      L1[core.events — audit + domain events]
      L2[agent.workflow_runs — workflow lifecycle]
    end
    W --> S
    S --> L1
    S --> L2
```

| Layer | Lifetime | Storage | Contents |
|---|---|---|---|
| Working | One turn | LLM context window | Recent messages, current tool results |
| Session | Per thread | `agent.mastra_messages`, `agent.mastra_threads` (Mastra-managed) | Full conversation history including tool calls and suspended approvals |
| Long-term | Subject to event retention | `core.events`, `agent.workflow_runs`, `agent.workflow_approvals` | Tool execution audits, emitted domain events, workflow lifecycle, approval decisions |

The `mastra_*` tables are owned by Mastra; their DDL is not edited by hand. They reside in the `agent` schema so that backup and migration operations cover them with the rest of the platform. The thread/message API used by the UI is exposed through `GET /api/agent/v1/threads`, `GET /api/agent/v1/threads/:id`, `PATCH /api/agent/v1/threads/:id`, and `DELETE /api/agent/v1/threads/:id`; the route maps Mastra's stored `tool-invocation` parts to AI SDK v6's `tool-<name>` parts at read time.

`Memory` uses a sliding window of `AGENT_MEMORY_LAST_MESSAGES` (default 20) recent messages per turn. Semantic recall (`scope: 'resource'`, `topK: 5`) embeds each incoming message and retrieves the most relevant past messages across all of the user's threads via a `PgVector` HNSW index in the `agent` schema. Working memory (`scope: 'resource'`) maintains a per-user Markdown profile (timezone, communication style, current focus) in `agent.mastra_resources`, injected into every turn. Thread titles are generated automatically (`generateTitle: true`).

---

# Part D — Implementation

## 11. Planner specialist registration

The planner specialist's `instructions` is a **playbook** that names the
signals available and tells the LLM when each is material. It does not
script a fixed pipeline. The cross-module reads (open task count, timezone,
availability) are promoted to specialist tools via `defineCrossModuleReadAsTool`
so the LLM can call them directly while session is still derived from
`requestContext`.

```ts
// packages/planner/src/backend/agent-tools/register.ts (shape)
AgentRegistry.registerSpecialist({
  domain: 'work',
  id: 'planner',
  description:
    'Plans, tasks, buckets, assignments. Reads across identity for skill, ' +
    'timezone, and availability when assignment decisions need those signals.',
  instructions: () => `… reasoning playbook (see register.ts) …`,
  tools: {
    // Read tools (the agent picks which to call per-request)
    planner_getTask,
    planner_findSimilarTasks,
    search_users_by_skills,
    planner_getOpenTaskCountForUser,    // promoted via defineCrossModuleReadAsTool
    identity_getTimezoneForUser,        // promoted via defineCrossModuleReadAsTool
    identity_getAvailabilityForUser,    // promoted via defineCrossModuleReadAsTool
    // Write tools (HITL)
    planner_createTask,                 // thin confirm-and-create
    planner_assignTask,                 // one-click confirm
    planner_proposeAssignment,          // 2-5 candidates with rationale
  },
});

// Workflows live in the registry for the REST + audit surface only — they
// are NOT in any specialist's tool record.
AgentRegistry.registerWorkflow(dedupOnCreateWorkflowSpec);
AgentRegistry.registerWorkflow(assignBySkillWorkflowSpec);

// Original spec stays registered for non-LLM callers (workflows, REST).
AgentRegistry.registerCrossModuleReadTool(plannerGetOpenTaskCountSpec);
```

No `session` field appears in any LLM-visible input schema. Tools and workflow
steps derive session from `requestContext` via `actorFromContext` /
`sessionFromRequestContext`. Registering a workflow whose `inputSchema` has a
top-level `session` field throws at boot (`assertNoSessionField`).

`identity` mirrors this shape: it registers the `identity` specialist (people domain), the `self` specialist (self domain), and three cross-module read tools (`identity_searchUsersBySkillVector`, `identity_getTimezoneForUser`, `identity_getAvailabilityForUser`).

### Registry boot order

```mermaid
flowchart LR
    A[buildMastra] --> B[Module register.ts imports]
    B --> C[AgentRegistry.register* side effects]
    C --> D[initAgentRegistry → freeze]
    D --> E[buildSupervisorTree → snapshot]
    E --> F[Per-domain Agent + top Agent]
```

Side-effect imports in `packages/agent/src/backend/init-registry.ts` pull each module's `agent-tools/register.ts` so that every `AgentRegistry.register*` call happens before `freeze()`. After freeze, `snapshot()` is authoritative and `buildSupervisorTree` walks it to build the three-tier `Agent` graph.

| Failure condition | Boot outcome |
|---|---|
| Module forgets to call `register.ts` | Specialist absent from snapshot; domain supervisor (and the top router) treats the domain as empty |
| Specialist missing `description` | `registerSpecialist` throws at module load |
| Workflow spec missing fields | `registerWorkflow` throws at module load |
| Cross-module read tool missing `rbac` | `registerCrossModuleReadTool` throws at module load |
| Registration after `freeze()` | `RegistryFrozenError` |
| Snapshot before `freeze()` | `RegistryNotFrozenError` |

## 12. Planner tool definitions

Tool definitions reside in `packages/planner/src/backend/agent-tools/`. Each tool is a thin adapter over a `domain/*.ts` function — the agent execution path and any HTTP execution path call the same business logic.

| Tool ID | File | Wraps | RBAC | HITL shape |
|---|---|---|---|---|
| `planner_getTask` | `get-task.ts` | `getTask` | `planner.task.read` | none |
| `planner_findSimilarTasks` | `find-similar-tasks.ts` | `findSimilarTasks` (vector + assignee enrich + scope filter) | `planner.task.read` | none |
| `search_users_by_skills` | `search-users-by-skills.ts` | `searchUsersBySkills` (identity) | `identity.user.read` | none |
| `planner_getOpenTaskCountForUser` | `get-open-task-count.ts` | spec promoted via `defineCrossModuleReadAsTool` | `planner.task.read.tenant` | none |
| `identity_getTimezoneForUser` | `@seta/identity/agent-tools` | spec promoted via `defineCrossModuleReadAsTool` | `identity.user.read` | none |
| `identity_getAvailabilityForUser` | `@seta/identity/agent-tools` | spec promoted via `defineCrossModuleReadAsTool` | `identity.user.read` | none |
| `planner_createTask` | `create-task.ts` | thin confirm-and-create over `createTask` domain | `planner.task.create` | `ctx.agent.suspend(confirm card)` |
| `planner_assignTask` | `assign-task.ts` | `assignTask` | `planner.task.assign` | `needsApproval: true` |
| `planner_proposeAssignment` | `propose-assignment.ts` | agent-reasoned candidate list + INV-1 guard + `assignTask` | `planner.task.assign` | `ctx.agent.suspend(candidate list card)` → `assignTask` on resume |

`defineAgentTool` is the authoring helper — it wraps `@mastra/core/tools.createTool`, registers the RBAC slug, attaches `needsApproval` when set, and surfaces a friendly `displayName` for the UI:

```ts
// packages/planner/src/backend/agent-tools/assign-task.ts (excerpt)
export const plannerAssignTaskTool = defineAgentTool({
  id: 'planner_assignTask',
  name: 'Assign Task',
  description: 'Assign a user to a task.',
  input: z.object({
    taskId: z.string().uuid().describe('The task ID'),
    assigneeUserId: z.string().uuid().describe('The user ID to assign'),
  }),
  output: z.object({ assignment: z.object({ taskId: z.string(), assigneeUserId: z.string() }) }),
  rbac: 'planner.task.assign',
  needsApproval: true,
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));
    await assignTask({ task_id: input.taskId, user_id: input.assigneeUserId, session });
    return { assignment: { taskId: input.taskId, assigneeUserId: input.assigneeUserId } };
  },
});
```

The `planner_suggestAssignee` tool uses the richer `suspendSchema` / `resumeSchema` shape: it computes the Top-5 candidates, calls `ctx.agent.suspend(card)` with an `ApprovalCard` payload, and on resume reads `ctx.agent.resumeData` to either apply the chosen assignment, defer, or surface an alternative ("Related to #N", "Sub-task of #N") from the dedup workflow.

## 13. Supervisor tree wiring

```ts
// packages/agent/src/backend/supervisor-tree.ts (shape only)
export function buildSupervisorTree(opts: { mastra?: Mastra } = {}): Agent {
  const snapshot = AgentRegistry.snapshot();
  const memory = buildMemory(opts.mastra);                  // shared Memory({ storage })
  const domainAgents: Record<string, Agent> = {};
  for (const d of snapshot.domains) {
    domainAgents[d] = buildDomainSupervisor(d, memory);     // tier 2
  }
  return new Agent({                                         // tier 1 (top)
    id: 'top-supervisor',
    name: 'Supervisor',
    instructions: generateTopRoutingPrompt(snapshot),
    model: resolveModel('auto', { tierHint: 'balanced' }).model,
    agents: domainAgents,
    memory,
  });
}
```

Each domain supervisor is itself an `Agent` whose `agents` field is the specialists in that domain and whose `workflows` field is the workflows registered in that domain. The prompt for each tier is generated from the registry snapshot (`generateTopRoutingPrompt` / `generateDomainPrompt`), so adding a specialist or workflow updates the prompt automatically.

| Boot-time validation | Effect |
|---|---|
| `snapshot()` called without `freeze()` | `RegistryNotFrozenError` (fail fast at boot) |
| Specialist `instructions(ctx)` throws | Bubbles up on agent construction |
| Workflow `inputSchema` invalid | `registerWorkflowInputSchema` rejects on register |
| Mastra storage unreachable | `PostgresStore` surfaces the error from `/api/agent/v1/health` |

## 14. Workflows alongside specialists

Workflows live in the registry for the REST surface and audit, not the chat
path. The chat agent does not see them — workflows are absent from every
specialist's tool record. Each module's `register.ts` calls
`AgentRegistry.registerWorkflow(spec)` once per workflow.

```ts
// packages/planner/src/backend/workflows/assign-by-skill/spec.ts
export const assignBySkillWorkflowSpec: WorkflowSpec = {
  domain: 'work',
  id: 'assignBySkill',
  description: 'Suggest an assignee by skill overlap + vector match + history + load + tz; HITL required.',
  inputSchema: AssignBySkillInputSchema,
  outputSchema: AssignBySkillOutputSchema,
  workflow: assignBySkillWorkflow,         // Mastra workflow built with createWorkflow / createStep
  hitlSteps: ['assignBySkill.run'],
};
```

At boot, the platform wires Mastra's pubsub channels `workflows` and `workflows-finish` to a single lifecycle hook (`workflows/_infra/lifecycle-hook.ts`) that:

- Inserts/updates a row in `agent.workflow_runs` for the run (status, step, started/finished).
- Records a row in `agent.workflow_run_events_seen` keyed on `(runId, eventId)` for idempotency.
- Creates a row in `agent.workflow_approvals` when a `hitlSteps` step suspends.

The chat path uses the agent-tool HITL contract (suspend + `chat/approve`). Programmatic workflow runs use the workflow HITL endpoints (`/workflows/approvals/:id/decide`, `/workflows/runs/:id/rerun`, `/workflows/runs/:id/replay-from-step`, `/workflows/runs/:id/cancel`). Both produce identical audit trails because the lifecycle hook is on the Mastra publish path, not the API path.

The deterministic `assignBySkill` ranking is still reachable from the workflow
inbox (the "Suggest" button on a task card kicks off a workflow run via REST).
The chat path reaches the same outcome through specialist reasoning + the
`planner_proposeAssignment` HITL tool. The two surfaces share the
`AssignBySkillOutputSchema` discriminated union (`assigned` / `superseded` /
`left-unassigned` / `declined`).

## 15. Cross-module read tools

A module that wants to expose a read for any specialist to call — without forcing every caller into a cross-module import — registers a `CrossModuleReadToolSpec`:

```ts
// packages/planner/src/backend/agent-tools/get-open-task-count.ts (shape)
export const plannerGetOpenTaskCountSpec: CrossModuleReadToolSpec = {
  id: 'planner_getOpenTaskCount',
  description: 'Count of open planner tasks assigned to a given user.',
  inputSchema: z.object({ userId: z.string().uuid() }),
  outputSchema: z.object({ count: z.number().int().nonneg() }),
  rbac: 'planner.task.read',
  availableTo: 'all-specialists',
  execute: async ({ session, input }) => { /* … */ },
};
```

These tools differ from specialist tools in three ways: (1) they are owned by their source module but consumable from any specialist's domain, (2) they take a typed `{ session, input }` instead of Mastra's ToolExecutionContext, and (3) they cannot mutate. The `assignBySkill` workflow uses them to combine `identity` data (timezone, availability) with `planner` data (open task count) without dragging the `planner` package into `identity`, or vice versa.

## 16. Web surface and HTTP routes

The chat panel is anchored to the right edge of the application shell. The approval card is rendered inline within the conversation: for `needsApproval`-style cards it is derived from the input schema; for `suspend()`-style cards the payload is rendered through the `ApprovalCard` UI contract (`sdks/agent/src/hitl/card.ts`), which supports candidate rows, detail blocks, and a chosen-action payload that is fed back as `resumeData`.

```
┌────────────────────────────────────────────────────────────┐
│ Agent                                  [Auto ▾]     [×]  │
├────────────────────────────────────────────────────────────┤
│ User:    who can pick up TASK-101 - Stripe webhooks?       │
│ Planner: top-5 candidates by skill + load + tz             │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Suggested assignees for TASK-101                       │ │
│ │ ● Devon  — skills:0.92  load:3  tz:CET  ✓ recommended  │ │
│ │ ○ Aki    — skills:0.81  load:1  tz:JST                 │ │
│ │ ○ Sam    — skills:0.78  load:5  tz:EST                 │ │
│ │ ○ …                                                    │ │
│ │                 [ Decline ]   [ Assign Devon ⏎ ]       │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ [ Compose message...                                   ↵ ] │
└────────────────────────────────────────────────────────────┘
```

| UI element | Source library |
|---|---|
| Panel shell | `@assistant-ui/react` |
| Message stream | `@ai-sdk/react` `useChat` with `@assistant-ui/react-ai-sdk` adapter |
| Tool-call card | `@assistant-ui/react` `<ToolCallContentPart>` |
| Approval card | assistant-ui Interactable, parameterised by either the input schema or the typed suspend payload |
| Markdown rendering | `@assistant-ui/react-markdown` |
| Model selector | Reads `GET /api/agent/v1/models`; `auto` is the synthetic default that lets the server pick a tier |

The route surface (all under `/api/agent/v1`):

| Method | Path | Purpose |
|---|---|---|
| POST | `chat` | Stream a turn through the top supervisor (UI message stream → AI SDK v6 via `@mastra/ai-sdk.toAISdkStream`) |
| POST | `chat/approve` | Approve / decline a suspended tool call; optional `resumeData` passthrough for typed cards |
| GET | `threads` | List the user's threads |
| GET / PATCH / DELETE | `threads/:id` | Read, rename, or delete a thread (translates Mastra `tool-invocation` parts to `tool-<name>` parts) |
| GET | `tools` | Deduped catalogue of every specialist's tools |
| GET | `models` | Available models with tier + reasoning support; synthetic `auto` entry first |
| GET | `health` | Model configured + storage reachable |
| GET | `workflows/runs` | Paginated workflow runs filtered by `scope=self\|group\|tenant\|instance` |
| GET | `workflows/runs/:runId` / `/snapshot` | Run row and Mastra snapshot |
| GET | `workflows/my-pending-approvals` | Pending approvals for the current user |
| POST | `workflows/approvals/:id/decide` | Decide `approve\|reject\|modify` with optional `overrideUserId` + `note` |
| POST | `workflows/runs/:id/rerun` / `/replay-from-step` / `/cancel` | Run-management actions |
| GET | `workflows/:id/input-schema` | Cached input schema for a workflow form |
| GET | `workflows/sse-token` | Issue a short-lived token for SSE auth |
| SSE | `workflows/runs/:id/events`, `workflows/inbox` | Live run events and per-user inbox (mounted by `mountRunSse` / `mountInboxSse`) |

The chat route also performs two boundary transformations: (1) page-context injection — a `data-page-context` UI message part is folded into a `[Context: kind#id — "label"]` prefix on the most recent user text, so the agent gets the right anchor without the model having to interpret the part directly; and (2) rate limiting — `reserveTurn` debits a per-tenant/user budget (`agent.rate_limits` table) before invoking the model, returning HTTP 429 with `Retry-After` if the budget is exhausted.

## 17. End-to-end execution

The full path from user approval to assignee notification:

```mermaid
sequenceDiagram
    participant UI as assistant-ui
    participant API as POST /api/agent/v1/chat/approve
    participant Top as Top supervisor
    participant Dom as Work supervisor
    participant Pln as Planner specialist
    participant Tool as planner_suggestAssignee
    participant Dom2 as planner.assignTask (domain)
    participant DB as Postgres
    participant Disp as Dispatcher
    participant Sub as notifications subscriber
    participant Devon as Assignee SSE

    UI->>API: approve { runId, toolCallId, resumeData: chosenUserId }
    API->>Top: resumeStream(resumeData, opts)
    Top->>Dom: delegate
    Dom->>Pln: delegate
    Pln->>Tool: resume — ctx.agent.resumeData = { userId }
    Tool->>Dom2: assignTask(taskId, userId)
    Dom2->>DB: BEGIN UPDATE planner.tasks INSERT core.events COMMIT
    DB-->>Disp: pg_notify events
    Disp->>Sub: planner.task.assigned
    Sub->>DB: INSERT notifications.notice
    Sub->>Devon: SSE new notification
    Dom2-->>Tool: assignment result
    Tool-->>Pln: stream tool result
    Pln-->>UI: TASK-101 assigned to Devon
```

The p95 latency budget for this flow is approximately 1.2 s from approval click to the confirmation message, with an additional ~150 ms for the SSE notification to reach the assignee.

---

# Part E — Production concerns

## 18. Failure modes

| Failure | Detection | Recovery |
|---|---|---|
| LLM provider unavailable | Provider error returned to the tool layer; AI SDK v6 retries on transient errors | Model registry falls back via `resolveModel('auto', …)` to another model in the same tier |
| Tool implementation raises an unexpected exception | Mastra captures the exception and streams a tool error to the agent | Agent receives the error in context and re-plans or surfaces it to the user |
| User rejects approval | AI SDK v6 streams the rejection as a tool result; workflow path writes to `agent.workflow_approvals` | Agent receives the rejection and suggests alternatives |
| Dispatcher lag increases | `/health/ready` reports backlog | Scale `apps/worker`; investigate slow subscribers |
| Long-running tool blocks the specialist | Mastra timeout | Tool returns timeout; agent re-plans |
| Workflow run stuck in suspended state | `agent.workflow_approvals` row aging | `POST /workflows/runs/:id/cancel` or `replay-from-step` once unblocked |
| Workflow lifecycle event missed | Lifecycle hook is idempotent on `(runId, eventId)` in `agent.workflow_run_events_seen` | Duplicate emit safely no-ops; missed events recovered on next pubsub message or by re-snapshotting |
| Rate-limit budget exhausted | `reserveTurn` throws `RateLimitError`; route returns HTTP 429 with `Retry-After` | UI surfaces the wait |
| Mastra memory store unreachable at boot | `PostgresStore.ping`/`init` fails in `/api/agent/v1/health` | Cluster does not accept traffic — fail fast |
| Embedding job backlog | `embed_<entity>` job count in observability | Scale workers; throttle source; defer backfill |

## 19. Latency and cost budget

Per-turn p95 budget for a single planner turn that exercises both supervisors and the planner specialist:

| Stage | Latency | Token cost (balanced tier) | Notes |
|---|---|---|---|
| Top route | 120 ms | ~120 in, ~20 out | Balanced tier, four-domain choice |
| Domain route | 150 ms | ~200 in, ~30 out | Balanced tier, picks specialist vs workflow |
| Specialist plan | 450 ms | ~700 in, ~180 out | Fast tier; tool record in prompt |
| `search_tasks_semantic` | 250 ms | — | Stage 1 RRF + Stage 2 Cohere rerank |
| `search_users_by_skills` (or cross-module reads in workflow path) | 80 ms | — | Indexed query |
| `planner_assignTask` (post-approval) | 50 ms | — | Single transaction |
| Summary stream back to UI | 200 ms | ~300 in, ~120 out | Fast tier |
| **Total per turn** | **~1.3 s** | **~1.7 k tokens** | |

| Cost lever | Effect |
|---|---|
| Use `resolveModel('auto', …)` for specialists at `fast` tier | Default today; cheapest while retaining tool-use quality |
| Promote a specialist to `balanced` or `reasoning` for harder reasoning | Linear cost increase, modest latency increase |
| Disable rerank (`stage2: 'none'`) | ~150 ms saved; recall@10 drops 8–12 % |
| Cap thread context to last N messages | Linear reduction in token cost |
| Provider prompt caching (AI SDK v6) | First turn unaffected; subsequent turns benefit from cache hits, especially on the supervisor prompts |

## 20. Extension criteria — when to add a specialist or a workflow

```mermaid
flowchart TD
    A[New use case] --> B{Single-domain?}
    B -->|yes, fits an existing specialist| C[Add a tool to that specialist]
    B -->|yes, new responsibility| D[Add a new specialist in that domain]
    B -->|no — multi-domain or deterministic multi-step| E[Add a workflow in the most central domain]
    E --> F{Workflow exposes user choices?}
    F -->|yes| G[Declare hitlSteps + a suspend card]
    F -->|no| H[Pure deterministic workflow]
    C --> I{Specialist tool count > ~15}
    I -->|yes| J[Split the specialist OR promote some tools to cross-module reads]
    I -->|no| K[Done]
    D --> K
    G --> K
    H --> K
```

| Precondition before merging a new specialist or workflow |
|---|
| All capabilities have a public function in the owning module |
| Each capability has a tool wrapper in that module's `agent-tools/` (specialist tools) or a `CrossModuleReadToolSpec` (cross-module reads) |
| Write tools set `needsApproval: true` *or* call `ctx.agent.suspend(...)` with a typed `suspendSchema` |
| Workflows declare every approving step in `hitlSteps[]` |
| RBAC slugs are registered in `<module>/src/rbac.ts` and threaded through `defineAgentTool({ rbac })` |
| Specialist tool record contains no more than ~15 entries; otherwise split or move reads to cross-module |
| Specialist `description` reads as a job title, not a feature list |
| At least one integration test exercises the top → domain → specialist → tool → database path (or the workflow lifecycle path) |
| Latency and cost budget recorded in §19 |

## 21. Code locations

| Concept | File |
|---|---|
| Tool / spec contracts and registry (no runtime dependency on `@mastra/*`) | `sdks/agent/src/registry.ts`, `sdks/agent/src/tool.ts` |
| `defineAgentTool` helper | `sdks/agent/src/define-agent-tool.ts` |
| RBAC binding | `sdks/agent/src/rbac.ts` |
| HITL card schema (`ApprovalCard`, `CandidateRow`) | `sdks/agent/src/hitl/card.ts` |
| Request context + session types | `sdks/agent/src/request-context.ts`, `sdks/agent/src/session.ts` |
| Mastra runtime + lifecycle hook wiring | `packages/agent/src/backend/runtime.ts` |
| Three-tier supervisor build | `packages/agent/src/backend/supervisor-tree.ts` |
| Supervisor + domain prompts (generated from the registry snapshot) | `packages/agent/src/backend/prompt-templates.ts` |
| Module side-effect imports + `freeze()` | `packages/agent/src/backend/init-registry.ts` |
| Agent top-level registration (Mastra build, agents, workflows, routes) | `packages/agent/src/register.ts` |
| Model registry (`fast \| balanced \| reasoning`) | `packages/agent/src/backend/model-registry.ts` |
| Rate limit (`agent.rate_limits`) | `packages/agent/src/backend/rate-limit.ts` |
| Chat + workflow HTTP routes | `packages/agent/src/backend/routes.ts` |
| Workflow lifecycle hook | `packages/agent/src/backend/workflows/_infra/lifecycle-hook.ts` |
| Workflow input-schema registry | `packages/agent/src/backend/workflows/_infra/input-schema-registry.ts` |
| SSE — run + inbox | `packages/agent/src/backend/workflows/_infra/sse-run.ts`, `sse-inbox.ts` |
| Meta specialist registration | `packages/agent/src/backend/agent-tools/register-meta.ts` |
| Planner module registration (specialist + workflows + cross-module reads) | `packages/planner/src/backend/agent-tools/register.ts` |
| Planner agent tools | `packages/planner/src/backend/agent-tools/` |
| Planner workflows (`assignBySkill`, `dedupOnCreate`) | `packages/planner/src/backend/workflows/` |
| Identity module registration | `packages/identity/src/backend/agent-tools/register.ts` |
| Mastra source (API reference) | `/Users/canh/Projects/Seta/mastra/` (sibling checkout) |
| Mastra playground (UX reference for chat and uploads) | `/Users/canh/Projects/Seta/mastra/packages/playground-ui/` |

---

## Related documents

- [`architecture.md`](./architecture.md) — surrounding platform shape.
- [`tech-stack.md`](./tech-stack.md) — rationale for Mastra, AI SDK v6, assistant-ui.
- [`creating-modules.md`](./creating-modules.md) — adding a module and its agent tools.
