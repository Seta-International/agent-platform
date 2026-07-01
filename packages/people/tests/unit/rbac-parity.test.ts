import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { expect, it } from 'vitest';
import { peopleRbac } from '../../src/rbac.ts';

it('people manifest matches its inventory slice', () => {
  const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'people');
  expect(peopleRbac).toEqual(expected);
});

it('people.strategic has people.worker.read.all; people.viewer does not', () => {
  const strategic = peopleRbac.roles.find((r) => r.slug === 'people.strategic');
  const viewer = peopleRbac.roles.find((r) => r.slug === 'people.viewer');
  expect(strategic!.permissions).toContain('people.worker.read.all');
  expect(viewer!.permissions).not.toContain('people.worker.read.all');
});
