import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Building2, Check, FolderKanban, Info, Plus, Trash2 } from 'lucide-react';
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
import {
  AlertDialog,
  Banner,
  Button,
  createStaticSource,
  DateInput,
  Dialog,
  DialogFooter,
  DialogHeader,
  DisabledActionTooltip,
  Input,
  Layout,
  LayoutContent,
  type SearchableItem,
  Selector,
  Typeahead,
  useToast,
} from './_ui-compat.tsx';
import { AllocationTimeline, type TimelineRow } from './allocation-timeline.tsx';
import {
  ALLOCATION_FRACTION_STEPS,
  type Bucket,
  daysBetweenInclusive,
  emptyReassignRow,
  endDateIsInPast,
  existingAllocationErrors,
  existingEndDateMin,
  existingRowChanged,
  formatDisplayDate,
  fractionToPct,
  isValidIsoDate,
  pctToFraction,
  type ReassignTargetRow,
  targetAllocationErrors,
  todayIso,
} from './ra-shared.tsx';

type Step = 1 | 2;

// Shared grid tracks so each table's header and body rows always line up. The two date columns
// are 11.25rem (180px) because Astryx's DateInput has a hard 180px min-width — a narrower track
// lets the input overflow and shove the row's trailing action buttons off the edge (the original
// bug). Account / Project / Note flex; allocation, dates, type and actions are fixed. Applied via
// inline style because Tailwind's JIT can't see an interpolated arbitrary `grid-cols-[…]` value.
const EXISTING_GRID =
  'minmax(7.5rem,1.1fr) minmax(9rem,1.4fr) 4.25rem 11.25rem 11.25rem 6.75rem minmax(7.5rem,1.1fr) 4.75rem';
const TARGET_GRID =
  'minmax(7.5rem,1.1fr) minmax(9rem,1.4fr) 4.25rem 11.25rem 11.25rem 6.75rem 3rem';

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
  /**
   * When the wizard is opened from a project-filtered RA Monitoring view, the id of
   * that project — pre-seeded as an "Add project" target row so the PM doesn't have to
   * re-pick the project they're already scoped to. Absent for the row-level edit flow.
   */
  seed_project_id?: string | null;
  /**
   * When the list is scoped to an account but no single project (an account has many),
   * the id of that account — pre-seeded on the target row so the PM only picks the
   * project. Ignored when `seed_project_id` is set (the project already implies its account).
   */
  seed_account_id?: string | null;
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
  // Pending per-row save awaiting confirmation because its end date is in the past — saving it
  // would drop the allocation out of RA Monitoring's active window, so we warn before applying.
  const [pastEndConfirm, setPastEndConfirm] = useState<{
    allocationId: string;
    draft: RowDraft;
    expectedVersion: number;
  } | null>(null);
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
      // Pre-seed the first target row from the list's scope so the PM doesn't re-pick what
      // they're already filtered to: a project filter seeds both account and project; an
      // account-only filter seeds just the account (project left blank to choose among that
      // account's projects). Neither → start with no target rows.
      const seedProject = target.seed_project_id
        ? projects.find((p) => p.project_id === target.seed_project_id)
        : undefined;
      const seedRow = seedProject
        ? { account_id: seedProject.account_id, project_id: seedProject.project_id }
        : target.seed_account_id
          ? { account_id: target.seed_account_id, project_id: '' }
          : null;
      setTargetRows(seedRow ? [{ ...emptyReassignRow(todayIso()), ...seedRow }] : []);
      setPreview(null);
      setConfirmTarget(null);
      setPastEndConfirm(null);
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
      // A past end date is confirmed up front through the AlertDialog below (it spells out that
      // the row will leave RA Monitoring's active window), so a successful save just needs the
      // standard confirmation. Close the past-end dialog in case this save came from it.
      toast({ body: 'Allocation updated' });
      setPastEndConfirm(null);
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
    onError: () => setPreview(null),
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

  // Existing-row edits (e.g. shortening an allocation's end date so it stops overlapping a new
  // one) live only as local drafts until saved. The over-allocation preview reads the worker's
  // book from the DB, so an unsaved edit is invisible to it — the FUT-748 defect: Review impact
  // still counts the allocation at its old length and warns about a phantom over-allocation
  // (and confirming would leave the real overlap in place). Persist any pending, valid edits
  // first so the preview — and the final saved state — reflect exactly what's on screen.
  async function goToReview() {
    const dirtyRows = futureAllocations.filter((a) => {
      if (!rowDrafts[a.allocation_id]) return false;
      const d = draftFor(a);
      // Same gate as the row's own Save button: needs an account + project and no row error.
      if (!d.account_id || !d.project_id || existingErrors[a.allocation_id] != null) return false;
      const eff = effectiveRow(a);
      return existingRowChanged(
        {
          account_id: d.account_id,
          project_id: d.project_id,
          planned_pct: fractionToPct(d.planned_pct),
          date_from: d.date_from,
          date_to: d.date_to,
          bucket: d.bucket,
          note: d.note,
        },
        {
          account_id: eff.account_id,
          project_id: eff.project_id,
          planned_pct: eff.planned_pct,
          date_from: eff.date_from ?? '',
          date_to: eff.date_to ?? '',
          bucket: eff.bucket,
          note: eff.note ?? '',
        },
      );
    });

    if (dirtyRows.length > 0) {
      try {
        await Promise.all(
          dirtyRows.map((a) => {
            const d = draftFor(a);
            return updateAllocation(a.allocation_id, {
              project_id: d.project_id,
              planned_pct: fractionToPct(d.planned_pct),
              date_from: d.date_from,
              date_to: d.date_to || null,
              bucket: d.bucket,
              note: d.note || null,
              expected_version: a.version,
            });
          }),
        );
      } catch (e) {
        // Leave the wizard on step 1 rather than preview a half-applied edit.
        toast({ body: (e as Error).message, type: 'error' });
        return;
      }
      // Mirror the saved values locally (as the per-row Save does) so the UI stays in sync,
      // and refetch the parent so any further edit gets a fresh version.
      setSavedOverrides((m) => {
        const next = { ...m };
        for (const a of dirtyRows) {
          const d = draftFor(a);
          next[a.allocation_id] = {
            account_id: d.account_id,
            project_id: d.project_id,
            planned_pct: fractionToPct(d.planned_pct),
            date_from: d.date_from,
            date_to: d.date_to,
            bucket: d.bucket,
            note: d.note || null,
          };
        }
        return next;
      });
      onReassigned();
    }

    setPreview(null);
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
        width={1200}
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
                  targetRows={targetRows}
                  rowDrafts={rowDrafts}
                  projects={projects}
                  previewMutation={previewMutation}
                  mutation={mutation}
                />
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <div className="min-w-[1068px] overflow-hidden rounded-md border border-border">
                      <div
                        className="grid gap-2 bg-card px-2 py-2 text-sm text-secondary"
                        style={{ gridTemplateColumns: EXISTING_GRID }}
                      >
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
                        // A row that already started (start date in the past) is locked to
                        // end-date edits only — shorten/extend it (FUT-876 makes its delete
                        // impossible: it carries an effective, historical portion).
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
                            className="grid items-center gap-2 border-t border-border px-2 py-2 text-base"
                            style={{ gridTemplateColumns: EXISTING_GRID }}
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
                                value={
                                  accountOptions.find((o) => o.id === draft.account_id) ?? null
                                }
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
                                value={
                                  rowProjectItems.find((o) => o.id === draft.project_id) ?? null
                                }
                                isDisabled={startLocked}
                                onChange={(item) =>
                                  updateRowDraft(a, { project_id: item?.id ?? '' })
                                }
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
                              // Grey out past days in the picker: an editable start can only move to
                              // today or later. Locked rows keep their committed past start (the
                              // field is disabled, so min is moot there).
                              min={todayIso()}
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
                              // Never let the end move into the past (FUT-747): a locked row's
                              // start is already behind us, so floor at today — not the start —
                              // to keep the record inside RA Monitoring's active window.
                              min={existingEndDateMin(draft.date_from, todayIso())}
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
                                onClick={() => {
                                  const vars = {
                                    allocationId: a.allocation_id,
                                    draft,
                                    expectedVersion: a.version,
                                  };
                                  // A past end date silently drops the row out of the active
                                  // window — confirm the consequence before applying, rather
                                  // than saving first and explaining afterwards.
                                  if (endDateIsInPast(draft.date_to, todayIso())) {
                                    setPastEndConfirm(vars);
                                  } else {
                                    saveRowMutation.mutate(vars);
                                  }
                                }}
                              />
                              {/* FUT-876: an allocation that has already started carries an
                                  effective (historical) portion — deleting it would erase realized
                                  allocation data. The button is disabled and the DisabledActionTooltip
                                  wrapper (span captures hover/focus even when the button is disabled)
                                  explains why; shortening the end date above is the supported path. */}
                              <DisabledActionTooltip
                                disabled={startLocked}
                                reason={`"${a.project_name}" has already started and can't be removed — end it early by shortening the end date instead.`}
                              >
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  isIconOnly
                                  icon={<Trash2 className="size-3.5 text-secondary" />}
                                  label={`Delete ${a.project_name}`}
                                  isDisabled={startLocked}
                                  onClick={() => setConfirmTarget(a)}
                                />
                              </DisabledActionTooltip>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {futureAllocations.some((a) => existingErrors[a.allocation_id]) ? (
                    <div className="space-y-0.5">
                      {futureAllocations.map((a) =>
                        existingErrors[a.allocation_id] ? (
                          <p
                            key={a.allocation_id}
                            role="alert"
                            className="text-sm font-medium text-error"
                          >
                            {/* FUT-847: the label must track the draft's project, not the
                                original DB value — validation already runs against the draft. */}
                            {projects.find((p) => p.project_id === draftFor(a).project_id)?.name ??
                              a.project_name}
                            : {existingErrors[a.allocation_id]}
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
                    <div className="overflow-x-auto">
                      <div className="min-w-[912px] overflow-hidden rounded-md border border-border">
                        <div
                          className="grid gap-2 bg-card px-2 py-2 text-sm text-secondary"
                          style={{ gridTemplateColumns: TARGET_GRID }}
                        >
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
                    </div>
                  ) : null}

                  <div
                    role="alert"
                    className="flex items-center gap-3 rounded-md bg-accent-muted p-2 text-base text-accent"
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
            <DialogFooter>
              {step === 1 ? (
                <>
                  <Button variant="ghost" label="Cancel" onClick={onClose} />
                  <Button
                    variant="primary"
                    isDisabled={!canReview}
                    label="Review impact"
                    endContent={<ArrowRight className="size-4" />}
                    onClick={() => void goToReview()}
                  />
                </>
              ) : (
                <>
                  <Button variant="ghost" label="Back" onClick={() => setStep(1)} />
                  <Button
                    variant="primary"
                    isDisabled={mutation.isPending || previewMutation.isError}
                    label={mutation.isPending ? 'Confirming…' : 'Confirm'}
                    onClick={() => mutation.mutate()}
                  />
                </>
              )}
            </DialogFooter>
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

      <AlertDialog
        isOpen={pastEndConfirm !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPastEndConfirm(null);
        }}
        title="End this allocation in the past?"
        description="The end date is before today, so once saved this allocation moves out of RA Monitoring's active window and no longer appears in this list. Widen the active-period filter to see ended allocations. Continue?"
        actionLabel="Save anyway"
        actionVariant="primary"
        isActionLoading={saveRowMutation.isPending}
        onAction={() => {
          if (pastEndConfirm) saveRowMutation.mutate(pastEndConfirm);
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
      <div
        className="grid items-center gap-2 px-2 py-2"
        style={{ gridTemplateColumns: TARGET_GRID }}
      >
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
          // A new allocation can't start in the past (mirrors ra-shared's pastStart guard),
          // so disable every day before today in the picker.
          min={todayIso()}
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
          // Not before the start date — and never in the past when no start is picked yet.
          min={row.date_from || todayIso()}
          value={row.date_to || undefined}
          onChange={(v) => onChange({ date_to: v ?? '' })}
        />
        <Selector
          label="Type"
          isLabelHidden
          size="sm"
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
        <p role="alert" className="px-2 pb-2 text-sm font-medium text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ReviewStep({
  preview,
  currentAllocations,
  targetRows,
  rowDrafts,
  projects,
  previewMutation,
  mutation,
}: {
  preview: ReassignGroupPreviewResult | null;
  currentAllocations: RaMonitoringAllocation[];
  targetRows: ReassignTargetRow[];
  rowDrafts: Record<string, RowDraft>;
  projects: ProjectListRow[];
  previewMutation: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
  };
  mutation: { isPending: boolean; isError: boolean; error: Error | null };
}) {
  if (previewMutation.isPending) {
    return <p className="py-8 text-center text-sm text-secondary">Checking impact…</p>;
  }

  const targetTimelineRows: TimelineRow[] = preview?.targets
    ? preview.targets.map((t, i) => ({
        key: `target-${i}`,
        label: t.project_name,
        date_from: t.date_from,
        date_to: t.date_to,
        planned_pct: t.planned_pct,
      }))
    : targetRows
        .filter((r) => r.project_id && isValidIsoDate(r.date_from))
        .map((r, i) => {
          const projName =
            projects.find((p) => p.project_id === r.project_id)?.name ?? 'New Allocation';
          return {
            key: `target-row-${i}`,
            label: projName,
            date_from: r.date_from,
            date_to: r.date_to || null,
            planned_pct: fractionToPct(r.planned_pct),
            hasError: previewMutation.isError,
          };
        });

  const timelineRows: TimelineRow[] = [
    ...currentAllocations.map((a) => {
      const draft = rowDrafts[a.allocation_id];
      const dateFrom = draft?.date_from || (a.date_from as string);
      const dateTo = draft?.date_to !== undefined ? draft.date_to || null : a.date_to;
      const plannedPct =
        draft?.planned_pct !== undefined ? fractionToPct(draft.planned_pct) : (a.planned_pct ?? 0);
      const hasError =
        previewMutation.isError &&
        (previewMutation.error?.message.includes(a.project_name) ?? false);
      return {
        key: a.allocation_id,
        label: a.project_name,
        date_from: dateFrom,
        date_to: dateTo,
        planned_pct: plannedPct,
        hasError,
      };
    }),
    ...targetTimelineRows,
    ...(preview?.restricted_segments?.map((r, i) => ({
      key: `restricted-${i}`,
      label: 'Restricted projects',
      date_from: r.date_from,
      date_to: r.date_to,
      planned_pct: r.planned_pct,
      isRestricted: true,
    })) ?? []),
  ];

  return (
    <div className="space-y-4">
      {previewMutation.isError || mutation.isError ? (
        <Banner status="error" title={previewMutation.error?.message || mutation.error?.message} />
      ) : null}

      {preview?.exceeds ? (
        // Over-allocation is a soft warning (you can still confirm), so it's a warning Banner —
        // the same Astryx component as the error banners above, not a hand-rolled row.
        <Banner
          status="warning"
          // Describe the *resulting* state, not what this change caused: the peak can
          // come from a pre-existing overlap this operation never touched (the backend
          // now measures the worker's whole book), so wording that blames "this change"
          // would be wrong.
          title={
            <>
              {preview.worker_name ?? 'This person'} will be allocated{' '}
              <strong>{preview.peak_pct}%</strong> at the busiest point.
            </>
          }
          description={
            <>
              {preview.over_allocation_periods && preview.over_allocation_periods.length > 0 ? (
                preview.over_allocation_periods.map((p, idx) => (
                  <span
                    key={`${p.date_from}-${p.date_to ?? 'ongoing'}`}
                    className={idx > 0 ? 'mt-1 block' : ''}
                  >
                    They are over 100% from <strong>{formatDisplayDate(p.date_from)}</strong> to{' '}
                    <strong>{p.date_to ? formatDisplayDate(p.date_to) : 'Ongoing'}</strong>
                    {p.date_to ? ` (${daysBetweenInclusive(p.date_from, p.date_to)} days)` : ''}.
                  </span>
                ))
              ) : preview.peak_from ? (
                <>
                  They are over 100% from <strong>{formatDisplayDate(preview.peak_from)}</strong> to{' '}
                  <strong>
                    {preview.peak_to ? formatDisplayDate(preview.peak_to) : 'Ongoing'}
                  </strong>
                  {preview.peak_to
                    ? ` (${daysBetweenInclusive(preview.peak_from, preview.peak_to)} days)`
                    : ''}
                  .
                </>
              ) : (
                'Over 100%.'
              )}
              {preview.has_restricted_allocations ? (
                <span className="mt-1 block font-medium">
                  Additional allocations from restricted projects are included in this calculation
                  but are hidden due to your permissions.
                </span>
              ) : null}{' '}
              You can still confirm below.
            </>
          }
        />
      ) : null}

      <AllocationTimeline rows={timelineRows} todayIso={todayIso()} />
    </div>
  );
}
