# @seta/performance — ARIA data layer

Data layer for **ARIA** (Agentic Review & Insight Assistant), the Employee Performance
Tracking & Reporting agent (Hackathon Problem 05). This module owns the `performance`
Postgres schema: the 12 datasets ARIA reads to assemble employee performance profiles,
apply the 27-rule NORM framework, and surface risk signals.

> Status: schema + seed only. Domain functions, agent tools, and the chat UI are built on top of this layer in later steps.

## The 12 tables (schema `performance`)

Tables mirror the 12 sheets of `ELC_05_Employee_Performance_Tracking.xlsx`. Every table is
**tenant-scoped** (`tenant_id uuid`, no cross-schema FK per architecture §6); `member_id`
(e.g. `EMP-031`) is tenant-local text, never an FK to `identity.user`.

| Sheet | Table | Grain | Notes |
|---|---|---|---|
| DS-00 | `employee_master` | 1 / employee | role, level (L1–L7), status, tier, latest score |
| DS-01 | `resource_allocation` | 1 / employee | account/project, `allocation_pct` (>1.0 = overloaded), bench status |
| DS-02 | `performance_by_project` | 1 / employee × month | monthly KPI score + classification + feedback (T3, T4 / 2026) |
| DS-03 | `timesheet` | 1 / employee × month | OT, lateness, absence, compliance signals |
| DS-04 | `violations` | 1 / violation event | **sensitive** (HR/Leader only) |
| DS-04b | `violation_type_ref` | 1 / violation type | lookup of 26 types + typical severity/consequence |
| DS-04c | `violation_summary` | 1 / employee | aggregated counts + `risk_flag` (derived) |
| DS-05 | `promotion_intent` | 1 / employee | **sensitive** (HR/BOD only) — readiness 0–1 |
| DS-06 | `salary_band` | 1 / employee | **sensitive** (HR/BOD only) — band only, never a figure |
| DS-07 | `norm_rules` | 1 / rule | the 27-rule NORM engine ARIA evaluates against |
| DS-08 | `performance_profile` | 1 / employee | derived per-employee snapshot (T3–T4) for fast query/risk |
| REF | `project_master` | 1 / project | decode `account_id` / `project_id` |

PKs are composite `(tenant_id, …natural key…)`; secondary indexes exist for the agent's
common query shapes (by account, by period, by member, by risk flag).

## Schema & migrations

The Drizzle schema lives in [`src/backend/db/schema.ts`](src/backend/db/schema.ts); the query
client is [`src/backend/db/client.ts`](src/backend/db/client.ts) (`performanceDb()`).

Migrations are **generated from the schema** — never hand-edited (architecture rule):

```bash
pnpm --filter @seta/performance db:generate   # schema.ts → drizzle/migrations/NNNN_*.sql
pnpm db:migrate                                # apply across all modules (idempotent ledger)
```

Current migration: `drizzle/migrations/0000_nosy_masked_marvel.sql` (creates the schema + 12 tables).

## Seeding mock data

```bash
pnpm --filter @seta/performance db:seed                       # 100 employees, default tenant
pnpm --filter @seta/performance db:seed -- --tenant=hackathon --count=100 --seed=42
```

| Flag | Default | Meaning |
|---|---|---|
| `--tenant` | first tenant in `core.tenants` | slug or uuid to seed |
| `--count` | `100` | number of synthetic employees |
| `--seed` | `42` | PRNG seed — same seed ⇒ identical data |

The seeder ([`scripts/seed.ts`](scripts/seed.ts)) is **idempotent**: it deletes the target
tenant's rows in all 12 tables, then inserts fresh data.

### Data strategy

- **Reference data — verbatim.** `norm_rules` (27), `violation_type_ref` (26), and
  `project_master` (15) are transcribed exactly from the ELC file
  ([`scripts/reference-data.ts`](scripts/reference-data.ts)); ARIA's rule engine depends on
  these being correct.
- **Employee data — generated.** `employee_master`, `resource_allocation`,
  `performance_by_project`, `timesheet`, and `violations` are produced by a **deterministic**
  generator (mulberry32 seeded per employee). Archetypes steer a realistic distribution of
  top performers, at-risk staff, overloaded/benched cases, and lateness/absence patterns.
- **Aggregates — derived.** `violation_summary`, `promotion_intent`, `salary_band`, and
  `performance_profile` (DS-08) are **computed from the raw rows above**, so every aggregated
  number is internally consistent with its source — the property ARIA's anti-hallucination
  guard re-verifies. (Verified: `violation_summary.open_cases` matches the raw open-violation
  count with 0 mismatches.)

> Note: employees are synthetic, so values for a given id (e.g. `EMP-031`) are realistic but
> do not reproduce the exact figures in the source PDF. Re-run with a different `--seed` for a
> fresh population, or raise `--count` for more volume.

### Row counts (default `--count=100`)

| Table | Rows | Table | Rows |
|---|---|---|---|
| `norm_rules` | 27 | `employee_master` | 100 |
| `violation_type_ref` | 26 | `resource_allocation` | 100 |
| `project_master` | 15 | `performance_by_project` | 200 |
| `violation_summary` | 100 | `timesheet` | 200 |
| `promotion_intent` | 100 | `violations` | ~200 (varies by seed) |
| `salary_band` | 100 | `performance_profile` | 100 |

Inspect in dev: `docker exec seta-ap-postgres-dev psql -U seta -d seta -c '\dt performance.*'`

## Public surface

- `@seta/performance` — application services (Node)
- `@seta/performance/events` — event type constants + zod payload schemas
- `@seta/performance/rbac` — permission constants
- `@seta/performance/contracts` — browser-safe DTOs + zod schemas
- `@seta/performance/register` — `ContributionRegistry` hook (Node)

## RBAC

Module permissions are declared as a typed `statement` in `src/rbac.ts` and built into a
`ModuleRbacManifest` via `toManifest(...)` from `@seta/shared-rbac`.

**Important:** the statement in `src/rbac.ts` is not the source of truth on its own — it must be
mirrored into `packages/shared-rbac/src/inventory.ts` (the `INVENTORY` array). The runtime
resolver, the `gen:rbac` codegen, and `@seta/identity` all build the permission registry from
`INVENTORY`. Until this module's permissions appear there, the aggregate parity test flags the
module — that guardrail is intentional.

After updating both files, run `pnpm gen:rbac` and add a per-module parity test (copy
`packages/knowledge/tests/unit/rbac-parity.test.ts`). See `packages/knowledge/src/rbac.ts` for a
complete example.
