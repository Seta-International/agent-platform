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
  VStack,
} from '@seta/shared-ui';
import { Building2, Video } from 'lucide-react';
import { useState } from 'react';
import {
  DURATION_OPTIONS,
  type Interview,
  type InterviewMode,
  type InterviewRound,
  ROUND_OPTIONS,
  toIsoDateTime,
} from './interview-utils.ts';
import { FAKE_CANDIDATE_POOL, FAKE_PANEL_POOL } from './interviews-fixtures.ts';

const TODAY = new Date().toISOString().slice(0, 10);
let scheduleSeq = FAKE_CANDIDATE_POOL.length + 100;

export function ScheduleInterviewDialog({
  isOpen,
  onOpenChange,
  presetCandidateId,
  onScheduled,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  presetCandidateId?: string | null;
  onScheduled: (interview: Interview) => void;
}) {
  const [candidateId, setCandidateId] = useState(presetCandidateId ?? FAKE_CANDIDATE_POOL[0]?.id);
  const [round, setRound] = useState<InterviewRound>('Technical');
  const [date, setDate] = useState<string | undefined>(undefined);
  const [time, setTime] = useState<string | undefined>('10:00');
  const [duration, setDuration] = useState('60');
  const [mode, setMode] = useState<InterviewMode>('online');
  const [meetingLink, setMeetingLink] = useState('');
  const [panelIds, setPanelIds] = useState<string[]>([FAKE_PANEL_POOL[0]?.user_id ?? '']);
  const [note, setNote] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const candidate = FAKE_CANDIDATE_POOL.find((c) => c.id === candidateId);
  const dateMissing = !date;
  const panelMissing = panelIds.length === 0;
  const canSubmit = !!candidate && !dateMissing && !!time && !panelMissing;

  function reset() {
    setCandidateId(FAKE_CANDIDATE_POOL[0]?.id);
    setRound('Technical');
    setDate(undefined);
    setTime('10:00');
    setDuration('60');
    setMode('online');
    setMeetingLink('');
    setPanelIds([FAKE_PANEL_POOL[0]?.user_id ?? '']);
    setNote('');
    setSubmitAttempted(false);
  }

  function handleSubmit() {
    setSubmitAttempted(true);
    if (!canSubmit || !candidate || !date || !time) return;
    const id = `int-${++scheduleSeq}`;
    onScheduled({
      id,
      candidate_id: candidate.id,
      candidate_name: candidate.name,
      requisition_title: candidate.requisition_title,
      round,
      scheduled_at: toIsoDateTime(date, time),
      duration_minutes: Number(duration),
      mode,
      meeting_link: meetingLink.trim() || (mode === 'online' ? `https://meet.seta.io/${id}` : null),
      panel: FAKE_PANEL_POOL.filter((p) => panelIds.includes(p.user_id)),
      note: note.trim(),
      status: 'scheduled',
    });
    reset();
    onOpenChange(false);
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
                  options={FAKE_CANDIDATE_POOL.map((c) => ({
                    value: c.id,
                    label: `${c.name} — ${c.requisition_title}`,
                  }))}
                  value={candidateId}
                  onChange={setCandidateId}
                />
                <Selector
                  label="Round"
                  options={ROUND_OPTIONS.map((r) => ({ value: r, label: r }))}
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
                  placeholder="Leave blank to auto-generate a Seta Meet link"
                />
              )}
              <MultiSelector
                label="Interview panel"
                hasSearch
                searchPlaceholder="Search people…"
                placeholder="Add panelists"
                options={FAKE_PANEL_POOL.map((p) => ({
                  value: p.user_id,
                  label: p.display_name,
                }))}
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
            <Button variant="primary" label="Schedule" onClick={handleSubmit} />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
