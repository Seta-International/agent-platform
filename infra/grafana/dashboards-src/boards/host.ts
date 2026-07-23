import { RowBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { board, envVar, gaugeTile, prom, trend } from '../skeleton';
import { SLO, stepsAsc, stepsDesc, UNIT } from '../tokens';

const cpuBusy =
  '100 - avg by (instance)(rate(node_cpu_seconds_total{env=~"$env",mode="idle"}[5m])) * 100';
const memUsed =
  '(1 - node_memory_MemAvailable_bytes{env=~"$env"} / node_memory_MemTotal_bytes{env=~"$env"}) * 100';
const diskFree =
  'node_filesystem_avail_bytes{env=~"$env",fstype!~"tmpfs|overlay|ramfs"} / node_filesystem_size_bytes * 100';

export const buildHost = () =>
  board('Host', 'host')
    .withVariable(envVar('node_uname_info'))
    .withRow(new RowBuilder('Saturation now'))
    .withPanel(
      gaugeTile({
        title: 'CPU busy',
        description: 'Non-idle CPU, busiest core group. Amber > 80%, red > 90%.',
        expr: `max(${cpuBusy})`,
        unit: UNIT.percent,
        steps: stepsAsc(SLO.cpuBusyPct.warn, SLO.cpuBusyPct.crit),
      }),
    )
    .withPanel(
      gaugeTile({
        title: 'Memory used',
        description: 'Used memory. Amber > 80%, red > 90%.',
        expr: `max(${memUsed})`,
        unit: UNIT.percent,
        steps: stepsAsc(SLO.memUsedPct.warn, SLO.memUsedPct.crit),
      }),
    )
    .withPanel(
      gaugeTile({
        title: 'Disk free (min mount)',
        description:
          "Tightest mount. Red < 5% (matches DiskCritical); yellow < 30% (matches DiskWillFillSoon's predictive window).",
        expr: `min(${diskFree})`,
        unit: UNIT.percent,
        steps: stepsDesc(SLO.diskFreePct.warn, SLO.diskFreePct.crit),
      }),
    )
    .withRow(new RowBuilder('Trends'))
    .withPanel(
      trend({
        title: 'CPU busy %',
        description: 'Per host.',
        unit: UNIT.percent,
        targets: [prom(cpuBusy, '{{instance}}')],
      }),
    )
    .withPanel(
      trend({
        title: 'Memory used %',
        description: 'Per host.',
        unit: UNIT.percent,
        targets: [prom(memUsed, '{{instance}}')],
      }),
    )
    .withPanel(
      trend({
        title: 'Disk free % per mount',
        description: 'Lines at 30% (DiskWillFillSoon) / 5% (DiskCritical).',
        unit: UNIT.percent,
        softMax: SLO.diskFreePct.warn,
        targets: [prom(diskFree, '{{instance}} {{mountpoint}}')],
      }),
    )
    .withPanel(
      trend({
        title: 'Load average',
        description: '1/5/15m load.',
        unit: 'short',
        targets: [
          prom('node_load1{env=~"$env"}', '1m'),
          prom('node_load5{env=~"$env"}', '5m'),
          prom('node_load15{env=~"$env"}', '15m'),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Network throughput',
        description: 'Bits/sec in & out (excl. lo).',
        unit: UNIT.binbps,
        targets: [
          prom(
            'rate(node_network_receive_bytes_total{env=~"$env",device!="lo"}[$__rate_interval]) * 8',
            'in {{device}}',
          ),
          prom(
            'rate(node_network_transmit_bytes_total{env=~"$env",device!="lo"}[$__rate_interval]) * 8',
            'out {{device}}',
          ),
        ],
      }),
    );
