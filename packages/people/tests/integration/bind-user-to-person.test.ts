import { emitContext } from '@seta/core/events';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person } from '../../src/backend/db/schema.ts';
import { bindUserToPerson } from '../../src/backend/subscribers/bind-user-to-person.ts';
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

describe('bindUserToPerson', () => {
  it('binds person.user_id to the unlinked worker with the matching work_email', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Bind Me',
          work_email: 'bind.me@example.test',
          session: t.adminSession,
        });
        const userId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        await peopleDb().transaction(async (tx) => {
          await emitContext.run(
            { tx: tx as never, causedByEventId: eventId, traceId: undefined },
            () =>
              bindUserToPerson.handler(
                userCreatedEvent({
                  id: eventId,
                  tenant_id: t.tenant_id,
                  user_id: userId,
                  email: 'bind.me@example.test',
                }),
                { tx } as never,
              ),
          );
        });
        const [p] = await peopleDb().select().from(person).where(eq(person.id, worker_id));
        expect(p?.user_id).toBe(userId);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('emits people.worker.user_linked with worker_id/person_id/user_id/tenant_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await createWorker({
          full_name: 'Link Me',
          work_email: 'link.me@example.test',
          session: t.adminSession,
        });
        const userId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        await peopleDb().transaction(async (tx) => {
          await emitContext.run(
            { tx: tx as never, causedByEventId: eventId, traceId: undefined },
            () =>
              bindUserToPerson.handler(
                userCreatedEvent({
                  id: eventId,
                  tenant_id: t.tenant_id,
                  user_id: userId,
                  email: 'link.me@example.test',
                }),
                { tx } as never,
              ),
          );
        });
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

  it('is a no-op when no worker matches (never creates a person, never emits)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await peopleDb().transaction(async (tx) => {
          await bindUserToPerson.handler(
            userCreatedEvent({
              id: crypto.randomUUID(),
              tenant_id: t.tenant_id,
              user_id: crypto.randomUUID(),
              email: 'nobody@example.test',
            }),
            { tx } as never,
          );
        });
        const persons = await peopleDb().select().from(person);
        expect(persons).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
