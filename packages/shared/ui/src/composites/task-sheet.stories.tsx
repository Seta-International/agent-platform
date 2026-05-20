import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskSheet } from './task-sheet';

const meta = { component: TaskSheet } satisfies Meta<typeof TaskSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  title: 'Fix login bug',
  subtitle: 'PROJ-42',
  description: <p>Users on Safari 17 cannot log in — the auth cookie is dropped on redirect.</p>,
  properties: (
    <dl>
      <dt>Status</dt>
      <dd>In Progress</dd>
      <dt>Assignee</dt>
      <dd>Jane Doe</dd>
    </dl>
  ),
  checklist: (
    <ul>
      <li>Reproduce on Safari 17</li>
      <li>Patch redirect handler</li>
    </ul>
  ),
  activity: <p>Jane commented: "Reproduced on my machine."</p>,
  onClose: () => {},
};

export const Default: Story = {
  args: baseArgs,
};

export const Saving: Story = {
  args: {
    ...baseArgs,
    saving: true,
  },
};

export const Deleted: Story = {
  args: {
    ...baseArgs,
    deletedBy: 'Mark Lee',
  },
};

export const WithFooter: Story = {
  args: {
    ...baseArgs,
    footer: <button type="button">Save changes</button>,
  },
};
