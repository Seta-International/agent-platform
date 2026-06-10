import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { expect, it } from 'vitest';
import { identityRbac } from '../../src/rbac.ts';

it('identity manifest matches its inventory slice', () => {
  const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'identity');
  expect(identityRbac).toEqual(expected);
});
