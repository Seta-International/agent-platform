import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  DataTable,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@seta/shared-ui';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { useState } from 'react';
import {
  type EntraImportableUserDto,
  importEntraUsers,
  listEntraUsers,
} from '../api/sso-client.ts';

interface ImportResult {
  imported: string[];
  skipped: { entra_oid: string; reason: string }[];
}

const columns: ColumnDef<EntraImportableUserDto>[] = [
  {
    id: '__select_entra',
    header: '',
    cell: ({ row }) => {
      const u = row.original;
      const selectable = u.account_enabled && !u.already_in_seta;
      return (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          disabled={!selectable}
          onCheckedChange={(v) => {
            if (selectable) row.toggleSelected(!!v);
          }}
        />
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'display_name',
    header: 'Name',
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const u = row.original;
      if (!u.account_enabled)
        return (
          <Badge variant="secondary" className="text-xs">
            Disabled
          </Badge>
        );
      if (u.already_in_seta)
        return (
          <Badge variant="secondary" className="text-xs">
            Already in Seta
          </Badge>
        );
      return (
        <Badge variant="default" className="text-xs">
          New
        </Badge>
      );
    },
  },
];

export function ImportFromEntraDialog({
  enabled,
  onImported,
}: {
  enabled: boolean;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<EntraImportableUserDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const selectedOids = users
    ? Object.keys(rowSelection).filter(
        (oid) => rowSelection[oid] && users.find((u) => u.entra_oid === oid),
      )
    : [];

  async function loadUsers() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listEntraUsers();
      setUsers(data);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v && users === null) {
      void loadUsers();
    }
    if (!v) {
      setRowSelection({});
      setSubmitError(null);
      setResult(null);
    }
  }

  async function submit() {
    if (selectedOids.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await importEntraUsers(selectedOids);
      setResult(res);
      setRowSelection({});
      onImported();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const trigger = (
    <Button variant="secondary" disabled={!enabled}>
      Import from Entra
    </Button>
  );

  return (
    <>
      {!enabled && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent>Connect and enable Entra ID first</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        {enabled && <SheetTrigger asChild>{trigger}</SheetTrigger>}
        <SheetContent side="right" className="w-[640px] max-w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Import from Entra ID</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {result ? (
              <div className="space-y-3">
                <Alert>
                  <AlertDescription>
                    Imported <strong>{result.imported.length}</strong> user
                    {result.imported.length !== 1 ? 's' : ''} successfully.
                  </AlertDescription>
                </Alert>

                {result.skipped.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      {result.skipped.length} skipped
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4">
                      {result.skipped.map((s) => {
                        const u = users?.find((u) => u.entra_oid === s.entra_oid);
                        return (
                          <li key={s.entra_oid} className="text-muted-foreground">
                            {u?.email ?? s.entra_oid} — {s.reason}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setResult(null);
                      setUsers(null);
                      void loadUsers();
                    }}
                  >
                    Refresh
                  </Button>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {loadError && (
                  <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                  </Alert>
                )}

                {loading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : users !== null ? (
                  <DataTable
                    data={users}
                    columns={columns}
                    enableRowSelection
                    rowSelection={rowSelection}
                    onRowSelectionChange={setRowSelection}
                    pagination={false}
                    enableGlobalFilter={true}
                    globalFilterPlaceholder="Filter users…"
                  />
                ) : null}

                {submitError && (
                  <Alert variant="destructive">
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void submit()}
                    disabled={submitting || selectedOids.length === 0}
                  >
                    {submitting
                      ? 'Importing…'
                      : selectedOids.length > 0
                        ? `Import ${selectedOids.length} user${selectedOids.length !== 1 ? 's' : ''}`
                        : 'Select users to import'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
