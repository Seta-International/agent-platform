import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { expect, it } from 'vitest';
import { PEOPLE_PERMISSIONS, peopleRbac } from '../../src/rbac.ts';

it('people manifest matches its inventory slice', () => {
  const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'people');
  expect(peopleRbac).toEqual(expected);
});

it('exposes the portal_access.set permission', () => {
  expect(PEOPLE_PERMISSIONS).toContain('people.worker.portal_access.set');
});
