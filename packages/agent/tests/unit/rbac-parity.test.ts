import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { agentRbac } from '../../src/rbac.ts';

describe('agent rbac parity', () => {
  it('agent manifest matches its inventory slice', () => {
    const expected = inventoryToManifests(INVENTORY).find((m) => m.module === 'agent');
    expect(agentRbac).toEqual(expected);
  });
});
