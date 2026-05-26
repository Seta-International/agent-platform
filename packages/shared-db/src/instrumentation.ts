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

/**
 * Instruments a pg Pool with OTEL metrics.
 *
 * - Registers observable gauges for totalCount, idleCount, waitingCount (read at export time).
 * - Wraps pool.connect() to record a wait-time histogram on every acquire.
 *
 * Call once per pool immediately after initPools().
 * Only the Promise form of pool.connect() is supported (no callback overload).
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

  // Cast to the Promise-only overload. Callback usage does not exist in this codebase.
  const orig = pool.connect.bind(pool) as () => Promise<PoolClient>;
  (pool as unknown as { connect: () => Promise<PoolClient> }).connect = async () => {
    const start = performance.now();
    const client = await orig();
    waitHistogram.record(performance.now() - start, { pool: poolName });
    return client;
  };
}
