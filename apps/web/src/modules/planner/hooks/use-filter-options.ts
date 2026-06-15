import type { FilterPillOption } from '@seta/shared-ui';
import { useMemo } from 'react';
import type { PlanBoardData } from './queries/use-plan-board';

export interface FilterOptions {
  assigneeOptions: ReadonlyArray<FilterPillOption<string>>;
  labelOptions: ReadonlyArray<FilterPillOption<string>>;
}

export function useFilterOptions(data: PlanBoardData | undefined): FilterOptions {
  return useMemo(() => {
    if (!data) {
      return { assigneeOptions: [], labelOptions: [] };
    }
    const assignees = new Map<string, string>();
    for (const t of data.tasks) {
      for (const a of t.assignees) {
        if (!assignees.has(a.user_id)) assignees.set(a.user_id, a.display_name);
      }
    }
    const assigneeOptions = [...assignees.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const labelOptions = data.labels
      .map((l) => ({ value: l.id, label: l.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { assigneeOptions, labelOptions };
  }, [data]);
}
