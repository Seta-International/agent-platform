import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ProgressSlider } from './progress-slider';

const meta = { component: ProgressSlider } satisfies Meta<typeof ProgressSlider>;
export default meta;
type Story = StoryObj<typeof meta>;

function Live({ initial }: { initial: number }) {
  const [v, setV] = useState(initial);
  return <ProgressSlider value={v} onChange={setV} />;
}

export const NotStarted: Story = {
  args: { value: 0, onChange: () => undefined },
  render: () => <Live initial={0} />,
};
export const InProgress: Story = {
  args: { value: 60, onChange: () => undefined },
  render: () => <Live initial={60} />,
};
export const Done: Story = {
  args: { value: 100, onChange: () => undefined },
  render: () => <Live initial={100} />,
};
export const Disabled: Story = {
  args: { value: 45, onChange: () => undefined, disabled: true },
};
