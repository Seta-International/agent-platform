import { RowBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { board, logsPanel, lokiLabelVar, lokiTrend } from '../skeleton';

const SEL = '{env=~"$env", container=~"$container"}';
const ERR = `${SEL} |~ "(?i)level=error|\\"level\\":\\"error\\""`;

export const buildLogs = () =>
  board('Logs', 'logs')
    .withVariable(lokiLabelVar('env'))
    .withVariable(lokiLabelVar('container', '{env=~"$env"}'))
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
    .withPanel(logsPanel({ title: 'Logs', expr: SEL }).span(24).height(24));
