import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../primitives/button';
import type { PlanConflictDecision, PlanConflictsPayload } from './resolve-plan-conflicts-dialog';
import { ResolvePlanConflictsDialog } from './resolve-plan-conflicts-dialog';

const meta: Meta<typeof ResolvePlanConflictsDialog> = {
  title: 'composites/ResolvePlanConflictsDialog',
  component: ResolvePlanConflictsDialog,
};
export default meta;
type Story = StoryObj<typeof ResolvePlanConflictsDialog>;

function Controlled({ data }: { data: PlanConflictsPayload }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <ResolvePlanConflictsDialog
        open={open}
        onOpenChange={setOpen}
        data={data}
        onApply={async (decisions: PlanConflictDecision[]) => {
          await new Promise((r) => setTimeout(r, 800));
          console.log('decisions', decisions);
        }}
      />
    </>
  );
}

const defaultData: PlanConflictsPayload = {
  planId: 'plan-1',
  planLevelConflicts: [{ field: 'name', local: 'Seta Plan Name', remote: 'M365 Plan Name' }],
  taskConflicts: [
    {
      taskId: 'task-1',
      taskTitle: 'Implement login flow',
      taskUrl: 'https://tasks.office.com/task-1',
      fields: [
        { field: 'title', local: 'Implement login flow', remote: 'Login flow implementation' },
        { field: 'due_at', local: '2024-03-15', remote: '2024-03-20' },
      ],
    },
    {
      taskId: 'task-2',
      taskTitle: 'Write unit tests',
      taskUrl: 'https://tasks.office.com/task-2',
      fields: [
        { field: 'priority', local: 'high', remote: 'medium' },
        { field: 'status', local: 'in_progress', remote: 'completed' },
      ],
    },
  ],
};

export const Default: Story = {
  render: () => <Controlled data={defaultData} />,
};

export const NoConflicts: Story = {
  render: () => (
    <Controlled
      data={{
        planId: 'plan-empty',
        planLevelConflicts: [],
        taskConflicts: [],
      }}
    />
  ),
};

export const PlanOnly: Story = {
  render: () => (
    <Controlled
      data={{
        planId: 'plan-2',
        planLevelConflicts: [
          { field: 'name', local: 'Seta Plan', remote: 'M365 Plan' },
          { field: 'description', local: 'Seta description', remote: 'M365 description' },
        ],
        taskConflicts: [],
      }}
    />
  ),
};

export const TasksOnly: Story = {
  render: () => (
    <Controlled
      data={{
        planId: 'plan-3',
        planLevelConflicts: [],
        taskConflicts: [
          {
            taskId: 'task-a',
            taskTitle: 'Design system audit',
            taskUrl: 'https://tasks.office.com/task-a',
            fields: [
              { field: 'title', local: 'Design system audit', remote: 'Audit design system' },
              {
                field: 'due_at',
                local: '2024-04-01',
                remote: '2024-04-05',
                snapshot: '2024-03-28',
              },
            ],
          },
          {
            taskId: 'task-b',
            taskTitle: 'Performance benchmarks',
            taskUrl: 'https://tasks.office.com/task-b',
            fields: [
              { field: 'priority', local: 'urgent', remote: 'high' },
              { field: 'assignee', local: 'alice@seta.com', remote: 'bob@seta.com' },
            ],
          },
        ],
      }}
    />
  ),
};
