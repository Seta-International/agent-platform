import type { Meta, StoryObj } from '@storybook/react-vite';
import { KanbanColumn } from './kanban-column';

const meta = { component: KanbanColumn } satisfies Meta<typeof KanbanColumn>;
export default meta;
type Story = StoryObj<typeof meta>;

const mockCards = (
  <>
    <div className="kanban-card">Implement auth flow</div>
    <div className="kanban-card">Fix pagination bug</div>
    <div className="kanban-card">Add unit tests for billing module</div>
  </>
);

export const Default: Story = {
  args: {
    name: 'In Progress',
    count: 3,
    status: 'primary',
    children: mockCards,
    droppable: {},
    draggableHandle: {},
  },
};

export const Dragging: Story = {
  args: {
    name: 'In Progress',
    count: 3,
    status: 'primary',
    children: mockCards,
    droppable: {},
    draggableHandle: { isDragging: true },
  },
};

export const DraggingOver: Story = {
  args: {
    name: 'Done',
    count: 5,
    status: 'success',
    children: mockCards,
    droppable: { isDraggingOver: true },
    draggableHandle: {},
  },
};

export const WithQuickCreate: Story = {
  args: {
    name: 'Todo',
    count: 2,
    status: 'muted',
    children: (
      <>
        <div className="kanban-card">Draft onboarding guide</div>
        <div className="kanban-card">Review design tokens</div>
      </>
    ),
    onCreateTask: (input) => console.log('create task:', input),
    droppable: {},
    draggableHandle: {},
  },
};

export const WithColorDot: Story = {
  args: {
    name: 'Design',
    count: 2,
    color: '#6366f1',
    children: mockCards,
    droppable: {},
    draggableHandle: {},
    onSetColor: () => console.log('set color'),
    onSetWipLimit: () => console.log('set wip limit'),
    onArchive: () => console.log('archive'),
  },
};

export const OverWipLimit: Story = {
  args: {
    name: 'In Progress',
    count: 5,
    wipLimit: 3,
    status: 'warning',
    children: mockCards,
    droppable: {},
    draggableHandle: {},
    onRename: (name) => console.log('rename', name),
    onSetColor: () => console.log('set color'),
    onSetWipLimit: () => console.log('set wip limit'),
  },
};

export const LinkedBucket: Story = {
  args: {
    name: 'M365 Bucket',
    count: 4,
    isLinked: true,
    children: mockCards,
    droppable: {},
    draggableHandle: {},
    onRename: (name) => console.log('rename', name),
    onSetColor: () => console.log('set color'),
    onArchive: () => console.log('archive'),
  },
};
