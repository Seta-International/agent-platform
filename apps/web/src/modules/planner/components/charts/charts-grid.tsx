import type { ChartData, ChartStatus } from '@seta/planner';
import { ChartCard, DonutChart, StackedBarChart, type StackedBarRow } from '@seta/shared-ui';
import { CHART_REGISTRY, type ChartId } from './chart-registry';
import { STATUS_SERIES, statusSlices, statusTotal } from './chart-status';

export interface OpenInGridArgs {
  status?: string;
  bucketId?: string;
  assignee?: string;
}

const statusRow = (label: string, s: ChartStatus): StackedBarRow => ({
  label,
  not_started: s.not_started,
  in_progress: s.in_progress,
  completed: s.completed,
});

export function ChartsGrid({
  data,
  visible,
  onOpenInGrid,
}: {
  data: ChartData;
  visible: ChartId[];
  onOpenInGrid: (args: OpenInGridArgs) => void;
}) {
  const def = (id: ChartId) => CHART_REGISTRY.find((c) => c.id === id);

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {visible.map((id) => {
        const d = def(id);
        if (!d) return null;
        const common = { title: d.title, subtitle: d.subtitle };

        if (id === 'status') {
          return (
            <ChartCard key={id} {...common} testId="chart-status">
              <DonutChart
                slices={statusSlices(data.byStatus)}
                centerValue={statusTotal(data.byStatus)}
                centerLabel="tasks"
                legend="right"
                onSliceClick={(s) => onOpenInGrid({ status: s.key })}
              />
            </ChartCard>
          );
        }
        if (id === 'priority') {
          return (
            <ChartCard key={id} {...common} testId="chart-priority">
              <StackedBarChart
                orientation="vertical"
                series={STATUS_SERIES}
                rows={data.byPriority.map((p) => statusRow(p.label, p))}
                onSegmentClick={(_, k) => onOpenInGrid({ status: k })}
              />
            </ChartCard>
          );
        }
        if (id === 'bucket') {
          return (
            <ChartCard key={id} {...common} testId="chart-bucket">
              <StackedBarChart
                orientation="vertical"
                series={STATUS_SERIES}
                rows={data.byBucket.map((b) => statusRow(b.name, b))}
                onSegmentClick={(r, k) =>
                  onOpenInGrid({
                    bucketId: data.byBucket.find((x) => x.name === r.label)?.bucketId,
                    status: k,
                  })
                }
              />
            </ChartCard>
          );
        }
        if (id === 'members') {
          return (
            <ChartCard key={id} {...common} testId="chart-member" className="xl:col-span-2">
              <StackedBarChart
                orientation="vertical"
                series={STATUS_SERIES}
                labelWidth={140}
                rows={data.byMember.map((m) => statusRow(m.displayName, m))}
                onSegmentClick={(r) =>
                  onOpenInGrid({
                    assignee: data.byMember.find((x) => x.displayName === r.label)?.userId,
                  })
                }
              />
            </ChartCard>
          );
        }
        if (id === 'workload') {
          return (
            <ChartCard key={id} {...common} testId="chart-workload" className="xl:col-span-2">
              <StackedBarChart
                orientation="vertical"
                series={[
                  { key: 'open', name: 'Open', color: 'var(--color-primary)' },
                  { key: 'completed', name: 'Completed', color: 'var(--color-success)' },
                ]}
                rows={data.workload.map((w) => ({
                  label: w.displayName,
                  open: w.open,
                  completed: w.completed,
                }))}
                onSegmentClick={(r) =>
                  onOpenInGrid({
                    assignee: data.workload.find((x) => x.displayName === r.label)?.userId,
                  })
                }
              />
            </ChartCard>
          );
        }
        // completion / burndown are Stage 2 (disabled in Customize).
        return null;
      })}
    </div>
  );
}
