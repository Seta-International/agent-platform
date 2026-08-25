import type { CSSProperties, ReactNode } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartEmpty } from './chart-empty';
import {
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
} from './chart-theme';

/** Marker glyph for a plotted point. Shape rather than colour, so it survives greyscale. */
export type TrendMarker = 'up' | 'down' | 'diamond' | 'dot';

export interface TrendLinePoint {
  /** X-axis category, e.g. "08/26". */
  label: string;
  /** Null draws no marker and breaks the line — the value is absent or withheld. */
  value: number | null;
  /**
   * Shades the whole column and labels it, for a slot that has data the chart may not
   * show. Distinct from a plain null, which is simply nothing to plot.
   */
  isWithheld?: boolean;
  /** Tooltip body for this point. Owned by the caller so wording stays in its domain. */
  tooltip?: ReactNode;
}

export interface TrendLineChartProps {
  points: TrendLinePoint[];
  /** Fixed Y range — a trend on a known scale must not rescale as the data moves. */
  domain: [number, number];
  ticks?: number[];
  /** Glyph per point. Default is a plain dot for everything. */
  markerFor?: (value: number) => TrendMarker;
  /** Word printed down the middle of a withheld column. */
  withheldLabel?: string;
  height?: number;
  /** Accessible summary of the whole series, for readers who never see the marks. */
  description?: string;
}

interface TrendRow {
  label: string;
  value: number | null;
  band: number | null;
  bandLabel: string;
  tooltip?: ReactNode;
}

const MARKER_SIZE = 6.5;
const LINE_COLOR = 'var(--color-accent)';

const TOOLTIP_BOX: CSSProperties = { ...CHART_TOOLTIP_STYLE, padding: '7px 10px' };

/** The four glyphs, drawn around (cx, cy) so every one reads at the same optical weight. */
function markerPath(marker: TrendMarker, cx: number, cy: number): ReactNode {
  const s = MARKER_SIZE;
  if (marker === 'dot') return <circle cx={cx} cy={cy} r={s * 0.8} fill={LINE_COLOR} />;
  if (marker === 'diamond') {
    return (
      <path
        d={`M${cx} ${cy - s} L${cx + s} ${cy} L${cx} ${cy + s} L${cx - s} ${cy} Z`}
        fill={LINE_COLOR}
      />
    );
  }
  if (marker === 'down') {
    return (
      <path
        d={`M${cx - s} ${cy - s * 0.75} L${cx + s} ${cy - s * 0.75} L${cx} ${cy + s} Z`}
        fill={LINE_COLOR}
      />
    );
  }
  return (
    <path
      d={`M${cx - s} ${cy + s * 0.75} L${cx + s} ${cy + s * 0.75} L${cx} ${cy - s} Z`}
      fill={LINE_COLOR}
    />
  );
}

/**
 * A line over a fixed scale, with slots the caller may not plot.
 *
 * Two things separate this from a plain line chart. The line **breaks** at a missing
 * point rather than bridging it — joining two months across a gap would draw a trend that
 * was never measured. And a withheld slot is shaded and named rather than left blank, so
 * a reader can tell "nothing to show" apart from "nothing happened".
 *
 * Data-agnostic: the caller supplies the scale, the glyph rule and the tooltip wording.
 */
export function TrendLineChart({
  points,
  domain,
  ticks,
  markerFor,
  withheldLabel = 'Hidden',
  height = 300,
  description,
}: TrendLineChartProps) {
  if (points.length === 0) return <ChartEmpty />;

  const rows: TrendRow[] = points.map((p) => ({
    label: p.label,
    value: p.value,
    // The band is a full-height bar behind the line; recharts sizes it to the category
    // slot, which is what keeps it aligned with the tick it belongs to.
    band: p.isWithheld ? domain[1] : null,
    bandLabel: p.isWithheld ? withheldLabel : '',
    tooltip: p.tooltip,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ left: 8, right: 16, top: 12, bottom: 4 }}>
        {description && <title>{description}</title>}
        <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} />
        <XAxis
          dataKey="label"
          tick={CHART_TICK}
          stroke={CHART_AXIS_STROKE}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={domain}
          ticks={ticks}
          tick={CHART_TICK}
          stroke={CHART_AXIS_STROKE}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <Bar
          dataKey="band"
          fill="var(--color-background-muted)"
          isAnimationActive={false}
          barSize={44}
          legendType="none"
        >
          <LabelList
            dataKey="bandLabel"
            position="center"
            fill="var(--color-text-secondary)"
            fontSize={11}
          />
        </Bar>
        <Line
          dataKey="value"
          type="linear"
          stroke={LINE_COLOR}
          strokeWidth={2}
          connectNulls={false}
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; index?: number; value?: number | null }) => {
            const { cx, cy, value, index } = props;
            // recharts wants an element back even for a point it will not draw.
            if (cx === undefined || cy === undefined || value === null || value === undefined) {
              return <g key={`empty-${index}`} />;
            }
            return <g key={`marker-${index}`}>{markerPath(markerFor?.(value) ?? 'dot', cx, cy)}</g>;
          }}
          activeDot={{ r: 9, fill: 'none', stroke: LINE_COLOR, strokeWidth: 2 }}
        />
        <Tooltip
          cursor={{ stroke: CHART_AXIS_STROKE, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as TrendRow | undefined;
            if (!active || !row?.tooltip) return null;
            return <div style={TOOLTIP_BOX}>{row.tooltip}</div>;
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
