export interface BoardFilters {
  assignee_ids: string[];
  label_ids: string[];
  skill_tags: string[];
}

export const EMPTY_FILTERS: BoardFilters = {
  assignee_ids: [],
  label_ids: [],
  skill_tags: [],
};

export type ViewMode = 'board' | 'grid';
export type GroupBy = 'bucket' | 'assignee' | 'priority' | 'due' | 'label';

const VIEW_MODES = ['board', 'grid'] as const;
const GROUP_BYS = ['bucket', 'assignee', 'priority', 'due', 'label'] as const;

function splitCSV(s: string | undefined): string[] {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function parseFiltersFromSearch(search: Record<string, string | undefined>): BoardFilters {
  return {
    assignee_ids: splitCSV(search['filter.assignee']),
    label_ids: splitCSV(search['filter.label']),
    skill_tags: splitCSV(search['filter.skill']),
  };
}

export function serializeFiltersToSearch(f: BoardFilters): Record<string, string | undefined> {
  return {
    'filter.assignee': f.assignee_ids.length ? f.assignee_ids.join(',') : undefined,
    'filter.label': f.label_ids.length ? f.label_ids.join(',') : undefined,
    'filter.skill': f.skill_tags.length ? f.skill_tags.join(',') : undefined,
  };
}

export function parseViewMode(s: string | undefined): ViewMode {
  return (VIEW_MODES as readonly string[]).includes(s ?? '') ? (s as ViewMode) : 'board';
}

export function parseGroupBy(s: string | undefined): GroupBy {
  return (GROUP_BYS as readonly string[]).includes(s ?? '') ? (s as GroupBy) : 'bucket';
}
