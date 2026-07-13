# Agent guidance

Contract for coding agents (Claude Code, Codex, any `AGENTS.md`-aware tool) working in this repo. `AGENTS.md` is a symlink to `CLAUDE.md` — edit one, both update.

## Reference docs

- [`docs/README.md`](docs/README.md) — the full documentation map (start here).
- [`docs/platform/architecture.md`](docs/platform/architecture.md) — single source of truth for the implementation shape.
- [`docs/platform/rbac.md`](docs/platform/rbac.md) — how access control works, conceptually (for contributors + agents; no code).
- [`docs/guides/defining-rbac.md`](docs/guides/defining-rbac.md) — how to author roles, permissions, and scopes for a module.
- [`docs/guides/creating-modules.md`](docs/guides/creating-modules.md) — add a new module + agent tool via `pnpm gen module`.
- [`docs/guides/dev-quickstart.md`](docs/guides/dev-quickstart.md) — first tenant and accounts on a fresh DB.
- [`docs/guides/commit-convention.md`](docs/guides/commit-convention.md) — Jira-keyed branches, commit format, PR template (CI-gated).
- [`docs/guides/writing-a-prd.md`](docs/guides/writing-a-prd.md) · [`writing-a-wbs.md`](docs/guides/writing-a-wbs.md) — playbooks: author a module PRD; break a module into a WBS (CSV → Jira).
- **Tickets / estimation / PRD / tests → follow the matching `docs/guides/` file, don't improvise:** [`requirement-to-tickets.md`](docs/guides/requirement-to-tickets.md) (feature/epic → tickets), [`ticket-template.md`](docs/guides/ticket-template.md), [`estimation.md`](docs/guides/estimation.md) (story points + AI-time-saved), [`writing-tests.md`](docs/guides/writing-tests.md), [`writing-a-prd.md`](docs/guides/writing-a-prd.md) / [`writing-a-wbs.md`](docs/guides/writing-a-wbs.md) (new module).
- [`docs/reference/db-design.md`](docs/reference/db-design.md) — unified DB design; [`ddd-design.md`](docs/reference/ddd-design.md) is the event/integration backbone.
- [`docs/hosting/`](docs/hosting/) — self-host (docker compose, AWS, scaling, upgrading).
- [`DESIGN.md`](DESIGN.md) — design tokens and the `packages/shared-ui` contract.
- [`/.env.example`](.env.example) — every variable the stack reads.

When `docs/platform/architecture.md` and the code disagree, the doc is the bug — fix it there. One version per doc: no Phase tags, no internal milestones, no ADR ledger.

## Fixed technical foundations (do not propose alternatives)

- **Runtime / build**: Node 24 LTS, Turborepo + pnpm workspaces, Vite.
- **Backend**: Hono, Mastra (`@mastra/core@^1.35`), graphile-worker.
- **Database**: Postgres + pgvector, Drizzle ORM (`pgSchema` + `schemaFilter`). No other ORM, no raw migration tool.
- **Event bus**: transactional outbox in `core.events` + `LISTEN/NOTIFY` + 2s fallback poll. No SQS, no Kafka.
- **Frontend**: React 19, TanStack Router (suite-shell routing composed via `@tanstack/virtual-file-routes`), shadcn/ui, Tailwind 4, AI SDK v6 (`ai@^6` + `@ai-sdk/react@^3`), assistant-ui v6-paired.
- **Auth**: better-auth + Drizzle adapter, argon2id via `@node-rs/argon2`.
- **Cloud**: AWS — ECS Fargate, RDS, Secrets Manager, S3.

For `@mastra/core` API names, consult the sibling checkout at `../mastra/` instead of guessing from npm types. `../mastra/packages/playground-ui/` is the reference for chat/upload UX patterns in `apps/web`.

## Enforced architectural rules (CI-gated)

1. **`pnpm depcruise`** — cross-module imports must go through `packages/<module>/src/index.ts` or the `/events`, `/rbac`, `/contracts`, `/agent-tools` subpaths. `shared-*` may not import from feature modules. `agent` is engine-only and may not import any feature or orchestrator module (`agent-no-feature-imports`). Frontend app tier: `no-cross-web-app-imports` — leaf `web-*` apps can't import each other (`web-identity`/`web-notifications`/`web-agent`'s Ask Seta panel are importable infra; cross-app composition only in the `apps/web` shell); `web-no-backend-imports` — no web package imports a module's `/backend` or `/db`.
2. **`pnpm lint:raw-sql`** — rejects `FROM <other_module>.` / `JOIN <other_module>.` outside `packages/core/src/{audit,events}/`.
3. **`pnpm lint:styles`** — rejects `.css`, `tailwind.config.*`, `@theme/@layer/@apply` outside `packages/shared-ui/` (one shim allowed at `apps/web/src/styles/globals.css`).
4. **Drizzle schema scoping** — each `drizzle.config.ts` sets `schemaFilter: ['<module>']`; cross-schema reads fail at codegen.

**No cross-schema foreign keys.** `planner.tasks.assignee_id` stores a `uuid` with no FK to `identity.user.id`. Consistency is event-driven via local read-model projections.

**No cross-module data-handle sharing.** A module never hands its Drizzle client to another module. Mutation crosses the boundary only through public-surface function calls (RBAC re-checked at the callee) or domain events.

**The bus is the outbox.** State change + event row commit in one transaction via `core.emit()` inside `withEmit(session, ...)`. No separate publish path. `LISTEN/NOTIFY` wakes subscribers; the 2s poll covers dropped notifies. Audit lives in `core.events` alongside domain events.

## Module tiers

Enforced by `.dependency-cruiser.cjs`:
- **infra** — `packages/shared-*` and `sdks/*`. Leaf packages; may not import from feature/orchestrator modules.
- **module** — `packages/<name>/`. Cross-module imports go through the public surface only.
- **app** — `apps/<name>` and the leaf `packages/web-*` frontend app packages. Web apps are leaves composed only by the `apps/web` shell host (subject to the `no-cross-web-app-imports` / `web-no-backend-imports` rules above).

Declared via `"setaTier"` in `package.json` (informational, not a separate enforced layer):
- **foundation** — depended on by every module (`core`, `identity`).
- **orchestrator** — composes multiple feature modules (`staffing`). Typically schemaless; workflow state lives in `agent.workflow_runs`.
- **engine** — `agent` only. Composes module-owned agent tools/specs into a Mastra runtime.

## Project-specific workflow

- **Branching & commits (Jira-keyed, CI-gated)** — every task maps to a Jira ticket (`FUT-<n>`). Start work on a fresh branch named `<type>/FUT-<n>-<slug>` (e.g. `git checkout -b feat/FUT-123-group-viewer`); never commit feature work on `main`. Commit as `type(scope): FUT-<n> subject` — Conventional Commit type + the Jira key right after the colon, subject ≤ 100 chars (e.g. `feat(planner): FUT-123 add group viewer`). Types: `feat fix chore docs refactor test ci build perf style revert`; scope is optional (use `(deps)` for dependency bumps — key not required there). `commitlint` (lefthook `commit-msg`) + the branch-name guard (lefthook `pre-commit`) enforce this locally; CI re-checks the PR title and head branch. Pull the `FUT-<n>` from the ticket the task references.
- **PRs always follow `.github/pull_request_template.md`** — fill in every section (What & why, Jira link, Evidence, Checklist, AI usage); don't collapse it to a one-line body. Use `gh pr create --body-file .github/pull_request_template.md` (or paste the template) as the starting body, then fill each section in before submitting.
  - **AI time saved (hours) is derived, not guessed** — per [`estimation.md`](docs/guides/estimation.md): pull the ticket's story points from Jira, `baseline_hours = story_points × velocity` reconciled against the diff, `ai_time_saved = baseline_hours − actual_hours_with_AI`. It's a proposal; the human value in Jira wins. No points / uncalibrated velocity → mark it provisional, don't invent.
- **Tests run against real Postgres via `testcontainers`** — do not introduce DB mocks. Write the failing test first.
- **Run only affected tests locally — a full `pnpm test` is a CI job, not a dev loop.** Use `pnpm test:affected` (turbo `--affected` vs `main`, includes uncommitted changes) or `pnpm --filter @seta/<module> test`; likewise `pnpm typecheck:affected`. Run the full `pnpm typecheck && pnpm lint && pnpm test` only for cross-cutting changes (`core`, `identity`, `shared-*`, contracts, many modules) or as the final pre-PR gate. `pnpm lint` is fast/global — run it whole. Add `pnpm test:e2e` if UI changed.
- **Install deps via CLI only**: `pnpm add <pkg>` with no version specifier so the registry resolves latest. Never hand-edit `package.json` versions or `pnpm-lock.yaml`.
- **Generate migrations via CLI only**: `pnpm --filter @seta/<module> db:generate`, then `pnpm db:migrate`. Never hand-edit files under `drizzle/`.
  - **Exception — SQL Drizzle cannot model** (partitioning, deferred constraint triggers, `pg_notify` wiring, partitioned indexes): hand-written `.sql` files live alongside generated ones in `drizzle/migrations/`. Each begins with a one-line comment naming the limitation. The runner walks lexically; both formats coexist. Never edit a committed migration — write a new numbered one.
- **Module shape comes from `pnpm gen module`** — see [`docs/guides/creating-modules.md`](docs/guides/creating-modules.md). Don't invent commands; the `pnpm` scripts in root `package.json` are the contract.
- **`docs/superpowers/` is gitignored — never `git add -f` or push it.** Specs and plans under that path are local working documents only. Commit design docs there freely; they will not appear in the remote repo.
- **Onboarding contract**: `clone → install → db:up → db:migrate → bash scripts/dev/tenant-bootstrap.sh → dev` yields a working demo in 5 min on a fresh machine. Don't break it.

## Conventions worth knowing

- **Inspect the DB (dev):** `docker exec seta-ap-postgres-dev psql -U seta -d seta -c '<SQL>'`. Postgres is also reachable at `localhost:5542` (mapped by `compose.override.yaml`). Schemas: `agent`, `core`, `identity`, `planner`, `notifications`, `staffing`, etc.
- **Debug the agent (dev):** `scripts/dev/trace-thread.sh <threadId>` dumps a chat turn's lifecycle (messages, approvals, snapshot status, spans). App logs persist to `logs/{server,worker}.log` (NDJSON). Per-turn tool-calls/suspends/resumes trace to `agent.mastra_ai_spans`; raise Mastra's logger with `MASTRA_LOG_LEVEL`.
- **HITL on every write tool.** AI SDK v6 `needsApproval: true` + assistant-ui Interactable confirmation card, wired via `registerToolPermission` from `@seta/agent-sdk`. Read tools execute directly. Native-suspend chat cards resume via `POST /chat/resume`; `/workflows/approvals/:id/decide` only records the decision (no resume).
- **Subscribers must be idempotent**, keyed on `event_id`. At-least-once delivery; per-aggregate ordering only.
- **Production-grade only, never quick hacks.** Diagnose the root cause and ship the optimized solution; "small patch now, real fix later" is rejected on review.
