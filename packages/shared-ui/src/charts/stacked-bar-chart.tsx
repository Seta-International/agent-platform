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
  /** `vertical` = columns (category on X); `horizontal` = bars (category on Y). */
  orientation?: 'horizontal' | 'vertical';
  /** Width reserved for the category labels on the Y axis (horizontal only). */
  labelWidth?: number;
  height?: number;
  /** Called when a stacked segment is clicked, with its row + the series key. */
  onSegmentClick?: (row: StackedBarRow, seriesKey: string) => void;
}

/** Generic stacked bar chart. Series-driven — pass any set of numeric series;
 * no domain coupling. Vertical (columns) or horizontal (bars). */
export function StackedBarChart({
  rows,
  series,
  orientation = 'horizontal',
  labelWidth = 120,
  height,
  onSegmentClick,
}: StackedBarChartProps) {
  if (rows.length === 0) return <ChartEmpty />;
  const vertical = orientation === 'vertical';
  const h = height ?? (vertical ? 260 : Math.max(160, rows.length * 40 + 40));
  const clickable = Boolean(onSegmentClick);

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart
        data={rows}
        layout={vertical ? 'horizontal' : 'vertical'}
        margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
      >
        <CartesianGrid horizontal={vertical} vertical={!vertical} stroke={CHART_GRID_STROKE} />
        {vertical ? (
          <>
            <XAxis
              type="category"
              dataKey="label"
              tick={CHART_TICK}
              stroke={CHART_AXIS_STROKE}
              tickLine={false}
              interval={0}
            />
            <YAxis
              type="number"
              allowDecimals={false}
              tick={CHART_TICK}
              stroke={CHART_AXIS_STROKE}
              tickLine={false}
              axisLine={false}
            />
          </>
        ) : (
          <>
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
          </>
        )}
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: CHART_CURSOR_FILL }} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="stack"
            fill={s.color}
            cursor={clickable ? 'pointer' : undefined}
            onClick={
              onSegmentClick
                ? (_entry: unknown, index: number) => {
                    const row = rows[index];
                    if (row) onSegmentClick(row, s.key);
                  }
                : undefined
            }
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
