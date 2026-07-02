import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';

export type { PeoplePermission } from './generated/rbac.ts';
export { PEOPLE_PERMISSIONS } from './generated/rbac.ts';

// biome-ignore lint/style/noNonNullAssertion: 'people' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const peopleRbac = inventoryToManifests(INVENTORY).find((m) => m.module === 'people')!;
