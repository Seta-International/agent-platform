import { describe, expect, it } from 'vitest';
import { resolveQueryAssignee } from '../../../src/backend/agent-tools/query-tasks.ts';

describe('resolveQueryAssignee', () => {
  const actor = { user_id: 'caller-uuid' };

  it("returns the caller's id when scope is 'me' (ignores any supplied id)", () => {
    expect(resolveQueryAssignee(actor, { assigneeScope: 'me' })).toBe('caller-uuid');
    expect(
      resolveQueryAssignee(actor, { assigneeScope: 'me', assigneeUserId: 'someone-else' }),
    ).toBe('caller-uuid');
  });

  it('returns the explicit assigneeUserId when scope is not me', () => {
    expect(resolveQueryAssignee(actor, { assigneeUserId: 'target-uuid' })).toBe('target-uuid');
  });

  it('returns undefined when neither is set', () => {
    expect(resolveQueryAssignee(actor, {})).toBeUndefined();
  });
});
