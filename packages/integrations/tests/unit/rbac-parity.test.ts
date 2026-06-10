import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { expect, it } from 'vitest';
import { integrationsRbac } from '../../src/rbac.ts';

it('integrations manifest matches its inventory slice', () => {
  const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'integrations');
  expect(integrationsRbac).toEqual(expected);
});
