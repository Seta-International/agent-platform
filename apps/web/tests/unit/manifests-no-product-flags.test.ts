import { peopleAppManifest } from '@seta/web-people';
import { plannerAppManifest } from '@seta/web-planner';
import { pmAppManifest } from '@seta/web-pm';
import { describe, expect, it } from 'vitest';

describe('product manifests have no feature-flag gate', () => {
  it('drops requiredFeature on product apps', () => {
    for (const m of [peopleAppManifest, pmAppManifest, plannerAppManifest])
      expect(m.requiredFeature).toBeUndefined();
  });
});
