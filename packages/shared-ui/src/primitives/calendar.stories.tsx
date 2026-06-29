import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from './calendar';

const meta: Meta = { title: 'primitives/Calendar' };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [selected, setSelected] = React.useState<Date | undefined>(new Date());
    return <Calendar mode="single" selected={selected} onSelect={setSelected} />;
  },
};

export const RangeSelection: Story = {
  render: () => {
    const [range, setRange] = React.useState<DateRange | undefined>(undefined);
    return <Calendar mode="range" selected={range} onSelect={setRange} />;
  },
};
