import { describe, expect, it } from 'vitest';
import { insertHitl } from '../src/backend/hitl.ts';
import { expireDuePending } from '../src/backend/workers/hitl-expire.ts';
import { copilotDb } from '../src/db/index.ts';
import { withCopilotTestDb } from './test-helpers.ts';

describe('expireDuePending', () => {
  it('marks all due pending rows as expired and emits events', async () => {
    await withCopilotTestDb(async () => {
      await insertHitl({
        callId: 'c1',
        threadId: 't1',
        tenantId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        toolName: 'identity.updateMyDisplayName',
        input: {},
        requiredPermission: 'identity.user.write.self',
        expiresAt: new Date(Date.now() - 5_000),
      });
      const events: string[] = [];
      const expired = await expireDuePending({
        emit: async (e) => {
          events.push(e.type);
        },
      });
      expect(expired).toBe(1);
      expect(events).toContain('copilot.hitl.expired');
      const db = copilotDb();
      const [row] = await db.query.hitlCalls.findMany({
        where: (t, ops) => ops.eq(t.callId, 'c1'),
      });
      expect(row?.status).toBe('expired');
    });
  });

  it('does nothing when no rows are due', async () => {
    await withCopilotTestDb(async () => {
      await insertHitl({
        callId: 'c2',
        threadId: 't2',
        tenantId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        toolName: 'identity.updateMyDisplayName',
        input: {},
        requiredPermission: 'identity.user.write.self',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const events: string[] = [];
      const expired = await expireDuePending({
        emit: async (e) => {
          events.push(e.type);
        },
      });
      expect(expired).toBe(0);
      expect(events).toEqual([]);
    });
  });
});
