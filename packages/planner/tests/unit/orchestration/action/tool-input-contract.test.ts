import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  AssignTaskToolInputSchema,
  CommentTaskToolInputSchema,
  CreateTaskToolInputSchema,
  LinkTasksToolInputSchema,
  MergeTasksToolInputSchema,
  UpdateTaskToolInputSchema,
} from '../../../../src/backend/orchestration/action/schemas.ts';

/**
 * The model-facing key set of every A2 write tool, pinned.
 *
 * This exists because of how FUT-840 Part 3 failed. `revisionOf` asked the model
 * to echo back an approval id the server had just injected, the model never did,
 * and no test could tell — every revision test passed the correct value itself.
 * The rule pinned here is the fix: the model is never asked for a server-owned
 * identifier. Adding a key is a design decision, so it should be a deliberate
 * edit to this list and not a silent schema change.
 */
const PINNED: Array<[string, z.ZodObject<z.ZodRawShape>, string[]]> = [
  [
    'planner_updateTask',
    UpdateTaskToolInputSchema,
    ['taskRefs', 'patch', 'dropFields', 'correction'],
  ],
  ['planner_assignTask', AssignTaskToolInputSchema, ['taskRef', 'assigneeRefs']],
  ['planner_commentTask', CommentTaskToolInputSchema, ['taskRef', 'body']],
  ['planner_linkTasks', LinkTasksToolInputSchema, ['sourceTaskRef', 'targetTaskRef', 'kind']],
  ['planner_mergeTasks', MergeTasksToolInputSchema, ['duplicateTaskRef', 'keepTaskRef']],
];

describe('A2 write-tool input schemas', () => {
  for (const [toolId, schema, keys] of PINNED) {
    it(`${toolId} exposes exactly its pinned keys`, () => {
      expect(Object.keys(schema.shape).sort()).toEqual([...keys].sort());
    });
  }

  it('no A2 tool asks the model for an approval id under any name', () => {
    const all = [...PINNED.map(([, s]) => s), CreateTaskToolInputSchema];
    const offenders = all.flatMap((schema) =>
      Object.keys(schema.shape).filter((k) => /approval|revisionof/i.test(k)),
    );
    expect(offenders).toEqual([]);
  });
});
