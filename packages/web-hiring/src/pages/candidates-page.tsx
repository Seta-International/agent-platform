import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  Input,
  KanbanBoard,
  KanbanColumn,
  PageChrome,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  CalendarClock,
  Download,
  Handshake,
  ListChecks,
  Search,
  Users,
} from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  type CandidateListItem,
  type CandidateStageCounts,
  fetchCandidateStageCounts,
  fetchCandidates,
  moveApplicationStage,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CandidateCard } from './candidate-card.tsx';
import { CandidateDetailDrawer } from './candidate-detail-drawer.tsx';
import {
  BOARD_COLUMNS,
  boardColumns,
  COLUMN_EMPTY_COPY,
  fitLabel,
  resolveStageDrop,
  STAGE_COLOR,
} from './candidate-utils.ts';
import { NewCandidateDialog } from './new-candidate-dialog.tsx';
import { TalentPoolCard } from './talent-pool-card.tsx';
import { on409 } from './utils.ts';

const NONE = '__none__';

const COLUMN_EMPTY_ICON: Record<string, ReactNode> = {
  new: <Users className="size-5" />,
  screening: <ListChecks className="size-5" />,
  interview: <CalendarClock className="size-5" />,
  offer: <Handshake className="size-5" />,
  hired: <BadgeCheck className="size-5" />,
};

const STAGE_COUNT_SEGMENTS: { key: keyof CandidateStageCounts; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'screening', label: 'Screening' },
  { key: 'interview', label: 'Interviewing' },
  { key: 'offer', label: 'Offering' },
  { key: 'hired', label: 'Hired' },
  { key: 'cancelled', label: 'Cancelled' },
];

function toCsvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCandidatesCsv(rows: CandidateListItem[]) {
  const header = [
    'Name',
    'Position',
    'Seniority',
    'Source',
    'Stage',
    'Rating',
    'Fit',
    'Skills',
    'Applied at',
  ];
  const lines = rows.map((r) => [
    r.name,
    r.requisition_title,
    r.seniority ?? '',
    r.source ?? '',
    r.stage,
    r.rating ?? '',
    r.fit.required === 0 ? '' : `${Math.round(r.fit.score * 100)}%`,
    r.skills.map((s) => s.skill_name).join('; '),
    new Date(r.applied_at).toISOString().slice(0, 10),
  ]);
  const csv = [header, ...lines].map((line) => line.map(toCsvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'candidates.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function onBoardDragEnd(
  items: CandidateListItem[],
  mutate: (move: {
    application_id: string;
    to: import('../api/hiring-client.ts').CandStage;
    expected_version: number;
  }) => void,
) {
  return (result: DropResult) => {
    const move = resolveStageDrop({
      draggableId: result.draggableId,
      source: result.source.droppableId,
      destination: result.destination?.droppableId ?? null,
      items,
    });
    if (move) mutate(move);
  };
}

export function CandidatesPage() {
  const canCreate = usePermission('hiring.candidate.create');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [q, setQ] = useState('');
  const [reqFilter, setReqFilter] = useState('');
  const [seniorityFilter, setSeniorityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: hiringKeys.candidates(),
    queryFn: fetchCandidates,
  });
  const { data: stageCounts } = useQuery({
    queryKey: hiringKeys.candidateStageCounts(),
    queryFn: fetchCandidateStageCounts,
  });

  const rows = useMemo(() => {
    let r = data ?? [];
    if (reqFilter) r = r.filter((c) => c.requisition_id === reqFilter);
    if (seniorityFilter) r = r.filter((c) => c.seniority === seniorityFilter);
    if (sourceFilter) r = r.filter((c) => c.source === sourceFilter);
    if (q.trim()) {
      const needle = q.toLowerCase();
      r = r.filter((c) =>
        `${c.name} ${c.requisition_title} ${c.seniority ?? ''}`.toLowerCase().includes(needle),
      );
    }
    return r;
  }, [data, q, reqFilter, seniorityFilter, sourceFilter]);

  const reqOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of data ?? []) seen.set(c.requisition_id, c.requisition_title);
    return [...seen.entries()];
  }, [data]);

  const seniorityOptions = useMemo(
    () => [...new Set((data ?? []).map((c) => c.seniority).filter((v): v is string => !!v))].sort(),
    [data],
  );
  const sourceOptions = useMemo(
    () => [...new Set((data ?? []).map((c) => c.source).filter((v): v is string => !!v))].sort(),
    [data],
  );

  const queryClient = useQueryClient();
  const canManage = usePermission('hiring.candidate.manage');
  const stageMove = useMutation({
    mutationFn: (m: {
      application_id: string;
      to: 'new' | 'screening' | 'interview' | 'offer';
      expected_version: number;
    }) =>
      moveApplicationStage(m.application_id, { expected_version: m.expected_version, to: m.to }),
    onSuccess: () => {
      toast.success('Stage updated');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidateStageCounts() });
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.candidates()),
  });
  const handleDragEnd = onBoardDragEnd(rows, (m) => stageMove.mutate(m));

  const groups = boardColumns(rows);

  const columns = useMemo(() => {
    type Ctx = { row: { original: CandidateListItem } };
    return [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Candidate',
        cell: ({ row }: Ctx) => <span className="font-medium text-ink">{row.original.name}</span>,
      },
      {
        id: 'requisition_title',
        accessorKey: 'requisition_title',
        header: 'Position',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{row.original.requisition_title}</span>
        ),
      },
      {
        id: 'seniority',
        accessorKey: 'seniority',
        header: 'Seniority',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{row.original.seniority ?? '—'}</span>
        ),
      },
      {
        id: 'source',
        accessorKey: 'source',
        header: 'Source',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{row.original.source ?? '—'}</span>
        ),
      },
      {
        id: 'stage',
        accessorKey: 'stage',
        header: 'Stage',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted capitalize">{row.original.stage}</span>
        ),
      },
      {
        id: 'rating',
        accessorKey: 'rating',
        header: 'Rating',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{row.original.rating ?? 0}/5</span>
        ),
      },
      {
        id: 'fit',
        accessorKey: 'fit',
        header: 'Fit',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{fitLabel(row.original.fit).text}</span>
        ),
      },
    ];
  }, []);

  return (
    <PageChrome
      title="Candidates"
      subtitle="Every applicant tracked from CV to offer — open a card to move it through the pipeline, schedule interviews, and keep the funnel moving."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            label="Export"
            icon={<Download className="size-4" />}
            isDisabled={rows.length === 0}
            onClick={() => exportCandidatesCsv(rows)}
          />
          {canCreate ? <NewCandidateDialog /> : undefined}
        </>
      }
    >
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-3 divide-x divide-hairline rounded-lg border border-hairline bg-surface-1 sm:grid-cols-6">
          {STAGE_COUNT_SEGMENTS.map((seg) => (
            <div key={seg.key} className="px-4 py-3">
              <div className="text-headline font-bold" style={{ color: STAGE_COLOR[seg.key] }}>
                {stageCounts?.[seg.key] ?? 0}
              </div>
              <div className="text-caption text-ink-muted">{seg.label}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, skill, seniority…"
              className="pl-8"
            />
          </div>
          <Select
            value={reqFilter || NONE}
            onValueChange={(v) => setReqFilter(v === NONE ? '' : v)}
          >
            <SelectTrigger aria-label="Filter by role" className="w-40">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All roles</SelectItem>
              {reqOptions.map(([id, title]) => (
                <SelectItem key={id} value={id}>
                  {title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={seniorityFilter || NONE}
            onValueChange={(v) => setSeniorityFilter(v === NONE ? '' : v)}
          >
            <SelectTrigger aria-label="Filter by seniority" className="w-36">
              <SelectValue placeholder="Seniority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All seniority</SelectItem>
              {seniorityOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sourceFilter || NONE}
            onValueChange={(v) => setSourceFilter(v === NONE ? '' : v)}
          >
            <SelectTrigger aria-label="Filter by source" className="w-36">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All sources</SelectItem>
              {sourceOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <SegmentedControl
              value={view}
              onValueChange={(v) => setView(v as 'board' | 'list')}
              options={[
                { value: 'board', label: 'Board' },
                { value: 'list', label: 'List' },
              ]}
            />
          </div>
        </div>

        {error ? (
          <Banner status="error" title={(error as Error).message} />
        ) : view === 'list' ? (
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            getRowId={(r: CandidateListItem) => r.application_id}
            enableGlobalFilter={false}
            pagination={{ defaultPageSize: 25, pageSizeOptions: [25, 50, 100] }}
            emptyState={
              <EmptyState
                icon={<Users className="size-6" />}
                title="No candidates yet"
                description="Add a candidate to get started."
              />
            }
            onRowClick={(row) => setSelected(row.original.candidate_id)}
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-lg border border-hairline bg-surface-2"
              />
            ))}
          </div>
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="No candidates yet"
            description="Add a candidate to get started."
          />
        ) : (
          // Why: narrows each column below the shared kanban-column default (280px) so all
          // 4 stages fit one screen without horizontal scrolling.
          <div className="[&_.kanban-column]:basis-[220px]!">
            <DragDropContext onDragEnd={handleDragEnd}>
              <KanbanBoard>
                {BOARD_COLUMNS.map((col) => (
                  <Droppable
                    key={col.id}
                    droppableId={col.id}
                    isDropDisabled={col.id === 'hired' || !canManage}
                  >
                    {(provided, snapshot) => (
                      <KanbanColumn
                        name={col.label}
                        count={groups[col.id].length}
                        color={STAGE_COLOR[col.id]}
                        droppable={{
                          ref: provided.innerRef,
                          // Why: @hello-pangea/dnd uses string-indexed data-rfd-* keys that don't satisfy React's HTMLAttributes shape.
                          rootProps:
                            provided.droppableProps as unknown as HTMLAttributes<HTMLElement>,
                          isDraggingOver: snapshot.isDraggingOver,
                          placeholder: provided.placeholder,
                        }}
                      >
                        {groups[col.id].length === 0 ? (
                          <EmptyState
                            className="py-4"
                            icon={COLUMN_EMPTY_ICON[col.id]}
                            title={COLUMN_EMPTY_COPY[col.id].title}
                            description={COLUMN_EMPTY_COPY[col.id].description}
                          />
                        ) : (
                          groups[col.id].map((item, idx) => (
                            <Draggable
                              key={item.application_id}
                              draggableId={item.application_id}
                              index={idx}
                              isDragDisabled={!canManage}
                            >
                              {(dp, ds) => (
                                <CandidateCard
                                  item={item}
                                  onSelect={setSelected}
                                  draggable={{
                                    ref: dp.innerRef,
                                    rootProps: dp.draggableProps,
                                    handleProps: dp.dragHandleProps ?? undefined,
                                    isDragging: ds.isDragging,
                                    extraStyle: dp.draggableProps.style,
                                  }}
                                />
                              )}
                            </Draggable>
                          ))
                        )}
                      </KanbanColumn>
                    )}
                  </Droppable>
                ))}
              </KanbanBoard>
            </DragDropContext>
          </div>
        )}
        <TalentPoolCard onOpenCandidate={setSelected} />
      </div>
      <CandidateDetailDrawer candidateId={selected} onClose={() => setSelected(null)} />
    </PageChrome>
  );
}
