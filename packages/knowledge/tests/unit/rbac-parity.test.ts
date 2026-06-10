import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { expect, it } from 'vitest';
import { knowledgeRbac } from '../../src/rbac.ts';

it('knowledge manifest matches its inventory slice', () => {
  const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'knowledge');
  expect(knowledgeRbac).toEqual(expected);
});
