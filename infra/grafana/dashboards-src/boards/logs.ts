import {
  CustomVariableBuilder,
  RowBuilder,
  TextBoxVariableBuilder,
} from '@grafana/grafana-foundation-sdk/dashboard';
import { board, logsPanel, lokiLabelVar, lokiTrend } from '../skeleton';

// Drop the observability stack's own containers (loki/grafana/prometheus,
// alloy agents, the ai-sdlc-metrics stack) — otherwise their self-logs (e.g.
// Loki's push.go errors) drown out application logs.
const NOT_INFRA = 'container!~".*(monitoring|alloy|ai-sdlc-metrics).*"';
const SEL = `{env=~"$env", container=~"$container", ${NOT_INFRA}}`;
const ERR = `${SEL} |~ "(?i)level=error|\\"level\\":\\"error\\""`;
// Live tail honours the $level dropdown and $search box. $level values are plain
// words (allValue = the regex alternation); the query matches both logfmt
// (level=error) and JSON ("level":"error"). Empty $search matches every line.
const LEVEL = `|~ "(?i)(level=($level)|\\"level\\":\\"($level)\\")"`;
const LIVE = `${SEL} ${LEVEL} |= "$search"`;

// Severity dropdown: single-select word values; All → every level via allValue.
const levelVar = new CustomVariableBuilder('level')
  .label('level')
  .values('error,warn,info,debug')
  .includeAll(true)
  .allValue('error|warn|info|debug')
  .current({ text: 'All', value: '$__all', selected: true });

// Free-text substring filter (LogQL |=). Empty = no filter.
const searchVar = new TextBoxVariableBuilder('search').label('search').defaultValue('');

export const buildLogs = () =>
  board('Logs', 'logs')
    .withVariable(lokiLabelVar('env'))
    .withVariable(lokiLabelVar('container', `{env=~"$env", ${NOT_INFRA}}`))
    .withVariable(levelVar)
    .withVariable(searchVar)
    .withRow(new RowBuilder('Errors'))
    .withPanel(
      lokiTrend({
        title: 'Error log rate by container',
        description: 'Lines/sec matching level=error.',
        unit: 'logs',
        expr: `sum by (container)(rate(${ERR} [5m]))`,
        legend: '{{container}}',
      })
        .span(24)
        .height(8),
    )
    .withRow(new RowBuilder('Live'))
    .withPanel(logsPanel({ title: 'Logs', expr: LIVE }).span(24).height(24));
