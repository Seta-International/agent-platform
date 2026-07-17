import {
  AlertDialog,
  Banner,
  Button,
  createStaticSource,
  DateInput,
  Dialog,
  DialogHeader,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  type SearchableItem,
  Selector,
  Typeahead,
  useToast,
} from '@seta/shared-ui';
import { useMutation } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  FolderKanban,
  Info,
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
  ALLOCATION_FRACTION_STEPS,
  type Bucket,
  daysBetweenInclusive,
  emptyReassignRow,
  existingAllocationErrors,
  formatDisplayDate,
  fractionToPct,
  isValidIsoDate,
  pctToFraction,
  type ReassignTargetRow,
  targetAllocationErrors,
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
  accountOptions: SearchableItem[];
  projects: ProjectListRow[];
  onClose: () => void;
  onReassigned: () => void;
}) {
  const toast = useToast();
  const accountSource = useMemo(() => createStaticSource(accountOptions), [accountOptions]);
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
      // Held as a 0–1 fraction in the draft; converted back to a percentage on save.
      planned_pct: pctToFraction(effective.planned_pct),
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
        planned_pct: fractionToPct(vars.draft.planned_pct),
        date_from: vars.draft.date_from,
        date_to: vars.draft.date_to || null,
        bucket: vars.draft.bucket,
        note: vars.draft.note || null,
        expected_version: vars.expectedVersion,
      }),
    onSuccess: (_, vars) => {
      toast({ body: 'Allocation updated' });
      setSavedOverrides((m) => ({
        ...m,
        [vars.allocationId]: {
          account_id: vars.draft.account_id,
          project_id: vars.draft.project_id,
          // savedOverrides mirror the backend's percentage semantics (feeds effectiveRow/timeline).
          planned_pct: fractionToPct(vars.draft.planned_pct),
          date_from: vars.draft.date_from,
          date_to: vars.draft.date_to,
          bucket: vars.draft.bucket,
          note: vars.draft.note || null,
        },
      }));
      onReassigned();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const removeMutation = useMutation({
    mutationFn: (allocationId: string) => removeAllocation(allocationId),
    onSuccess: (_, allocationId) => {
      toast({ body: 'Allocation removed' });
      setRowDrafts((m) => {
        const next = { ...m };
        delete next[allocationId];
        return next;
      });
      setConfirmTarget(null);
      onReassigned();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
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
          planned_pct: fractionToPct(r.planned_pct),
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
          planned_pct: fractionToPct(r.planned_pct),
          bucket: r.bucket,
          date_to: r.date_to || null,
        })),
      }),
    onSuccess: (result) => {
      if (result.warnings.length > 0) {
        toast({
          body: `Saved — but this now exceeds 100% at: ${result.warnings
            .map((w) => `${w.project_name} (${w.peak_pct}%)`)
            .join(', ')}`,
        });
      } else {
        toast({ body: 'Reassigned' });
      }
      onReassigned();
      onClose();
    },
  });

  function goToReview() {
    setStep(2);
    previewMutation.mutate();
  }

  // Per-row validation errors for the "Add project" rows: a past start date, or an overlap with
  // another allocation on the same project (FUT-349). Shown inline in red and used to gate Review.
  const targetErrors = useMemo(
    () => targetAllocationErrors(targetRows, allocations, todayIso()),
    [targetRows, allocations],
  );

  // Same validation for the existing ("update") rows: a start edited into the past, or an
  // overlap between two of this person's allocations on one project. Keyed by allocation id;
  // gates each row's own Save and surfaces above the Add project button. Cheap (a handful of
  // rows) and depends on per-render draft state, so it's computed inline rather than memoized.
  const existingErrors = existingAllocationErrors(
    futureAllocations.map((a) => {
      const eff = effectiveRow(a);
      const draft = draftFor(a);
      return {
        id: a.allocation_id,
        project_id: draft.project_id,
        date_from: draft.date_from,
        date_to: draft.date_to,
        locked: !!eff.date_from && eff.date_from < todayIso(),
      };
    }),
    todayIso(),
  );

  // Start and end date are both mandatory for a new allocation — Review impact stays disabled
  // until every target row has a project, a positive allocation, two valid calendar dates, and
  // no validation error.
  const canReview =
    targetRows.length > 0 &&
    targetRows.every(
      (r, i) =>
        r.project_id &&
        Number(r.planned_pct) > 0 &&
        isValidIsoDate(r.date_from) &&
        isValidIsoDate(r.date_to) &&
        targetErrors[i] == null,
    );

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
        isOpen={target !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        width={1152}
        maxHeight="90vh"
        purpose="form"
      >
        <Layout
          header={
            <DialogHeader
              title={target?.worker_name ?? 'Employee'}
              onOpenChange={(open) => {
                if (!open) onClose();
              }}
            />
          }
          content={
            // The account/project Typeahead floats use the native `popover` attribute
            // (top-layer promotion), so they're never clipped by this scroll container
            // regardless of nesting — the ref/handler below exist for a separate reason:
            // preserveScrollPosition cancels out the scroll-into-view jump a focused
            // combobox input triggers (see that function for details).
            <LayoutContent ref={dialogScrollRef} onPointerDownCapture={preserveScrollPosition}>
              {step === 2 ? (
                <ReviewStep
                  preview={preview}
                  currentAllocations={futureAllocations}
                  previewMutation={previewMutation}
                  mutation={mutation}
                />
              ) : (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-md border border-border">
                    <div className="grid grid-cols-[10rem_1fr_5rem_8rem_9rem_6rem_10rem_5rem] gap-2 bg-card px-2 py-2 text-caption text-secondary">
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
                      // A row that already started (start date in the past) is locked to end-date and
                      // delete only — you can shorten/extend or remove it, but not rewrite its terms.
                      const eff = effectiveRow(a);
                      const startLocked = !!eff.date_from && eff.date_from < todayIso();
                      // Reassign target must be a project the caller manages (FUT-353) — the
                      // backend rejects others, so don't offer them. Recomputed per row (not
                      // memoized — this is a per-iteration render, not a hook-eligible scope)
                      // since the cascade depends on this row's own selected account.
                      const rowProjectItems = projects
                        .filter(
                          (p) =>
                            p.can_manage &&
                            (!draft.account_id || p.account_id === draft.account_id),
                        )
                        .map((p) => ({ id: p.project_id, label: p.name }));
                      const rowProjectSource = createStaticSource(rowProjectItems);
                      return (
                        <div
                          key={a.allocation_id}
                          className="grid grid-cols-[10rem_1fr_5rem_8rem_9rem_6rem_10rem_5rem] items-center gap-2 border-t border-border px-2 py-2 text-body-sm"
                        >
                          <div className="relative">
                            <Building2
                              aria-hidden="true"
                              className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-secondary"
                            />
                            <Typeahead
                              label={`Account for ${a.project_name}`}
                              isLabelHidden
                              searchSource={accountSource}
                              debounceMs={0}
                              // No hasEntriesOnFocus here: this is the first tabbable field in the
                              // Dialog, and the native <dialog> element's own showModal()-driven
                              // auto-focus behavior (HTML living standard, not a Radix-specific
                              // quirk) can land on it — combined with hasEntriesOnFocus that would
                              // silently pop its dropdown open the instant the wizard appears
                              // (confirmed via focusin firing synchronously during the Dialog's
                              // mount commit). The "Add project" rows below don't exist at mount
                              // time, so they're unaffected and keep it.
                              value={accountOptions.find((o) => o.id === draft.account_id) ?? null}
                              isDisabled={startLocked}
                              onChange={(item) =>
                                updateRowDraft(a, {
                                  account_id: item?.id ?? '',
                                  project_id: '',
                                })
                              }
                              placeholder="Select account…"
                              className="w-full pl-7"
                            />
                          </div>
                          <div className="relative">
                            <FolderKanban
                              aria-hidden="true"
                              className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-secondary"
                            />
                            <Typeahead
                              label={`Project for ${a.project_name}`}
                              isLabelHidden
                              searchSource={rowProjectSource}
                              debounceMs={0}
                              value={rowProjectItems.find((o) => o.id === draft.project_id) ?? null}
                              isDisabled={startLocked}
                              onChange={(item) => updateRowDraft(a, { project_id: item?.id ?? '' })}
                              placeholder={
                                draft.account_id ? 'Select project…' : 'Pick an account first'
                              }
                              className="w-full pl-7"
                            />
                          </div>
                          <AllocationSelect
                            value={draft.planned_pct}
                            disabled={startLocked}
                            ariaLabel={`Allocation for ${a.project_name}`}
                            onChange={(v) => updateRowDraft(a, { planned_pct: v })}
                          />
                          <DateInput
                            label={`Start date for ${a.project_name}`}
                            isLabelHidden
                            size="sm"
                            isDisabled={startLocked}
                            value={draft.date_from || undefined}
                            onChange={(v) => {
                              const newFrom = v ?? '';
                              updateRowDraft(a, {
                                date_from: newFrom,
                                date_to:
                                  draft.date_to && draft.date_to < newFrom
                                    ? newFrom
                                    : draft.date_to,
                              });
                            }}
                          />
                          <DateInput
                            label={`End date for ${a.project_name}`}
                            isLabelHidden
                            size="sm"
                            min={draft.date_from || undefined}
                            value={draft.date_to || undefined}
                            onChange={(v) => updateRowDraft(a, { date_to: v ?? '' })}
                          />
                          <Selector
                            label={`Type for ${a.project_name}`}
                            isLabelHidden
                            size="sm"
                            options={[
                              { value: 'billable', label: 'Billable' },
                              { value: 'internal', label: 'Internal' },
                              { value: 'bench', label: 'Bench' },
                            ]}
                            value={draft.bucket}
                            isDisabled={startLocked}
                            onChange={(v) => updateRowDraft(a, { bucket: v as Bucket })}
                          />
                          <Input
                            label={`Note for ${a.project_name}`}
                            isLabelHidden
                            size="sm"
                            isDisabled={startLocked}
                            value={draft.note}
                            onChange={(value) => updateRowDraft(a, { note: value })}
                          />
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              isIconOnly
                              icon={<Check className="size-3.5 text-[var(--color-success)]" />}
                              label={`Save ${a.project_name}`}
                              isDisabled={
                                saveRowMutation.isPending ||
                                !draft.account_id ||
                                !draft.project_id ||
                                existingErrors[a.allocation_id] != null
                              }
                              onClick={() =>
                                saveRowMutation.mutate({
                                  allocationId: a.allocation_id,
                                  draft,
                                  expectedVersion: a.version,
                                })
                              }
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              isIconOnly
                              icon={<Trash2 className="size-3.5 text-secondary" />}
                              label={`Delete ${a.project_name}`}
                              onClick={() => setConfirmTarget(a)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {futureAllocations.some((a) => existingErrors[a.allocation_id]) ? (
                    <div className="space-y-0.5">
                      {futureAllocations.map((a) =>
                        existingErrors[a.allocation_id] ? (
                          <p
                            key={a.allocation_id}
                            role="alert"
                            className="text-caption font-medium text-error"
                          >
                            {a.project_name}: {existingErrors[a.allocation_id]}
                          </p>
                        ) : null,
                      )}
                    </div>
                  ) : null}

                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-fit gap-1.5 border-accent-bg text-accent hover:bg-accent-muted"
                    label="Add project"
                    icon={<Plus className="size-4" />}
                    onClick={() => setTargetRows((rs) => [...rs, emptyReassignRow(todayIso())])}
                  />

                  {targetRows.length > 0 ? (
                    <div className="overflow-hidden rounded-md border border-border">
                      <div className="grid grid-cols-[1fr_1fr_6rem_8rem_8rem_6rem_3rem] gap-2 bg-card px-2 py-2 text-caption text-secondary">
                        <div className="text-left font-medium">
                          Account <span className="text-error">*</span>
                        </div>
                        <div className="text-left font-medium">
                          Project <span className="text-error">*</span>
                        </div>
                        <div className="text-left font-medium">
                          Allocation <span className="text-error">*</span>
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
                          error={targetErrors[i] ?? null}
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

                  <div
                    role="alert"
                    className="flex items-center gap-3 rounded-md bg-accent-muted p-sm text-body-sm text-accent"
                  >
                    <Info className="size-4 shrink-0 text-accent" />
                    <div>
                      <strong className="text-primary">Note:</strong> new allocation(s) added above
                      will be applied after you review and confirm in the next step.
                    </div>
                  </div>
                </div>
              )}
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              {step === 1 ? (
                <>
                  <Button variant="ghost" label="Cancel" onClick={onClose} />
                  <Button
                    isDisabled={!canReview}
                    label="Review impact"
                    endContent={<ArrowRight className="size-4" />}
                    onClick={goToReview}
                  />
                </>
              ) : (
                <>
                  <Button variant="ghost" label="Back" onClick={() => setStep(1)} />
                  <Button
                    isDisabled={mutation.isPending}
                    label={mutation.isPending ? 'Confirming…' : 'Confirm'}
                    onClick={() => mutation.mutate()}
                  />
                </>
              )}
            </LayoutFooter>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={confirmTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirmTarget(null);
        }}
        title="Remove allocation?"
        description={
          confirmTarget
            ? `This removes ${
                confirmTarget.worker_name ?? 'this unfilled seat'
              } from ${confirmTarget.project_name}. The allocation is ended for People's view; this can't be undone.`
            : ''
        }
        actionLabel="Remove"
        isActionLoading={removeMutation.isPending}
        onAction={() => {
          if (confirmTarget) removeMutation.mutate(confirmTarget.allocation_id);
        }}
      />
    </>
  );
}

// Allocation picker: a 0–1 fraction in 0.1 steps (0, 0.1 … 1). An off-step stored value
// (e.g. a legacy 33% → '0.33') is kept as an extra option so editing never silently snaps it.
function AllocationSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const options = (ALLOCATION_FRACTION_STEPS as readonly string[]).includes(value)
    ? ALLOCATION_FRACTION_STEPS
    : [value, ...ALLOCATION_FRACTION_STEPS];
  return (
    <Selector
      label={ariaLabel}
      isLabelHidden
      size="sm"
      options={options.map((v) => ({ value: v, label: v }))}
      value={value}
      onChange={onChange}
      isDisabled={disabled}
    />
  );
}

function TargetRowFields({
  row,
  accountOptions,
  projects,
  onChange,
  onRemove,
  canRemove,
  error,
}: {
  row: ReassignTargetRow;
  accountOptions: SearchableItem[];
  projects: ProjectListRow[];
  onChange: (patch: Partial<ReassignTargetRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
  error: string | null;
}) {
  const accountSource = useMemo(() => createStaticSource(accountOptions), [accountOptions]);
  const projectItems = useMemo(
    () =>
      projects
        .filter((p) => !row.account_id || p.account_id === row.account_id)
        .map((p) => ({ id: p.project_id, label: p.name })),
    [projects, row.account_id],
  );
  const projectSource = useMemo(() => createStaticSource(projectItems), [projectItems]);

  return (
    <div className="border-t border-border">
      <div className="grid grid-cols-[1fr_1fr_6rem_8rem_8rem_6rem_3rem] items-center gap-2 px-2 py-2">
        <div className="relative">
          <Building2
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-secondary"
          />
          <Typeahead
            label="Account"
            isLabelHidden
            searchSource={accountSource}
            debounceMs={0}
            hasEntriesOnFocus
            value={accountOptions.find((o) => o.id === row.account_id) ?? null}
            onChange={(item) => onChange({ account_id: item?.id ?? '', project_id: '' })}
            placeholder="Select account…"
            className="w-full pl-7"
          />
        </div>
        <div className="relative">
          <FolderKanban
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-secondary"
          />
          <Typeahead
            label="Project"
            isLabelHidden
            searchSource={projectSource}
            debounceMs={0}
            hasEntriesOnFocus
            value={projectItems.find((o) => o.id === row.project_id) ?? null}
            onChange={(item) => onChange({ project_id: item?.id ?? '' })}
            placeholder={row.account_id ? 'Select project…' : 'Pick an account first'}
            className="w-full pl-7"
          />
        </div>
        <AllocationSelect
          value={row.planned_pct}
          ariaLabel="Allocation"
          onChange={(v) => onChange({ planned_pct: v })}
        />
        <DateInput
          label="Start date"
          isLabelHidden
          size="sm"
          value={row.date_from || undefined}
          onChange={(v) => {
            const newFrom = v ?? '';
            onChange({
              date_from: newFrom,
              date_to: row.date_to && row.date_to < newFrom ? newFrom : row.date_to,
            });
          }}
        />
        <DateInput
          label="End date"
          isLabelHidden
          size="sm"
          min={row.date_from || undefined}
          value={row.date_to || undefined}
          onChange={(v) => onChange({ date_to: v ?? '' })}
        />
        <Selector
          label="Type"
          isLabelHidden
          options={[
            { value: 'billable', label: 'Billable' },
            { value: 'internal', label: 'Internal' },
            { value: 'bench', label: 'Bench' },
          ]}
          value={row.bucket}
          onChange={(v) => onChange({ bucket: v as Bucket })}
        />
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          icon={<Trash2 className="size-4" />}
          label="Remove"
          isDisabled={!canRemove}
          onClick={onRemove}
        />
      </div>
      {error ? (
        <p role="alert" className="px-2 pb-2 text-caption font-medium text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ReviewStep({
  preview,
  currentAllocations,
  previewMutation,
  mutation,
}: {
  preview: ReassignGroupPreviewResult | null;
  currentAllocations: RaMonitoringAllocation[];
  previewMutation: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
  };
  mutation: { isPending: boolean; isError: boolean; error: Error | null };
}) {
  if (previewMutation.isPending) {
    return <p className="py-8 text-center text-caption text-secondary">Checking impact…</p>;
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
        <Banner status="error" title={previewMutation.error?.message} />
      ) : null}
      {mutation.isError ? <Banner status="error" title={mutation.error?.message} /> : null}

      {preview?.exceeds ? (
        // Over-allocation is a soft warning (you can still confirm), so it's amber, not red — and
        // laid out as a centered flex row so the icon lines up with the middle of the text.
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md bg-warning-muted p-sm text-body-sm text-warning"
        >
          <AlertCircle className="size-4 shrink-0" />
          <div>
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
          </div>
        </div>
      ) : null}

      <AllocationTimeline rows={timelineRows} todayIso={todayIso()} />
    </div>
  );
}
