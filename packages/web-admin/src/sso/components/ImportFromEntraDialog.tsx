import {
  Badge,
  Banner,
  Button,
  DataTable,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  Skeleton,
  Tooltip,
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

/** A person can be imported only if their Entra account is on and they aren't already here. */
function canImport(u: EntraImportableUserDto): boolean {
  return u.account_enabled && !u.already_in_seta;
}

const columns: ColumnDef<EntraImportableUserDto>[] = [
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
        return <Badge variant="neutral" className="text-xs" label="Disabled" />;
      if (u.already_in_seta)
        return <Badge variant="neutral" className="text-xs" label="Already added" />;
      return <Badge variant="neutral" className="text-xs" label="New" />;
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
    <Button
      variant="secondary"
      isDisabled={!enabled}
      label="Import from Entra"
      onClick={() => handleOpenChange(true)}
    />
  );

  return (
    <>
      {!enabled ? (
        <Tooltip content="Connect and turn on Microsoft Entra ID first" hasHoverIndication={false}>
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <Dialog
        isOpen={open}
        onOpenChange={handleOpenChange}
        purpose="form"
        position={{ top: 0, right: 0, bottom: 0 }}
        width={640}
        maxHeight="100dvh"
        // Astryx's Dialog does not label itself from DialogHeader (only AlertDialog does),
        // so name it explicitly to keep the accessible name the drawer has always had.
        aria-label="Import from Entra ID"
      >
        <Layout
          header={<DialogHeader title="Import from Entra ID" onOpenChange={handleOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-4">
                {result ? (
                  <div className="space-y-3">
                    <Banner
                      status="info"
                      title={
                        <>
                          Added <strong>{result.imported.length}</strong>{' '}
                          {result.imported.length === 1 ? 'person' : 'people'} to your organization.
                        </>
                      }
                    />

                    {result.skipped.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground">
                          {result.skipped.length} couldn&apos;t be added
                        </summary>
                        <ul className="mt-2 space-y-1 pl-4">
                          {result.skipped.map((s) => {
                            const u = users?.find((u) => u.entra_oid === s.entra_oid);
                            return (
                              <li key={s.entra_oid} className="text-muted-foreground">
                                {u?.email ?? s.entra_oid}: {s.reason}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        label="Refresh"
                        onClick={() => {
                          setResult(null);
                          setUsers(null);
                          void loadUsers();
                        }}
                      />
                      <Button
                        variant="ghost"
                        label="Close"
                        onClick={() => handleOpenChange(false)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {loadError && <Banner status="error" title={loadError} />}

                    {loading ? (
                      <div className="space-y-2">
                        {[0, 1, 2, 3].map((i) => (
                          <Skeleton key={`skeleton-${i}`} height={32} />
                        ))}
                      </div>
                    ) : users !== null ? (
                      <DataTable
                        data={users}
                        columns={columns}
                        // Key selection by OID: `selectedOids` reads these keys back as
                        // `entra_oid`, which TanStack's default row-index ids never match.
                        getRowId={(u) => u.entra_oid}
                        enableRowSelection={(row) => canImport(row.original)}
                        rowSelection={rowSelection}
                        onRowSelectionChange={setRowSelection}
                        pagination={false}
                        enableGlobalFilter={true}
                        globalFilterPlaceholder="Filter users…"
                      />
                    ) : null}

                    {submitError && <Banner status="error" title={submitError} />}

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        label="Cancel"
                        onClick={() => handleOpenChange(false)}
                      />
                      <Button
                        label={
                          submitting
                            ? 'Adding…'
                            : selectedOids.length > 0
                              ? `Add ${selectedOids.length} ${selectedOids.length === 1 ? 'person' : 'people'}`
                              : 'Select people to add'
                        }
                        onClick={() => void submit()}
                        isDisabled={submitting || selectedOids.length === 0}
                      />
                    </div>
                  </>
                )}
              </div>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
