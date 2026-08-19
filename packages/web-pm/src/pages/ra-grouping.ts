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

/** Identity used to detect "same project for the same person" once grouped. */
export function projectGroupKey(r: GroupableRow): string {
  return `${personGroupKey(r)}::${r.account_name ?? ''}::${r.project_name ?? ''}`;
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
 * sort direction — then keeps allocations for the same project together within
 * each person's group, sorting project groups by `field` and sorting individual
 * allocation periods within each project chronologically by date.
 */
export function groupByPerson<T extends GroupableRow>(
  rows: T[],
  field: string,
  desc: boolean,
): T[] {
  // First, group by person
  const personMap = new Map<string, T[]>();
  for (const r of rows) {
    const pKey = personSortKey(r);
    const list = personMap.get(pKey);
    if (list) {
      list.push(r);
    } else {
      personMap.set(pKey, [r]);
    }
  }

  // Sort person keys alphabetically
  const sortedPersonKeys = [...personMap.keys()].sort((a, b) => a.localeCompare(b));

  const result: T[] = [];

  for (const pKey of sortedPersonKeys) {
    const personRows = personMap.get(pKey) ?? [];

    // Group rows of this person by project
    const projectMap = new Map<string, T[]>();
    for (const r of personRows) {
      const projKey = projectGroupKey(r);
      const list = projectMap.get(projKey);
      if (list) {
        list.push(r);
      } else {
        projectMap.set(projKey, [r]);
      }
    }

    // Sort each project's periods chronologically by date_from
    for (const periods of projectMap.values()) {
      periods.sort((a, b) => {
        const startCmp = (a.date_from ?? '').localeCompare(b.date_from ?? '');
        if (startCmp !== 0) return startCmp;
        return (a.date_to ?? '').localeCompare(b.date_to ?? '');
      });
    }

    // Sort project groups relative to each other using the first (earliest) row of each project
    const projectGroups = [...projectMap.values()];
    projectGroups.sort((groupA, groupB) => {
      const repA = groupA[0];
      const repB = groupB[0];
      if (!repA || !repB) return 0;
      const raw = compareByField(field, repA, repB);
      if (raw !== 0) return desc ? -raw : raw;
      // Stable fallback
      const projCmp = (repA.project_name ?? '').localeCompare(repB.project_name ?? '');
      if (projCmp !== 0) return projCmp;
      return (repA.account_name ?? '').localeCompare(repB.account_name ?? '');
    });

    for (const group of projectGroups) {
      result.push(...group);
    }
  }

  return result;
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

/** Allocation ids that are the first row of their project's group for a person,
 *  given rows already ordered by {@link groupByPerson}. */
export function firstInProjectGroupIds<T extends GroupableRow>(sortedRows: T[]): Set<string> {
  const ids = new Set<string>();
  let prevKey: string | null = null;
  for (const r of sortedRows) {
    const key = projectGroupKey(r);
    if (key !== prevKey) ids.add(r.allocation_id);
    prevKey = key;
  }
  return ids;
}

export interface ProjectGroupMeta {
  indexInGroup: number;
  totalInGroup: number;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Builds metadata for each allocation row within its project group
 * (same person + same account + same project).
 * Identifies position (first, middle, last), index, and total count in group.
 */
export function projectGroupMetaMap<T extends GroupableRow>(
  sortedRows: T[],
): Map<string, ProjectGroupMeta> {
  const map = new Map<string, ProjectGroupMeta>();
  let i = 0;
  while (i < sortedRows.length) {
    const firstRow = sortedRows[i];
    if (!firstRow) break;
    const start = i;
    const currentKey = projectGroupKey(firstRow);
    while (i < sortedRows.length) {
      const nextRow = sortedRows[i];
      if (!nextRow || projectGroupKey(nextRow) !== currentKey) break;
      i++;
    }
    const end = i;
    const totalInGroup = end - start;
    for (let j = start; j < end; j++) {
      const r = sortedRows[j];
      if (r) {
        map.set(r.allocation_id, {
          indexInGroup: j - start,
          totalInGroup,
          isFirst: j === start,
          isLast: j === end - 1,
        });
      }
    }
  }
  return map;
}
