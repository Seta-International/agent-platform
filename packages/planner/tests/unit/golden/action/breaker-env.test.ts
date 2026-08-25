// The A2 lane runs every case in ONE process under ONE tenant, and the SDK's
// circuit breaker is module-global state keyed `tenantId:toolId`. Case N tripping
// a breaker therefore kills the tool for case N+1 — which is exactly what happened
// on 2026-08-24: RV-007 called planner_updateTask six times, and RV-008 answered
// "công cụ cập nhật task đang tạm thời không khả dụng" (ToolBreakerOpenError).
//
// A golden lane measures MODEL behaviour. It has no metric about the breaker, and
// a retry storm is already caught by M8's trajectory_efficiency. So the lane turns
// the breaker off for the duration of the run.
import { RequestContext } from '@mastra/core/request-context';
import { __resetBreakersForTests, defineAgentTool } from '@seta/agent-sdk';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import {
  disableBreakerForLane,
  restoreBreakerAfterLane,
} from '../../../fixtures/golden/action/breaker-env.ts';

/** The lane runs every case under ONE tenant — that is what makes the leak reach
 *  the next case. A uuid because the request-context schema validates the shape. */
const TENANT = '00000000-0000-0000-0000-0000000a2000';

/** A tool that always throws, so every call is a breaker failure. */
function alwaysFailingTool() {
  return defineAgentTool({
    id: 'planner_updateTask',
    name: 'Update task',
    description: 'test double',
    input: z.object({}),
    output: z.object({}),
    execute: async () => {
      throw new Error('boom');
    },
  });
}

/** The ctx `wrapExecute` needs: it reads the tenant id off `requestContext`. A real
 *  `RequestContext`, not a plain Map — `defineAgentTool` declares a
 *  `requestContextSchema`, and Mastra skips the call outright when the shape fails
 *  to validate, which silently looks like a tool that succeeded. */
function ctx() {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: '00000000-0000-0000-0000-000000000099' });
  rc.set('tenant_id', TENANT);
  return { requestContext: rc } as never;
}

/** Calls the tool `n` times and returns the error CODE of each call. */
async function callTimes(tool: ReturnType<typeof alwaysFailingTool>, n: number) {
  const codes: string[] = [];
  for (let i = 0; i < n; i += 1) {
    try {
      await (tool.execute as (i: unknown, c: unknown) => Promise<unknown>)({}, ctx());
      codes.push('OK');
    } catch (err) {
      codes.push((err as { code?: string }).code ?? 'UNKNOWN');
    }
  }
  return codes;
}

afterEach(() => {
  // Every test in this file mutates process-global state. Not cleaning up here
  // would reproduce, inside this very file, the bug it is about.
  __resetBreakersForTests();
});

it('leaks an open breaker from one case into the next when nothing disables it', async () => {
  // This is the BUG, pinned. It documents why breaker-env exists; it must keep
  // passing, because the SDK's global-state design is deliberately not changed here.
  const tool = alwaysFailingTool();
  // "Case 1": a retry storm, exactly like RV-007 turn 2.
  const caseOne = await callTimes(tool, 4);
  expect(caseOne.slice(0, 3), 'the first three calls are ordinary tool errors').toEqual([
    'TOOL_ERROR',
    'TOOL_ERROR',
    'TOOL_ERROR',
  ]);
  expect(caseOne[3]).toBe('CIRCUIT_OPEN');

  // "Case 2": a brand-new tool instance and a fresh world — and it is still dead,
  // because the state is keyed by tenant + tool id, not by instance.
  const nextCase = await callTimes(alwaysFailingTool(), 1);
  expect(nextCase[0]).toBe('CIRCUIT_OPEN');
});

it('keeps a tool that tripped in one case usable in the next once the lane disables the breaker', async () => {
  disableBreakerForLane();
  const tool = alwaysFailingTool();
  await callTimes(tool, 6); // RV-007's six consecutive updateTask calls
  const nextCase = await callTimes(alwaysFailingTool(), 1);
  expect(nextCase[0], 'the next case must see the agent, not the harness').toBe('TOOL_ERROR');
});

it('restores the default threshold when the lane finishes, so no other file inherits it', async () => {
  disableBreakerForLane();
  await callTimes(alwaysFailingTool(), 6);
  restoreBreakerAfterLane();

  // Observable proof the DEFAULT config is back: three failures open the breaker,
  // and the accumulated failure count from before the restore is gone (otherwise
  // the first call here would already be CIRCUIT_OPEN).
  const codes = await callTimes(alwaysFailingTool(), 4);
  expect(codes).toEqual(['TOOL_ERROR', 'TOOL_ERROR', 'TOOL_ERROR', 'CIRCUIT_OPEN']);
});
