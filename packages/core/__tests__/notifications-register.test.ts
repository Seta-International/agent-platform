import { describe, expect, it } from 'vitest';
import { createContributionRegistry } from '../src/composition/registry.ts';
import { registerCoreContributions } from '../src/register.ts';

describe('registerCoreContributions', () => {
  it('registers the core.notifier.deliver subscriber', () => {
    const reg = createContributionRegistry();
    registerCoreContributions(reg);
    const subs = Array.from(reg.collected.subscribers);
    const names = subs.map((s) => s.subscription);
    expect(names).toContain('core.notifier.deliver');
  });
});
