import { describe, expect, it } from 'vitest';
import { plannerAppManifest } from '../../src/manifest.ts';

describe('plannerAppManifest', () => {
  it('owns the /planner route namespace', () => {
    expect(plannerAppManifest.routeNamespace).toBe('/planner');
  });

  it('gates visibility on the planner feature flag', () => {
    expect(plannerAppManifest.requiredFeature).toBe('planner');
  });
});
