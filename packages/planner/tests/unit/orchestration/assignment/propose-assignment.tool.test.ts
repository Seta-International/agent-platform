import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import { makeProposeAssignmentTool } from '../../../../src/backend/orchestration/assignment/propose-assignment.tool.ts';
import type { CandidateUser } from '../../../../src/backend/workflows/assign-by-skill/schemas.ts';

const TASK_ID = '66be2be2-394d-4184-b106-c412289fd1e1';
const U1 = '0b54f3da-7be4-4d51-9b32-d0a63aa39c2b';
const U2 = 'c0ffee00-0000-4000-8000-000000000002';

function candidate(over: {
  userId: string;
  displayName?: string;
  skills?: string[];
  finalScore?: number;
}): CandidateUser {
  return {
    userId: over.userId,
    displayName: over.displayName ?? 'Alice',
    skills: over.skills ?? ['aws'],
    matchedSkills: over.skills ?? ['aws'],
    exactOverlap: 1,
    vectorScore: null,
    historyScore: null,
    historyMatches: 0,
    openTaskCount: null,
    hoursAvailableThisWeek: null,
    timezone: null,
    finalScore: over.finalScore ?? 0.9,
    rationale: 'Covers the required areas.',
  };
}

function build(opts: { candidates?: CandidateUser[]; assignedIds?: string[] } = {}) {
  // The shared assignBySkill engine already group-scopes + gates availability;
  // the stub stands in for it, returning the ranked candidates.
  const suggest = vi.fn(async () => ({
    task: { title: 'AWS migration' },
    candidates: opts.candidates ?? [candidate({ userId: U1 })],
  }));
  const assign = { assign: vi.fn(async () => {}) };
  const taskAssignees = {
    currentAssigneeIds: vi.fn(async () => opts.assignedIds ?? []),
  };
  const tool = makeProposeAssignmentTool({
    suggest,
    assign,
    taskAssignees,
    ctx: { tenantId: 't1', actorUserId: 'a1' } as never,
  });
  return { tool, suggest, assign, taskAssignees };
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
  it('first call: ranks via the shared engine and suspends with the assign card', async () => {
    const { tool, suggest } = build();
    let suspended: { card?: unknown } | undefined;
    const suspend = vi.fn(async (payload: unknown) => {
      suspended = payload as { card?: unknown };
    });
    const out = await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      firstPassCtx(suspend),
    );
    expect(out).toEqual({ assigned: false });
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith({
      taskId: TASK_ID,
      tenantId: 't1',
      actorUserId: 'a1',
    });
    const card = suspended?.card as { primary: { argsPatch: Record<string, unknown> } };
    expect(card.primary.argsPatch).toEqual({
      action: 'assign',
      assigneeUserIds: [U1],
      taskId: TASK_ID,
      idempotencyKey: expect.any(String),
    });
  });

  it('first call: drops candidates ALREADY assigned to the task', async () => {
    // Both ranked, but U1 is already assigned → card carries U2 alone.
    const { tool, taskAssignees } = build({
      candidates: [candidate({ userId: U1 }), candidate({ userId: U2, displayName: 'Bob' })],
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

  it('first call: does NOT suspend when every candidate is already assigned', async () => {
    const { tool } = build({ candidates: [candidate({ userId: U1 })], assignedIds: [U1] });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      firstPassCtx(suspend),
    )) as { assigned: boolean; recommendations?: unknown[] };
    expect(suspend).not.toHaveBeenCalled();
    expect(out).toEqual({ assigned: false, recommendations: [] });
  });

  it('first call with no candidates: returns { assigned:false } and does NOT suspend', async () => {
    const { tool } = build({ candidates: [] });
    const suspend = vi.fn(async () => {});
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'AWS migration' } as never,
      firstPassCtx(suspend),
    )) as { assigned: boolean; recommendations?: unknown[] };
    expect(suspend).not.toHaveBeenCalled();
    expect(out).toEqual({ assigned: false, recommendations: [] });
  });

  it('resume short-circuits: the recommend pipeline is NOT re-run', async () => {
    const { tool, suggest } = build();
    const { ctx, suspend } = resumeCtx({
      action: 'assign',
      taskId: TASK_ID,
      assigneeUserIds: [U1],
      idempotencyKey: 'k1',
    });
    await tool.execute!({ taskId: TASK_ID, title: 'AWS migration' } as never, ctx);
    expect(suspend).not.toHaveBeenCalled();
    expect(suggest).not.toHaveBeenCalled();
  });
});

describe('assign_proposeAssignment — resume reads the card verbatim', () => {
  it('assigns exactly the ids the chosen branch carried', async () => {
    const { tool, assign } = build();
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'T' } as never,
      resumeCtx({
        action: 'assign',
        taskId: TASK_ID,
        assigneeUserIds: [U2],
        idempotencyKey: 'k1',
      }).ctx,
    )) as { assigned: boolean };
    expect(out.assigned).toBe(true);
    expect(assign.assign).toHaveBeenCalledWith({
      taskId: TASK_ID,
      assigneeUserIds: [U2],
      tenantId: 't1',
      actorUserId: 'a1',
      idempotencyKey: 'k1',
    });
  });

  it('decline writes nothing', async () => {
    const { tool, assign } = build();
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'T' } as never,
      resumeCtx({ action: 'decline', taskId: TASK_ID, idempotencyKey: 'k1' }).ctx,
    )) as { assigned: boolean };
    expect(out).toEqual({ assigned: false });
    expect(assign.assign).not.toHaveBeenCalled();
  });

  // The set now always travels on the card, so a payload carrying none is a
  // malformed card — not a no-op to swallow and report as success.
  it('refuses an assign payload with no assignees', async () => {
    const { tool, assign } = build();
    await expect(
      tool.execute!(
        { taskId: TASK_ID, title: 'T' } as never,
        resumeCtx({
          action: 'assign',
          taskId: TASK_ID,
          assigneeUserIds: [],
          idempotencyKey: 'k1',
        }).ctx,
      ),
    ).rejects.toThrow();
    expect(assign.assign).not.toHaveBeenCalled();
  });

  // The strict resumeSchema refuses it BEFORE execute runs, so defineAgentTool
  // reports it as a structured error result rather than a rejection. What
  // matters either way: the writer is never reached.
  it('refuses a stale clients legacy decision payload', async () => {
    const { tool, assign } = build();
    const out = (await tool.execute!(
      { taskId: TASK_ID, title: 'T' } as never,
      resumeCtx({ decision: 'modify', overrideUserIds: [U2] }).ctx,
    )) as { error?: boolean };
    expect(out.error).toBe(true);
    expect(assign.assign).not.toHaveBeenCalled();
  });
});
