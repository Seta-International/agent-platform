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

        // Two invocations inside the SAME transaction: the first insert is committed
        // nowhere yet, but it IS visible to the second call's `notExists` subquery
        // (same-transaction MVCC visibility), so the second call filters the worker
        // out at the SELECT and returns at `if (!w) return` — it never reaches
        // `onConflictDoNothing`.
        //
        // This is deliberate, not an oversight: two genuinely concurrent, separately
        // committing transactions were built and run against real Postgres (gating
        // each transaction's insert behind a 2-party latch so neither's INSERT could
        // reach the server until both had already read "not linked yet" — ruling out
        // a timing fluke). That reproduction showed `onConflictDoNothing({ target:
        // userProjection.user_id })` does NOT reliably no-op the loser: a second,
        // untargeted unique index (`user_projection_uniq_person` on (tenant_id,
        // person_id)) also conflicts on the exact same row, and Postgres's ON
        // CONFLICT only suppresses violations on the named arbiter — violations on
        // any other index still raise. Redelivering the identical event threw a raw
        // 23505 in 4 of 5 trials; racing two DIFFERENT user_ids for the same person
        // (the arbiter can never match there) threw in 5 of 5 trials. So a
        // cross-transaction version of this test would be flaky at best and would
        // fail against the CURRENT, unmodified code most of the time — the opposite
        // of what a guard-removal mutation test needs. See the task report for the
        // full reproduction; the guard itself was intentionally left unmodified here
        // per this task's scope.
        //
        // Separately, the real dispatcher (packages/core/src/runtime/dispatcher/drain.ts)
        // takes `FOR UPDATE SKIP LOCKED` on the subscription cursor row and wraps the
        // whole drain batch (cursor read, event batch, every handler invocation) in one
        // outer transaction — so no other replica can process this event concurrently,
        // and any failure before the outer transaction commits rolls back everything
        // this handler did, leaving no partial state for a real redelivery to collide
        // with. `onConflictDoNothing` cannot be reached via any currently-possible real
        // invocation path; this same-transaction reproduction is the closest a test can
        // deterministically get to "redelivered", and it correctly shows `notExists`
        // — not `onConflictDoNothing` — is what actually keeps redelivery safe today.
        await peopleDb().transaction(async (tx) => {
          await emitContext.run(
            { tx: tx as never, causedByEventId: eventId, traceId: undefined },
            async () => {
              await linkUserToPerson.handler(evt, { tx } as never);
              await linkUserToPerson.handler(evt, { tx } as never);
            },
          );
        });

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
