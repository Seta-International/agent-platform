import { describe, expect, it } from 'vitest';
import {
  AvailabilityResultSchema,
  RankedCandidateSchema,
  RecommendationSchema,
  SkillRequirementSchema,
} from '../../../src/backend/orchestration/schemas.ts';

describe('orchestration schemas', () => {
  it('SkillRequirement defaults skills to []', () => {
    const r = SkillRequirementSchema.parse({
      actionable: false,
      message: 'not a staffing request',
    });
    expect(r.skills).toEqual([]);
  });
  it('RankedCandidate requires skillMatchCount + rank', () => {
    const c = RankedCandidateSchema.parse({
      userId: 'u1',
      name: 'A',
      skills: ['x'],
      role: null,
      skillMatchCount: 1,
      rank: 1,
    });
    expect(c.rank).toBe(1);
  });
  it('AvailabilityResult constrains status enum', () => {
    expect(() =>
      AvailabilityResultSchema.parse({
        userId: 'u1',
        name: null,
        status: 'nope',
        inProgressCount: 0,
      }),
    ).toThrow();
  });
  it('Recommendation carries skillMatch + status', () => {
    const r = RecommendationSchema.parse({
      userId: 'u1',
      name: 'A',
      skillMatch: ['x'],
      skillMatchCount: 1,
      status: 'available',
    });
    expect(r.skillMatch).toEqual(['x']);
  });
});
