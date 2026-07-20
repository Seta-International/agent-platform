import { useState } from 'react';
import type { BandCondition, KpiCategory, KpiNormDoc, KpiNormMetricRow } from '../api/pm-client.ts';
import { Badge, EmptyState, Input, Skeleton } from './_ui-compat.tsx';
import {
  formatBandTriple,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  KPI_OHS_WEIGHTS,
} from './kpi-shared.tsx';

// Direction is not a stored column — it is implied by which side of the scale Green sits on,
// so deriving it from the green band can never disagree with the thresholds shown next to it.
type Direction = 'higher' | 'lower' | 'range';
function greenDirection(band: BandCondition): Direction {
  switch (band.op) {
    case 'gte':
    case 'gt':
      return 'higher';
    case 'lte':
    case 'lt':
      return 'lower';
    default:
      // between/eq and composite bands: Green is a window, not an endpoint.
      return 'range';
  }
}
const DIRECTION_LABEL: Record<Direction, string> = {
  higher: '↑ Higher is better',
  lower: '↓ Lower is better',
  range: '↔ Target range',
};

// The Core/Extended band header above each block already states the tier, so rows don't
// repeat it as a badge — only the per-metric facts (Live column, Applied) earn a chip.
function MetricRow({ metric, applied }: { metric: KpiNormMetricRow; applied: boolean }) {
  const bands = formatBandTriple(
    metric.name,
    metric.component_count,
    metric.green_band,
    metric.yellow_band,
    metric.red_band,
  );
  return (
    <div className="grid grid-cols-12 gap-3 border-b border-hairline py-3 text-sm last:border-0">
      <div className="col-span-4">
        <div className="flex items-center gap-2 font-medium text-primary">
          {metric.name}
          {metric.is_live_capable ? (
            <Badge variant="outline" className="font-normal">
              Live column
            </Badge>
          ) : null}
          {applied ? (
            <Badge variant="success" className="font-normal">
              Applied
            </Badge>
          ) : null}
        </div>
        <div className="text-xs text-secondary">
          {metric.formula_label}
          <span className="whitespace-nowrap">
            {' · '}
            {DIRECTION_LABEL[greenDirection(metric.green_band)]}
          </span>
        </div>
      </div>
      <div className="col-span-2 text-success">{bands.green}</div>
      <div className="col-span-2 text-warning">{bands.yellow}</div>
      <div className="col-span-2 text-error">{bands.red}</div>
      <div className="col-span-2 text-xs text-secondary">{metric.insight}</div>
    </div>
  );
}

// Labels the three threshold columns once per card — without it a first-time reader has to
// infer Green/Yellow/Red purely from the text colours below.
function BandColumnHeader() {
  return (
    <div className="grid grid-cols-12 gap-3 border-b border-hairline px-3 py-1.5 text-xs uppercase tracking-wide">
      <div className="col-span-4" />
      <div className="col-span-2 text-success">Green</div>
      <div className="col-span-2 text-warning">Yellow</div>
      <div className="col-span-2 text-error">Red</div>
      <div className="col-span-2 text-secondary">Insight</div>
    </div>
  );
}

function CategorySection({
  category,
  metrics,
  appliedIds,
}: {
  category: KpiCategory;
  metrics: KpiNormMetricRow[];
  appliedIds: Set<string>;
}) {
  const core = metrics.filter((m) => m.tier === 'core');
  const extended = metrics.filter((m) => m.tier === 'extended');
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-base font-semibold text-primary">{KPI_CATEGORY_LABELS[category]}</h3>
        <span className="text-xs text-secondary">
          {Math.round(KPI_OHS_WEIGHTS[category] * 100)}% of OHS
        </span>
      </div>
      <div className="rounded-md border border-hairline">
        <BandColumnHeader />
        {core.length > 0 ? (
          <>
            <div className="border-b border-hairline bg-surface-1 px-3 py-1.5 text-xs uppercase tracking-wide text-secondary">
              Core — mandatory, measured monthly · feeds OHS
            </div>
            <div className="px-3">
              {core.map((m) => (
                <MetricRow key={m.metric_id} metric={m} applied={appliedIds.has(m.metric_id)} />
              ))}
            </div>
          </>
        ) : null}
        {extended.length > 0 ? (
          <>
            <div className="border-y border-hairline bg-surface-1 px-3 py-1.5 text-xs uppercase tracking-wide text-secondary">
              Extended — contextual · not part of OHS
            </div>
            <div className="px-3">
              {extended.map((m) => (
                <MetricRow key={m.metric_id} metric={m} applied={appliedIds.has(m.metric_id)} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function KpiNormTab({
  norm,
  appliedIds,
  isLoading,
}: {
  norm: KpiNormDoc | null;
  appliedIds: Set<string>;
  isLoading: boolean;
}) {
  const [query, setQuery] = useState('');
  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!norm) {
    return <EmptyState title="The KPI Norm has not been set up for this tenant yet" />;
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? norm.metrics.filter(
        (m) => m.name.toLowerCase().includes(q) || m.formula_label.toLowerCase().includes(q),
      )
    : norm.metrics;

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-secondary">
          {norm.code} · {norm.revision} · Owner PMO
          {norm.effective_date ? ` · Effective ${norm.effective_date}` : ''}
        </p>
        <Input
          value={query}
          onChange={setQuery}
          placeholder="Search metrics by name or formula…"
          className="w-72"
        />
      </div>
      {matches.length === 0 ? (
        <EmptyState title={`No metrics match "${query.trim()}"`} />
      ) : (
        KPI_CATEGORIES.map((cat) => {
          const inCategory = matches.filter((m) => m.category === cat);
          if (inCategory.length === 0) return null;
          return (
            <CategorySection
              key={cat}
              category={cat}
              metrics={inCategory}
              appliedIds={appliedIds}
            />
          );
        })
      )}
    </div>
  );
}
