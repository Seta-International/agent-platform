import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChatMessage } from './chat-message';

const meta = { component: ChatMessage } satisfies Meta<typeof ChatMessage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const User: Story = { args: { variant: 'user', children: 'hi there' } };
export const Agent: Story = {
  args: {
    variant: 'agent',
    author: 'Supervisor',
    timestamp: new Date(),
    children: 'How can I help?',
  },
};
export const AgentDim: Story = {
  args: {
    variant: 'agent',
    author: 'Supervisor',
    timestamp: new Date(),
    dim: true,
    children: 'awaiting approval…',
  },
};
