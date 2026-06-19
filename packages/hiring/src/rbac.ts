import { type Statement, toManifest } from '@seta/shared-rbac';

// TODO(rbac): These permissions MUST also be added to the single source of truth,
// packages/shared-rbac/src/inventory.ts (the INVENTORY array). The runtime resolver,
// the gen:rbac codegen, and identity all build from INVENTORY; this module statement
// is parity-checked against its INVENTORY slice. After editing BOTH (keep them
// identical — same resources, actions, role permissions, and role descriptions),
// run `pnpm gen:rbac` and add a parity test (copy packages/knowledge/tests/unit/rbac-parity.test.ts).
// See packages/knowledge/src/rbac.ts for a complete example.
export const hiringStatement = {
  'hiring.example': ['read'],
} as const satisfies Statement;

const roleStatements = {
  'hiring.viewer': { 'hiring.example': ['read'] },
} as const satisfies Record<string, Statement>;

export const hiringRbac = toManifest('hiring', hiringStatement, roleStatements, {
  'hiring.viewer': 'Read-only access',
});

export type HiringPermission = (typeof hiringRbac.permissions)[number]['key'];
