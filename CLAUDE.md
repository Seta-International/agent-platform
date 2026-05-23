# Agent guidance

This file is the contract for coding agents (Claude Code, Codex, any other `AGENTS.md`-aware tool) working in this repo. `AGENTS.md` is a symlink to `CLAUDE.md` — edit one, both update.

## Reference docs

Maintain one version of every doc. No internal milestones, no Phase A/B/C, no ADR ledgers — the code is the spec; this is a production-grade OSS project.

- [`docs/architecture.md`](docs/architecture.md) — the single source of truth for the implementation shape.
- [`docs/creating-modules.md`](docs/creating-modules.md) — how to add a new module + agent tool with `pnpm gen module`.
- [`docs/dev-quickstart.md`](docs/dev-quickstart.md) — first tenant and accounts on a fresh DB.
- [`docs/hosting/`](docs/hosting/) — self-host (docker compose, AWS, scaling, upgrading).
- [`DESIGN.md`](DESIGN.md) — design tokens and the `packages/shared-ui` contract.
- [`/.env.example`](.env.example) — configuration contract for every variable the stack reads.

When `architecture.md` and the code disagree, the doc is the bug — fix it there.

## Fixed technical foundations (do not propose alternatives)

- **Runtime / build**: Node 24 LTS, Turborepo + pnpm workspaces, Vite.
- **Backend**: Hono, Mastra (`@mastra/core@^1.35`), graphile-worker.
- **Database**: Postgres + pgvector, Drizzle ORM (`pgSchema` + `schemaFilter`). No other ORM, no raw migration tool.
- **Event bus**: transactional outbox in `core.events` + `LISTEN/NOTIFY` + 2s fallback poll. No SQS, no Kafka.
- **Frontend**: React 19, TanStack Router, shadcn/ui, Tailwind 4, AI SDK v6 (`ai@^6` + `@ai-sdk/react@^3`), assistant-ui v6-paired.
- **Auth**: better-auth + Drizzle adapter, argon2id via `@node-rs/argon2`.
- **Cloud**: AWS — ECS Fargate, RDS, Secrets Manager, S3.

When working on copilot, the full Mastra source lives at `../mastra/` (sibling to this repo) — consult it for `@mastra/core` API names instead of guessing from npm types. `../mastra/packages/playground-ui/` is a useful reference for chat/upload UX patterns when building `apps/web` features.

## Enforced architectural rules

The modular-monolith boundaries are CI-gated. Every PR runs:

1. **`pnpm depcruise`** — rejects cross-module imports that don't go through `packages/<module>/src/index.ts` (the public surface), the `/events`, `/rbac`, `/contracts`, or `/agent-tools` subpaths. `shared-*` packages may not import from feature modules. `copilot` is engine-only and may not import any feature or orchestrator module (rule `copilot-no-feature-imports`).
2. **`pnpm lint:raw-sql`** — rejects `FROM <other_module>.` / `JOIN <other_module>.` anywhere outside `packages/core/src/{audit,events}/`.
3. **`pnpm lint:styles`** — rejects `.css`, `tailwind.config.*`, `@theme/@layer/@apply` outside `packages/shared-ui/` (one shim allowed at `apps/web/src/styles/globals.css`).
4. **Drizzle schema scoping** — each module's `drizzle.config.ts` sets `schemaFilter: ['<module>']`; cross-schema reads fail at codegen.

**No cross-schema foreign keys.** A `planner.tasks.assignee_id` stores a `uuid` with no FK to `identity.user.id`. Consistency is event-driven via local read-model projections.

**No cross-module data-handle sharing.** A module never hands its Drizzle client to another module. Mutation crosses the boundary only through public-surface function calls (with RBAC re-checked at the callee) or domain events.

**The bus is the outbox.** State change + event row commit in one transaction via `core.emit()` inside `withEmit(session, ...)`. There is no separate publish path. `LISTEN/NOTIFY` wakes subscribers; the 2s poll covers dropped notifies. Audit lives in `core.events` alongside domain events.

## Module tiers

Two tiers are enforced by `.dependency-cruiser.cjs`:

- **infra** — `packages/shared-*` and `sdks/*`. Leaf packages. May not import from feature/orchestrator modules.
- **module** — `packages/<name>/`. Cross-module imports go through the public surface only.

Three patterns are declared via `"setaTier"` in `package.json` but not enforced as separate layers:

- **foundation** — modules every other module depends on (`core`, `identity`).
- **orchestrator** — modules composing multiple feature modules into cross-domain workflows (`staffing`). Typically schemaless; workflow state lives in `copilot.workflow_runs`.
- **engine** — `copilot` only. Composes module-owned agent tools/specs into a Mastra runtime; may not import feature or orchestrator modules.

## Engineering discipline

These apply to every code change. They are not negotiable per-PR.

- **Test-first, always.** Write a failing test before the implementation. No carve-outs for "trivial" code — trivial code is where regressions hide. Tests run against real Postgres via `testcontainers`; do not introduce DB mocks to make a test cheaper.
- **Build only what the task needs.** No speculative abstractions, no "we might need this later" parameters, no helpers with one caller. Three similar lines beats a premature shared function.
- **Delete fearlessly.** Unused exports, dead branches, commented-out blocks, and `_unused` placeholders go. Git history is the archive.
- **Boundaries first, internals second.** A module's public surface (`src/index.ts`) and event payloads are the contract — design and test those before the implementation behind them. Internals can be rewritten without ceremony; signatures cannot.
- **Comments explain *why*, never *what*.** Only write a comment when a future reader would be surprised by the code. Names do the *what*.
  - No ticket IDs, PR numbers, phase markers, milestone tags, or author attributions in comments. That metadata belongs in the commit message and PR description.
  - No "added for X", "used by Y", "was Z before" — call sites and git history answer these.
  - No `TODO(later)` without a tracked issue, no commented-out code, no changelog narration.
- **No `any`, no `// @ts-ignore`** without a one-line comment naming the specific external constraint forcing it. The constraint, not the symptom.
- **Errors surface, they don't get swallowed.** Catch only to translate or add context. Empty `catch {}` and broad `catch (e) { return null }` need a written reason.
- **Verify before claiming done.** Run `pnpm typecheck && pnpm lint && pnpm test` (and `pnpm test:e2e` if UI changed) before reporting a task complete. "Should work" is not a status.
- **Install dependencies via CLI only — never hand-edit.** Use `pnpm add <pkg>` with no version specifier so the registry resolves latest. Do not hand-edit `package.json` versions or `pnpm-lock.yaml`.
- **Generate migrations via CLI only — never hand-edit.** Use `pnpm --filter @seta/<module> db:generate` (and `pnpm db:migrate` to apply). Do not hand-edit files under `drizzle/`. If output is wrong, fix the schema and re-run.
  - **Exception: SQL Drizzle cannot model.** Partitioning (`PARTITION BY RANGE`), deferred constraint triggers, `pg_notify` wiring, partitioned indexes, and similar PG-specific DDL live as hand-written `.sql` files in the same `drizzle/migrations/` folder, sibling to generated ones. Each hand-written file begins with a one-line comment naming the limitation. The migration runner walks the folder in lexical filename order; both formats coexist. If a hand-written file needs evolution, write a new numbered migration; never edit a committed one.

## Repo layout & commands

- **Use the canonical module shape** from [`docs/architecture.md`](docs/architecture.md) §4. The module factory at `pnpm gen module` produces it — see [`docs/creating-modules.md`](docs/creating-modules.md) for the full walkthrough.
- **Do not invent commands.** The `pnpm` scripts in the root `package.json` are the contract; don't add aliases or rename.
- **Protect the onboarding contract**: `clone → install → db:up → db:migrate → bash scripts/tenant-bootstrap.sh → dev` must yield a working demo in 5 minutes on a fresh machine.
- **`pnpm lint` runs dep-cruiser** as the boundary gate — never bypass it.

## Conventions worth knowing

- **HITL on every write tool.** AI SDK v6 `needsApproval: true` + assistant-ui Interactable confirmation card. Tied via `registerToolPermission` from `@seta/copilot-sdk`. Read tools execute directly.
- **Subscribers must be idempotent**, keyed on `event_id`. At-least-once delivery; per-aggregate ordering only.
- **One domain per agent, ≤ ~15 tools assembled into an agent at session-assembly time.** Tool schemas live in the system prompt — overflowing burns cache hits and worsens model tool selection. The cap is per-agent, not per-module — a module may contribute more tools across multiple agent specs. Past the cap on a single agent, spin up a new specialist agent and route to it. Soft rule, reviewer-enforced.

## When proposing changes to docs

- One version per doc. No "current vs deprecated" sections, no Phase tags, no internal milestone references.
- If [`docs/architecture.md`](docs/architecture.md) conflicts with the code, the doc is the bug — fix it there.
- New decisions land directly in [`docs/architecture.md`](docs/architecture.md). The old ADR ledger is gone; the code + commit history is the trail.
