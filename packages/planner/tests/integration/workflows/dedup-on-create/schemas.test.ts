import { describe, expect, it } from 'vitest';
import {
  DedupOutputSchema,
  DupActionSchema,
  LinkModeSchema,
  TaskDraftSchema,
} from '../../../../src/backend/workflows/dedup-on-create/schemas.ts';

describe('dedup schemas', () => {
  it('LinkMode accepts related | sub-task', () => {
    expect(LinkModeSchema.parse('related')).toBe('related');
    expect(LinkModeSchema.parse('sub-task')).toBe('sub-task');
    expect(() => LinkModeSchema.parse('comment')).toThrow();
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
    expect(DedupOutputSchema.parse({ kind: 'kept', taskId: 't1' })).toEqual({
      kind: 'kept',
      taskId: 't1',
    });
    expect(DedupOutputSchema.parse({ kind: 'linked', taskId: 't1', linkedTo: 'e1' })).toMatchObject(
      { kind: 'linked', taskId: 't1', linkedTo: 'e1' },
    );
    expect(DedupOutputSchema.parse({ kind: 'deleted', taskId: 't1' })).toMatchObject({
      kind: 'deleted',
      taskId: 't1',
    });
    expect(DedupOutputSchema.parse({ kind: 'workflow-started', runId: 'r1' })).toEqual({
      kind: 'workflow-started',
      runId: 'r1',
    });
    // 'kept' requires taskId
    expect(() => DedupOutputSchema.parse({ kind: 'kept' })).toThrow();
    // Old kinds no longer valid
    expect(() => DedupOutputSchema.parse({ kind: 'created', taskId: 't1' })).toThrow();
    expect(() => DedupOutputSchema.parse({ kind: 'cancelled' })).toThrow();
  });

  it('DupAction is a discriminated union: link / delete / leave', () => {
    expect(DupActionSchema.parse({ kind: 'leave' })).toEqual({ kind: 'leave' });
    expect(DupActionSchema.parse({ kind: 'delete' })).toEqual({ kind: 'delete' });
    expect(
      DupActionSchema.parse({ kind: 'link', existingId: '00000000-0000-0000-0000-000000000000' }),
    ).toMatchObject({ kind: 'link', existingId: '00000000-0000-0000-0000-000000000000' });
    expect(() => DupActionSchema.parse({ kind: 'create-new' })).toThrow();
    expect(() => DupActionSchema.parse({ kind: 'cancel' })).toThrow();
  });
});
