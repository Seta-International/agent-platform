import {
  Badge,
  Button,
  DataTable,
  FilterPill,
  Input,
  PageChrome,
  PageChromeToolbar,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  Row,
  SortingState,
} from '@tanstack/react-table';
import { Copy, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Route } from '@/routes/_authed/admin/audit.tsx';
import type { AuditRowDto } from '../api/audit-client.ts';
import { useAuditEvents } from '../hooks/queries/use-audit-events.ts';

const EVENT_TYPE_OPTIONS = [
  { value: 'identity.user.created', label: 'User created' },
  { value: 'identity.user.profile.updated', label: 'User profile updated' },
  { value: 'identity.user.deactivated', label: 'User deactivated' },
  { value: 'identity.user.reactivated', label: 'User reactivated' },
  { value: 'identity.role_grant.changed', label: 'Role grant changed' },
  { value: 'core.tenant.created', label: 'Organization created' },
] as const;

type DateRange = '24h' | '7d' | '30d';
const DATE_RANGE_OPTIONS: ReadonlyArray<{ value: DateRange; label: string }> = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
function rangeToFromIso(r: DateRange | null): string | undefined {
  if (r === null) return undefined;
  const offset = r === '24h' ? DAY_MS : r === '7d' ? 7 * DAY_MS : 30 * DAY_MS;
  return new Date(Date.now() - offset).toISOString();
}
function fromIsoToRange(iso: string | undefined): DateRange | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms <= 1.5 * DAY_MS) return '24h';
  if (ms <= 8 * DAY_MS) return '7d';
  if (ms <= 31 * DAY_MS) return '30d';
  return null;
}

function deriveActorKind(actor: AuditRowDto['actor']): 'user' | 'system' | 'cli' {
  if (!actor) return 'system';
  if (actor.kind === 'cli') return 'cli';
  if (actor.user_id && actor.user_id !== 'system') return 'user';
  return 'system';
}

function actorLabel(actor: AuditRowDto['actor']): string {
  if (!actor) return 'system';
  if (typeof actor.email === 'string' && actor.email.length > 0) return actor.email;
  if (typeof actor.user_id === 'string' && actor.user_id !== 'system') return actor.user_id;
  return deriveActorKind(actor);
}

function eventTone(eventType: string): 'success' | 'danger' | 'warning' | 'primary' | 'info' {
  if (/\.created$/.test(eventType)) return 'success';
  if (/\.(deactivated|deleted|disconnected|revoked|removed)$/.test(eventType)) return 'danger';
  if (/role_grant|consent/.test(eventType)) return 'primary';
  if (/\.(updated|changed|enabled|disabled|reactivated)$/.test(eventType)) return 'warning';
  return 'info';
}

const TONE_DOT: Record<ReturnType<typeof eventTone>, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  primary: 'bg-primary',
  info: 'bg-ink-tertiary',
};

function EventTypeCell({ eventType }: { eventType: string }) {
  const tone = eventTone(eventType);
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
      <code className="font-mono text-body-sm text-ink">{eventType}</code>
    </div>
  );
}

function ActorCell({ actor }: { actor: AuditRowDto['actor'] }) {
  const kind = deriveActorKind(actor);
  const label = actorLabel(actor);
  return (
    <div className="flex items-center gap-2">
      <Badge variant={kind === 'user' ? 'default' : 'outline'} className="font-mono text-[10px]">
        {kind}
      </Badge>
      <span className="truncate text-body-sm text-ink-muted">{label}</span>
    </div>
  );
}

function TraceCell({ traceId }: { traceId: string | null }) {
  if (!traceId) return <span className="text-ink-tertiary">{'\u2014'}</span>;
  return <code className="font-mono text-caption text-ink-subtle">{traceId.slice(0, 12)}…</code>;
}

function whenLabel(iso: string): { absolute: string; relative: string } {
  const d = new Date(iso);
  const abs = d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  let rel: string;
  if (sec < 60) rel = `${sec}s ago`;
  else if (sec < 3600) rel = `${Math.floor(sec / 60)}m ago`;
  else if (sec < 86_400) rel = `${Math.floor(sec / 3600)}h ago`;
  else rel = `${Math.floor(sec / 86_400)}d ago`;
  return { absolute: abs, relative: rel };
}

const columns: ColumnDef<AuditRowDto>[] = [
  {
    id: 'occurred_at',
    accessorKey: 'occurred_at',
    header: 'When',
    enableSorting: true,
    cell: ({ row }) => {
      const w = whenLabel(row.original.occurred_at);
      return (
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-body-sm text-ink">{w.absolute}</span>
          <span className="text-caption text-ink-subtle">{w.relative}</span>
        </div>
      );
    },
  },
  {
    id: 'actor',
    header: 'Actor',
    enableSorting: false,
    cell: ({ row }) => <ActorCell actor={row.original.actor} />,
  },
  {
    id: 'event_type',
    accessorKey: 'event_type',
    header: 'Event',
    enableSorting: true,
    cell: ({ row }) => <EventTypeCell eventType={row.original.event_type} />,
  },
  {
    id: 'trace_id',
    accessorKey: 'trace_id',
    header: 'Trace',
    enableSorting: false,
    cell: ({ row }) => <TraceCell traceId={row.original.trace_id} />,
  },
];

function AuditDiffPanel({ row }: { row: Row<AuditRowDto> }) {
  const json = JSON.stringify({ before: row.original.before, after: row.original.after }, null, 2);
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(json).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  }, [json]);
  return (
    <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
      <div className="flex items-center justify-between border-b border-hairline bg-surface-1 px-3 py-1.5">
        <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
          Payload diff
        </span>
        <Button variant="ghost" size="sm" onClick={onCopy} className="h-6 gap-1.5">
          <Copy className="size-3" />
          {copied ? 'Copied' : 'Copy JSON'}
        </Button>
      </div>
      <pre className="max-h-72 overflow-auto bg-canvas p-3 font-mono text-caption leading-relaxed text-ink">
        {json}
      </pre>
    </div>
  );
}

export function AdminAudit() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const pageSize = search.page_size ?? 25;
  const pageIndex = search.page_index ?? 0;

  const sorting: SortingState = useMemo(() => {
    if (!search.sort_by) return [];
    return [{ id: search.sort_by, desc: (search.sort_dir ?? 'desc') === 'desc' }];
  }, [search.sort_by, search.sort_dir]);

  const columnFilters: ColumnFiltersState = useMemo(() => {
    const filters: ColumnFiltersState = [];
    if (search.event_type) filters.push({ id: 'event_type', value: search.event_type });
    return filters;
  }, [search.event_type]);

  const pagination: PaginationState = { pageIndex, pageSize };
  const fromIso = search.from;
  const rangeSelected = fromIsoToRange(fromIso);

  const { data, isLoading } = useAuditEvents({
    event_type: search.event_type,
    from: fromIso,
    to: search.to,
    sort_by: search.sort_by,
    sort_dir: search.sort_dir,
    limit: pageSize,
    offset: pageIndex * pageSize,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = total === 0 ? 1 : Math.ceil(total / pageSize);

  const setEventType = (next: string | null) => {
    navigate({
      search: (prev) => ({ ...prev, event_type: next ?? undefined, page_index: undefined }),
    });
  };
  const setRange = (next: DateRange | null) => {
    navigate({
      search: (prev) => ({
        ...prev,
        from: rangeToFromIso(next),
        to: undefined,
        page_index: undefined,
      }),
    });
  };
  const onSortingChange = (updater: SortingState | ((s: SortingState) => SortingState)) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    const first = next[0];
    navigate({
      search: (prev) => ({
        ...prev,
        sort_by: (first?.id as 'occurred_at' | 'event_type' | undefined) ?? undefined,
        sort_dir: first ? (first.desc ? 'desc' : 'asc') : undefined,
        page_index: undefined,
      }),
    });
  };
  const onPaginationChange = (
    updater: PaginationState | ((p: PaginationState) => PaginationState),
  ) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    navigate({
      search: (prev) => ({
        ...prev,
        page_index: next.pageIndex > 0 ? next.pageIndex : undefined,
        page_size: next.pageSize === 25 ? undefined : next.pageSize,
      }),
    });
  };

  const subtitle =
    total > 0
      ? `${total.toLocaleString()} ${total === 1 ? 'event' : 'events'}`
      : isLoading
        ? 'Loading…'
        : 'No events';

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Audit log"
      subtitle={subtitle}
      toolbar={
        <PageChromeToolbar
          left={
            <>
              <FilterPill
                label="Event"
                value={search.event_type ?? null}
                options={EVENT_TYPE_OPTIONS}
                onChange={setEventType}
                anyLabel="All events"
              />
              <FilterPill<DateRange>
                label="Range"
                value={rangeSelected}
                options={DATE_RANGE_OPTIONS}
                onChange={setRange}
                anyLabel="All time"
              />
            </>
          }
          right={
            <div className="relative w-72">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle"
              />
              <Input
                placeholder="Search trace id…"
                className="h-8 pl-8 text-body-sm"
                disabled
                aria-label="Search trace id (coming soon)"
              />
            </div>
          }
        />
      }
    >
      <div className="px-6 py-4">
        <DataTable
          mode="server"
          data={rows}
          columns={columns}
          isLoading={isLoading}
          sorting={sorting}
          onSortingChange={onSortingChange}
          columnFilters={columnFilters}
          onColumnFiltersChange={() => undefined}
          globalFilter=""
          onGlobalFilterChange={() => undefined}
          pagination={pagination}
          onPaginationChange={onPaginationChange}
          pageCount={pageCount}
          rowCount={total}
          enableExpansion
          enableGlobalFilter={false}
          enableColumnVisibility={false}
          getRowCanExpand={() => true}
          renderSubComponent={({ row }) => <AuditDiffPanel row={row} />}
        />
      </div>
    </PageChrome>
  );
}
