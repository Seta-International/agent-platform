import { describe, expect, it } from 'vitest';
import { ActionInputSchema } from '../../../../src/backend/orchestration/action/orchestrator.ts';
import {
  ActionResumeSchema,
  AssignTaskResumeSchema,
  AssignTaskToolInputSchema,
  BULK_TARGET_CAP,
  CommentTaskResumeSchema,
  CommentTaskToolInputSchema,
  CreateTaskResumeSchema,
  CreateTaskToolInputSchema,
  DOMAIN_FIELD_BY_TOOL_FIELD,
  LinkTasksResumeSchema,
  LinkTasksToolInputSchema,
  MergeTasksResumeSchema,
  MergeTasksToolInputSchema,
  OpenPreviewSchema,
  ToolPatchSchema,
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

describe('LinkTasksToolInputSchema', () => {
  it('takes two named refs and a kind', () => {
    const parsed = LinkTasksToolInputSchema.parse({
      sourceTaskRef: 'Alpha',
      targetTaskRef: 'Beta',
      kind: 'relates',
    });
    expect(parsed.kind).toBe('relates');
  });

  it('rejects a kind outside the three the table stores', () => {
    expect(() =>
      LinkTasksToolInputSchema.parse({
        sourceTaskRef: 'Alpha',
        targetTaskRef: 'Beta',
        kind: 'supersedes',
      }),
    ).toThrow();
  });
});

describe('the ActionResume union', () => {
  it('parses a link resume', () => {
    const parsed = ActionResumeSchema.parse({
      action: 'link',
      sourceTaskId: TASK_A,
      targetTaskId: TASK_B,
      kind: 'duplicates',
      idempotencyKey: 'k',
    });
    expect(parsed.action).toBe('link');
  });

  it('parses an update resume', () => {
    const parsed = ActionResumeSchema.parse({
      action: 'update',
      targets: [{ taskId: TASK_A, expectedVersion: 1 }],
      patch: { percent_complete: 100 },
      idempotencyKey: 'k',
    });
    expect(parsed.action).toBe('update');
  });

  // Each tool re-parses with its OWN schema, so an update payload must never be
  // accepted as a link and vice versa.
  it('does not let a link payload parse as an update', () => {
    expect(() =>
      UpdateTaskResumeSchema.parse({
        action: 'link',
        sourceTaskId: TASK_A,
        targetTaskId: TASK_B,
        kind: 'relates',
      }),
    ).toThrow();
  });

  it('does not let an update payload parse as a link', () => {
    expect(() =>
      LinkTasksResumeSchema.parse({
        action: 'update',
        targets: [{ taskId: TASK_A, expectedVersion: 1 }],
      }),
    ).toThrow();
  });
});

describe('MergeTasksToolInputSchema', () => {
  // The two arguments are NOT interchangeable — one of them gets trashed — so the
  // names carry the semantics and there is no positional pair to transpose.
  it('names which task dies and which survives', () => {
    const parsed = MergeTasksToolInputSchema.parse({
      duplicateTaskRef: 'Alpha',
      keepTaskRef: 'Beta',
    });
    expect(parsed).toEqual({ duplicateTaskRef: 'Alpha', keepTaskRef: 'Beta' });
  });

  it('rejects an unnamed pair', () => {
    expect(() => MergeTasksToolInputSchema.parse({ taskRefs: ['Alpha', 'Beta'] })).toThrow();
  });

  it('rejects a blank ref rather than resolving it later', () => {
    expect(() =>
      MergeTasksToolInputSchema.parse({ duplicateTaskRef: '  ', keepTaskRef: 'Beta' }),
    ).toThrow();
  });
});

describe('MergeTasksResumeSchema', () => {
  it('binds only the duplicate’s version — the keeper is not modified', () => {
    const parsed = MergeTasksResumeSchema.parse({
      action: 'merge',
      duplicateTaskId: TASK_A,
      duplicateExpectedVersion: 3,
      keepTaskId: TASK_B,
      idempotencyKey: 'k',
    });
    expect(parsed.duplicateExpectedVersion).toBe(3);
    expect(parsed).not.toHaveProperty('keepExpectedVersion');
  });

  it('rejects a keeper version, so nobody adds one back by accident', () => {
    expect(() =>
      MergeTasksResumeSchema.parse({
        action: 'merge',
        duplicateTaskId: TASK_A,
        duplicateExpectedVersion: 3,
        keepTaskId: TASK_B,
        keepExpectedVersion: 1,
        idempotencyKey: 'k',
      }),
    ).toThrow();
  });

  it('joins the ActionResume union', () => {
    const parsed = ActionResumeSchema.parse({
      action: 'merge',
      duplicateTaskId: TASK_A,
      duplicateExpectedVersion: 3,
      keepTaskId: TASK_B,
      idempotencyKey: 'k',
    });
    expect(parsed.action).toBe('merge');
  });
});

describe('AssignTaskToolInputSchema', () => {
  it('takes a task ref and one or more people', () => {
    const parsed = AssignTaskToolInputSchema.parse({
      taskRef: 'Deploy hiring screen',
      assigneeRefs: ['Tuấn', 'Alice'],
    });
    expect(parsed.assigneeRefs).toEqual(['Tuấn', 'Alice']);
  });

  it('refuses an empty assignee list — unassigning everyone is not this tool', () => {
    expect(() => AssignTaskToolInputSchema.parse({ taskRef: TASK_A, assigneeRefs: [] })).toThrow();
  });

  it('refuses more than ten people in one call', () => {
    expect(() =>
      AssignTaskToolInputSchema.parse({
        taskRef: TASK_A,
        assigneeRefs: Array.from({ length: 11 }, (_, i) => `p${i}`),
      }),
    ).toThrow();
  });
});

describe('AssignTaskResumeSchema', () => {
  it('parses the card\u2019s assign payload', () => {
    const parsed = AssignTaskResumeSchema.parse({
      action: 'assign',
      taskId: TASK_A,
      assigneeUserIds: ['u1'],
      idempotencyKey: 'k',
    });
    expect(parsed.action).toBe('assign');
  });

  // .strict() is what stops a client-supplied field creeping back in.
  it('refuses an unknown field', () => {
    expect(() =>
      AssignTaskResumeSchema.parse({
        action: 'assign',
        taskId: TASK_A,
        assigneeUserIds: ['u1'],
        idempotencyKey: 'k',
        overrideUserIds: ['u2'],
      }),
    ).toThrow();
  });

  it('does not let an update payload parse as an assign', () => {
    expect(() =>
      AssignTaskResumeSchema.parse({
        action: 'update',
        targets: [{ taskId: TASK_A, expectedVersion: 1 }],
      }),
    ).toThrow();
  });
});

describe('CreateTaskToolInputSchema', () => {
  it('takes a plan ref and a title, and nothing else is required', () => {
    const parsed = CreateTaskToolInputSchema.parse({
      planRef: 'Sprint 32',
      title: 'Deploy hiring screen',
    });
    expect(parsed).toEqual({ planRef: 'Sprint 32', title: 'Deploy hiring screen' });
  });

  it('accepts the optional fields the card previews', () => {
    const parsed = CreateTaskToolInputSchema.parse({
      planRef: 'Sprint 32',
      title: 'Deploy hiring screen',
      description: 'behind the flag',
      dueAt: '2026-08-14',
      startAt: '2026-08-12',
      priority: 'urgent',
      labels: ['infra', 'hiring'],
    });
    expect(parsed.priority).toBe('urgent');
    expect(parsed.labels).toEqual(['infra', 'hiring']);
  });

  // D8: each of these is a change the card would have to preview and the user
  // would have to reason about on top of the task itself.
  it.each(['bucketRef', 'assigneeRefs', 'status'])('refuses %s', (field) => {
    expect(() =>
      CreateTaskToolInputSchema.parse({
        planRef: 'Sprint 32',
        title: 'Deploy hiring screen',
        [field]: 'anything',
      }),
    ).toThrow();
  });

  it('refuses a priority that is not one of the four words', () => {
    expect(() =>
      CreateTaskToolInputSchema.parse({ planRef: 'p', title: 't', priority: 3 }),
    ).toThrow();
  });

  it('refuses an empty title and one over 280 characters', () => {
    expect(() => CreateTaskToolInputSchema.parse({ planRef: 'p', title: '' })).toThrow();
    expect(() =>
      CreateTaskToolInputSchema.parse({ planRef: 'p', title: 'x'.repeat(281) }),
    ).toThrow();
  });
});

describe('CreateTaskResumeSchema', () => {
  it('parses the create branch', () => {
    const parsed = CreateTaskResumeSchema.parse({
      action: 'create',
      planId: TASK_A,
      draft: { title: 'Deploy hiring screen' },
      idempotencyKey: 'k',
    });
    expect(parsed.action).toBe('create');
  });

  it('parses the use_existing branch', () => {
    const parsed = CreateTaskResumeSchema.parse({
      action: 'use_existing',
      existingTaskId: TASK_A,
      idempotencyKey: 'k',
    });
    expect(parsed.action).toBe('use_existing');
  });

  it('refuses an unknown field', () => {
    expect(() =>
      CreateTaskResumeSchema.parse({ action: 'decline', overrideUserIds: ['u'] }),
    ).toThrow();
  });
});

describe('CommentTaskToolInputSchema', () => {
  it('takes a task ref and a body', () => {
    const parsed = CommentTaskToolInputSchema.parse({
      taskRef: TASK_A,
      body: 'Blocked on the vendor key.',
    });
    expect(parsed.body).toBe('Blocked on the vendor key.');
  });

  it('refuses an empty body and one past the domain limit', () => {
    expect(() => CommentTaskToolInputSchema.parse({ taskRef: TASK_A, body: '' })).toThrow();
    expect(() =>
      CommentTaskToolInputSchema.parse({ taskRef: TASK_A, body: 'x'.repeat(4001) }),
    ).toThrow();
  });

  it('refuses a mentions field — the tool posts text, nothing else', () => {
    expect(() =>
      CommentTaskToolInputSchema.parse({ taskRef: TASK_A, body: 'hi', mentions: ['u1'] }),
    ).toThrow();
  });
});

describe('CommentTaskResumeSchema', () => {
  it('parses the comment payload', () => {
    const parsed = CommentTaskResumeSchema.parse({
      action: 'comment',
      taskId: TASK_A,
      body: 'Blocked on the vendor key.',
      idempotencyKey: 'k',
    });
    expect(parsed.action).toBe('comment');
  });

  it('refuses an unknown field', () => {
    expect(() =>
      CommentTaskResumeSchema.parse({
        action: 'comment',
        taskId: TASK_A,
        body: 'x',
        idempotencyKey: 'k',
        authorUserId: 'someone-else',
      }),
    ).toThrow();
  });
});

describe('adjusting a preview: correction and dropFields (FUT-840)', () => {
  const UUID = '7f3a1c2e-1111-4222-8333-444455556666';

  it('update accepts correction alongside a dropFields list', () => {
    const parsed = UpdateTaskToolInputSchema.parse({
      taskRefs: [TASK_A],
      patch: { dueAt: '2026-08-21' },
      dropFields: ['priority'],
      correction: true,
    });
    expect(parsed.correction).toBe(true);
    expect(parsed.dropFields).toEqual(['priority']);
  });

  it('leaves correction undefined when absent — the user is ADDING, not narrowing', () => {
    const parsed = UpdateTaskToolInputSchema.parse({
      taskRefs: [TASK_A],
      patch: { dueAt: '2026-08-21' },
    });
    expect(parsed.correction).toBeUndefined();
    expect(parsed.dropFields).toBeUndefined();
  });

  it.each([
    [
      'assign',
      () =>
        AssignTaskToolInputSchema.parse({ taskRef: 't', assigneeRefs: ['a'], revisionOf: UUID }),
    ],
    [
      'create',
      () => CreateTaskToolInputSchema.parse({ planRef: 'p', title: 'x', revisionOf: UUID }),
    ],
    [
      'link',
      () =>
        LinkTasksToolInputSchema.parse({
          sourceTaskRef: 'a',
          targetTaskRef: 'b',
          kind: 'relates',
          revisionOf: UUID,
        }),
    ],
    [
      'merge',
      () =>
        MergeTasksToolInputSchema.parse({
          duplicateTaskRef: 'a',
          keepTaskRef: 'b',
          revisionOf: UUID,
        }),
    ],
    [
      'comment',
      () => CommentTaskToolInputSchema.parse({ taskRef: 't', body: 'hi', revisionOf: UUID }),
    ],
  ])('%s REJECTS revisionOf — the model is never asked for an approval id', (_name, parse) => {
    // Design D20 replaced D15: the server decides which preview a turn adjusts, so
    // the field is gone from the model's surface entirely. These schemas are
    // .strict(), so a model reaching for the removed field fails loudly rather
    // than being silently ignored.
    expect(parse).toThrow();
  });

  it.each([
    [
      'assign',
      () =>
        AssignTaskToolInputSchema.parse({ taskRef: 't', assigneeRefs: ['a'], dropFields: ['x'] }),
    ],
    [
      'link',
      () =>
        LinkTasksToolInputSchema.parse({
          sourceTaskRef: 'a',
          targetTaskRef: 'b',
          kind: 'relates',
          dropFields: ['x'],
        }),
    ],
    [
      'merge',
      () =>
        MergeTasksToolInputSchema.parse({
          duplicateTaskRef: 'a',
          keepTaskRef: 'b',
          dropFields: ['x'],
        }),
    ],
    [
      'comment',
      () => CommentTaskToolInputSchema.parse({ taskRef: 't', body: 'hi', dropFields: ['x'] }),
    ],
  ])('%s REJECTS dropFields — it has nothing droppable', (_name, parse) => {
    // These four schemas are .strict(). An inert parameter would invite the model
    // to pass it and get silence; failing loudly is the FUT-840 reading of D17.
    expect(parse).toThrow();
  });

  it('create accepts dropFields, since its draft has optional fields', () => {
    expect(
      CreateTaskToolInputSchema.parse({ planRef: 'p', title: 'x', dropFields: ['priority'] })
        .dropFields,
    ).toEqual(['priority']);
  });
});

describe('DOMAIN_FIELD_BY_TOOL_FIELD (FUT-840 design D17)', () => {
  it('maps every field the model may name onto the key the persisted patch uses', () => {
    expect(DOMAIN_FIELD_BY_TOOL_FIELD).toEqual({
      title: 'title',
      description: 'description',
      dueAt: 'due_at',
      startAt: 'start_at',
      priority: 'priority_number',
      status: 'percent_complete',
    });
  });

  it('covers exactly the keys ToolPatchSchema accepts, so no field is undroppable', () => {
    expect(Object.keys(DOMAIN_FIELD_BY_TOOL_FIELD).sort()).toEqual(
      Object.keys(ToolPatchSchema.shape).sort(),
    );
  });
});

describe('OpenPreviewSchema (FUT-840)', () => {
  it('carries the approval id, the tool, and the rows the user is looking at', () => {
    const parsed = OpenPreviewSchema.parse({
      approvalId: '7f3a1c2e-1111-4222-8333-444455556666',
      toolId: 'planner_updateTask',
      intent: 'Update "Deploy API"',
      taskIds: [TASK_A],
      proposedRows: [{ k: 'Due', v: '12 Aug 2026 → 21 Aug 2026' }],
    });
    expect(parsed.toolId).toBe('planner_updateTask');
    expect(parsed.proposedRows).toHaveLength(1);
    // The server matches these against the tasks the turn resolved (design D20).
    expect(parsed.taskIds).toEqual([TASK_A]);
  });

  it('is nullish on ActionInputSchema — most turns have no preview open', () => {
    const parsed = ActionInputSchema.parse({ userText: 'hi', taskId: null });
    expect(parsed.openPreview).toBeUndefined();
  });
});
