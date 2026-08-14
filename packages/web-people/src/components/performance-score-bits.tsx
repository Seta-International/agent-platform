import { Card, HStack, Text, VStack } from '@seta/shared-ui';
import type { CSSProperties } from 'react';
import { SCORE_BAND_LEGEND, type ScoreBand, scoreBand } from '../lib/performance-scores.ts';

/** KPI stat tile shared across the capacity dashboards. */
export function KpiTile({
  label,
  value,
  hint,
  valueColor,
}: {
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
}) {
  const style: CSSProperties | undefined = valueColor ? { color: valueColor } : undefined;
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text size="2xs" color="secondary" className="uppercase tracking-wide">
          {label}
        </Text>
        <Text size="2xl" weight="semibold" className="tabular-nums leading-none" style={style}>
          {value}
        </Text>
        {hint ? (
          <Text size="xsm" color="secondary">
            {hint}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}

/** Saturated category tokens giving each pillar a stable identity colour. */
export const BULLET_TOKENS = ['blue', 'purple', 'teal', 'cyan', 'orange', 'pink', 'green'] as const;

/** Per-pillar identity colour (by column index), as a token var(). */
export function pillarColor(index: number): string {
  return `var(--color-text-${BULLET_TOKENS[index % BULLET_TOKENS.length]})`;
}

/** Band → text colour token (for a bare colored number, no fill). */
export function bandTextColor(band: ScoreBand): string {
  if (band === 'below') return 'var(--color-text-red)';
  if (band === 'meets') return 'var(--color-text-yellow)';
  return 'var(--color-text-green)';
}

/** Band → human label (Strong / Meets / Below). */
export function bandLabel(band: ScoreBand): string {
  return SCORE_BAND_LEGEND.find((b) => b.band === band)?.label ?? '';
}

/**
 * Band → fill + text, from theme tokens (no raw hex). `muted` renders the
 * strong band as neutral instead of green — used in dense score tables so a
 * column of high scores doesn't wash out to solid green.
 */
export function chipStyle(band: ScoreBand, muted: boolean): CSSProperties {
  if (band === 'below') {
    return { background: 'var(--color-background-red)', color: 'var(--color-text-red)' };
  }
  if (band === 'meets') {
    return { background: 'var(--color-background-yellow)', color: 'var(--color-text-yellow)' };
  }
  return muted
    ? { background: 'var(--color-background-muted)', color: 'var(--color-text-primary)' }
    : { background: 'var(--color-background-green)', color: 'var(--color-text-green)' };
}

/** Wide soft pill used in the AM heatmap cells (two-decimal, vivid bands). */
export function HeatCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-secondary text-sm tabular-nums">—</span>;
  return (
    <span
      className="block w-full rounded-lg px-4 py-2 text-center font-semibold text-sm tabular-nums"
      style={chipStyle(scoreBand(value), false)}
    >
      {value.toFixed(2)}
    </span>
  );
}

/** Compact chip used in the per-member / per-project score tables. */
export function ScoreChip({ value }: { value: number | null }) {
  if (value == null) return <span className="text-secondary text-sm tabular-nums">—</span>;
  return (
    <span
      className="inline-block min-w-12 rounded-md px-2 py-1 text-center font-semibold text-sm tabular-nums"
      style={chipStyle(scoreBand(value), true)}
    >
      {value.toFixed(1)}
    </span>
  );
}

export function BandLegend() {
  return (
    <HStack gap={3} vAlign="center" wrap="wrap">
      {SCORE_BAND_LEGEND.map((b) => (
        <HStack key={b.band} gap={1.5} vAlign="center">
          <span className="h-3 w-3 rounded-sm" style={chipStyle(b.band, false)} />
          <Text size="xsm" color="secondary">
            {b.label} <span className="tabular-nums">({b.range})</span>
          </Text>
        </HStack>
      ))}
    </HStack>
  );
}
