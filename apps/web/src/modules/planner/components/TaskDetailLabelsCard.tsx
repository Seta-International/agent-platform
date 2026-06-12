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
  Input,
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
import { Check, ChevronLeft, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { plannerClient } from '../api/planner-client';
import { useApplyLabel } from '../hooks/mutations/apply-label';
import { useCreateLabel } from '../hooks/mutations/create-label';
import { useDeleteLabel } from '../hooks/mutations/delete-label';
import { useUnapplyLabel } from '../hooks/mutations/unapply-label';
import { useUpdateLabel } from '../hooks/mutations/update-label';
import { usePlanCategories } from '../hooks/queries/use-plan-categories';
import { plannerKeys } from '../state/query-keys';
import { ConfirmDeleteLabelDialog } from './ConfirmDeleteLabelDialog';

// Mirrors the keyword palette LabelChip understands; cycling by name hash so
// the same label name picks the same swatch every time.
const LABEL_COLORS = ['blue', 'green', 'amber', 'red', 'purple', 'teal'] as const;

function pickLabelColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return LABEL_COLORS[Math.abs(h) % LABEL_COLORS.length] ?? LABEL_COLORS[0];
}

interface Props {
  task: TaskWithAssigneesRow;
  planId: string;
  isLinkedToM365?: boolean;
}

export function TaskDetailLabelsCard({ task, planId, isLinkedToM365 = false }: Props) {
  const apply = useApplyLabel(planId);
  const unapply = useUnapplyLabel(planId);
  const create = useCreateLabel(planId);
  const planLabelsQuery = useQuery({
    queryKey: plannerKeys.planLabels(planId),
    queryFn: () => plannerClient.listLabels(planId),
    staleTime: 30_000,
  });
  const categoriesQuery = usePlanCategories(planId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editingLabel, setEditingLabel] = useState<LabelRow | null>(null);

  const categoryLabel = task.labels.find((l) => l.category_slot != null) ?? null;
  const categoryDescription = categoryLabel
    ? (categoriesQuery.data?.descriptions[String(categoryLabel.category_slot)] ?? null)
    : null;

  const appliedIds = new Set(task.labels.map((l) => l.id));
  // The flyout is the management surface, so it lists every slot-less label
  // (applied + unapplied). Category-slot labels are managed in Plan settings.
  const slotlessLabels: LabelRow[] = (planLabelsQuery.data ?? []).filter(
    (l) => l.category_slot == null,
  );

  const trimmedSearch = search.trim();
  const hasExactMatch = (planLabelsQuery.data ?? []).some(
    (l) => l.name.toLowerCase() === trimmedSearch.toLowerCase(),
  );
  // M365-linked plans only sync category-slot labels, so we hide the create
  // affordance there — a fresh slot-less label would land disabled anyway.
  const canCreate = !isLinkedToM365 && trimmedSearch.length > 0 && !hasExactMatch;

  const handleCreateAndApply = async () => {
    const name = trimmedSearch;
    if (!name) return;
    const color = pickLabelColor(name);
    const created = await create.mutateAsync({ name, color });
    apply.mutate({
      task_id: task.id,
      label_id: created.id,
      label_name: created.name,
      label_color: created.color,
    });
    setPickerOpen(false);
    setSearch('');
  };

  const toggleLabel = (l: LabelRow) => {
    if (appliedIds.has(l.id)) {
      unapply.mutate({ task_id: task.id, label_id: l.id });
    } else {
      apply.mutate({
        task_id: task.id,
        label_id: l.id,
        label_name: l.name,
        label_color: l.color,
      });
    }
  };

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
        <Popover
          open={pickerOpen}
          onOpenChange={(o) => {
            setPickerOpen(o);
            if (!o) setEditingLabel(null);
          }}
        >
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Add label">
              <Plus className="size-3" />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            {editingLabel ? (
              <LabelEditPanel
                label={editingLabel}
                planId={planId}
                taskId={task.id}
                onClose={() => setEditingLabel(null)}
              />
            ) : (
              <Command>
                <CommandInput
                  aria-label="Filter labels"
                  placeholder="Filter or create label"
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    {canCreate ? null : isLinkedToM365 ? 'No labels.' : 'Type to create a label.'}
                  </CommandEmpty>
                  <CommandGroup>
                    <TooltipProvider delayDuration={0}>
                      {slotlessLabels.map((l) =>
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
                          <CommandItem key={l.id} value={l.name} onSelect={() => toggleLabel(l)}>
                            {appliedIds.has(l.id) ? (
                              <Check className="size-3 text-ink-subtle" />
                            ) : (
                              <span className="inline-block size-3" aria-hidden="true" />
                            )}
                            <LabelChip name={l.name} color={l.color || undefined} />
                            <button
                              type="button"
                              aria-label={`Edit ${l.name}`}
                              className="ml-auto cursor-pointer border-none bg-transparent p-0.5 text-ink-subtle"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingLabel(l);
                              }}
                            >
                              <Pencil className="size-3" />
                            </button>
                          </CommandItem>
                        ),
                      )}
                    </TooltipProvider>
                    {canCreate ? (
                      <CommandItem
                        key="__create__"
                        value={`__create__${trimmedSearch}`}
                        onSelect={() => {
                          void handleCreateAndApply();
                        }}
                      >
                        <Plus className="size-3" />
                        <span>
                          Create <span className="font-medium">&ldquo;{trimmedSearch}&rdquo;</span>
                        </span>
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                </CommandList>
              </Command>
            )}
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

function LabelEditPanel({
  label,
  planId,
  taskId,
  onClose,
}: {
  label: LabelRow;
  planId: string;
  taskId: string;
  onClose: () => void;
}) {
  const update = useUpdateLabel(planId);
  const del = useDeleteLabel(planId);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color || 'blue');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed !== label.name || color !== label.color;
  const canSave = trimmed.length > 0 && dirty;

  const handleSave = () => {
    if (!dirty) {
      onClose();
      return;
    }
    if (!trimmed) return;
    const patch: { name?: string; color?: string } = {};
    if (trimmed !== label.name) patch.name = trimmed;
    if (color !== label.color) patch.color = color;
    update.mutate({ label_id: label.id, patch }, { onSuccess: onClose });
  };

  return (
    <div className="space-y-3 p-3" data-testid="label-edit-panel">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Back to labels"
          onClick={onClose}
          className="cursor-pointer border-none bg-transparent p-0.5 text-ink-subtle"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="t-sm subtle">Edit label</span>
      </div>

      <Input
        aria-label="Label name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
          }
        }}
      />

      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Label color">
        {LABEL_COLORS.map((c) => (
          <label
            key={c}
            style={{
              borderRadius: 9999,
              cursor: 'pointer',
              outline:
                color === c ? '2px solid var(--color-primary)' : '1px solid var(--color-hairline)',
              outlineOffset: 1,
              display: 'inline-block',
            }}
          >
            <input
              type="radio"
              name="label-color"
              value={c}
              checked={color === c}
              onChange={() => setColor(c)}
              aria-label={c}
              className="sr-only"
            />
            <span
              className={`label-chip label-chip--${c}`}
              aria-hidden="true"
              style={{ display: 'block', width: 18, height: 18, borderRadius: 9999, padding: 0 }}
            >
              &nbsp;
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={update.isPending || del.isPending}
        >
          <Trash2 className="size-3" />
          Delete
        </Button>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave || update.isPending || del.isPending}
          >
            Save
          </Button>
        </div>
      </div>

      <ConfirmDeleteLabelDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        labelName={label.name}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(
            { label_id: label.id, task_id: taskId },
            {
              onSuccess: () => {
                setConfirmOpen(false);
                onClose();
              },
            },
          )
        }
      />
    </div>
  );
}

const LOCAL_ONLY_TOOLTIP =
  'Assign this label to a category slot in Plan settings to send it to Microsoft Planner.';
