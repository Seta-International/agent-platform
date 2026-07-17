import type { LabelRow, TaskWithAssigneesRow } from '@seta/planner';
import {
  createStaticSource,
  IconButton,
  LabelChip,
  type SearchableItem,
  Tokenizer,
  useToast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { plannerClient } from '../api/planner-client';
import { useApplyLabel } from '../hooks/mutations/apply-label';
import { useCreateLabel } from '../hooks/mutations/create-label';
import { useUnapplyLabel } from '../hooks/mutations/unapply-label';
import { usePlanCategories } from '../hooks/queries/use-plan-categories';
import { PERMISSION_DENIED } from '../lib/permission-messages';
import { plannerKeys } from '../state/query-keys';

// Mirrors the keyword palette LabelChip understands; hashing the name so a newly
// created label gets a stable color derived from its own text.
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

type LabelItem = SearchableItem<{ color: string }>;

export function TaskDetailLabelsCard({ task, planId, isLinkedToM365 = false }: Props) {
  const apply = useApplyLabel(planId);
  const unapply = useUnapplyLabel(planId);
  const create = useCreateLabel(planId);
  const canUpdate = usePermission('planner.task.update');
  const toast = useToast();
  const planLabelsQuery = useQuery({
    queryKey: plannerKeys.planLabels(planId),
    queryFn: () => plannerClient.listLabels(planId),
    staleTime: 30_000,
  });
  const categoriesQuery = usePlanCategories(planId);

  const categoryLabel = task.labels.find((l) => l.category_slot != null) ?? null;
  const categoryDescription = categoryLabel
    ? (categoriesQuery.data?.descriptions[String(categoryLabel.category_slot)] ?? null)
    : null;

  const appliedSlotless = task.labels.filter((l) => l.category_slot == null);
  const appliedIds = new Set(appliedSlotless.map((l) => l.id));
  const slotlessLabels: LabelRow[] = (planLabelsQuery.data ?? []).filter(
    (l) => l.category_slot == null,
  );

  const value: LabelItem[] = appliedSlotless.map((l) => ({
    id: l.id,
    label: l.name,
    auxiliaryData: { color: l.color || '' },
  }));

  // M365-linked plans sync only category-slot labels, so slot-less labels can't
  // be applied and no ad-hoc create is offered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keys on the raw query data/task labels/M365 flag; appliedIds and slotlessLabels are derived from those same deps each render, so listing them too would just be noise.
  const source = useMemo(
    () =>
      createStaticSource<LabelItem>(
        isLinkedToM365
          ? []
          : slotlessLabels
              .filter((l) => !appliedIds.has(l.id))
              .map((l) => ({ id: l.id, label: l.name, auxiliaryData: { color: l.color || '' } })),
      ),
    [planLabelsQuery.data, task.labels, isLinkedToM365],
  );

  const handleCreateAndApply = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const color = pickLabelColor(trimmed);
    try {
      const created = await create.mutateAsync({ name: trimmed, color });
      apply.mutate({
        task_id: task.id,
        label_id: created.id,
        label_name: created.name,
        label_color: created.color,
      });
    } catch {
      toast({ body: "Couldn't create label.", type: 'error' });
    }
  };

  return (
    <section className="card" aria-label="Labels">
      <header className="mb-2">
        <span className="text-sm text-secondary">Labels</span>
      </header>

      <Tokenizer<LabelItem>
        label="Labels"
        isLabelHidden
        placeholder="Filter or create label"
        searchSource={source}
        debounceMs={0}
        hasEntriesOnFocus
        hasCreate={!isLinkedToM365}
        isDisabled={!canUpdate}
        disabledMessage={PERMISSION_DENIED.task.edit}
        value={value}
        onChange={(_items, change) => {
          if (change.type === 'add') {
            apply.mutate({
              task_id: task.id,
              label_id: change.item.id,
              label_name: change.item.label,
              label_color: change.item.auxiliaryData?.color || '',
            });
          } else if (change.type === 'remove') {
            unapply.mutate({ task_id: task.id, label_id: change.item.id });
          } else if (change.type === 'create') {
            void handleCreateAndApply(change.item.label);
          }
        }}
        renderToken={(item, onRemove) => (
          <span key={item.id} className="inline-flex items-center gap-0.5">
            <LabelChip name={item.label} color={item.auxiliaryData?.color || undefined} />
            <IconButton
              variant="ghost"
              size="sm"
              label={`Remove ${item.label}`}
              onClick={onRemove}
              isDisabled={!canUpdate}
              icon={<X className="size-3" />}
            />
          </span>
        )}
        renderItem={(item) => (
          <LabelChip name={item.label} color={item.auxiliaryData?.color || undefined} />
        )}
      />

      {isLinkedToM365 && (
        <p className="mt-1.5 text-sm text-secondary">
          Labels sync from Microsoft Planner category slots.
        </p>
      )}

      {categoryLabel && (
        <div className="mt-2.5">
          <div className="text-xs text-secondary mb-1">Category</div>
          <span className="text-sm inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-primary">
            <span className="font-mono tabular-nums">cat {categoryLabel.category_slot}</span>
            <span aria-hidden="true">›</span>
            <span>{categoryDescription ?? categoryLabel.name}</span>
          </span>
        </div>
      )}
    </section>
  );
}
