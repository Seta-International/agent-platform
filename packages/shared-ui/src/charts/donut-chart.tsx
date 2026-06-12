import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartEmpty } from './chart-empty';
import { CHART_TOOLTIP_STYLE } from './chart-theme';

export interface DonutSlice {
  key: string;
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  slices: DonutSlice[];
  /** Big number shown in the ring centre (e.g. a total). */
  centerValue?: number | string;
  /** Caption under the centre value. */
  centerLabel?: string;
  height?: number;
}

/** Generic donut/ring chart. Slice-driven — no domain coupling. */
export function DonutChart({ slices, centerValue, centerLabel, height = 220 }: DonutChartProps) {
  const visible = slices.filter((s) => s.value > 0);
  if (visible.length === 0) return <ChartEmpty />;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={visible}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={2}
            stroke="var(--color-canvas)"
            strokeWidth={2}
          >
            {visible.map((s) => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value, name) => [String(value ?? 0), String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerValue !== undefined && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-ink">{centerValue}</span>
          {centerLabel && <span className="text-xs text-ink-subtle">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
