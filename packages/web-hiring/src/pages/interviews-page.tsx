import {
  AvatarStack,
  Badge,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  EmptyState,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  List,
  ListItem,
  PageContainer,
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  Skeleton,
  StatusToneDot,
  Text,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Percent,
  Plus,
  Search,
  Video,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  cancelInterview,
  completeInterview,
  fetchInterviews,
  markInterviewNoShow,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { InterviewDetailDialog } from './interview-detail-dialog.tsx';
import {
  type DayGroup,
  dayBucketOf,
  formatTime,
  groupByDay,
  type Interview,
  RESULT_BADGE_VARIANT,
  RESULT_LABEL,
  ROUND_LABEL,
  ROUND_OPTIONS,
} from './interview-utils.ts';
import { ScheduleInterviewDialog } from './schedule-interview-dialog.tsx';
import { on409 } from './utils.ts';

const NONE = '__none__';
type StatusFilter = 'all' | 'upcoming' | 'completed';

function stat(label: string, value: ReactNode, icon: ReactNode) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-secondary">
        {icon}
      </div>
      <div>
        <div className="text-5xl font-semibold tabular-nums text-primary">{value}</div>
        <div className="mt-1 text-sm text-secondary">{label}</div>
      </div>
    </div>
  );
}

function TimeChip({ iso, showDate }: { iso: string; showDate: boolean }) {
  return (
    <div className="flex w-16 flex-col items-start">
      <Text weight="semibold" size="sm">
        {formatTime(iso)}
      </Text>
      {showDate && (
        <Text size="xsm" color="secondary">
          {new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </Text>
      )}
    </div>
  );
}

function ModeTag({ mode }: { mode: Interview['mode'] }) {
  const Icon = mode === 'online' ? Video : Building2;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3.5" aria-hidden />
      {mode === 'online' ? 'Online' : 'Onsite'}
    </span>
  );
}

function AgendaRow({
  interview,
  showDate,
  isOverdue,
  onOpen,
}: {
  interview: Interview;
  showDate: boolean;
  isOverdue: boolean;
  onOpen: () => void;
}) {
  return (
    <ListItem
      onClick={onOpen}
      startContent={<TimeChip iso={interview.scheduled_at} showDate={showDate} />}
      label={
        <HStack gap={2} vAlign="center">
          <Text weight="medium">{interview.candidate_name}</Text>
          <Badge variant="neutral" label={ROUND_LABEL[interview.round]} />
        </HStack>
      }
      description={
        <HStack gap={2} vAlign="center">
          <Text size="sm" color="secondary">
            {interview.requisition_title}
          </Text>
          <Text size="sm" color="secondary">
            · <ModeTag mode={interview.mode} />
          </Text>
        </HStack>
      }
      endContent={
        <HStack gap={3} vAlign="center">
          <AvatarStack assignees={interview.panel} />
          {isOverdue ? (
            <StatusToneDot tone="warning" label="Needs an outcome" />
          ) : (
            <StatusToneDot tone="primary" label="Scheduled" />
          )}
        </HStack>
      }
    />
  );
}

function PastRow({ interview, onOpen }: { interview: Interview; onOpen: () => void }) {
  return (
    <ListItem
      onClick={onOpen}
      startContent={<TimeChip iso={interview.scheduled_at} showDate />}
      label={
        <HStack gap={2} vAlign="center">
          <Text weight="medium">{interview.candidate_name}</Text>
          <Badge variant="neutral" label={ROUND_LABEL[interview.round]} />
        </HStack>
      }
      description={
        <Text size="sm" color="secondary">
          {interview.requisition_title}
        </Text>
      }
      endContent={
        interview.status === 'completed' && interview.result ? (
          <Badge
            variant={RESULT_BADGE_VARIANT[interview.result]}
            label={RESULT_LABEL[interview.result]}
          />
        ) : interview.status === 'cancelled' ? (
          <StatusToneDot tone="muted" label="Cancelled" />
        ) : (
          <StatusToneDot tone="danger" label="No-show" />
        )
      }
    />
  );
}

function AgendaSection({ groups, onOpen }: { groups: DayGroup[]; onOpen: (id: string) => void }) {
  return (
    <>
      {groups.map((group) => (
        <List
          key={group.key}
          hasDividers
          header={
            <HStack hAlign="between" vAlign="center">
              <Text weight="semibold">{group.label}</Text>
              <Text size="sm" color="secondary">
                {group.items.length} interview{group.items.length === 1 ? '' : 's'}
              </Text>
            </HStack>
          }
        >
          {group.items.map((i) => (
            <AgendaRow
              key={i.id}
              interview={i}
              showDate={group.showsDate}
              isOverdue={group.key === 'overdue'}
              onOpen={() => onOpen(i.id)}
            />
          ))}
        </List>
      ))}
    </>
  );
}

export function InterviewsPage() {
  const canManage = usePermission('hiring.candidate.manage');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: hiringKeys.interviews(),
    queryFn: () => fetchInterviews(),
  });
  const interviews = data ?? [];
  const [q, setQ] = useState('');
  const [roundFilter, setRoundFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('upcoming');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [presetCandidateId, setPresetCandidateId] = useState<string | null>(null);

  // A fixed reference instant for the whole render — every day-bucket in this pass agrees on
  // what "today" means, even if the clock ticks over mid-render.
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return interviews.filter((i) => {
      if (roundFilter && i.round !== roundFilter) return false;
      if (needle && !`${i.candidate_name} ${i.requisition_title}`.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [interviews, q, roundFilter]);

  const scheduled = useMemo(() => filtered.filter((i) => i.status === 'scheduled'), [filtered]);
  const completed = useMemo(() => filtered.filter((i) => i.status === 'completed'), [filtered]);
  const past = useMemo(
    () =>
      filtered
        .filter((i) => i.status !== 'scheduled')
        .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)),
    [filtered],
  );

  const upcomingGroups = useMemo(() => groupByDay(scheduled, now), [scheduled, now]);
  const completedSorted = useMemo(
    () => [...completed].sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)),
    [completed],
  );

  // Tiles summarize the whole schedule regardless of which tab is open below — unlike the
  // Requisitions stat row, these four numbers are distinct facets of one dataset, not a
  // breakdown that should re-total per tab. They still respect search/round.
  const thisWeekCount = useMemo(
    () =>
      filtered.filter(
        (i) => i.status === 'scheduled' && dayBucketOf(i.scheduled_at, now) !== 'later',
      ).length,
    [filtered, now],
  );
  const passRate = completed.length
    ? Math.round((completed.filter((i) => i.result === 'pass').length / completed.length) * 100)
    : 0;

  const selected = interviews.find((i) => i.id === selectedId) ?? null;

  const completeMutation = useMutation({
    mutationFn: (m: { id: string; version: number; patch: Partial<Interview> }) =>
      completeInterview(m.id, {
        expected_version: m.version,
        input: {
          result: m.patch.result as NonNullable<Interview['result']>,
          rating: m.patch.rating ?? undefined,
          recommendation: m.patch.recommendation ?? undefined,
          feedback_note: m.patch.feedback_note ?? undefined,
        },
      }),
    onMutate: async (m) => {
      await queryClient.cancelQueries({ queryKey: hiringKeys.interviews() });
      const previous = queryClient.getQueryData<Interview[]>(hiringKeys.interviews());
      queryClient.setQueryData<Interview[]>(hiringKeys.interviews(), (old) =>
        old?.map((i) => (i.id === m.id ? { ...i, ...m.patch, version: i.version + 1 } : i)),
      );
      return { previous };
    },
    onError: (e: Error, _m, context) => {
      if (context?.previous) queryClient.setQueryData(hiringKeys.interviews(), context.previous);
      on409(toast, e, queryClient, hiringKeys.interviews());
    },
    onSuccess: () => toast({ body: 'Outcome saved' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: hiringKeys.interviews() }),
  });

  const cancelMutation = useMutation({
    mutationFn: (m: { id: string; version: number; outcome_reason?: string }) =>
      cancelInterview(m.id, {
        expected_version: m.version,
        input: { outcome_reason: m.outcome_reason },
      }),
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.interviews()),
    onSuccess: () => toast({ body: 'Interview cancelled' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: hiringKeys.interviews() }),
  });

  const noShowMutation = useMutation({
    mutationFn: (m: { id: string; version: number; outcome_reason?: string }) =>
      markInterviewNoShow(m.id, {
        expected_version: m.version,
        input: { outcome_reason: m.outcome_reason },
      }),
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.interviews()),
    onSuccess: () => toast({ body: 'Marked as no-show' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: hiringKeys.interviews() }),
  });

  function updateInterview(id: string, patch: Partial<Interview>) {
    const target = interviews.find((i) => i.id === id);
    if (!target) return;
    if (patch.status === 'completed') {
      completeMutation.mutate({ id, version: target.version, patch });
    } else if (patch.status === 'cancelled') {
      cancelMutation.mutate({
        id,
        version: target.version,
        outcome_reason: patch.outcome_reason ?? undefined,
      });
    } else if (patch.status === 'no_show') {
      noShowMutation.mutate({
        id,
        version: target.version,
        outcome_reason: patch.outcome_reason ?? undefined,
      });
    }
  }

  function openScheduleFor(candidateId: string | null) {
    setPresetCandidateId(candidateId);
    setScheduleOpen(true);
  }

  const emptyDataset = interviews.length === 0;
  const emptyFiltered = filtered.length === 0 && !emptyDataset;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/hiring">Hiring Management</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Interviews</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Interviews
                </Text>
                <Text color="secondary">
                  Schedule rounds, share the meeting link, and record the panel's outcome.
                </Text>
              </HStack>
              {canManage && (
                <Button
                  variant="primary"
                  size="sm"
                  label="Schedule interview"
                  icon={<Plus className="size-4" />}
                  onClick={() => openScheduleFor(null)}
                />
              )}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stat(
                'Scheduled',
                scheduled.length,
                <CalendarClock className="size-5" aria-hidden />,
              )}
              {stat('This week', thisWeekCount, <CalendarDays className="size-5" aria-hidden />)}
              {stat(
                'Completed',
                completed.length,
                <CalendarCheck className="size-5" aria-hidden />,
              )}
              {stat('Pass rate', `${passRate}%`, <Percent className="size-5" aria-hidden />)}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Input
                label="Search interviews"
                isLabelHidden
                startIcon={<Search className="size-3.5" aria-hidden />}
                placeholder="Search interviews"
                value={q}
                onChange={setQ}
                className="max-w-xs flex-1"
              />
              <Selector
                label="Filter by round"
                isLabelHidden
                options={[
                  { value: NONE, label: 'All rounds' },
                  ...ROUND_OPTIONS.map((r) => ({ value: r, label: ROUND_LABEL[r] })),
                ]}
                value={roundFilter || NONE}
                onChange={(v) => setRoundFilter(v === NONE ? '' : v)}
                placeholder="Round"
              />
              <div className="ml-auto">
                <SegmentedControl
                  label="Interview status"
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as StatusFilter)}
                >
                  <SegmentedControlItem value="upcoming" label="Upcoming" />
                  <SegmentedControlItem value="all" label="All" />
                  <SegmentedControlItem value="completed" label="Completed" />
                </SegmentedControl>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {['s0', 's1', 's2', 's3'].map((id) => (
                  <Skeleton key={id} height={56} />
                ))}
              </div>
            ) : emptyDataset ? (
              <EmptyState
                icon={<CalendarClock className="size-6" />}
                title="No interviews scheduled"
                description="Schedule a round from the button above to get the panel moving."
              />
            ) : emptyFiltered ? (
              <EmptyState
                icon={<Search className="size-6" />}
                title="No interviews match"
                description="Try a different candidate, position, or round."
              />
            ) : (
              <VStack gap={6}>
                {statusFilter !== 'completed' &&
                  (upcomingGroups.length ? (
                    <AgendaSection groups={upcomingGroups} onOpen={setSelectedId} />
                  ) : (
                    statusFilter === 'upcoming' && (
                      <EmptyState
                        icon={<CalendarCheck className="size-6" />}
                        title="Nothing on the schedule"
                        description="Every round is recorded. Schedule the next one when you're ready."
                      />
                    )
                  ))}

                {statusFilter === 'completed' &&
                  (completedSorted.length ? (
                    <List
                      hasDividers
                      header={
                        <HStack hAlign="between" vAlign="center">
                          <Text weight="semibold">Completed</Text>
                          <Text size="sm" color="secondary">
                            {completedSorted.length} interview
                            {completedSorted.length === 1 ? '' : 's'}
                          </Text>
                        </HStack>
                      }
                    >
                      {completedSorted.map((i) => (
                        <PastRow key={i.id} interview={i} onOpen={() => setSelectedId(i.id)} />
                      ))}
                    </List>
                  ) : (
                    <EmptyState
                      icon={<CalendarCheck className="size-6" />}
                      title="No completed rounds yet"
                      description="Outcomes will show up here once a round is marked done."
                    />
                  ))}

                {statusFilter === 'all' && past.length > 0 && (
                  <List
                    hasDividers
                    header={
                      <HStack hAlign="between" vAlign="center">
                        <Text weight="semibold">Past</Text>
                        <Text size="sm" color="secondary">
                          {past.length} interview{past.length === 1 ? '' : 's'}
                        </Text>
                      </HStack>
                    }
                  >
                    {past.map((i) => (
                      <PastRow key={i.id} interview={i} onOpen={() => setSelectedId(i.id)} />
                    ))}
                  </List>
                )}
              </VStack>
            )}
          </PageContainer>

          <InterviewDetailDialog
            interview={selected}
            onClose={() => setSelectedId(null)}
            onUpdate={updateInterview}
            onReschedule={(candidateId) => openScheduleFor(candidateId)}
          />
          <ScheduleInterviewDialog
            isOpen={scheduleOpen}
            onOpenChange={setScheduleOpen}
            presetCandidateId={presetCandidateId}
            onScheduled={() => setStatusFilter('upcoming')}
          />
        </LayoutContent>
      }
    />
  );
}
