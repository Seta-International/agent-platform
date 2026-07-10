import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  buttonVariants,
  Combobox,
  type ComboboxOption,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { useMutation } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  FolderKanban,
  Info,
  Percent,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  type ProjectListRow,
  previewReassignWorkerAllocations,
  type RaMonitoringAllocation,
  type ReassignGroupPreviewResult,
  reassignWorkerAllocations,
  removeAllocation,
  updateAllocation,
} from '../api/pm-client.ts';
import { AllocationTimeline, type TimelineRow } from './allocation-timeline.tsx';
import {
  type Bucket,
  daysBetweenInclusive,
  emptyReassignRow,
  formatDisplayDate,
  type ReassignTargetRow,
  todayIso,
} from './ra-shared.tsx';

type Step = 1 | 2;

interface RowDraft {
  account_id: string;
  project_id: string;
  planned_pct: string;
  date_from: string;
  date_to: string;
  bucket: Bucket;
  note: string;
}

export interface ReassignWizardTarget {
  worker_id: string;
  worker_name: string | null;
  worker_title: string | null;
}

export function ReassignWizardDialog({
  target,
  allocations,
  accountOptions,
  projects,
  onClose,
  onReassigned,
}: {
  target: ReassignWizardTarget | null;
  allocations: RaMonitoringAllocation[];
  accountOptions: ComboboxOption[];
  projects: ProjectListRow[];
  onClose: () => void;
  onReassigned: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [targetRows, setTargetRows] = useState<ReassignTargetRow[]>([]);
  const [preview, setPreview] = useState<ReassignGroupPreviewResult | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<RaMonitoringAllocation | null>(null);
  // Locally reflects a row already saved directly on this screen, so it shows
  // the new values immediately without waiting on the parent's allocations
  // query to refetch.
  const [savedOverrides, setSavedOverrides] = useState<
    Record<
      string,
      {
        account_id: string;
        project_id: string;
        planned_pct: number;
        date_from: string;
        date_to: string;
        bucket: Bucket;
        note: string | null;
      }
    >
  >({});
  // Live edits to each existing allocation's fields, keyed by allocation id —
  // every row is directly editable (no select-then-edit step), so this needs
  // to hold drafts for as many rows as the PM is currently touching at once.
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({});

  const targetPrevRef = useRef(target);
  if (targetPrevRef.current !== target) {
    targetPrevRef.current = target;
    if (target) {
      setStep(1);
      setTargetRows([]);
      setPreview(null);
      setConfirmTarget(null);
      setSavedOverrides({});
      setRowDrafts({});
    }
  }

  // Only future allocations (not yet ended) can be reassigned — a row whose
  // whole period is already in the past is history, not something to move.
  const futureAllocations = useMemo(
    () => allocations.filter((a) => !a.date_to || a.date_to >= todayIso()),
    [allocations],
  );

  function effectiveRow(a: RaMonitoringAllocation) {
    const override = savedOverrides[a.allocation_id];
    return {
      account_id: override?.account_id ?? a.account_id,
      project_id: override?.project_id ?? a.project_id,
      planned_pct: override?.planned_pct ?? a.planned_pct ?? 0,
      date_from: override?.date_from ?? a.date_from,
      date_to: override?.date_to ?? a.date_to,
      bucket: override?.bucket ?? a.bucket,
      note: override?.note ?? a.note,
    };
  }

  function draftFor(a: RaMonitoringAllocation): RowDraft {
    const existing = rowDrafts[a.allocation_id];
    if (existing) return existing;
    const effective = effectiveRow(a);
    return {
      account_id: effective.account_id,
      project_id: effective.project_id,
      planned_pct: String(effective.planned_pct),
      date_from: effective.date_from ?? '',
      date_to: effective.date_to ?? '',
      bucket: effective.bucket,
      note: effective.note ?? '',
    };
  }

  function updateRowDraft(a: RaMonitoringAllocation, patch: Partial<RowDraft>) {
    setRowDrafts((m) => ({
      ...m,
      [a.allocation_id]: { ...draftFor(a), ...patch },
    }));
  }

  const saveRowMutation = useMutation({
    mutationFn: (vars: { allocationId: string; draft: RowDraft; expectedVersion: number }) =>
      updateAllocation(vars.allocationId, {
        project_id: vars.draft.project_id,
        planned_pct: Number(vars.draft.planned_pct),
        date_from: vars.draft.date_from,
        date_to: vars.draft.date_to || null,
        bucket: vars.draft.bucket,
        note: vars.draft.note || null,
        expected_version: vars.expectedVersion,
      }),
    onSuccess: (_, vars) => {
      toast.success('Allocation updated');
      setSavedOverrides((m) => ({
        ...m,
        [vars.allocationId]: {
          account_id: vars.draft.account_id,
          project_id: vars.draft.project_id,
          planned_pct: Number(vars.draft.planned_pct),
          date_from: vars.draft.date_from,
          date_to: vars.draft.date_to,
          bucket: vars.draft.bucket,
          note: vars.draft.note || null,
        },
      }));
      onReassigned();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (allocationId: string) => removeAllocation(allocationId),
    onSuccess: (_, allocationId) => {
      toast.success('Allocation removed');
      setRowDrafts((m) => {
        const next = { ...m };
        delete next[allocationId];
        return next;
      });
      setConfirmTarget(null);
      onReassigned();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      previewReassignWorkerAllocations({
        worker_id: target?.worker_id as string,
        allocation_ids: [],
        source: { date_to: todayIso() }, // unused — no existing allocation is being ended here
        targets: targetRows.map((r) => ({
          project_id: r.project_id,
          date_from: r.date_from,
          planned_pct: Number(r.planned_pct),
          bucket: r.bucket,
          date_to: r.date_to || null,
        })),
      }),
    onSuccess: (result) => setPreview(result),
  });

  const mutation = useMutation({
    mutationFn: () =>
      reassignWorkerAllocations({
        worker_id: target?.worker_id as string,
        allocation_ids: [],
        source: { date_to: todayIso() }, // unused — no existing allocation is being ended here
        targets: targetRows.map((r) => ({
          project_id: r.project_id,
          date_from: r.date_from,
          planned_pct: Number(r.planned_pct),
          bucket: r.bucket,
          date_to: r.date_to || null,
        })),
      }),
    onSuccess: (result) => {
      if (result.warnings.length > 0) {
        toast.warning(
          `Saved — but this now exceeds 100% at: ${result.warnings
            .map((w) => `${w.project_name} (${w.peak_pct}%)`)
            .join(', ')}`,
        );
      } else {
        toast.success('Reassigned');
      }
      onReassigned();
      onClose();
    },
  });

  function goToReview() {
    setStep(2);
    previewMutation.mutate();
  }

  const canReview =
    targetRows.length > 0 &&
    targetRows.every((r) => r.project_id && r.date_from && Number(r.planned_pct) > 0);

  const dialogScrollRef = useRef<HTMLDivElement>(null);

  // Opening the Account/Project combobox autofocuses its search input, and the
  // browser scrolls this dialog's own scroll container to reveal it — which
  // reads as the dialog jumping back to the top. Snap the scroll position back
  // for a few frames to cancel that out without blocking the popover itself.
  function preserveScrollPosition() {
    const el = dialogScrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    let frames = 0;
    const tick = () => {
      if (el.scrollTop !== top) el.scrollTop = top;
      frames += 1;
      if (frames < 4) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  return (
    <>
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          ref={dialogScrollRef}
          onPointerDownCapture={preserveScrollPosition}
          className="max-h-[90vh] overflow-y-auto sm:max-w-6xl"
        >
          <DialogHeader>
            <DialogTitle>{target?.worker_name ?? 'Employee'}</DialogTitle>
          </DialogHeader>

          {step === 2 ? (
            <ReviewStep
              preview={preview}
              currentAllocations={futureAllocations}
              previewMutation={previewMutation}
              mutation={mutation}
              onBack={() => setStep(1)}
              onConfirm={() => mutation.mutate()}
            />
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-md border border-hairline">
                <div className="grid grid-cols-[10rem_1fr_5rem_8rem_9rem_6rem_10rem_5rem] gap-2 bg-surface-1 px-2 py-2 text-caption text-ink-muted">
                  <div className="text-left font-medium">Account</div>
                  <div className="text-left font-medium">Project</div>
                  <div className="text-left font-medium">Allocation</div>
                  <div className="text-left font-medium">Start date</div>
                  <div className="text-left font-medium">End date</div>
                  <div className="text-left font-medium">Type</div>
                  <div className="text-left font-medium">Note</div>
                  <div className="text-left font-medium">Action</div>
                </div>
                {futureAllocations.map((a) => {
                  const draft = draftFor(a);
                  return (
                    <div
                      key={a.allocation_id}
                      className="grid grid-cols-[10rem_1fr_5rem_8rem_9rem_6rem_10rem_5rem] items-center gap-2 border-t border-hairline px-2 py-2 text-body-sm"
                    >
                      <div className="relative">
                        <Building2
                          aria-hidden="true"
                          className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-ink-subtle"
                        />
                        <Combobox
                          options={accountOptions}
                          value={draft.account_id || null}
                          onChange={(v) =>
                            updateRowDraft(a, { account_id: v ?? '', project_id: '' })
                          }
                          placeholder="Select account…"
                          searchPlaceholder="Search accounts…"
                          className="w-full pl-7"
                          aria-label={`Account for ${a.project_name}`}
                        />
                      </div>
                      <div className="relative">
                        <FolderKanban
                          aria-hidden="true"
                          className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-ink-subtle"
                        />
                        <Combobox
                          options={projects
                            // Reassign target must be a project the caller manages (FUT-353) —
                            // the backend rejects others, so don't offer them.
                            .filter(
                              (p) =>
                                p.can_manage &&
                                (!draft.account_id || p.account_id === draft.account_id),
                            )
                            .map((p) => ({ value: p.project_id, label: p.name }))}
                          value={draft.project_id || null}
                          onChange={(v) => updateRowDraft(a, { project_id: v ?? '' })}
                          placeholder={
                            draft.account_id ? 'Select project…' : 'Pick an account first'
                          }
                          searchPlaceholder="Search projects…"
                          className="w-full pl-7"
                          aria-label={`Project for ${a.project_name}`}
                        />
                      </div>
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          className="h-8 pr-5"
                          value={draft.planned_pct}
                          onChange={(e) => updateRowDraft(a, { planned_pct: e.target.value })}
                        />
                        <Percent
                          aria-hidden="true"
                          className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-ink-subtle"
                        />
                      </div>
                      <Input
                        type="date"
                        aria-label={`Start date for ${a.project_name}`}
                        className="h-8 text-caption"
                        value={draft.date_from}
                        onChange={(e) => {
                          const newFrom = e.target.value;
                          updateRowDraft(a, {
                            date_from: newFrom,
                            date_to:
                              draft.date_to && draft.date_to < newFrom ? newFrom : draft.date_to,
                          });
                        }}
                      />
                      <Input
                        type="date"
                        aria-label={`End date for ${a.project_name}`}
                        className="h-8 text-caption"
                        min={draft.date_from || undefined}
                        value={draft.date_to}
                        onChange={(e) => updateRowDraft(a, { date_to: e.target.value })}
                      />
                      <Select
                        value={draft.bucket}
                        onValueChange={(v) => updateRowDraft(a, { bucket: v as Bucket })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="billable">Billable</SelectItem>
                          <SelectItem value="internal">Internal</SelectItem>
                          <SelectItem value="bench">Bench</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8"
                        value={draft.note}
                        onChange={(e) => updateRowDraft(a, { note: e.target.value })}
                      />
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="secondary"
                          aria-label={`Save ${a.project_name}`}
                          disabled={
                            saveRowMutation.isPending || !draft.account_id || !draft.project_id
                          }
                          onClick={() =>
                            saveRowMutation.mutate({
                              allocationId: a.allocation_id,
                              draft,
                              expectedVersion: a.version,
                            })
                          }
                        >
                          <Check className="size-3.5 text-[var(--color-success)]" />
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          aria-label={`Delete ${a.project_name}`}
                          onClick={() => setConfirmTarget(a)}
                        >
                          <Trash2 className="size-3.5 text-ink-subtle" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="w-fit gap-1.5 border-primary text-primary hover:bg-primary-tint"
                onClick={() => setTargetRows((rs) => [...rs, emptyReassignRow(todayIso())])}
              >
                <Plus className="size-4" />
                Add project
              </Button>

              {targetRows.length > 0 ? (
                <div className="overflow-hidden rounded-md border border-hairline">
                  <div className="grid grid-cols-[1fr_1fr_6rem_8rem_8rem_6rem_3rem] gap-2 bg-surface-1 px-2 py-2 text-caption text-ink-muted">
                    <div className="text-left font-medium">
                      Account <span className="text-danger-ink">*</span>
                    </div>
                    <div className="text-left font-medium">
                      Project <span className="text-danger-ink">*</span>
                    </div>
                    <div className="text-left font-medium">
                      Allocation (%) <span className="text-danger-ink">*</span>
                    </div>
                    <div className="text-left font-medium">Start date</div>
                    <div className="text-left font-medium">End date</div>
                    <div className="text-left font-medium">Type</div>
                    <div className="text-left font-medium">Action</div>
                  </div>
                  {targetRows.map((row, i) => (
                    <TargetRowFields
                      key={row.key}
                      row={row}
                      accountOptions={accountOptions}
                      projects={projects}
                      onChange={(patch) =>
                        setTargetRows((rs) =>
                          rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
                        )
                      }
                      onRemove={() => setTargetRows((rs) => rs.filter((_, idx) => idx !== i))}
                      canRemove={targetRows.length > 1}
                    />
                  ))}
                </div>
              ) : null}

              <Alert variant="info">
                <Info />
                <AlertDescription>
                  <strong className="text-ink">Note:</strong> new allocation(s) added above will be
                  applied after you review and confirm in the next step.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {step === 1 ? (
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!canReview} className="gap-1.5" onClick={goToReview}>
                Review impact
                <ArrowRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove allocation?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? `This removes ${
                    confirmTarget.worker_name ?? 'this unfilled seat'
                  } from ${confirmTarget.project_name}. The allocation is ended for People's view; this can't be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={removeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmTarget) removeMutation.mutate(confirmTarget.allocation_id);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TargetRowFields({
  row,
  accountOptions,
  projects,
  onChange,
  onRemove,
  canRemove,
}: {
  row: ReassignTargetRow;
  accountOptions: ComboboxOption[];
  projects: ProjectListRow[];
  onChange: (patch: Partial<ReassignTargetRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_6rem_8rem_8rem_6rem_3rem] items-center gap-2 border-t border-hairline px-2 py-2">
      <div className="relative">
        <Building2
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-ink-subtle"
        />
        <Combobox
          options={accountOptions}
          value={row.account_id || null}
          onChange={(v) => onChange({ account_id: v ?? '', project_id: '' })}
          placeholder="Select account…"
          searchPlaceholder="Search accounts…"
          className="w-full pl-7"
          aria-label="Account"
        />
      </div>
      <div className="relative">
        <FolderKanban
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-ink-subtle"
        />
        <Combobox
          options={projects
            .filter((p) => !row.account_id || p.account_id === row.account_id)
            .map((p) => ({ value: p.project_id, label: p.name }))}
          value={row.project_id || null}
          onChange={(v) => onChange({ project_id: v ?? '' })}
          placeholder={row.account_id ? 'Select project…' : 'Pick an account first'}
          searchPlaceholder="Search projects…"
          className="w-full pl-7"
          aria-label="Project"
        />
      </div>
      <div className="relative">
        <Input
          type="number"
          min={0}
          max={100}
          className="pr-6"
          value={row.planned_pct}
          onChange={(e) => onChange({ planned_pct: e.target.value })}
        />
        <Percent
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle"
        />
      </div>
      <Input
        type="date"
        aria-label="Start date"
        value={row.date_from}
        onChange={(e) => {
          const newFrom = e.target.value;
          onChange({
            date_from: newFrom,
            date_to: row.date_to && row.date_to < newFrom ? newFrom : row.date_to,
          });
        }}
      />
      <Input
        type="date"
        aria-label="End date"
        min={row.date_from || undefined}
        value={row.date_to}
        onChange={(e) => onChange({ date_to: e.target.value })}
      />
      <Select value={row.bucket} onValueChange={(v) => onChange({ bucket: v as Bucket })}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="billable">Billable</SelectItem>
          <SelectItem value="internal">Internal</SelectItem>
          <SelectItem value="bench">Bench</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Remove"
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function ReviewStep({
  preview,
  currentAllocations,
  previewMutation,
  mutation,
  onBack,
  onConfirm,
}: {
  preview: ReassignGroupPreviewResult | null;
  currentAllocations: RaMonitoringAllocation[];
  previewMutation: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
  };
  mutation: { isPending: boolean; isError: boolean; error: Error | null };
  onBack: () => void;
  onConfirm: () => void;
}) {
  if (previewMutation.isPending) {
    return <p className="py-8 text-center text-caption text-ink-muted">Checking impact…</p>;
  }

  const timelineRows: TimelineRow[] = [
    ...currentAllocations.map((a) => ({
      key: a.allocation_id,
      label: a.project_name,
      date_from: a.date_from as string,
      date_to: a.date_to,
      planned_pct: a.planned_pct ?? 0,
    })),
    ...(preview?.targets.map((t, i) => ({
      key: `target-${i}`,
      label: t.project_name,
      date_from: t.date_from,
      date_to: t.date_to,
      planned_pct: t.planned_pct,
    })) ?? []),
  ];

  return (
    <div className="space-y-4">
      {previewMutation.isError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{previewMutation.error?.message}</AlertDescription>
        </Alert>
      ) : null}
      {mutation.isError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{mutation.error?.message}</AlertDescription>
        </Alert>
      ) : null}

      {preview?.exceeds ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            This will allocate {preview.worker_name ?? 'this person'} to{' '}
            <strong>{preview.peak_pct}%</strong> at the busiest point.
            {preview.peak_from ? (
              <>
                <br />
                Overlap occurs from <strong>{formatDisplayDate(preview.peak_from)}</strong> to{' '}
                <strong>{preview.peak_to ? formatDisplayDate(preview.peak_to) : 'Ongoing'}</strong>
                {preview.peak_to
                  ? ` (${daysBetweenInclusive(preview.peak_from, preview.peak_to)} days)`
                  : ''}{' '}
                — over 100%. You can still confirm below.
              </>
            ) : (
              ' — over 100%. You can still confirm below.'
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <AllocationTimeline rows={timelineRows} todayIso={todayIso()} />

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={mutation.isPending} onClick={onConfirm}>
          {mutation.isPending ? 'Confirming…' : 'Confirm reassign'}
        </Button>
      </div>
    </div>
  );
}
