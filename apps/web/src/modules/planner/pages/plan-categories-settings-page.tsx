import { CategoryDescriptionEditor, Skeleton, toast } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { PlannerClientError } from '../api/planner-client';
import { type PlanSettingsTab, PlanSettingsTabStrip } from '../components/PlanSettingsTabStrip';
import { PlanError } from '../components/plan-error';
import { useSetCategoryDescriptions } from '../hooks/mutations/set-category-descriptions';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { usePlanCategories } from '../hooks/queries/use-plan-categories';

interface Props {
  planId: string;
}

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading categories" className="p-7">
      <Skeleton className="mb-4 h-8 w-1/3" />
      <Skeleton className="mb-2 h-6 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function PlanCategoriesSettingsPage({ planId }: Props) {
  const navigate = useNavigate();
  const q = usePlanCategories(planId);
  const boardQ = usePlanBoard(planId);
  const m = useSetCategoryDescriptions(planId);

  const isForbidden = q.error instanceof PlannerClientError && q.error.status === 403;
  useEffect(() => {
    if (!isForbidden) return;
    toast.error('You no longer have access to edit categories for this plan.');
    void navigate({ to: '/planner/groups' });
  }, [isForbidden, navigate]);

  const onTabChange = (next: PlanSettingsTab) => {
    if (next === 'categories') return;
    // Other sub-pages aren't routed yet; keep the strip interactive without navigating away.
  };

  if (q.isPending) return <PageSkeleton />;
  if (isForbidden) return null;
  if (q.isError || !q.data) {
    return <PlanError error={q.error} onRetry={() => void q.refetch()} />;
  }

  const { descriptions, labels, task_counts, counts } = q.data;
  const planName = boardQ.data?.plan.name ?? '';
  const buckets = boardQ.data?.buckets.length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <header className="px-7 pt-4 pb-0 border-b border-hairline bg-canvas">
        <div className="text-xs text-ink-subtle mb-1">
          Plan settings {planName ? `· ${planName}` : null}
        </div>
        <h1 className="text-lg font-semibold text-ink mb-3">
          {planName ? `${planName} settings` : 'Plan settings'}
        </h1>
        <PlanSettingsTabStrip
          activeTab="categories"
          counts={{ buckets, members: 0, categories: counts.categories }}
          onTabChange={onTabChange}
        />
      </header>
      <div className="flex-1 overflow-auto bg-surface-1">
        <div
          className="mx-auto"
          style={{
            maxWidth: 980,
            padding: '24px 28px 40px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <CategoryDescriptionEditor
            descriptions={descriptions}
            labels={labels}
            taskCounts={task_counts}
            disabled={m.isPending}
            onSave={(payload) => {
              const slots: Record<number, { name?: string | null; label_id?: string | null }> = {};
              for (const [k, patch] of Object.entries(payload.slots)) {
                const slotNum = Number(k);
                const next: { name?: string | null; label_id?: string | null } = {};
                if ('name' in patch) next.name = patch.name ?? null;
                if ('labelId' in patch) next.label_id = patch.labelId ?? null;
                slots[slotNum] = next;
              }
              void m
                .mutateAsync({ slots })
                .then(() => toast.success('Categories saved'))
                .catch((err) => {
                  toast.error(err instanceof Error ? err.message : 'Failed to save categories');
                });
            }}
          />
          <div
            className="rounded-md border border-hairline bg-canvas p-3 text-sm text-ink-subtle"
            role="note"
          >
            <strong className="block text-ink text-xs uppercase tracking-wide mb-1">
              Heads up
            </strong>
            Categories without an attached label show as named category strings only — they won't
            filter Seta tasks until you attach a label. Slots above 25 stay Seta-only; native labels
            can hold any number.
          </div>
        </div>
      </div>
    </div>
  );
}
