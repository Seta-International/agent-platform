import {
  Badge,
  Banner,
  Button,
  Dialog,
  DialogHeader,
  EmptyState,
  Input,
  Layout,
  LayoutContent,
  pixel,
  proportional,
  Skeleton,
  Table,
  type TableColumn,
  Tooltip,
  useTableSelection,
  useTableSelectionState,
} from '@seta/shared-ui';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type EntraImportableUserDto,
  importEntraUsers,
  listEntraUsers,
} from '../api/sso-client.ts';

// Astryx Table columns require `T extends Record<string, unknown>`; alias the
// DTO locally instead of touching the shared type.
type EntraRow = EntraImportableUserDto & Record<string, unknown>;

interface ImportResult {
  imported: string[];
  skipped: { entra_oid: string; reason: string }[];
}

/** A person can be imported only if their Entra account is on and they aren't already here. */
function canImport(u: EntraImportableUserDto): boolean {
  return u.account_enabled && !u.already_in_seta;
}

const columns: TableColumn<EntraRow>[] = [
  { key: 'email', header: 'Email', width: proportional(2) },
  { key: 'display_name', header: 'Name', width: proportional(2) },
  {
    key: 'status',
    header: 'Status',
    width: pixel(140),
    renderCell: (u) => {
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
  const [users, setUsers] = useState<EntraRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Client-side text filter over the displayed fields; select-all must operate
  // on the visible rows, so selection reads this filtered list.
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q),
    );
  }, [users, filter]);

  const { selectionConfig } = useTableSelectionState<EntraRow>({
    data: filteredUsers,
    idKey: 'entra_oid',
    // A person can be imported only if their Entra account is on and they
    // aren't already here — matches the deleted enableRowSelection predicate,
    // which rendered a disabled (not absent) checkbox for non-importable rows.
    getIsItemEnabled: canImport,
    selectedKeys,
    setSelectedKeys,
  });
  const selection = useTableSelection<EntraRow>(selectionConfig);

  const selectedOids = users
    ? [...selectedKeys].filter((oid) => users.some((u) => u.entra_oid === oid))
    : [];

  async function loadUsers() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listEntraUsers();
      setUsers(data as EntraRow[]);
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
      setSelectedKeys(new Set());
      setFilter('');
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
      setSelectedKeys(new Set());
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
                        <summary className="cursor-pointer text-secondary">
                          {result.skipped.length} couldn&apos;t be added
                        </summary>
                        <ul className="mt-2 space-y-1 pl-4">
                          {result.skipped.map((s) => {
                            const u = users?.find((u) => u.entra_oid === s.entra_oid);
                            return (
                              <li key={s.entra_oid} className="text-secondary">
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
                      <div className="space-y-2">
                        <Input
                          label="Filter users"
                          isLabelHidden
                          startIcon={<Search className="size-3.5" aria-hidden />}
                          placeholder="Filter users…"
                          value={filter}
                          onChange={setFilter}
                        />
                        <Table
                          data={filteredUsers}
                          columns={columns}
                          // Key selection by OID so `selectedOids` reads the keys
                          // back as `entra_oid`.
                          idKey="entra_oid"
                          emptyState={<EmptyState title="No matching users" />}
                          plugins={{ selection }}
                        />
                      </div>
                    ) : null}

                    {submitError && <Banner status="error" title={submitError} />}

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        label="Cancel"
                        onClick={() => handleOpenChange(false)}
                      />
                      <Button
                        variant="primary"
                        icon={<Plus className="size-4" />}
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
