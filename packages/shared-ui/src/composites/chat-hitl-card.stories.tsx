import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChatHitlCard } from './chat-hitl-card';

const meta = { component: ChatHitlCard } satisfies Meta<typeof ChatHitlCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Change display name',
    toolName: 'identity.updateMyDisplayName',
    expiresAt: new Date(Date.now() + 4 * 60_000 + 38_000),
    permissionHint: 'Requires identity.user.write.self',
    onApprove: () => undefined,
    onReject: () => undefined,
    children: <div className="text-body-sm">Jane Doe → Jane Q. Doe</div>,
  },
};

export const Expired: Story = {
  args: { ...(Default.args ?? {}), expiresAt: new Date(Date.now() - 1) },
};
