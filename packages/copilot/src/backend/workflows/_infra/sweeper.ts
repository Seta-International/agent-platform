import type { Mastra } from '@mastra/core';
import type { AnyWorkflow } from '@mastra/core/workflows';
import type { Pool } from 'pg';

export interface SweepDeps {
  pool: Pool;
  mastra: Mastra;
  batchSize?: number;
  log?: {
    error: (obj: unknown, msg?: string) => void;
  };
}

export interface SweepResult {
  expired: number;
}

interface ExpiredRow {
  approval_id: string;
  run_id: string;
  step_id: string;
  workflow_id: string;
  tenant_id: string;
}

export async function sweepWorkflowApprovals(deps: SweepDeps): Promise<SweepResult> {
  const batchSize = deps.batchSize ?? 100;
  const client = await deps.pool.connect();
  let claimed: ExpiredRow[] = [];
  try {
    await client.query('BEGIN');
    const res = await client.query<ExpiredRow>(
      `SELECT a.approval_id, a.run_id, a.step_id, r.workflow_id, r.tenant_id
         FROM copilot.workflow_approvals a
         JOIN copilot.workflow_runs r ON r.run_id = a.run_id
        WHERE a.status = 'pending' AND a.expires_at < now()
        ORDER BY a.expires_at ASC
        LIMIT $1
        FOR UPDATE OF a SKIP LOCKED`,
      [batchSize],
    );
    claimed = res.rows;

    for (const row of claimed) {
      const decisionPayload = { decision: 'timeout' };
      await client.query(
        `UPDATE copilot.workflow_approvals
            SET status = 'expired',
                decision_payload = $2::jsonb,
                decided_at = now()
          WHERE approval_id = $1`,
        [row.approval_id, JSON.stringify(decisionPayload)],
      );
      const outboxPayload = {
        approval_id: row.approval_id,
        decision: 'timeout',
        decided_at: new Date().toISOString(),
      };
      await client.query(
        `INSERT INTO core.events
           (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload)
         VALUES (gen_random_uuid(), $1, 'workflow_run', $2,
                 'copilot.workflow.approval.decided', 1, $3::jsonb)`,
        [row.tenant_id, row.run_id, JSON.stringify(outboxPayload)],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  for (const row of claimed) {
    let workflow: AnyWorkflow;
    try {
      workflow = deps.mastra.getWorkflow(row.workflow_id as never);
    } catch {
      // Workflow no longer registered — projection state is correct; nothing to resume.
      continue;
    }
    const run = await workflow.createRun({ runId: row.run_id });
    try {
      await run.resume({ step: row.step_id, resumeData: { decision: 'timeout' } });
    } catch (err) {
      if (deps.log) {
        deps.log.error(
          {
            subsystem: 'copilot.workflow.sweeper',
            runId: row.run_id,
            tenantId: row.tenant_id,
            err,
          },
          'sweeper resume failed',
        );
      } else {
        console.error('[copilot.workflow.sweeper.resume]', row.run_id, err);
      }
      // Continue sweeping the rest — the resume-retry job (Task 22) reconciles.
    }
  }

  return { expired: claimed.length };
}
