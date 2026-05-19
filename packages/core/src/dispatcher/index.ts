import { createDb } from '@seta/shared-db';
import type { SubscriberDef } from '@seta/shared-types';
import type { Pool } from 'pg';
import * as schema from '../db/schema/index.ts';
import { type BackoffOpts, drainOne } from './drain.ts';
import { getFailureEntry, resetAllFailureState } from './failure-state.ts';

export type { SubscriberDef } from '@seta/shared-types';

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

  async function tick(): Promise<void> {
    if (shuttingDown) return;
    // Serialize ticks: only one drain in-flight at a time. New ticks scheduled while
    // one is running are dropped; setInterval and the LISTEN handler will retrigger.
    if (inFlight) return;
    inFlight = (async () => {
      try {
        await Promise.all(opts.subscribers.map((sub) => drainOne(db, sub, backoff, log, metrics)));
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
