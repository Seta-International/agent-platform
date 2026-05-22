import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskGrid } from './task-grid';

const meta = { component: TaskGrid } satisfies Meta<typeof TaskGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

const rows = [
  {
    id: 't1',
    title: 'Design auth flow',
    status: 'in_progress' as const,
    bucket: 'Sprint 1',
    bucket_id: 'b1',
    priority: 'urgent' as const,
    assignees: [{ id: 'u1', name: 'Alice' }],
    due: '2026-06-01',
    labels: [{ id: 'l1', name: 'design' }],
  },
  {
    id: 't2',
    title: 'Write migration scripts',
    status: 'not_started' as const,
    bucket: 'Sprint 1',
    bucket_id: 'b1',
    priority: 'important' as const,
    assignees: [],
    due: null,
    labels: [],
  },
  {
    id: 't3',
    title: 'Add unit tests',
    status: 'not_started' as const,
    bucket: 'Sprint 2',
    bucket_id: 'b2',
    priority: 'medium' as const,
    assignees: [{ id: 'u2', name: 'Bob' }],
    due: '2026-06-15',
    labels: [],
  },
];

export const Default: Story = {
  args: {
    rows,
    groupBy: 'bucket',
    selection: new Set(),
    onSelectionChange: () => {},
  },
};
