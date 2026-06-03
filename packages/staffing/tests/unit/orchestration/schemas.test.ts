import { describe, expect, it } from 'vitest';
import {
  AvailabilityResultSchema,
  RankedCandidateSchema,
  RecommendationSchema,
  SkillRequirementSchema,
  TaskSummarySchema,
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
        availabilityScore: 0.5,
      }),
    ).toThrow();
  });
  it('Recommendation carries skillMatch + status + availabilityScore', () => {
    const r = RecommendationSchema.parse({
      userId: 'u1',
      name: 'A',
      skillMatch: ['x'],
      skillMatchCount: 1,
      status: 'available',
      availabilityScore: 0.5,
    });
    expect(r.skillMatch).toEqual(['x']);
    expect(r.availabilityScore).toBe(0.5);
  });
  it('SkillRequirement accepts an optional tasks list (find_tasks result)', () => {
    const r = SkillRequirementSchema.parse({
      actionable: false,
      skills: [],
      tasks: [
        {
          taskId: 't1',
          title: 'Provision cluster',
          status: 'not_started',
          skillTags: ['infrastructure'],
        },
      ],
    });
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks![0]!.status).toBe('not_started');
  });

  it('TaskSummary rejects an invalid status', () => {
    expect(() =>
      TaskSummarySchema.parse({ taskId: 't1', title: 'x', status: 'nope', skillTags: [] }),
    ).toThrow();
  });
});
