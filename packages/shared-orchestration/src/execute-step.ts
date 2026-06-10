import type { SpecializedAgentSpec, SubStepEvent, TrustEnvelope } from '@seta/agent-sdk';
import { EMPTY_TRUST } from '@seta/agent-sdk';
import type { RunRecord, RunStateRepository } from './repository.ts';
import type { OrchestrationSpec, RunCtx } from './types.ts';

export class UnknownSpecializedAgentError extends Error {
  constructor(agentId: string) {
    super(`Specialized agent "${agentId}" not found in registry.`);
  }
}

export interface ExecuteStepDeps {
  repo: RunStateRepository;
  getAgent: (id: string) => SpecializedAgentSpec | undefined;
  /** Optional sink forwarded into the agent's run ctx (inline runner only). */
  onEvent?: (event: SubStepEvent) => void;
}

export interface StepOutcome {
  stepId: string;
  output: unknown;
  trust: TrustEnvelope;
  terminal: boolean;
  skipped: boolean;
}

/**
 * Execute one step of an orchestration. Mutates `run.state.outputs[stepId]` in
 * place so subsequent in-process steps see the result. Idempotent: if the step
 * output already exists in state, returns it without re-running the agent.
 */
export async function executeStep(
  spec: OrchestrationSpec,
  run: RunRecord,
  stepIndex: number,
  ctx: RunCtx,
  deps: ExecuteStepDeps,
): Promise<StepOutcome> {
  const step = spec.steps[stepIndex];
  if (!step) throw new Error(`step index ${stepIndex} out of range for orchestration ${spec.id}`);

  if (step.id in run.state.outputs) {
    return {
      stepId: step.id,
      output: run.state.outputs[step.id],
      trust: EMPTY_TRUST,
      terminal: false,
      skipped: true,
    };
  }

  const agent = deps.getAgent(step.agentId);
  if (!agent) throw new UnknownSpecializedAgentError(step.agentId);

  const rawInput = step.input(run.state, run.input);
  const input = agent.inputSchema.parse(rawInput);

  const res = await agent.run(input, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    effectivePermissions: ctx.effectivePermissions,
    onEvent: deps.onEvent,
    recordHitlApproval: ctx.recordHitlApproval,
    threadId: ctx.threadId,
    entitiesMemory: ctx.entitiesMemory,
    userMemory: ctx.userMemory,
    model: ctx.model,
  });
  agent.outputSchema.parse(res.result);

  await deps.repo.saveStep({
    runId: run.state.runId,
    stepId: step.id,
    agentId: step.agentId,
    output: res.result,
    trust: res.trust,
  });
  run.state.outputs[step.id] = res.result;

  return {
    stepId: step.id,
    output: res.result,
    trust: res.trust,
    terminal: res.terminal === true,
    skipped: false,
  };
}
