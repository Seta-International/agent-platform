import { describe, expect, it } from 'vitest';
import { mapPlanner403, PLANNER_403_LIMIT_MESSAGES } from '../../src/m365/plans/error-mapping.ts';

describe('mapPlanner403', () => {
  it('returns null for non-403 errors', () => {
    expect(mapPlanner403({ statusCode: 412, code: 'MaximumTasksInProject' })).toBeNull();
    expect(mapPlanner403({ statusCode: 500 })).toBeNull();
    expect(mapPlanner403({ statusCode: 429, code: 'Retry' })).toBeNull();
  });

  it('returns null for 403 without a code', () => {
    expect(mapPlanner403({ statusCode: 403 })).toBeNull();
  });

  it('returns null for non-error inputs', () => {
    expect(mapPlanner403(null)).toBeNull();
    expect(mapPlanner403(undefined)).toBeNull();
    expect(mapPlanner403('boom')).toBeNull();
  });

  it('maps every known limit code to its human string', () => {
    for (const [code, expected] of Object.entries(PLANNER_403_LIMIT_MESSAGES)) {
      expect(mapPlanner403({ statusCode: 403, code })).toBe(expected);
    }
  });

  it('falls back to a generic message for unknown limit codes', () => {
    expect(mapPlanner403({ statusCode: 403, code: 'SomethingNew' })).toBe(
      'Planner declined: SomethingNew',
    );
  });
});
