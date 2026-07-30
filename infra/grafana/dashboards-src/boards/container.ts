import { RowBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { board, labelVar, prom, statTile, trend } from '../skeleton';
import { UNIT } from '../tokens';

// cAdvisor's identity label is `name`, not `container` — hence labelVar's 3rd arg.
const CONTAINER_VAR = labelVar('container', 'container_last_seen', 'name');
// Prod-only: cadvisor runs nowhere else (compose.prod.yaml), so no $env dropdown.
// name!="" drops the root cgroup, which cAdvisor emits even under --docker_only
// and which the All-containers `.*` would match — it is whole-host usage.
const SEL = '{env="prod",name=~"$container",name!=""}';
// Min step for the rate panels: pulls $__rate_interval down to ~1m (from the 4m the
// datasource's 60s timeInterval would give) so a ~30s cpu/io burst shows near its real
// height instead of averaged away. Pairs with Alloy's 15s cadvisor scrape (config.alloy),
// which keeps a 1m window gap-free at 4 samples. Rate panels only — not the gauges/uptime.
const rateTarget = (expr: string, legend: string) => prom(expr, legend).interval('15s');

export const buildContainer = () =>
  board('Container', 'container')
    .withVariable(CONTAINER_VAR)
    .withRow(new RowBuilder('Now'))
    .withPanel(
      statTile({
        title: 'Containers running',
        description: 'Distinct containers cAdvisor currently sees (docker_only=true).',
        expr: `count(container_last_seen${SEL})`,
        unit: 'none',
        steps: [{ value: null, color: 'blue' }],
      }),
    )
    .withRow(new RowBuilder('CPU'))
    .withPanel(
      trend({
        title: 'CPU usage (% of 1 core) by container',
        description: 'Share of one core — no CPU limits are set, so this is not a %-of-quota.',
        unit: UNIT.percent,
        targets: [
          rateTarget(
            `sum by (name)(rate(container_cpu_usage_seconds_total${SEL}[$__rate_interval])) * 100`,
            '{{name}}',
          ),
        ],
      }),
    )
    .withRow(new RowBuilder('Memory'))
    .withPanel(
      trend({
        title: 'Memory working set by container',
        description:
          'Working set — excludes reclaimable page cache. No memory limits set, so no %-of-limit.',
        unit: UNIT.bytes,
        targets: [prom(`container_memory_working_set_bytes${SEL}`, '{{name}}')],
      }),
    )
    .withRow(new RowBuilder('Disk I/O'))
    .withPanel(
      trend({
        title: 'Disk read bytes/sec by container',
        description:
          'Block-device reads only — page-cache hits never show here, so heavy readers can read ~0.',
        unit: UNIT.Bps,
        targets: [
          rateTarget(
            `sum by (name)(rate(container_fs_reads_bytes_total${SEL}[$__rate_interval]))`,
            '{{name}}',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Disk write bytes/sec by container',
        description: 'Writes to the container writable layer and its volumes.',
        unit: UNIT.Bps,
        targets: [
          rateTarget(
            `sum by (name)(rate(container_fs_writes_bytes_total${SEL}[$__rate_interval]))`,
            '{{name}}',
          ),
        ],
      }),
    )
    .withRow(new RowBuilder('Network I/O'))
    .withPanel(
      trend({
        title: 'Network receive bytes/sec by container',
        description: 'Summed across all interfaces.',
        unit: UNIT.Bps,
        targets: [
          rateTarget(
            `sum by (name)(rate(container_network_receive_bytes_total${SEL}[$__rate_interval]))`,
            '{{name}}',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Network transmit bytes/sec by container',
        description: 'Summed across all interfaces.',
        unit: UNIT.Bps,
        targets: [
          rateTarget(
            `sum by (name)(rate(container_network_transmit_bytes_total${SEL}[$__rate_interval]))`,
            '{{name}}',
          ),
        ],
      }),
    )
    .withRow(new RowBuilder('Reliability'))
    .withPanel(
      trend({
        title: 'OOM kill events by container',
        description: 'Non-zero means the kernel OOM-killed a process in that container.',
        unit: 'none',
        targets: [
          prom(`sum by (name)(increase(container_oom_events_total${SEL}[5m]))`, '{{name}}'),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Container uptime',
        description:
          'cAdvisor has no restart counter — a sawtooth drop to ~0 is a restart/crash loop.',
        unit: 's',
        targets: [prom(`time() - container_start_time_seconds${SEL}`, '{{name}}')],
      }),
    );
