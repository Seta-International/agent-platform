import { describe, expect, it } from 'vitest';
import { plannerAppManifest } from '../../src/manifest.ts';

describe('plannerAppManifest', () => {
  it('owns the /planner route namespace', () => {
    expect(plannerAppManifest.routeNamespace).toBe('/planner');
  });

  it('carries no feature-flag gate (product access supersedes)', () => {
    expect(plannerAppManifest.requiredFeature).toBeUndefined();
  });
});
