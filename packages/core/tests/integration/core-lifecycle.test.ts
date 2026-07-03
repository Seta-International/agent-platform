import { getLifecycleEntries, resetLifecycleRegistry } from '@seta/shared-db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContributionRegistry } from '../../src/composition/registry.ts';
import { registerCoreContributions } from '../../src/register.ts';

describe('core lifecycle registration', () => {
  beforeEach(() => {
    resetLifecycleRegistry();
  });

  it('registers events partition-drop and the processed-set trim', () => {
    registerCoreContributions(createContributionRegistry());

    const tables = getLifecycleEntries().map((e) => e.table);
    expect(tables).toContain('core.events');
    expect(tables).toContain('core.subscription_processed');
    expect(tables).toContain('core.subscription_dead_letter');
    expect(tables).toContain('core.rpc_idempotency');
    expect(tables).toContain('core.session_scope_cache');
  });
});
