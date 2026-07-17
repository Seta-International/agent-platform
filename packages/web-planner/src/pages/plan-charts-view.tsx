import { Button } from '@seta/shared-ui';
import { ChartFilterBar } from '../components/charts/chart-filter-bar';
import { ChartRangeControl } from '../components/charts/chart-range-control';
import { ChartsGrid, type OpenInGridArgs } from '../components/charts/charts-grid';
import { CustomizeChartsPopover } from '../components/charts/customize-charts-popover';
import { KpiStrip } from '../components/charts/kpi-strip';
import { PlanViewSwitcher } from '../components/plan-view-switcher';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { usePlanChart } from '../hooks/queries/use-plan-chart';
import { useFilterOptions } from '../hooks/use-filter-options';
import {
  EMPTY_CHART_FILTERS,
  parseChartFilters,
  parseVisibleCharts,
  serializeChartState,
  toChartApiFilters,
} from '../state/chart-url-state';
import type { ViewMode } from '../state/url-state';

interface Props {
  planId: string;
  search: Record<string, unknown>;
  /** Merge chart search keys into the URL; owned by the route so TanStack's typed router is happy. */
  onPatchSearch: (extra: Record<string, string | undefined>) => void;
  /** Charts owns the top toolbar on this view, so it also hosts the view switcher. */
  view: ViewMode;
  onViewChange: (next: ViewMode) => void;
}

export function PlanChartsView({ planId, search, onPatchSearch, view, onViewChange }: Props) {
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

  const filtersActive =
    filters.assignee_ids.length > 0 ||
    filters.bucket_ids.length > 0 ||
    filters.priorities.length > 0 ||
    filters.statuses.length > 0 ||
    filters.from !== undefined ||
    filters.to !== undefined;

  const onOpenInGrid = (args: OpenInGridArgs) =>
    onPatchSearch({
      view: 'grid',
      'filter.assignee': args.assignee ?? (search['filter.assignee'] as string | undefined),
    });

  return (
    <div data-testid="plan-charts" className="flex h-full flex-col">
      {/* Charts owns its own single top toolbar — chart filters at the start; range, customize,
          refresh, and the view switcher at the end. Pinned above the scroll and styled like the
          board toolbar, so charts show one filter level instead of stacking on the board's. */}
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-border border-b px-6 py-2">
        {/* Filters at the start — Range is a date-range filter, so it sits with the rest. */}
        <div className="flex flex-wrap items-center gap-2">
          <ChartFilterBar
            filters={filters}
            onChange={onFiltersChange}
            assigneeOptions={assigneeOptions}
            bucketOptions={bucketOptions}
          />
          <ChartRangeControl
            from={filters.from}
            to={filters.to}
            onChange={(r) => onFiltersChange({ ...filters, from: r.from, to: r.to })}
          />
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              label="Reset"
              onClick={() => onFiltersChange(EMPTY_CHART_FILTERS)}
            />
          )}
        </div>
        {/* Actions and view switch at the end. */}
        <div className="flex items-center gap-2">
          <CustomizeChartsPopover visible={visible} onChange={onVisibleChange} />
          <PlanViewSwitcher value={view} onChange={onViewChange} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-auto bg-card p-6">
        {q.isPending ? (
          <div
            data-testid="plan-charts-loading"
            className="flex h-40 items-center justify-center text-base text-secondary"
          >
            Loading charts…
          </div>
        ) : q.isError || !q.data ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-base text-secondary">
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
    </div>
  );
}
