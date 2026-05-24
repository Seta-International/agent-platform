import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { NodeTx } from '@seta/shared-db';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema/index.ts';
import {
  coreEvents,
  coreSubscriptionCursors,
  coreSubscriptionDeadLetter,
  coreSubscriptionProcessed,
} from '../../db/schema/index.ts';
import { emitContext } from '../../events/context.ts';
import { restoreTraceContext } from '../../events/trace-context.ts';
import { bumpFailureState, clearFailureState, getFailureEntry } from './failure-state.ts';

const tracer = trace.getTracer('@seta/core/dispatcher');

export interface BackoffOpts {
  baseMs: number;
  maxMs: number;
  maxAttempts: number;
}

export interface DrainLogger {
  error: (obj: unknown, msg?: string) => void;
}
export interface DrainMetrics {
  incr: (name: string, labels?: Record<string, string>) => void;
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export async function drainOne(
  db: NodePgDatabase<typeof schema>,
  sub: SubscriberDef,
  backoff: BackoffOpts,
  log: DrainLogger,
  metrics: DrainMetrics,
): Promise<{ processed: number; halted: boolean }> {
  const entry = await getFailureEntry(db, sub.subscription);
  if (entry && entry.nextRetryAt > Date.now()) return { processed: 0, halted: true };

  return db.transaction(async (outerTx) => {
    const cursorRows = await outerTx
      .select()
      .from(coreSubscriptionCursors)
      .where(eq(coreSubscriptionCursors.subscription, sub.subscription))
      .for('update', { skipLocked: true })
      .limit(1);
    if (cursorRows.length === 0) {
      // No cursor row yet, or another replica holds the lock. Race-safe seed under
      // FOR UPDATE SKIP LOCKED: first replica inserts, others see no rows next tick.
      await outerTx
        .insert(coreSubscriptionCursors)
        .values({
          subscription: sub.subscription,
          lastProcessedEventId: NIL_UUID,
          lastProcessedOccurredAt: new Date(0),
        })
        .onConflictDoNothing();
      return { processed: 0, halted: false };
    }

    const lastId = cursorRows[0]?.lastProcessedEventId ?? NIL_UUID;
    // Tuple compare (occurred_at, id) > (cursor.occurred_at, cursor.id). UUID-only ordering
    // would lose events whose v4 ids sort lexicographically below the cursor. We read the
    // cursor's occurred_at via a SQL subquery instead of binding a JS Date because JS Date
    // truncates the PG microsecond precision, and `e.occurred_at > truncated` is true on
    // values that are actually equal at the microsecond level — replaying the same event
    // forever.
    const batch = await outerTx
      .select()
      .from(coreEvents)
      .where(
        and(
          eq(coreEvents.eventType, sub.event),
          eq(coreEvents.eventVersion, sub.eventVersion),
          sql`(${coreEvents.occurredAt}, ${coreEvents.id}) > (
            (SELECT last_processed_occurred_at FROM core.subscription_cursors WHERE subscription = ${sub.subscription}),
            ${lastId}::uuid
          )`,
        ),
      )
      .orderBy(asc(coreEvents.occurredAt), asc(coreEvents.id))
      .limit(100);
    let processed = 0;
    for (const row of batch) {
      const evt: DomainEvent = {
        id: row.id,
        occurredAt: row.occurredAt,
        tenantId: row.tenantId,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        eventType: row.eventType,
        eventVersion: row.eventVersion,
        payload: row.payload,
        causedByUserId: row.causedByUserId ?? undefined,
        causedByEventId: row.causedByEventId ?? undefined,
        traceId: row.traceId ?? undefined,
      };

      try {
        const parentCtx = restoreTraceContext({
          traceParent: row.traceParent ?? null,
          traceState: row.traceState ?? null,
        });
        await context.with(parentCtx, () =>
          tracer.startActiveSpan(
            `subscriber.${sub.subscription}`,
            { attributes: { 'seta.event.type': evt.eventType, 'seta.event.id': evt.id } },
            async (span) => {
              try {
                await outerTx.transaction(async (handlerTx) => {
                  await emitContext.run(
                    {
                      tx: handlerTx as unknown as NodeTx,
                      causedByEventId: evt.id,
                      traceId: evt.traceId,
                    },
                    () => sub.handler(evt, { tx: handlerTx as unknown as NodeTx }),
                  );
                  await handlerTx
                    .insert(coreSubscriptionProcessed)
                    .values({ subscription: sub.subscription, eventId: evt.id })
                    .onConflictDoNothing();
                });
              } catch (err) {
                if (err instanceof Error) span.recordException(err);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: err instanceof Error ? err.message : String(err),
                });
                throw err;
              } finally {
                span.end();
              }
            },
          ),
        );
        await outerTx
          .update(coreSubscriptionCursors)
          .set({
            lastProcessedEventId: evt.id,
            // Use the event row's PG timestamp directly. Round-tripping through a JS Date
            // truncates microseconds, which makes the tuple comparison treat the cursor as
            // less-than the event row on the next tick and replays the same event forever.
            lastProcessedOccurredAt: sql`(SELECT occurred_at FROM core.events WHERE id = ${evt.id})`,
            lastProcessedAt: new Date(),
          })
          .where(eq(coreSubscriptionCursors.subscription, sub.subscription));
        await clearFailureState(outerTx, sub.subscription, evt.id);
        processed += 1;
      } catch (err) {
        const attempt = await bumpFailureState(outerTx, sub.subscription, evt.id, err, backoff);
        log.error(
          { subscription: sub.subscription, eventId: evt.id, attempt, err },
          'subscriber failure',
        );
        metrics.incr('dispatcher.subscriber_failures', { subscription: sub.subscription });
        if (attempt >= backoff.maxAttempts) {
          // Re-read the post-bump row so firstFailedAt reflects the original failure time
          // (bumpFailureState preserves it on same-event retries).
          const failureRow = await getFailureEntry(outerTx, sub.subscription);
          await outerTx.insert(coreSubscriptionDeadLetter).values({
            subscription: sub.subscription,
            eventId: evt.id,
            eventType: evt.eventType,
            attempts: attempt,
            lastError: err instanceof Error ? err.message : String(err),
            payload: evt.payload as Record<string, unknown>,
            firstFailedAt: failureRow?.firstFailedAt ?? new Date(),
          });
          await outerTx
            .update(coreSubscriptionCursors)
            .set({
              lastProcessedEventId: evt.id,
              // Use the event row's PG timestamp directly. Round-tripping through a JS Date
              // truncates microseconds, which makes the tuple comparison treat the cursor as
              // less-than the event row on the next tick and replays the same event forever.
              lastProcessedOccurredAt: sql`(SELECT occurred_at FROM core.events WHERE id = ${evt.id})`,
              lastProcessedAt: new Date(),
            })
            .where(eq(coreSubscriptionCursors.subscription, sub.subscription));
          metrics.incr('dispatcher.dead_letter', { subscription: sub.subscription });
          await clearFailureState(outerTx, sub.subscription, evt.id);
        } else {
          return { processed, halted: true };
        }
      }
    }

    return { processed, halted: false };
  });
}
