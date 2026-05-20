import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { type AdminUserListRow, listAdminUsers } from '../api/client.ts';
import { TENANT_ROLE_SLUGS } from '../constants.ts';

const PAGE_SIZE = 25;

export function AdminUsersTable({
  refreshKey,
  onRowClick,
}: {
  refreshKey: number;
  onRowClick: (id: string) => void;
}) {
  const [rows, setRows] = useState<AdminUserListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // refreshKey is intentionally read here to force the effect to re-run on external mutations
    void refreshKey;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await listAdminUsers({
          search: search || undefined,
          role: role || undefined,
          status: status || undefined,
          limit: PAGE_SIZE,
          offset,
        });
        if (!cancelled) {
          setRows(res.rows);
          setTotal(res.total);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, role, status, offset, refreshKey]);

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search email or name"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className="max-w-sm"
        />
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setOffset(0);
          }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {TENANT_ROLE_SLUGS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="ooo">OOO</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <div className="ml-auto text-sm text-muted-foreground">{total} users</div>
      </div>
      <div className="rounded-md border border-hairline">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.user_id}
                  onClick={() => onRowClick(row.user_id)}
                  className="cursor-pointer"
                >
                  <TableCell>{row.email}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === 'deactivated' ? 'destructive' : 'secondary'}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.role_slugs.map((r) => (
                        <Badge key={r} variant="outline">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const m = row.sign_in_methods ?? [];
                      const hasCred = m.includes('credential');
                      const hasMs = m.includes('microsoft');
                      const label =
                        hasCred && hasMs
                          ? 'password + entra'
                          : hasCred
                            ? 'password'
                            : hasMs
                              ? 'entra'
                              : 'none';
                      return <Badge variant="outline">{label}</Badge>;
                    })()}
                  </TableCell>
                  <TableCell>
                    {row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {pageCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
