import {
  KPI_EXECUTIVE_MATRIX_WARNING,
  KPI_EXECUTIVE_METRICS,
  KPI_METHODOLOGY_LENS,
  type KpiReferenceMetric,
} from '@seta/pm/contracts';
import { useState } from 'react';
import type { KpiCategory, KpiNormDoc, KpiNormMetricRow } from '../api/pm-client.ts';
import { Badge, EmptyState, Heading, Input, Skeleton } from './_ui-compat.tsx';
import {
  formatBandTriple,
  KPI_CATEGORIES,
  KPI_CATEGORY_LABELS,
  KPI_OHS_WEIGHTS,
  metricUnit,
} from './kpi-shared.tsx';

const ROW_GRID = 'grid-cols-[4fr_2fr_2fr_2fr_4fr]';

const SECTION_HEADING = 'sticky top-0 z-10 flex items-baseline gap-2 bg-card py-2';

function MetricRow({ metric }: { metric: KpiNormMetricRow }) {
  const bands = formatBandTriple(
    metric.name,
    metric.component_count,
    metric.green_band,
    metric.yellow_band,
    metric.red_band,
  );
  const unit = metricUnit(metric.name, metric.component_count, metric.component_1_label);
  return (
    <div className={`grid ${ROW_GRID} min-h-16 gap-3 border-b border-border py-3 last:border-0`}>
      <div>
        <div className="flex flex-wrap items-center gap-2 text-base font-medium text-primary">
          {metric.name}
          <Badge variant="outline" className="font-normal">
            {unit}
          </Badge>
        </div>
        <div className="text-sm text-secondary">{metric.formula_label}</div>
      </div>
      <div className="text-sm tabular-nums text-success">{bands.green}</div>
      <div className="text-sm tabular-nums text-warning">{bands.yellow}</div>
      <div className="text-sm tabular-nums text-error">{bands.red}</div>
      <div className="text-sm text-secondary">{metric.insight}</div>
    </div>
  );
}

function BandColumnHeader() {
  return (
    <div className={`grid ${ROW_GRID} gap-3 border-b border-border px-3 py-1.5 text-base`}>
      <div>Metric</div>
      <div className="text-success">Green</div>
      <div className="text-warning">Amber</div>
      <div className="text-error">Red</div>
      <div className="text-secondary">Insight</div>
    </div>
  );
}

function CategorySection({
  category,
  metrics,
}: {
  category: KpiCategory;
  metrics: KpiNormMetricRow[];
}) {
  const core = metrics.filter((m) => m.tier === 'core');
  const extended = metrics.filter((m) => m.tier === 'extended');
  return (
    <section className="space-y-2">
      <div className={SECTION_HEADING}>
        <Heading level={3}>{KPI_CATEGORY_LABELS[category]}</Heading>
        <span className="text-sm text-secondary">
          {metrics.length} metric{metrics.length === 1 ? '' : 's'} ·{' '}
          {Math.round(KPI_OHS_WEIGHTS[category] * 100)}% of OHS
        </span>
      </div>
      {metrics.length === 0 ? (
        <EmptyState title="No metrics in this area yet." />
      ) : (
        <div className="rounded-md border border-border">
          <BandColumnHeader />
          {core.length > 0 ? (
            <>
              <div className="border-b border-border bg-surface px-3 py-1.5 text-xs uppercase tracking-wide text-secondary">
                Core — mandatory, measured monthly · feeds OHS
              </div>
              <div className="px-3">
                {core.map((m) => (
                  <MetricRow key={m.metric_id} metric={m} />
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
                  <MetricRow key={m.metric_id} metric={m} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ReferenceRow({ metric }: { metric: KpiReferenceMetric }) {
  return (
    <div className={`grid ${ROW_GRID} min-h-16 gap-3 border-b border-border py-3 last:border-0`}>
      <div>
        <div className="text-base font-medium text-primary">{metric.name}</div>
        <div className="text-sm text-secondary">{metric.formula_label}</div>
      </div>
      <div className="text-sm tabular-nums text-success">{metric.green_label}</div>
      <div className="text-sm tabular-nums text-warning">{metric.yellow_label}</div>
      <div className="text-sm tabular-nums text-error">{metric.red_label}</div>
      <div className="text-sm text-secondary">{metric.insight}</div>
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
      <div className={SECTION_HEADING}>
        <Heading level={3}>Methodology lens</Heading>
        <span className="text-sm text-secondary">
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
      <div className={SECTION_HEADING}>
        <Heading level={3}>Executive — Engineering Health</Heading>
        <span className="text-sm text-secondary">quarterly · EQI / TDI → Executive Matrix 2×2</span>
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

export function KpiNormTab({ norm, isLoading }: { norm: KpiNormDoc | null; isLoading: boolean }) {
  const [query, setQuery] = useState('');
  if (isLoading) {
    return (
      <div className="space-y-3 pb-4">
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
    <div className="max-w-7xl space-y-6 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={query}
          onChange={setQuery}
          placeholder="Search metrics…"
          className="max-w-xs flex-1"
        />
        <p className="text-xs text-secondary">
          {norm.code} · {norm.revision} · Owner PMO
          {norm.effective_date ? ` · Effective ${norm.effective_date}` : ''}
        </p>
      </div>
      {matches.length === 0 && !hasReferenceMatches ? (
        <EmptyState title={`No metrics match "${query.trim()}"`} />
      ) : (
        <>
          {KPI_CATEGORIES.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              metrics={matches.filter((m) => m.category === cat)}
            />
          ))}
          <MethodologyLensSection q={q} />
          <ExecutiveSection q={q} />
        </>
      )}
    </div>
  );
}
