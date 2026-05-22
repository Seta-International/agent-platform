import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChatMessage } from './chat-message';
import { ChatTranscript } from './chat-transcript';

const meta = { component: ChatTranscript } satisfies Meta<typeof ChatTranscript>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {} as never,
  render: () => (
    <ChatTranscript dateDividers={[{ label: 'Yesterday at 16:12' }]}>
      <ChatMessage variant="user">Move all my Review tasks to Done.</ChatMessage>
      <ChatMessage variant="agent" author="Supervisor" timestamp={new Date()}>
        Sure — I found 4 tasks. Confirm below.
      </ChatMessage>
    </ChatTranscript>
  ),
};
