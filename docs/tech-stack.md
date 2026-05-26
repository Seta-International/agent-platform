# Tech stack

Seta's runtime, data, agent, and frontend layers are built on a fixed set of dependencies, chosen to satisfy the platform's design principles (multi-tenant isolation, transactional event safety, human-in-the-loop agents, single-database operability).

This document records each choice, the alternatives evaluated, and the conditions under which the choice should be revisited. It is the reference for adoption evaluations, contributor onboarding, and dependency upgrade decisions.

---

## At a glance

| Layer | Choice | Headline reason | Section |
|---|---|---|---|
| Runtime | Node 24 LTS | Mastra + AI SDK v6 + ecosystem coverage | [§1](#1-node-24-lts) |
| Monorepo | Turborepo + pnpm | Cached graph + content-addressed store | [§2](#2-turborepo--pnpm) |
| HTTP | Hono | Fast, web-standard, no decorators | [§3](#3-hono) |
| Background jobs | graphile-worker | Same Postgres, no extra infra | [§4](#4-graphile-worker) |
| Auth | better-auth | First-class Drizzle + multi-tenant + OIDC | [§5](#5-better-auth--argon2id) |
| Database | Postgres 16 | Schemas as the boundary tool we need | [§6](#6-postgres-16) |
| Vector | pgvector + HNSW | One DB, partitioned per tenant | [§7](#7-pgvector) |
| ORM | Drizzle | `pgSchema` + `schemaFilter` + raw escape hatch | [§8](#8-drizzle-orm) |
| Event bus | Transactional outbox + `LISTEN/NOTIFY` | Lost/phantom events impossible | [§9](#9-transactional-outbox--listennotify) |
| Agent runtime | Mastra | Tool + memory + workflow primitives, BYO LLM | [§10](#10-mastra) |
| AI SDK | Vercel AI SDK v6 | `needsApproval` HITL + streaming UI | [§11](#11-ai-sdk-v6) |
| Chat UI | assistant-ui v0.14 | AI SDK v6-paired, Interactable cards | [§12](#12-assistant-ui) |
| Rerank | Cohere (with fallbacks) | Quality leader, ~30 ms p95 | [§13](#13-cohere-rerank) |
| Frontend | React 19 | Concurrent, server-component ready | [§14](#14-react-19) |
| Routing + data | TanStack Router + Query | Type-safe routes, query keys for cache | [§15](#15-tanstack-router--query) |
| UI primitives | shadcn/ui | Code we own, not a dependency | [§16](#16-shadcnui) |
| Styling | Tailwind 4 | One styling vocab, design-token native | [§17](#17-tailwind-4) |
| Compute | AWS ECS Fargate | Containers without cluster ops | [§18](#18-aws-ecs-fargate) |
| IaC | OpenTofu | Terraform-compatible, open governance | [§19](#19-opentofu) |
| Observability | OpenTelemetry + pino | Vendor-neutral signals | [§20](#20-opentelemetry--pino) |
| Testing | Vitest + testcontainers + Playwright | Real Postgres, real browser | [§21](#21-vitest--testcontainers--playwright) |

---

## 1. Node 24 LTS

**Role:** Single backend runtime for `apps/server`, `apps/worker`, `apps/cli`.

| | |
|---|---|
| **Why this** | Mastra, AI SDK v6, assistant-ui, better-auth, graphile-worker, Drizzle — every primitive we build on ships as `.mjs` first for Node. LTS through 2027. |
| **Alternatives** | **Bun** (rejected: `graphile-worker` and `@mastra/pg` hit `node:`-only paths; we'd burn weeks on patches). **Deno** (rejected: npm-compat is good but our deploy story is ECS with stock Node images; no payoff). |
| **Trade-offs accepted** | • Slower cold start than Bun • No native `.ts` execution outside dev (`tsx` covers it) • Heavier base image than Bun-alpine |
| **Reconsider when** | Bun reaches Node-compat ≥ 99 % for our exact dep set **and** Mastra publishes a Bun-tested release. |

---

## 2. Turborepo + pnpm

**Role:** Build orchestrator + package manager for the workspace.

| | |
|---|---|
| **Why this** | Turborepo gives us content-hashed task caching across `typecheck`, `lint`, `test`, `build`. pnpm's hard-linked store keeps disk + install time tolerable across ~30 packages. |
| **Alternatives** | **Nx** (rejected: more powerful, but the plugin model + extra config is overkill for our layout). **Moon** (rejected: smaller community, fewer cloud-cache providers). **Lerna + Yarn workspaces** (rejected: cache is per-task, not graph-aware). |
| **Trade-offs accepted** | • Turborepo's remote cache is a paid SaaS unless you self-host • pnpm catalogs are still maturing — we pin in each `package.json` |
| **Reconsider when** | A single build pipeline takes > 5 min on a fresh machine **and** the bottleneck is task scheduling, not test runtime. |

---

## 3. Hono

**Role:** HTTP framework for `apps/server` and every module's `routes` sub-app.

| | |
|---|---|
| **Why this** | Web-standard `Request`/`Response`, zero codegen, runs identically in Node, Bun, Deno, and edge. Hono's middleware shape composes cleanly with our `createSessionMiddleware`. |
| **Alternatives** | **Express** (rejected: callback-style middleware, no first-class types, slow). **Fastify** (rejected: plugin lifecycle is its own DSL; types are bolted on). **NestJS** (rejected: decorators + DI container fight Drizzle's value-oriented style; bundle size). **Elysia** (rejected: Bun-first; ecosystem too small). **tRPC** (rejected: not a server — it's a client/server contract; we already have Hono RPC + `zod`). |
| **Trade-offs accepted** | • Smaller ecosystem than Express — but the surface we touch (cors, csrf, jwt, sse) is all first-party • RPC client generation is opt-in per route |
| **Reconsider when** | A first-party Node primitive (e.g. `node:http` rewrite around WHATWG `Request`) makes the abstraction unnecessary. |

---

## 4. graphile-worker

**Role:** Background job queue. Powers embeddings, M365 sync, agent workflow steps, scheduled tasks.

| | |
|---|---|
| **Why this** | Stores jobs in the **same Postgres** as the rest of the data. One transactional boundary covers domain mutation + job enqueue + event emit. `LISTEN/NOTIFY` for low-latency pickup; cron + retries built in. |
| **Alternatives** | **BullMQ** (rejected: needs Redis — second SLO, second backup, second failure mode). **pg-boss** (rejected: similar idea, less polished UI/CLI, smaller community). **Inngest / Trigger.dev** (rejected: SaaS; would split tenant data across two vendors). **Temporal** (rejected: massive ops surface for what we need today). |
| **Trade-offs accepted** | • Caps out around 10k jobs/sec per node — fine for our scale targets • No visual workflow editor (we use Mastra workflows for the agentic side) |
| **Reconsider when** | Sustained throughput > 5k jobs/sec on a single Postgres writer **or** we need cross-region active-active queuing. |

---

## 5. better-auth + argon2id

**Role:** Sessions, local password, SSO (Entra OIDC), account linking.

| | |
|---|---|
| **Why this** | Drizzle adapter is first-class. Schema is plain tables we can extend (we add `identity.user_profile` next to `identity.user`). Multi-tenant story works without a hosted control plane. |
| **Alternatives** | **Auth.js / NextAuth** (rejected: Next-first, opaque session model, weak Drizzle story). **Lucia v3** (rejected: archived 2024). **Clerk / WorkOS** (rejected: external IdP for *our* users adds latency and a billing dependency). **Keycloak** (rejected: JVM ops, heavy for the use case). |
| **Trade-offs accepted** | • better-auth is younger (< 2 years) — we accept smaller community in exchange for owning the schema • argon2id via `@node-rs/argon2` requires a native binary (handled by our base image) |
| **Reconsider when** | better-auth governance falters (e.g. core maintainer attrition) **or** we need WebAuthn + hardware key UX better than the plugin layer. |

**SSO behaviour:** admin pre-provisioning only — no JIT, first SSO login links to an existing user, unknown subjects rejected.

---

## 6. Postgres 16

**Role:** Single database for every module (one DB, many schemas).

| | |
|---|---|
| **Why this** | Schemas are the boundary tool we need: each module owns one, dep-cruiser + raw-SQL lint forbid cross-schema reads, projections live in the consumer's own schema. `pgvector`, `LISTEN/NOTIFY`, `jsonb`, deferred-constraint triggers, partitioning — all in the base. |
| **Alternatives** | **MySQL** (rejected: weaker `jsonb`, no `LISTEN/NOTIFY`, no first-class vector extension). **CockroachDB** (rejected: no `LISTEN/NOTIFY`, no pgvector, distributed semantics we don't need). **MongoDB** (rejected: no relational integrity, no SQL, no boundary tool). **Two DBs (OLTP + vector)** (rejected: doubles backup, doubles failover, splits tenant identity). |
| **Trade-offs accepted** | • Single-writer scaling ceiling — we lift it via read replicas + the `PLATFORM_MODULES` split before it bites • Major-version upgrades coordinate every module |
| **Reconsider when** | Sustained writer CPU > 70 % at 16xlarge **and** the hot module is identifiable enough to move to its own cluster. |

---

## 7. pgvector

**Role:** Vector storage + ANN index for embeddings (planner, knowledge, future modules).

| | |
|---|---|
| **Why this** | Lives in the same database as the source rows — joins, foreign-key adjacency, and per-tenant `LIST` partitioning all work. HNSW on `halfvec(1536)` (pgvector ≥ 0.7) hits ~10 ms p95 at our scale. |
| **Alternatives** | **Pinecone** (rejected: external service, tenant data split across vendors, billing dependency). **Weaviate / Qdrant** (rejected: separate DB to run, no transactional join with source data). **Milvus** (rejected: heavyweight, overkill). **FAISS** (rejected: library, not a service — re-builds the durability story we already have). |
| **Trade-offs accepted** | • ANN at > 100 M vectors per partition needs careful index tuning • `halfvec` saves ~50 % storage at minor recall cost |
| **Reconsider when** | A single tenant's vector count exceeds 50 M **and** rerank latency makes the extra round-trip to a dedicated vector store cheaper than the partition scan. |

---

## 8. Drizzle ORM

**Role:** Schema definition, migrations, query building.

| | |
|---|---|
| **Why this** | `pgSchema('<module>')` + `schemaFilter: ['<module>']` are the linchpin of our boundary enforcement — Prisma can't model it. Generated migrations are SQL we can read, edit-by-hand-when-needed (partitioning, deferred constraints), and version like code. |
| **Alternatives** | **Prisma** (rejected: no native `pgSchema` namespace, opaque migration engine, slower for joins). **Kysely** (rejected: query builder only — we'd write migrations + schema separately). **TypeORM** (rejected: decorator-heavy, weak types, slow). **Raw SQL** (rejected: no compile-time column safety). |
| **Trade-offs accepted** | • Drizzle is on 0.x — breaking changes between minors are real • No N+1 protection in the query builder; we rely on review |
| **Reconsider when** | Drizzle ships a 1.0 with a breaking schema-DSL change we can't absorb **or** Prisma adds first-class multi-schema with raw-SQL escape hatches. |

---

## 9. Transactional outbox + `LISTEN/NOTIFY`

**Role:** Domain event bus. Powers cross-module reactions, audit, agent observation.

| | |
|---|---|
| **Why this** | The outbox eliminates two classes of bus failure at the schema level: *lost events* (state committed, publish failed) cannot occur because the event row participates in the same transaction; *phantom events* (publish succeeded, state rolled back) cannot occur because rollback removes the event row. `LISTEN/NOTIFY` wakes subscribers at p99 < 20 ms; a 2 s poll provides fallback coverage for dropped notifications. |
| **Alternatives** | **Kafka** (rejected: zero added value at our scale, doubles infra). **NATS** (rejected: same — and adds a JetStream-vs-core decision). **Redis Streams** (rejected: durability story is worse than Postgres). **AWS SQS / SNS** (rejected: cross-tx with Postgres is a manual outbox anyway, so why add SQS). **RabbitMQ** (rejected: classic broker, no transactional adjacency with source data). |
| **Trade-offs accepted** | • At-least-once delivery — subscribers must be idempotent on `event_id` • Per-aggregate ordering only, not global • Replay window bounded by `core.events` retention |
| **Reconsider when** | We need cross-region active-active event ordering **or** subscriber fan-out > 1k concurrent consumers per event. |

---

## 10. Mastra

**Role:** Agent runtime — tools, agents, memory, workflows.

| | |
|---|---|
| **Why this** | Composes our module-owned tools and specs into agents at boot, validates references at composition time (typo fails boot, not runtime), and ships a Postgres-backed memory store we can scope to the `copilot` schema. BYO LLM provider — we keep Cohere + OpenAI + Anthropic as separate concerns. |
| **Alternatives** | **LangGraph / LangChain** (rejected: Python-first, heavyweight, opinionated state). **CrewAI** (rejected: Python, role-based orchestration not what we need). **AutoGen** (rejected: research code, weak production story). **Vercel AI SDK alone** (rejected: no agent/memory/workflow primitives — we'd build them ourselves). |
| **Trade-offs accepted** | • Mastra is < 2 years old — APIs still move • Memory APIs evolve faster than core; we pin `@mastra/memory` carefully |
| **Reconsider when** | Mastra governance falters **or** the SDK's tool-execution model diverges from AI SDK v6's `needsApproval` in a way that breaks our HITL contract. |

**Source-of-truth note:** a Mastra monorepo checkout lives at `/Users/canh/Projects/Seta/mastra` — consult it for API names instead of guessing from npm types.

---

## 11. AI SDK v6

**Role:** LLM client, streaming, tool-call protocol, HITL approval.

| | |
|---|---|
| **Why this** | `needsApproval: true` on tool definitions is exactly the HITL contract we need — the SDK pauses, surfaces the call to the UI, and resumes on accept. v6's streaming protocol is what assistant-ui consumes natively. |
| **Alternatives** | **OpenAI SDK** (rejected: vendor-locked, no HITL primitive, no streaming-UI helpers). **Anthropic SDK** (same). **LangChain JS** (rejected: heavy abstraction, weaker types). |
| **Trade-offs accepted** | • v6 is a recent major — some plugins are still catching up • Provider features behind capability flags (e.g. cache control) require provider-specific options |
| **Reconsider when** | An open standard for tool calling + HITL emerges that every provider implements natively. |

---

## 12. assistant-ui

**Role:** Chat UI primitives — message list, composer, tool-call cards, Interactable approval cards.

| | |
|---|---|
| **Why this** | v0.14 pairs directly with AI SDK v6's stream protocol — `useAssistantRuntime` consumes the same events the SDK emits. The Interactable component is how we render HITL approval cards without rebuilding the protocol. |
| **Alternatives** | **Vercel `ai-chatbot` template** (rejected: scaffold, not a library — we'd fork and own forever). **Chatbot UI** (rejected: Next-only, no AI SDK v6 paired primitives). **Custom from scratch** (rejected: re-implements stream parsing, tool-call rendering, attachment handling). |
| **Trade-offs accepted** | • v0.x — API churn is real, we pin and upgrade deliberately • Theme is shadcn-paired; non-shadcn projects pay a porting cost |
| **Reconsider when** | AI SDK v6 ships its own first-party UI primitives at parity. |

---

## 13. Cohere rerank

**Role:** Stage-2 cross-encoder rerank after stage-1 RRF (FTS + vector).

| | |
|---|---|
| **Why this** | Quality leader on our retrieval evals; ~30 ms p95 at top-50; multilingual. We wrap it in `@seta/shared-retrieval` with a provider abstraction, so swapping is one config change. |
| **Alternatives** | **Voyage rerank** (close runner-up, kept as fallback). **LLM-as-judge** (used as fallback when rerank API is down — slower, more expensive). **No rerank** (`none` mode for ops). |
| **Trade-offs accepted** | • External API call on the hot path • Per-1k-doc pricing — bounded by our `top-50` cap |
| **Reconsider when** | A self-hostable cross-encoder reaches Cohere parity on our eval set within our latency budget. |

---

## 14. React 19

**Role:** Single frontend framework for `apps/web`.

| | |
|---|---|
| **Why this** | Concurrent rendering, `useTransition`/`useDeferredValue`, the Compiler — and an ecosystem of UI primitives (shadcn, assistant-ui, TanStack) that all target React first. The team's existing muscle memory matters. |
| **Alternatives** | **Vue 3** (rejected: smaller ecosystem for our specific surface — no assistant-ui equivalent). **Svelte 5** (rejected: same — and we'd lose React-first AI SDK helpers). **Solid** (rejected: niche, no migration path for existing components). |
| **Trade-offs accepted** | • Hydration cost on the initial paint of large pages • The Compiler is opt-in and still maturing |
| **Reconsider when** | A React major breaks our component graph badly enough that a port pays for itself. |

---

## 15. TanStack Router + Query

**Role:** Type-safe routing for `apps/web`; server-state cache for every backend call.

| | |
|---|---|
| **Why this** | TanStack Router gives us file-based routes with end-to-end inferred types — no string paths. Query owns the cache; we centralize query keys per module (e.g. `apps/web/src/modules/planner/state/query-keys.ts`) so invalidation is one place. Both are framework-agnostic — no Next.js lock-in. |
| **Alternatives** | **React Router v6** (rejected: weaker types, no first-class loaders). **Next.js** (rejected: SSR/RSC overhead we don't need; locks us to one hosting model). **SWR** (rejected: smaller surface than Query; mutations less ergonomic). |
| **Trade-offs accepted** | • Router code generation runs on save — IDE integration matters • Two libraries instead of one framework |
| **Reconsider when** | A first-party React router ships at TanStack's type-safety bar. |

---

## 16. shadcn/ui

**Role:** UI primitive layer — buttons, dialogs, tables, forms, command palette.

| | |
|---|---|
| **Why this** | shadcn isn't a dependency — it's code you copy into your own repo. We own every primitive, can fork at the file level, and never block on an upstream PR. Pairs with Tailwind and Radix UI. |
| **Alternatives** | **Material UI** (rejected: opinionated visual language, hard to re-skin, runtime bundle cost). **Mantine** (rejected: dep-locked, harder to fork). **Chakra** (rejected: emotion runtime, theme system fights Tailwind). **ArkUI** (rejected: headless only — we'd skin every primitive anyway). |
| **Trade-offs accepted** | • Updates are manual — we re-copy or diff • Quality of each primitive depends on Radix UI |
| **Reconsider when** | We hit a primitive shadcn doesn't ship and the build-from-Radix cost exceeds adopting a kit. |

---

## 17. Tailwind 4

**Role:** Styling vocabulary + design tokens.

| | |
|---|---|
| **Why this** | Tailwind 4's CSS-first config (`@theme`, `@layer`) collapses our token surface into one file (`tokens.css`). The Vite plugin compiles per-file. Zero runtime cost. |
| **Alternatives** | **CSS Modules** (rejected: no design-token primitive, theming is manual). **vanilla-extract** (rejected: build-time compile we don't need given Tailwind 4). **Panda CSS** (rejected: smaller community, more config). |
| **Trade-offs accepted** | • Tailwind v4 is recent — the `tailwindcss-animate` ecosystem is catching up • Width-scale collision with `--spacing-*` (handled via `--max-width-*` overrides in `tokens.css`) |
| **Reconsider when** | A standardized CSS-native design-token system (e.g. `@property` + cascade layers maturing) makes Tailwind unnecessary. |

---

## 18. AWS ECS Fargate

**Role:** Production compute. Each runtime (`server`, `worker`) is its own ECS service.

| | |
|---|---|
| **Why this** | Containers without cluster ops. Task definitions are declarative, IAM scoping is per-task, autoscaling is built in. The `PLATFORM_MODULES` env var lets us split modules into separate services on the same image without code changes. |
| **Alternatives** | **EKS** (rejected: Kubernetes is the wrong abstraction at our scale; the operational cost is real). **Lambda** (rejected: 15-min limit, no `LISTEN/NOTIFY` listener pattern). **App Runner** (rejected: opaque, no per-service IAM, no Service Connect). **ECS on EC2** (rejected: EC2 fleet management we'd rather skip). |
| **Trade-offs accepted** | • Cold-start can be 20-40 s — kept warm by minimum task count • Pricing is per-second-billed CPU/mem — fine for steady-state, expensive for bursty • No true scale-to-zero |
| **Reconsider when** | We need ms-level scale-to-zero **or** > 10k concurrent tasks where EKS economics flip. |

---

## 19. OpenTofu

**Role:** Infrastructure-as-code for the AWS reference module at `infra/opentofu/aws-ecs/`.

| | |
|---|---|
| **Why this** | Open-governance fork of Terraform (post-BSL relicense). Provider ecosystem is identical. Cloud Posse modules (`terraform-aws-ecs-alb-service-task`) work unchanged. |
| **Alternatives** | **Terraform** (rejected: BSL license risk for downstream commercial use). **AWS CDK** (rejected: TypeScript IaC is appealing but the generated CloudFormation is opaque to debug, drift detection is poor). **Pulumi** (rejected: same code-as-config benefit, much smaller AWS-native ecosystem). |
| **Trade-offs accepted** | • Some Terraform Cloud features (private module registry mirrors) don't have OpenTofu equivalents • Slightly younger CLI |
| **Reconsider when** | HashiCorp relicenses back **or** OpenTofu governance falters. |

---

## 20. OpenTelemetry + pino

**Role:** Traces, metrics, logs across every runtime.

| | |
|---|---|
| **Why this** | OTel is the vendor-neutral signal layer — we export OTLP HTTP and a self-hoster can point at any collector. `pino` is the fastest structured Node logger; `log.child({ component })` gives every subsystem filterable logs. W3C `traceparent` flows through assistant-ui → Hono → Mastra → tool handler → in-process dispatch. |
| **Alternatives** | **Datadog SDK** (rejected: vendor-locked at the SDK layer; self-hosters would inherit the dependency). **winston / bunyan** (rejected: slower, less ergonomic child-logger API). **`console.log`** (rejected: no structured fields, no log levels, no child contexts). |
| **Trade-offs accepted** | • Collector setup is on the operator (we don't ship one by default) • OTel JS auto-instrumentation has a small startup cost |
| **Reconsider when** | A first-party Node OTel SDK reaches stable + 1 across every signal type **and** we can drop the experimental flags. |

---

## 21. Vitest + testcontainers + Playwright

**Role:** Unit (Vitest), integration (Vitest + testcontainers + real Postgres), e2e (Playwright).

| | |
|---|---|
| **Why this** | Vitest's ESM-native runner matches Node 24's module system and provides sub-second watch-mode reruns. `testcontainers` provisions a real Postgres instance per integration test, eliminating the divergence risk inherent to database mocks. Playwright drives a real browser for end-to-end tests, including multi-origin SSO flows. |
| **Alternatives** | **Jest** (rejected: CommonJS-first, slower watch mode, friction with ESM modules). **Cypress** (rejected: in-browser runtime cannot drive multi-origin authentication flows required by the SSO test suite). **Database mocks (`pg-mem`, hand-rolled)** (rejected: divergence from production behaviour is a known failure mode — see CLAUDE.md "production-grade only"). |
| **Trade-offs accepted** | • Integration tests need Docker locally • Playwright browsers are large to install — CI caches them |
| **Reconsider when** | A faster, drop-in Vitest-compatible runner emerges **or** Playwright governance falters. |

---

## Deliberate exclusions

| Excluded | Reason |
|---|---|
| **Microservices over HTTP** | A modular monolith with schema-level isolation provides the same boundary guarantees without the latency, retry, and distributed-tracing surface area. |
| **GraphQL** | Hono RPC with Zod schemas produces typed clients without the schema-stitching maintenance cost. |
| **Server-side rendering (Next.js)** | The application is authenticated end-to-end; SSR complexity is not justified by SEO or first-paint requirements. |
| **Redis** | Event bus, sessions, and job queue all reside in Postgres. A single data store reduces the backup, failover, and operability surface. |
| **gRPC** | Boundaries are either in-process or HTTP/JSON to a browser client. gRPC's benefits apply at scales above the system's target envelope. |
| **Kubernetes** | ECS Fargate provides container orchestration without cluster operations. Migration to EKS is justified only when its economics outperform Fargate at significantly higher concurrency. |
| **Custom authentication** | better-auth combined with argon2id provides a complete, audited authentication surface; custom implementations introduce security risk without offsetting benefit. |
| **Dedicated error trackers (Sentry, Rollbar)** | OpenTelemetry treats errors as a signal type; a separate vendor on the critical path is unnecessary. |

---

## Upgrade discipline

- **Install via CLI only:** `pnpm add <pkg>` with no version specifier. Never hand-edit `package.json` versions or `pnpm-lock.yaml`.
- **Major upgrades** of pinned-foundation deps (Mastra, AI SDK, assistant-ui, Drizzle, Hono, React) land in their own PR with a short note in the PR body about API surface changes touched.
- **Renovate** drives the patch/minor cadence; majors are human-reviewed.

---

## See also

- [`architecture.md`](./architecture.md) — how these pieces compose into the system shape.
- [`copilot-architecture.md`](./copilot-architecture.md) — Mastra + AI SDK v6 + assistant-ui in motion.
- [`creating-modules.md`](./creating-modules.md) — Hono routes, Drizzle schemas, agent tools in practice.
- [`hosting/aws.md`](./hosting/aws.md) — ECS Fargate + OpenTofu deployed.
