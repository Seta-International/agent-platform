import type { Meta, StoryObj } from '@storybook/react-vite';
import { KanbanCard } from './kanban-card';

const meta = { component: KanbanCard } satisfies Meta<typeof KanbanCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseTask = {
  id: 't1',
  title: 'Ship M3 spec',
  priority: 'urgent' as const,
  due_label: '2d',
  label: { name: 'api', color: undefined },
  assignees: [
    { user_id: 'u1', display_name: 'Jane Doe' },
    { user_id: 'u2', display_name: 'Mark Lee' },
  ],
  recentlyMoved: false,
  saving: false,
};

export const Default: Story = {
  args: {
    task: baseTask,
    draggable: {},
  },
};

export const Saving: Story = {
  args: {
    task: { ...baseTask, saving: true },
    draggable: {},
  },
};

export const RecentlyMoved: Story = {
  args: {
    task: { ...baseTask, recentlyMoved: true },
    draggable: {},
  },
};

export const Selected: Story = {
  args: {
    task: baseTask,
    selected: true,
    draggable: {},
  },
};
