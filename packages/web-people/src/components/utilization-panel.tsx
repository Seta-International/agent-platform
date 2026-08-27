import { Card, EmptyState, Input, PaginationFooter } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Gauge } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  type AllocationGridFilters,
  fetchUtilizationByPerson,
  type UtilizationByPerson,
  type UtilizationFilters,
  type UtilizationRow,
} from '../api/allocation-client.ts';
import { peopleKeys } from '../state/query-keys.ts';

// Stable, on-brand palette (brand #0047FF first); projects map to a color by sorted index.
const PALETTE = [
  '#0047FF',
  '#00A3A3',
  '#F59E0B',
  '#9333EA',
  '#16A34A',
  '#DC2626',
  '#0891B2',
  '#DB2777',
  '#4F46E5',
  '#EA580C',
  '#059669',
  '#7C3AED',
  '#D97706',
  '#E11D48',
  '#0284C7',
  '#65A30D',
  '#C026D3',
  '#2563EB',
  '#0D9488',
  '#475569',
  '#84CC16',
  '#991B1B',
  '#6366F1',
  '#CA8A04',
] as const;

const PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [PAGE_SIZE, 25, 50, 100];

function paletteColor(i: number): string {
  return PALETTE[i % PALETTE.length] ?? PALETTE[0];
}

function formatPct(val: number): string {
  const rounded = Math.round(val * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded.toFixed(2).replace(/\.?0+$/, '')}`;
}

// Stable, unique keys for a worker's segments — a worker may hold two active
// allocations to the same project, so disambiguate by per-project occurrence.
function segmentKeys(
  segments: UtilizationRow['segments'],
): Array<{ key: string; seg: UtilizationRow['segments'][number] }> {
  const seen = new Map<string, number>();
  return segments.map((seg) => {
    const n = (seen.get(seg.project_id) ?? 0) + 1;
    seen.set(seg.project_id, n);
    return { key: `${seg.project_id}#${n}`, seg };
  });
}

export function UtilizationPanel({
  filters,
  crossProject = false,
}: {
  filters?: AllocationGridFilters;
  crossProject?: boolean;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const effectiveFilters = useMemo<UtilizationFilters>(
    () => ({
      ...(filters ?? {}),
      ...(crossProject || filters?.crossProject ? { crossProject: true } : {}),
    }),
    [filters, crossProject],
  );

  const { data, isLoading, error } = useQuery<UtilizationByPerson>({
    queryKey: peopleKeys.allocationUtilization(effectiveFilters),
    queryFn: () => fetchUtilizationByPerson(effectiveFilters),
  });

  // Reset page when filters change
  // biome-ignore lint/correctness/useExhaustiveDependencies: effectiveFilters is the intentional reset trigger
  useEffect(() => {
    setPage(1);
  }, [effectiveFilters]);

  const colorByProject = useMemo(() => {
    const ids = [
      ...new Set((data?.rows ?? []).flatMap((r) => r.segments.map((s) => s.project_id))),
    ].sort();
    const m = new Map<string, string>();
    ids.forEach((id, i) => {
      m.set(id, paletteColor(i));
    });
    return m;
  }, [data]);

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return q
      ? rows.filter(
          (r) =>
            r.full_name.toLowerCase().includes(q) ||
            r.worker_id.toLowerCase().includes(q) ||
            (r.employee_no?.toLowerCase().includes(q) ?? false),
        )
      : rows;
  }, [data, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Utilization by person</h3>
        <Input
          label="Search name or employee ID"
          isLabelHidden
          className="w-56"
          size="sm"
          placeholder="Search name or employee ID…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
      </div>

      {error ? (
        <div className="text-base text-[color:var(--color-error)]">{(error as Error).message}</div>
      ) : isLoading ? (
        <div className="text-base text-secondary">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Gauge className="size-6" />}
          title="No utilization"
          description="No one is currently allocated in your view."
        />
      ) : (
        <>
          <div className="space-y-3">
            {slice.map((r: UtilizationRow) => {
              const isOver = r.total_pct > 100;
              const denominator = isOver && r.total_pct > 0 ? r.total_pct : 100;
              const free = r.total_pct < 100 ? 100 - r.total_pct : 0;
              const barTotal = Math.min(r.total_pct, 100);
              return (
                <button
                  key={r.worker_id}
                  type="button"
                  className="block w-full text-left"
                  onClick={() =>
                    void navigate({
                      to: '/people/employees/$workerId',
                      params: { workerId: r.worker_id },
                    })
                  }
                >
                  {/* Line 1: Project segments above the bar, structurally aligned with the bar */}
                  <div className="flex items-start gap-3">
                    <div className="w-40 shrink-0" aria-hidden="true" />
                    <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {r.segments.map((seg) => {
                        const segShare = (seg.pct / denominator) * 100;
                        return (
                          <span
                            key={seg.project_id}
                            className="inline-flex items-center gap-1.5 text-secondary"
                          >
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{
                                background: colorByProject.get(seg.project_id) ?? PALETTE[0],
                              }}
                              aria-hidden="true"
                            />
                            <span className="font-medium text-primary">
                              {seg.project_name ?? '—'}
                            </span>
                            <span>{formatPct(segShare)}%</span>
                          </span>
                        );
                      })}
                      {free > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-secondary">
                          <span
                            className="size-2 shrink-0 rounded-full bg-[var(--color-border-emphasized)]"
                            aria-hidden="true"
                          />
                          <span className="font-medium text-primary">Idle</span>
                          <span>{formatPct(free)}%</span>
                        </span>
                      )}
                    </div>
                    <div className="w-16 shrink-0" aria-hidden="true" />
                  </div>

                  {/* Line 2: Worker Name + Bar + Total % on the same line */}
                  <div className="mt-1 flex items-center gap-3">
                    <span
                      className="w-40 shrink-0 truncate text-base font-medium"
                      title={r.full_name}
                    >
                      {r.full_name}
                    </span>
                    <span className="flex h-3 flex-1 overflow-hidden rounded-full bg-[var(--color-background-gray)]">
                      {segmentKeys(r.segments).map(({ key, seg }) => {
                        const segShare = (seg.pct / denominator) * 100;
                        return (
                          <span
                            key={key}
                            style={{
                              width: `${Math.min(segShare, 100)}%`,
                              background: colorByProject.get(seg.project_id) ?? PALETTE[0],
                            }}
                            title={`${seg.project_name ?? '—'} · ${formatPct(segShare)}%`}
                          />
                        );
                      })}
                      {free > 0 && (
                        <span
                          style={{
                            width: `${free}%`,
                            background: 'var(--color-background-gray)',
                          }}
                          title={`Idle · ${formatPct(free)}%`}
                        />
                      )}
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-sm text-secondary">
                      {formatPct(barTotal)}%
                    </span>
                  </div>

                  {/* Line 3: Billable split below, structurally aligned with the bar */}
                  <div className="mt-0.5 flex items-start gap-3">
                    <div className="w-40 shrink-0" aria-hidden="true" />
                    <div className="flex-1 text-xs text-secondary">
                      billable {formatPct(r.split.billable)}% · internal{' '}
                      {formatPct(r.split.internal)}% · bench {formatPct(r.split.bench)}%
                    </div>
                    <div className="w-16 shrink-0" aria-hidden="true" />
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 items-center text-base text-secondary">
            <span>{filtered.length} people</span>
            <div className="flex justify-center">
              <PaginationFooter
                page={safePage}
                onChange={setPage}
                totalItems={filtered.length}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageSizeChange={(ps) => {
                  setPageSize(ps);
                  setPage(1);
                }}
                variant="compact"
                size="sm"
                label="Utilization pages"
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
