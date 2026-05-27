# Seta Agent Platform 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node 24 LTS](https://img.shields.io/badge/Node-24_LTS-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)

**The open-source foundation for building production-grade autonomous agents — purpose-built for teams who want to ship a working AI system, not wrestle with infrastructure.**

Seta Agent Platform is a multi-tenant, modular monolith that ships with everything a Hackathon team needs out of the box: a streaming chat UI, a three-tier agent supervisor powered by [Mastra](https://mastra.ai), RBAC-gated tool execution, human-in-the-loop approval flows, a transactional event bus, and vector search via pgvector — all in a single Postgres database. You bring your domain; the platform brings the runtime.

> **Hackathon quick-start:** Clone → `pnpm install` → `pnpm db:up` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`. See [§5 — Getting Started](#5-getting-started--contributing) for the full walkthrough.

---

## Table of Contents

1. [System Architecture (The Foundation)](#1-system-architecture-the-foundation)
2. [Pre-built Base: Why Build on Top of This?](#2-pre-built-base-why-build-on-top-of-this)
3. [How to Build Your Custom Agent](#3-how-to-build-your-custom-agent-extensibility-guide)
4. [Agent Execution Flow (Under the Hood)](#4-agent-execution-flow-under-the-hood)
5. [Getting Started & Contributing](#5-getting-started--contributing)

---

## 1. System Architecture (The Foundation)

### Overview

The platform is a **modular monolith**: a single Postgres database, a single Docker image, and two Node.js runtimes (`apps/server` and `apps/worker`) that share all domain modules in-process. Module isolation is enforced by Postgres schemas and TypeScript static analysis — not by network boundaries. This keeps cross-module calls typesafe, eliminates network latency between services, and means one backup/failover covers the entire system.

```mermaid
graph TB
    subgraph Web["Web Portal — apps/web"]
        Chat["Chat UI\nassistant-ui + AI SDK v6"]
        Board["Planner Board\nReal-time SSE"]
        Approval["HITL Approval Cards\nInline confirmation UI"]
    end

    subgraph Core["Core Services — same Docker image"]
        Server["apps/server\nHono HTTP · Mastra agent engine"]
        Worker["apps/worker\ngraphile-worker job pool"]
    end

    subgraph Data["Data Layer — one Postgres database"]
        Schemas["Module Schemas\nplanner · identity · knowledge · …"]
        Outbox["core.events\nTransactional outbox + audit"]
        Vector["pgvector tables\nPer-tenant · per-module embeddings"]
        Memory["agent schema\nThreads · memory · workflow traces"]
    end

    LLM["LLM Providers\nOpenAI · Anthropic · Cohere"]
    M365["Microsoft 365"]

    Web -->|HTTPS| Core
    Core --> Data
    Data -.->|LISTEN/NOTIFY| Worker
    Server --> LLM
    Worker --> M365
```

### Data Layer & Multi-Schema Architecture

Every feature module owns **one Postgres schema** (`planner`, `identity`, `knowledge`, `agent`, …). Cross-schema foreign keys are **prohibited** — module boundaries are crossed only through the event outbox or typed public-surface function calls. Vector embeddings (`pgvector`) live as per-tenant tables within each module's schema — no separate vector database needed.

```mermaid
flowchart LR
    subgraph Planner["packages/planner"]
      PlnDomain["domain code"]
      PlnSchema[("planner schema")]
    end
    subgraph Identity["packages/identity"]
      IdPub["public surface\n(index.ts)"]
      IdSchema[("identity schema")]
    end
    subgraph Notifications["packages/notifications"]
      NotSub["subscriber\n(idempotent)"]
      NotSchema[("notifications schema")]
    end
    Bus[("core.events\noutbox")]

    PlnDomain -->|"owns"| PlnSchema
    PlnDomain -->|"sync call + session\n(RBAC re-checked)"| IdPub
    IdPub --> IdSchema
    PlnDomain -->|"emit in same tx"| Bus
    Bus -.->|"LISTEN/NOTIFY"| NotSub
    NotSub --> NotSchema
```

### Services & Communication

```mermaid
flowchart LR
    Browser["Browser — React SPA"]

    subgraph Runtime["Same image · two processes"]
      Server["apps/server\nHono HTTP + Mastra agent engine"]
      Worker["apps/worker\ngraphile-worker job pool"]
    end

    subgraph Modules["Feature modules — in-process"]
      Planner["planner"]
      Identity["identity"]
      Knowledge["knowledge"]
      Notifications["notifications"]
      Staffing["staffing"]
    end

    subgraph PG["Postgres — one database, many schemas"]
      ModSchemas[("Module schemas\nplanner · identity · …")]
      Outbox[("core.events\noutbox + audit")]
      Vec[("pgvector tables\nper-module · per-tenant")]
      CopSchema[("agent schema\nthreads · memory · traces")]
    end

    LLM["LLM Providers\nOpenAI · Anthropic · Cohere"]
    M365["Microsoft 365"]

    Browser -->|"HTTPS"| Server
    Server --> Modules
    Modules --> ModSchemas
    Modules -->|"emit in same tx"| Outbox
    Outbox -.->|"LISTEN/NOTIFY"| Worker
    Worker --> Modules
    Worker --> Vec
    Worker --> M365
    Server --> CopSchema
    Server --> LLM
    Worker --> LLM
```

**Key communication patterns:**

| Pattern | How it works |
|---|---|
| **Synchronous module calls** | Typed function calls with a `SessionScope` — RBAC re-checked at the callee |
| **Async events (outbox)** | State change + event emission commit in one transaction — no lost or phantom events |
| **Worker dispatch** | `LISTEN/NOTIFY` wakes subscribers; 2 s poll fallback covers dropped notifies |
| **Agent → module** | Agent tools call module public-surface functions — writes always require HITL approval |

---

## 2. Pre-built Base: Why Build on Top of This?

### Overview

Rather than wiring up auth, a database, a chat UI, a job queue, and an LLM runtime from scratch, Seta gives your team a **working foundation** on day one. The platform handles tenancy, sessions, permissions, streaming chat, tool approvals, vector search, and event sourcing. Your team writes domain logic.

```mermaid
mindmap
  root((Seta Platform))
    Auth & Identity
      Multi-tenant sessions
      RBAC permission slugs
      SSO via Microsoft 365
    Agent Runtime
      Three-tier supervisor tree
      Mastra + AI SDK v6
      Persistent thread memory
      Multi-model resolver
    Chat UI
      Streaming assistant-ui panel
      HITL approval cards
      Tool-call visualization
      Model selector
    Data & Search
      Postgres multi-schema
      pgvector semantic search
      RAG pipeline + rerank
    Events & Jobs
      Transactional outbox
      graphile-worker job pool
      SSE real-time push
    Observability
      OpenTelemetry traces
      Structured pino logs
      Audit trail in core.events
```

### Web / Frontend Base

The frontend (`apps/web`) is a React 19 SPA built with TanStack Router, TanStack Query, shadcn/ui, and Tailwind 4. Out of the box it ships:

| Surface | What you get |
|---|---|
| **Chat panel** | Streaming `assistant-ui` panel; supports markdown, tool-call cards, and HITL approval cards |
| **Agent approval cards** | Inline approval UI derived automatically from tool input schemas |
| **Planner board** | Multi-tenant task/plan management with real-time SSE updates |
| **Module shell** | Navigation is declarative — each module exports a `navManifest` and the shell registers it automatically |
| **Model selector** | `auto` tier lets the server pick the optimal LLM; manual override available |

### Mastra Agent Core

The agent engine (`packages/agent/`) is built on [Mastra](https://mastra.ai) and composes a **three-tier supervisor tree** at boot:

```mermaid
flowchart TB
    User["User — assistant-ui Chat"]
    Top["Top Supervisor\nRoutes by domain"]

    subgraph Work["Work Domain"]
      DomW["Work Supervisor"]
      SpPlan["Planner Specialist"]
      WfABS["assignBySkill Workflow"]
      WfDOC["dedupOnCreate Workflow"]
    end

    subgraph People["People Domain"]
      DomP["People Supervisor"]
      SpId["Identity Specialist"]
    end

    subgraph Knowledge["Knowledge Domain"]
      DomK["Knowledge Supervisor"]
      SpKnow["Knowledge Specialist\nRAG over uploaded docs"]
    end

    subgraph SelfMeta["Self / Meta Domains"]
      DomS["Self Supervisor"]
      DomM["Meta Supervisor"]
    end

    Tools["Module-owned Tools\n(read + HITL write)"]
    XRead["Cross-module Read Tools\n(any specialist can call)"]
    PG[("Postgres\nagent schema")]
    LLM["LLM Provider"]

    User --> Top
    Top --> DomW & DomP & DomK & SelfMeta
    DomW --> SpPlan & WfABS & WfDOC
    DomP --> SpId
    DomK --> SpKnow
    SpPlan --> Tools & XRead
    SpId --> XRead
    Tools -. HITL gate .-> User
    SpPlan -. memory .-> PG
    Top --> LLM
```

| What you get for free | Detail |
|---|---|
| **Intent routing** | Top supervisor picks domain; domain supervisor picks specialist or workflow |
| **Persistent memory** | Threads and messages in `agent` schema via `@mastra/pg` |
| **HITL gate** | Every write tool surfaces an approval card before executing |
| **Audit trail** | Every tool call, approval, and workflow step recorded in `core.events` and `agent.workflow_runs` |
| **Rate limiting** | Per-tenant/user token budget; returns HTTP 429 with `Retry-After` |
| **Multi-model support** | Auto-selects from configured OpenAI / Anthropic models by tier hint |

---

## 3. How to Build Your Custom Agent (Extensibility Guide)

### Overview

Adding a new agent capability is a **pure addition** — scaffold a module, implement domain logic, register tools, and the runtime picks everything up at boot. No existing code changes. The path from scaffold to a working agent tool is approximately 30 minutes.

```mermaid
flowchart LR
    Gen["pnpm gen module"]
    Pkg["packages/your-module/"]
    Reg["register.ts\nContributionRegistry.module()"]
    CR["ContributionRegistry"]

    subgraph Runtime["Runtime (auto-wired at boot)"]
      Srv["apps/server\nHTTP routes · agent tools"]
      Wrk["apps/worker\nsubscribers · jobs"]
      Cop["packages/agent\nspecialist tree"]
      Web["apps/web\nnav shell"]
    end

    PG[("your-module schema\nPostgres")]
    Bus[("core.events\noutbox")]

    Gen --> Pkg
    Pkg --> Reg
    Reg --> CR
    CR --> Srv & Wrk & Cop
    Pkg -.->|nav manifest| Web
    Srv --> PG
    Wrk --> PG
    Srv -.->|emit| Bus
    Wrk -.->|subscribe| Bus
```

### Extension Point 1 — Agent Persona & System Prompt

A specialist is a named agent persona scoped to one domain. Register it in your module's `register.ts` via `AgentRegistry.registerSpecialist()`. The `instructions` field is your system prompt; the `domain` field controls which supervisor tree branch it lives under.

**Where to work:** `packages/<your-module>/src/register.ts`

Available domains:

```mermaid
graph LR
    Top["Top Supervisor"] --> Work["work\nTasks · plans · deliverables"]
    Top --> People["people\nUsers · roles · org structure"]
    Top --> Knowledge["knowledge\nDocs · policies · handbooks"]
    Top --> Self["self\nCurrent user preferences"]
    Top --> Meta["meta\nPlatform capabilities"]
```

Adding a specialist to an existing domain requires **no changes** to the top router prompt — you only change your own module.

### Extension Point 2 — Custom Tools (Function Calling)

Tools are the primitives your specialist calls to read data or propose actions. They live in `packages/<your-module>/src/backend/agent-tools/` and are authored with `defineAgentTool` from `@seta/agent-sdk`.

```mermaid
flowchart LR
    subgraph ReadTool["Read Tool"]
      RT_In["inputSchema\n(Zod)"]
      RT_Ex["execute()\ncalls domain fn"]
      RT_Out["outputSchema\n(Zod)"]
      RT_RBAC["rbac: permission slug\n(enforced at domain fn)"]
    end

    subgraph WriteTool["Write Tool  (HITL)"]
      WT_In["inputSchema\n(Zod)"]
      WT_Sus["ctx.agent.suspend(card)\nOR needsApproval: true"]
      WT_Ex["execute()\ncalls domain fn after approval"]
      WT_Out["outputSchema\n(Zod)"]
      WT_RBAC["rbac: permission slug"]
    end

    Spec["Specialist Agent"] -->|"calls directly"| ReadTool
    Spec -->|"pauses for human"| WriteTool
    ReadTool --> Domain["Domain function\n(session-scoped)"]
    WriteTool --> Domain
    Domain --> PG[("Postgres tx\n+ event outbox")]
```

**Tool description rules** — the LLM reads the description to decide which tool to call:

| Rule | Example |
|---|---|
| Start with an imperative verb | `"List open deals…"` not `"This tool retrieves…"` |
| Name the entity and scope | `"…for the current user, filtered by stage"` |
| Add inline constraints | `"Hours are decimal (e.g. 1.5)"` |
| Use `.describe()` on schema fields | Keep tool description concise |

### Extension Point 3 — Intent Recognition

Intent routing is driven entirely by natural-language descriptions — no classifiers to train.

```mermaid
flowchart TB
    Msg["User message"]

    subgraph L1["Level 1 — Top Supervisor"]
      TopPrompt["domain blurbs in\nprompt-templates.ts"]
    end

    subgraph L2["Level 2 — Domain Supervisor"]
      SpecDesc["SpecialistSpec.description\n(your one-liner)"]
    end

    subgraph L3["Level 3 — Specialist"]
      ToolDesc["defineAgentTool({ description })\n(your imperative-verb description)"]
    end

    Msg --> L1
    L1 -->|"routes to domain"| L2
    L2 -->|"selects specialist"| L3
    L3 -->|"calls tool"| Action["Tool executed"]
```

Only add a new domain entry to `prompt-templates.ts` if you need a completely new routing bucket. Adding a specialist to an existing domain or adding a new tool to a specialist requires **zero routing changes**.

### Module Folder Structure

```mermaid
graph TD
    Root["packages/your-module/"]
    Src["src/"]
    Backend["backend/"]
    DB["db/\nschema.ts — pgSchema('your-module')"]
    Domain["domain/\npure session-scoped fns"]
    AgentTools["agent-tools/\nread + write tool definitions"]
    HTTP["http/\noptional Hono sub-app"]
    Subs["subscribers/\nidempotent event handlers"]
    Pub["index.ts — public surface"]
    Events["events.ts — Zod payload schemas"]
    RBAC["rbac.ts — permission slugs"]
    Reg["register.ts — ContributionRegistry.module()"]
    AT["agent-tools.ts — aggregated AgentTool[]"]
    Drizzle["drizzle/migrations/ — generated, never hand-edited"]

    Root --> Src & Drizzle
    Src --> Pub & Events & RBAC & Reg & AT & Backend
    Backend --> DB & Domain & AgentTools & HTTP & Subs
```

---

## 4. Agent Execution Flow (Under the Hood)

### Overview

Every user message travels through a deterministic chain: the HTTP route validates the session and deducts the rate-limit budget, the top supervisor routes to a domain, the domain supervisor picks a specialist or workflow, the specialist reasons over its tools, read tools execute immediately, write tools pause for user approval, and after approval the domain function commits state and emits an event — which the worker fans out to subscribers (notifications, audit, integrations).

### Step-by-Step Lifecycle

| Step | What happens |
|---|---|
| **1. Intent Parsing** | User sends a message to `POST /api/agent/v1/chat`. The route injects page context, validates the session, and calls `reserveTurn` to deduct the token budget. |
| **2. Domain Routing** | The top supervisor reads the message and delegates to exactly one domain (`work`, `people`, `self`, `knowledge`, or `meta`). |
| **3. Specialist Selection** | The domain supervisor picks the right specialist or triggers a deterministic workflow. |
| **4. Context Loading (RAG)** | The specialist calls read tools or semantic search tools to load relevant context. |
| **5. Orchestrator Processing** | The specialist reasons over the fetched signals and decides which action to propose. |
| **6. HITL Gate** | Write tools call `ctx.agent.suspend(card)` or set `needsApproval: true`. The stream pauses; an approval card renders in the chat UI. |
| **7. User Approval** | The user approves. The client posts `POST /api/agent/v1/chat/approve` with optional `resumeData`. |
| **8. Tool Execution** | The domain function runs inside `withEmit(session, ...)`: the DB write and domain event commit in one transaction. |
| **9. Response Generation** | The agent receives the tool result, generates a confirmation message, and streams it back. |
| **10. Event Fan-out** | `LISTEN/NOTIFY` wakes the worker; subscribers process the event idempotently (notifications, audit, integrations). |

### Sequence Diagram

```mermaid
sequenceDiagram
    participant User as User (Chat UI)
    participant HTTP as POST /api/agent/v1/chat
    participant Top as Top Supervisor
    participant Dom as Domain Supervisor
    participant Spec as Specialist Agent
    participant Reads as Read Tools (RAG / domain reads)
    participant Write as Write Tool (HITL)
    participant Domain as Domain Function
    participant DB as Postgres (tx)
    participant Worker as Worker + Subscribers

    User->>HTTP: message + page context
    HTTP->>HTTP: validate session · reserveTurn
    HTTP->>Top: stream turn
    Top->>Dom: delegate to matching domain
    Dom->>Spec: delegate to matching specialist
    Spec->>Spec: reason over tool palette
    Spec->>Reads: 1-4 read tool calls (semantic search, data fetch)
    Reads-->>Spec: signal data
    Spec->>Write: propose write action
    Note over Write: ctx.agent.suspend(ApprovalCard)
    Write-->>User: approval card rendered in chat
    User->>HTTP: POST /chat/approve { resumeData }
    HTTP->>Top: resumeStream(resumeData)
    Top->>Dom: delegate
    Dom->>Spec: delegate
    Spec->>Write: resume with user decision
    Write->>Domain: call domain function with session
    Domain->>DB: BEGIN · INSERT/UPDATE · emit event · COMMIT
    DB-->>Worker: pg_notify
    Worker->>Worker: fan-out to subscribers (notifications, audit)
    Domain-->>Write: result
    Write-->>Spec: tool result streamed
    Spec-->>User: confirmation message
```

### HITL State Machine

```mermaid
stateDiagram-v2
    [*] --> Proposed : specialist calls write tool
    Proposed --> AwaitingApproval : needsApproval=true OR ctx.agent.suspend(card)
    AwaitingApproval --> Executed : user approves / sends resumeData
    AwaitingApproval --> Rejected : user declines
    Executed --> [*] : result streamed · event committed · subscribers notified
    Rejected --> [*] : agent receives rejection · re-plans or surfaces alternatives
```

---

## 5. Getting Started & Contributing

### Prerequisites

- **Docker** — for Postgres + observability stack
- **Node.js 24 LTS** — `nvm use 24` or `fnm use 24`
- **pnpm 9** — `npm install -g pnpm`

### Local Development Setup

```mermaid
flowchart LR
    Clone["1. Clone & install\ngit clone · pnpm install"]
    Env["2. Configure .env\ncopy .env.example\nset DB + LLM keys"]
    DB["3. Start Postgres\npnpm db:up\npnpm db:migrate"]
    Seed["4. Seed data\nbash scripts/tenant-bootstrap.sh\nOR pnpm db:seed"]
    Dev["5. Start dev server\npnpm dev\nlocalhost:5173"]
    Module["6. Scaffold your module\npnpm gen module"]

    Clone --> Env --> DB --> Seed --> Dev --> Module
```

```bash
git clone https://github.com/Seta-International/agent-platform.git
cd agent-platform
pnpm install
cp .env.example .env        # fill in DATABASE_URL, OPENAI_API_KEY, BETTER_AUTH_SECRET
pnpm db:up
pnpm db:migrate
bash scripts/tenant-bootstrap.sh   # admin@sandbox.test / ChangeMe@2026
pnpm dev
```

> **Full demo dataset (300 users + plans + tasks):** use `pnpm db:seed` instead of `tenant-bootstrap.sh`. Sign in as `thang.tran@setafutureorg.onmicrosoft.com` / `ChangeMe@2026`.

### Verification

```bash
pnpm typecheck   # strict TypeScript across all workspaces
pnpm lint        # dep-cruiser boundary gates + ESLint + Biome
pnpm test        # unit + integration tests (real Postgres via testcontainers)
pnpm test:e2e    # Playwright end-to-end (if UI changed)
```

### How to Contribute

```mermaid
gitGraph
   commit id: "main"
   branch feat/your-agent
   checkout feat/your-agent
   commit id: "scaffold module"
   commit id: "add domain logic"
   commit id: "add agent tools"
   commit id: "add tests"
   checkout main
   merge feat/your-agent id: "PR merged"
```

Branch naming: `feat/` · `fix/` · `chore/` · `refactor/` · `docs/` · `test/`

Commit style — imperative mood: `feat: add sales pipeline agent tool`

**Pull Request checklist:**

- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] `pnpm test` passes — write failing tests first
- [ ] Write tools have HITL approval enabled
- [ ] Domain functions are session-scoped and re-check permissions at the callee
- [ ] State changes and event emissions share one transaction
- [ ] No cross-schema foreign keys; no cross-module internal imports

**Reporting issues:** Use `.github/ISSUE_TEMPLATE/`. For security vulnerabilities, follow `SECURITY.md` — do not open a public issue.

---

## Workspace Reference

| Package | Purpose |
|---|---|
| [`apps/web`](apps/web) | React 19 SPA — planner, agent chat, console admin |
| [`apps/server`](apps/server) | Hono API; dev also runs the dispatcher + worker pool |
| [`apps/worker`](apps/worker) | Production graphile-worker pool + LISTEN/NOTIFY dispatcher |
| [`apps/cli`](apps/cli) | Operational CLI — migrate, seed, provision, embedding backfill |
| [`packages/core`](packages/core) | Outbox, event bus, dispatcher, runtime composition |
| [`packages/identity`](packages/identity) | Users, sessions, SSO, role grants |
| [`packages/planner`](packages/planner) | Plans, buckets, tasks; Microsoft Planner sync |
| [`packages/knowledge`](packages/knowledge) | Tenant knowledge corpus + RAG pipeline |
| [`packages/notifications`](packages/notifications) | In-app + email prefs, SSE hub |
| [`packages/agent`](packages/agent) | Mastra engine + agent factory (engine-only; no feature imports) |
| [`packages/staffing`](packages/staffing) | Orchestrator: cross-module workflows |
| [`packages/shared-ui`](packages/shared-ui) | Design system — tokens, primitives, the only `.css` |
| [`sdks/agent`](sdks/agent) | `@seta/agent-sdk` — agent-tool authoring contract |
| [`sdks/module`](sdks/module) | `@seta/module-sdk` — frontend nav-manifest contract |

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Run every app with HMR |
| `pnpm build` | Production build across the workspace |
| `pnpm typecheck` | TypeScript project references |
| `pnpm test` | Vitest against real Postgres via testcontainers |
| `pnpm test:e2e` | Playwright against the dev stack |
| `pnpm lint` | dep-cruiser + Biome + style + raw-SQL boundary checks |
| `pnpm gen module` | Scaffold a new module |
| `pnpm db:reset` | Drop, recreate, migrate, and reseed the dev DB |

---

## License

[MIT](LICENSE) © Seta International
