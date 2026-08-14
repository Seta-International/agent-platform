import { describe, expect, it } from 'vitest';
import { navIdFromPath } from '../../src/nav/performance-path.ts';

describe('navIdFromPath', () => {
  it('maps Performance section paths to top-tab ids', () => {
    expect(navIdFromPath('/people/performance')).toBe('reviews');
    expect(navIdFromPath('/people/performance/')).toBe('reviews');
    expect(navIdFromPath('/people/performance/configuration')).toBe('configuration');
    expect(navIdFromPath('/people/performance/cycle')).toBe('cycle');
    expect(navIdFromPath('/people/performance/scoring')).toBeNull();
    expect(navIdFromPath('/people/performance/unknown')).toBeNull();
  });
});
