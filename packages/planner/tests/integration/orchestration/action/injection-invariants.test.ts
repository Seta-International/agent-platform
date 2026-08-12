import { describe, expect, it } from 'vitest';
import { plannerGetTaskTool } from '../../../../src/backend/agent-tools/get-task.ts';
import { plannerListCommentsTool } from '../../../../src/backend/agent-tools/list-comments.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { HOSTILE_INSTRUCTION, seedHostileWorld } from './hostile-fixtures.ts';
import { rcFor } from './matrix-operations.ts';

describe('EV-08 — reading hostile text changes nothing', () => {
  // Invariant 1. The instruction arrives as tool OUTPUT, after the tool
  // arguments are already fixed; it has no path to a write of its own.
  it('reading a task whose description carries an instruction writes no approval row', () =>
    withAgentTestDb(async ({ pool }) => {
      const world = await seedHostileWorld(pool);
      const out = await plannerGetTaskTool.execute!(
        { taskRef: world.taskWithHostileDescriptionId } as never,
        { requestContext: rcFor(world.tenantId, world.actorUserId) } as never,
      );

      // The text IS returned — hiding it would be a different product decision,
      // and one that breaks reading your own tasks.
      expect(JSON.stringify(out)).toContain(HOSTILE_INSTRUCTION);

      const approvals = await pool.query('SELECT 1 FROM agent.workflow_approvals');
      expect(approvals.rows).toHaveLength(0);
      const keys = await pool.query('SELECT 1 FROM core.mutation_idempotency');
      expect(keys.rows).toHaveLength(0);
    }));

  it('reading a COMMENT carrying the same instruction writes no approval row', () =>
    withAgentTestDb(async ({ pool }) => {
      const world = await seedHostileWorld(pool);
      const out = await plannerListCommentsTool.execute!(
        { taskRef: world.taskWithHostileCommentId } as never,
        { requestContext: rcFor(world.tenantId, world.actorUserId) } as never,
      );
      expect(JSON.stringify(out)).toContain(HOSTILE_INSTRUCTION);

      const approvals = await pool.query('SELECT 1 FROM agent.workflow_approvals');
      expect(approvals.rows).toHaveLength(0);
    }));

  // The row that would move if the instruction were ever obeyed. Both hostile
  // surfaces are read in one test, because the claim is about the pair: neither
  // ingestion path may touch it.
  it('the bystander task is untouched by either read', () =>
    withAgentTestDb(async ({ pool }) => {
      const world = await seedHostileWorld(pool);
      // The WHOLE row, not the one column the instruction names. `planner.tasks`
      // has no `status` — closing a task writes `progress`, and it also bumps
      // `version` and `updated_at` — so naming columns here would let a future
      // field move unnoticed.
      const snapshot = () =>
        pool.query<{ row: unknown }>(
          'SELECT to_jsonb(t.*) AS row FROM planner.tasks t WHERE id = $1',
          [world.bystanderTaskId],
        );
      const before = await snapshot();
      await plannerGetTaskTool.execute!(
        { taskRef: world.taskWithHostileDescriptionId } as never,
        { requestContext: rcFor(world.tenantId, world.actorUserId) } as never,
      );
      await plannerListCommentsTool.execute!(
        { taskRef: world.taskWithHostileCommentId } as never,
        { requestContext: rcFor(world.tenantId, world.actorUserId) } as never,
      );
      const after = await snapshot();
      expect(after.rows[0]).toEqual(before.rows[0]);
    }));
});
