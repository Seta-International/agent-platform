import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { expect, it } from 'vitest';
import { notificationsRbac } from '../../src/rbac.ts';

it('notifications manifest matches its inventory slice', () => {
  const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'notifications');
  expect(notificationsRbac).toEqual(expected);
});
