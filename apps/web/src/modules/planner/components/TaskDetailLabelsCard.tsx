import type { LabelRow, TaskWithAssigneesRow } from '@seta/planner';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  LabelChip,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { plannerClient } from '../api/planner-client';
import { useApplyLabel } from '../hooks/mutations/apply-label';
import { useUnapplyLabel } from '../hooks/mutations/unapply-label';
import { usePlanCategories } from '../hooks/queries/use-plan-categories';
import { plannerKeys } from '../state/query-keys';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
}

export function TaskDetailLabelsCard({ task, planId }: Props) {
  const apply = useApplyLabel(planId);
  const unapply = useUnapplyLabel(planId);
  const planLabelsQuery = useQuery({
    queryKey: plannerKeys.planLabels(planId),
    queryFn: () => plannerClient.listLabels(planId),
    staleTime: 30_000,
  });
  const categoriesQuery = usePlanCategories(planId);

  const [pickerOpen, setPickerOpen] = useState(false);

  const categoryLabel = task.labels.find((l) => l.category_slot != null) ?? null;
  const categoryDescription = categoryLabel
    ? (categoriesQuery.data?.descriptions[String(categoryLabel.category_slot)] ?? null)
    : null;

  const appliedIds = new Set(task.labels.map((l) => l.id));
  const availableLabels: LabelRow[] = (planLabelsQuery.data ?? []).filter(
    (l) => !appliedIds.has(l.id) && l.category_slot == null,
  );

  return (
    <section className="card" aria-label="Labels">
      <header style={head}>
        <span className="t-sm subtle">Labels</span>
      </header>
      <div style={chips}>
        {task.labels
          .filter((l) => l.category_slot == null)
          .map((l) => (
            <span key={l.id} style={chipWrap}>
              <LabelChip name={l.name} color={l.color || undefined} />
              <button
                type="button"
                aria-label={`Remove ${l.name}`}
                onClick={() => unapply.mutate({ task_id: task.id, label_id: l.id })}
                style={chipRemove}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Add label">
              <Plus className="size-3" />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <Command>
              <CommandInput aria-label="Filter labels" placeholder="Filter labels" />
              <CommandList>
                <CommandEmpty>No labels.</CommandEmpty>
                <CommandGroup>
                  {availableLabels.map((l) => (
                    <CommandItem
                      key={l.id}
                      value={l.name}
                      onSelect={() => {
                        apply.mutate({
                          task_id: task.id,
                          label_id: l.id,
                          label_name: l.name,
                          label_color: l.color,
                        });
                        setPickerOpen(false);
                      }}
                    >
                      <LabelChip name={l.name} color={l.color || undefined} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {categoryLabel && (
        <div style={categorySection}>
          <div className="t-xs subtle" style={{ marginBottom: 4 }}>
            Category
          </div>
          <span style={categoryPill} className="t-sm">
            <span className="mono">cat {categoryLabel.category_slot}</span>
            <span aria-hidden="true">›</span>
            <span>{categoryDescription ?? categoryLabel.name}</span>
          </span>
        </div>
      )}
    </section>
  );
}

const head: CSSProperties = { marginBottom: 8 };
const chips: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
};
const chipWrap: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
};
const chipRemove: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-ink-subtle)',
  cursor: 'pointer',
  padding: 2,
};
const categorySection: CSSProperties = { marginTop: 10 };
const categoryPill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 6,
  background: 'var(--color-surface-2)',
  color: 'var(--color-ink)',
};
