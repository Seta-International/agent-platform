import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DataTable,
  FilterPill,
  formatRelative,
  Input,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { Route as AdminUsersRoute } from '@/routes/_authed/admin/users.tsx';
import { type AdminUserListRow, listAdminUsers } from '../api/users-client.ts';
import { TENANT_ROLE_SLUGS } from '../constants.ts';
import { setUserListOrder } from '../state/user-list-order.ts';
import { StatusPill } from './user-list/StatusPill.tsx';

const PAGE_SIZE = 25;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

export function AdminUsersTable({ refreshKey }: { refreshKey: number }) {
  const navigate = useNavigate();
  const search = AdminUsersRoute.useSearch();
  // The search input is local + debounced before pushing to the URL.
  const [searchInput, setSearchInput] = useState(search.q ?? '');
  const [rows, setRows] = useState<AdminUserListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const offset = search.offset ?? 0;
  const role = search.role ?? null;
  const status = search.status ?? null;
  const signInMethod = search.sign_in_method ?? null;
  const q = search.q ?? '';

  // Debounce the typed search → URL.
  useEffect(() => {
    if (searchInput === q) return;
    const t = setTimeout(() => {
      void navigate({
        to: '/admin/users',
        search: {
          q: searchInput || undefined,
          role: role ?? undefined,
          status: status ?? undefined,
          sign_in_method: signInMethod ?? undefined,
          offset: undefined,
        },
        replace: true,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, q, role, status, signInMethod, navigate]);

  // Fetch whenever any URL-backed filter changes.
  useEffect(() => {
    void refreshKey;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading-while-fetching pattern
    setLoading(true);
    (async () => {
      try {
        const res = await listAdminUsers({
          search: q || undefined,
          role: role ?? undefined,
          status: status ?? undefined,
          sign_in_method: signInMethod ?? undefined,
          limit: PAGE_SIZE,
          offset,
        });
        if (!cancelled) {
          setRows(res.rows);
          setTotal(res.total);
          setUserListOrder(res.rows.map((r) => r.user_id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, role, status, signInMethod, offset, refreshKey]);

  function setSearchField(
    patch: Partial<{
      role: string | undefined;
      status: 'active' | 'deactivated' | 'ooo' | undefined;
      sign_in_method: 'credential' | 'microsoft' | 'both' | undefined;
    }>,
  ): void {
    void navigate({
      to: '/admin/users',
      search: {
        q: q || undefined,
        role: 'role' in patch ? patch.role : (role ?? undefined),
        status: 'status' in patch ? patch.status : (status ?? undefined),
        sign_in_method:
          'sign_in_method' in patch ? patch.sign_in_method : (signInMethod ?? undefined),
        offset: undefined,
      },
      replace: true,
    });
  }

  function setOffset(n: number): void {
    void navigate({
      to: '/admin/users',
      search: {
        q: q || undefined,
        role: role ?? undefined,
        status: status ?? undefined,
        sign_in_method: signInMethod ?? undefined,
        offset: n > 0 ? n : undefined,
      },
      replace: false,
    });
  }

  const columns = useMemo<ColumnDef<AdminUserListRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="size-6">
              <AvatarFallback>{initials(row.original.name)}</AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="font-mono text-[12.5px] text-ink-muted truncate block">
            {row.original.email}
          </span>
        ),
      },
      {
        id: 'roles',
        header: 'Roles',
        cell: ({ row }) => {
          const r = row.original.role_slugs;
          if (r.length === 0) return <span className="text-ink-muted text-xs">{'\u2014'}</span>;
          return (
            <div className="flex gap-1 overflow-hidden">
              {r.slice(0, 2).map((s) => (
                <Badge key={s} variant="outline" className="h-[18px] px-1.5 text-[11px]">
                  {s}
                </Badge>
              ))}
              {r.length > 2 && (
                <span className="text-xs text-ink-muted self-center">+{r.length - 2}</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'last_seen',
        header: () => <span className="block text-right">Last active</span>,
        cell: ({ row }) => (
          <span className="block text-right text-sm text-ink-muted">
            {formatRelative(row.original.last_seen_at)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          label="Role"
          value={role}
          options={TENANT_ROLE_SLUGS.map((r) => ({ value: r, label: r }))}
          onChange={(v) => setSearchField({ role: v ?? undefined })}
        />
        <FilterPill
          label="Status"
          value={status}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'ooo', label: 'OOO' },
            { value: 'deactivated', label: 'Disabled' },
          ]}
          onChange={(v) => setSearchField({ status: v ?? undefined })}
        />
        <FilterPill
          label="Source"
          value={signInMethod}
          options={[
            { value: 'credential', label: 'Password' },
            { value: 'microsoft', label: 'SSO Entra' },
            { value: 'both', label: 'Both' },
          ]}
          onChange={(v) => setSearchField({ sign_in_method: v ?? undefined })}
        />
        <Input
          placeholder="Search by name or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="ml-auto max-w-xs"
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={loading}
        onRowClick={(row) =>
          navigate({ to: '/admin/users/$userId', params: { userId: row.original.user_id } })
        }
        pagination={false}
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-ink-muted">
          <span>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              ‹
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              ›
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
