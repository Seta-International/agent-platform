import { FakeEmbeddingProvider } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  buildDraftText,
  embedDraft,
} from '../../../../../src/backend/workflows/dedup-on-create/steps/embed-draft.ts';
import { normalizeDraft } from '../../../../../src/backend/workflows/dedup-on-create/steps/normalize-draft.ts';

describe('normalize-draft', () => {
  it('trims and collapses internal whitespace', () => {
    const out = normalizeDraft({ title: '  Fix   login  ', description: '   bug\n\nhere   ' });
    expect(out.title).toBe('Fix login');
    expect(out.description).toBe('bug here');
    expect(out.skill_tags).toEqual([]);
  });

  it('preserves provided skill_tags + plan_id', () => {
    const planId = '00000000-0000-4000-8000-000000000001';
    const out = normalizeDraft({
      title: 'task',
      skill_tags: ['auth', 'frontend'],
      plan_id: planId,
    });
    expect(out.skill_tags).toEqual(['auth', 'frontend']);
    expect(out.plan_id).toBe(planId);
  });

  it('rejects whitespace-only title', () => {
    expect(() => normalizeDraft({ title: '   ' })).toThrow();
  });
});

describe('embed-draft', () => {
  it('joins title, description, and skill_tags as the embed text', () => {
    const text = buildDraftText({
      title: 'Fix login',
      description: 'OAuth loops',
      skill_tags: ['auth', 'safari'],
    });
    expect(text).toBe('Fix login\n\nOAuth loops\n\nauth, safari');
  });

  it('returns a vector of the provider dimensions length', async () => {
    const provider = new FakeEmbeddingProvider({ dimensions: 1536 });
    const v = await embedDraft(
      {
        title: 'Fix login redirect on Safari',
        description: 'OAuth flow loops',
        skill_tags: ['auth'],
      },
      { provider },
    );
    expect(v).toHaveLength(1536);
  });

  it('is deterministic for the same draft', async () => {
    const provider = new FakeEmbeddingProvider();
    const draft = { title: 'same', description: '', skill_tags: [] };
    const a = await embedDraft(draft, { provider });
    const b = await embedDraft(draft, { provider });
    expect(a).toEqual(b);
  });
});
