import { randomUUID } from 'node:crypto';
import type { TrustEnvelope } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { AgentRunStateRepository } from '../../src/backend/orchestration/run-state-repository.ts';
import { withAgentTestDb } from '../helpers.ts';

function trust(score: number): TrustEnvelope {
  return {
    reasoningTrace: [
      { step: 'analyze', detail: 'considered candidates', at: new Date().toISOString() },
    ],
    evidenceCitations: [{ kind: 'task', id: 't1', score }],
    confidenceScore: score,
  };
}

describe('AgentRunStateRepository', () => {
  it('creates a run, records step traces, reads back state, and cascades on delete', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const repo = new AgentRunStateRepository();
      const runId = randomUUID();
      const tenantId = randomUUID();
      const actorUserId = randomUUID();
      const input = { userText: 'assign the AWS task', taskId: randomUUID() };

      await repo.createRun({
        runId,
        orchestrationId: 'planner.assignment-orchestrator',
        tenantId,
        actorUserId,
        input,
      });

      await repo.saveStep({
        runId,
        stepId: 'analyze',
        agentId: 'planner.task-analyzer',
        output: { analyzed: true },
        trust: trust(0.42),
      });
      await repo.saveStep({
        runId,
        stepId: 'recommend',
        agentId: 'planner.recommender',
        output: { pick: 'alice' },
        trust: trust(0.9),
      });

      const loaded = await repo.loadRun(runId);
      expect(loaded.status).toBe('running');
      expect(loaded.input).toEqual(input);
      expect(loaded.state.runId).toBe(runId);
      expect(loaded.state.orchestrationId).toBe('planner.assignment-orchestrator');
      expect(loaded.state.outputs).toEqual({
        analyze: { analyzed: true },
        recommend: { pick: 'alice' },
      });

      // Idempotent re-save of the same step is a no-op (does not clobber state).
      await repo.saveStep({
        runId,
        stepId: 'analyze',
        agentId: 'planner.task-analyzer',
        output: { analyzed: 'DIFFERENT' },
        trust: trust(0.1),
      });
      const reloaded = await repo.loadRun(runId);
      expect(reloaded.state.outputs.analyze).toEqual({ analyzed: true });

      const stepCount = await pool.query(
        `SELECT count(*)::int AS n FROM agent.workflow_run_steps WHERE run_id = $1`,
        [runId],
      );
      expect(stepCount.rows[0]?.n).toBe(2);

      await repo.completeRun(runId, { result: 'assigned' });
      const done = await pool.query<{ status: string; result: unknown }>(
        `SELECT status, result FROM agent.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(done.rows[0]?.status).toBe('success');
      expect(done.rows[0]?.result).toEqual({ result: 'assigned' });

      // ON DELETE CASCADE: deleting the run removes its step traces.
      await pool.query(`DELETE FROM agent.workflow_runs WHERE run_id = $1`, [runId]);
      const afterDelete = await pool.query(
        `SELECT count(*)::int AS n FROM agent.workflow_run_steps WHERE run_id = $1`,
        [runId],
      );
      expect(afterDelete.rows[0]?.n).toBe(0);
    });
  });

  it('records a failed run with the error summary', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const repo = new AgentRunStateRepository();
      const runId = randomUUID();
      await repo.createRun({
        runId,
        orchestrationId: 'planner.assignment-orchestrator',
        tenantId: randomUUID(),
        actorUserId: randomUUID(),
        input: { userText: 'x', taskId: null },
      });

      await repo.failRun(runId, 'no candidate found');
      const row = await pool.query<{ status: string; error_summary: string }>(
        `SELECT status, error_summary FROM agent.workflow_runs WHERE run_id = $1`,
        [runId],
      );
      expect(row.rows[0]?.status).toBe('failed');
      expect(row.rows[0]?.error_summary).toBe('no candidate found');
    });
  });
});
