import { createDb } from '@seta/shared-db';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import type { Pool } from 'pg';
import * as schema from '../db/schema/index.ts';
import { type BackoffOpts, drainOne } from './drain.ts';
import { dispatchTap } from './event-tap.ts';
import { getFailureEntry, resetAllFailureState } from './failure-state.ts';

export type { SubscriberDef } from '@seta/shared-types';
export { addEventTap, type EventTapHandler, type EventTapPredicate } from './event-tap.ts';

export interface SubscriptionHealth {
  subscription: string;
  cursor: string | null;
  lastProcessedAt: Date | null;
  inflightFailureAttempts: number;
  deadLetterCount24h: number;
}

export interface DispatcherHandle {
  health(): { lastTickAt: Date; subscriptions: SubscriptionHealth[] };
  shutdown(timeoutMs?: number): Promise<void>;
}

export async function startDispatcher(opts: {
  pool: Pool;
  subscribers: SubscriberDef[];
  backoff?: Partial<BackoffOpts>;
  pollIntervalMs?: number;
}): Promise<DispatcherHandle> {
  const backoff: BackoffOpts = {
    baseMs: opts.backoff?.baseMs ?? 1_000,
    maxMs: opts.backoff?.maxMs ?? 60_000,
    maxAttempts: opts.backoff?.maxAttempts ?? 5,
  };
  const pollIntervalMs = opts.pollIntervalMs ?? 2_000;

  const db = createDb(opts.pool, schema, { schemaFilter: ['core'] });
  let lastTickAt = new Date();
  let shuttingDown = false;
  let inFlight: Promise<void> | null = null;

  // NIL UUID is the sentinel "before everything" cursor for the tap drainer.
  const NIL_UUID = '00000000-0000-0000-0000-000000000000';
  // null means "not yet initialized"; on first tapTick we set it to the current max
  // so we only observe events emitted after this process started.
  let lastTapEventId: string | null = null;
  // We hold occurred_at as a PG-formatted string (microsecond precision) rather than a JS
  // Date, because Date truncates to milliseconds and `e.occurred_at > truncated` becomes
  // true on values that are actually equal at the PG microsecond level — replaying the
  // same event forever.
  let lastTapOccurredAtText = '1970-01-01 00:00:00+00';

  const listener = await opts.pool.connect();
  await listener.query('LISTEN events');
  listener.on('notification', () => {
    void tick();
  });
  // The listener holds a long-lived connection. If the server terminates it (e.g. admin
  // shutdown, DROP DATABASE WITH FORCE in tests), pg surfaces 'error' on the client; without
  // a handler, the rejection becomes unhandled and crashes the test runner.
  listener.on('error', () => {
    // intentionally swallow: shutdown teardown handles cleanup.
  });

  const log = {
    error: (obj: unknown, msg?: string) => {
      // M1: console logging; replaced with pino in apps/server wiring.
      console.error(msg ?? 'dispatcher error', obj);
    },
  };
  const metrics = {
    incr: (_name: string, _labels?: Record<string, string>) => {
      // M1: no-op. Wired to OTel in a later milestone.
    },
  };

  async function tapTick(): Promise<void> {
    if (shuttingDown) return;
    // Lazy initialization: set the cursor to the current max (occurred_at, id) so we
    // don't replay history. Tuple ordering matches drain() — UUID-only ordering would
    // make the cursor skip events with lexicographically smaller ids.
    if (lastTapEventId === null) {
      const r = await opts.pool.query<{ id: string; occurred_at_text: string }>(
        `SELECT id, occurred_at::text AS occurred_at_text
           FROM core.events
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1`,
      );
      lastTapEventId = (r.rows[0]?.id as string | undefined) ?? NIL_UUID;
      lastTapOccurredAtText = r.rows[0]?.occurred_at_text ?? '1970-01-01 00:00:00+00';
      return;
    }
    const r = await opts.pool.query<DomainEvent & { id: string; occurred_at_text: string }>(
      `SELECT id, tenant_id AS "tenantId", aggregate_type AS "aggregateType",
              aggregate_id AS "aggregateId", event_type AS "eventType",
              event_version AS "eventVersion", payload, occurred_at AS "occurredAt",
              occurred_at::text AS occurred_at_text,
              caused_by_event_id AS "causedByEventId", trace_id AS "traceId"
         FROM core.events
        WHERE (occurred_at, id) > ($1::timestamptz, $2::uuid)
        ORDER BY occurred_at ASC, id ASC
        LIMIT 200`,
      [lastTapOccurredAtText, lastTapEventId],
    );
    for (const row of r.rows) {
      dispatchTap(row as DomainEvent);
      lastTapEventId = row.id;
      lastTapOccurredAtText = row.occurred_at_text;
    }
  }

  async function tick(): Promise<void> {
    if (shuttingDown) return;
    // Serialize ticks: only one drain in-flight at a time. New ticks scheduled while
    // one is running are dropped; setInterval and the LISTEN handler will retrigger.
    if (inFlight) return;
    inFlight = (async () => {
      try {
        await Promise.all(opts.subscribers.map((sub) => drainOne(db, sub, backoff, log, metrics)));
        await tapTick();
      } catch (err) {
        log.error({ err }, 'dispatcher tick failure');
      } finally {
        lastTickAt = new Date();
      }
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  }

  const interval = setInterval(() => {
    void tick();
  }, pollIntervalMs);
  await tick();

  return {
    health() {
      return {
        lastTickAt,
        subscriptions: opts.subscribers.map((s) => {
          const f = getFailureEntry(s.subscription);
          return {
            subscription: s.subscription,
            cursor: null,
            lastProcessedAt: null,
            inflightFailureAttempts: f?.attempts ?? 0,
            deadLetterCount24h: 0,
          };
        }),
      };
    },
    async shutdown(timeoutMs = 15_000) {
      shuttingDown = true;
      clearInterval(interval);
      try {
        listener.removeAllListeners('notification');
      } catch {
        // ignore: connection may already be torn down
      }
      try {
        await listener.query('UNLISTEN events');
      } catch {
        // ignore: best-effort
      }
      try {
        listener.release();
      } catch {
        // ignore: already released
      }
      if (inFlight) {
        await Promise.race([inFlight, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
      }
      resetAllFailureState();
    },
  };
}
