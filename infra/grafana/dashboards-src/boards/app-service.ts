import { RowBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { board, envVar, latencyHeatmap, prom, statTile, trend, upMappings } from '../skeleton';
import { SLO, stepsAsc, stepsDesc, UNIT } from '../tokens';

const E = '{env=~"$env"}';

export const buildAppService = () =>
  board('App Service', 'app-service', { from: 'now-3h' })
    .withVariable(envVar('node_uname_info'))
    .withRow(new RowBuilder('Health now'))
    .withPanel(
      statTile({
        title: 'Request rate',
        description: 'Total requests/sec.',
        expr: `sum(rate(http_server_duration_count${E}[5m]))`,
        unit: UNIT.reqps,
        steps: [{ value: null, color: 'green' }],
        legend: 'req/s',
      }),
    )
    .withPanel(
      statTile({
        title: '5xx error ratio',
        description: 'Share of responses that are 5xx. SLO < 1%; > 5% pages.',
        expr: `sum(rate(http_server_duration_count{env=~"$env",http_status_code=~"5.."}[5m])) / sum(rate(http_server_duration_count${E}[5m])) * 100`,
        unit: UNIT.percent,
        steps: stepsAsc(SLO.httpErrorRatioPct.warn, SLO.httpErrorRatioPct.crit),
      }),
    )
    .withPanel(
      statTile({
        title: 'p95 latency',
        description: 'Whole-app p95. SLO < 500ms.',
        expr: `histogram_quantile(0.95, sum by (le)(rate(http_server_duration_bucket${E}[5m])))`,
        unit: UNIT.ms,
        steps: stepsAsc(SLO.httpLatencyP95Ms.warn, SLO.httpLatencyP95Ms.crit),
      }),
    )
    .withPanel(
      statTile({
        title: 'Availability',
        description: 'server + worker scrape up.',
        expr: 'min(up{env=~"$env",instance=~"(server|worker).*"})',
        unit: 'none',
        steps: stepsDesc(1, 1),
        mappings: upMappings(),
      }),
    )
    .withRow(new RowBuilder('Golden signals'))
    .withPanel(
      trend({
        title: 'Request rate by status',
        description: 'Traffic split by HTTP status code.',
        unit: UNIT.reqps,
        stacked: true,
        targets: [
          prom(
            `sum by (http_status_code)(rate(http_server_duration_count${E}[5m]))`,
            '{{http_status_code}}',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: '5xx error ratio',
        description: 'SLO line at 5%.',
        unit: UNIT.percent,
        softMax: SLO.httpErrorRatioPct.crit,
        targets: [
          prom(
            `sum(rate(http_server_duration_count{env=~"$env",http_status_code=~"5.."}[5m])) / sum(rate(http_server_duration_count${E}[5m])) * 100`,
            '5xx %',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Latency p50/p95/p99',
        description: 'SLO line at 500ms (p95).',
        unit: UNIT.ms,
        softMax: SLO.httpLatencyP95Ms.warn,
        targets: [
          prom(
            `histogram_quantile(0.50, sum by (le)(rate(http_server_duration_bucket${E}[5m])))`,
            'p50',
          ),
          prom(
            `histogram_quantile(0.95, sum by (le)(rate(http_server_duration_bucket${E}[5m])))`,
            'p95',
          ),
          prom(
            `histogram_quantile(0.99, sum by (le)(rate(http_server_duration_bucket${E}[5m])))`,
            'p99',
          ),
        ],
      }),
    )
    .withRow(new RowBuilder('Distribution'))
    .withPanel(
      latencyHeatmap({
        title: 'Latency distribution',
        description: 'Request-duration histogram over time; watch the tail.',
        expr: `sum by (le)(rate(http_server_duration_bucket${E}[$__rate_interval]))`,
      }),
    );
