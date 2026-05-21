import type { Meta, StoryObj } from '@storybook/react-vite';
import { CategoryDescriptionEditor, type CategoryLabel } from './category-description-editor';

const meta = { component: CategoryDescriptionEditor } satisfies Meta<
  typeof CategoryDescriptionEditor
>;
export default meta;
type Story = StoryObj<typeof meta>;

const labels: CategoryLabel[] = [
  { id: 'l1', name: 'bug', color: 'var(--color-danger)', category_slot: 1 },
  { id: 'l2', name: 'customer', color: 'var(--color-info)', category_slot: 2 },
  { id: 'l3', name: 'cx-impact', color: 'var(--color-warning)', category_slot: 3 },
  { id: 'l4', name: 'infra', color: 'var(--color-info)', category_slot: 4 },
  { id: 'l5', name: 'perf', color: 'var(--color-warning)', category_slot: 5 },
  { id: 'l6', name: 'security', color: 'var(--color-danger)', category_slot: 6 },
  { id: 'l7', name: 'api', color: 'var(--color-primary)', category_slot: 7 },
  { id: 'l8', name: 'design', color: 'var(--color-primary)', category_slot: null },
];

const partialDescriptions: Record<string, string> = {
  category1: 'Bug',
  category2: 'Customer-reported',
  category3: 'Customer-impacting',
  category4: 'Infrastructure',
  category5: 'Performance',
  category6: 'Security',
  category7: 'API',
  category8: 'Design',
};

const fullDescriptions: Record<string, string> = Array.from({ length: 25 }, (_, i) => i + 1).reduce<
  Record<string, string>
>((acc, n) => {
  acc[`category${n}`] = `Category ${n}`;
  return acc;
}, {});

const taskCounts: Record<string, number> = { 1: 6, 2: 3, 3: 4, 4: 5, 5: 2, 6: 1, 7: 7 };

export const Empty: Story = {
  args: {
    descriptions: {},
    labels: [],
    taskCounts: {},
    onSave: () => {},
  },
};

export const PartiallyFilled: Story = {
  args: {
    descriptions: partialDescriptions,
    labels,
    taskCounts,
    onSave: () => {},
  },
};

export const Full: Story = {
  args: {
    descriptions: fullDescriptions,
    labels,
    taskCounts,
    onSave: () => {},
  },
};

export const ReadOnly: Story = {
  args: {
    descriptions: partialDescriptions,
    labels,
    taskCounts,
    onSave: () => {},
    disabled: true,
  },
};
