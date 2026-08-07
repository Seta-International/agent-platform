import { describe, expect, it } from 'vitest';
import {
  BULK_TARGET_CAP,
  UpdateTaskResumeSchema,
  UpdateTaskToolInputSchema,
} from '../../../../src/backend/orchestration/action/schemas.ts';

const TASK_A = '66be2be2-394d-4184-b106-c412289fd1e1';
const TASK_B = '9f1d3a10-2b44-4c55-8d66-ee7788990011';

describe('UpdateTaskToolInputSchema', () => {
  it('accepts a single ref', () => {
    const parsed = UpdateTaskToolInputSchema.parse({
      taskRefs: [TASK_A],
      patch: { status: 'completed' },
    });
    expect(parsed.taskRefs).toEqual([TASK_A]);
  });

  it('rejects an empty list — there is nothing to preview', () => {
    expect(() => UpdateTaskToolInputSchema.parse({ taskRefs: [], patch: {} })).toThrow();
  });

  // The load-bearing one. With `.max(20)` on the schema, 25 refs become a Zod
  // error the model reads and works around by splitting the request into two
  // batches — exactly what FUT-818's AC forbids. The tool refuses instead.
  it("does NOT bound the list at the cap — the refusal is the tool's, not Zod's", () => {
    const many = Array.from({ length: BULK_TARGET_CAP + 5 }, (_, i) => `${TASK_A}-${i}`);
    const parsed = UpdateTaskToolInputSchema.parse({
      taskRefs: many,
      patch: { status: 'completed' },
    });
    expect(parsed.taskRefs).toHaveLength(BULK_TARGET_CAP + 5);
  });

  it('pins the cap at 20', () => {
    expect(BULK_TARGET_CAP).toBe(20);
  });
});

describe('UpdateTaskResumeSchema', () => {
  it('carries one target per task, each with its own expected version', () => {
    const parsed = UpdateTaskResumeSchema.parse({
      action: 'update',
      targets: [
        { taskId: TASK_A, expectedVersion: 4 },
        { taskId: TASK_B, expectedVersion: 9 },
      ],
      patch: { percent_complete: 100 },
      idempotencyKey: 'key-1',
    });
    expect(parsed.targets).toHaveLength(2);
  });

  // FUT-804's flat shape is gone. Free to break: no update card has ever been
  // persisted in production, so nothing can arrive in the old shape.
  it('rejects the old flat taskId/expectedVersion shape', () => {
    expect(() =>
      UpdateTaskResumeSchema.parse({
        action: 'update',
        taskId: TASK_A,
        expectedVersion: 4,
        patch: { percent_complete: 100 },
        idempotencyKey: 'key-1',
      }),
    ).toThrow();
  });

  it('rejects an action this tool does not own', () => {
    expect(() =>
      UpdateTaskResumeSchema.parse({
        action: 'merge',
        targets: [{ taskId: TASK_A, expectedVersion: 4 }],
      }),
    ).toThrow();
  });
});
