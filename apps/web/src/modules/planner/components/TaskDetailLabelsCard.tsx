import type { LabelRow, TaskWithAssigneesRow } from '@seta/planner';
import {
  Badge,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { plannerClient } from '../api/planner-client';
import { useApplyLabel } from '../hooks/mutations/apply-label';
import { useUnapplyLabel } from '../hooks/mutations/unapply-label';
import { usePlanCategories } from '../hooks/queries/use-plan-categories';
import { plannerKeys } from '../state/query-keys';

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
  isLinkedToM365?: boolean;
}

export function TaskDetailLabelsCard({ task, planId, isLinkedToM365 = false }: Props) {
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
      <header className="mb-2">
        <span className="t-sm subtle">Labels</span>
      </header>
      <div className="flex flex-wrap items-center gap-1.5">
        {task.labels
          .filter((l) => l.category_slot == null)
          .map((l) => (
            <span key={l.id} className="inline-flex items-center gap-0.5">
              <LabelChip name={l.name} color={l.color || undefined} />
              <button
                type="button"
                aria-label={`Remove ${l.name}`}
                onClick={() => unapply.mutate({ task_id: task.id, label_id: l.id })}
                className="cursor-pointer border-none bg-transparent p-0.5 text-ink-subtle"
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
                  <TooltipProvider delayDuration={0}>
                    {availableLabels.map((l) =>
                      isLinkedToM365 ? (
                        <Tooltip key={l.id}>
                          <TooltipTrigger asChild>
                            {/* Wrapper div captures hover events; CommandItem's pointer-events-none only blocks clicks */}
                            <div>
                              <CommandItem value={l.name} disabled className="opacity-50">
                                <LabelChip name={l.name} color={l.color || undefined} />
                                <Badge variant="outline" className="ml-auto shrink-0">
                                  Local only
                                </Badge>
                              </CommandItem>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>{LOCAL_ONLY_TOOLTIP}</TooltipContent>
                        </Tooltip>
                      ) : (
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
                      ),
                    )}
                  </TooltipProvider>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {categoryLabel && (
        <div className="mt-2.5">
          <div className="t-xs subtle mb-1">Category</div>
          <span className="t-sm inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-ink">
            <span className="mono">cat {categoryLabel.category_slot}</span>
            <span aria-hidden="true">›</span>
            <span>{categoryDescription ?? categoryLabel.name}</span>
          </span>
        </div>
      )}
    </section>
  );
}

const LOCAL_ONLY_TOOLTIP =
  'Assign this label to a category slot in Plan settings to send it to Microsoft Planner.';
