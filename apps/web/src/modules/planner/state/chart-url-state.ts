import { CHART_REGISTRY, type ChartId, DEFAULT_VISIBLE } from '../components/charts/chart-registry';

export interface ChartFiltersState {
  assignee_ids: string[];
  bucket_ids: string[];
  priorities: Array<1 | 3 | 5 | 9>;
  statuses: Array<'not_started' | 'in_progress' | 'completed'>;
  from?: string;
  to?: string;
}

export const EMPTY_CHART_FILTERS: ChartFiltersState = {
  assignee_ids: [],
  bucket_ids: [],
  priorities: [],
  statuses: [],
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const splitCSV = (v: unknown) =>
  str(v)
    .split(',')
    .flatMap((x) => (x.trim() ? [x.trim()] : []));

export function parseChartFilters(s: Record<string, unknown>): ChartFiltersState {
  return {
    assignee_ids: splitCSV(s['c.assignee']),
    bucket_ids: splitCSV(s['c.bucket']),
    priorities: splitCSV(s['c.priority'])
      .map(Number)
      .filter((n): n is 1 | 3 | 5 | 9 => [1, 3, 5, 9].includes(n)),
    statuses: splitCSV(s['c.status']).filter(
      (x): x is ChartFiltersState['statuses'][number] =>
        x === 'not_started' || x === 'in_progress' || x === 'completed',
    ),
    from: str(s['c.from']) || undefined,
    to: str(s['c.to']) || undefined,
  };
}

export function parseVisibleCharts(s: Record<string, unknown>): ChartId[] {
  const valid = new Set(CHART_REGISTRY.filter((c) => !c.disabled).map((c) => c.id));
  const picked = splitCSV(s['c.show']).filter((id): id is ChartId => valid.has(id as ChartId));
  return picked.length ? picked : DEFAULT_VISIBLE;
}

export function serializeChartState(
  f: ChartFiltersState,
  visible: ChartId[],
): Record<string, string | undefined> {
  const csv = (a: Array<string | number>) => (a.length ? a.join(',') : undefined);
  const show = visible.join(',');
  return {
    'c.assignee': csv(f.assignee_ids),
    'c.bucket': csv(f.bucket_ids),
    'c.priority': csv(f.priorities),
    'c.status': csv(f.statuses),
    'c.from': f.from,
    'c.to': f.to,
    'c.show': show === DEFAULT_VISIBLE.join(',') ? undefined : show,
  };
}

/** Maps the URL filter state to the planner-client query shape. */
export function toChartApiFilters(f: ChartFiltersState) {
  return {
    assignee_ids: f.assignee_ids,
    bucket_ids: f.bucket_ids,
    priorities: f.priorities,
    statuses: f.statuses,
    from: f.from,
    to: f.to,
  };
}
