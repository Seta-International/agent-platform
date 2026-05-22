import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ChatComposer } from './chat-composer';

const meta = { component: ChatComposer } satisfies Meta<typeof ChatComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

function IdleWrapper() {
  const [v, setV] = useState('');
  return <ChatComposer value={v} onChange={setV} onSubmit={() => undefined} />;
}

export const Idle: Story = {
  args: { value: '', onChange: () => undefined, onSubmit: () => undefined },
  render: () => <IdleWrapper />,
};
export const Pending: Story = {
  args: { value: 'hi', onChange: () => undefined, onSubmit: () => undefined, pending: true },
  render: () => (
    <ChatComposer value="hi" onChange={() => undefined} onSubmit={() => undefined} pending />
  ),
};
