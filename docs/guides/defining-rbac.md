# Defining RBAC for a module

How to author roles, permissions, and scopes. The conceptual model is in [`docs/platform/rbac.md`](../platform/rbac.md); this is the recipe. The single authoring step is editing `packages/shared-rbac/src/inventory.ts` and running `pnpm gen:rbac`; everything else is compiler-verified.

## The one decision that matters

Before adding anything, classify what you're expressing:

```
Is it a VERB (can they do the action at all)?      → a permission     module.resource.action
Is it WHICH ROWS (they can do it, but only some)?  → a scope          on the assignment, not the string
Is it a PROCESS STANCE (a workflow step/role)?     → a workflow verb  and maybe a domain role
```

The classic mistake is encoding scope into the permission string (`...read.self`, `...read.tenant`). **Don't.** Scope is `tenant | org_unit | self` on the *assignment*, plus relationship arms in the scope-builder. A permission is a global verb.

## Naming rules

**Permissions** — `module.resource.action`; resource is snake_case and may contain dots; action is from the closed set:

| Family | Verbs |
|---|---|
| data | `read` `create` `update` `delete` — `manage` expands to all four at build |
| config | `configure` (module settings only) |
| workflow | imperative domain verbs: `submit` `approve` `reject` `close` `run` `cancel` `grant` `revoke` `use` … |

No scope suffixes. No past tense. No `write`/`edit`/`provision` — use `update`/`create`.

**Roles** — the ladder, tiers skippable: `<module>.admin` → `<module>.manager` → `<module>.member` → `<module>.viewer`. Add a **domain role beside the ladder** only for a workflow stance (`hiring.recruiter`, `pm.pmo`, `pm.bod`) — never for "own records only" (that's `self` scope). Foundation roles (`org.admin`, `tenant.admin`, `org.viewer`) and system actors (`system.<integration>`) are not module-authored.

## Steps to add RBAC to a new module

### 1. Declare the statement + roles in `inventory.ts`

```ts
// statement: resource → allowed actions
'timesheet.entry': ['read', 'create', 'update', 'delete'],
'timesheet.report': ['read'],
// roles: slug → permission list (ladder + any domain roles)
'timesheet.manager': ['timesheet.entry.read', 'timesheet.report.read', ...],
'timesheet.member':  ['timesheet.entry.read', 'timesheet.entry.create', 'timesheet.entry.update'],
'timesheet.viewer':  ['timesheet.entry.read'],
```

If a verb is new to the closed set, it must be justified — the set is deliberately closed. New verbs need a hand-edit to `shared-rbac/inventory.ts` before `gen:rbac`.

### 2. Regenerate + let the compiler find every site

```
pnpm gen:rbac && pnpm typecheck
```

`gen:rbac` emits `packages/timesheet/src/generated/rbac.ts` (typed permission keys + role slugs) and the shared `PermissionKey` union. Import from the generated file; never hand-maintain a second copy.

### 3. Gate every entry point

```ts
requirePermission(session, 'timesheet.entry.create');   // throws if not held
```

### 4. Write the `ScopePlan` + scope-builder

Copy the shape from `packages/pm/src/backend/domain/scope.ts`. A plan declares, per resource, which column is the org_unit, which is the self/owner, and any **relationship arms** (domain-derived reach) as null-safe SQL fragments:

```ts
import {
  decisionPredicate, getDefaultRegistry, IMPLICIT_PERMISSIONS,
  resolveScope, type ScopePlan, scopeDecision,
} from '@seta/shared-rbac';
import { type SQL, sql } from 'drizzle-orm';
import { entry } from '../db/schema.ts';

function decide(session: SessionScope, permission: string, plan: ScopePlan): SQL | null {
  const scope = resolveScope(
    getDefaultRegistry(), session.assignments, IMPLICIT_PERMISSIONS, permission,
  );
  return decisionPredicate(
    scopeDecision(scope, plan, { userId: session.user_id, tenantId: session.tenant_id }),
  );
}

// SECURITY-CRITICAL. null → tenant-wide (no filter); otherwise a predicate; deny → sql`false`.
export function buildEntryScope(session: SessionScope): SQL | null {
  const w = session.worker_id;
  return decide(session, 'timesheet.entry.read', {
    orgUnit: { column: entry.org_unit_id },              // org_unit reach
    self: { column: entry.worker_id },                   // self scope → own rows
    relationships: [                                     // domain-derived reach, null-safe
      () => (w ? sql`${entry.manager_worker_id} = ${w}` : null),
    ],
  });
}
```

Rules that keep this fail-closed:
- **Every relationship arm is null-safe on `session.worker_id`** — a scoped viewer with no worker link and no org reach must resolve to `sql\`false\``, not match everything.
- Modules scoping by org unit store a local `org_unit_id` column (uuid, no FK) set at create/edit.

### 5. Wire the predicate into every repository read

List/read functions take a `ScopeDecision` (or its `SQL | null` predicate) — **not optional**; unscoped queries must be unrepresentable. AND it after the tenant filter:

```ts
const conds = [tenantScoped(entry.tenant_id, session)];
const scope = buildEntryScope(session);
if (scope) conds.push(scope);
```

Point checks (mutations, agent tools) reuse the same plan as an `EXISTS` guard. Invisible rows return **NOT_FOUND**, never FORBIDDEN.

### 6. Seed grants + personas

Persona groups grant a role at a scope: `timesheet.manager @ org_unit:delivery-a`. Add to `apps/cli/src/commands/lib/access-groups.ts` (persona defs) and, where relevant, `seed-fixture/rbac-map.ts`. Scoped assignments on top of groups are allowed as exceptions.

### 7. Tests (scope-conformance)

Use the kit's shared conformance harness: given the plan + seeded fixtures, assert the exact row set for each scope kind. Cover **tenant / org_unit / self / deny / cross-tenant / inactive-relationship** cases. Real Postgres via testcontainers — no DB mocks. Write the failing test first.

## Worked example — timesheet

A timesheet module needs: members log their own entries; a delivery-group manager sees and edits their group's entries; finance sees all.

- **Permissions:** `timesheet.entry.[read|create|update|delete]`, `timesheet.report.read`.
- **Roles:** `timesheet.member` (own entries), `timesheet.manager` (entries + report), `timesheet.viewer`.
- **Scope:** members hold `timesheet.member @ self`; a delivery manager holds `timesheet.manager @ org_unit:delivery-a`; finance holds `timesheet.viewer @ tenant`. No new "own-only" role — `self` scope carries it. The manager's reach comes from the org_unit assignment (subtree) plus an optional `manager_worker_id` relationship arm.

## What NOT to do

- ❌ scope suffixes on permission strings (`...read.self`, `...read.tenant`)
- ❌ a role tier that means "own records only" — use `self` scope
- ❌ module-local role slugs or a second `src/rbac.ts` outside the inventory
- ❌ an optional/absent `ScopeDecision` on a list query (unscoped = leak)
- ❌ a second `tenantScoped` copy — use the one in `@seta/shared-rbac`
- ❌ a relationship arm that isn't null-safe on `session.worker_id`
