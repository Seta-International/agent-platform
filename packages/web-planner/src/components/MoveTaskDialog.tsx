import type { BucketRow, GroupRow, PlanRow } from '@seta/planner';
import {
  Alert,
  AlertDescription,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
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
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [bucketPickerOpen, setBucketPickerOpen] = useState(false);

  // Source-of-truth for "plans I can write to": every plan in every group the
  // session has access to. The HTTP `listPlans` endpoint already filters by
  // `accessible_group_ids` server-side, so we don't need to join client-side.
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

  const selectedPlan = planId ? eligiblePlans.find((p) => p.id === planId) : null;
  const selectedBucket = bucketId ? orderedBuckets.find((b) => b.id === bucketId) : null;

  function reset() {
    setPlanId(null);
    setBucketId(null);
    setPlanPickerOpen(false);
    setBucketPickerOpen(false);
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Move task</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-body-sm text-ink-subtle">
              <p>
                Move <span className="text-ink">&ldquo;{taskTitle}&rdquo;</span> to a different
                plan. Assignees, checklist items, references, dates, priority, and progress carry
                over.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {plansQ.isError && (
            <Alert variant="destructive">
              <AlertDescription>Couldn&rsquo;t load plans. Try again.</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <label htmlFor="move-task-plan-trigger" className="text-caption text-ink-subtle">
              Target plan
            </label>
            <Popover open={planPickerOpen} onOpenChange={setPlanPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="move-task-plan-trigger"
                  type="button"
                  variant="secondary"
                  role="combobox"
                  aria-expanded={planPickerOpen}
                  aria-label="Select target plan"
                  className="w-full justify-between"
                  disabled={plansQ.isPending}
                >
                  <span className="truncate text-left">
                    {selectedPlan
                      ? `${groupName(selectedPlan.group_id)} — ${selectedPlan.name}`
                      : plansQ.isPending
                        ? 'Loading plans…'
                        : 'Pick a plan…'}
                  </span>
                  <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput aria-label="Filter plans" placeholder="Filter plans…" />
                  <CommandList>
                    <CommandEmpty>No plans available.</CommandEmpty>
                    {plansByGroup.map(({ groupId: gid, groupLabel, plans }) => (
                      <CommandGroup key={gid} heading={groupLabel}>
                        {plans.map((p) => (
                          <CommandItem
                            key={p.id}
                            // Include id suffix so cmdk treats every row as unique
                            // even when group + plan names collide.
                            value={`${groupLabel} ${p.name} ${p.id}`}
                            onSelect={() => {
                              setPlanId(p.id);
                              setBucketId(null);
                              setPlanPickerOpen(false);
                            }}
                            className="flex items-center gap-2"
                          >
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            {p.external_source === 'm365' && (
                              <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-caption text-ink-subtle">
                                M365
                              </span>
                            )}
                            {planId === p.id && <Check className="size-3.5 opacity-80" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="move-task-bucket-trigger" className="text-caption text-ink-subtle">
              Target bucket
            </label>
            <Popover open={bucketPickerOpen} onOpenChange={setBucketPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="move-task-bucket-trigger"
                  type="button"
                  variant="secondary"
                  role="combobox"
                  aria-expanded={bucketPickerOpen}
                  aria-label="Select target bucket"
                  className="w-full justify-between"
                  disabled={!planId || bucketsQ.isPending}
                >
                  <span className="truncate text-left">
                    {selectedBucket
                      ? selectedBucket.name
                      : !planId
                        ? 'Pick a plan first'
                        : bucketsQ.isPending
                          ? 'Loading buckets…'
                          : orderedBuckets.length === 0
                            ? 'No buckets in this plan'
                            : 'Pick a bucket…'}
                  </span>
                  <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput aria-label="Filter buckets" placeholder="Filter buckets…" />
                  <CommandList>
                    <CommandEmpty>No buckets in this plan.</CommandEmpty>
                    <CommandGroup>
                      {orderedBuckets.map((b) => (
                        <CommandItem
                          key={b.id}
                          value={b.name}
                          onSelect={() => {
                            setBucketId(b.id);
                            setBucketPickerOpen(false);
                          }}
                        >
                          <span className="truncate">{b.name}</span>
                          {bucketId === b.id && <Check className="ml-auto size-3.5 opacity-80" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {hasLabels && (
            <p className="text-caption text-semantic-warning">
              Labels on this task will be removed because they belong to the current plan.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
