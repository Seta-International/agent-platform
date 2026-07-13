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

/**
 * A latch that opens once `arrivalsNeeded` callers have reached it; every caller (before and
 * after the open) awaits the same promise, so callers past the threshold resolve immediately.
 * Used to force two transactions to both finish their SELECT before either issues its INSERT.
 */
function insertLatch(arrivalsNeeded: number): () => Promise<void> {
  let arrivals = 0;
  let release: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrivals += 1;
    if (arrivals >= arrivalsNeeded) release();
    await opened;
  };
}

/**
 * Wraps a transaction so the FIRST `insert(...).values(...)` issued through it does not reach
 * Postgres until `arrive()` resolves. drizzle's `.values()` returns a `PgInsertBase` (extends
 * `QueryPromise`); `.onConflictDoNothing()`/`.returning()` mutate and return that same instance,
 * so patching `.then` once, right after `.values()`, gates the query regardless of how the rest
 * of the chain is built — nothing actually executes until the patched `.then` is awaited. This
 * is how we deterministically interleave two transactions: both run their SELECT (each sees the
 * worker unlinked, since neither has committed), then both attempt the INSERT — the second one
 * blocks on the unique index until the first commits, then no-ops via ON CONFLICT DO NOTHING.
 */
function gateFirstInsert<T extends object>(tx: T, arrive: () => Promise<void>): T {
  let gated = false;
  return new Proxy(tx, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== 'insert' || typeof value !== 'function' || gated) {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (...insertArgs: unknown[]) => {
        // biome-ignore lint/suspicious/noExplicitAny: drizzle's insert builder has no shared interface across `.values`/`.onConflictDoNothing`/`.returning` worth typing out for a test gate.
        const builder: any = (value as (...a: unknown[]) => unknown).apply(target, insertArgs);
        const originalValues = builder.values.bind(builder);
        builder.values = (...valuesArgs: unknown[]) => {
          const base = originalValues(...valuesArgs);
          if (!gated) {
            gated = true;
            const originalThen = base.then.bind(base);
            // biome-ignore lint/suspicious/noThenProperty: intentionally patching the QueryPromise's thenable so the query is deferred until the latch opens — that deferral is the whole point of the gate.
            base.then = (...thenArgs: unknown[]) => arrive().then(() => originalThen(...thenArgs));
          }
          return base;
        };
        return builder;
      };
    },
  }) as T;
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

  it('is idempotent under concurrent redelivery — same event twice, no duplicate, no throw', async () => {
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

        // Genuine concurrency, not a sequential loop: two separately-committing
        // transactions both run the SELECT before either INSERTs (the latch holds
        // every INSERT until both have arrived), so both see the worker unlinked and
        // both proceed to insert. The loser blocks on the unique index until the
        // winner commits, then `onConflictDoNothing` (no arbiter) takes the empty-
        // `returning` early exit. Exactly one row, one event, neither call throws.
        const arrive = insertLatch(2);
        const run = () =>
          peopleDb().transaction((tx) =>
            emitContext.run({ tx: tx as never, causedByEventId: eventId, traceId: undefined }, () =>
              linkUserToPerson.handler(evt, { tx: gateFirstInsert(tx, arrive) } as never),
            ),
          );

        const results = await Promise.allSettled([run(), run()]);
        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);

        const rows = await peopleDb()
          .select()
          .from(userProjection)
          .where(eq(userProjection.user_id, userId));
        expect(rows).toHaveLength(1);

        const events = await readEvents(pool, t.tenant_id, 'people.worker.user_linked');
        expect(events).toHaveLength(1);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not steal under concurrency — two users racing the same worker link exactly one', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await createWorker({
          full_name: 'Di',
          work_email: 'di@seta.test',
          session: t.adminSession,
        });
        const userA = crypto.randomUUID();
        const userB = crypto.randomUUID();
        const eventA = crypto.randomUUID();
        const eventB = crypto.randomUUID();

        // Two DIFFERENT user_ids, same work_email, racing for the same worker. Both
        // SELECTs run before either INSERT (the latch), so `notExists` passes for
        // both. The loser's insert collides on user_projection_uniq_person
        // (tenant_id, person_id) — NOT on the user_id PK, since the user_ids differ.
        // Unqualified `onConflictDoNothing` still no-ops it: exactly one user is
        // linked to the worker, exactly one event is emitted, and neither call throws
        // (a user_id-arbitered ON CONFLICT would raise 23505 here — that is the bug
        // this fix closes and the mutation test below proves).
        const arrive = insertLatch(2);
        const run = (user_id: string, event_id: string) =>
          peopleDb().transaction((tx) =>
            emitContext.run(
              { tx: tx as never, causedByEventId: event_id, traceId: undefined },
              () =>
                linkUserToPerson.handler(
                  userCreatedEvent({
                    id: event_id,
                    tenant_id: t.tenant_id,
                    user_id,
                    email: 'di@seta.test',
                  }),
                  { tx: gateFirstInsert(tx, arrive) } as never,
                ),
            ),
          );

        const results = await Promise.allSettled([run(userA, eventA), run(userB, eventB)]);
        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);

        const rows = await peopleDb()
          .select()
          .from(userProjection)
          .where(eq(userProjection.tenant_id, t.tenant_id));
        expect(rows).toHaveLength(1);
        expect([userA, userB]).toContain(rows[0]?.user_id);

        const events = await readEvents(pool, t.tenant_id, 'people.worker.user_linked');
        expect(events).toHaveLength(1);
        expect(events[0]?.payload.user_id).toBe(rows[0]?.user_id);
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
