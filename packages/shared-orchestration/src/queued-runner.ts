import type { SpecializedAgentSpec } from '@seta/agent-sdk';
import type { JobHelpers, Task, TaskList } from 'graphile-worker';
import { executeStep } from './execute-step.ts';
import type { RunStateRepository } from './repository.ts';
import { type AddJob, type OrchestrationSpec, type RunCtx, RunStepPayloadSchema } from './types.ts';

export const ORCH_JOBS = {
  RUN_STEP: 'orchestration:run_step',
} as const;

export interface OrchestrationRunnerDeps {
  repo: RunStateRepository;
  getOrchestration: (id: string) => OrchestrationSpec | undefined;
  getAgent: (id: string) => SpecializedAgentSpec | undefined;
}

export class UnknownOrchestrationError extends Error {
  constructor(id: string) {
    super(`Orchestration "${id}" not found in registry.`);
  }
}

/** Create a run record and enqueue its first step under the spec's serialization queue. */
export async function enqueueRun(
  orchestrationId: string,
  runInput: unknown,
  ctx: RunCtx,
  deps: OrchestrationRunnerDeps & { addJob: AddJob; newRunId: () => string },
): Promise<{ runId: string }> {
  const spec = deps.getOrchestration(orchestrationId);
  if (!spec) throw new UnknownOrchestrationError(orchestrationId);

  const runId = deps.newRunId();
  await deps.repo.createRun({
    runId,
    orchestrationId,
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    input: runInput,
  });
  await deps.addJob(
    ORCH_JOBS.RUN_STEP,
    { runId, orchestrationId, stepIndex: 0, tenantId: ctx.tenantId, actorUserId: ctx.actorUserId },
    { queueName: spec.serializationKey(runInput, ctx) },
  );
  return { runId };
}

/** Build the graphile-worker task list for the orchestration kernel. */
export function makeOrchestrationTaskList(deps: OrchestrationRunnerDeps): TaskList {
  const runStep: Task = async (raw, helpers: JobHelpers) => {
    const payload = RunStepPayloadSchema.parse(raw);
    const spec = deps.getOrchestration(payload.orchestrationId);
    if (!spec) throw new UnknownOrchestrationError(payload.orchestrationId);
    const ctx: RunCtx = { tenantId: payload.tenantId, actorUserId: payload.actorUserId };

    try {
      const run = await deps.repo.loadRun(payload.runId);
      const outcome = await executeStep(spec, run, payload.stepIndex, ctx, {
        repo: deps.repo,
        getAgent: deps.getAgent,
      });

      const nextIndex = payload.stepIndex + 1;
      const isLast = nextIndex >= spec.steps.length;

      if (outcome.terminal || isLast) {
        await deps.repo.completeRun(payload.runId, outcome.output);
        await spec.onComplete(run.state, ctx);
        return;
      }

      await helpers.addJob(
        ORCH_JOBS.RUN_STEP,
        { ...payload, stepIndex: nextIndex },
        { queueName: spec.serializationKey(run.input, ctx) },
      );
    } catch (err) {
      if (helpers.job.attempts >= helpers.job.max_attempts) {
        await deps.repo.failRun(payload.runId, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }
  };

  return { [ORCH_JOBS.RUN_STEP]: runStep };
}
