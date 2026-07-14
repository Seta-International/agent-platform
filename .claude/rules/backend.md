---
paths:
  - "packages/*/src/backend/**"
  - "packages/*/src/events/**"
  - "packages/*/drizzle.config.ts"
  - "packages/*/drizzle/**"
---

# Backend & data rules

## Schema isolation (CI-gated)

- **No cross-schema SQL** — `pnpm lint:raw-sql` rejects `FROM <other_module>.` / `JOIN <other_module>.` outside `packages/core/src/{audit,events}/`.
- Each `drizzle.config.ts` pins `schemaFilter: ['<module>']`; cross-schema reads fail at codegen. Schemas: `agent`, `core`, `identity`, `planner`, `notifications`, `staffing`, etc.

## Migrations (CLI only)

`pnpm --filter @seta/<module> db:generate`, then `pnpm db:migrate`. Never hand-edit or edit committed files under `drizzle/`; write a new numbered one. **Exception** — SQL that Drizzle can't model (partitioning, deferred-constraint triggers, `pg_notify` wiring, partitioned indexes) is hand-written alongside generated files, first line a comment naming the limitation. The runner walks lexically; both formats coexist.

## Events (the bus is the outbox)

- State change + event row commit in one transaction via `core.emit()` inside `withEmit(session, ...)`. `LISTEN/NOTIFY` wakes subscribers; the 2s poll covers dropped notifies. Audit lives in `core.events` alongside domain events.
- **Subscribers must be idempotent**, keyed on `event_id` — at-least-once delivery, per-aggregate ordering only.

## Inspect the DB (dev)

`docker exec seta-ap-postgres-dev psql -U seta -d seta -c '<SQL>'` (Postgres is also at `localhost:5542`).
