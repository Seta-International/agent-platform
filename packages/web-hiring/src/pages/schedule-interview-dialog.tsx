import {
  Button,
  createStaticSource,
  DateInput,
  Dialog,
  DialogFooter,
  DialogHeader,
  Grid,
  Input,
  Layout,
  LayoutContent,
  type SearchableItem,
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  SelectorOption,
  Text,
  Textarea,
  Token,
  Tokenizer,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Clock, Video } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { fetchCandidates, scheduleInterview } from '../api/hiring-client.ts';
import { fetchDirectoryUsers } from '../api/identity-directory.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { BOARD_COLUMNS } from './candidate-utils.ts';
import {
  DURATION_OPTIONS,
  type InterviewMode,
  TIME_OPTIONS,
  toIsoDateTime,
} from './interview-utils.ts';
import { capitalizeErrorMessage } from './utils.ts';

const TODAY = new Date().toISOString().slice(0, 10);

const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  BOARD_COLUMNS.map((c) => [c.id, c.label]),
);

type PanelistItem = SearchableItem<{ email: string }>;

export function ScheduleInterviewDialog({
  isOpen,
  onOpenChange,
  presetCandidateId,
  onScheduled,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  presetCandidateId?: string | null;
  onScheduled: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: candidates } = useQuery({
    queryKey: hiringKeys.candidates(),
    queryFn: () => fetchCandidates(),
    enabled: isOpen,
  });
  const schedulable = useMemo(
    () => (candidates ?? []).filter((c) => c.status === 'active'),
    [candidates],
  );

  const { data: directory } = useQuery({
    queryKey: hiringKeys.directoryUsers(),
    queryFn: () => fetchDirectoryUsers(),
    enabled: isOpen,
  });

  const [requisitionId, setRequisitionId] = useState<string | undefined>(undefined);
  const [applicationId, setApplicationId] = useState<string | undefined>(undefined);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [time, setTime] = useState<string | undefined>('10:00');
  const [duration, setDuration] = useState('60');
  const [mode, setMode] = useState<InterviewMode>('online');
  const [meetingLink, setMeetingLink] = useState('');
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const requisitions = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; count: number }>();
    for (const c of schedulable) {
      const seen = byId.get(c.requisition_id);
      if (seen) seen.count += 1;
      else
        byId.set(c.requisition_id, { id: c.requisition_id, title: c.requisition_title, count: 1 });
    }
    return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [schedulable]);

  const requisitionCandidates = useMemo(
    () => schedulable.filter((c) => c.requisition_id === requisitionId),
    [schedulable, requisitionId],
  );

  const chosenPanelIds = useMemo(() => new Set(panelIds), [panelIds]);

  // Dropdown source = directory users NOT already on the panel; searchable by name + email.
  const panelSource = useMemo(
    () =>
      createStaticSource<PanelistItem>(
        (directory ?? [])
          .filter((p) => !chosenPanelIds.has(p.user_id))
          .map((p) => ({ id: p.user_id, label: p.name, auxiliaryData: { email: p.email } })),
        { keywords: (i) => [i.auxiliaryData?.email ?? ''] },
      ),
    [directory, chosenPanelIds],
  );

  // Controlled token items derived from panelIds (single source of truth).
  const panelItems: PanelistItem[] = panelIds.flatMap((id) => {
    const p = (directory ?? []).find((d) => d.user_id === id);
    return p ? [{ id: p.user_id, label: p.name, auxiliaryData: { email: p.email } }] : [];
  });

  // FUT-759-style reopen (see SkillPicker): after picking a panelist, blur+focus
  // reopens the dropdown so adding several people in a row doesn't need a fresh
  // click each time. Only when focus is still inside the field — a click outside
  // already dismissed the popover, and reopening it there would fight the user.
  const panelFieldRef = useRef<HTMLDivElement>(null);
  const panelControlRef = useRef<{ focus(): void; blur(): void }>(null);

  const handlePanelChange = useCallback((items: PanelistItem[], change: { type: string }) => {
    setPanelIds(items.map((i) => i.id));
    if (change.type === 'add') {
      setTimeout(() => {
        if (panelFieldRef.current?.contains(document.activeElement)) {
          panelControlRef.current?.blur();
          panelControlRef.current?.focus();
        }
      }, 0);
    }
  }, []);

  const presetApplication = presetCandidateId
    ? schedulable.find((c) => c.candidate_id === presetCandidateId)
    : undefined;
  if (isOpen && presetApplication && requisitionId === undefined) {
    setRequisitionId(presetApplication.requisition_id);
  }
  if (
    isOpen &&
    requisitionId &&
    !requisitionCandidates.some((c) => c.application_id === applicationId)
  ) {
    const preset = requisitionCandidates.find((c) => c.candidate_id === presetCandidateId);
    const next =
      preset?.application_id ??
      (requisitionCandidates.length === 1 ? requisitionCandidates[0]?.application_id : undefined);
    if (next !== applicationId) setApplicationId(next);
  }

  const selectedApplication = requisitionCandidates.find((c) => c.application_id === applicationId);
  const noneSchedulable = requisitions.length === 0;
  const requisitionMissing = !requisitionId;
  const candidateMissing = !selectedApplication;
  const dateMissing = !date;
  const panelMissing = panelIds.length === 0;
  const canSubmit = !!selectedApplication && !dateMissing && !!time && !panelMissing;

  function reset() {
    setRequisitionId(undefined);
    setApplicationId(undefined);
    setDate(undefined);
    setTime('10:00');
    setDuration('60');
    setMode('online');
    setMeetingLink('');
    setPanelIds([]);
    setNote('');
    setSubmitAttempted(false);
  }

  const mutation = useMutation({
    mutationFn: scheduleInterview,
    onSuccess: () => {
      toast({ body: 'Interview scheduled' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.interviews() });
      reset();
      onOpenChange(false);
      onScheduled();
    },
    onError: (e: Error) => {
      toast({
        body: capitalizeErrorMessage(e.message),
        type: 'error',
        isAutoHide: true,
        autoHideDuration: 6000,
      });
    },
  });

  function handleSubmit() {
    setSubmitAttempted(true);
    if (!canSubmit || !selectedApplication || !date || !time) return;
    const panel = (directory ?? [])
      .filter((p) => panelIds.includes(p.user_id))
      .map((p) => ({ user_id: p.user_id, display_name: p.name }));
    mutation.mutate({
      application_id: selectedApplication.application_id,
      scheduled_at: toIsoDateTime(date, time),
      duration_minutes: Number(duration),
      mode,
      meeting_link: meetingLink.trim() || undefined,
      note: note.trim() || undefined,
      panel,
    });
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      purpose="form"
      width={680}
      aria-label="Schedule interview"
    >
      <Layout
        header={
          <DialogHeader
            title="Schedule interview"
            subtitle="Saved to the interview agenda — the panel sees it as soon as you schedule."
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <Grid columns={2} gap={4}>
                <Selector
                  label="Requisition"
                  hasSearch
                  searchPlaceholder="Search requisitions…"
                  options={requisitions.map((r) => ({ value: r.id, label: r.title }))}
                  value={requisitionId}
                  onChange={setRequisitionId}
                  isDisabled={noneSchedulable}
                  placeholder={
                    noneSchedulable ? 'No candidates to schedule' : 'Select a requisition'
                  }
                  renderOption={(option) => {
                    const count = requisitions.find((r) => r.id === option.value)?.count ?? 0;
                    return (
                      <SelectorOption
                        label={option.label}
                        endContent={
                          <Text size="sm" color="secondary">
                            {count} candidate{count === 1 ? '' : 's'}
                          </Text>
                        }
                      />
                    );
                  }}
                  status={
                    submitAttempted && requisitionMissing
                      ? { type: 'error', message: 'Pick a requisition.' }
                      : undefined
                  }
                />
                <Selector
                  label="Candidate"
                  hasSearch
                  searchPlaceholder="Search candidates…"
                  options={requisitionCandidates.map((c) => ({
                    value: c.application_id,
                    label: c.name,
                  }))}
                  value={applicationId}
                  onChange={setApplicationId}
                  isDisabled={requisitionMissing}
                  placeholder={
                    requisitionMissing ? 'Pick a requisition first' : 'Select a candidate'
                  }
                  renderOption={(option) => {
                    const candidate = requisitionCandidates.find(
                      (c) => c.application_id === option.value,
                    );
                    return (
                      <SelectorOption
                        label={option.label}
                        endContent={
                          <Text size="sm" color="secondary">
                            {candidate ? (STAGE_LABEL[candidate.stage] ?? candidate.stage) : ''}
                          </Text>
                        }
                      />
                    );
                  }}
                  status={
                    submitAttempted && !requisitionMissing && candidateMissing
                      ? { type: 'error', message: 'Pick a candidate.' }
                      : undefined
                  }
                />
              </Grid>
              <Grid columns={3} gap={4}>
                <DateInput
                  label="Date"
                  value={date}
                  onChange={setDate}
                  min={TODAY}
                  status={
                    submitAttempted && dateMissing
                      ? { type: 'error', message: 'Pick a date.' }
                      : undefined
                  }
                />
                <Selector
                  label="Time"
                  startIcon={<Clock aria-hidden="true" />}
                  hasSearch
                  searchPlaceholder="Search a time…"
                  options={TIME_OPTIONS.map((t) => ({ value: t, label: t }))}
                  value={time}
                  onChange={setTime}
                />
                <Selector
                  label="Duration"
                  options={DURATION_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` }))}
                  value={duration}
                  onChange={setDuration}
                />
              </Grid>
              <VStack gap={2}>
                <Text size="sm" weight="medium">
                  Mode
                </Text>
                <SegmentedControl
                  label="Interview mode"
                  value={mode}
                  onChange={(v) => setMode(v as InterviewMode)}
                  className="self-start"
                >
                  <SegmentedControlItem
                    value="online"
                    label="Online"
                    icon={<Video aria-hidden="true" />}
                  />
                  <SegmentedControlItem
                    value="onsite"
                    label="Onsite"
                    icon={<Building2 aria-hidden="true" />}
                  />
                </SegmentedControl>
              </VStack>
              {mode === 'online' && (
                <Input
                  label="Meeting link"
                  isOptional
                  value={meetingLink}
                  onChange={setMeetingLink}
                  placeholder="Paste a Zoom / Meet / Teams link"
                />
              )}
              <Tokenizer<PanelistItem>
                label="Interview panel"
                placeholder="Search people…"
                searchSource={panelSource}
                debounceMs={0}
                hasEntriesOnFocus
                value={panelItems}
                onChange={handlePanelChange}
                ref={panelFieldRef}
                handleRef={panelControlRef}
                renderToken={(item, onRemove) => (
                  <Token key={item.id} label={item.label} onRemove={onRemove} />
                )}
                status={
                  submitAttempted && panelMissing
                    ? { type: 'error', message: 'Add at least one panelist.' }
                    : undefined
                }
              />
              <Textarea
                label="Note"
                isOptional
                rows={2}
                value={note}
                onChange={setNote}
                placeholder="Focus area, scenario, links…"
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Button
              variant="secondary"
              label="Cancel"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            />
            <Button
              variant="primary"
              label="Schedule"
              onClick={handleSubmit}
              isLoading={mutation.isPending}
            />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
