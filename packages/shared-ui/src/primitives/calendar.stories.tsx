import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import { Calendar } from './calendar';

const meta: Meta = { title: 'primitives/Calendar' };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [value, setValue] = React.useState<string | undefined>('2026-07-16');
    return <Calendar mode="single" value={value} onChange={(v) => setValue(v)} />;
  },
};

export const RangeSelection: Story = {
  render: () => {
    const [range, setRange] = React.useState<{ start: string; end: string } | undefined>(undefined);
    return <Calendar mode="range" value={range} onChange={(v) => setRange(v)} />;
  },
};
