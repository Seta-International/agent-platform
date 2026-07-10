import { emitContext } from '@seta/core/events';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { userProjection } from '../../src/backend/db/schema.ts';
import { linkUserToPerson } from '../../src/backend/subscribers/link-user-to-person.ts';
import { createWorker } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function userCreatedEvent(args: {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string;
}): DomainEvent<{ after: { user_id: string; tenant_id: string; email: string; name: string } }> {
  return {
    id: args.id,
    tenantId: args.tenant_id,
    aggregateType: 'identity.user',
    aggregateId: args.user_id,
    eventType: 'identity.user.created',
    eventVersion: 1,
    payload: {
      after: { user_id: args.user_id, tenant_id: args.tenant_id, email: args.email, name: 'X' },
    },
  } as never;
}

describe('linkUserToPerson', () => {
  it('links the worker holding that work_email, writes user_projection, and emits people.worker.user_linked', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Ana',
          work_email: 'ana@seta.test',
          session: t.adminSession,
        });
        const userId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        await peopleDb().transaction(async (tx) => {
          await emitContext.run(
            { tx: tx as never, causedByEventId: eventId, traceId: undefined },
            () =>
              linkUserToPerson.handler(
                userCreatedEvent({
                  id: eventId,
                  tenant_id: t.tenant_id,
                  user_id: userId,
                  email: 'Ana@Seta.Test',
                }),
                { tx } as never,
              ),
          );
        });

        const [row] = await peopleDb()
          .select()
          .from(userProjection)
          .where(
            and(eq(userProjection.user_id, userId), eq(userProjection.tenant_id, t.tenant_id)),
          );
        expect(row?.person_id).toBe(worker_id);

        const rows = await readEvents(pool, t.tenant_id, 'people.worker.user_linked');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.payload).toMatchObject({
          worker_id,
          person_id: worker_id,
          user_id: userId,
          tenant_id: t.tenant_id,
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is idempotent — a redelivered event does not fail or duplicate', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await createWorker({
          full_name: 'Bo',
          work_email: 'bo@seta.test',
          session: t.adminSession,
        });
        const userId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        const evt = userCreatedEvent({
          id: eventId,
          tenant_id: t.tenant_id,
          user_id: userId,
          email: 'bo@seta.test',
        });

        for (let i = 0; i < 2; i++) {
          await peopleDb().transaction(async (tx) => {
            await emitContext.run(
              { tx: tx as never, causedByEventId: eventId, traceId: undefined },
              () => linkUserToPerson.handler(evt, { tx } as never),
            );
          });
        }

        const rows = await peopleDb()
          .select()
          .from(userProjection)
          .where(eq(userProjection.user_id, userId));
        expect(rows).toHaveLength(1);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is a no-op when no worker matches (never creates a person, never links)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const userId = crypto.randomUUID();
        await peopleDb().transaction(async (tx) => {
          await linkUserToPerson.handler(
            userCreatedEvent({
              id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              user_id: userId,
              email: 'nobody@seta.test',
            }),
            { tx } as never,
          );
        });

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

  it('does not steal a person already linked to another user', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Cy',
          work_email: 'cy@seta.test',
          session: t.adminSession,
        });
        const first = crypto.randomUUID();
        const second = crypto.randomUUID();
        await peopleDb()
          .insert(userProjection)
          .values({ user_id: first, person_id: worker_id, tenant_id: t.tenant_id });

        const eventId = crypto.randomUUID();
        await peopleDb().transaction(async (tx) => {
          await emitContext.run(
            { tx: tx as never, causedByEventId: eventId, traceId: undefined },
            () =>
              linkUserToPerson.handler(
                userCreatedEvent({
                  id: eventId,
                  tenant_id: t.tenant_id,
                  user_id: second,
                  email: 'cy@seta.test',
                }),
                { tx } as never,
              ),
          );
        });

        const rows = await peopleDb()
          .select()
          .from(userProjection)
          .where(eq(userProjection.person_id, worker_id));
        expect(rows).toHaveLength(1);
        expect(rows[0]?.user_id).toBe(first);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
