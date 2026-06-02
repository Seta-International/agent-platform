import type { SpecializedAgentSpec } from '@seta/agent-sdk';
import { executeStep } from './execute-step.ts';
import { UnknownOrchestrationError } from './queued-runner.ts';
import type { RunRecord, RunStateRepository } from './repository.ts';
import type { OrchestrationEvent, OrchestrationSpec, RunCtx } from './types.ts';

export interface InlineRunnerDeps {
  repo: RunStateRepository;
  getOrchestration: (id: string) => OrchestrationSpec | undefined;
  getAgent: (id: string) => SpecializedAgentSpec | undefined;
  newRunId: () => string;
}

/**
 * Run an orchestration in-process, yielding an event per step. Shares the same
 * `executeStep` core (and thus the same persistence) as the queued runner.
 * Used by the chat test harness (Plan 06) to stream into an AI SDK v6 response.
 */
export async function* runOrchestrationInline(
  orchestrationId: string,
  runInput: unknown,
  ctx: RunCtx,
  deps: InlineRunnerDeps,
): AsyncIterable<OrchestrationEvent> {
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

  const run: RunRecord = {
    status: 'running',
    input: runInput,
    state: { runId, orchestrationId, outputs: {} },
  };

  let lastOutput: unknown;
  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i]!;
    yield { kind: 'step-start', stepId: step.id, agentId: step.agentId };

    // Sub-events the agent emits during this step are queued and yielded live.
    const queue: OrchestrationEvent[] = [];
    let wake: (() => void) | null = null;
    let finished = false;
    const onEvent = (e: OrchestrationEvent) => {
      queue.push(e);
      wake?.();
      wake = null;
    };

    const execPromise = executeStep(spec, run, i, ctx, {
      repo: deps.repo,
      getAgent: deps.getAgent,
      onEvent,
    }).then((o) => {
      finished = true;
      wake?.();
      wake = null;
      return o;
    });

    while (!finished || queue.length > 0) {
      while (queue.length > 0) yield queue.shift()!;
      if (finished) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }

    const outcome = await execPromise;
    yield { kind: 'step-done', stepId: step.id, trust: outcome.trust };
    lastOutput = outcome.output;
    if (outcome.terminal) break;
  }

  await deps.repo.completeRun(runId, lastOutput);
  await spec.onComplete(run.state, ctx);
  yield { kind: 'final', result: lastOutput };
}
