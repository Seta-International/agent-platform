import { Button } from '@seta/shared-ui';
import { ChartFilterBar } from '../components/charts/chart-filter-bar';
import { ChartRangeControl } from '../components/charts/chart-range-control';
import { ChartsGrid, type OpenInGridArgs } from '../components/charts/charts-grid';
import { CustomizeChartsPopover } from '../components/charts/customize-charts-popover';
import { KpiStrip } from '../components/charts/kpi-strip';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { usePlanChart } from '../hooks/queries/use-plan-chart';
import { useFilterOptions } from '../hooks/use-filter-options';
import {
  parseChartFilters,
  parseVisibleCharts,
  serializeChartState,
  toChartApiFilters,
} from '../state/chart-url-state';

interface Props {
  planId: string;
  search: Record<string, unknown>;
  /** Merge chart search keys into the URL; owned by the route so TanStack's typed router is happy. */
  onPatchSearch: (extra: Record<string, string | undefined>) => void;
}

export function PlanChartsView({ planId, search, onPatchSearch }: Props) {
  const filters = parseChartFilters(search);
  const visible = parseVisibleCharts(search);

  const boardQ = usePlanBoard(planId);
  const { assigneeOptions } = useFilterOptions(boardQ.data);
  const bucketOptions = (boardQ.data?.buckets ?? []).map((b) => ({ value: b.id, label: b.name }));

  const q = usePlanChart(planId, toChartApiFilters(filters));

  const onFiltersChange = (next: typeof filters) =>
    onPatchSearch(serializeChartState(next, visible));
  const onVisibleChange = (next: typeof visible) =>
    onPatchSearch(serializeChartState(filters, next));

  const onOpenInGrid = (args: OpenInGridArgs) =>
    onPatchSearch({
      view: 'grid',
      'filter.assignee': args.assignee ?? (search['filter.assignee'] as string | undefined),
    });

  return (
    <div data-testid="plan-charts" className="flex h-full flex-col gap-5 overflow-auto bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChartFilterBar
          filters={filters}
          onChange={onFiltersChange}
          assigneeOptions={assigneeOptions}
          bucketOptions={bucketOptions}
        />
        <div className="flex items-center gap-2">
          <ChartRangeControl
            from={filters.from}
            to={filters.to}
            onChange={(r) => onFiltersChange({ ...filters, from: r.from, to: r.to })}
          />
          <CustomizeChartsPopover visible={visible} onChange={onVisibleChange} />
          <Button
            size="sm"
            variant="secondary"
            label={q.isFetching ? 'Refreshing…' : 'Refresh'}
            onClick={() => q.refetch()}
            isDisabled={q.isFetching}
          />
        </div>
      </div>

      {q.isPending ? (
        <div
          data-testid="plan-charts-loading"
          className="flex h-40 items-center justify-center text-body-sm text-secondary"
        >
          Loading charts…
        </div>
      ) : q.isError || !q.data ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-body-sm text-secondary">
          <p>Couldn't load charts.</p>
          <Button size="sm" variant="secondary" label="Retry" onClick={() => q.refetch()} />
        </div>
      ) : (
        <>
          <KpiStrip kpis={q.data.kpis} />
          <ChartsGrid data={q.data} visible={visible} onOpenInGrid={onOpenInGrid} />
        </>
      )}
    </div>
  );
}
