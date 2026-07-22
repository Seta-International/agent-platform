import { describe, expect, it } from 'vitest';
import { extractContextPrefix } from '../../../src/backend/orchestration/orchestrator.ts';

describe('extractContextPrefix', () => {
  it('recovers a task-context prefix verbatim from the user text', () => {
    const id = '00000000-ffff-4000-8000-000000000007';
    expect(
      extractContextPrefix({
        userText: `[Context: planner.task#${id}] Tell me about this task`,
        taskId: null,
      }),
    ).toBe(`[Context: planner.task#${id}]`);
  });

  it('recovers a board-context prefix as well', () => {
    expect(
      extractContextPrefix({ userText: '[Context: planner.board#abc] state?', taskId: null }),
    ).toBe('[Context: planner.board#abc]');
  });

  it('falls back to the structured taskId channel when no prefix is inlined', () => {
    expect(extractContextPrefix({ userText: 'Tell me about this task', taskId: 't-1' })).toBe(
      '[Context: planner.task#t-1]',
    );
  });

  it('prefers the inlined prefix over the taskId fallback', () => {
    expect(
      extractContextPrefix({ userText: '[Context: planner.task#real] x', taskId: 'other' }),
    ).toBe('[Context: planner.task#real]');
  });

  it('returns undefined when there is neither a prefix nor a taskId', () => {
    expect(
      extractContextPrefix({ userText: 'How many open tasks?', taskId: null }),
    ).toBeUndefined();
  });
});
