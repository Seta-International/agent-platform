import { RequestContext } from '@mastra/core/request-context';
import {
  __resetBreakerEmitterForTests,
  __resetBreakersForTests,
  __resetExecutionPolicyForTests,
  AgentToolError,
  defineAgentTool,
  setExecutionPolicy,
  ToolExecutionTimeoutError,
} from '@seta/agent-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const TENANT = '00000000-0000-0000-0000-000000000001';
const ACTOR = { type: 'user' as const, user_id: '00000000-0000-0000-0000-000000000099' };

function makeCtx() {
  const rc = new RequestContext();
  rc.set('actor', ACTOR);
  rc.set('tenant_id', TENANT);
  return { requestContext: rc } as never;
}

function toolThatThrows(err: unknown) {
  return defineAgentTool({
    id: 'test.throwing',
    name: 'Throwing tool',
    description: 'Always throws.',
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    execute: async () => {
      throw err;
    },
  });
}

async function settle(tool: ReturnType<typeof toolThatThrows>) {
  const exec = (tool as unknown as { execute: (i: unknown, c: unknown) => Promise<unknown> })
    .execute;
  return exec({}, makeCtx()).then(
    (value) => ({ ok: true as const, value }),
    (err: unknown) => ({ ok: false as const, err }),
  );
}

describe('wrap-execute error mapping', () => {
  beforeEach(() => {
    __resetBreakersForTests();
    __resetBreakerEmitterForTests();
    __resetExecutionPolicyForTests();
    setExecutionPolicy({ readMs: 30_000, writeMs: 60_000, maxMs: 300_000 });
  });

  it('AC1: FORBIDDEN domain error → AgentToolError PERMISSION_DENIED', async () => {
    const result = await settle(
      toolThatThrows({ code: 'FORBIDDEN', message: 'missing permission planner.task.read' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    const e = result.err as AgentToolError;
    expect(e).toBeInstanceOf(AgentToolError);
    expect(e.code).toBe('PERMISSION_DENIED');
    expect(e.retryable).toBe(false);
    expect(e.toolId).toBe('test.throwing');
  });

  it('AC3: PERMISSION_DENIED .message is the safe userMessage — internal detail absent', async () => {
    const result = await settle(
      toolThatThrows({
        code: 'FORBIDDEN',
        message: 'missing permission planner.task.read for group id=g-777',
      }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as AgentToolError;
    expect(e.message).toBe(e.userMessage);
    expect(e.message).not.toContain('g-777');
    expect(e.message).not.toContain('planner.task.read');
  });

  it('AC4: internalDetail retains the raw domain message', async () => {
    const result = await settle(
      toolThatThrows({
        code: 'FORBIDDEN',
        message: 'missing permission planner.task.read for group id=g-777',
      }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as AgentToolError;
    expect(e.internalDetail).toContain('g-777');
    expect(e.internalDetail).toContain('planner.task.read');
  });

  it('NOT_FOUND domain error → AgentToolError NOT_FOUND, internal detail not in message', async () => {
    const result = await settle(
      toolThatThrows({ code: 'NOT_FOUND', message: 'task id=abc-123 not found' }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as AgentToolError;
    expect(e).toBeInstanceOf(AgentToolError);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.retryable).toBe(false);
    expect(e.message).not.toContain('abc-123');
    expect(e.internalDetail).toContain('abc-123');
  });

  it('CONFLICT domain error → AgentToolError CONFLICT', async () => {
    const result = await settle(
      toolThatThrows({ code: 'CONFLICT', message: 'task already assigned' }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as AgentToolError;
    expect(e).toBeInstanceOf(AgentToolError);
    expect(e.code).toBe('CONFLICT');
    expect(e.retryable).toBe(false);
  });

  it('VALIDATION domain error → AgentToolError VALIDATION', async () => {
    const result = await settle(
      toolThatThrows({ code: 'VALIDATION', message: 'due_date must be in the future' }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as AgentToolError;
    expect(e).toBeInstanceOf(AgentToolError);
    expect(e.code).toBe('VALIDATION');
    expect(e.retryable).toBe(false);
  });

  it('rate_limited error → AgentToolError RATE_LIMITED (retryable)', async () => {
    const result = await settle(
      toolThatThrows({ code: 'rate_limited', message: 'turn limit exceeded' }),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as AgentToolError;
    expect(e).toBeInstanceOf(AgentToolError);
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.retryable).toBe(true);
  });

  it('unknown error (no .code) → AgentToolError TOOL_ERROR, internal detail not in message', async () => {
    const result = await settle(
      toolThatThrows(new Error('PG-12345: constraint violation on planner.tasks')),
    );
    if (result.ok) throw new Error('unreachable');
    const e = result.err as AgentToolError;
    expect(e).toBeInstanceOf(AgentToolError);
    expect(e.code).toBe('TOOL_ERROR');
    expect(e.retryable).toBe(false);
    expect(e.message).not.toContain('PG-12345');
    expect(e.internalDetail).toContain('PG-12345');
  });

  it('AC1: pre-existing AgentToolError is re-thrown as the same object reference', async () => {
    const original = new AgentToolError({
      code: 'NOT_FOUND',
      retryable: false,
      userMessage: 'Resource not found.',
      internalDetail: 'record id=abc not in db',
      toolId: 'test.throwing',
    });
    const result = await settle(toolThatThrows(original));
    if (result.ok) throw new Error('unreachable');
    expect(result.err).toBe(original);
  });

  it('ToolExecutionTimeoutError is instanceof AgentToolError with code TIMEOUT', () => {
    const e = new ToolExecutionTimeoutError('planner_getTask', 500);
    expect(e).toBeInstanceOf(AgentToolError);
    expect(e.code).toBe('TIMEOUT');
    expect(e.retryable).toBe(true);
    expect(e.message).toBe(e.userMessage);
  });
});
