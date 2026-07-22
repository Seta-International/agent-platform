# Agent guidance

Contract for coding agents (Claude Code, Codex, any `AGENTS.md`-aware tool) in this repo. `AGENTS.md` symlinks to `CLAUDE.md` — edit one, both update. Tier-specific rules (frontend, backend/data, agent engine) live in `.claude/rules/` and load automatically when you open matching files.

## Where to look first

- [`docs/README.md`](docs/README.md) — full documentation map. Start here; don't guess at doc locations.
- [`docs/platform/architecture.md`](docs/platform/architecture.md) — source of truth for the implementation shape. **When it and the code disagree, the doc is the bug — fix it there.**
- **Before authoring tickets, estimates, PRDs, tests, or a new module, open the matching file in [`docs/guides/`](docs/guides/) and follow it — don't improvise.**

## Fixed foundations (do not propose alternatives)

Node, Turborepo + pnpm workspaces, Vite. Postgres + pgvector with Drizzle ORM only — **no other ORM, no raw migration tool.** Event bus is a transactional outbox in `core.events` + `LISTEN/NOTIFY` + 2s fallback poll — **no SQS, no Kafka.** Backend: Hono, Mastra, graphile-worker. Frontend: React, TanStack Router, Astryx design system (`@astryxdesign/core` + `@astryxdesign/theme-neutral` + StyleX; the shadcn/Radix layer is gone — no package declares `@radix-ui` and no source file imports it. Radix survives only inside `@assistant-ui/react*`, which is what the `@radix-ui` pins in `pnpm-workspace.yaml` constrain), Tailwind, AI SDK, assistant-ui. Auth: better-auth + argon2id. Cloud: AWS — ECS Fargate (Graviton; lean `api` + isolated `worker`, autoscaling), Cloudflare Tunnel (zero inbound), RDS Postgres (single-AZ), S3 + CloudFront, Secrets Manager; Terraform in `infra/terraform/prod/`, single-region `ap-southeast-1`. See [`docs/hosting/aws.md`](docs/hosting/aws.md); k8s deferred.

## Module boundaries (CI-gated; full rule set in `.dependency-cruiser.cjs`)

- **Cross-module imports go only through `packages/<module>/src/index.ts`** or the `/events`, `/rbac`, `/contracts`, `/agent-tools` subpaths — never deep-import another module. `pnpm depcruise` enforces the tier graph (`shared-*` and `agent` may not import feature modules).
- **No cross-schema foreign keys** — store a bare `uuid` and keep it consistent via events + local read-model projections, not FKs.
- **No cross-module data-handle sharing** — a module never hands its Drizzle client out. Cross-boundary work goes through public function calls (RBAC re-checked at the callee) or domain events.
- **The bus is the outbox** — state change + event row commit in one transaction via `core.emit()` inside `withEmit(session, ...)`. No separate publish path.

## Workflow (CI-gated — get these wrong and the PR bounces)

- **Branch + commit are Jira-keyed.** Never commit feature work on `main`. Branch `<type>/FUT-<n>-<slug>`; commit `type(scope): FUT-<n> subject` (subject ≤ 100 chars). Pull `FUT-<n>` from the ticket. Types: `feat fix chore docs refactor test ci build perf style revert`; `(deps)` bumps skip the key.
- **PRs use [`.github/pull_request_template.md`](.github/pull_request_template.md)** — fill every section, don't collapse to one line. AI-time-saved is *derived* per [`estimation.md`](docs/guides/estimation.md), not guessed; no story points → mark provisional.
- **Tests run against real Postgres via `testcontainers` — never add DB mocks. Write the failing test first.**
- **Run affected tests only** — `pnpm test:affected` or `pnpm --filter @seta/<module> test` (likewise `typecheck:affected`). Full `pnpm typecheck && pnpm lint && pnpm test` is the pre-PR gate or for cross-cutting changes only; `pnpm lint` is fast, run it whole. Add `pnpm test:e2e` if UI changed.
- **Install deps via CLI only** — `pnpm add <pkg>` with no version so the registry resolves latest. Never hand-edit `package.json` versions or `pnpm-lock.yaml`.
- **New modules come from `pnpm gen module`** (see [`creating-modules.md`](docs/guides/creating-modules.md)) — don't invent commands; root `package.json` scripts are the contract.
- **`docs/superpowers/` is gitignored — never `git add -f` or push it.** Local working docs only.
- **`pnpm install` configures Claude Code usage telemetry** on your machine via `postinstall` — metadata only, no prompt or code content. `pnpm telemetry:status` shows exactly what is sent; `SETA_TELEMETRY_OPTOUT=1 pnpm install` removes it. See [`dev-telemetry.md`](docs/hosting/dev-telemetry.md).
- **Onboarding must stay green:** `clone → install → db:up → db:migrate → bash scripts/dev/tenant-bootstrap.sh → dev` yields a working demo in 5 min on a fresh machine.

## Always

**Production-grade only, never quick hacks.** Diagnose the root cause and ship the optimized solution; "small patch now, real fix later" is rejected on review.

Frontend Astryx guidance (CLI workflow, component rules, StyleX wiring caveat) lives in [`.claude/rules/frontend.md`](.claude/rules/frontend.md) — it loads automatically when you open frontend files.
