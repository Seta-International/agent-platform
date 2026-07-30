import {
  BigValueColorMode,
  BigValueGraphMode,
  type DataSourceRef,
  GraphThresholdsStyleConfigBuilder,
  GraphThresholdsStyleMode,
  ReduceDataOptionsBuilder,
  StackingConfigBuilder,
  StackingMode,
} from '@grafana/grafana-foundation-sdk/common';
import {
  DashboardBuilder,
  DashboardLinkBuilder,
  DashboardLinkType,
  MappingType,
  QueryVariableBuilder,
  ThresholdsConfigBuilder,
  ThresholdsMode,
  type ValueMapping,
  VariableRefresh,
} from '@grafana/grafana-foundation-sdk/dashboard';
import { PanelBuilder as GaugePanel } from '@grafana/grafana-foundation-sdk/gauge';
import { PanelBuilder as HeatmapPanel } from '@grafana/grafana-foundation-sdk/heatmap';
import { PanelBuilder as LogsPanel } from '@grafana/grafana-foundation-sdk/logs';
import { DataqueryBuilder as LokiQuery } from '@grafana/grafana-foundation-sdk/loki';
import {
  DataqueryBuilder as PromQuery,
  PromQueryFormat,
} from '@grafana/grafana-foundation-sdk/prometheus';
import { PanelBuilder as StatPanel } from '@grafana/grafana-foundation-sdk/stat';
import { PanelBuilder as TimeseriesPanel } from '@grafana/grafana-foundation-sdk/timeseries';
import type { Step } from './tokens';

const PROM: DataSourceRef = { type: 'prometheus', uid: 'prometheus' };
const LOKI: DataSourceRef = { type: 'loki', uid: 'loki' };

const thresholds = (steps: Step[]) =>
  new ThresholdsConfigBuilder()
    .mode(ThresholdsMode.Absolute)
    .steps(steps.map((s) => ({ value: s.value, color: s.color })));

const lastValue = () => new ReduceDataOptionsBuilder().calcs(['lastNotNull']).values(false);

export const board = (
  title: string,
  uid: string,
  opts: { refresh?: string; from?: string } = {},
): DashboardBuilder =>
  new DashboardBuilder(title)
    .uid(uid)
    .tags(['generated', 'seta', 'observability'])
    .refresh(opts.refresh ?? '30s')
    .time({ from: opts.from ?? 'now-24h', to: 'now' })
    .timezone('browser');

export const prom = (expr: string, legend?: string) => {
  const q = new PromQuery().datasource(PROM).expr(expr);
  return legend ? q.legendFormat(legend) : q;
};

export const loki = (expr: string) => new LokiQuery().datasource(LOKI).expr(expr);

// A Prometheus label_values query variable. `metric` scopes which envs appear.
export const envVar = (metric: string) =>
  new QueryVariableBuilder('env')
    .label('env')
    .datasource(PROM)
    .query({ query: `label_values(${metric}, env)`, refId: 'StandardVariableQuery' })
    .refresh(VariableRefresh.OnTimeRangeChanged)
    .includeAll(true)
    .multi(true);

// Pass promLabel when the dropdown's display name differs from the Prometheus
// label (e.g. cAdvisor's container identity label is `name`, not `container`).
export const labelVar = (name: string, metric: string, promLabel: string = name) =>
  new QueryVariableBuilder(name)
    .label(name)
    .datasource(PROM)
    .query({ query: `label_values(${metric}, ${promLabel})`, refId: 'StandardVariableQuery' })
    .refresh(VariableRefresh.OnTimeRangeChanged)
    .includeAll(true)
    .multi(true);

export const lokiLabelVar = (name: string, stream?: string) =>
  new QueryVariableBuilder(name)
    .label(name)
    .datasource(LOKI)
    .query(stream ? { label: name, stream, type: 1 } : { label: name, type: 1 })
    .refresh(VariableRefresh.OnTimeRangeChanged)
    .includeAll(true)
    .multi(true);

export const upMappings = (): ValueMapping[] => [
  {
    type: MappingType.ValueToText,
    options: {
      '1': { text: 'UP', color: 'green', index: 0 },
      '0': { text: 'DOWN', color: 'red', index: 1 },
    },
  },
];

export const statTile = (o: {
  title: string;
  expr: string;
  unit: string;
  steps: Step[];
  description: string;
  mappings?: ValueMapping[];
  legend?: string;
  links?: { title: string; url: string }[];
}): StatPanel => {
  let p = new StatPanel()
    .title(o.title)
    .description(o.description)
    .datasource(PROM)
    .unit(o.unit)
    .thresholds(thresholds(o.steps))
    .colorMode(BigValueColorMode.Background)
    .graphMode(BigValueGraphMode.Area)
    .reduceOptions(lastValue())
    .withTarget(prom(o.expr, o.legend));
  if (o.mappings) p = p.mappings(o.mappings);
  if (o.links) {
    p = p.dataLinks(
      o.links.map((l) =>
        new DashboardLinkBuilder(l.title)
          .type(DashboardLinkType.Link)
          .url(l.url)
          .targetBlank(false),
      ),
    );
  }
  return p;
};

export const gaugeTile = (o: {
  title: string;
  expr: string;
  unit: string;
  steps: Step[];
  min?: number;
  max?: number;
  description: string;
  legend?: string;
}): GaugePanel =>
  new GaugePanel()
    .title(o.title)
    .description(o.description)
    .datasource(PROM)
    .unit(o.unit)
    .min(o.min ?? 0)
    .max(o.max ?? 100)
    .thresholds(thresholds(o.steps))
    .reduceOptions(lastValue())
    .withTarget(prom(o.expr, o.legend));

export const trend = (o: {
  title: string;
  unit: string;
  targets: ReturnType<typeof prom>[];
  description: string;
  stacked?: boolean;
  softMax?: number;
}): TimeseriesPanel => {
  let p = new TimeseriesPanel()
    .title(o.title)
    .description(o.description)
    .datasource(PROM)
    .unit(o.unit)
    .fillOpacity(o.stacked ? 30 : 10)
    .lineWidth(1);
  if (o.stacked) p = p.stacking(new StackingConfigBuilder().mode(StackingMode.Normal).group('A'));
  if (o.softMax !== undefined) {
    p = p
      .thresholds(
        thresholds([
          { value: null, color: 'transparent' },
          { value: o.softMax, color: 'red' },
        ]),
      )
      .thresholdsStyle(new GraphThresholdsStyleConfigBuilder().mode(GraphThresholdsStyleMode.Line));
  }
  for (const t of o.targets) p = p.withTarget(t);
  return p;
};

export const latencyHeatmap = (o: {
  title: string;
  expr: string;
  description: string;
}): HeatmapPanel =>
  new HeatmapPanel()
    .title(o.title)
    .description(o.description)
    .datasource(PROM)
    .withTarget(prom(o.expr).format(PromQueryFormat.Heatmap));

export const logsPanel = (o: { title: string; expr: string }): LogsPanel =>
  new LogsPanel().title(o.title).datasource(LOKI).withTarget(loki(o.expr));

// Loki-datasource timeseries (LogQL metric queries). Mirrors trend() but for Loki.
export const lokiTrend = (o: {
  title: string;
  unit: string;
  expr: string;
  legend: string;
  description: string;
}) =>
  new TimeseriesPanel()
    .title(o.title)
    .description(o.description)
    .datasource(LOKI)
    .unit(o.unit)
    .fillOpacity(10)
    .lineWidth(1)
    .withTarget(loki(o.expr).legendFormat(o.legend));
