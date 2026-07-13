import {
  Banner,
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
import { FolderKanban } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type AccountListRow, createAccount, fetchAccounts } from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

function CreateAccountDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createAccount({
        name,
        industry: industry.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Account created');
      onCreated();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => setError(e.message),
  });

  function reset() {
    setName('');
    setIndustry('');
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
        <Button size="sm">New account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Industry</Label>
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
          {error && <Banner status="error" title={error} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name.trim()}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AccountsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = usePermission('pm.account.manage');

  const {
    data: accounts,
    isLoading,
    error,
  } = useQuery({
    queryKey: pmKeys.accounts(),
    queryFn: fetchAccounts,
  });

  const columns = useMemo(() => {
    type CellCtx = { row: { original: AccountListRow } };
    return [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }: CellCtx) => (
          <span className="font-medium text-ink">{row.original.name}</span>
        ),
      },
      {
        id: 'industry',
        accessorKey: 'industry',
        header: 'Industry',
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted">{row.original.industry ?? '—'}</span>
        ),
      },
      {
        id: 'am_worker_id',
        accessorKey: 'am_worker_id',
        header: 'Account Manager',
        cell: ({ row }: CellCtx) => (
          <span className="font-mono text-caption text-ink-muted truncate block">
            {row.original.am_worker_id ?? '—'}
          </span>
        ),
      },
      {
        id: 'recruiter_count',
        accessorKey: 'recruiter_count',
        header: 'Recruiters',
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted">{row.original.recruiter_count}</span>
        ),
      },
      {
        id: 'project_count',
        accessorKey: 'project_count',
        header: 'Projects',
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted">{row.original.project_count}</span>
        ),
      },
    ];
  }, []);

  const actions = canManage ? (
    <CreateAccountDialog
      onCreated={() => void queryClient.invalidateQueries({ queryKey: pmKeys.accounts() })}
    />
  ) : undefined;

  return (
    <PageChrome title="Accounts" actions={actions}>
      <div className="page-container space-y-4 p-6">
        {error ? (
          <Banner status="error" title={(error as Error).message} />
        ) : (
          <DataTable
            columns={columns}
            data={accounts ?? []}
            isLoading={isLoading}
            pagination={{ defaultPageSize: 25, pageSizeOptions: [25, 50, 100] }}
            getRowId={(r: AccountListRow) => r.account_id}
            globalFilterPlaceholder="Search accounts…"
            emptyState={
              <EmptyState
                icon={<FolderKanban className="size-6" />}
                title="No accounts yet"
                description="Create an account to get started."
              />
            }
            onRowClick={(row) =>
              void navigate({
                to: '/pm/accounts/$accountId',
                params: { accountId: row.original.account_id },
              })
            }
          />
        )}
      </div>
    </PageChrome>
  );
}
