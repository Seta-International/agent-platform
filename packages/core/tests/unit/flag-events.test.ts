import { describe, expect, it } from 'vitest';
import {
  CORE_FEATURE_FLAG_EVENTS,
  CORE_FEATURE_FLAG_UPDATED,
  featureFlagUpdatedPayload,
} from '../../src/flags/events.ts';

describe('feature flag events', () => {
  it('registers the updated event with a nullable-tenant payload', () => {
    expect(CORE_FEATURE_FLAG_EVENTS[CORE_FEATURE_FLAG_UPDATED]).toBe(featureFlagUpdatedPayload);
    expect(featureFlagUpdatedPayload.parse({ tenant_id: null, key: 'hiring' })).toEqual({
      tenant_id: null,
      key: 'hiring',
    });
    expect(() => featureFlagUpdatedPayload.parse({ key: 'hiring' })).toThrow();
  });
});
