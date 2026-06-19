import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Input,
  PageChrome,
  Skeleton,
} from '@seta/shared-ui';
import { BarChart2, Info, Plus, Search, TrendingUp, User, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAdminUserDetail,
  grantTenantRole,
  revokeGrant,
} from '@/modules/admin/users/api/users-client.ts';
import type { TenantUserRow } from '@/modules/identity/api/client.ts';
import { listTenantUsers } from '@/modules/identity/api/client.ts';

type AriaRole = 'performance.bod' | 'performance.manager' | 'performance.employee';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function ariaRoleOf(user: TenantUserRow): AriaRole {
  if (user.role_slugs.includes('performance.bod')) return 'performance.bod';
  if (user.role_slugs.includes('performance.manager')) return 'performance.manager';
  return 'performance.employee';
}

function roleLabel(role: AriaRole): string {
  if (role === 'performance.bod') return 'BOD';
  if (role === 'performance.manager') return 'Manager';
  return 'Employee';
}

function roleBadgeVariant(role: AriaRole): 'default' | 'success' | 'secondary' {
  if (role === 'performance.bod') return 'default';
  if (role === 'performance.manager') return 'success';
  return 'secondary';
}

function loadLineManagers(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('aria-line-managers') ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

async function applyAriaRole(user: TenantUserRow, newRole: AriaRole): Promise<void> {
  const detail = await getAdminUserDetail(user.user_id);
  const existing = detail.grants.filter(
    (g) => g.role_slug === 'performance.bod' || g.role_slug === 'performance.manager',
  );
  await Promise.all(existing.map((g) => revokeGrant(g.id)));
  if (newRole !== 'performance.employee') {
    await grantTenantRole(user.user_id, newRole);
  }
}

// ─── UserPickerPopover ────────────────────────────────────────────────────────

interface UserPickerPopoverProps {
  candidates: TenantUserRow[];
  onSelect: (user: TenantUserRow) => void;
  label: string;
  disabled?: boolean;
}

function UserPickerPopover({ candidates, onSelect, label, disabled }: UserPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const filtered = useMemo(() => {
    const lower = q.toLowerCase();
    return q.trim()
      ? candidates.filter(
          (u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower),
        )
      : candidates.slice(0, 10);
  }, [candidates, q]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || candidates.length === 0}
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5 h-7 text-caption"
      >
        <Plus className="size-3" />
        {label}
      </Button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-1 w-72 rounded-xl border border-hairline bg-surface-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden">
          <div className="p-2 border-b border-hairline">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-tertiary pointer-events-none" />
              <Input
                autoFocus
                placeholder="Search…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-7 pl-7 text-caption"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-hairline">
            {filtered.length === 0 ? (
              <p className="py-5 text-center text-caption text-ink-subtle">No matches</p>
            ) : (
              filtered.map((u) => (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => {
                    onSelect(u);
                    setOpen(false);
                    setQ('');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-3 transition-colors"
                >
                  <Avatar className="size-6 shrink-0">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {initials(u.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-ink truncate">{u.name}</p>
                    <p className="text-caption text-ink-tertiary truncate">{u.email}</p>
                  </div>
                  <Badge variant={roleBadgeVariant(ariaRoleOf(u))} className="shrink-0">
                    {roleLabel(ariaRoleOf(u))}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RoleSelector ─────────────────────────────────────────────────────────────

function RoleSelector({
  value,
  onChange,
  loading,
}: {
  value: AriaRole;
  onChange: (role: AriaRole) => void;
  loading?: boolean;
}) {
  const options: { role: AriaRole; label: string; icon: typeof User }[] = [
    { role: 'performance.employee', label: 'Employee', icon: User },
    { role: 'performance.manager', label: 'Manager', icon: TrendingUp },
    { role: 'performance.bod', label: 'BOD', icon: BarChart2 },
  ];

  return (
    <div className="flex rounded-lg border border-hairline bg-surface-2 p-0.5 gap-0.5">
      {options.map(({ role, label, icon: Icon }) => {
        const active = value === role;
        return (
          <button
            key={role}
            type="button"
            disabled={loading}
            onClick={() => onChange(role)}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-body-sm font-medium transition-colors',
              active
                ? 'bg-primary/15 text-primary-ink'
                : 'text-ink-muted hover:text-ink hover:bg-surface-3',
              loading ? 'cursor-not-allowed opacity-60' : '',
            ].join(' ')}
          >
            <Icon className="size-3.5 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── OrgChart ─────────────────────────────────────────────────────────────────

export function OrgChart() {
  const [users, setUsers] = useState<TenantUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AriaRole>('all');
  const [roleChanging, setRoleChanging] = useState(false);
  const [lineManagers, setLineManagers] = useState<Record<string, string>>(loadLineManagers);

  useEffect(() => {
    localStorage.setItem('aria-line-managers', JSON.stringify(lineManagers));
  }, [lineManagers]);

  const load = useCallback(async () => {
    try {
      const { rows } = await listTenantUsers({ limit: 200, offset: 0 });
      setError(null);
      setUsers(rows.filter((u) => u.status === 'active'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selected = useMemo(
    () => users.find((u) => u.user_id === selectedId) ?? null,
    [users, selectedId],
  );

  const roleCounts = useMemo(
    () => ({
      'performance.bod': users.filter((u) => ariaRoleOf(u) === 'performance.bod').length,
      'performance.manager': users.filter((u) => ariaRoleOf(u) === 'performance.manager').length,
      'performance.employee': users.filter((u) => ariaRoleOf(u) === 'performance.employee').length,
    }),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const lower = query.toLowerCase();
    return users.filter((u) => {
      const matchesQuery =
        !query || u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower);
      const matchesRole = roleFilter === 'all' || ariaRoleOf(u) === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [users, query, roleFilter]);

  const directReports = useMemo(
    () => users.filter((u) => lineManagers[u.user_id] === selectedId),
    [users, lineManagers, selectedId],
  );

  const currentLineManager = useMemo(
    () =>
      selected ? (users.find((u) => u.user_id === lineManagers[selected.user_id]) ?? null) : null,
    [users, lineManagers, selected],
  );

  const directReportCandidates = useMemo(
    () =>
      selectedId
        ? users.filter((u) => u.user_id !== selectedId && lineManagers[u.user_id] !== selectedId)
        : [],
    [users, lineManagers, selectedId],
  );

  const lineManagerCandidates = useMemo(
    () =>
      selected
        ? users.filter(
            (u) =>
              u.user_id !== selected.user_id &&
              (ariaRoleOf(u) === 'performance.manager' || ariaRoleOf(u) === 'performance.bod'),
          )
        : [],
    [users, selected],
  );

  async function handleRoleChange(user: TenantUserRow, newRole: AriaRole) {
    if (ariaRoleOf(user) === newRole) return;
    setRoleChanging(true);
    try {
      await applyAriaRole(user, newRole);
      await load();
    } finally {
      setRoleChanging(false);
    }
  }

  const filterOptions: { val: 'all' | AriaRole; label: string; count?: number }[] = [
    { val: 'all', label: 'All' },
    { val: 'performance.bod', label: 'BOD', count: roleCounts['performance.bod'] },
    { val: 'performance.manager', label: 'Manager', count: roleCounts['performance.manager'] },
    { val: 'performance.employee', label: 'Employee', count: roleCounts['performance.employee'] },
  ];

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Org Chart"
      subtitle="Assign ARIA performance roles and manage reporting lines."
    >
      <div
        className="flex border-t border-hairline overflow-hidden"
        style={{ height: 'calc(100vh - 10rem)' }}
      >
        {/* ── LEFT PANEL: User List ── */}
        <div className="w-80 shrink-0 border-r border-hairline flex flex-col bg-surface-1">
          {/* Search + filter */}
          <div className="px-3 pt-3 pb-2 space-y-2 border-b border-hairline shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-tertiary pointer-events-none" />
              <Input
                placeholder="Search users…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-7 pl-7 text-caption"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {filterOptions.map(({ val, label, count }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRoleFilter(val)}
                  className={[
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border',
                    roleFilter === val
                      ? 'bg-primary/15 text-primary-ink border-primary/20'
                      : 'text-ink-muted border-hairline hover:bg-surface-2 hover:text-ink',
                  ].join(' ')}
                >
                  {label}
                  {count != null && (
                    <span
                      className={`font-mono ${roleFilter === val ? 'text-primary/60' : 'text-ink-tertiary'}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-1.5">
                {['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5', 'sk6', 'sk7'].map((key) => (
                  <Skeleton key={key} className="h-11 w-full rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <p className="p-4 text-caption text-danger-ink">{error}</p>
            ) : filteredUsers.length === 0 ? (
              <p className="p-6 text-center text-caption text-ink-subtle">No users found</p>
            ) : (
              <div className="py-1">
                {filteredUsers.map((u) => {
                  const role = ariaRoleOf(u);
                  const isSelected = u.user_id === selectedId;
                  const lm = lineManagers[u.user_id]
                    ? users.find((lmu) => lmu.user_id === lineManagers[u.user_id])
                    : null;
                  return (
                    <button
                      key={u.user_id}
                      type="button"
                      onClick={() => setSelectedId(u.user_id)}
                      className={[
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                        isSelected ? 'bg-primary/10' : 'hover:bg-surface-2',
                      ].join(' ')}
                    >
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback
                          className={`text-[11px] ${isSelected ? 'bg-primary/20 text-primary' : 'bg-surface-3 text-ink-muted'}`}
                        >
                          {initials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-body-sm font-medium truncate ${isSelected ? 'text-primary-ink' : 'text-ink'}`}
                        >
                          {u.name}
                        </p>
                        {lm ? (
                          <p className="text-[10px] text-ink-tertiary truncate">→ {lm.name}</p>
                        ) : (
                          <p className="text-[10px] text-ink-tertiary truncate">{u.email}</p>
                        )}
                      </div>
                      <Badge variant={roleBadgeVariant(role)} className="shrink-0">
                        {roleLabel(role)}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Detail ── */}
        <div className="flex-1 overflow-y-auto bg-canvas">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
              <User className="size-10 text-ink-tertiary" />
              <p className="text-body-sm text-ink-muted max-w-xs">
                Select a user to manage their ARIA role and reporting structure
              </p>
            </div>
          ) : (
            <div className="max-w-xl mx-auto px-8 py-8 space-y-8">
              {/* Header */}
              <div className="flex items-center gap-4">
                <Avatar className="size-14 shrink-0">
                  <AvatarFallback className="text-xl bg-primary/10 text-primary font-semibold">
                    {initials(selected.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[20px] font-semibold text-ink tracking-tight">
                    {selected.name}
                  </h2>
                  <p className="text-body-sm text-ink-muted mt-0.5">{selected.email}</p>
                </div>
                <Badge variant={roleBadgeVariant(ariaRoleOf(selected))} className="self-start">
                  {roleLabel(ariaRoleOf(selected))}
                </Badge>
              </div>

              {/* Role selector */}
              <div className="space-y-2">
                <p className="text-caption font-medium text-ink-subtle">ARIA Role</p>
                <RoleSelector
                  value={ariaRoleOf(selected)}
                  onChange={(role) => void handleRoleChange(selected, role)}
                  loading={roleChanging}
                />
                {roleChanging && (
                  <p className="text-caption text-ink-subtle animate-pulse">Updating role…</p>
                )}
              </div>

              {/* ── Direct Reports — BOD + Manager ── */}
              {(ariaRoleOf(selected) === 'performance.bod' ||
                ariaRoleOf(selected) === 'performance.manager') && (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-caption font-medium text-ink-subtle">Direct Reports</p>
                      <p className="text-body-sm text-ink-muted mt-0.5">
                        {directReports.length === 0
                          ? `Nobody reports to ${selected.name.split(' ')[0]} yet`
                          : `${directReports.length} ${directReports.length === 1 ? 'person reports' : 'people report'} to ${selected.name.split(' ')[0]}`}
                      </p>
                    </div>
                    <UserPickerPopover
                      candidates={directReportCandidates}
                      onSelect={(u) =>
                        setLineManagers((prev) => ({ ...prev, [u.user_id]: selected.user_id }))
                      }
                      label="Add person"
                    />
                  </div>

                  {directReports.length === 0 ? (
                    <div className="rounded-lg border border-hairline border-dashed px-4 py-6 text-center">
                      <p className="text-body-sm text-ink-subtle">No direct reports yet</p>
                      <p className="text-caption text-ink-tertiary mt-1">
                        Add people using the button above
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {directReports.map((report) => (
                        <button
                          key={report.user_id}
                          type="button"
                          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-hairline bg-surface-1 group cursor-pointer hover:bg-surface-2 transition-colors"
                          onClick={() => setSelectedId(report.user_id)}
                        >
                          <Avatar className="size-7 shrink-0">
                            <AvatarFallback className="text-[11px] bg-surface-3 text-ink-muted">
                              {initials(report.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-body-sm font-medium text-ink truncate">
                              {report.name}
                            </p>
                            <p className="text-caption text-ink-tertiary truncate">
                              {report.email}
                            </p>
                          </div>
                          <Badge variant={roleBadgeVariant(ariaRoleOf(report))}>
                            {roleLabel(ariaRoleOf(report))}
                          </Badge>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLineManagers((prev) => {
                                const next = { ...prev };
                                delete next[report.user_id];
                                return next;
                              });
                            }}
                            aria-label={`Remove ${report.name} from direct reports`}
                            className="size-6 rounded flex items-center justify-center text-ink-tertiary hover:text-danger-ink hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="size-3.5" />
                          </button>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Line Manager — Employee + Manager ── */}
              {(ariaRoleOf(selected) === 'performance.employee' ||
                ariaRoleOf(selected) === 'performance.manager') && (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-caption font-medium text-ink-subtle">Reports to</p>
                      <p className="text-body-sm text-ink-muted mt-0.5">
                        Line manager for {selected.name.split(' ')[0]}
                      </p>
                    </div>
                    {!currentLineManager && lineManagerCandidates.length > 0 && (
                      <UserPickerPopover
                        candidates={lineManagerCandidates}
                        onSelect={(manager) =>
                          setLineManagers((prev) => ({
                            ...prev,
                            [selected.user_id]: manager.user_id,
                          }))
                        }
                        label="Assign manager"
                      />
                    )}
                  </div>

                  {lineManagerCandidates.length === 0 && !currentLineManager && (
                    <div className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2.5 text-caption text-ink-subtle">
                      <Info className="size-3.5 shrink-0 mt-0.5" />
                      No managers or BOD members exist. Assign the Manager or BOD role to a user
                      first.
                    </div>
                  )}

                  {currentLineManager ? (
                    <button
                      type="button"
                      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-hairline bg-surface-1 group cursor-pointer hover:bg-surface-2 transition-colors"
                      onClick={() => setSelectedId(currentLineManager.user_id)}
                    >
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="text-[11px] bg-primary/10 text-primary">
                          {initials(currentLineManager.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-ink truncate">
                          {currentLineManager.name}
                        </p>
                        <p className="text-caption text-ink-tertiary truncate">
                          {currentLineManager.email}
                        </p>
                      </div>
                      <Badge variant={roleBadgeVariant(ariaRoleOf(currentLineManager))}>
                        {roleLabel(ariaRoleOf(currentLineManager))}
                      </Badge>
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: propagation barrier for nested controls, not a user-interactive element */}
                      <div
                        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <UserPickerPopover
                          candidates={lineManagerCandidates}
                          onSelect={(manager) =>
                            setLineManagers((prev) => ({
                              ...prev,
                              [selected.user_id]: manager.user_id,
                            }))
                          }
                          label="Change"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setLineManagers((prev) => {
                              const next = { ...prev };
                              delete next[selected.user_id];
                              return next;
                            })
                          }
                          className="text-ink-tertiary hover:text-danger-ink text-caption h-7"
                        >
                          Remove
                        </Button>
                      </div>
                    </button>
                  ) : lineManagerCandidates.length > 0 ? (
                    <div className="rounded-lg border border-hairline border-dashed px-4 py-6 text-center">
                      <p className="text-body-sm text-ink-subtle">No line manager assigned</p>
                      <p className="text-caption text-ink-tertiary mt-1">
                        Use the button above to assign one
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageChrome>
  );
}
