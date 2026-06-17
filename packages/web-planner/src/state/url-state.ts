export interface BoardFilters {
  assignee_ids: string[];
  label_ids: string[];
}

export const EMPTY_FILTERS: BoardFilters = {
  assignee_ids: [],
  label_ids: [],
};

export type ViewMode = 'board' | 'grid' | 'calendar' | 'charts';
export type GroupBy = 'bucket' | 'assignee' | 'priority' | 'due' | 'label';

const VIEW_MODES = ['board', 'grid', 'calendar', 'charts'] as const;
const GROUP_BYS = ['bucket', 'assignee', 'priority', 'due', 'label'] as const;

function splitCSV(s: string | undefined): string[] {
  return (s ?? '').split(',').flatMap((x) => {
    const v = x.trim();
    return v ? [v] : [];
  });
}

export function parseFiltersFromSearch(search: Record<string, string | undefined>): BoardFilters {
  return {
    assignee_ids: splitCSV(search['filter.assignee']),
    label_ids: splitCSV(search['filter.label']),
  };
}

export function serializeFiltersToSearch(f: BoardFilters): Record<string, string | undefined> {
  return {
    'filter.assignee': f.assignee_ids.length ? f.assignee_ids.join(',') : undefined,
    'filter.label': f.label_ids.length ? f.label_ids.join(',') : undefined,
  };
}

export function parseViewMode(s: string | undefined): ViewMode {
  return (VIEW_MODES as readonly string[]).includes(s ?? '') ? (s as ViewMode) : 'board';
}

export function parseGroupBy(s: string | undefined): GroupBy {
  return (GROUP_BYS as readonly string[]).includes(s ?? '') ? (s as GroupBy) : 'bucket';
}

export function parseSearchQuery(s: string | undefined): string {
  return (s ?? '').trim();
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a calFrom/calTo URL value; undefined when absent or malformed. */
export function parseDateKey(s: string | undefined): string | undefined {
  return s !== undefined && DATE_KEY_RE.test(s) ? s : undefined;
}
