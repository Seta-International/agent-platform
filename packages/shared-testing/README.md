# @seta/shared-testing

Shared test utilities — Postgres testcontainers, schema bootstrap, and
per-test database isolation helpers. Tests run against a real
Postgres; no DB mocks. Containers are reused across the suite to keep
startup amortized.

## Exports

| Entry | Purpose |
|---|---|
| `@seta/shared-testing` | `withTestDb()`, `withTenant()`, container lifecycle, schema seeders |
