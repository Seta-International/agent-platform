import type { RowSelectionState } from '@seta/shared-ui';
import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Input,
  Label,
  PageChrome,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createWorker,
  fetchWorkers,
  setPortalAccessBulk,
  type WorkerListRow,
} from '../api/people-client.ts';
import { peopleKeys } from '../state/query-keys.ts';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function LifecycleBadge({ stage }: { stage: string }) {
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    onboarding: 'secondary',
    offboarding: 'outline',
    terminated: 'destructive',
    leave: 'outline',
  };
  const variant = variantMap[stage] ?? 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {stage}
    </Badge>
  );
}

function CreateWorkerDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createWorker({
        full_name: fullName,
        work_email: workEmail || undefined,
      }),
    onSuccess: () => {
      toast.success('Worker created');
      onCreated();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => setError(e.message),
  });

  function reset() {
    setFullName('');
    setWorkEmail('');
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">New worker</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add worker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Full name *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Work email</Label>
            <Input value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} type="email" />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !fullName.trim()}
            >
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PeoplePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canProvision = usePermission('people.worker.provision');
  const canSetPortal = usePermission('people.worker.portal_access.set');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedWorkerIds = useMemo(
    () => Object.keys(rowSelection).filter((k) => rowSelection[k]),
    [rowSelection],
  );

  const bulkMutation = useMutation({
    mutationFn: (enabled: boolean) => setPortalAccessBulk(selectedWorkerIds, enabled),
    onSuccess: (r) => {
      const changed = r.results.filter((x) => x.status === 'changed').length;
      toast.success(`Portal access updated for ${changed} worker(s)`);
      setRowSelection({});
      void queryClient.invalidateQueries({ queryKey: peopleKeys.workers() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const {
    data: workers,
    isLoading,
    error,
  } = useQuery({
    queryKey: peopleKeys.workers(),
    queryFn: fetchWorkers,
  });

  const columns = useMemo(() => {
    type CellCtx = { row: { original: WorkerListRow } };
    return [
      {
        id: 'employee',
        header: 'Employee',
        cell: ({ row }: CellCtx) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="size-7">
              <AvatarFallback>{initials(row.original.full_name)}</AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">{row.original.full_name}</span>
          </div>
        ),
      },
      {
        id: 'work_email',
        header: 'Work email',
        cell: ({ row }: CellCtx) => (
          <span className="font-mono text-[12.5px] text-ink-muted truncate block">
            {row.original.work_email || '—'}
          </span>
        ),
      },
      {
        id: 'stage',
        header: 'Stage',
        cell: ({ row }: CellCtx) => <LifecycleBadge stage={row.original.lifecycle_stage} />,
      },
      {
        id: 'portal',
        header: 'Access',
        cell: ({ row }: CellCtx) => (
          <Badge variant={row.original.portal_access ? 'default' : 'outline'}>
            {row.original.portal_access ? 'Login on' : 'No login'}
          </Badge>
        ),
      },
    ];
  }, []);

  const actions = canProvision ? (
    <CreateWorkerDialog
      onCreated={() => void queryClient.invalidateQueries({ queryKey: peopleKeys.workers() })}
    />
  ) : undefined;

  return (
    <PageChrome title="People" actions={actions}>
      <div className="page-container space-y-4 p-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : (
          <>
            {selectedWorkerIds.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-raised px-4 py-2">
                <span className="text-body-sm text-ink-muted">
                  {selectedWorkerIds.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bulkMutation.isPending}
                    onClick={() => bulkMutation.mutate(true)}
                  >
                    Enable portal access
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bulkMutation.isPending}
                    onClick={() => bulkMutation.mutate(false)}
                  >
                    Disable portal access
                  </Button>
                </div>
              </div>
            )}
            <DataTable
              columns={columns}
              data={workers ?? []}
              isLoading={isLoading}
              pagination={false}
              getRowId={(r: WorkerListRow) => r.worker_id}
              enableRowSelection={canSetPortal}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              emptyState={
                <EmptyState
                  icon={<Users className="size-6" />}
                  title="No workers yet"
                  description="Add a worker to get started."
                />
              }
              onRowClick={(row) =>
                void navigate({
                  to: '/people/$workerId',
                  params: { workerId: row.original.worker_id },
                })
              }
            />
          </>
        )}
      </div>
    </PageChrome>
  );
}
