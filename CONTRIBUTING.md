# Contributing

Thanks for your interest in `seta-agent-platform`. This document outlines how the project is organized and what we expect from contributions.

## Getting started

```bash
pnpm install
pnpm db:up       # starts Postgres + Redis + OTel + Jaeger via Docker
pnpm typecheck
pnpm lint
```

See `CLAUDE.md` for the fixed technical foundations and architectural rules. The doc set under `docs/` is the source of truth — read `docs/requirements.md` and `docs/architecture.md` before proposing scope changes.

## Branching & commits

- Branch from `main`. Use a descriptive prefix: `feat/`, `fix/`, `chore/`, `refactor/`, `docs/`, `test/`.
- Commit messages follow the imperative mood: `feat: add planner createTask flow`.
- Open a draft PR early when work spans more than one commit.

## Code quality gates

Every PR runs:

- `pnpm typecheck` — strict TypeScript across all workspaces.
- `pnpm lint` — dependency-cruiser boundary gate + ESLint boundaries plugin + Biome CI.
- `pnpm format:check` — Biome formatter dry-run.

These gates are enforced in CI (`.github/workflows/ci.yml`). The same checks run via lefthook on `pre-push`.

## Architectural rules

The modular-monolith boundaries (`CLAUDE.md` and `docs/architecture.md` §A5) are enforced by dependency-cruiser. Cross-module imports must go through `packages/<module>/src/index.ts` (public surface) or `packages/<module>/src/events/`. Do not bypass these rules; PRs that loosen them require a written decision in `docs/project-plan.md` §7.

## Reporting bugs / requesting features

Use the issue templates under `.github/ISSUE_TEMPLATE/`. Include reproduction steps, the commit SHA, and your environment (Node version, OS).

## Security

Please do **not** open public issues for security vulnerabilities. See `SECURITY.md` for the responsible disclosure process.

## Code of conduct

All contributors are expected to abide by `CODE_OF_CONDUCT.md`.

## Database migrations

- Generate with `pnpm -F @seta/<module> exec drizzle-kit generate` (per-module config).
- Apply with `pnpm db:migrate` (runs all module migrations in dep order via apps/cli).
- Hand-written `.sql` files (for partition / trigger / `pg_notify` DDL Drizzle cannot model) live in the same `packages/<module>/drizzle/migrations/` folder. Name them `NNNN_description.sql`; lexical filename order determines run order.
- First line of every hand-written file: `-- hand-written: <why drizzle cannot model this>`.
- Never edit a committed migration. Add a new numbered file instead.
- Checksum mismatch on an already-applied migration aborts the run with `MigrationChecksumMismatch`.
