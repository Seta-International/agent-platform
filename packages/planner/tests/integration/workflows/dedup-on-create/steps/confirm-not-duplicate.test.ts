import { ApprovalCardSchema } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { buildConfirmNotDuplicateCard } from '../../../../../src/backend/workflows/dedup-on-create/steps/confirm-not-duplicate.ts';

describe('buildConfirmNotDuplicateCard', () => {
  const baseInput = {
    candidates: [
      {
        taskId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        title: 'Existing',
        score: 0.92,
        status: 'open',
      },
    ],
    task: {
      taskId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      title: 'New',
      description: '',
      plan_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    },
    session: { tenantId: 'ten', userId: 'usr' },
    toolCallId: 'tc_1',
  };

  it('produces an ApprovalCardSchema-valid card with candidateList details', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'likely-dup', ...baseInput });
    const parsed = ApprovalCardSchema.parse(card);
    expect(parsed.details[0]?.kind).toBe('candidateList');
  });

  it('alternates include "Link to" per candidate and "Delete this ticket" is decline', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'likely-dup', ...baseInput });
    const labels = card.alternates.map((a) => a.label);
    expect(labels.some((l) => l.startsWith('Link to'))).toBe(true);
    expect(card.decline.label).toBe('Delete this ticket');
  });

  it('primary action is "Leave it"; decline is "Delete this ticket"', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'likely-dup', ...baseInput });
    expect(card.primary.label).toBe('Leave it');
    expect(card.primary.argsPatch).toEqual({ kind: 'leave' });
    expect(card.decline.label).toBe('Delete this ticket');
  });

  it('argsPatch for "Link to" encodes kind + existingId', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'likely-dup', ...baseInput });
    const link = card.alternates.find((a) => a.label.startsWith('Link to'));
    expect(link?.argsPatch).toEqual({
      kind: 'link',
      existingId: baseInput.candidates[0]?.taskId,
    });
  });

  it('uses softer headline for maybe-dup', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'maybe-dup', ...baseInput });
    expect(card.summary).toMatch(/might/);
  });
});
