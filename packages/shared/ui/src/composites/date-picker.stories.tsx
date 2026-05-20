import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DatePicker } from './date-picker';

const meta: Meta<typeof DatePicker> = {
  title: 'Composites/DatePicker',
  component: DatePicker,
};
export default meta;

type Story = StoryObj<typeof DatePicker>;

function Wrapper(props: Omit<React.ComponentProps<typeof DatePicker>, 'value' | 'onChange'>) {
  const [value, setValue] = useState<Date | null>(null);
  return (
    <div className="p-6 w-[28rem]">
      <DatePicker {...props} value={value} onChange={setValue} />
    </div>
  );
}

export const Default: Story = {
  render: () => <Wrapper placeholder="Pick a date" />,
};

export const WithMinToday: Story = {
  render: () => <Wrapper placeholder="Pick a future date" minDate={new Date()} />,
};

export const Clearable: Story = {
  render: () => <Wrapper placeholder="Pick a date" clearable />,
};

export const NoQuickPicks: Story = {
  render: () => <Wrapper placeholder="No quick picks" quickPicks={[]} />,
};

export const Preset: Story = {
  render: () => {
    const next = new Date();
    next.setDate(next.getDate() + 7);
    return (
      <div className="p-6 w-[28rem]">
        <DatePicker value={next} onChange={() => {}} clearable />
      </div>
    );
  },
};
