import type { Mastra } from '@mastra/core';
import type { AnyWorkflow } from '@mastra/core/workflows';
import type { Pool } from 'pg';

const STUCK_THRESHOLD_MS = 2 * 60 * 1000;
const MAX_RETRIES = 3;
const BATCH_SIZE = 50;

export interface ResumeRetryDeps {
  pool: Pool;
  mastra: Mastra;
}

export interface ResumeRetryResult {
  retried: number;
}

interface StuckRow {
  approval_id: string;
  run_id: string;
  step_id: string;
  workflow_id: string;
  tenant_id: string;
  decision_payload: Record<string, unknown>;
  retry_count: number;
}

export async function resumeRetry(deps: ResumeRetryDeps): Promise<ResumeRetryResult> {
  const stuck = await deps.pool.query<StuckRow>(
    `SELECT a.approval_id, a.run_id, a.step_id, r.workflow_id, r.tenant_id,
            a.decision_payload,
            COALESCE((a.decision_payload->>'retry_count')::int, 0) AS retry_count
       FROM copilot.workflow_approvals a
       JOIN copilot.workflow_runs r ON r.run_id = a.run_id
      WHERE a.status IN ('approved','rejected','modified')
        AND r.status = 'paused'
        AND a.decided_at < now() - ($1::int * interval '1 millisecond')
        AND COALESCE((a.decision_payload->>'retry_count')::int, 0) < $2
      LIMIT $3`,
    [STUCK_THRESHOLD_MS, MAX_RETRIES, BATCH_SIZE],
  );

  let retried = 0;
  for (const row of stuck.rows) {
    let workflow: AnyWorkflow | null = null;
    try {
      workflow = deps.mastra.getWorkflow(row.workflow_id as never) as AnyWorkflow;
    } catch {
      // Workflow no longer registered — projection state is correct; nothing to resume.
      continue;
    }
    const run = await workflow.createRun({ runId: row.run_id });

    try {
      await run.resume({
        step: row.step_id,
        resumeData: row.decision_payload,
      });
      retried++;
    } catch (err) {
      const nextRetry = row.retry_count + 1;
      if (nextRetry >= MAX_RETRIES) {
        await deps.pool.query(
          `UPDATE copilot.workflow_runs
              SET status = 'failed',
                  finished_at = now(),
                  error_summary = 'resume_failed: ' || $2
            WHERE run_id = $1`,
          [row.run_id, String(err)],
        );
      } else {
        const nextPayload = { ...row.decision_payload, retry_count: nextRetry };
        await deps.pool.query(
          `UPDATE copilot.workflow_approvals
              SET decision_payload = $2::jsonb
            WHERE approval_id = $1`,
          [row.approval_id, JSON.stringify(nextPayload)],
        );
      }
    }
  }
  return { retried };
}
