import type { Meta, StoryObj } from '@storybook/react-vite';
import { KanbanBoard } from './kanban-board';

const meta = { component: KanbanBoard } satisfies Meta<typeof KanbanBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

// Stand-ins for real KanbanColumns — only the board's own row layout is under test here.
const placeholderColumn = { flex: '0 0 280px' } as const;

const placeholderColumns = (
  <>
    <div style={placeholderColumn}>Todo</div>
    <div style={placeholderColumn}>In Progress</div>
    <div style={placeholderColumn}>Done</div>
  </>
);

export const Default: Story = {
  args: {
    children: placeholderColumns,
    onAddBucket: () => console.log('add bucket'),
  },
};

export const ReadOnly: Story = {
  args: {
    children: placeholderColumns,
  },
};

export const WithRootDroppable: Story = {
  args: {
    children: placeholderColumns,
    onAddBucket: () => console.log('add bucket'),
    rootDroppable: {
      placeholder: <div style={{ width: 280 }} aria-hidden="true" />,
    },
  },
};
