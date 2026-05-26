import { metrics, type ObservableResult } from '@opentelemetry/api';
import type { Pool, PoolClient } from 'pg';

const meter = metrics.getMeter('@seta/shared-db');

const totalGauge = meter.createObservableGauge('db_pool_connections_total', {
  unit: '{connection}',
  description: 'Total connections (checked-out + idle) in pool',
});
const idleGauge = meter.createObservableGauge('db_pool_connections_idle', {
  unit: '{connection}',
  description: 'Idle connections available for checkout',
});
const waitingGauge = meter.createObservableGauge('db_pool_connections_waiting', {
  unit: '{connection}',
  description: 'Client requests waiting for a free connection',
});
const waitHistogram = meter.createHistogram('db_pool_connection_wait_ms', {
  unit: 'ms',
  description: 'Time waiting for a connection to become available from the pool',
});

type ConnectCallback = (
  err: Error | undefined,
  client?: PoolClient,
  release?: (releaseErr?: Error) => void,
) => void;

/**
 * Instruments a pg Pool with OTEL metrics.
 *
 * - Registers observable gauges for totalCount, idleCount, waitingCount (read at export time).
 * - Wraps pool.connect() to record a wait-time histogram on every acquire.
 *
 * Supports BOTH overloads of pool.connect:
 *   - `connect(): Promise<PoolClient>` — used by application code via drizzle
 *   - `connect(cb)` — used internally by `pool.query()` in node-postgres; wrapping
 *     only the Promise form silently breaks every Pool.query() call (the
 *     callback never fires → request hangs forever).
 */
export function instrumentPool(pool: Pool, poolName: string): void {
  totalGauge.addCallback((result: ObservableResult) =>
    result.observe(pool.totalCount, { pool: poolName }),
  );
  idleGauge.addCallback((result: ObservableResult) =>
    result.observe(pool.idleCount, { pool: poolName }),
  );
  waitingGauge.addCallback((result: ObservableResult) =>
    result.observe(pool.waitingCount, { pool: poolName }),
  );

  const origConnect = pool.connect.bind(pool) as {
    (): Promise<PoolClient>;
    (cb: ConnectCallback): void;
  };

  function wrapped(): Promise<PoolClient>;
  function wrapped(cb: ConnectCallback): void;
  function wrapped(cb?: ConnectCallback): Promise<PoolClient> | void {
    const start = performance.now();
    if (typeof cb === 'function') {
      origConnect((err, client, release) => {
        waitHistogram.record(performance.now() - start, { pool: poolName });
        cb(err, client, release);
      });
      return;
    }
    return origConnect().then((client) => {
      waitHistogram.record(performance.now() - start, { pool: poolName });
      return client;
    });
  }

  (pool as unknown as { connect: typeof wrapped }).connect = wrapped;
}
