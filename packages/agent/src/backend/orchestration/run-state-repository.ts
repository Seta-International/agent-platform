import type { TrustEnvelope } from '@seta/agent-sdk';
import { emit, withEmit } from '@seta/core/events';
import type { RunRecord, RunState, RunStateRepository } from '@seta/shared-orchestration';
import { eq, sql } from 'drizzle-orm';
import { agentDb } from '../db/index.ts';
import { workflowRunSteps, workflowRuns } from '../db/schema.ts';

interface RunMeta {
  tenantId: string;
  actorUserId: string;
}

/**
 * Agent-backed implementation of the orchestration kernel's persistence port.
 * Runs live in `agent.workflow_runs` (the orchestration `input` reuses the
 * existing `input_summary` jsonb; the kernel's accumulated `state`/`result`
 * live in the dedicated `state`/`result` jsonb columns) and step traces in
 * `agent.workflow_run_steps`. Terminal-success maps to the module's existing
 * `success` status (not a redundant `completed`).
 */
export class AgentRunStateRepository implements RunStateRepository {
  async createRun(run: {
    runId: string;
    orchestrationId: string;
    tenantId: string;
    actorUserId: string;
    input: unknown;
  }): Promise<void> {
    await agentDb()
      .insert(workflowRuns)
      .values({
        runId: run.runId,
        workflowId: run.orchestrationId,
        tenantId: run.tenantId,
        startedBy: run.actorUserId,
        // Kernel runs are system/worker-initiated (queued runner + inline
        // harness), not an interactive chat turn — 'event' is the closest of
        // the existing started_via values.
        startedVia: 'event',
        status: 'running',
        inputSummary: run.input as Record<string, unknown>,
        state: { outputs: {} },
      });
  }

  async loadRun(runId: string): Promise<RunRecord> {
    const [row] = await agentDb()
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.runId, runId))
      .limit(1);
    if (!row) throw new Error(`orchestration run ${runId} not found`);
    const state = row.state as { outputs?: Record<string, unknown> };
    return {
      status: row.status as RunRecord['status'],
      input: row.inputSummary,
      state: {
        runId,
        orchestrationId: row.workflowId,
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
        .insert(workflowRunSteps)
        .values({
          tenant_id: meta.tenantId,
          run_id: args.runId,
          step_id: args.stepId,
          agent_id: args.agentId,
          reasoning_trace: args.trust.reasoningTrace,
          evidence_citations: args.trust.evidenceCitations,
          confidence_score: String(args.trust.confidenceScore),
        })
        .onConflictDoNothing({
          target: [workflowRunSteps.tenant_id, workflowRunSteps.run_id, workflowRunSteps.step_id],
        })
        .returning();
      if (inserted.length === 0) return; // idempotent: step already recorded

      await tx
        .update(workflowRuns)
        .set({
          state: sql`jsonb_set(${workflowRuns.state}, ARRAY['outputs', ${args.stepId}]::text[], ${JSON.stringify(args.output)}::jsonb, true)`,
        })
        .where(eq(workflowRuns.runId, args.runId));

      await emit({
        tenantId: meta.tenantId,
        aggregateType: 'agent.orchestration_run',
        aggregateId: args.runId,
        eventType: 'agent.orchestration.step_recorded',
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
    await this.finish(runId, 'success', { result });
  }

  async failRun(runId: string, error: string): Promise<void> {
    await this.finish(runId, 'failed', { error });
  }

  private async finish(
    runId: string,
    status: 'success' | 'failed',
    extra: { result?: unknown; error?: string },
  ): Promise<void> {
    const meta = await this.runMeta(runId);
    await withEmit({ actor: { userId: meta.actorUserId, tenantId: meta.tenantId } }, async (tx) => {
      await tx
        .update(workflowRuns)
        .set({
          status,
          result: (extra.result ?? null) as Record<string, unknown> | null,
          errorSummary: extra.error ?? null,
          finishedAt: sql`now()`,
        })
        .where(eq(workflowRuns.runId, runId));

      await emit({
        tenantId: meta.tenantId,
        aggregateType: 'agent.orchestration_run',
        aggregateId: runId,
        eventType: `agent.orchestration.run_${status}`,
        eventVersion: 1,
        payload: { run_id: runId },
        causedByUserId: meta.actorUserId,
      });
    });
  }

  private async runMeta(runId: string): Promise<RunMeta> {
    const [row] = await agentDb()
      .select({
        tenantId: workflowRuns.tenantId,
        startedBy: workflowRuns.startedBy,
      })
      .from(workflowRuns)
      .where(eq(workflowRuns.runId, runId))
      .limit(1);
    if (!row) throw new Error(`orchestration run ${runId} not found`);
    return { tenantId: row.tenantId, actorUserId: row.startedBy };
  }
}
