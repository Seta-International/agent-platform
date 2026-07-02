import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';

export type { HiringPermission } from './generated/rbac.ts';
export { HIRING_PERMISSIONS } from './generated/rbac.ts';

// biome-ignore lint/style/noNonNullAssertion: 'hiring' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const hiringRbac = inventoryToManifests(INVENTORY).find((m) => m.module === 'hiring')!;
