import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { executeStep, UnknownSpecializedAgentError } from '../../src/execute-step.ts';
import type { RunRecord } from '../../src/repository.ts';
import type { OrchestrationSpec, RunCtx } from '../../src/types.ts';
import { InMemoryRunStateRepository } from './fakes.ts';

const CTX: RunCtx = { tenantId: 't1', actorUserId: 'u1' };

const incAgent: SpecializedAgentSpec<{ x: number }, { y: number }> = {
  id: 'inc',
  description: 'inc',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: z.object({ y: z.number() }),
  run: async (input) => ({
    result: { y: input.x + 1 },
    trust: { ...EMPTY_TRUST, confidenceScore: 0.5 },
  }),
};

const orch = (steps: OrchestrationSpec['steps']): OrchestrationSpec => ({
  id: 'o1',
  steps,
  serializationKey: () => 'k',
  onComplete: async () => {},
});

function deps(extraAgents: SpecializedAgentSpec[] = []) {
  const map = new Map<string, SpecializedAgentSpec>([['inc', incAgent as SpecializedAgentSpec]]);
  for (const a of extraAgents) map.set(a.id, a);
  return { repo: new InMemoryRunStateRepository(), getAgent: (id: string) => map.get(id) };
}

async function freshRun(repo: InMemoryRunStateRepository, input: unknown): Promise<RunRecord> {
  await repo.createRun({
    runId: 'r1',
    orchestrationId: 'o1',
    tenantId: 't1',
    actorUserId: 'u1',
    input,
  });
  return repo.loadRun('r1');
}

describe('executeStep', () => {
  it('runs the agent, persists output + trust, and mutates run state', async () => {
    const d = deps();
    const spec = orch([{ id: 'a', agentId: 'inc', input: (_s, runIn) => runIn }]);
    const run = await freshRun(d.repo, { x: 1 });

    const outcome = await executeStep(spec, run, 0, CTX, d);

    expect(outcome.output).toEqual({ y: 2 });
    expect(outcome.terminal).toBe(false);
    expect(outcome.skipped).toBe(false);
    expect(run.state.outputs.a).toEqual({ y: 2 });
    expect(d.repo.traces).toHaveLength(1);
    expect(d.repo.traces[0]!.trust.confidenceScore).toBe(0.5);
  });

  it('maps prior step outputs into the next step input', async () => {
    const d = deps();
    const spec = orch([
      { id: 'first', agentId: 'inc', input: (_s, runIn) => runIn },
      { id: 'second', agentId: 'inc', input: (s) => ({ x: (s.outputs.first as { y: number }).y }) },
    ]);
    const run = await freshRun(d.repo, { x: 1 });

    await executeStep(spec, run, 0, CTX, d); // first -> { y: 2 }
    const outcome = await executeStep(spec, run, 1, CTX, d); // second uses y=2 -> { y: 3 }

    expect(outcome.output).toEqual({ y: 3 });
  });

  it('skips (idempotent) when the step output already exists', async () => {
    const d = deps();
    const spec = orch([{ id: 'a', agentId: 'inc', input: (_s, runIn) => runIn }]);
    const run = await freshRun(d.repo, { x: 1 });
    run.state.outputs.a = { y: 99 };

    const outcome = await executeStep(spec, run, 0, CTX, d);

    expect(outcome.skipped).toBe(true);
    expect(outcome.output).toEqual({ y: 99 });
    expect(d.repo.traces).toHaveLength(0);
  });

  it('propagates the terminal flag from the agent', async () => {
    const gate: SpecializedAgentSpec<{ x: number }, { y: number }> = {
      id: 'gate',
      description: 'gate',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      run: async () => ({ result: { y: 0 }, trust: EMPTY_TRUST, terminal: true }),
    };
    const d = deps([gate as SpecializedAgentSpec]);
    const spec = orch([{ id: 'g', agentId: 'gate', input: (_s, runIn) => runIn }]);
    const run = await freshRun(d.repo, { x: 1 });

    const outcome = await executeStep(spec, run, 0, CTX, d);
    expect(outcome.terminal).toBe(true);
  });

  it('throws UnknownSpecializedAgentError for a missing agent', async () => {
    const d = deps();
    const spec = orch([{ id: 'a', agentId: 'ghost', input: (_s, runIn) => runIn }]);
    const run = await freshRun(d.repo, { x: 1 });
    await expect(executeStep(spec, run, 0, CTX, d)).rejects.toThrow(UnknownSpecializedAgentError);
  });

  it('throws when the agent output violates its schema', async () => {
    const bad: SpecializedAgentSpec<{ x: number }, { y: number }> = {
      id: 'bad',
      description: 'bad',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      run: async () => ({
        result: { y: 'not-a-number' } as unknown as { y: number },
        trust: EMPTY_TRUST,
      }),
    };
    const d = deps([bad as SpecializedAgentSpec]);
    const spec = orch([{ id: 'a', agentId: 'bad', input: (_s, runIn) => runIn }]);
    const run = await freshRun(d.repo, { x: 1 });
    await expect(executeStep(spec, run, 0, CTX, d)).rejects.toThrow();
  });
});
