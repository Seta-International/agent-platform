import { describe, expect, it } from 'vitest';
import { queryAudit } from '../../src/backend/audit.ts';
import { resetCoreDb } from '../../src/db/client.ts';
import { emit, withEmit } from '../../src/events/index.ts';
import { withCoreTestDb } from '../helpers.ts';

async function seedAuditEvents(tenantId: string): Promise<void> {
  await withEmit({ actor: { userId: 'u1', tenantId } }, async () => {
    await emit({
      tenantId,
      aggregateType: 'identity.user',
      aggregateId: crypto.randomUUID(),
      eventType: 'identity.user.created',
      eventVersion: 1,
      payload: { name: 'alice' },
    });
    await emit({
      tenantId,
      aggregateType: 'identity.user',
      aggregateId: crypto.randomUUID(),
      eventType: 'identity.user.deactivated',
      eventVersion: 1,
      payload: { name: 'bob' },
    });
    await emit({
      tenantId,
      aggregateType: 'identity.role_grant',
      aggregateId: crypto.randomUUID(),
      eventType: 'identity.role_grant.changed',
      eventVersion: 1,
      payload: { role: 'admin' },
    });
  });
}

describe('queryAudit() sort param', () => {
  it('defaults to occurred_at DESC', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      await seedAuditEvents(tenantId);

      const result = await queryAudit({
        tenant_id: tenantId,
        limit: 50,
        offset: 0,
      });

      expect(result.total).toBe(3);
      const times = result.rows.map((r) => r.occurred_at);
      const sorted = [...times].sort().reverse();
      expect(times).toEqual(sorted);
    });
  });

  it('sorts by event_type asc when requested', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      await seedAuditEvents(tenantId);

      const result = await queryAudit({
        tenant_id: tenantId,
        limit: 50,
        offset: 0,
        sort_by: 'event_type',
        sort_dir: 'asc',
      });

      expect(result.rows.map((r) => r.event_type)).toEqual([
        'identity.role_grant.changed',
        'identity.user.created',
        'identity.user.deactivated',
      ]);
    });
  });

  it('sorts by event_type desc when requested', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      await seedAuditEvents(tenantId);

      const result = await queryAudit({
        tenant_id: tenantId,
        limit: 50,
        offset: 0,
        sort_by: 'event_type',
        sort_dir: 'desc',
      });

      expect(result.rows.map((r) => r.event_type)).toEqual([
        'identity.user.deactivated',
        'identity.user.created',
        'identity.role_grant.changed',
      ]);
    });
  });

  it('respects from/to time filters with sort', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      await seedAuditEvents(tenantId);

      const future = new Date(Date.now() + 60_000).toISOString();
      const result = await queryAudit({
        tenant_id: tenantId,
        limit: 50,
        offset: 0,
        from: future,
      });

      expect(result.total).toBe(0);
      expect(result.rows).toHaveLength(0);
    });
  });
});
