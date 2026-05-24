import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { coreSubscriptionFailureState } from '../../src/db/schema/index.ts';
import { emit, withEmit } from '../../src/events/index.ts';
import { startDispatcher } from '../../src/runtime/dispatcher/index.ts';
import { waitFor, withCoreTestDb } from '../helpers.ts';

describe('dispatcher failure state persistence', () => {
  it('survives a dispatcher restart', async () => {
    await withCoreTestDb(async ({ db, pool }) => {
      resetCoreDb();

      const failingSub = {
        subscription: 'test.persistence.failing',
        event: 'test.persistence.entity.created',
        eventVersion: 1,
        handler: async () => {
          throw new Error('boom');
        },
      };

      let dispatcher = await startDispatcher({
        pool,
        subscribers: [failingSub],
        // Long-enough backoff (10s) that the restarted dispatcher cannot get past the
        // window during the brief sleep below. Window length is the contract — not the
        // wallclock budget — so this stays deterministic on slow CI runners.
        backoff: { baseMs: 10_000, maxMs: 60_000, maxAttempts: 5 },
        pollIntervalMs: 50,
      });
      try {
        await withEmit(undefined, async () => {
          await emit({
            tenantId: '00000000-0000-0000-0000-000000000001',
            aggregateType: 'test.persistence',
            aggregateId: '00000000-0000-0000-0000-000000000002',
            eventType: 'test.persistence.entity.created',
            eventVersion: 1,
            payload: {},
          });
        });

        await waitFor(async () => {
          const rows = await db
            .select()
            .from(coreSubscriptionFailureState)
            .where(eq(coreSubscriptionFailureState.subscription, failingSub.subscription));
          return rows.length === 1 && rows[0]!.attempts >= 1;
        });

        const before = await db
          .select()
          .from(coreSubscriptionFailureState)
          .where(eq(coreSubscriptionFailureState.subscription, failingSub.subscription));
        const attemptsBefore = before[0]!.attempts;
        const nextRetryBefore = before[0]!.nextRetryAt.getTime();

        await dispatcher.shutdown(2_000);

        // Boot a fresh dispatcher — failure state should already be in DB and the new
        // dispatcher must respect the 10s backoff window instead of re-bumping immediately.
        dispatcher = await startDispatcher({
          pool,
          subscribers: [failingSub],
          backoff: { baseMs: 10_000, maxMs: 60_000, maxAttempts: 5 },
          pollIntervalMs: 50,
        });

        // Several ticks worth of wallclock, well inside the 10s window.
        await new Promise((r) => setTimeout(r, 250));

        const after = await db
          .select()
          .from(coreSubscriptionFailureState)
          .where(eq(coreSubscriptionFailureState.subscription, failingSub.subscription));
        expect(after).toHaveLength(1);
        // Attempts must not have incremented during the backoff window — proves the
        // new dispatcher respected the persisted state.
        expect(after[0]!.attempts).toBe(attemptsBefore);
        expect(after[0]!.nextRetryAt.getTime()).toBe(nextRetryBefore);
      } finally {
        await dispatcher.shutdown(2_000);
      }
    });
  });
});
