import { Card, ChartLegend, EmptyState, Input, Pagination } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Gauge } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  fetchUtilizationByPerson,
  type UtilizationByPerson,
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
] as const;
const PAGE_SIZE = 15;

function paletteColor(i: number): string {
  return PALETTE[i % PALETTE.length] ?? PALETTE[0];
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

export function UtilizationPanel({ crossProject = false }: { crossProject?: boolean }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery<UtilizationByPerson>({
    queryKey: peopleKeys.allocationUtilization(crossProject),
    queryFn: () => fetchUtilizationByPerson({ crossProject: crossProject || undefined }),
  });

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

  const legendItems = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of data?.rows ?? []) {
      for (const s of r.segments) {
        if (!seen.has(s.project_id)) seen.set(s.project_id, s.project_name ?? '—');
      }
    }
    return [...seen.entries()].map(([id, label]) => ({
      key: id,
      label,
      color: colorByProject.get(id) ?? PALETTE[0],
    }));
  }, [data, colorByProject]);

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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
          {legendItems.length > 0 && <ChartLegend items={legendItems} />}
          <div className="space-y-3">
            {slice.map((r: UtilizationRow) => {
              const free = r.total_pct < 100 ? 100 - r.total_pct : 0;
              const totalColor = r.over_allocated
                ? 'var(--color-error)'
                : r.total_pct >= 70
                  ? 'var(--color-success)'
                  : 'var(--color-warning)';
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
                  <div className="flex items-center gap-3">
                    <span
                      className="w-40 shrink-0 truncate text-base font-medium"
                      title={r.full_name}
                    >
                      {r.full_name}
                    </span>
                    <span className="flex h-3 flex-1 overflow-hidden rounded-full bg-surface">
                      {segmentKeys(r.segments).map(({ key, seg }) => (
                        <span
                          key={key}
                          style={{
                            width: `${Math.min(seg.pct, 100)}%`,
                            background: colorByProject.get(seg.project_id),
                          }}
                          title={`${seg.project_name ?? '—'} · ${seg.pct}%`}
                        />
                      ))}
                      {free > 0 && (
                        <span style={{ width: `${free}%` }} className="bg-transparent" />
                      )}
                    </span>
                    <span
                      className="w-16 shrink-0 text-right font-mono text-sm"
                      style={{ color: totalColor }}
                    >
                      {r.total_pct}%{r.over_allocated ? ' ⚠' : ''}
                    </span>
                  </div>
                  <div className="mt-0.5 pl-[172px] text-xs text-secondary">
                    billable {r.split.billable}% · internal {r.split.internal}% · bench{' '}
                    {r.split.bench}%
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-base text-secondary">
            <span>{filtered.length} people</span>
            <Pagination
              page={safePage}
              onChange={setPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              variant="compact"
            />
          </div>
        </>
      )}
    </Card>
  );
}
