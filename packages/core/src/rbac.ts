import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';

export type { CorePermission } from './generated/rbac.ts';
export { CORE_PERMISSIONS } from './generated/rbac.ts';

// biome-ignore lint/style/noNonNullAssertion: 'core' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const coreRbac = inventoryToManifests(INVENTORY).find((m) => m.module === 'core')!;
