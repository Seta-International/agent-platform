import { createContributionRegistry } from '@seta/core';
import { describe, expect, it } from 'vitest';
import { registerPeopleContributions } from '../../src/register.ts';

describe('registerPeopleContributions', () => {
  it('registers the people module with a subscriber list', () => {
    const reg = createContributionRegistry();
    registerPeopleContributions(reg);
    const snap = reg.collected;
    expect(snap.schemas.has('people')).toBe(true);
    expect(Array.isArray(snap.subscribers)).toBe(true);
    expect(snap.eventsByModule.get('people')).toBeDefined();
  });
});
