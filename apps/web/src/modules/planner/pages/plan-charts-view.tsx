import { getRouteApi } from '@tanstack/react-router';
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

const routeApi = getRouteApi('/_authed/planner/plans_/$planId');

export function PlanChartsView({ planId }: { planId: string }) {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const filters = parseChartFilters(search);
  const visible = parseVisibleCharts(search);

  const boardQ = usePlanBoard(planId);
  const { assigneeOptions } = useFilterOptions(boardQ.data);
  const bucketOptions = (boardQ.data?.buckets ?? []).map((b) => ({ value: b.id, label: b.name }));

  const q = usePlanChart(planId, toChartApiFilters(filters));

  const patch = (extra: Record<string, string | undefined>) =>
    navigate({ search: (prev) => ({ ...prev, ...extra }) });

  const onFiltersChange = (next: typeof filters) => patch(serializeChartState(next, visible));
  const onVisibleChange = (next: typeof visible) => patch(serializeChartState(filters, next));

  const onOpenInGrid = (args: OpenInGridArgs) =>
    navigate({
      search: (prev) => ({
        ...prev,
        view: 'grid',
        'filter.assignee': args.assignee ?? prev['filter.assignee'],
      }),
    });

  return (
    <div
      data-testid="plan-charts"
      className="flex h-full flex-col gap-5 overflow-auto bg-surface-1 p-6"
    >
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
          <button
            type="button"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink hover:bg-surface-2 disabled:opacity-60"
          >
            {q.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {q.isPending ? (
        <div
          data-testid="plan-charts-loading"
          className="flex h-40 items-center justify-center text-body-sm text-ink-subtle"
        >
          Loading charts…
        </div>
      ) : q.isError || !q.data ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-body-sm text-ink-subtle">
          <p>Couldn't load charts.</p>
          <button
            type="button"
            onClick={() => q.refetch()}
            className="rounded-md border border-hairline bg-canvas px-3 py-1.5 text-ink hover:bg-surface-2"
          >
            Retry
          </button>
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
