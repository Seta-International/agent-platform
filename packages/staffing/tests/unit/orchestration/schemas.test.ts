import { describe, expect, it } from 'vitest';
import {
  AvailabilityResultSchema,
  OrchestratorResultSchema,
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
          labels: ['infrastructure'],
        },
      ],
    });
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks![0]!.status).toBe('not_started');
  });

  it('TaskSummary rejects an invalid status', () => {
    expect(() =>
      TaskSummarySchema.parse({ taskId: 't1', title: 'x', status: 'nope', labels: [] }),
    ).toThrow();
  });

  it('OrchestratorResult accepts candidates (people-search terminal)', () => {
    const r = OrchestratorResultSchema.parse({
      candidates: [
        {
          userId: 'u1',
          name: 'A',
          skills: ['aws', 'docker'],
          role: 'Backend Dev',
          skillMatchCount: 2,
          rank: 1,
        },
      ],
    });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates![0]!.skillMatchCount).toBe(2);
  });

  it('OrchestratorResult accepts pendingApproval (HITL card recorded; inThread defaults true)', () => {
    const r = OrchestratorResultSchema.parse({
      recommendations: [],
      pendingApproval: { approvalId: 'ap1', taskId: 't-1' },
    });
    expect(r.pendingApproval).toEqual({ approvalId: 'ap1', taskId: 't-1', inThread: true });
  });
});
