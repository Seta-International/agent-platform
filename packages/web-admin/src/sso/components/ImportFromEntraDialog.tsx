import {
  Badge,
  Banner,
  Button,
  Dialog,
  DialogHeader,
  EmptyState,
  HStack,
  Input,
  Layout,
  LayoutContent,
  pixel,
  proportional,
  Skeleton,
  Table,
  type TableColumn,
  Text,
  Tooltip,
  useTableSelection,
  useTableSelectionState,
  VStack,
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
      // keep: BadgeProps has no size prop — text-xs shrinks the badge for this dense table cell
      if (!u.account_enabled)
        return <Badge variant="neutral" className="text-xs" label="Disabled" />; // keep: no size prop
      if (u.already_in_seta)
        return <Badge variant="neutral" className="text-xs" label="Already added" />; // keep: no size prop
      return <Badge variant="neutral" className="text-xs" label="New" />; // keep: no size prop
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
        position={{ top: 0, end: 0, bottom: 0 }}
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
              <VStack gap={4}>
                {result ? (
                  <VStack gap={3}>
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
                      // keep: native disclosure — Astryx Collapsible defaults open and adds a
                      // chevron trigger button, changing both the closed-by-default behavior and
                      // the a11y semantics of this <details>/<summary> pair.
                      <details>
                        <summary className="cursor-pointer">
                          <Text type="supporting" color="secondary">
                            {result.skipped.length} couldn&apos;t be added
                          </Text>
                        </summary>
                        <ul
                          style={{
                            marginTop: 'var(--spacing-2)',
                            paddingInlineStart: 'var(--spacing-4)',
                          }}
                        >
                          {result.skipped.map((s, i) => {
                            const u = users?.find((u) => u.entra_oid === s.entra_oid);
                            return (
                              <li
                                key={s.entra_oid}
                                style={i > 0 ? { marginTop: 'var(--spacing-1)' } : undefined}
                              >
                                <Text type="supporting" color="secondary">
                                  {u?.email ?? s.entra_oid}: {s.reason}
                                </Text>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}

                    <HStack gap={2}>
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
                    </HStack>
                  </VStack>
                ) : (
                  <>
                    {loadError && <Banner status="error" title={loadError} />}

                    {loading ? (
                      <VStack gap={2}>
                        {[0, 1, 2, 3].map((i) => (
                          <Skeleton key={`skeleton-${i}`} height={32} />
                        ))}
                      </VStack>
                    ) : users !== null ? (
                      <VStack gap={2}>
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
                      </VStack>
                    ) : null}

                    {submitError && <Banner status="error" title={submitError} />}

                    <HStack gap={2} hAlign="end">
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
                    </HStack>
                  </>
                )}
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
