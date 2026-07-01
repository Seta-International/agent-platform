import type { SubscriberDef } from '@seta/shared-types';
import { identityDb } from '../../src/backend/db/index.ts';

/**
 * Dispatch an event to the matching subscriber in a fresh DB transaction.
 * Requires `initPools` to be called before use (same pattern as identityDb()).
 *
 * Used by A1.3/A1.4/A1.5 integration tests to exercise SubscriberDef handlers
 * without going through the full event bus machinery.
 */
export async function dispatch(
  subscribers: SubscriberDef[],
  ev: { eventType: string; tenantId: string; payload: unknown },
): Promise<void> {
  const sub = subscribers.find((s) => s.event === ev.eventType);
  if (!sub) throw new Error(`No subscriber registered for event: ${ev.eventType}`);

  const db = identityDb();
  await db.transaction(async (tx) => {
    await sub.handler(
      {
        id: crypto.randomUUID(),
        occurredAt: new Date(),
        tenantId: ev.tenantId,
        aggregateType: 'people.worker',
        aggregateId: crypto.randomUUID(),
        eventType: ev.eventType,
        eventVersion: 1,
        payload: ev.payload,
      },
      { tx: tx as never },
    );
  });
}
