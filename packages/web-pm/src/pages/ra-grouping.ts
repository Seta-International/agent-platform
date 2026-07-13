import { rowCalendarEffort } from '../utils/common.ts';

export interface GroupableRow {
  allocation_id: string;
  worker_id: string | null;
  worker_name: string | null;
  account_name: string;
  project_name: string;
  planned_pct: number | null;
  date_from: string | null;
  date_to: string | null;
  bucket: string;
}

/** Secondary (within-person-group) sort fields the RA Monitoring table supports. */
export const SECONDARY_SORT_FIELDS = [
  'account',
  'project',
  'planned',
  'start',
  'end',
  'effort',
  'bucket',
] as const;

/** Case-insensitive display-name key so a person's rows sort together and
 *  alphabetically; unfilled seats (no worker) sort after everyone named, each
 *  as its own singleton "group" keyed by allocation id. */
export function personSortKey(r: GroupableRow): string {
  return r.worker_name ? r.worker_name.toLowerCase() : `\uFFFF${r.allocation_id}`;
}

/** Identity used to detect "same person as the previous row" once grouped. */
export function personGroupKey(r: GroupableRow): string {
  return r.worker_id ?? `unfilled:${r.allocation_id}`;
}

/** Ascending comparator for the within-group secondary sort field. */
export function compareByField(field: string, a: GroupableRow, b: GroupableRow): number {
  switch (field) {
    case 'account':
      return (a.account_name ?? '').localeCompare(b.account_name ?? '');
    case 'project':
      return (a.project_name ?? '').localeCompare(b.project_name ?? '');
    case 'planned':
      return (a.planned_pct ?? 0) - (b.planned_pct ?? 0);
    case 'start':
      return (a.date_from ?? '').localeCompare(b.date_from ?? '');
    case 'end':
      return (a.date_to ?? '').localeCompare(b.date_to ?? '');
    case 'effort':
      return rowCalendarEffort(a) - rowCalendarEffort(b);
    case 'bucket':
      return (a.bucket ?? '').localeCompare(b.bucket ?? '');
    default:
      return 0;
  }
}

/**
 * Groups rows by person — alphabetical, always, regardless of the secondary
 * sort direction — then sorts each group's own rows by `field`. Two projects
 * for the same person always stay adjacent, no matter what `field`/`desc` is.
 */
export function groupByPerson<T extends GroupableRow>(
  rows: T[],
  field: string,
  desc: boolean,
): T[] {
  const arr = [...rows];
  arr.sort((a, b) => {
    const personCmp = personSortKey(a).localeCompare(personSortKey(b));
    if (personCmp !== 0) return personCmp;
    const raw = compareByField(field, a, b);
    return desc ? -raw : raw;
  });
  return arr;
}

/** Allocation ids that are the first row of their person's group, given rows
 *  already ordered by {@link groupByPerson}. */
export function firstInGroupIds<T extends GroupableRow>(sortedRows: T[]): Set<string> {
  const ids = new Set<string>();
  let prevKey: string | null = null;
  for (const r of sortedRows) {
    const key = personGroupKey(r);
    if (key !== prevKey) ids.add(r.allocation_id);
    prevKey = key;
  }
  return ids;
}
