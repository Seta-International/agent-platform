import type { TrustEnvelope } from '@seta/agent-sdk';
import { emit, withEmit } from '@seta/core/events';
import type { RunRecord, RunState, RunStateRepository } from '@seta/shared-orchestration';
import { eq, sql } from 'drizzle-orm';
import { orchestrationRuns, orchestrationStepTrace, staffingDb } from '../db/index.ts';

interface RunMeta {
  tenantId: string;
  actorUserId: string;
}

export class StaffingRunStateRepository implements RunStateRepository {
  async createRun(run: {
    runId: string;
    orchestrationId: string;
    tenantId: string;
    actorUserId: string;
    input: unknown;
  }): Promise<void> {
    await staffingDb()
      .insert(orchestrationRuns)
      .values({
        run_id: run.runId,
        orchestration_id: run.orchestrationId,
        tenant_id: run.tenantId,
        initiated_by: run.actorUserId,
        status: 'running',
        input: run.input as Record<string, unknown>,
        state: { outputs: {} },
      });
  }

  async loadRun(runId: string): Promise<RunRecord> {
    const [row] = await staffingDb()
      .select()
      .from(orchestrationRuns)
      .where(eq(orchestrationRuns.run_id, runId))
      .limit(1);
    if (!row) throw new Error(`orchestration run ${runId} not found`);
    const state = row.state as { outputs?: Record<string, unknown> };
    return {
      status: row.status as RunRecord['status'],
      input: row.input,
      state: {
        runId,
        orchestrationId: row.orchestration_id,
        outputs: state.outputs ?? {},
      } satisfies RunState,
    };
  }

  async saveStep(args: {
    runId: string;
    stepId: string;
    agentId: string;
    output: unknown;
    trust: TrustEnvelope;
  }): Promise<void> {
    const meta = await this.runMeta(args.runId);
    await withEmit({ actor: { userId: meta.actorUserId, tenantId: meta.tenantId } }, async (tx) => {
      const inserted = await tx
        .insert(orchestrationStepTrace)
        .values({
          run_id: args.runId,
          step_id: args.stepId,
          agent_id: args.agentId,
          reasoning_trace: args.trust.reasoningTrace,
          evidence_citations: args.trust.evidenceCitations,
          confidence_score: String(args.trust.confidenceScore),
        })
        .onConflictDoNothing({
          target: [orchestrationStepTrace.run_id, orchestrationStepTrace.step_id],
        })
        .returning();
      if (inserted.length === 0) return; // idempotent: step already recorded

      await tx
        .update(orchestrationRuns)
        .set({
          state: sql`jsonb_set(${orchestrationRuns.state}, ARRAY['outputs', ${args.stepId}]::text[], ${JSON.stringify(args.output)}::jsonb, true)`,
          updated_at: sql`now()`,
        })
        .where(eq(orchestrationRuns.run_id, args.runId));

      await emit({
        tenantId: meta.tenantId,
        aggregateType: 'staffing.orchestration_run',
        aggregateId: args.runId,
        eventType: 'staffing.orchestration.step_recorded',
        eventVersion: 1,
        payload: {
          run_id: args.runId,
          step_id: args.stepId,
          agent_id: args.agentId,
          confidence_score: args.trust.confidenceScore,
        },
        causedByUserId: meta.actorUserId,
      });
    });
  }

  async completeRun(runId: string, result: unknown): Promise<void> {
    await this.finish(runId, 'completed', { result });
  }

  async failRun(runId: string, error: string): Promise<void> {
    await this.finish(runId, 'failed', { error });
  }

  private async finish(
    runId: string,
    status: 'completed' | 'failed',
    extra: { result?: unknown; error?: string },
  ): Promise<void> {
    const meta = await this.runMeta(runId);
    await withEmit({ actor: { userId: meta.actorUserId, tenantId: meta.tenantId } }, async (tx) => {
      await tx
        .update(orchestrationRuns)
        .set({
          status,
          result: (extra.result ?? null) as Record<string, unknown> | null,
          error: extra.error ?? null,
          finished_at: sql`now()`,
          updated_at: sql`now()`,
        })
        .where(eq(orchestrationRuns.run_id, runId));

      await emit({
        tenantId: meta.tenantId,
        aggregateType: 'staffing.orchestration_run',
        aggregateId: runId,
        eventType: `staffing.orchestration.run_${status}`,
        eventVersion: 1,
        payload: { run_id: runId },
        causedByUserId: meta.actorUserId,
      });
    });
  }

  private async runMeta(runId: string): Promise<RunMeta> {
    const [row] = await staffingDb()
      .select({
        tenant_id: orchestrationRuns.tenant_id,
        initiated_by: orchestrationRuns.initiated_by,
      })
      .from(orchestrationRuns)
      .where(eq(orchestrationRuns.run_id, runId))
      .limit(1);
    if (!row) throw new Error(`orchestration run ${runId} not found`);
    return { tenantId: row.tenant_id, actorUserId: row.initiated_by };
  }
}
