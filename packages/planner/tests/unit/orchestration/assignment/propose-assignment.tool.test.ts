import { RequestContext } from '@mastra/core/request-context';
import { EMPTY_TRUST, type SpecializedAgentSpec } from '@seta/agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { makeProposeAssignmentTool } from '../../../../src/backend/orchestration/assignment/propose-assignment.tool.ts';

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
  relevanceScore: 1,
  score: 0.97,
};

function build(
  opts: { recommendations?: unknown[]; memberIds?: string[]; assignedIds?: string[] } = {},
) {
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
  // Group-scope gate double: returns the task's owning-group member userIds.
  // Defaults to [U1] so the happy-path suspends as before.
  const groupScope = {
    memberIdsForTask: vi.fn(async () => opts.memberIds ?? [U1]),
  };
  // TaskAssignees gate double: user_ids already on the task, excluded from the
  // suggestion set. Defaults to [] so the happy-path suspends unchanged.
  const taskAssignees = {
    currentAssigneeIds: vi.fn(async () => opts.assignedIds ?? []),
  };
  const tool = makeProposeAssignmentTool({
    taskAnalyzer: taskAnalyzer.spec as never,
    skillMatcher: skillMatcher.spec as never,
    avaiChecker: avaiChecker.spec as never,
    recommender: recommender.spec as never,
    assign,
    groupScope,
    taskAssignees,
    ctx: { tenantId: 't1', actorUserId: 'a1' },
  });
  return {
    tool,
    taskAnalyzer,
    skillMatcher,
    avaiChecker,
    recommender,
    assign,
    groupScope,
    taskAssignees,
  };
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

  it('first call: drops recommendations whose user is NOT in the task group, and does NOT suspend when none remain', async () => {
    // Recommender surfaces U1, but U1 is not a member of the task's owning group.
    const { tool, groupScope } = build({ memberIds: ['someone-else'] });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      firstPassCtx(suspend),
    )) as { assigned: boolean; recommendations?: unknown[] };
    expect(groupScope.memberIdsForTask).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ tenantId: 't1', actorUserId: 'a1' }),
    );
    expect(suspend).not.toHaveBeenCalled();
    expect(out).toEqual({ assigned: false, recommendations: [] });
  });

  it('first call: keeps only in-group recommendations in the suspend card', async () => {
    const U2 = 'c0ffee00-0000-4000-8000-000000000002';
    const OTHER = { ...RECOMMENDATION, userId: U2, name: 'Bob' };
    // Two recommendations; only U1 is a group member → card carries U1 alone.
    const { tool } = build({ recommendations: [OTHER, RECOMMENDATION], memberIds: [U1] });
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (payload: unknown) => {
      suspended = payload as { card?: unknown };
    });
    await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      firstPassCtx(suspend),
    );
    expect(suspend).toHaveBeenCalledTimes(1);
    const card = suspended?.card as {
      primary: { argsPatch: Record<string, unknown> };
      details: Array<{ kind: string; items?: Array<{ id: string }> }>;
    };
    expect(card.primary.argsPatch.assigneeUserIds).toEqual([U1]);
    const list = card.details.find((d) => d.kind === 'entityList');
    expect(list?.items?.map((i) => i.id)).toEqual([U1]);
  });

  it('first call: drops recommendations whose user is ALREADY assigned to the task', async () => {
    const U2 = 'c0ffee00-0000-4000-8000-000000000002';
    const OTHER = { ...RECOMMENDATION, userId: U2, name: 'Bob' };
    // Both in-group, but U1 is already assigned → card carries U2 alone.
    const { tool, taskAssignees } = build({
      recommendations: [RECOMMENDATION, OTHER],
      memberIds: [U1, U2],
      assignedIds: [U1],
    });
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (payload: unknown) => {
      suspended = payload as { card?: unknown };
    });
    await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      firstPassCtx(suspend),
    );
    expect(taskAssignees.currentAssigneeIds).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ tenantId: 't1', actorUserId: 'a1' }),
    );
    expect(suspend).toHaveBeenCalledTimes(1);
    const card = suspended?.card as {
      primary: { argsPatch: Record<string, unknown> };
      details: Array<{ kind: string; items?: Array<{ id: string }> }>;
    };
    expect(card.primary.argsPatch.assigneeUserIds).toEqual([U2]);
    const list = card.details.find((d) => d.kind === 'entityList');
    expect(list?.items?.map((i) => i.id)).toEqual([U2]);
  });

  it('first call: does NOT suspend when every recommendation is already assigned', async () => {
    const { tool } = build({ memberIds: [U1], assignedIds: [U1] });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      firstPassCtx(suspend),
    )) as { assigned: boolean; recommendations?: unknown[] };
    expect(suspend).not.toHaveBeenCalled();
    expect(out).toEqual({ assigned: false, recommendations: [] });
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
