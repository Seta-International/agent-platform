import {
  Badge,
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
  Selector,
  Skeleton,
  StatusDot,
  type StatusDotVariant,
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
import { AdminPageFrame } from '../../components/AdminPageFrame.tsx';
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

const TONE_VARIANT: Record<ReturnType<typeof eventTone>, StatusDotVariant> = {
  success: 'success',
  danger: 'error',
  warning: 'warning',
  primary: 'accent',
  info: 'neutral',
};

const TONE_LABEL: Record<ReturnType<typeof eventTone>, string> = {
  success: 'Created',
  danger: 'Removed',
  warning: 'Changed',
  primary: 'Access change',
  info: 'Other',
};

function EventTypeCell({ eventType }: { eventType: string }) {
  const tone = eventTone(eventType);
  return (
    <HStack gap={2} vAlign="center">
      <StatusDot variant={TONE_VARIANT[tone]} label={TONE_LABEL[tone]} />
      <Text type="code">{eventType}</Text>
    </HStack>
  );
}

function ActorCell({ actor }: { actor: AuditRowDto['actor'] }) {
  const kind = deriveActorKind(actor);
  const label = actorLabel(actor);
  return (
    <HStack gap={2} vAlign="center">
      <Badge
        variant="neutral"
        className="font-mono" // keep: mono has no Badge prop (sanctioned exception, see EntraProviderCard.tsx)
        label={kind}
      />
      <Text
        color="secondary"
        className="truncate" // keep: no Text prop for text-overflow truncation
      >
        {label}
      </Text>
    </HStack>
  );
}

function TraceCell({ traceId }: { traceId: string | null }) {
  if (!traceId) return <Text color="disabled">{'\u2014'}</Text>;
  return (
    <Text type="code" size="sm" color="secondary">
      {traceId.slice(0, 12)}…
    </Text>
  );
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
        <VStack gap={0}>
          <Text type="code">{w.absolute}</Text>
          <Text type="supporting" color="secondary">
            {w.relative}
          </Text>
        </VStack>
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
    <VStack
      gap={0}
      // keep: this is the JSON code-viewer itself (not a settings/list "card"), so it keeps
      // a container boundary via tokens instead of the removed Card-around-a-form idiom.
      style={{
        overflow: 'hidden',
        borderRadius: 'var(--radius-container)',
        border: '1px solid var(--color-border)',
      }}
    >
      <HStack
        hAlign="between"
        vAlign="center"
        gap={2}
        style={{
          paddingInline: 'var(--spacing-3)',
          paddingBlock: 'var(--spacing-1.5)',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-background-surface)',
        }}
      >
        <Text
          type="supporting"
          weight="medium"
          color="secondary"
          className="uppercase tracking-[0.04em]" // keep: no Text prop for letter-spacing/uppercase
        >
          Payload diff
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          icon={<Copy className="size-3" />}
          label={copied ? 'Copied' : 'Copy JSON'}
        />
      </HStack>
      <Text
        type="code"
        display="block"
        style={{
          maxHeight: '18rem',
          overflow: 'auto',
          padding: 'var(--spacing-3)',
          whiteSpace: 'pre',
        }}
      >
        {json}
      </Text>
    </VStack>
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
    <AdminPageFrame
      crumb="Audit log"
      title="Audit log"
      subtitle={subtitle}
      isFullWidth
      subheader={
        <Toolbar
          label="Audit log filters"
          size="sm"
          dividers={['bottom']}
          startContent={
            <>
              <Selector
                label="Event"
                isLabelHidden
                size="sm"
                placeholder="All events"
                hasClear
                options={[...EVENT_TYPE_OPTIONS]}
                value={search.event_type ?? null}
                onChange={setEventType}
              />
              <Selector
                label="Range"
                isLabelHidden
                size="sm"
                placeholder="All time"
                hasClear
                options={[...DATE_RANGE_OPTIONS]}
                value={rangeSelected}
                onChange={(v) => setRange(v as DateRange | null)}
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
              width={288}
            />
          }
        />
      }
    >
      {isLoading ? (
        <VStack gap={2}>
          {['s0', 's1', 's2', 's3', 's4'].map((id) => (
            <Skeleton key={id} height={44} />
          ))}
        </VStack>
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

      {/* Payload-diff detail drawer — the row-expansion replacement. */}
      <Dialog
        isOpen={detailRow !== null}
        onOpenChange={(o) => {
          if (!o) setDetailRow(null);
        }}
        purpose="info"
        position={{ top: 0, end: 0, bottom: 0 }}
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
          content={<LayoutContent>{detailRow && <AuditDiffPanel row={detailRow} />}</LayoutContent>}
        />
      </Dialog>
    </AdminPageFrame>
  );
}
