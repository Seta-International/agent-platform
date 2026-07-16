import type { BucketRow, GroupRow, PlanRow } from '@seta/planner';
import {
  Banner,
  Button,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  LayoutFooter,
  Selector,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { plannerClient } from '../api/planner-client';
import { plannerKeys } from '../state/query-keys';
import { compareOrderHint } from '../state/task-derived';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  taskTitle: string;
  /** Plan id the task currently lives in. Excluded from the target picker. */
  currentPlanId: string;
  /** Whether the task has at least one applied label — toggles the strip warning. */
  hasLabels: boolean;
  /**
   * Invoked after the user confirms. Receives the resolved target plan + bucket
   * plus the target plan name (for the success toast).
   */
  onConfirm: (args: {
    targetPlanId: string;
    targetBucketId: string | null;
    targetPlanName: string;
  }) => void;
  pending?: boolean;
}

export function MoveTaskDialog({
  open,
  onOpenChange,
  taskTitle,
  currentPlanId,
  hasLabels,
  onConfirm,
  pending = false,
}: Props) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState<string | null>(null);

  // Source-of-truth for "plans I can write to": every plan in every group the
  // caller has access to. The HTTP `listPlans` endpoint already filters by
  // live group membership server-side, so we don't need to join client-side.
  const plansQ = useQuery({
    queryKey: [...plannerKeys.all, 'allWritablePlans'] as const,
    queryFn: () => plannerClient.listPlans({}),
    staleTime: 30_000,
    enabled: open,
  });

  const groupsQ = useQuery({
    queryKey: plannerKeys.myGroups(),
    queryFn: plannerClient.listMyGroups,
    staleTime: 30_000,
    enabled: open,
  });

  // Buckets for the currently selected plan. Skipped until a plan is chosen.
  const bucketsQ = useQuery({
    queryKey: planId
      ? ([...plannerKeys.plan(planId), 'buckets'] as const)
      : ([...plannerKeys.all, 'noop-buckets'] as const),
    queryFn: () => plannerClient.listBuckets(planId as string),
    staleTime: 30_000,
    enabled: !!planId && open,
  });
  const orderedBuckets = useMemo(() => {
    const list = (bucketsQ.data ?? []) as BucketRow[];
    return list.slice().sort((a, b) => compareOrderHint(a.order_hint, b.order_hint));
  }, [bucketsQ.data]);

  const eligiblePlans = useMemo(() => {
    const plans = (plansQ.data ?? []) as PlanRow[];
    // Defensive dedupe by id: M365 sync can leak duplicate plan rows when an
    // upstream group is re-linked, and the picker should never show the same
    // plan twice. Keep the first occurrence.
    const seen = new Set<string>();
    return plans.filter((p) => {
      if (p.id === currentPlanId || p.deleted_at !== null) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [plansQ.data, currentPlanId]);

  const groupName = useMemo(() => {
    const groups = (groupsQ.data ?? []) as GroupRow[];
    return (id: string) => groups.find((g) => g.id === id)?.name ?? 'Unknown group';
  }, [groupsQ.data]);

  // Group eligible plans by group_id so the picker reads as a sectioned list
  // (group name once as a header; plans listed under it).
  const plansByGroup = useMemo(() => {
    const map = new Map<string, PlanRow[]>();
    for (const p of eligiblePlans) {
      const list = map.get(p.group_id) ?? [];
      list.push(p);
      map.set(p.group_id, list);
    }
    return Array.from(map.entries())
      .map(([gid, ps]) => ({ groupId: gid, groupLabel: groupName(gid), plans: ps }))
      .sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
  }, [eligiblePlans, groupName]);

  const planOptions = useMemo(
    () =>
      plansByGroup.map(({ groupLabel, plans }) => ({
        type: 'section' as const,
        title: groupLabel,
        options: plans.map((p) => ({
          value: p.id,
          label: p.external_source === 'm365' ? `${p.name} · M365` : p.name,
        })),
      })),
    [plansByGroup],
  );
  const bucketOptions = useMemo(
    () => orderedBuckets.map((b) => ({ value: b.id, label: b.name })),
    [orderedBuckets],
  );

  const selectedPlan = planId ? eligiblePlans.find((p) => p.id === planId) : null;

  function reset() {
    setPlanId(null);
    setBucketId(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleSubmit() {
    if (!planId || !bucketId || !selectedPlan) return;
    onConfirm({
      targetPlanId: planId,
      targetBucketId: bucketId,
      targetPlanName: selectedPlan.name,
    });
  }

  const submitDisabled = !planId || !bucketId || pending;

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} width={560} purpose="form">
      <Layout
        header={<DialogHeader title="Move task" onOpenChange={handleOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-2 text-body-sm text-ink-subtle">
              <p>
                Move <span className="text-ink">&ldquo;{taskTitle}&rdquo;</span> to a different
                plan. Assignees, checklist items, references, dates, priority, and progress carry
                over.
              </p>
            </div>

            <div className="space-y-4 py-2">
              {plansQ.isError && <Banner status="error" title="Couldn’t load plans. Try again." />}

              <div className="space-y-1.5">
                <Selector
                  label="Target plan"
                  options={planOptions}
                  value={planId ?? ''}
                  onChange={(v) => {
                    setPlanId(v || null);
                    setBucketId(null);
                  }}
                  placeholder={plansQ.isPending ? 'Loading plans…' : 'Pick a plan…'}
                  isDisabled={plansQ.isPending}
                  hasSearch
                />
              </div>

              <div className="space-y-1.5">
                <Selector
                  label="Target bucket"
                  options={bucketOptions}
                  value={bucketId ?? ''}
                  onChange={(v) => setBucketId(v || null)}
                  placeholder={
                    !planId
                      ? 'Pick a plan first'
                      : bucketsQ.isPending
                        ? 'Loading buckets…'
                        : orderedBuckets.length === 0
                          ? 'No buckets in this plan'
                          : 'Pick a bucket…'
                  }
                  isDisabled={!planId || bucketsQ.isPending}
                  hasSearch
                />
              </div>

              {hasLabels && (
                <p className="text-caption text-semantic-warning">
                  Labels on this task will be removed because they belong to the current plan.
                </p>
              )}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button
              variant="ghost"
              label="Cancel"
              onClick={() => handleOpenChange(false)}
              isDisabled={pending}
            />
            <Button label="Move" onClick={handleSubmit} isDisabled={submitDisabled} />
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
