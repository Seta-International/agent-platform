import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';

export type { NotificationsPermission } from './generated/rbac.ts';
export { NOTIFICATIONS_PERMISSIONS } from './generated/rbac.ts';

// biome-ignore lint/style/noNonNullAssertion: 'notifications' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const notificationsRbac = inventoryToManifests(INVENTORY).find(
  (m) => m.module === 'notifications',
)!;
