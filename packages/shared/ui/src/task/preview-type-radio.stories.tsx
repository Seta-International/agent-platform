import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { type PreviewType, PreviewTypeRadio } from './preview-type-radio';

const meta = { component: PreviewTypeRadio } satisfies Meta<typeof PreviewTypeRadio>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Automatic: Story = { args: { value: 'automatic', onChange: () => {} } };
export const NoPreview: Story = { args: { value: 'noPreview', onChange: () => {} } };
export const Checklist: Story = { args: { value: 'checklist', onChange: () => {} } };
export const Description: Story = { args: { value: 'description', onChange: () => {} } };
export const Reference: Story = { args: { value: 'reference', onChange: () => {} } };

function LiveImpl() {
  const [v, setV] = useState<PreviewType>('automatic');
  return <PreviewTypeRadio value={v} onChange={setV} />;
}
export const Live: Story = {
  args: { value: 'automatic', onChange: () => undefined },
  render: () => <LiveImpl />,
};
