import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { plannerGetTaskTool } from '../../../../src/backend/agent-tools/get-task.ts';
import { plannerListCommentsTool } from '../../../../src/backend/agent-tools/list-comments.ts';
import {
  makeActionTaskLink,
  makeActionTaskRead,
} from '../../../../src/backend/orchestration/action/adapters.ts';
import { makeLinkTasksTool } from '../../../../src/backend/orchestration/action/link-tasks.tool.ts';
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

describe('EV-08 — an id quoted in text buys no access', () => {
  // The interesting case: the id is REAL. A refusal that only works because the
  // id does not exist proves nothing about authorisation.
  it('the quoted foreign task is unreadable even though the quoting task is not', () =>
    withAgentTestDb(async ({ pool }) => {
      const world = await seedHostileWorld(pool);
      // The actor really can read the task that quotes the id …
      const visible = await plannerGetTaskTool.execute!(
        { taskRef: world.taskWithForeignIdInTextId } as never,
        { requestContext: rcFor(world.tenantId, world.actorUserId) } as never,
      );
      expect(JSON.stringify(visible)).toContain(world.foreignTaskId);

      // … and still cannot reach the task it names. `TaskUpdatePort` has no
      // `readForUpdate`: the update path reads through `TaskReadPort.readMany`,
      // which RAISES rather than collapsing to null — the deliberate divergence
      // from the link and assign ports, which do collapse (FUT-805 AC3).
      await expect(
        makeActionTaskRead().readMany({
          tenantId: world.tenantId,
          actorUserId: world.actorUserId,
          taskIds: [world.foreignTaskId],
        }),
      ).rejects.toMatchObject({
        code: expect.stringMatching(/FORBIDDEN|NOT_FOUND|CROSS_TENANT/),
      });
    }));

  // The collapse the link tool makes on purpose: "cannot see it" and "does not
  // exist" must be indistinguishable, or the refusal itself is a membership
  // oracle.
  it('a real-but-forbidden id and a nonexistent id refuse identically', () =>
    withAgentTestDb(async ({ pool }) => {
      const world = await seedHostileWorld(pool);
      const port = makeActionTaskLink();
      const forbidden = await port.readEndpoint({
        tenantId: world.tenantId,
        actorUserId: world.actorUserId,
        taskId: world.foreignTaskId,
      });
      const missing = await port.readEndpoint({
        tenantId: world.tenantId,
        actorUserId: world.actorUserId,
        taskId: randomUUID(),
      });
      expect(forbidden).toEqual(missing);
      expect(forbidden).toBeNull();
    }));

  // End to end through a write tool: the hostile text names a target, and the
  // tool still refuses without leaving a card behind.
  it('a link call naming the foreign id refuses and writes no approval row', () =>
    withAgentTestDb(async ({ pool }) => {
      const world = await seedHostileWorld(pool);
      const tool = makeLinkTasksTool({
        ports: { taskLink: makeActionTaskLink() } as never,
        ctx: { tenantId: world.tenantId, actorUserId: world.actorUserId } as never,
      });
      const suspend = vi.fn(async () => {});
      await tool.execute!(
        {
          sourceTaskRef: world.taskWithForeignIdInTextId,
          targetTaskRef: world.foreignTaskId,
          kind: 'relates',
        } as never,
        {
          agent: { suspend, resumeData: undefined },
          requestContext: rcFor(world.tenantId, world.actorUserId),
        } as never,
      ).catch(() => undefined);
      expect(suspend).not.toHaveBeenCalled();
      const approvals = await pool.query('SELECT 1 FROM agent.workflow_approvals');
      expect(approvals.rows).toHaveLength(0);
    }));
});
