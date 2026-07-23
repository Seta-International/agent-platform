import { describe, expect, it } from 'vitest';
import { navIdFromPath } from '../../src/nav/performance-path.ts';

describe('navIdFromPath', () => {
  it('maps Performance section paths', () => {
    expect(navIdFromPath('/people/performance')).toBe('dashboard');
    expect(navIdFromPath('/people/performance/')).toBe('dashboard');
    expect(navIdFromPath('/people/performance/scoring')).toBe('scoring');
    expect(navIdFromPath('/people/performance/self-assessment')).toBe('self-assessment');
    expect(navIdFromPath('/people/performance/unknown')).toBeNull();
  });
});
