import { RowBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { board, envVar, gaugeTile, prom, statTile, trend, upMappings } from '../skeleton';
import { SLO, stepsAsc, stepsDesc, UNIT } from '../tokens';

const connPct =
  'sum(pg_stat_activity_count{env=~"$env"}) / max(pg_settings_max_connections{env=~"$env"}) * 100';
const cacheHit =
  'rate(pg_stat_database_blks_hit{env=~"$env"}[5m]) / (rate(pg_stat_database_blks_hit{env=~"$env"}[5m]) + rate(pg_stat_database_blks_read{env=~"$env"}[5m])) * 100';

export const buildPostgres = () =>
  board('PostgreSQL', 'postgresql', { from: 'now-6h' })
    .withVariable(envVar('pg_up'))
    .withRow(new RowBuilder('Health now'))
    .withPanel(
      statTile({
        title: 'Postgres up',
        description: 'pg_up.',
        expr: 'min(pg_up{env=~"$env"})',
        unit: 'none',
        steps: stepsDesc(1, 1),
        mappings: upMappings(),
      }),
    )
    .withPanel(
      gaugeTile({
        title: 'Connections used',
        description: '% of max_connections. Amber > 70%, red > 85%.',
        expr: connPct,
        unit: UNIT.percent,
        steps: stepsAsc(SLO.dbConnPct.warn, SLO.dbConnPct.crit),
      }),
    )
    .withPanel(
      gaugeTile({
        title: 'Cache hit ratio',
        description: 'Buffer cache hit %. Red < 95%.',
        expr: `avg(${cacheHit})`,
        unit: UNIT.percent,
        steps: stepsDesc(SLO.dbCacheHitPct.warn, SLO.dbCacheHitPct.crit),
      }),
    )
    .withPanel(
      statTile({
        title: 'Database size',
        description: 'On-disk size.',
        expr: 'sum(pg_database_size_bytes{env=~"$env"})',
        unit: UNIT.bytes,
        steps: [{ value: null, color: 'green' }],
      }),
    )
    .withRow(new RowBuilder('Throughput & health'))
    .withPanel(
      trend({
        title: 'Active connections vs max',
        description: 'Connections and the ceiling.',
        unit: 'short',
        targets: [
          prom('sum(pg_stat_activity_count{env=~"$env"})', 'active'),
          prom('max(pg_settings_max_connections{env=~"$env"})', 'max'),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Commits / rollbacks per sec',
        description: 'Transaction throughput.',
        unit: UNIT.ops,
        targets: [
          prom('sum(rate(pg_stat_database_xact_commit{env=~"$env"}[5m]))', 'commits'),
          prom('sum(rate(pg_stat_database_xact_rollback{env=~"$env"}[5m]))', 'rollbacks'),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Cache hit ratio %',
        description: 'SLO line at 99%.',
        unit: UNIT.percent,
        targets: [prom(cacheHit, 'hit %')],
      }),
    )
    .withPanel(
      trend({
        title: 'Deadlocks per sec',
        description: 'Should be ~0.',
        unit: UNIT.ops,
        targets: [prom('sum(rate(pg_stat_database_deadlocks{env=~"$env"}[5m]))', 'deadlocks')],
      }),
    )
    .withPanel(
      trend({
        title: 'Tuple operations per sec',
        description: 'Fetched / inserted / updated / deleted.',
        unit: UNIT.ops,
        targets: [
          prom('sum(rate(pg_stat_database_tup_fetched{env=~"$env"}[5m]))', 'fetched'),
          prom('sum(rate(pg_stat_database_tup_inserted{env=~"$env"}[5m]))', 'inserted'),
          prom('sum(rate(pg_stat_database_tup_updated{env=~"$env"}[5m]))', 'updated'),
          prom('sum(rate(pg_stat_database_tup_deleted{env=~"$env"}[5m]))', 'deleted'),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Database size growth',
        description: 'Bytes over time.',
        unit: UNIT.bytes,
        targets: [prom('sum(pg_database_size_bytes{env=~"$env"})', 'size')],
      }),
    );
