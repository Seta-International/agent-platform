import { describe, expect, it } from 'vitest';
import { makeActionTools } from '../../../../src/backend/orchestration/action/orchestrator.tools.ts';

describe('the A2 allowlist', () => {
  it('is exactly nine tools — three reads to locate, six writes', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools).sort()).toEqual([
      'planner_assignTask',
      'planner_commentTask',
      'planner_createTask',
      'planner_getTask',
      'planner_linkTasks',
      'planner_mergeTasks',
      'planner_queryTasks',
      'planner_resolveMember',
      'planner_updateTask',
    ]);
  });

  // Structural, not prompt-enforced: the delete tool is unreachable because it
  // is not here, and creating still is not A2's job on this branch.
  // planner_createTask used to belong on this list. FUT-821 gives A2 the create
  // tool, so the only structurally unreachable one left is purge — which is the
  // point of the allowlist and must never be relaxed.
  it('still exposes no purge tool', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools)).not.toContain('planner_purgeTask');
  });

  // The legacy tool stays where it is; it must not leak into A2, where it would
  // be the only tool that writes before the card.
  it('does not expose the legacy postComment tool', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never });
    expect(Object.keys(tools)).not.toContain('planner_postComment');
  });
});

// EV-08 invariant 2, and the reason "zero changes without a confirmation" is
// structural rather than sampled: a write tool that forgot its suspend/resume
// pair would act on the first pass, which is exactly the shape an injected
// instruction needs.
//
// Deliberately a test over the ALLOWLIST rather than a list of tool names:
// adding a tenth write tool without a card must fail here, on the day it is
// added, without anybody remembering to update this file.
describe('every A2 write tool confirms before it writes', () => {
  const READ_ONLY = new Set(['planner_getTask', 'planner_queryTasks', 'planner_resolveMember']);

  it('declares suspendSchema and resumeSchema on every write tool', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never }) as Record<
      string,
      { suspendSchema?: unknown; resumeSchema?: unknown }
    >;
    const writeTools = Object.entries(tools).filter(([id]) => !READ_ONLY.has(id));

    // If this number stops matching, either a write tool was added (update the
    // count and make sure it suspends) or a read tool was added (add it to
    // READ_ONLY, and justify that in review).
    expect(writeTools).toHaveLength(6);

    for (const [id, tool] of writeTools) {
      expect(tool.suspendSchema, `${id} must suspend before it writes`).toBeDefined();
      expect(tool.resumeSchema, `${id} must read its decision off the card`).toBeDefined();
    }
  });

  it('the read tools declare no suspend — they have nothing to confirm', () => {
    const tools = makeActionTools({ ports: {} as never, ctx: {} as never }) as Record<
      string,
      { suspendSchema?: unknown }
    >;
    for (const id of READ_ONLY) {
      expect(tools[id]?.suspendSchema, `${id} should not suspend`).toBeUndefined();
    }
  });
});
