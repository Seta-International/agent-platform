import { ApprovalCardSchema } from '@seta/copilot-sdk';
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
    draft: { title: 'New', description: '', skill_tags: [] },
    session: { tenantId: 'ten', userId: 'usr' },
    toolCallId: 'tc_1',
  };

  it('produces an ApprovalCardSchema-valid card with candidateList details', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'likely-dup', ...baseInput });
    const parsed = ApprovalCardSchema.parse(card);
    expect(parsed.details[0]?.kind).toBe('candidateList');
  });

  it('alternates include Related + Sub-task per candidate; no Comment', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'likely-dup', ...baseInput });
    const labels = card.alternates.map((a) => a.label);
    expect(labels.some((l) => l.startsWith('Related to'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Sub-task of'))).toBe(true);
    expect(labels.some((l) => l.includes('Comment'))).toBe(false);
  });

  it('primary action is create-new; decline is Cancel', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'likely-dup', ...baseInput });
    expect(card.primary.label).toBe('Create new anyway');
    expect(card.primary.argsPatch).toEqual({ action: 'create-new' });
    expect(card.decline.label).toBe('Cancel');
  });

  it('argsPatch for alternates encodes mode + existingId', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'likely-dup', ...baseInput });
    const related = card.alternates.find((a) => a.label.startsWith('Related to'));
    expect(related?.argsPatch).toEqual({
      action: 'link',
      existingId: baseInput.candidates[0]?.taskId,
      mode: 'related',
    });
    const sub = card.alternates.find((a) => a.label.startsWith('Sub-task of'));
    expect(sub?.argsPatch).toMatchObject({ mode: 'sub-task' });
  });

  it('uses softer headline for maybe-dup', () => {
    const card = buildConfirmNotDuplicateCard({ classification: 'maybe-dup', ...baseInput });
    expect(card.summary).toMatch(/might/);
  });
});
