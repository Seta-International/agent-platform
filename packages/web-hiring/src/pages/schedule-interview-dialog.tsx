import {
  Button,
  DateInput,
  Dialog,
  DialogFooter,
  DialogHeader,
  Grid,
  Input,
  Layout,
  LayoutContent,
  MultiSelector,
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  Text,
  Textarea,
  TimeInput,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Video } from 'lucide-react';
import { useState } from 'react';
import { fetchCandidates, scheduleInterview } from '../api/hiring-client.ts';
import { fetchDirectoryUsers } from '../api/identity-directory.ts';
import { hiringKeys } from '../state/query-keys.ts';
import {
  DURATION_OPTIONS,
  type InterviewMode,
  type InterviewRound,
  ROUND_LABEL,
  ROUND_OPTIONS,
  toIsoDateTime,
} from './interview-utils.ts';
import { capitalizeErrorMessage } from './utils.ts';

const TODAY = new Date().toISOString().slice(0, 10);

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

  // Reuses the Candidates page's own cache key — instant options if that page was ever loaded
  // this session. Only active applications qualify for a new round (mirrors the backend guard).
  const { data: candidates } = useQuery({
    queryKey: hiringKeys.candidates(),
    queryFn: () => fetchCandidates(),
    enabled: isOpen,
  });
  const schedulable = (candidates ?? []).filter((c) => c.status === 'active');

  const { data: directory } = useQuery({
    queryKey: hiringKeys.directoryUsers(),
    queryFn: () => fetchDirectoryUsers(),
    enabled: isOpen,
  });

  const [applicationId, setApplicationId] = useState<string | undefined>(undefined);
  const [round, setRound] = useState<InterviewRound>('technical');
  const [date, setDate] = useState<string | undefined>(undefined);
  const [time, setTime] = useState<string | undefined>('10:00');
  const [duration, setDuration] = useState('60');
  const [mode, setMode] = useState<InterviewMode>('online');
  const [meetingLink, setMeetingLink] = useState('');
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Adjust-during-render (no effect): once the candidate list is available, default the
  // selection to the preset candidate's active application, or the first one — but only when
  // the current selection isn't already a valid choice, so it never fights a manual pick.
  const presetApplicationId = presetCandidateId
    ? schedulable.find((c) => c.candidate_id === presetCandidateId)?.application_id
    : undefined;
  if (
    isOpen &&
    schedulable.length > 0 &&
    !schedulable.some((c) => c.application_id === applicationId)
  ) {
    setApplicationId(presetApplicationId ?? schedulable[0]?.application_id);
  }

  const selectedApplication = schedulable.find((c) => c.application_id === applicationId);
  const dateMissing = !date;
  const panelMissing = panelIds.length === 0;
  const canSubmit = !!selectedApplication && !dateMissing && !!time && !panelMissing;

  function reset() {
    setApplicationId(undefined);
    setRound('technical');
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
      round,
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
      width={560}
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
                  label="Candidate"
                  options={schedulable.map((c) => ({
                    value: c.application_id,
                    label: `${c.name} — ${c.requisition_title}`,
                  }))}
                  value={applicationId}
                  onChange={setApplicationId}
                  isDisabled={schedulable.length === 0}
                  placeholder={schedulable.length === 0 ? 'No active candidates' : undefined}
                />
                <Selector
                  label="Round"
                  options={ROUND_OPTIONS.map((r) => ({ value: r, label: ROUND_LABEL[r] }))}
                  value={round}
                  onChange={(v) => setRound(v as InterviewRound)}
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
                <TimeInput label="Time" hourFormat="24h" value={time} onChange={setTime} />
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
              <MultiSelector
                label="Interview panel"
                hasSearch
                searchPlaceholder="Search people…"
                placeholder="Add panelists"
                options={(directory ?? []).map((p) => ({ value: p.user_id, label: p.name }))}
                value={panelIds}
                onChange={setPanelIds}
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
