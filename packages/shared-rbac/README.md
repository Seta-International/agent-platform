# @seta/shared-rbac

Pure role and permission primitives — the role catalog, permission
constants, and the capability resolution function. No I/O, no
dependencies beyond TypeScript. Consumed by `@seta/identity` (binding
roles to users) and every module's request handlers (checking
capabilities).

## Exports

| Entry | Purpose |
|---|---|
| `@seta/shared-rbac` | Role enum, permission constants, `can(role, permission)` |
