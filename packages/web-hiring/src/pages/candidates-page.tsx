import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  Alert,
  AlertDescription,
  DataTable,
  EmptyState,
  Input,
  PageChrome,
  SegmentedControl,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type CandidateListItem,
  fetchCandidates,
  moveApplicationStage,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CandidateCard } from './candidate-card.tsx';
import { CandidateDetailDrawer } from './candidate-detail-drawer.tsx';
import { BOARD_COLUMNS, boardColumns, fitLabel, resolveStageDrop } from './candidate-utils.ts';
import { NewCandidateDialog } from './new-candidate-dialog.tsx';
import { TalentPoolCard } from './talent-pool-card.tsx';
import { on409 } from './utils.ts';

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
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: hiringKeys.candidates(),
    queryFn: fetchCandidates,
  });

  const rows = useMemo(() => {
    let r = data ?? [];
    if (reqFilter) r = r.filter((c) => c.requisition_id === reqFilter);
    if (q.trim()) {
      const needle = q.toLowerCase();
      r = r.filter((c) =>
        `${c.name} ${c.requisition_title} ${c.seniority ?? ''}`.toLowerCase().includes(needle),
      );
    }
    return r;
  }, [data, q, reqFilter]);

  const reqOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of data ?? []) seen.set(c.requisition_id, c.requisition_title);
    return [...seen.entries()];
  }, [data]);

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
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.candidates()),
  });
  const handleDragEnd = onBoardDragEnd(rows, (m) => stageMove.mutate(m));

  const groups = boardColumns(rows);
  const inPipeline = rows.filter((c) => c.status === 'active').length;

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
    <PageChrome title="Candidates" actions={canCreate ? <NewCandidateDialog /> : undefined}>
      <div className="page-container space-y-4 p-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="In pipeline" value={inPipeline} />
          <Stat label="Hired" value={groups.hired.length} />
          <Stat label="Total" value={(data ?? []).length} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, role, seniority…"
            className="max-w-xs"
          />
          <select
            aria-label="Filter by role"
            className="rounded border border-hairline bg-surface-1 px-2 py-1"
            value={reqFilter}
            onChange={(e) => setReqFilter(e.target.value)}
          >
            <option value="">All open roles</option>
            {reqOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
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
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : view === 'list' ? (
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            getRowId={(r: CandidateListItem) => r.application_id}
            globalFilterPlaceholder="Search candidates…"
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
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {BOARD_COLUMNS.map((col) => (
                <Droppable
                  key={col.id}
                  droppableId={col.id}
                  isDropDisabled={col.id === 'hired' || !canManage}
                >
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="rounded-lg border border-hairline bg-surface-2 p-2"
                    >
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-caption font-semibold uppercase text-ink-muted">
                          {col.label}
                        </span>
                        <span className="text-caption text-ink-muted">{groups[col.id].length}</span>
                      </div>
                      <div className="space-y-2">
                        {groups[col.id].map((item, idx) => (
                          <Draggable
                            key={item.application_id}
                            draggableId={item.application_id}
                            index={idx}
                            isDragDisabled={!canManage}
                          >
                            {(dp) => (
                              <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}>
                                <CandidateCard item={item} onSelect={setSelected} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {groups[col.id].length === 0 && (
                          <div className="px-1 py-4 text-center text-caption text-ink-muted">—</div>
                        )}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
        )}
        <TalentPoolCard onOpenCandidate={setSelected} />
      </div>
      <CandidateDetailDrawer candidateId={selected} onClose={() => setSelected(null)} />
    </PageChrome>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-1 px-4 py-3">
      <div className="text-caption text-ink-muted">{label}</div>
      <div className="text-h3 font-semibold text-ink">{value}</div>
    </div>
  );
}
