import { EMPTY_TRUST } from '@seta/agent-sdk';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  orchestrationRuns,
  orchestrationStepTrace,
  staffingDb,
} from '../../../src/backend/db/index.ts';
import { StaffingRunStateRepository } from '../../../src/backend/orchestration/run-state-repository.ts';
import { withAgentTestDb } from '../../helpers.ts';

const RUN = '00000000-0000-4000-8000-0000000000a1';
const TENANT = '00000000-0000-4000-8000-0000000000b1';
const ACTOR = '00000000-0000-4000-8000-0000000000c1';

describe('StaffingRunStateRepository', () => {
  it('creates a run, loads it, saves a step (trace + state), and completes', async () => {
    await withAgentTestDb(async () => {
      const repo = new StaffingRunStateRepository();

      await repo.createRun({
        runId: RUN,
        orchestrationId: 'staffing.assigneeRecommendation',
        tenantId: TENANT,
        actorUserId: ACTOR,
        input: { taskId: 'task-1' },
      });

      let rec = await repo.loadRun(RUN);
      expect(rec.status).toBe('running');
      expect(rec.input).toEqual({ taskId: 'task-1' });
      expect(rec.state.outputs).toEqual({});

      await repo.saveStep({
        runId: RUN,
        stepId: 'analyze',
        agentId: 'staffing.analyzer',
        output: { skills: ['terraform'] },
        trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.75 },
      });

      rec = await repo.loadRun(RUN);
      expect(rec.state.outputs.analyze).toEqual({ skills: ['terraform'] });

      const traces = await staffingDb()
        .select()
        .from(orchestrationStepTrace)
        .where(eq(orchestrationStepTrace.run_id, RUN));
      expect(traces).toHaveLength(1);
      expect(traces[0]!.confidence_score).toBe('0.750'); // numeric -> string

      await repo.completeRun(RUN, { recommendations: [] });
      rec = await repo.loadRun(RUN);
      expect(rec.status).toBe('completed');

      const [row] = await staffingDb()
        .select()
        .from(orchestrationRuns)
        .where(eq(orchestrationRuns.run_id, RUN));
      expect(row!.result).toEqual({ recommendations: [] });
      expect(row!.finished_at).not.toBeNull();
    });
  });

  it('saveStep is idempotent on (runId, stepId)', async () => {
    await withAgentTestDb(async () => {
      const repo = new StaffingRunStateRepository();
      await repo.createRun({
        runId: RUN,
        orchestrationId: 'o1',
        tenantId: TENANT,
        actorUserId: ACTOR,
        input: {},
      });
      await repo.saveStep({
        runId: RUN,
        stepId: 's',
        agentId: 'a',
        output: { v: 1 },
        trust: EMPTY_TRUST,
      });
      await repo.saveStep({
        runId: RUN,
        stepId: 's',
        agentId: 'a',
        output: { v: 2 },
        trust: EMPTY_TRUST,
      });

      const traces = await staffingDb()
        .select()
        .from(orchestrationStepTrace)
        .where(eq(orchestrationStepTrace.run_id, RUN));
      expect(traces).toHaveLength(1);
      const rec = await repo.loadRun(RUN);
      expect(rec.state.outputs.s).toEqual({ v: 1 }); // first write wins
    });
  });

  it('failRun marks the run failed with the error text', async () => {
    await withAgentTestDb(async () => {
      const repo = new StaffingRunStateRepository();
      await repo.createRun({
        runId: RUN,
        orchestrationId: 'o1',
        tenantId: TENANT,
        actorUserId: ACTOR,
        input: {},
      });
      await repo.failRun(RUN, 'boom');
      const rec = await repo.loadRun(RUN);
      expect(rec.status).toBe('failed');
      const [row] = await staffingDb()
        .select()
        .from(orchestrationRuns)
        .where(eq(orchestrationRuns.run_id, RUN));
      expect(row!.error).toBe('boom');
    });
  });

  it('writes an audit event into core.events on saveStep', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const repo = new StaffingRunStateRepository();
      await repo.createRun({
        runId: RUN,
        orchestrationId: 'o1',
        tenantId: TENANT,
        actorUserId: ACTOR,
        input: {},
      });
      await repo.saveStep({
        runId: RUN,
        stepId: 's',
        agentId: 'a',
        output: { v: 1 },
        trust: EMPTY_TRUST,
      });
      const { rows } = await pool.query(
        `SELECT event_type FROM core.events WHERE tenant_id = $1 AND event_type = 'staffing.orchestration.step_recorded'`,
        [TENANT],
      );
      expect(rows.length).toBe(1);
    });
  });
});
