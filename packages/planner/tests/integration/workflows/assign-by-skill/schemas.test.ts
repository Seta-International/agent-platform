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
        userIds: ['u1', 'u2'],
      }),
    ).toEqual({ kind: 'assigned', taskId: 't1', userIds: ['u1', 'u2'] });
    expect(AssignBySkillOutputSchema.parse({ kind: 'left-unassigned', taskId: 't1' })).toEqual({
      kind: 'left-unassigned',
      taskId: 't1',
    });
    expect(AssignBySkillOutputSchema.parse({ kind: 'declined' })).toEqual({ kind: 'declined' });
    // assigned requires at least one user
    expect(() =>
      AssignBySkillOutputSchema.parse({ kind: 'assigned', taskId: 't1', userIds: [] }),
    ).toThrow();
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
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(AssignDecisionSchema.parse({ action: 'assign', assigneeUserIds: [a] })).toEqual({
      action: 'assign',
      assigneeUserIds: [a],
    });
    expect(AssignDecisionSchema.parse({ action: 'assign', assigneeUserIds: [a, b] })).toEqual({
      action: 'assign',
      assigneeUserIds: [a, b],
    });
    expect(AssignDecisionSchema.parse({ action: 'leave-unassigned' })).toEqual({
      action: 'leave-unassigned',
    });
    expect(AssignDecisionSchema.parse({ action: 'decline' })).toEqual({ action: 'decline' });
    // empty assignee list is invalid — that's a 'leave-unassigned' decision instead
    expect(() => AssignDecisionSchema.parse({ action: 'assign', assigneeUserIds: [] })).toThrow();
    expect(() => AssignDecisionSchema.parse({ action: 'assign' })).toThrow();
  });
});
