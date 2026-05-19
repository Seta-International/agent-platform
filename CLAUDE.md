# Agent guidance

This file provides guidance to coding agents (Claude Code, Codex, and any other AGENTS.md-aware tool) when working with code in this repository. `AGENTS.md` is a symlink to `CLAUDE.md` — edit one, both update.

## Reference docs

- `docs/requirements.md` — **source of truth** for product scope. If anything conflicts with this, requirements wins.
- `docs/architecture.md` — implementation shape; resolves all 11 §21 known unknowns in `requirements.md`.
- `docs/rbac-and-screens.md` — role × permission × screen matrix.
- `docs/project-plan.md` — milestones M1–M5, parallelization, risks, ADR ledger (D1–D14).
- `DESIGN.md` — Linear-flavored design tokens. Drives `packages/shared/ui` once it lands.

Cross-reference by section anchor (e.g. `§1.6.5a`, `§A4`, `D7`); keep anchors stable.

**Do not read these docs end-to-end.** `requirements.md` is ~230 KB, `architecture.md` ~150 KB. Jump to the anchor a task points to. Cold-start entry points: `project-plan.md` §1–§4, `requirements.md` §1.5–§1.6, `architecture.md` §A.

If a referenced doc is missing, stop and ask before guessing.

## Fixed technical foundations (do not propose alternatives)

Closed decisions per `requirements.md` §1.5; version pins at §17.2.

- **Runtime / build**: Node 24 LTS, Turborepo + pnpm workspaces, Vite.
- **Backend**: Hono, Mastra (`@mastra/core@^1.35` + `pg`/`hono`/`ai-sdk`), graphile-worker (fallback: pg-boss).
- **DB**: Postgres + pgvector, Drizzle ORM (`pgSchema` + `schemaFilter`). No other ORM, no raw migration tool.
- **Bus**: transactional outbox in `core.events` + `LISTEN/NOTIFY` + 2s fallback poll (§1.6.5a). No SQS, no Kafka in v1.
- **Frontend**: React 19, TanStack Router, shadcn/ui, Tailwind 4, AI SDK v6 (`ai@^6` + `@ai-sdk/react@^3`), assistant-ui v6-paired.
- **Auth**: better-auth + Drizzle adapter, argon2id via `@node-rs/argon2`.
- **Cloud**: AWS — ECS Fargate, RDS, Secrets Manager, S3 (S3 in Phase B).

## Architectural rules that are enforced, not aspirational

The modular-monolith boundary discipline (`requirements.md` §1.6.2, `architecture.md` §B) is **CI-gated**. When implementation lands, every PR runs:

1. **dependency-cruiser** (`.dependency-cruiser.cjs`, ruleset at `architecture.md` §A5): rejects cross-package imports that don't go through `packages/<module>/src/index.ts` (the public surface) or `src/events/`. `shared/*` packages may not import from feature modules. Only `copilot` may wrap peer modules' public surfaces as tools.
2. **Drizzle schema scoping**: each module's Drizzle config sets `schemaFilter: ['<module>']`. Schemas are `core`, `identity`, `planner`, `copilot`, `integrations`.
3. **Raw-SQL grep audit**: CI rejects `FROM <other_module>.` / `JOIN <other_module>.` anywhere outside `packages/core/src/{audit,events}/`.
4. **Public-API integration test**: each module's tests run with peer source paths excluded from the resolver.

**No cross-schema foreign keys.** A `planner.tasks.assignee_id` stores a `bigint` — no FK to `identity.users.id`. Consistency is event-driven via subscribers and local read-model projections in the consumer's own schema (`architecture.md` §F.4).

**No cross-module data-handle sharing.** A module never hands its Drizzle client to another module. Mutation crosses the boundary only through public-surface function calls exported from `src/index.ts` (with RBAC re-checked at the callee) or domain events.

**The bus is the outbox.** State change + event row commit in one transaction via `core.emit()`. There is no separate publish path. `LISTEN/NOTIFY` wakes subscribers; 2s poll covers dropped notifies. Audit is unified into `core.events` per **D6**.

## Engineering discipline

These apply to every code change. They are not negotiable per-PR.

- **Test-first, always.** Write a failing test before the implementation. No carve-outs for "trivial" code — trivial code is where regressions hide. Tests run against real Postgres via `testcontainers`; do not introduce DB mocks to make a test cheaper.
- **Build only what the task needs.** No speculative abstractions, no "we might need this later" parameters, no helpers with one caller. Three similar lines beats a premature shared function.
- **Delete fearlessly.** Unused exports, dead branches, commented-out blocks, and `_unused` placeholders go. Git history is the archive.
- **Boundaries first, internals second.** A module's public surface (`src/index.ts`) and event payloads are the contract — design and test those before the implementation behind them. Internals can be rewritten without ceremony; signatures cannot.
- **Comments explain *why*, never *what*.** Only write a comment when a future reader would be surprised by the code. Names do the *what*.
  - No ticket IDs, PR numbers, phase markers, milestone tags (`// M1`, `// Phase A`, `// fixes #123`), or author attributions in comments. That metadata belongs in the commit message and PR description, where it stays linked to the actual change. In code it rots.
  - No "added for X", "used by Y", "was Z before" — call sites and git history answer these.
  - No `TODO(later)` without a tracked issue, no commented-out code, no changelog narration.
- **No `any`, no `// @ts-ignore`** without a one-line comment naming the specific external constraint forcing it. The constraint, not the symptom.
- **Errors surface, they don't get swallowed.** Catch only to translate or add context. Empty `catch {}` and broad `catch (e) { return null }` need a written reason.
- **Verify before claiming done.** Run `pnpm typecheck && pnpm lint && pnpm test` (and the relevant `test:e2e` if UI changed) before reporting a task complete. "Should work" is not a status.
- **Install dependencies via CLI only — never hand-edit.** Use `pnpm add <pkg>` with no version specifier so the registry resolves latest. Do not hand-edit `package.json` versions or `pnpm-lock.yaml`.
- **Generate migrations via CLI only — never hand-edit.** Use `pnpm drizzle-kit generate` (and `pnpm db:migrate` to apply). Do not hand-edit files under `drizzle/`. If output is wrong, fix the schema and re-run — don't patch the SQL.
  - **Exception: SQL Drizzle cannot model.** Partitioning (`PARTITION BY RANGE`), deferred constraint triggers, `pg_notify` wiring, partitioned indexes, and similar PG-specific DDL live as hand-written `.sql` files in the same `drizzle/migrations/` folder, sibling to generated ones. Each hand-written file begins with a one-line comment naming the limitation (`-- hand-written: drizzle pgTable cannot express PARTITION BY RANGE`). The migration runner walks the folder in lexical filename order; both formats coexist. The "don't patch generated SQL" rule still applies — if a hand-written file needs evolution, write a new numbered migration; never edit a committed one.

## Repo layout & commands

Layout shape and command names are fixed by `requirements.md` §19.1 / §19.3 — read them before adding a directory or a script. Rules that apply:

- **Use the layout in §19.1 exactly.** Do not invent alternative directory schemes. Each module has a public surface at `src/index.ts` plus internals at `src/{backend,events,db}/`.
- **Do not invent commands.** `pnpm` script names in §19.3 are the contract; don't add aliases or rename.
- **Protect the onboarding contract** (§19.3): `clone → install → db:up → db:migrate → db:seed → dev` must yield the flagship demo in 5 min on a fresh machine. Any change that adds a step needs an explicit reason.
- **`pnpm lint` runs dep-cruiser** as the boundary gate — never bypass it.

## Conventions worth knowing

- **HITL on every write tool** (§14.1): AI SDK v6 `needsApproval: true` + assistant-ui Interactable confirmation card. Read tools execute directly.
- **Subscribers must be idempotent**, keyed on `event_id`. At-least-once delivery; per-aggregate ordering only.
- **Design tokens** in `DESIGN.md` are Linear-flavored. Lavender (`#5e6ad2`) is the only chromatic accent — brand mark, primary CTA, focus ring, link emphasis. Dark mode from day one.
- **One domain per agent, ≤ ~15 tools** (architecture §H.1). Tool schemas live in the system prompt — overflowing it burns prompt-cache hits and worsens model tool selection. Past the cap, spin up a new specialist agent and route to it; don't keep stapling tools onto an existing one. Soft rule, reviewer-enforced, no lint.
- **Style monopoly.** All styling lives in `packages/shared/ui`. No `.css`, no `tailwind.config.*`, no `@theme/@layer/@apply` outside that package (one shim allowed at `apps/web/src/styles/globals.css`). Enforced by `pnpm lint:styles`.

## When proposing changes to docs

- Don't reorganize section numbers — they're cited from elsewhere. Add new sections at the end of their parent or as letter suffixes (e.g. §1.6.5a).
- Don't move a D-row in the ADR ledger (`project-plan.md` §7). Append new rows; reversals get a written D-row of their own.
- If `architecture.md` conflicts with `requirements.md`, the architecture doc is the bug — fix it there, not in requirements.
