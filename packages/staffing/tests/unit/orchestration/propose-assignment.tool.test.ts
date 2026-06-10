import { RequestContext } from '@mastra/core/request-context';
import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { makeProposeAssignmentTool } from '../../../src/backend/orchestration/propose-assignment.tool.ts';

const TASK_ID = '66be2be2-394d-4184-b106-c412289fd1e1';
const U1 = '0b54f3da-7be4-4d51-9b32-d0a63aa39c2b';

// Sub-agent stub recording its inputs, mirroring orchestrator.tools.test.ts.
function capturingStub<I, O>(id: string, result: O) {
  const inputs: I[] = [];
  const spec = {
    id,
    description: '',
    inputSchema: { parse: (v: I) => v } as never,
    outputSchema: { parse: (v: O) => v } as never,
    run: async (input: I) => {
      inputs.push(input);
      return { result, trust: EMPTY_TRUST };
    },
  } as unknown as SpecializedAgentSpec<I, O>;
  return { spec, inputs };
}

const RECOMMENDATION = {
  userId: U1,
  name: 'Alice',
  skillMatch: ['aws'],
  skillMatchCount: 1,
  status: 'available' as const,
  availabilityScore: 0.9,
};

function build(opts: { recommendations?: unknown[] } = {}) {
  const taskAnalyzer = capturingStub('staffing.taskAnalyzer', {
    skills: ['aws'],
    title: 'AWS migration',
  });
  const skillMatcher = capturingStub('staffing.skillMatcher', { taskId: TASK_ID, candidates: [] });
  const avaiChecker = capturingStub('staffing.avaiChecker', { taskId: TASK_ID, availability: [] });
  const recommender = capturingStub('staffing.recommender', {
    taskId: TASK_ID,
    recommendations: opts.recommendations ?? [RECOMMENDATION],
  });
  const assign = { assign: vi.fn(async () => {}) };
  const tool = makeProposeAssignmentTool({
    taskAnalyzer: taskAnalyzer.spec as never,
    skillMatcher: skillMatcher.spec as never,
    avaiChecker: avaiChecker.spec as never,
    recommender: recommender.spec as never,
    assign,
    ctx: { tenantId: 't1', actorUserId: 'a1' },
  });
  return { tool, taskAnalyzer, skillMatcher, avaiChecker, recommender, assign };
}

function rc() {
  const requestContext = new RequestContext();
  requestContext.set('tenant_id', 't1');
  requestContext.set('actor', { type: 'user', user_id: 'a1' });
  return requestContext;
}

// Agentic ctx: ctx.agent.suspend / ctx.agent.resumeData (spike-confirmed shape).
function firstPassCtx(suspend: (p: unknown) => Promise<unknown>) {
  return { agent: { suspend, resumeData: undefined }, requestContext: rc() } as never;
}
function resumeCtx(resumeData: unknown) {
  const suspend = vi.fn(async () => {});
  return {
    ctx: { agent: { suspend, resumeData }, requestContext: rc() } as never,
    suspend,
  };
}

describe('proposeAssignment composite tool', () => {
  it('first call: runs the pipeline and suspends with the assign card', async () => {
    const { tool, recommender } = build();
    let suspended: { card?: unknown } | undefined;
    // Real Mastra suspend() UNWINDS (throws) on the suspending pass (spike-confirmed):
    // it records the payload, then execute() rejects rather than returning. The
    // double mirrors that — records the card, then throws.
    const suspend = vi.fn(async (payload: unknown) => {
      suspended = payload as { card?: unknown };
    });
    // In the real runtime Mastra's suspend() abandons the execute continuation
    // (probe-confirmed: it neither throws nor runs post-suspend code). A unit
    // double can't model "abandon", so it resolves; the contract we verify is
    // that the pipeline ran and suspend was called once with the right card.
    const out = await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      firstPassCtx(suspend),
    );
    expect(out).toEqual({ assigned: false });
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(recommender.inputs).toHaveLength(1);
    const card = suspended?.card as { primary: { argsPatch: Record<string, unknown> } };
    expect(card.primary.argsPatch).toEqual({
      action: 'assign',
      assigneeUserIds: [U1],
      taskId: TASK_ID,
    });
  });

  it('first call with empty recommendations: returns { assigned:false } and does NOT suspend', async () => {
    const { tool } = build({ recommendations: [] });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      firstPassCtx(suspend),
    )) as { assigned: boolean; recommendations?: unknown[] };
    expect(suspend).not.toHaveBeenCalled();
    expect(out).toEqual({ assigned: false, recommendations: [] });
  });

  it('resume approve: assigns the overrideUserIds and returns { assigned:true }, no suspend', async () => {
    const { tool, assign, recommender } = build();
    const { ctx, suspend } = resumeCtx({ decision: 'approve', overrideUserIds: [U1] });
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      ctx,
    )) as {
      assigned: boolean;
    };
    expect(out).toEqual({ assigned: true });
    expect(assign.assign).toHaveBeenCalledTimes(1);
    expect(assign.assign).toHaveBeenCalledWith({
      taskId: TASK_ID,
      assigneeUserIds: [U1],
      tenantId: 't1',
      actorUserId: 'a1',
    });
    expect(suspend).not.toHaveBeenCalled();
    // Resume short-circuits: the recommend pipeline is NOT re-run.
    expect(recommender.inputs).toHaveLength(0);
  });

  it('resume reject: does not assign and returns { assigned:false }', async () => {
    const { tool, assign } = build();
    const { ctx } = resumeCtx({ decision: 'reject' });
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      ctx,
    )) as {
      assigned: boolean;
    };
    expect(out).toEqual({ assigned: false });
    expect(assign.assign).not.toHaveBeenCalled();
  });

  it('resume non-reject with empty overrideUserIds: defensive no-op { assigned:false }', async () => {
    const { tool, assign } = build();
    const { ctx } = resumeCtx({ decision: 'approve', overrideUserIds: [] });
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      ctx,
    )) as {
      assigned: boolean;
    };
    expect(out).toEqual({ assigned: false });
    expect(assign.assign).not.toHaveBeenCalled();
  });
});
