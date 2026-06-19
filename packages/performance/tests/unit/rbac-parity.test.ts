import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { expect, it } from 'vitest';
import { performanceRbac } from '../../src/rbac.ts';

it('performance manifest matches its inventory slice', () => {
  const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'performance');
  expect(performanceRbac).toEqual(expected);
});
