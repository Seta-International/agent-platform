import { EMPTY_TRUST } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { InMemoryRunStateRepository } from './fakes.ts';

describe('InMemoryRunStateRepository (test fake)', () => {
  it('creates, loads, saves a step, and completes a run', async () => {
    const repo = new InMemoryRunStateRepository();
    await repo.createRun({
      runId: 'r1',
      orchestrationId: 'o1',
      tenantId: 't1',
      actorUserId: 'u1',
      input: { a: 1 },
    });

    let rec = await repo.loadRun('r1');
    expect(rec.status).toBe('running');
    expect(rec.input).toEqual({ a: 1 });

    await repo.saveStep({
      runId: 'r1',
      stepId: 's1',
      agentId: 'a1',
      output: { y: 2 },
      trust: EMPTY_TRUST,
    });
    rec = await repo.loadRun('r1');
    expect(rec.state.outputs.s1).toEqual({ y: 2 });
    expect(repo.traces).toHaveLength(1);

    await repo.completeRun('r1', { final: true });
    rec = await repo.loadRun('r1');
    expect(rec.status).toBe('completed');
  });

  it('saveStep is idempotent on (runId, stepId)', async () => {
    const repo = new InMemoryRunStateRepository();
    await repo.createRun({
      runId: 'r1',
      orchestrationId: 'o1',
      tenantId: 't1',
      actorUserId: 'u1',
      input: {},
    });
    await repo.saveStep({
      runId: 'r1',
      stepId: 's1',
      agentId: 'a1',
      output: { y: 1 },
      trust: EMPTY_TRUST,
    });
    await repo.saveStep({
      runId: 'r1',
      stepId: 's1',
      agentId: 'a1',
      output: { y: 1 },
      trust: EMPTY_TRUST,
    });
    expect(repo.traces).toHaveLength(1);
  });
});
