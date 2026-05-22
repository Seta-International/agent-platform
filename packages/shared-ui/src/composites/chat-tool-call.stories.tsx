import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChatToolCall } from './chat-tool-call';

const meta = { component: ChatToolCall } satisfies Meta<typeof ChatToolCall>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = { args: { name: 'identity.whoAmI', status: 'running' } };
export const Ok: Story = {
  args: { name: 'identity.whoAmI', status: 'ok', summary: 'profile loaded', duration: '8ms' },
};
export const Errored: Story = {
  args: { name: 'planner.findTasks', status: 'error', summary: 'permission denied' },
};
export const WithPayload: Story = {
  args: {
    name: 'identity.whoAmI',
    status: 'ok',
    summary: 'profile loaded',
    duration: '8ms',
    payload: { email: 'jane@acme.com' },
  },
};
