# Documentation map

How the `docs/` tree is organized. Start with `platform/architecture.md` — the single source of truth for the implementation shape.

## platform/ — how the system is built

- [`architecture.md`](platform/architecture.md) — the implementation shape; the source of truth. When it and the code disagree, the doc is the bug.
- [`tech-stack.md`](platform/tech-stack.md) — the fixed technical foundations and why each was chosen.
- [`rbac.md`](platform/rbac.md) — how access control works, conceptually (no code).

## agent/ — the agent engine

- [`architecture.md`](agent/architecture.md) — the intent-routed agent-of-agents system in depth.
- [`tools.md`](agent/tools.md) — module-owned agent tools and the contribution registry.

## guides/ — contributor & authoring how-tos

- [`dev-quickstart.md`](guides/dev-quickstart.md) — first tenant and accounts on a fresh DB.
- [`commit-convention.md`](guides/commit-convention.md) — Jira-keyed branch names, commit format, and PR template (CI-gated).
- [`creating-modules.md`](guides/creating-modules.md) — add a module + agent tool via `pnpm gen module`.
- [`defining-rbac.md`](guides/defining-rbac.md) — author roles, permissions, and scopes for a module.
- [`requirement-to-tickets.md`](guides/requirement-to-tickets.md) — turn a feature/epic into tickets.
- [`ticket-template.md`](guides/ticket-template.md) — the ticket shape to follow.
- [`estimation.md`](guides/estimation.md) — story points and AI-time-saved (derived, not guessed).
- [`writing-tests.md`](guides/writing-tests.md) — testing playbook (real Postgres, failing test first).
- [`writing-a-prd.md`](guides/writing-a-prd.md) — playbook for authoring a module PRD.
- [`writing-a-wbs.md`](guides/writing-a-wbs.md) — playbook for breaking a module into a WBS (CSV → Jira).

## modules/ — product specs

- [`people-prd.md`](modules/people-prd.md) · [`hiring-prd.md`](modules/hiring-prd.md) · [`pm-prd.md`](modules/pm-prd.md) · [`planner-prd.md`](modules/planner-prd.md) — per-module PRDs.

## reference/ — engineering design behind the modules

- [`db-design.md`](reference/db-design.md) — the DB constitution and the descriptive schema map across all ten module schemas + ER diagrams.
- [`ddd-design.md`](reference/ddd-design.md) — bounded contexts, domain-event contracts, the integration backbone.
- [`review-schema.sql`](reference/review-schema.sql) — the authoritative DDL for a standalone review DB (DBeaver), regenerated from the live baselines by [`scripts/dev/dump-review-schema.sh`](../scripts/dev/dump-review-schema.sh); populate it with sample data via `pnpm db:seed`.

## hosting/ — self-host

- [`hosting/`](hosting/) — docker-compose, AWS, configuration, disaster recovery, community.

## design/ — UI design system

- [`design/`](design/) — design-system mockups and tokens (see also [`../DESIGN.md`](../DESIGN.md)).
