import type { Meta, StoryObj } from '@storybook/react-vite';
import { KanbanBoard } from './kanban-board';

const meta = { component: KanbanBoard } satisfies Meta<typeof KanbanBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

const placeholderColumns = (
  <>
    <div className="kanban-column">Todo</div>
    <div className="kanban-column">In Progress</div>
    <div className="kanban-column">Done</div>
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
