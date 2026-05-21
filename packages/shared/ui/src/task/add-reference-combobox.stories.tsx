import type { Meta, StoryObj } from '@storybook/react-vite';
import { AddReferenceCombobox } from './add-reference-combobox';

const meta = { component: AddReferenceCombobox } satisfies Meta<typeof AddReferenceCombobox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { onAdd: () => {} } };
export const WithRecentSuggestions: Story = {
  args: {
    onAdd: () => {},
    suggestions: [
      {
        id: 's1',
        label: 'Architecture review.docx',
        url: 'https://acme.sharepoint.com/Architecture-review.docx',
      },
      { id: 's2', label: 'Q3 forecast.xlsx', url: 'https://acme.sharepoint.com/Q3-forecast.xlsx' },
    ],
  },
};
