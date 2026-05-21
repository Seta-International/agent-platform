import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreviewCard, type PreviewCardTask } from './preview-card';

const meta = { component: PreviewCard } satisfies Meta<typeof PreviewCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseTask: PreviewCardTask = {
  id: 't1',
  title: 'Cache layer for /tasks API',
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
  priority: 'urgent',
  labels: [{ name: 'api', color: 'var(--color-primary)' }],
  assignees: [
    { user_id: 'u1', display_name: 'Jane Doe' },
    { user_id: 'u2', display_name: 'Mark Lee' },
  ],
  due_at: '2026-08-18',
};

export const Automatic: Story = { args: { task: baseTask, variant: 'automatic' } };
export const NoPreview: Story = { args: { task: baseTask, variant: 'noPreview' } };
export const Checklist: Story = { args: { task: baseTask, variant: 'checklist' } };
export const Description: Story = { args: { task: baseTask, variant: 'description' } };
export const Reference: Story = { args: { task: baseTask, variant: 'reference' } };

export const AutomaticEmpty: Story = {
  args: {
    task: { ...baseTask, references: [], description: '', checklist: [] },
    variant: 'automatic',
  },
};
