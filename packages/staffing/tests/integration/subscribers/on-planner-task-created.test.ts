import { buildMastra } from '@seta/copilot/runtime';
import type { PlannerTaskCreated } from '@seta/planner/events';
import type { DomainEvent } from '@seta/shared-types';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { onPlannerTaskCreated } from '../../../src/backend/subscribers/on-planner-task-created.ts';
import { classifySkillsAgent } from '../../../src/backend/workflows/new-task-skill-tag/agents/classify-skills.ts';
import { registerNewTaskSkillTagWorkflow } from '../../../src/backend/workflows/new-task-skill-tag/index.ts';
import { withCopilotTestDb } from '../../helpers.ts';

function buildPlannerTaskCreatedEvent(opts: {
  tenant_id: string;
  task_id: string;
  group_id: string;
  created_by: string;
  event_id?: string;
}): DomainEvent<PlannerTaskCreated['payload']> {
  return {
    id: opts.event_id ?? crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId: opts.tenant_id,
    aggregateType: 'planner.task',
    aggregateId: opts.task_id,
    eventType: 'planner.task.created',
    eventVersion: 1,
    payload: {
      actor: { type: 'user', user_id: opts.created_by },
      group_id: opts.group_id,
      after: {
        task_id: opts.task_id,
        plan_id: crypto.randomUUID(),
        group_id: opts.group_id,
        bucket_id: null,
        title: 'Tune Postgres write throughput',
        description: 'Tail latency spikes',
        priority_number: 5,
        percent_complete: 0,
        is_deferred: false,
        preview_type: 'automatic',
        due_at: null,
        start_at: null,
        skill_tags: [],
        review_state: null,
        order_hint: 'a',
        assignee_priority: null,
        external_source: 'native',
        external_id: null,
        created_by: opts.created_by,
      },
    },
  };
}

async function runHandlerInTx(
  pool: Pool,
  fn: (tx: Parameters<typeof onPlannerTaskCreated>[2]['tx']) => Promise<void>,
): Promise<void> {
  const db = drizzle(pool);
  await db.transaction(async (tx) => {
    await fn(tx as unknown as Parameters<typeof onPlannerTaskCreated>[2]['tx']);
  });
}

async function waitForLifecycleFlush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 250));
}

describe('onPlannerTaskCreated subscriber', () => {
  it('starts a workflow run on planner.task.created', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      vi.spyOn(classifySkillsAgent, 'generate').mockResolvedValue({
        object: { requiredSkills: ['x'] },
        error: undefined,
      } as unknown as Awaited<ReturnType<typeof classifySkillsAgent.generate>>);

      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();
      registerNewTaskSkillTagWorkflow(mastra);
      await mastra.startWorkers();

      const event = buildPlannerTaskCreatedEvent({
        tenant_id: crypto.randomUUID(),
        task_id: crypto.randomUUID(),
        group_id: crypto.randomUUID(),
        created_by: crypto.randomUUID(),
      });

      await runHandlerInTx(pool, async (tx) => {
        await onPlannerTaskCreated({ mastra }, event, { tx });
      });

      await waitForLifecycleFlush();

      const runs = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM copilot.workflow_runs WHERE source_event_id = $1`,
        [event.id],
      );
      expect(runs.rows[0]?.n).toBe(1);
    });
  });

  it('is idempotent — second delivery of same event_id does not create a duplicate', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      vi.spyOn(classifySkillsAgent, 'generate').mockResolvedValue({
        object: { requiredSkills: ['x'] },
        error: undefined,
      } as unknown as Awaited<ReturnType<typeof classifySkillsAgent.generate>>);

      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();
      registerNewTaskSkillTagWorkflow(mastra);
      await mastra.startWorkers();

      const event = buildPlannerTaskCreatedEvent({
        tenant_id: crypto.randomUUID(),
        task_id: crypto.randomUUID(),
        group_id: crypto.randomUUID(),
        created_by: crypto.randomUUID(),
      });

      await runHandlerInTx(pool, async (tx) => {
        await onPlannerTaskCreated({ mastra }, event, { tx });
      });
      await waitForLifecycleFlush();

      await runHandlerInTx(pool, async (tx) => {
        await onPlannerTaskCreated({ mastra }, event, { tx });
      });
      await waitForLifecycleFlush();

      const runs = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM copilot.workflow_runs WHERE source_event_id = $1`,
        [event.id],
      );
      expect(runs.rows[0]?.n).toBe(1);
    });
  });
});
