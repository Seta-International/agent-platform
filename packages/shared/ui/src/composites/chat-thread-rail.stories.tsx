import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ChatThreadRail } from './chat-thread-rail';

const meta = { component: ChatThreadRail } satisfies Meta<typeof ChatThreadRail>;
export default meta;
type Story = StoryObj<typeof meta>;

const groups = [
  {
    label: 'Today',
    items: [
      {
        id: 't1',
        title: 'Move Review tasks to Done',
        updatedAtLabel: '2m',
        active: true,
        hint: 'HITL',
      },
      { id: 't2', title: 'Plan next sprint for Q3 Launch', updatedAtLabel: '1h' },
    ],
  },
  {
    label: 'Earlier this week',
    items: [{ id: 't3', title: 'Reviewer assignments — Cache layer PR', updatedAtLabel: '2d' }],
  },
];

function DefaultWrapper() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState('t1');
  return (
    <ChatThreadRail
      groups={groups}
      activeId={active}
      onSelect={setActive}
      onNewThread={() => undefined}
      searchValue={q}
      onSearchChange={setQ}
    />
  );
}

export const Default: Story = {
  args: {} as never,
  render: () => <DefaultWrapper />,
};
