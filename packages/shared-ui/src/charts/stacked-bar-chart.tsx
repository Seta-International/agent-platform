import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartEmpty } from './chart-empty';
import {
  CHART_AXIS_STROKE,
  CHART_CURSOR_FILL,
  CHART_GRID_STROKE,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
} from './chart-theme';

export interface BarSeries {
  /** Field on each row holding this series' numeric value. */
  key: string;
  /** Human label (legend + tooltip). */
  name: string;
  color: string;
}

export interface StackedBarRow {
  label: string;
  [series: string]: string | number;
}

export interface StackedBarChartProps {
  rows: StackedBarRow[];
  series: BarSeries[];
  /** Width reserved for the category labels on the Y axis. */
  labelWidth?: number;
}

/** Generic horizontal stacked bar chart. Series-driven — pass any set of
 * numeric series; no domain coupling. Height grows with row count. */
export function StackedBarChart({ rows, series, labelWidth = 120 }: StackedBarChartProps) {
  if (rows.length === 0) return <ChartEmpty />;
  const height = Math.max(160, rows.length * 40 + 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={CHART_GRID_STROKE} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={CHART_TICK}
          stroke={CHART_AXIS_STROKE}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          tick={CHART_TICK}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_CURSOR_FILL }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="stack" fill={s.color} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
