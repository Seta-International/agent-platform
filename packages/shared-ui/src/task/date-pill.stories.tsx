import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DatePill } from './date-pill';

const meta = { component: DatePill } satisfies Meta<typeof DatePill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Start: Story = { args: { kind: 'Start', value: '2026-08-12', onChange: () => {} } };
export const DueNormal: Story = {
  args: { kind: 'Due', value: '2026-08-18', onChange: () => {} },
};
export const DueOverdue: Story = {
  args: {
    kind: 'Due',
    value: '2024-01-01',
    onChange: () => {},
    overdue: true,
    suffix: '· 2d late',
  },
};

function EmptyClearable() {
  const [v, setV] = useState<string | null>('2026-08-30');
  return <DatePill kind="Due" value={v} onChange={setV} clearable />;
}
export const EmptyClearableStory: Story = {
  args: { kind: 'Due', value: null, onChange: () => undefined },
  render: () => <EmptyClearable />,
};
