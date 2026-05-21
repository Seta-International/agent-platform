import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreviewBody, type PreviewBodyTask } from './preview-card';

const meta = { component: PreviewBody } satisfies Meta<typeof PreviewBody>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseTask: PreviewBodyTask = {
  description:
    'Add a write-through cache in front of planner.tasks.list to reduce p95 from ~480ms…',
  checklist: [
    { id: 'c1', text: 'Draft cache key schema', done: true },
    { id: 'c2', text: 'Architecture review', done: true },
    { id: 'c3', text: 'SSE invalidation test', done: false },
    { id: 'c4', text: 'PR opened', done: false },
    { id: 'c5', text: 'Deploy', done: false },
  ],
  references: [
    { id: 'r1', type: 'word', alias: 'Architecture review notes', host: 'docs.acme.com' },
  ],
};

export const Automatic: Story = { args: { task: baseTask, variant: 'automatic' } };
export const NoPreview: Story = { args: { task: baseTask, variant: 'noPreview' } };
export const Checklist: Story = { args: { task: baseTask, variant: 'checklist' } };
export const Description: Story = { args: { task: baseTask, variant: 'description' } };
export const Reference: Story = { args: { task: baseTask, variant: 'reference' } };

export const AutomaticEmpty: Story = {
  args: {
    task: { references: [], description: '', checklist: [] },
    variant: 'automatic',
  },
};
