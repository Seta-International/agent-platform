import { describe, expect, it } from 'vitest';
import { resolveCountUserId } from '../../../src/backend/agent-tools/get-open-task-count.ts';

describe('resolveCountUserId', () => {
  const session = { user_id: 'caller-uuid' };

  it("uses the caller's id for scope 'me'", () => {
    expect(resolveCountUserId(session, { scope: 'me' })).toBe('caller-uuid');
  });

  it('uses the explicit userId otherwise', () => {
    expect(resolveCountUserId(session, { userId: 'target-uuid' })).toBe('target-uuid');
  });

  it('throws when neither scope nor userId is provided', () => {
    expect(() => resolveCountUserId(session, {})).toThrow(/userId/);
  });
});
