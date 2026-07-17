import {
  BreadcrumbItem,
  Breadcrumbs,
  CategoryDescriptionEditor,
  Heading,
  Skeleton,
  useToast,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { PlannerClientError } from '../api/planner-client';
import { PlanSettingsTabStrip } from '../components/PlanSettingsTabStrip';
import { PlanError } from '../components/plan-error';
import type { PlanSettingsTab } from '../components/plan-settings-tabs';
import { useSetCategoryDescriptions } from '../hooks/mutations/set-category-descriptions';
import { usePlanBoard } from '../hooks/queries/use-plan-board';
import { usePlanCategories } from '../hooks/queries/use-plan-categories';

interface Props {
  planId: string;
}

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading categories" className="p-7">
      <Skeleton className="mb-4" height={32} width="33.3333%" />
      <Skeleton className="mb-2" height={24} />
      <Skeleton height={256} />
    </div>
  );
}

export function PlanCategoriesSettingsPage({ planId }: Props) {
  const navigate = useNavigate();
  const q = usePlanCategories(planId);
  const boardQ = usePlanBoard(planId);
  const m = useSetCategoryDescriptions(planId);
  const toast = useToast();

  const isForbidden = q.error instanceof PlannerClientError && q.error.status === 403;
  useEffect(() => {
    if (!isForbidden) return;
    toast({ body: "You can't edit categories for this plan anymore.", type: 'error' });
    void navigate({ to: '/planner/groups' });
  }, [isForbidden, navigate, toast]);

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
  const planForGroup = boardQ.data?.plan;
  const buckets = boardQ.data?.buckets.length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <header className="px-7 pt-4 pb-0 border-b border-border bg-body">
        <div className="mb-2">
          <Breadcrumbs variant="supporting">
            <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
            {planForGroup ? (
              <BreadcrumbItem href={`/planner/plans/${planForGroup.id}`}>{planName}</BreadcrumbItem>
            ) : null}
            <BreadcrumbItem>Settings</BreadcrumbItem>
            <BreadcrumbItem isCurrent>Categories</BreadcrumbItem>
          </Breadcrumbs>
        </div>
        <Heading level={1} className="mb-1">
          Categories{planName ? ` · ${planName}` : ''}
        </Heading>
        <p className="mb-3 text-body-sm text-secondary" data-testid="categories-sync-subhead">
          {planForGroup?.external_source === 'm365'
            ? 'Synced with Microsoft Planner'
            : 'Just for this plan'}
        </p>
        <PlanSettingsTabStrip
          activeTab="categories"
          counts={{ buckets, members: 0, categories: counts.categories }}
          onTabChange={onTabChange}
        />
      </header>
      <div className="flex-1 overflow-auto bg-card">
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
                .then(() => toast({ body: 'Categories saved' }))
                .catch((err) => {
                  toast({
                    body: err instanceof Error ? err.message : "Couldn't save categories",
                    type: 'error',
                  });
                });
            }}
          />
          <div
            className="rounded-md border border-border bg-body p-3 text-sm text-secondary"
            role="note"
          >
            <strong className="block text-primary text-xs uppercase tracking-wide mb-1">
              Heads up
            </strong>
            Categories without a label show as plain names — they won&apos;t filter tasks until you
            attach a label. Slots above 25 live only here; Microsoft labels can hold any number.
          </div>
        </div>
      </div>
    </div>
  );
}
