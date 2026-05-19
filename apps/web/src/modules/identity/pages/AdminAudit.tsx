import { Badge, DataTable } from '@seta/shared-ui';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { useEffect, useState } from 'react';

interface AuditActor {
  user_id?: string | null;
  kind?: string;
  [key: string]: unknown;
}

interface AuditRow {
  event_id: string;
  occurred_at: string;
  event_type: string;
  actor: AuditActor | null;
  before: unknown;
  after: unknown;
  trace_id: string | null;
}

// actor.user_id being absent or the literal string 'system' indicates a non-user actor;
// a uuid present in actor.user_id means a human user performed the action.
function deriveActorKind(actor: AuditActor | null): 'user' | 'system' | 'cli' {
  if (!actor) return 'system';
  if (actor.kind === 'cli') return 'cli';
  if (actor.user_id && actor.user_id !== 'system') return 'user';
  return 'system';
}

const EVENT_TYPES = [
  'identity.user.created',
  'identity.user.profile.updated',
  'identity.user.deactivated',
  'identity.user.reactivated',
  'identity.role_grant.changed',
  'core.tenant.created',
];

const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: 'occurred_at',
    header: 'When',
    cell: ({ row }) => new Date(row.original.occurred_at).toLocaleString(),
  },
  {
    id: 'actor',
    header: 'Actor',
    cell: ({ row }) => {
      const kind = deriveActorKind(row.original.actor);
      return <Badge variant="outline">{kind}</Badge>;
    },
  },
  {
    accessorKey: 'event_type',
    header: 'Event Type',
  },
  {
    accessorKey: 'trace_id',
    header: 'Trace ID',
    cell: ({ row }) => {
      const t = row.original.trace_id;
      return t ? (
        <code className="font-mono text-xs text-muted-foreground">{t.slice(0, 16)}…</code>
      ) : (
        '—'
      );
    },
  },
];

function AuditSubRow({ row }: { row: Row<AuditRow> }) {
  return (
    <pre className="bg-muted p-3 text-xs overflow-auto max-h-64 rounded">
      {JSON.stringify({ before: row.original.before, after: row.original.after }, null, 2)}
    </pre>
  );
}

export function AdminAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [eventType, setEventType] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      const q = new URLSearchParams();
      if (eventType) q.set('event_type', eventType);
      fetch(`/api/identity/v1/audit?${q}`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d: { rows: AuditRow[]; total: number }) => {
          if (!cancelled) {
            setRows(d.rows);
            setTotal(d.total);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [eventType]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit</h1>
        <span className="text-sm text-muted-foreground">{total} events</span>
      </div>
      <div className="flex gap-2">
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Filter by event type"
        >
          <option value="">All event types</option>
          {EVENT_TYPES.map((et) => (
            <option key={et} value={et}>
              {et}
            </option>
          ))}
        </select>
      </div>
      <DataTable
        data={rows}
        columns={columns}
        isLoading={loading}
        enableExpansion
        enableGlobalFilter={false}
        enableColumnVisibility={false}
        getRowCanExpand={() => true}
        renderSubComponent={({ row }) => <AuditSubRow row={row} />}
        pagination={false}
      />
    </div>
  );
}
