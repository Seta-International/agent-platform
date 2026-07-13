import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { userProjection } from '../../src/backend/db/schema.ts';
import {
  userDeactivatedSynced,
  userReactivatedSynced,
} from '../../src/backend/subscribers/sync-user-status.ts';
import { seedPersons, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function deactivatedEvent(args: {
  tenant_id: string;
  user_id: string;
  deactivated_at: string;
}): DomainEvent<{ user_id: string; tenant_id: string; deactivated_at: string }> {
  return {
    id: crypto.randomUUID(),
    tenantId: args.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.user_id,
    eventType: 'identity.user.deactivated',
    eventVersion: 1,
    payload: {
      user_id: args.user_id,
      tenant_id: args.tenant_id,
      deactivated_at: args.deactivated_at,
    },
  } as never;
}

function reactivatedEvent(args: {
  tenant_id: string;
  user_id: string;
}): DomainEvent<{ user_id: string; tenant_id: string }> {
  return {
    id: crypto.randomUUID(),
    tenantId: args.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.user_id,
    eventType: 'identity.user.reactivated',
    eventVersion: 1,
    payload: { user_id: args.user_id, tenant_id: args.tenant_id },
  } as never;
}

describe('sync-user-status subscribers', () => {
  it('sets deactivated_at on identity.user.deactivated, clears it on identity.user.reactivated', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const personId = crypto.randomUUID();
        const userId = crypto.randomUUID();
        await seedPersons(t.tenant_id, personId);
        await peopleDb()
          .insert(userProjection)
          .values({ user_id: userId, tenant_id: t.tenant_id, person_id: personId });

        const deactivatedAt = new Date().toISOString();
        await peopleDb().transaction((tx) =>
          userDeactivatedSynced.handler(
            deactivatedEvent({
              tenant_id: t.tenant_id,
              user_id: userId,
              deactivated_at: deactivatedAt,
            }),
            { tx } as never,
          ),
        );

        let [row] = await peopleDb()
          .select()
          .from(userProjection)
          .where(
            and(eq(userProjection.user_id, userId), eq(userProjection.tenant_id, t.tenant_id)),
          );
        expect(row?.deactivated_at?.toISOString()).toBe(deactivatedAt);

        await peopleDb().transaction((tx) =>
          userReactivatedSynced.handler(
            reactivatedEvent({ tenant_id: t.tenant_id, user_id: userId }),
            { tx } as never,
          ),
        );

        [row] = await peopleDb()
          .select()
          .from(userProjection)
          .where(
            and(eq(userProjection.user_id, userId), eq(userProjection.tenant_id, t.tenant_id)),
          );
        expect(row?.deactivated_at).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is a no-op when the user has no user_projection row', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const userId = crypto.randomUUID();

        await expect(
          peopleDb().transaction((tx) =>
            userDeactivatedSynced.handler(
              deactivatedEvent({
                tenant_id: t.tenant_id,
                user_id: userId,
                deactivated_at: new Date().toISOString(),
              }),
              { tx } as never,
            ),
          ),
        ).resolves.toBeUndefined();

        const rows = await peopleDb()
          .select()
          .from(userProjection)
          .where(eq(userProjection.user_id, userId));
        expect(rows).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
