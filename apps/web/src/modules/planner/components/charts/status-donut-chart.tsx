import type { StatusBreakdown } from '@seta/planner';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartEmpty } from './chart-empty';
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, statusTotal } from './chart-status';

export function StatusDonutChart({ data }: { data: StatusBreakdown }) {
  const total = statusTotal(data);
  if (total === 0) return <ChartEmpty />;

  const slices = STATUS_ORDER.map((k) => ({
    key: k,
    name: STATUS_LABEL[k],
    value: data[k],
    color: STATUS_COLOR[k],
  })).filter((s) => s.value > 0);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
        >
          {slices.map((s) => (
            <Cell key={s.key} fill={s.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value, name) => [String(value ?? 0), String(name)]} />
      </PieChart>
    </ResponsiveContainer>
  );
}
