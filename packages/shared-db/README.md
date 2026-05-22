# @seta/shared-db

Shared Postgres + Drizzle primitives — pool factory, schema-scoped
client helpers, and the migration runner. Each module owns its own
Drizzle config with `schemaFilter: ['<module>']` so generated SQL
never crosses schema boundaries.

## Exports

| Entry | Purpose |
|---|---|
| `@seta/shared-db` | `createPool()`, `createClient()`, migration runner, transaction helpers |
