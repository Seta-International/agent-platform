import { describe, expect, it } from 'vitest';
import {
  AssignBySkillOutputSchema,
  AssignDecisionSchema,
  CandidateUserSchema,
} from '../../../../src/backend/workflows/assign-by-skill/schemas.ts';

describe('assign-by-skill schemas', () => {
  it('output is a union of assigned / left-unassigned / declined', () => {
    expect(
      AssignBySkillOutputSchema.parse({
        kind: 'assigned',
        taskId: 't1',
        userId: 'u1',
      }),
    ).toEqual({ kind: 'assigned', taskId: 't1', userId: 'u1' });
    expect(AssignBySkillOutputSchema.parse({ kind: 'left-unassigned', taskId: 't1' })).toEqual({
      kind: 'left-unassigned',
      taskId: 't1',
    });
    expect(AssignBySkillOutputSchema.parse({ kind: 'declined' })).toEqual({ kind: 'declined' });
  });

  it('candidate finalScore must be in [0, 1]', () => {
    expect(() =>
      CandidateUserSchema.parse({
        userId: 'u',
        displayName: 'A',
        skills: [],
        exactOverlap: 0,
        vectorScore: null,
        historyScore: null,
        historyMatches: 0,
        openTaskCount: null,
        hoursAvailableThisWeek: null,
        timezone: null,
        finalScore: 1.5,
      }),
    ).toThrow();
  });

  it('decision accepts assign / leave-unassigned / decline', () => {
    expect(
      AssignDecisionSchema.parse({ action: 'assign', assigneeUserId: crypto.randomUUID() }),
    ).toMatchObject({ action: 'assign' });
    expect(AssignDecisionSchema.parse({ action: 'leave-unassigned' })).toEqual({
      action: 'leave-unassigned',
    });
    expect(AssignDecisionSchema.parse({ action: 'decline' })).toEqual({ action: 'decline' });
    expect(() => AssignDecisionSchema.parse({ action: 'assign' })).toThrow();
  });
});
