# Seta Agentic Platform

> **Architecture Reference:** For the complete implementation details and design principles, see [`docs/architecture.md`](docs/architecture.md). This is the single source of truth for the platform's implementation shape.

## 1. System Overview & Repo Structure

### What is Seta Agentic Platform?

Seta Agentic Platform is an open-source, AI-first, multi-tenant enterprise platform foundation. It's conceptually similar to next-gen ERP or SAP architectures, but built specifically for the agentic era.

The defining characteristic is simple. Every business module in the Seta Agentic Platform embeds an Agentic Agent directly within its operational boundaries. Rather than acting as a simple QA chatbot, the agent reads current system state, reasons across domains, and proposes concrete transactional actions. Upon explicit human authorization, it executes those mutations directly.

### Layered Architecture

The platform architecture is organized into four decoupled tiers. This design ensures horizontal scalability and clear separation of concerns:

```mermaid
graph TD
    subgraph Presentation["1. Presentation Tier (apps/web)"]
        SPA["React 19 SPA"]
    end

    subgraph Application["2. Application & API Tier (apps/server)"]
        Hono["Hono HTTP Server"]
        Mastra["Mastra Agent Core"]
    end

    subgraph Background["3. Async Worker Tier (apps/worker)"]
        Worker["Embeddings"]
        Agent["Agent Steps"]
        Jobs["Sync Jobs"]
    end

    subgraph Storage["4. Database & Storage Tier"]
        DB["Relational Database"]
        Vector["pgvector"]
    end

    Presentation -->|HTTP / WebSocket APIs| Application
    Application -->|Enqueue Long Jobs| Background
    Application -->|Read / Write| Storage
    Background -->|Read / Write| Storage
```

- **SPA** (`apps/web/`): Built on React 19, Vite, and TanStack Router. It manages the core UI layout shell, handles dynamic injection of custom module components, and registers client-side navigation.
- **Server** (`apps/server/`): A high-performance Hono HTTP server acting as the gateway. It handles request authentication, enforces RBAC middleware checks, orchestrates REST APIs, and runs the Mastra agent core.
- **Worker** (`apps/worker/`): A resource-isolated process powered by graphile-worker. It processes async database tasks, generates text vector embeddings, handles calendar sync, and runs asynchronous workflow steps.
- **Database** (Postgres 16): Stores standard relational application data with schemas for Core, Identity, Planner, and your custom modules. It also includes a dedicated pgvector HNSW index for fast semantic similarity search.

### Core Agent Engine (Mastra Integration)

The platform backend wraps and configures key modules from the Mastra runtime:

- Specialist Agent and Tool declarations via `@mastra/core`
- Deterministic multi-step process orchestration via `@mastra/core/workflows`
- Short-term memory and long-term context indexing via `@mastra/memory` and `@mastra/pg`
- System response auditing and testing via `@mastra/evals`

The platform architecture remains flexible. While Mastra is configured by default, you can implement or plug in alternative agent frameworks if your use case requires it.

### Folder Directory Layout

```
├── apps/
│   ├── web/          the React SPA (entire frontend: module views, app shell, navigation)
│   ├── server/       the API server and AI agent host (auth, RBAC, Mastra runtime)
│   ├── worker/       the async job processor (embeddings, workflows, background sync)
│   └── cli/          developer tooling for scaffolding and infrastructure
│
├── packages/
│   ├── core/         the event bus and RBAC foundation that everything depends on
│   ├── identity/     the auth, multi-tenancy, and user profile system
│   ├── planner/      REFERENCE MODULE: the canonical example of a business module
│   ├── agent/        the assembled Mastra agent (supervisor + all registered specialists)
│   ├── knowledge/    knowledge base and document management
│   ├── staffing/     resource allocation and team management
│   ├── notifications/ multi-channel notification system
│   ├── integrations/ external system integrations (M365, etc.)
│   ├── shared-*/     shared infrastructure packages (db, rbac, ui, crypto, storage, etc.)
│   └── your-module/  BUILD YOUR CUSTOM MODULE HERE
│
├── sdks/
│   ├── agent/        the SDK for authoring agent tools with HITL support
│   └── module/       the SDK for plugging your module UI into the app shell
│
└── docs/
    ├── architecture.md        system architecture and design principles
    ├── agent-architecture.md  in-depth agent system design
    ├── creating-modules.md    guide for building new modules
    ├── dev-quickstart.md      local development setup
    └── hosting/               deployment guides (AWS, Docker, etc.)
```

**Related Documentation:**
- **[`docs/architecture.md`](docs/architecture.md)**: Complete system architecture and design principles (SSOT)
- **[`docs/agent-architecture.md`](docs/agent-architecture.md)**: Deep dive into the three-tier supervisor agent system
- **[`docs/creating-modules.md`](docs/creating-modules.md)**: Module authoring guide with `pnpm gen module`
- **[`docs/dev-quickstart.md`](docs/dev-quickstart.md)**: Local development setup and first-run instructions
- **[`AGENTS.md`](AGENTS.md)**: Contract for AI coding agents working in this repo

---

## 2. Agent Runtime Architecture

### Conceptual Runtime Flow

An agentic request follows a recurring cycle. This high-level representation does not reference explicit file configurations or database queries.

```mermaid
flowchart TD
    U([User Prompt / UI Action]) --> Intent[Analyze and Classify User Intent]

    subgraph ReasoningEngine["Cognitive Reasoning & Delegation"]
        Intent -->|Evaluate Complexity| Supervisor[Top-Level Supervisor Agent]
        Supervisor -->|Delegate Sub-tasks| SubAgent[Activate Domain-Specific Specialist]
    end

    subgraph KnowledgeGathering["Signal Collection (Read-Only)"]
        SubAgent --> Semantic[Vector Semantic Long-Term Search]
        SubAgent --> ExternalAPI[Query Application Context via Read Tools]
    end

    KnowledgeGathering -->|Context Injected| SubAgent
    SubAgent --> StateCheck{Requires State Mutation?}

    StateCheck -->|No: Read-Only Response| EndStream([Stream Response back to UI])
    StateCheck -->|Yes: System Mutation| HITL[Human-In-The-Loop: Await Approval]

    HITL -->|Rejected| EndStream
    HITL -->|Approved| Exec[Execute Atomic Transaction Write to DB]
    Exec --> EventBus[Publish Event to Transactional Outbox]
    EventBus --> Downstream[Trigger Async Background Jobs & Notifications]
    Exec --> EndStream
```

### Detailed Implementation Flow (Case Study: Planner)

This shows the step-by-step execution of a real system request. The diagram illustrates how the Server, Specialist Agent, Database, and Worker interact when resolving a multi-faceted business inquiry. For example: "Check if there's a task similar to 'Stripe webhook integration', and if not, assign someone with the right skills to take it."

### 2a. Request Ingestion & Delegation Routing

```mermaid
sequenceDiagram
    participant UI as Chat Companion (apps/web)
    participant API as Server Router (Hono HTTP)
    participant Mid as RBAC Middleware (shared-rbac)
    participant Top as Supervisor Agent (Mastra Core)
    participant Mem as Memory Manager (Mastra Memory)
    participant Spec as Planner Specialist (packages/planner)

    UI->>API: POST /api/agent/v1/chat with Message Payload & Thread ID
    API->>Mid: Verify JWT and validate "agent.chat.use" permission
    Mid-->>API: Inject Tenant isolation ID & User Profile
    API->>Mem: Query short-term message windows + HNSW memory arrays from Postgres
    Mem-->>API: Provide enriched Context Bundle
    API->>Top: streamText(messages, context)
    Note over Top: Classifies request -> Maps intent to the "Task Assignment" sub-domain
    Top->>Spec: Delegate processing thread to the Planner Specialist
    Note over Spec: Load and reference all 9 registered domain-specific business tools
```

### 2b. Structural Signaling & Context Gathering

```mermaid
sequenceDiagram
    participant Spec as Planner Specialist Agent
    participant SimTool as Duplicate Finder (Read Tool)
    participant SkillTool as Resource Search (Read Tool)
    participant DB as Postgres (pgvector)

    Note over Spec: Gather details needed to check duplicates and match candidate skills
    Spec->>SimTool: Call tool with task name parameters
    SimTool->>DB: Cosine Similarity query on Task Vector indices (filtered by tenant)
    DB-->>SimTool: Return potential duplicates matching score (e.g., Match found: 0.92)
    SimTool-->>Spec: Payload confirming a highly similar task exists

    Spec->>SkillTool: Call tool with parsed skills list: ["Stripe", "Webhooks"]
    SkillTool->>DB: Query engineering skills catalog & check current work capacity
    DB-->>SkillTool: Return matched profile metrics & existing task workloads
    SkillTool-->>Spec: Return top candidate profiles
```

### 2c. HITL Interception & State Commitment

```mermaid
sequenceDiagram
    participant Spec as Planner Specialist Agent
    participant Propose as Assignment Proposer (Write Tool)
    participant Stream as AI SDK v6 Engine
    participant UI as Chat Component UI
    participant Confirm as Approval Controller (/approve)
    participant Core as Core Domain (packages/planner)
    participant DB as Postgres
    participant Outbox as core.events

    Spec->>Propose: Call tool with proposed candidates & similarity context
    Note over Propose: Trigger agent execution pause: ctx.agent.suspend()
    Propose-->>Stream: Interrupt text token generation -> Package client UI metadata
    Stream-->>UI: Render interactive Approval Card on client screen

    Note over UI: User reviews candidate matches, selects assignee, and clicks "Confirm"
    UI->>Confirm: POST authorization choice with payload
    Confirm->>Core: Invoke assignTask() inside a Database Transaction
    Core->>DB: Execute UPDATE statement on target Task record
    Core->>Outbox: INSERT 'planner.task.assigned' event to the transactional outbox
    Note over Core: Transaction commits atomically (system state and domain events are unified)
    Confirm-->>Stream: Resume agent execution thread
    Stream-->>UI: Stream remaining confirmation text to the chat window
```

---

## 3. Infrastructure

> Each hackathon team is allocated a secure, isolated cloud sandbox environment in AWS.

### Allocated Cloud Architecture per Team

```mermaid
graph TD
    subgraph Public["Browser"]
        DNS["your_team.ai-hackathon.seta-international.com"]
    end

    subgraph Docker["AWS EC2"]
        Server["Server"]
        React["React SPA"]
        Worker["Async Worker"]
    end

    subgraph Private["VPC"]
        RDS["AWS RDS Postgres 16"]
        S3["AWS S3 Bucket"]
    end

    DNS -->|HTTP/SSE Traffic| Docker
    Docker -->|Local Network Connect| RDS
    Docker -->|Secure Asset Sync| S3
```

## 4. Development Pipeline

1. **Fork & Configure:** Fork the repository to your team workspace and configure production secrets (database URLs, LLM API keys, and session tokens).
2. **Build & Push to ECR:** Build the root multi-stage Dockerfile (frontend static assets build and backend compilation bundle) and push the image to your dedicated AWS ECR repository.
3. **Deploy to EC2:** SSH into your assigned AWS EC2 instance, pull the fresh image from ECR, and restart the container (structural migrations run automatically on container startup). Configure static assets to map to AWS S3.
4. **Verify Route:** Access your live environment via your team-specific endpoint: `<your_team>.ai-hackathon.seta-international.com`
