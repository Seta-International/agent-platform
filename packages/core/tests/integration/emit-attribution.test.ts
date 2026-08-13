import { describe, expect, it } from 'vitest';
import { queryAudit } from '../../src/backend/audit.ts';
import { resetCoreDb } from '../../src/db/client.ts';
import { emit, emitContext, withEmit } from '../../src/events/index.ts';
import { withCoreTestDb } from '../helpers.ts';

describe('emit() attribution', () => {
  it('actorKind and onBehalfOf reach core.events.actor and come back through queryAudit()', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const agentUserId = crypto.randomUUID();
      const humanUserId = crypto.randomUUID();
      const aggregateId = crypto.randomUUID();

      await withEmit(
        {
          actor: {
            userId: agentUserId,
            tenantId,
            actorKind: 'agent',
            onBehalfOf: humanUserId,
          },
        },
        async () => {
          await emit({
            tenantId,
            aggregateType: 'test.entity',
            aggregateId,
            eventType: 'test.entity.agent-written',
            eventVersion: 1,
            payload: {},
          });
        },
      );

      const { rows } = await queryAudit({ tenant_id: tenantId, limit: 10, offset: 0 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.actor).toMatchObject({
        user_id: agentUserId,
        tenant_id: tenantId,
        actor_kind: 'agent',
        on_behalf_of: humanUserId,
      });
    });
  });

  it('omitting the new fields still records actor kind "user"', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();

      await withEmit({ actor: { userId, tenantId } }, async () => {
        await emit({
          tenantId,
          aggregateType: 'test.entity',
          aggregateId: crypto.randomUUID(),
          eventType: 'test.entity.human-written',
          eventVersion: 1,
          payload: {},
        });
      });

      const { rows } = await queryAudit({ tenant_id: tenantId, limit: 10, offset: 0 });
      const actor = rows[0]?.actor as Record<string, unknown> | undefined;
      expect(actor).toMatchObject({ user_id: userId, actor_kind: 'user' });
      expect(actor?.on_behalf_of).toBeUndefined();
    });
  });
});

describe('emit() before/after capture', () => {
  it('writes EmitCtx before/after into the columns, readable through queryAudit()', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();

      await withEmit({ actor: { userId: crypto.randomUUID(), tenantId } }, async () => {
        const ctx = emitContext.getStore();
        if (!ctx) throw new Error('emit context missing');
        ctx.before = { status: 'not_started' };
        ctx.after = { status: 'in_progress' };
        await emit({
          tenantId,
          aggregateType: 'test.entity',
          aggregateId: crypto.randomUUID(),
          eventType: 'test.entity.diffed',
          eventVersion: 1,
          payload: {},
        });
      });

      const { rows } = await queryAudit({ tenant_id: tenantId, limit: 10, offset: 0 });
      expect(rows[0]?.before).toEqual({ status: 'not_started' });
      expect(rows[0]?.after).toEqual({ status: 'in_progress' });
    });
  });

  it('records emitted event ids on the context when the collector is present', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const collected: string[] = [];

      await withEmit({ actor: { userId: crypto.randomUUID(), tenantId } }, async () => {
        const ctx = emitContext.getStore();
        if (!ctx) throw new Error('emit context missing');
        ctx.emittedEventIds = collected;
        await emit({
          tenantId,
          aggregateType: 'test.entity',
          aggregateId: crypto.randomUUID(),
          eventType: 'test.entity.collected',
          eventVersion: 1,
          payload: {},
        });
      });

      expect(collected).toHaveLength(1);
    });
  });
});
