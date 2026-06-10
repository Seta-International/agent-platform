import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { expect, it } from 'vitest';
import { staffingRbac } from '../../src/rbac.ts';

it('staffing manifest matches its inventory slice', () => {
  const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'staffing');
  expect(staffingRbac).toEqual(expected);
});
