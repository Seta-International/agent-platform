import {
  Badge,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Dialog,
  DialogHeader,
  EmptyState,
  FilterPill,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  pixel,
  proportional,
  Skeleton,
  Table,
  type TableColumn,
  type TableSortState,
  Text,
  Toolbar,
  useTablePagination,
  useTableSortable,
  VStack,
} from '@seta/shared-ui';
import { Copy, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { AuditRowDto } from '../api/audit-client.ts';
import { useAuditEvents } from '../hooks/queries/use-audit-events.ts';

// Astryx Table columns require `T extends Record<string, unknown>`; alias the
// DTO locally rather than modifying the shared type.
type AuditRow = AuditRowDto & Record<string, unknown>;

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
  danger: 'bg-error',
  warning: 'bg-warning',
  primary: 'bg-accent-bg',
  info: 'bg-disabled',
};

function EventTypeCell({ eventType }: { eventType: string }) {
  const tone = eventTone(eventType);
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
      <code className="font-mono text-body-sm text-primary">{eventType}</code>
    </div>
  );
}

function ActorCell({ actor }: { actor: AuditRowDto['actor'] }) {
  const kind = deriveActorKind(actor);
  const label = actorLabel(actor);
  return (
    <div className="flex items-center gap-2">
      <Badge variant="neutral" className="font-mono text-[10px]" label={kind} />
      <span className="truncate text-body-sm text-secondary">{label}</span>
    </div>
  );
}

function TraceCell({ traceId }: { traceId: string | null }) {
  if (!traceId) return <span className="text-disabled">{'\u2014'}</span>;
  return <code className="font-mono text-caption text-secondary">{traceId.slice(0, 12)}…</code>;
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

const columns: TableColumn<AuditRow>[] = [
  {
    key: 'occurred_at',
    header: 'When',
    sortable: true,
    width: pixel(180),
    renderCell: (r) => {
      const w = whenLabel(r.occurred_at);
      return (
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-body-sm text-primary">{w.absolute}</span>
          <span className="text-caption text-secondary">{w.relative}</span>
        </div>
      );
    },
  },
  {
    key: 'actor',
    header: 'Actor',
    width: proportional(2),
    renderCell: (r) => <ActorCell actor={r.actor} />,
  },
  {
    key: 'event_type',
    header: 'Event',
    sortable: true,
    width: proportional(2),
    renderCell: (r) => <EventTypeCell eventType={r.event_type} />,
  },
  {
    key: 'trace_id',
    header: 'Trace',
    width: pixel(160),
    renderCell: (r) => <TraceCell traceId={r.trace_id} />,
  },
];

function AuditDiffPanel({ row }: { row: AuditRowDto }) {
  const json = JSON.stringify({ before: row.before, after: row.after }, null, 2);
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
    <div className="overflow-hidden rounded-md border border-border bg-body">
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-1.5">
        <span className="text-eyebrow uppercase tracking-[0.04em] text-secondary">
          Payload diff
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          className="h-6 gap-1.5"
          icon={<Copy className="size-3" />}
          label={copied ? 'Copied' : 'Copy JSON'}
        />
      </div>
      <pre className="max-h-72 overflow-auto bg-body p-3 font-mono text-caption leading-relaxed text-primary">
        {json}
      </pre>
    </div>
  );
}

export interface AdminAuditSearch {
  event_type?: string;
  from?: string;
  to?: string;
  sort_by?: 'occurred_at' | 'event_type';
  sort_dir?: 'asc' | 'desc';
  page_size?: number;
  page_index?: number;
}

export function AdminAudit({
  search,
  onSearch,
}: {
  search: AdminAuditSearch;
  onSearch: (next: (prev: AdminAuditSearch) => AdminAuditSearch) => void;
}) {
  const pageSize = search.page_size ?? 25;
  const pageIndex = search.page_index ?? 0;

  // Detail drawer replaces the old inline row-expansion: Astryx's rowExpansion
  // plugin is a hierarchical (inherited-columns) model that can't render a
  // full-width detail panel, so the payload diff opens in a side drawer — the
  // brief-sanctioned restructure that keeps (and roomily improves) the
  // "expand to see the before/after" capability.
  const [detailRow, setDetailRow] = useState<AuditRow | null>(null);

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

  const rows = (data?.rows ?? []) as AuditRow[];
  const total = data?.total ?? 0;

  // Server sort state ↔ Astryx sort state (single-column).
  const sortState: TableSortState = search.sort_by
    ? [
        {
          sortKey: search.sort_by,
          direction: (search.sort_dir ?? 'desc') === 'desc' ? 'descending' : 'ascending',
        },
      ]
    : [];

  const sortable = useTableSortable<AuditRow>({
    sort: sortState,
    onSortChange: (next) => {
      const first = next[0];
      onSearch((prev) => ({
        ...prev,
        sort_by: (first?.sortKey as 'occurred_at' | 'event_type' | undefined) ?? undefined,
        sort_dir: first ? (first.direction === 'descending' ? 'desc' : 'asc') : undefined,
        page_index: undefined,
      }));
    },
  });

  const pagination = useTablePagination<AuditRow>({
    page: pageIndex + 1, // URL state is 0-based; the Astryx pager is 1-based.
    onPageChange: (p) =>
      onSearch((prev) => ({ ...prev, page_index: p - 1 > 0 ? p - 1 : undefined })),
    totalItems: total,
    pageSize,
    onPageSizeChange: (s) =>
      onSearch((prev) => ({
        ...prev,
        page_size: s === 25 ? undefined : s,
        page_index: undefined,
      })),
    pageSizeOptions: [10, 25, 50, 100],
  });

  const setEventType = (next: string | null) => {
    onSearch((prev) => ({ ...prev, event_type: next ?? undefined, page_index: undefined }));
  };
  const setRange = (next: DateRange | null) => {
    onSearch((prev) => ({
      ...prev,
      from: rangeToFromIso(next),
      to: undefined,
      page_index: undefined,
    }));
  };

  const subtitle =
    total > 0
      ? `${total.toLocaleString()} ${total === 1 ? 'event' : 'events'}`
      : isLoading
        ? 'Loading…'
        : 'No events';

  return (
    <Layout
      height="fill"
      header={
        <>
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/admin">Admin</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Audit log</BreadcrumbItem>
              </Breadcrumbs>
              <HStack hAlign="between" vAlign="center" gap={2}>
                <HStack gap={2} vAlign="center">
                  <Text as="h1" size="lg" weight="semibold">
                    Audit log
                  </Text>
                  {subtitle && <Text color="secondary">{subtitle}</Text>}
                </HStack>
              </HStack>
            </VStack>
          </LayoutHeader>
          <LayoutHeader padding={0}>
            <Toolbar
              label="Audit log filters"
              size="sm"
              dividers={['bottom']}
              startContent={
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
              endContent={
                <Input
                  label="Search trace id (coming soon)"
                  isLabelHidden
                  startIcon={<Search className="size-3.5" aria-hidden />}
                  placeholder="Search trace id…"
                  value=""
                  onChange={() => {}}
                  isDisabled
                  className="w-72"
                />
              }
            />
          </LayoutHeader>
        </>
      }
      content={
        <LayoutContent padding={0}>
          <div className="px-6 py-4">
            {isLoading ? (
              <div className="space-y-2">
                {['s0', 's1', 's2', 's3', 's4'].map((id) => (
                  <Skeleton key={id} height={44} />
                ))}
              </div>
            ) : (
              <Table
                data={rows}
                columns={columns}
                idKey="event_id"
                emptyState={<EmptyState title="No events" />}
                plugins={{
                  sortable,
                  pagination,
                  // Click a row to open its payload-diff detail drawer; ignore
                  // clicks originating from the row's own controls (e.g. the
                  // sortable header lives in <thead>, so only body cells trigger).
                  rowClick: {
                    transformBodyRow: (props, item) => ({
                      ...props,
                      htmlProps: {
                        ...props.htmlProps,
                        style: { ...props.htmlProps.style, cursor: 'pointer' },
                        onClick: (e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('button, a, input, label')) return;
                          setDetailRow(item);
                        },
                      },
                    }),
                  },
                }}
              />
            )}
          </div>

          {/* Payload-diff detail drawer — the row-expansion replacement. */}
          <Dialog
            isOpen={detailRow !== null}
            onOpenChange={(o) => {
              if (!o) setDetailRow(null);
            }}
            purpose="info"
            position={{ top: 0, right: 0, bottom: 0 }}
            width={640}
            maxHeight="100dvh"
            aria-label={detailRow ? `Event detail: ${detailRow.event_type}` : 'Event detail'}
          >
            <Layout
              header={
                <DialogHeader
                  title="Event detail"
                  subtitle={detailRow?.event_type}
                  onOpenChange={(o) => {
                    if (!o) setDetailRow(null);
                  }}
                />
              }
              content={
                <LayoutContent>{detailRow && <AuditDiffPanel row={detailRow} />}</LayoutContent>
              }
            />
          </Dialog>
        </LayoutContent>
      }
    />
  );
}
