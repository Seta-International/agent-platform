import { createDb } from '@seta/shared-db';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import * as schema from '../../db/schema/index.ts';
import type { BackoffOpts } from './drain.ts';
import { dispatchTap } from './event-tap.ts';
import { getFailureEntry } from './failure-state.ts';
import { otelDispatcherMetrics, setDlqProvider } from './otel-metrics.ts';
import { type SubscriberLoopHandle, startSubscriberLoop } from './subscriber-loop.ts';

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
  health(): Promise<{ lastTickAt: Date; subscriptions: SubscriptionHealth[] }>;
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
  let tapInFlight: Promise<void> | null = null;

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

  const log = {
    error: (obj: unknown, msg?: string) => {
      // M1: console logging; replaced with pino in apps/server wiring.
      console.error(msg ?? 'dispatcher error', obj);
    },
  };
  const metrics = otelDispatcherMetrics;

  async function queryDeadLetter24h(): Promise<Map<string, number>> {
    const result = await db.execute(sql`
      SELECT subscription, COUNT(*)::int AS count
        FROM core.subscription_dead_letter
       WHERE dead_lettered_at >= NOW() - INTERVAL '24 hours'
       GROUP BY subscription
    `);
    const rows = (result as unknown as { rows: Array<{ subscription: string; count: number }> })
      .rows;
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.subscription, r.count);
    return map;
  }

  setDlqProvider(async () => {
    const map = await queryDeadLetter24h();
    return Array.from(map.entries(), ([subscription, count]) => ({ subscription, count }));
  });

  async function tapTick(): Promise<void> {
    if (shuttingDown) return;
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

  function runTapTick(): void {
    if (shuttingDown || tapInFlight) return;
    tapInFlight = (async () => {
      try {
        await tapTick();
      } catch (err) {
        log.error({ err }, 'dispatcher tap tick failure');
      } finally {
        lastTickAt = new Date();
      }
    })();
    void tapInFlight.finally(() => {
      tapInFlight = null;
    });
  }

  // One independent loop per subscriber. A slow subscriber holds only its own loop;
  // fast peers keep ticking. Each loop runs its own setInterval + semaphore (inside
  // startSubscriberLoop) so Promise.all-style fan-out can't serialize them.
  const loops: SubscriberLoopHandle[] = opts.subscribers.map((sub) =>
    startSubscriberLoop({
      db,
      sub,
      backoff,
      pollIntervalMs,
      log,
      metrics,
      observer: {
        onDrain: ({ subscription, processed, durationMs }) => {
          lastTickAt = new Date();
          metrics.recordDrain({ subscription, processed, durationMs });
        },
        onError: (args) => {
          log.error(args, 'subscriber loop drain error');
        },
      },
    }),
  );

  const listener = await opts.pool.connect();
  await listener.query('LISTEN events');
  listener.on('notification', () => {
    for (const loop of loops) loop.notify();
    runTapTick();
  });
  // The listener holds a long-lived connection. If the server terminates it (e.g. admin
  // shutdown, DROP DATABASE WITH FORCE in tests), pg surfaces 'error' on the client; without
  // a handler, the rejection becomes unhandled and crashes the test runner.
  listener.on('error', () => {
    // intentionally swallow: shutdown teardown handles cleanup.
  });

  // Tap loop is independent — non-subscriber listeners (event-tap subscribers used by
  // streaming/SSE consumers) get fan-out without being gated on any subscriber's handler.
  const tapInterval = setInterval(runTapTick, pollIntervalMs);
  runTapTick();

  return {
    async health() {
      const dlqByName = await queryDeadLetter24h();
      const subscriptions: SubscriptionHealth[] = [];
      for (const s of opts.subscribers) {
        const f = await getFailureEntry(db, s.subscription);
        subscriptions.push({
          subscription: s.subscription,
          cursor: null,
          lastProcessedAt: null,
          inflightFailureAttempts: f?.attempts ?? 0,
          deadLetterCount24h: dlqByName.get(s.subscription) ?? 0,
        });
      }
      return { lastTickAt, subscriptions };
    },
    async shutdown(timeoutMs = 15_000) {
      shuttingDown = true;
      clearInterval(tapInterval);
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
      await Promise.all(loops.map((l) => l.shutdown(timeoutMs)));
      if (tapInFlight) {
        await Promise.race([tapInFlight, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
      }
      // Drop the observable-gauge callback so the next dispatcher instance (e.g. the
      // next test) wires its own. Without this, the SDK would call into a closed pool.
      setDlqProvider(null);
      // Failure state is intentionally persisted across shutdowns. Tests that need to
      // reset it should call resetAllFailureState(db) directly.
    },
  };
}
