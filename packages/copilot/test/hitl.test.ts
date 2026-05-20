import { describe, expect, it } from 'vitest';
import {
  approveHitl,
  expireHitl,
  findPendingExpired,
  insertHitl,
  rejectHitl,
} from '../src/backend/hitl.ts';
import { copilotDb } from '../src/db/index.ts';
import { withCopilotTestDb } from './test-helpers.ts';

const baseRow = {
  callId: 'call-1',
  threadId: 'thread-1',
  tenantId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  toolName: 'identity.updateMyDisplayName',
  input: { displayName: 'New' },
  requiredPermission: 'identity.user.write.self',
  expiresAt: new Date(Date.now() + 60_000),
};

describe('hitl lifecycle', () => {
  it('inserts a pending row', async () => {
    await withCopilotTestDb(async () => {
      await insertHitl(baseRow);
      const db = copilotDb();
      const rows = await db.query.hitlCalls.findMany();
      expect(rows.length).toBe(1);
      expect(rows[0]?.status).toBe('pending');
    });
  });

  it('approve transitions pending → approved with outcome', async () => {
    await withCopilotTestDb(async () => {
      await insertHitl(baseRow);
      const result = await approveHitl({
        callId: 'call-1',
        userId: baseRow.userId,
        outcome: { ok: true },
      });
      expect(result.status).toBe('approved');
      expect(result.outcome).toEqual({ ok: true });
    });
  });

  it('double-approve returns the cached outcome (idempotent)', async () => {
    await withCopilotTestDb(async () => {
      await insertHitl(baseRow);
      const first = await approveHitl({
        callId: 'call-1',
        userId: baseRow.userId,
        outcome: { ok: true },
      });
      const second = await approveHitl({
        callId: 'call-1',
        userId: baseRow.userId,
        outcome: { ok: false },
      });
      expect(second).toEqual(first);
    });
  });

  it('reject after approve returns hitl_expired', async () => {
    await withCopilotTestDb(async () => {
      await insertHitl(baseRow);
      await approveHitl({ callId: 'call-1', userId: baseRow.userId, outcome: { ok: true } });
      await expect(
        rejectHitl({ callId: 'call-1', userId: baseRow.userId, note: 'nope' }),
      ).rejects.toMatchObject({ code: 'hitl_expired' });
    });
  });

  it('expire transitions pending → expired', async () => {
    await withCopilotTestDb(async () => {
      await insertHitl({
        ...baseRow,
        callId: 'call-2',
        expiresAt: new Date(Date.now() - 1_000),
      });
      await expireHitl({ callId: 'call-2' });
      const db = copilotDb();
      const [row] = await db.query.hitlCalls.findMany({
        where: (t, ops) => ops.eq(t.callId, 'call-2'),
      });
      expect(row?.status).toBe('expired');
    });
  });

  it('cross-user approve returns not_found (do not leak existence)', async () => {
    await withCopilotTestDb(async () => {
      await insertHitl(baseRow);
      await expect(
        approveHitl({
          callId: 'call-1',
          userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          outcome: {},
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
    });
  });

  it('findPendingExpired returns due rows', async () => {
    await withCopilotTestDb(async () => {
      await insertHitl({
        ...baseRow,
        callId: 'call-due',
        expiresAt: new Date(Date.now() - 5_000),
      });
      await insertHitl({
        ...baseRow,
        callId: 'call-future',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const due = await findPendingExpired();
      const dueIds = due.map((r) => r.callId);
      expect(dueIds).toContain('call-due');
      expect(dueIds).not.toContain('call-future');
    });
  });
});
