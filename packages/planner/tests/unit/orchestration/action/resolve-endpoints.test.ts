import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveTwoEndpoints,
  UNRESOLVABLE_ENDPOINT,
} from '../../../../src/backend/orchestration/action/resolve-endpoints.ts';

const TASK_A = '66be2be2-394d-4184-b106-c412289fd1e1';
const TASK_B = '9f1d3a10-2b44-4c55-8d66-ee7788990011';

function ctx() {
  const requestContext = new RequestContext();
  requestContext.set('tenant_id', 't1');
  requestContext.set('actor', { type: 'user', user_id: 'a1' });
  return { agent: { resumeData: undefined }, requestContext } as never;
}

function snap(taskId: string, title: string, groupId = 'g1') {
  return {
    taskId,
    title,
    description: null,
    due_at: null,
    start_at: null,
    priority_number: 5 as const,
    percent_complete: 0,
    version: 1,
    groupId,
  };
}

describe('resolveTwoEndpoints', () => {
  const actor = { tenantId: 't1', actorUserId: 'a1' };

  it('resolves both refs and gates BOTH groups in one call', async () => {
    const port = {
      readEndpoint: vi.fn(async ({ taskId }: { taskId: string }) => snap(taskId, taskId)),
      assertCanLink: vi.fn(async () => {}),
    };
    const out = await resolveTwoEndpoints({
      port: port as never,
      actor,
      toolCtx: ctx(),
      sourceRef: TASK_A,
      targetRef: TASK_B,
    });
    expect(out.ok).toBe(true);
    expect(port.assertCanLink).toHaveBeenCalledTimes(1);
    expect(port.assertCanLink.mock.calls[0]![0]).toMatchObject({ groupIds: ['g1', 'g1'] });
  });

  it('refuses a self-reference before any read', async () => {
    const port = { readEndpoint: vi.fn(), assertCanLink: vi.fn() };
    const out = await resolveTwoEndpoints({
      port: port as never,
      actor,
      toolCtx: ctx(),
      sourceRef: TASK_A,
      targetRef: TASK_A,
    });
    expect(out).toMatchObject({ ok: false });
    expect(port.readEndpoint).not.toHaveBeenCalled();
  });

  // AC3, at the unit level: the two causes produce ONE string, and it names the
  // ref the user said rather than anything about access.
  it('gives a byte-identical refusal for an absent and an unreadable endpoint', async () => {
    const makePort = () => ({
      readEndpoint: vi.fn(async () => null),
      assertCanLink: vi.fn(async () => {}),
    });
    const a = await resolveTwoEndpoints({
      port: makePort() as never,
      actor,
      toolCtx: ctx(),
      sourceRef: TASK_A,
      targetRef: TASK_B,
    });
    const b = await resolveTwoEndpoints({
      port: makePort() as never,
      actor,
      toolCtx: ctx(),
      sourceRef: TASK_A,
      targetRef: TASK_B,
    });
    expect(a).toEqual(b);
    expect((a as { refusal: string }).refusal).toBe(UNRESOLVABLE_ENDPOINT(TASK_A));
    expect((a as { refusal: string }).refusal).not.toMatch(/access|permission|forbidden/i);
  });

  it('does not gate anything when an endpoint is unresolvable', async () => {
    const port = {
      readEndpoint: vi.fn(async () => null),
      assertCanLink: vi.fn(async () => {}),
    };
    await resolveTwoEndpoints({
      port: port as never,
      actor,
      toolCtx: ctx(),
      sourceRef: TASK_A,
      targetRef: TASK_B,
    });
    expect(port.assertCanLink).not.toHaveBeenCalled();
  });
});
