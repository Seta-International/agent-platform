import type { StatusBreakdown } from '@seta/planner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartEmpty } from './chart-empty';
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from './chart-status';

export type StackedRow = { label: string } & StatusBreakdown;

export function StackedStatusBarChart({ rows }: { rows: StackedRow[] }) {
  if (rows.length === 0) return <ChartEmpty />;
  const height = Math.max(160, rows.length * 40 + 48);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={120} tickLine={false} />
        <Tooltip />
        <Legend />
        {STATUS_ORDER.map((k) => (
          <Bar key={k} dataKey={k} name={STATUS_LABEL[k]} stackId="status" fill={STATUS_COLOR[k]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
