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
  /** `right` renders a count + % legend column beside the ring. */
  legend?: 'none' | 'right';
  onSliceClick?: (slice: DonutSlice) => void;
}

/** Generic donut/ring chart. Slice-driven — no domain coupling. */
export function DonutChart({
  slices,
  centerValue,
  centerLabel,
  height = 220,
  legend = 'none',
  onSliceClick,
}: DonutChartProps) {
  const visible = slices.filter((s) => s.value > 0);
  if (visible.length === 0) return <ChartEmpty />;
  const total = slices.reduce((a, s) => a + s.value, 0);
  const clickable = Boolean(onSliceClick);

  const ring = (
    <div className="relative" style={{ width: legend === 'right' ? 220 : '100%' }}>
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
              <Cell
                key={s.key}
                fill={s.color}
                cursor={clickable ? 'pointer' : undefined}
                onClick={onSliceClick ? () => onSliceClick(s) : undefined}
              />
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

  if (legend !== 'right') return ring;

  return (
    <div className="flex flex-wrap items-center gap-6">
      {ring}
      <ul className="flex min-w-40 flex-1 flex-col gap-2">
        {slices.map((s) => {
          const pct = total ? Math.round((s.value / total) * 100) : 0;
          const body = (
            <>
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: s.color }}
              />
              <span className="text-ink">{s.name}</span>
              <span className="ml-auto font-medium tabular-nums text-ink">{s.value}</span>
              <span className="w-9 text-right tabular-nums text-ink-subtle">{pct}%</span>
            </>
          );
          return (
            <li key={s.key}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSliceClick?.(s)}
                  className="flex w-full items-center gap-2 text-body-sm hover:opacity-80"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-2 text-body-sm">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
