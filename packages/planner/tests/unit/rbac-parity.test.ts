import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { plannerRbac } from '../../src/rbac.ts';

describe('planner rbac parity', () => {
  it('planner manifest matches its inventory slice', () => {
    const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'planner');
    expect(plannerRbac).toEqual(expected);
  });
});
