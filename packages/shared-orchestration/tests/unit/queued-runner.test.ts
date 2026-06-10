import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { enqueueRun, makeOrchestrationTaskList, ORCH_JOBS } from '../../src/queued-runner.ts';
import type { OrchestrationSpec } from '../../src/types.ts';
import { InMemoryRunStateRepository } from './fakes.ts';

const incAgent: SpecializedAgentSpec<{ x: number }, { y: number }> = {
  id: 'inc',
  description: 'inc',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: z.object({ y: z.number() }),
  run: async (input) => ({ result: { y: input.x + 1 }, trust: EMPTY_TRUST }),
};

const getAgent = (id: string) => (id === 'inc' ? (incAgent as SpecializedAgentSpec) : undefined);

function twoStepSpec(onComplete = vi.fn(async () => {})): OrchestrationSpec {
  return {
    id: 'o1',
    steps: [
      { id: 'first', agentId: 'inc', input: (_s, runIn) => runIn },
      { id: 'second', agentId: 'inc', input: (s) => ({ x: (s.outputs.first as { y: number }).y }) },
    ],
    serializationKey: (_in, ctx) => `key:${ctx.tenantId}`,
    onComplete,
  };
}

const CTX = { tenantId: 't1', actorUserId: 'u1' };

describe('enqueueRun', () => {
  it('creates a run and enqueues step 0 under the serialization queue', async () => {
    const repo = new InMemoryRunStateRepository();
    const addJob = vi.fn(async () => {});
    const spec = twoStepSpec();
    const getOrchestration = (id: string) => (id === 'o1' ? spec : undefined);

    const { runId } = await enqueueRun('o1', { x: 1 }, CTX, {
      repo,
      getOrchestration,
      getAgent,
      addJob,
      newRunId: () => 'run-1',
    });

    expect(runId).toBe('run-1');
    expect((await repo.loadRun('run-1')).status).toBe('running');
    expect(addJob).toHaveBeenCalledWith(
      ORCH_JOBS.RUN_STEP,
      { runId: 'run-1', orchestrationId: 'o1', stepIndex: 0, tenantId: 't1', actorUserId: 'u1' },
      { queueName: 'key:t1' },
    );
  });
});

// Minimal graphile-worker JobHelpers stub for the handler under test.
function helpers(addJob: ReturnType<typeof vi.fn>, attempts = 1, maxAttempts = 3) {
  return { addJob, job: { attempts, max_attempts: maxAttempts } } as never;
}

describe('makeOrchestrationTaskList handler', () => {
  it('runs a step and enqueues the next one', async () => {
    const repo = new InMemoryRunStateRepository();
    await repo.createRun({
      runId: 'r1',
      orchestrationId: 'o1',
      tenantId: 't1',
      actorUserId: 'u1',
      input: { x: 1 },
    });
    const onComplete = vi.fn(async () => {});
    const spec = twoStepSpec(onComplete);
    const addJob = vi.fn(async () => {});
    const tasks = makeOrchestrationTaskList({ repo, getOrchestration: () => spec, getAgent });

    await tasks[ORCH_JOBS.RUN_STEP]!(
      { runId: 'r1', orchestrationId: 'o1', stepIndex: 0, tenantId: 't1', actorUserId: 'u1' },
      helpers(addJob),
    );

    expect((await repo.loadRun('r1')).state.outputs.first).toEqual({ y: 2 });
    expect(addJob).toHaveBeenCalledWith(
      ORCH_JOBS.RUN_STEP,
      { runId: 'r1', orchestrationId: 'o1', stepIndex: 1, tenantId: 't1', actorUserId: 'u1' },
      { queueName: 'key:t1' },
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('completes the run and calls onComplete after the last step', async () => {
    const repo = new InMemoryRunStateRepository();
    await repo.createRun({
      runId: 'r1',
      orchestrationId: 'o1',
      tenantId: 't1',
      actorUserId: 'u1',
      input: { x: 1 },
    });
    repo.runs ?? null; // no-op to keep types happy
    const onComplete = vi.fn(async () => {});
    const spec = twoStepSpec(onComplete);
    const addJob = vi.fn(async () => {});
    const tasks = makeOrchestrationTaskList({ repo, getOrchestration: () => spec, getAgent });

    // Run step 0 then step 1
    await tasks[ORCH_JOBS.RUN_STEP]!(
      { runId: 'r1', orchestrationId: 'o1', stepIndex: 0, tenantId: 't1', actorUserId: 'u1' },
      helpers(addJob),
    );
    await tasks[ORCH_JOBS.RUN_STEP]!(
      { runId: 'r1', orchestrationId: 'o1', stepIndex: 1, tenantId: 't1', actorUserId: 'u1' },
      helpers(addJob),
    );

    expect((await repo.loadRun('r1')).status).toBe('completed');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('early-exits when a step is terminal', async () => {
    const gate: SpecializedAgentSpec<{ x: number }, { y: number }> = {
      id: 'gate',
      description: 'gate',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      run: async () => ({ result: { y: 0 }, trust: EMPTY_TRUST, terminal: true }),
    };
    const repo = new InMemoryRunStateRepository();
    await repo.createRun({
      runId: 'r1',
      orchestrationId: 'o1',
      tenantId: 't1',
      actorUserId: 'u1',
      input: { x: 1 },
    });
    const onComplete = vi.fn(async () => {});
    const spec: OrchestrationSpec = {
      id: 'o1',
      steps: [
        { id: 'g', agentId: 'gate', input: (_s, runIn) => runIn },
        { id: 'never', agentId: 'inc', input: (_s, runIn) => runIn },
      ],
      serializationKey: () => 'k',
      onComplete,
    };
    const addJob = vi.fn(async () => {});
    const tasks = makeOrchestrationTaskList({
      repo,
      getOrchestration: () => spec,
      getAgent: (id) => (id === 'gate' ? (gate as SpecializedAgentSpec) : getAgent(id)),
    });

    await tasks[ORCH_JOBS.RUN_STEP]!(
      { runId: 'r1', orchestrationId: 'o1', stepIndex: 0, tenantId: 't1', actorUserId: 'u1' },
      helpers(addJob),
    );

    expect(addJob).not.toHaveBeenCalled(); // no next step enqueued
    expect((await repo.loadRun('r1')).status).toBe('completed');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('marks the run failed when attempts are exhausted', async () => {
    const boom: SpecializedAgentSpec<{ x: number }, { y: number }> = {
      id: 'boom',
      description: 'boom',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      run: async () => {
        throw new Error('kaboom');
      },
    };
    const repo = new InMemoryRunStateRepository();
    await repo.createRun({
      runId: 'r1',
      orchestrationId: 'o1',
      tenantId: 't1',
      actorUserId: 'u1',
      input: { x: 1 },
    });
    const spec: OrchestrationSpec = {
      id: 'o1',
      steps: [{ id: 'b', agentId: 'boom', input: (_s, runIn) => runIn }],
      serializationKey: () => 'k',
      onComplete: async () => {},
    };
    const tasks = makeOrchestrationTaskList({
      repo,
      getOrchestration: () => spec,
      getAgent: (id) => (id === 'boom' ? (boom as SpecializedAgentSpec) : undefined),
    });

    await expect(
      tasks[ORCH_JOBS.RUN_STEP]!(
        { runId: 'r1', orchestrationId: 'o1', stepIndex: 0, tenantId: 't1', actorUserId: 'u1' },
        helpers(
          vi.fn(async () => {}),
          3,
          3,
        ), // attempts === max_attempts
      ),
    ).rejects.toThrow('kaboom');
    expect((await repo.loadRun('r1')).status).toBe('failed');
  });
});
