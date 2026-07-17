import type { LabelRow, TaskWithAssigneesRow } from '@seta/planner';
import {
  Button,
  createStaticSource,
  IconButton,
  Input,
  LabelChip,
  type SearchableItem,
  Tokenizer,
  useToast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Pencil, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { plannerClient } from '../api/planner-client';
import { useApplyLabel } from '../hooks/mutations/apply-label';
import { useCreateLabel } from '../hooks/mutations/create-label';
import { useDeleteLabel } from '../hooks/mutations/delete-label';
import { useUnapplyLabel } from '../hooks/mutations/unapply-label';
import { useUpdateLabel } from '../hooks/mutations/update-label';
import { usePlanCategories } from '../hooks/queries/use-plan-categories';
import { PERMISSION_DENIED } from '../lib/permission-messages';
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

// Swatch background tints — mirrors the LabelChip palette so the picker preview
// matches the rendered chip. Kept local: this is a color-swatch picker, not a chip.
const SWATCH_BACKGROUND: Record<(typeof LABEL_COLORS)[number], string> = {
  blue: 'var(--color-info-tint)',
  green: 'var(--color-success-tint)',
  amber: 'var(--color-warning-tint)',
  red: 'var(--color-danger-tint)',
  purple: 'rgba(168, 85, 247, 0.10)',
  teal: 'rgba(20, 184, 166, 0.10)',
};

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

  const [managing, setManaging] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelRow | null>(null);

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
        <span className="t-sm subtle">Labels</span>
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
        <p className="mt-1.5 text-caption text-ink-subtle">
          Labels sync from Microsoft Planner category slots.
        </p>
      )}

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

      {!isLinkedToM365 && canUpdate && (
        <div className="mt-2.5">
          <Button
            size="sm"
            variant="ghost"
            label={managing ? 'Done' : 'Manage labels'}
            icon={<Pencil className="size-3" />}
            onClick={() => {
              setManaging((m) => !m);
              setEditingLabel(null);
            }}
          />
          {managing && (
            <div className="mt-2 rounded-md border border-hairline p-2" data-testid="manage-labels">
              {editingLabel ? (
                <LabelEditPanel
                  label={editingLabel}
                  planId={planId}
                  taskId={task.id}
                  onClose={() => setEditingLabel(null)}
                />
              ) : slotlessLabels.length === 0 ? (
                <p className="t-sm subtle px-1 py-1.5">No labels to manage yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {slotlessLabels.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2">
                      <LabelChip name={l.name} color={l.color || undefined} />
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label={`Edit ${l.name}`}
                        onClick={() => setEditingLabel(l)}
                        icon={<Pencil className="size-3" />}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
        <IconButton
          variant="ghost"
          size="sm"
          label="Back to labels"
          onClick={onClose}
          icon={<ChevronLeft className="size-4" />}
        />
        <span className="t-sm subtle">Edit label</span>
      </div>

      <Input
        label="Label name"
        isLabelHidden
        value={name}
        onChange={(value) => setName(value)}
        onEnter={handleSave}
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
              aria-hidden="true"
              style={{
                display: 'block',
                width: 18,
                height: 18,
                borderRadius: 9999,
                padding: 0,
                background: SWATCH_BACKGROUND[c],
              }}
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
          icon={<Trash2 className="size-3" />}
          label="Delete"
          onClick={() => setConfirmOpen(true)}
          isDisabled={update.isPending || del.isPending}
        />
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            label="Cancel"
            onClick={onClose}
            isDisabled={del.isPending}
          />
          <Button
            size="sm"
            label="Save"
            onClick={handleSave}
            isDisabled={!canSave || update.isPending || del.isPending}
          />
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
