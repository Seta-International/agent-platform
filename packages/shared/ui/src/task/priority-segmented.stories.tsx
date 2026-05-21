import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PrioritySegmented } from './priority-segmented';

const meta = { component: PrioritySegmented } satisfies Meta<typeof PrioritySegmented>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Urgent: Story = { args: { value: 1, onChange: () => {} } };
export const Important: Story = { args: { value: 3, onChange: () => {} } };
export const Medium: Story = { args: { value: 5, onChange: () => {} } };
export const Low: Story = { args: { value: 9, onChange: () => {} } };

function LiveImpl() {
  const [v, setV] = useState<1 | 3 | 5 | 9>(5);
  return <PrioritySegmented value={v} onChange={setV} />;
}
export const Live: Story = {
  args: { value: 5, onChange: () => undefined },
  render: () => <LiveImpl />,
};
