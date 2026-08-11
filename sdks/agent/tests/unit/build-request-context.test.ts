import { describe, expect, it } from 'vitest';
import { buildAgentRequestContext, RC_THREAD_ID } from '../../src/request-context.ts';

const ACTOR = '9f1c7a2e-5b3d-4c8f-9a1e-2d4b6c8e0f11';
const TENANT = 'cba21d34-77aa-4e91-8b0c-1f2e3d4c5b6a';
const THREAD = '8fa0fa15-1c2b-4d3e-9f80-a1b2c3d4e5f6';

describe('buildAgentRequestContext', () => {
  it('sets the four entries every agent invocation needs', () => {
    const perms = new Set(['planner.task.update']);
    const rc = buildAgentRequestContext({
      actorUserId: ACTOR,
      tenantId: TENANT,
      effectivePermissions: perms,
      threadId: THREAD,
    });
    expect(rc.get('actor')).toEqual({ type: 'user', user_id: ACTOR });
    expect(rc.get('tenant_id')).toBe(TENANT);
    expect(rc.get('effective_permissions')).toBe(perms);
    expect(rc.get(RC_THREAD_ID)).toBe(THREAD);
  });

  it('carries the thread id, which is the entry every hand-rolled site kept dropping', () => {
    // FUT-859: without it recordEntityExposure and resolveTaskRef both no-op in
    // silence, so ordinals and task names stop resolving with nothing logged.
    const rc = buildAgentRequestContext({
      actorUserId: ACTOR,
      tenantId: TENANT,
      threadId: THREAD,
    });
    expect(rc.get(RC_THREAD_ID)).toBe(THREAD);
  });

  it('omits the thread id when there is no chat thread, rather than writing a blank', () => {
    // Workflow and cron runs have no conversation; a '' entry would shard entity
    // state under a junk key instead of no-opping.
    for (const threadId of [undefined, '']) {
      const rc = buildAgentRequestContext({ actorUserId: ACTOR, tenantId: TENANT, threadId });
      expect(rc.get(RC_THREAD_ID)).toBeUndefined();
    }
  });

  it('defaults permissions to an empty set so a callee never sees undefined', () => {
    const rc = buildAgentRequestContext({ actorUserId: ACTOR, tenantId: TENANT });
    expect(rc.get('effective_permissions')).toEqual(new Set());
  });

  it('returns a fresh context per call, so one turn cannot mutate another turn', () => {
    const a = buildAgentRequestContext({ actorUserId: ACTOR, tenantId: TENANT, threadId: THREAD });
    const b = buildAgentRequestContext({ actorUserId: ACTOR, tenantId: TENANT });
    expect(a).not.toBe(b);
    expect(b.get(RC_THREAD_ID)).toBeUndefined();
  });
});
