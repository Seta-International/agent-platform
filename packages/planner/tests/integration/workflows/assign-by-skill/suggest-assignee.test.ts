import { ApprovalCardSchema } from '@seta/copilot-sdk';
import { describe, expect, it } from 'vitest';
import type { CandidateUser } from '../../../../src/backend/workflows/assign-by-skill/schemas.ts';
import { buildSuggestAssigneeCard } from '../../../../src/backend/workflows/assign-by-skill/steps/suggest-assignee.ts';

function makeCandidate(
  over: Partial<CandidateUser> & { userId: string; displayName: string },
): CandidateUser {
  return {
    skills: [],
    exactOverlap: 0,
    vectorScore: null,
    historyScore: null,
    historyMatches: 0,
    openTaskCount: null,
    hoursAvailableThisWeek: null,
    timezone: null,
    finalScore: 0.5,
    ...over,
  };
}

describe('buildSuggestAssigneeCard', () => {
  it('primary = top candidate, alternates = rest, decline = Leave unassigned', () => {
    const card = buildSuggestAssigneeCard({
      taskId: 't1',
      taskTitle: 'Fix login',
      candidates: [
        makeCandidate({
          userId: 'u1',
          displayName: 'Alice',
          skills: ['react'],
          exactOverlap: 2,
          vectorScore: 0.8,
          openTaskCount: 3,
          hoursAvailableThisWeek: 12,
          timezone: 'UTC',
          finalScore: 0.85,
        }),
        makeCandidate({
          userId: 'u2',
          displayName: 'Bob',
          skills: ['react'],
          exactOverlap: 2,
          vectorScore: 0.7,
          openTaskCount: 7,
          hoursAvailableThisWeek: 5,
          timezone: 'UTC',
          finalScore: 0.65,
        }),
      ],
      session: { tenantId: 't', userId: 'u' },
      toolCallId: 'tc_1',
    });

    expect(ApprovalCardSchema.parse(card)).toBeTruthy();
    expect(card.primary.argsPatch).toEqual({ assigneeUserId: 'u1' });
    expect(card.alternates[0]!.argsPatch).toEqual({ assigneeUserId: 'u2' });
    expect(card.decline.label).toBe('Leave unassigned');
    expect(card.summary).toContain('Alice');
    expect(card.details[0]!.kind).toBe('candidateList');
  });

  it('surfaces history-match count in the secondary line', () => {
    const card = buildSuggestAssigneeCard({
      taskId: 't1',
      taskTitle: 'Rust deep dive',
      candidates: [
        makeCandidate({
          userId: 'u1',
          displayName: 'Veteran',
          historyScore: 0.9,
          historyMatches: 4,
          finalScore: 0.8,
        }),
      ],
      session: { tenantId: 't', userId: 'u' },
      toolCallId: 'tc_2',
    });
    const block = card.details[0];
    if (!block || block.kind !== 'candidateList') throw new Error('expected candidateList block');
    expect(block.items[0]!.secondary).toContain('history: 4 similar');
  });

  it('empty pool yields no-candidates copy and an empty alternates list', () => {
    const card = buildSuggestAssigneeCard({
      taskId: 't1',
      taskTitle: 'Cold start',
      candidates: [],
      session: { tenantId: 't', userId: 'u' },
      toolCallId: 'tc_3',
    });
    expect(ApprovalCardSchema.parse(card)).toBeTruthy();
    expect(card.alternates).toEqual([]);
    expect(card.summary).toMatch(/No candidates/i);
  });
});
