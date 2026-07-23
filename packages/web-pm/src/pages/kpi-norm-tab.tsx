import {
  KPI_EXECUTIVE_MATRIX_WARNING,
  KPI_EXECUTIVE_METRICS,
  KPI_METHODOLOGY_LENS,
  type KpiReferenceMetric,
} from '@seta/pm/contracts';
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
    <div className="grid grid-cols-12 gap-3 border-b border-border py-3 text-sm last:border-0">
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
// infer Green/Amber/Red purely from the text colours below.
function BandColumnHeader() {
  return (
    <div className="grid grid-cols-12 gap-3 border-b border-border px-3 py-1.5 text-xs uppercase tracking-wide">
      <div className="col-span-4" />
      <div className="col-span-2 text-success">Green</div>
      <div className="col-span-2 text-warning">Amber</div>
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
      <div className="rounded-md border border-border">
        <BandColumnHeader />
        {core.length > 0 ? (
          <>
            <div className="border-b border-border bg-surface px-3 py-1.5 text-xs uppercase tracking-wide text-secondary">
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
            <div className="border-y border-border bg-surface px-3 py-1.5 text-xs uppercase tracking-wide text-secondary">
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

// Reference rows (Methodology lens, Executive): prose thresholds, so no direction arrow and no
// Live/Applied chips — those only make sense for measurable norm metrics.
function ReferenceRow({ metric }: { metric: KpiReferenceMetric }) {
  return (
    <div className="grid grid-cols-12 gap-3 border-b border-border py-3 text-sm last:border-0">
      <div className="col-span-4">
        <div className="font-medium text-primary">{metric.name}</div>
        <div className="text-xs text-secondary">{metric.formula_label}</div>
      </div>
      <div className="col-span-2 text-success">{metric.green_label}</div>
      <div className="col-span-2 text-warning">{metric.yellow_label}</div>
      <div className="col-span-2 text-error">{metric.red_label}</div>
      <div className="col-span-2 text-xs text-secondary">{metric.insight}</div>
    </div>
  );
}

function referenceMatches(metric: KpiReferenceMetric, q: string): boolean {
  return (
    q === '' ||
    metric.name.toLowerCase().includes(q) ||
    metric.formula_label.toLowerCase().includes(q)
  );
}

/** §5 of the norm: methodology-specific lenses on top of Core — never replacing it. */
function MethodologyLensSection({ q }: { q: string }) {
  const groups = KPI_METHODOLOGY_LENS.map((g) => ({
    ...g,
    metrics: g.metrics.filter((m) => referenceMatches(m, q)),
  })).filter((g) => g.metrics.length > 0);
  if (groups.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-base font-semibold text-primary">Methodology lens</h3>
        <span className="text-xs text-secondary">
          supplementary lens per methodology — does not replace Core
        </span>
      </div>
      <div className="rounded-md border border-border">
        <BandColumnHeader />
        {groups.map((g, i) => (
          <div key={g.id}>
            <div
              className={`${i === 0 ? 'border-b' : 'border-y'} border-border bg-surface px-3 py-1.5 text-xs uppercase tracking-wide text-secondary`}
            >
              {g.id} · {g.label}
            </div>
            <div className="px-3">
              {g.metrics.map((m) => (
                <ReferenceRow key={m.name} metric={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Quarterly engineering-health read: EQI × TDI and the 2×2 quadrant warning. */
function ExecutiveSection({ q }: { q: string }) {
  const metrics = KPI_EXECUTIVE_METRICS.filter((m) => referenceMatches(m, q));
  if (metrics.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-base font-semibold text-primary">Executive — Engineering Health</h3>
        <span className="text-xs text-secondary">quarterly · EQI / TDI → Executive Matrix 2×2</span>
      </div>
      <div className="rounded-md border border-border">
        <BandColumnHeader />
        <div className="px-3">
          {metrics.map((m) => (
            <ReferenceRow key={m.name} metric={m} />
          ))}
        </div>
        <p className="border-t border-border px-3 py-2.5 text-xs text-secondary">
          Most dangerous quadrant:{' '}
          <span className="font-semibold text-primary">
            {KPI_EXECUTIVE_MATRIX_WARNING.headline}
          </span>
          : {KPI_EXECUTIVE_MATRIX_WARNING.body} {KPI_EXECUTIVE_MATRIX_WARNING.other_quadrants}
        </p>
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
  const hasReferenceMatches =
    KPI_METHODOLOGY_LENS.some((g) => g.metrics.some((m) => referenceMatches(m, q))) ||
    KPI_EXECUTIVE_METRICS.some((m) => referenceMatches(m, q));

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
      {matches.length === 0 && !hasReferenceMatches ? (
        <EmptyState title={`No metrics match "${query.trim()}"`} />
      ) : (
        <>
          {KPI_CATEGORIES.map((cat) => {
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
          })}
          <MethodologyLensSection q={q} />
          <ExecutiveSection q={q} />
        </>
      )}
    </div>
  );
}
