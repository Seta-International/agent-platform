import { describe, expect, it } from 'vitest';
import {
  DedupOutputSchema,
  LinkModeSchema,
  TaskDraftSchema,
} from '../../../../src/backend/workflows/dedup-on-create/schemas.ts';

describe('dedup schemas', () => {
  it('LinkMode accepts comment | related | sub-task', () => {
    expect(LinkModeSchema.parse('comment')).toBe('comment');
    expect(LinkModeSchema.parse('related')).toBe('related');
    expect(LinkModeSchema.parse('sub-task')).toBe('sub-task');
    expect(() => LinkModeSchema.parse('merge')).toThrow();
  });

  it('TaskDraft requires title', () => {
    expect(() => TaskDraftSchema.parse({ description: 'x' })).toThrow();
    const ok = TaskDraftSchema.parse({ title: 'hello' });
    expect(ok.title).toBe('hello');
    expect(ok.skill_tags).toEqual([]);
    expect(ok.description).toBe('');
  });

  it('TaskDraft trims whitespace and rejects empty title', () => {
    expect(() => TaskDraftSchema.parse({ title: '   ' })).toThrow();
  });

  it('DedupOutput is a discriminated union over kind', () => {
    expect(DedupOutputSchema.parse({ kind: 'created', taskId: 't1' })).toEqual({
      kind: 'created',
      taskId: 't1',
    });
    expect(
      DedupOutputSchema.parse({ kind: 'linked', existingId: 'e1', mode: 'comment' }),
    ).toMatchObject({ kind: 'linked', existingId: 'e1', mode: 'comment' });
    expect(DedupOutputSchema.parse({ kind: 'cancelled' })).toEqual({ kind: 'cancelled' });
    expect(() => DedupOutputSchema.parse({ kind: 'created' })).toThrow();
  });
});
