import { RowBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { board, prom, statTile, trend, upMappings } from '../skeleton';
import { SLO, stepsAsc, stepsDesc, UNIT } from '../tokens';

// Single pane of glass: per-env golden-signal health matrix.
export const buildFleet = () =>
  board('Fleet Overview', 'fleet-overview', { from: 'now-6h' })
    .withRow(new RowBuilder('Health by environment'))
    .withPanel(
      statTile({
        title: 'App availability',
        description: 'server + worker scrape up per env. DOWN pages.',
        expr: 'min by (env) (up{instance=~"(server|worker).*"})',
        unit: 'none',
        steps: stepsDesc(1, 1),
        mappings: upMappings(),
        legend: '{{env}}',
        links: [
          { title: 'App Service', url: '/d/app-service/app-service?var-env=${__field.labels.env}' },
        ],
      }),
    )
    .withPanel(
      statTile({
        title: 'Database up',
        description: 'pg_up per env. DOWN pages.',
        expr: 'min by (env) (pg_up)',
        unit: 'none',
        steps: stepsDesc(1, 1),
        mappings: upMappings(),
        legend: '{{env}}',
        links: [
          { title: 'PostgreSQL', url: '/d/postgresql/postgresql?var-env=${__field.labels.env}' },
        ],
      }),
    )
    .withPanel(
      statTile({
        title: 'Host up',
        description: 'node-exporter scrape up per env.',
        expr: 'min by (env) (up{instance=~"node-exporter.*"})',
        unit: 'none',
        steps: stepsDesc(1, 1),
        mappings: upMappings(),
        legend: '{{env}}',
        links: [{ title: 'Host', url: '/d/host/host?var-env=${__field.labels.env}' }],
      }),
    )
    .withPanel(
      statTile({
        title: '5xx error ratio',
        description: 'Share of responses that are 5xx. SLO < 1%; sustained > 5% pages.',
        expr: 'sum by (env)(rate(http_server_duration_count{http_status_code=~"5.."}[5m])) / sum by (env)(rate(http_server_duration_count[5m])) * 100',
        unit: UNIT.percent,
        steps: stepsAsc(SLO.httpErrorRatioPct.warn, SLO.httpErrorRatioPct.crit),
        legend: '{{env}}',
        links: [
          { title: 'App Service', url: '/d/app-service/app-service?var-env=${__field.labels.env}' },
        ],
      }),
    )
    .withPanel(
      statTile({
        title: 'p95 latency',
        description: 'Whole-app p95 (no route label; agent streaming inflates it). SLO < 500ms.',
        expr: 'histogram_quantile(0.95, sum by (le,env)(rate(http_server_duration_bucket[5m])))',
        unit: UNIT.ms,
        steps: stepsAsc(SLO.httpLatencyP95Ms.warn, SLO.httpLatencyP95Ms.crit),
        legend: '{{env}}',
        links: [
          { title: 'App Service', url: '/d/app-service/app-service?var-env=${__field.labels.env}' },
        ],
      }),
    )
    .withPanel(
      statTile({
        title: 'Max CPU busy',
        description: 'Busiest host per env. Amber > 80%, red > 90%.',
        expr: 'max by (env)(100 - avg by (env,instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
        unit: UNIT.percent,
        steps: stepsAsc(SLO.cpuBusyPct.warn, SLO.cpuBusyPct.crit),
        legend: '{{env}}',
        links: [{ title: 'Host', url: '/d/host/host?var-env=${__field.labels.env}' }],
      }),
    )
    .withPanel(
      statTile({
        title: 'Min disk free',
        description: 'Tightest mount per env. Red < 10%.',
        expr: 'min by (env)(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|ramfs"} / node_filesystem_size_bytes * 100)',
        unit: UNIT.percent,
        steps: stepsDesc(SLO.diskFreePct.warn, SLO.diskFreePct.crit),
        legend: '{{env}}',
        links: [{ title: 'Host', url: '/d/host/host?var-env=${__field.labels.env}' }],
      }),
    )
    .withPanel(
      statTile({
        title: 'DB connections used',
        description: 'Active connections as % of max_connections. Amber > 70%, red > 85%.',
        expr: 'sum by (env)(pg_stat_activity_count) / max by (env)(pg_settings_max_connections) * 100',
        unit: UNIT.percent,
        steps: stepsAsc(SLO.dbConnPct.warn, SLO.dbConnPct.crit),
        legend: '{{env}}',
        links: [
          { title: 'PostgreSQL', url: '/d/postgresql/postgresql?var-env=${__field.labels.env}' },
        ],
      }),
    )
    .withRow(new RowBuilder('Trends'))
    .withPanel(
      trend({
        title: '5xx error ratio by env',
        description: 'SLO line at 5%.',
        unit: UNIT.percent,
        softMax: SLO.httpErrorRatioPct.crit,
        targets: [
          prom(
            'sum by (env)(rate(http_server_duration_count{http_status_code=~"5.."}[5m])) / sum by (env)(rate(http_server_duration_count[5m])) * 100',
            '{{env}}',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'p95 latency by env',
        description: 'SLO line at 500ms.',
        unit: UNIT.ms,
        softMax: SLO.httpLatencyP95Ms.warn,
        targets: [
          prom(
            'histogram_quantile(0.95, sum by (le,env)(rate(http_server_duration_bucket[5m])))',
            '{{env}}',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Error-budget burn (× budget)',
        description: '5xx ratio ÷ 0.5% budget. > 1 burns the 99.5% availability budget.',
        unit: 'none',
        softMax: 1,
        targets: [prom('slo:http_error_ratio:rate5m * 100 / (100 - 99.5)', '{{env}}')],
      }),
    );
