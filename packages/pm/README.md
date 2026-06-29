# @seta/pm

> TODO: one-paragraph description of the pm module — what domain it owns and what surface it exposes.

## Public surface

- `@seta/pm` — application services (Node)
- `@seta/pm/events` — event type constants + zod payload schemas
- `@seta/pm/rbac` — permission constants
- `@seta/pm/contracts` — browser-safe DTOs + zod schemas
- `@seta/pm/register` — `ContributionRegistry` hook (Node)

## Events emitted

_(none yet)_

## Events consumed

_(none yet)_

## RBAC

Module permissions are declared as a typed `statement` in `src/rbac.ts` and built into a `ModuleRbacManifest` via `toManifest(...)` from `@seta/shared-rbac`.

**Important:** the statement in `src/rbac.ts` is not the source of truth on its own — it must be mirrored into `packages/shared-rbac/src/inventory.ts` (the `INVENTORY` array). The runtime resolver, the `gen:rbac` codegen, and `@seta/identity` all build the permission registry from `INVENTORY` via `inventoryToManifests(INVENTORY)`. Until this module's permissions appear in `INVENTORY`, the aggregate parity test (`apps/server/tests/unit/rbac-registry-parity.test.ts`) will flag the module — that guardrail is intentional.

After updating both files (keep resources, actions, role permissions, and role descriptions identical):

1. Run `pnpm gen:rbac` to regenerate the `PermissionKey` union in `packages/shared-rbac/src/generated/`.
2. Add a per-module parity test — copy `packages/knowledge/tests/unit/rbac-parity.test.ts` as a starting point.

See `packages/knowledge/src/rbac.ts` for a complete example.
